package app.rekordo;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.service.quicksettings.TileService;
import android.content.ComponentName;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Service d'enregistrement au premier plan : notification avec boutons, bulle flottante,
 * compte à rebours, enregistrement (Engine), captures d'écran, dessin et caméra.
 */
public class RecorderService extends Service {
    static final String ACTION_START = "app.rekordo.START", ACTION_STOP = "app.rekordo.STOP",
            ACTION_PAUSE = "app.rekordo.PAUSE", ACTION_SHOT = "app.rekordo.SHOT",
            ACTION_BRUSH = "app.rekordo.BRUSH", ACTION_FACE = "app.rekordo.FACE";
    static final String EXTRA_CODE = "code", EXTRA_DATA = "data";
    private static final String CH_REC = "rec", CH_DONE = "done";
    private static final int NID = 7, NID_DONE = 8;

    /** État lisible par l'écran principal et la tuile. */
    static volatile boolean recording, paused, counting;
    static volatile long startedAt, pausedTotal, pauseAt;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private Prefs prefs;
    private MediaProjection projection;
    private Engine engine;
    private Uri out;
    private ParcelFileDescriptor pfd;
    private Bubble bubble;
    private BrushOverlay brush;
    private FaceCam face;
    private TextView countView;
    private boolean stopping, camType;
    private BroadcastReceiver screenOff;

    static void send(Context c, String action) {
        try { c.startService(new Intent(c, RecorderService.class).setAction(action)); } catch (Exception ignored) {}
    }

    static void toast(Context c, String s) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c.getApplicationContext(), s, Toast.LENGTH_LONG).show());
    }

    static long elapsed() {
        if (!recording) return 0;
        long now = paused ? pauseAt : SystemClock.elapsedRealtime();
        return Math.max(0, now - startedAt - pausedTotal);
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        prefs = new Prefs(this);
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel a = new NotificationChannel(CH_REC, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW);
        a.setShowBadge(false);
        nm.createNotificationChannel(a);
        nm.createNotificationChannel(new NotificationChannel(CH_DONE, getString(R.string.rec_saved), NotificationManager.IMPORTANCE_DEFAULT));
    }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        if (a == null) { if (!recording && projection == null) stopSelf(); return START_NOT_STICKY; }
        switch (a) {
            case ACTION_START: start(i); break;
            case ACTION_STOP: if (counting) cancelCountdown(); else stopRecording(); break;
            case ACTION_PAUSE: pauseResume(); break;
            case ACTION_SHOT: shotDuringRecording(); break;
            case ACTION_BRUSH: toggleBrush(); break;
            case ACTION_FACE: toggleFace(); break;
        }
        return START_NOT_STICKY;
    }

    // ---------------------------------------------------------------- démarrage

    private void start(Intent i) {
        if (recording || counting || projection != null) return;
        String mode = i.getStringExtra(CaptureActivity.EXTRA_MODE);
        boolean shot = CaptureActivity.MODE_SHOT.equals(mode);
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
        if (!shot && granted(Manifest.permission.RECORD_AUDIO) && prefs.wantMic())
            type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        if (!shot && granted(Manifest.permission.CAMERA)) { type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA; camType = true; }
        try {
            startForeground(NID, notif(getString(R.string.starting), false), type);
        } catch (Exception e) {
            // Sans micro/caméra si le système refuse ces types
            try { camType = false; startForeground(NID, notif(getString(R.string.starting), false), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION); }
            catch (Exception e2) { fail(e2); return; }
        }
        try {
            MediaProjectionManager m = getSystemService(MediaProjectionManager.class);
            projection = m.getMediaProjection(i.getIntExtra(EXTRA_CODE, 0), i.getParcelableExtra(EXTRA_DATA, Intent.class));
        } catch (Exception e) { fail(e); return; }
        if (projection == null) { fail(new IllegalStateException("no projection")); return; }
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { ui.post(() -> { if (recording || counting) stopRecording(); }); }
        }, ui);
        int cd = Prefs.COUNTDOWN[Math.min(prefs.countdown(), Prefs.COUNTDOWN.length - 1)];
        if (shot) cd = Math.max(cd, 3);   // le temps d'aller sur l'écran à capturer
        Runnable go = shot ? this::singleShot : this::beginRecording;
        if (cd > 0) countdown(cd, go); else go.run();
    }

    private boolean granted(String p) { return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    private Runnable afterCount;

    private void countdown(int sec, Runnable after) {
        afterCount = after;
        counting = true;
        updateTile();
        if (Overlay.allowed(this)) {
            countView = new TextView(this);
            countView.setTextColor(Color.WHITE);
            countView.setTextSize(64);
            countView.setGravity(Gravity.CENTER);
            countView.setBackground(Ui.grad(Ui.dp(this, 70)));
            WindowManager.LayoutParams lp = Overlay.params(Ui.dp(this, 140), Ui.dp(this, 140), false, false);
            lp.gravity = Gravity.CENTER;
            if (!Overlay.add(this, countView, lp)) countView = null;
        }
        tick(sec);
    }

    private void tick(int n) {
        if (!counting) return;
        if (n == 0) {
            Overlay.remove(this, countView);
            countView = null;
            counting = false;
            // Laisser l'écran se redessiner sans le compte à rebours
            ui.postDelayed(afterCount, 120);
            return;
        }
        if (countView != null) {
            countView.setText(String.valueOf(n));
            countView.setScaleX(1.3f); countView.setScaleY(1.3f);
            countView.animate().scaleX(1f).scaleY(1f).setDuration(300).start();
        }
        getSystemService(NotificationManager.class).notify(NID, notif(getString(R.string.starting) + " " + n, false));
        ui.postDelayed(() -> tick(n - 1), 1000);
    }

    private void cancelCountdown() {
        counting = false;
        Overlay.remove(this, countView);
        countView = null;
        cleanup();
    }

    private int[] size() {
        Rect r = getSystemService(WindowManager.class).getMaximumWindowMetrics().getBounds();
        int w = r.width(), h = r.height();
        int target = Prefs.RES[Math.min(prefs.res(), Prefs.RES.length - 1)];
        int shortSide = Math.min(w, h);
        if (target > 0 && shortSide > target) {
            double k = (double) target / shortSide;
            w = (int) Math.round(w * k); h = (int) Math.round(h * k);
        }
        return new int[]{w / 2 * 2, h / 2 * 2};
    }

    private void beginRecording() {
        if (projection == null) return;
        int[] sz = size();
        int fps = Prefs.FPS[Math.min(prefs.fps(), Prefs.FPS.length - 1)];
        int dpi = getResources().getDisplayMetrics().densityDpi;
        boolean mic = prefs.wantMic() && granted(Manifest.permission.RECORD_AUDIO);
        boolean internal = prefs.wantInternal() && granted(Manifest.permission.RECORD_AUDIO);
        try {
            out = Store.newVideo(this, "Rekordo_" + Store.stamp() + ".mp4");
            if (out == null) throw new IllegalStateException("storage");
            pfd = getContentResolver().openFileDescriptor(out, "rw");
            engine = new Engine(projection, sz[0], sz[1], dpi, fps, Engine.bitrateFor(sz[0], sz[1], fps, prefs.quality()), mic, internal);
            engine.start(pfd.getFileDescriptor());
        } catch (Exception e) {
            if (engine != null) try { engine.stop(); } catch (Exception ignored) {}
            engine = null;
            if (out != null) Store.discard(this, out);
            out = null;
            fail(e);
            return;
        }
        if (internal && !engine.internalOk && prefs.wantInternal()) toast(this, getString(R.string.internal_unavailable));
        recording = true; paused = false; pausedTotal = 0; startedAt = SystemClock.elapsedRealtime();
        vibrate();
        if (prefs.bubble() && Overlay.allowed(this)) {
            bubble = new Bubble(this, new Bubble.Actions() {
                @Override public void stop() { stopRecording(); }
                @Override public void pauseResume() { RecorderService.this.pauseResume(); }
                @Override public void shot() { shotDuringRecording(); }
                @Override public void brush() { toggleBrush(); }
                @Override public void face() { toggleFace(); }
                @Override public void openApp() {
                    startActivity(new Intent(RecorderService.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                }
            });
            bubble.show();
        }
        if (prefs.facecam()) toggleFace();
        if (prefs.screenOff()) {
            screenOff = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) { stopRecording(); }
            };
            registerReceiver(screenOff, new IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED);
        }
        refresh();
        updateTile();
        ui.post(clock);
    }

    private final Runnable clock = new Runnable() {
        @Override public void run() {
            if (!recording) return;
            if (bubble != null) bubble.setTime(elapsed(), paused);
            Exception f = engine == null ? null : engine.failure;
            if (f != null) { engine.failure = null; toast(RecorderService.this, getString(R.string.rec_failed, String.valueOf(f.getMessage()))); stopRecording(); return; }
            ui.postDelayed(this, 500);
        }
    };

    // ---------------------------------------------------------------- commandes

    private void pauseResume() {
        if (!recording || engine == null) return;
        if (paused) {
            engine.resume();
            pausedTotal += SystemClock.elapsedRealtime() - pauseAt;
            paused = false;
        } else {
            engine.pause();
            pauseAt = SystemClock.elapsedRealtime();
            paused = true;
        }
        if (bubble != null) bubble.setTime(elapsed(), paused);
        refresh();
    }

    private void shotDuringRecording() {
        if (!recording || engine == null) return;
        // Bulle et caméra masquées le temps de la capture
        if (bubble != null) bubble.setVisible(false);
        ui.postDelayed(() -> engine.screenshot(b -> ui.post(() -> {
            if (bubble != null) bubble.setVisible(true);
            saveShot(b);
        })), 180);
    }

    private void saveShot(Bitmap b) {
        if (b == null) { toast(this, getString(R.string.rec_failed, "screenshot")); return; }
        new Thread(() -> {
            Uri u = Store.saveImage(this, b);
            b.recycle();
            if (u != null) { toast(this, getString(R.string.shot_saved)); if (!recording) doneNotif(u, false); }
        }).start();
    }

    private void toggleBrush() {
        if (!recording || !Overlay.allowed(this)) return;
        if (brush == null) brush = new BrushOverlay(this, () -> brush.hide());
        if (brush.isShown()) brush.hide(); else brush.show();
    }

    private void toggleFace() {
        if (!recording || !Overlay.allowed(this)) return;
        if (!camType || !granted(Manifest.permission.CAMERA)) { toast(this, getString(R.string.cam_denied)); return; }
        if (face == null) face = new FaceCam(this, prefs.camSize(), () -> { toast(this, getString(R.string.cam_denied)); });
        if (face.isShown()) face.hide(); else face.show();
    }

    /** Capture d'écran seule (sans enregistrement) : une image puis on libère l'écran. */
    private void singleShot() {
        Rect r = getSystemService(WindowManager.class).getMaximumWindowMetrics().getBounds();
        final int w = r.width(), h = r.height();
        final HandlerThread t = new HandlerThread("rekordo-single");
        t.start();
        final Handler th = new Handler(t.getLooper());
        final ImageReader reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        final VirtualDisplay[] vd = new VirtualDisplay[1];
        final boolean[] done = {false};
        final Runnable finish = () -> {
            try { if (vd[0] != null) vd[0].release(); } catch (Exception ignored) {}
            try { reader.close(); } catch (Exception ignored) {}
            t.quitSafely();
        };
        reader.setOnImageAvailableListener(rr -> {
            Image img = rr.acquireLatestImage();
            if (img == null) return;
            if (done[0]) { img.close(); return; }
            done[0] = true;
            Bitmap b = Engine.toBitmap(img, w, h);
            img.close();
            ui.post(() -> { finish.run(); saveShot(b); cleanup(); });
        }, th);
        // Attendre que la fenêtre d'autorisation ait disparu : la première image d'un nouvel écran virtuel est la bonne
        ui.postDelayed(() -> {
            try {
                vd[0] = projection.createVirtualDisplay("Rekordo-shot", w, h, getResources().getDisplayMetrics().densityDpi,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, th);
            } catch (Exception e) { done[0] = true; finish.run(); fail(e); }
        }, 550);
        ui.postDelayed(() -> { if (!done[0]) { done[0] = true; finish.run(); fail(new IllegalStateException("no image")); } }, 4000);
    }

    // ---------------------------------------------------------------- arrêt

    private void stopRecording() {
        if (stopping) return;
        if (counting) { cancelCountdown(); return; }
        if (!recording) { cleanup(); return; }
        stopping = true;
        final long length = elapsed();
        recording = false; paused = false;
        ui.removeCallbacks(clock);
        hideOverlays();
        final Engine e = engine;
        final Uri u = out;
        engine = null; out = null;
        new Thread(() -> {
            boolean ok = false;
            try { ok = e != null && e.stop(); } catch (Exception ignored) {}
            try { if (pfd != null) pfd.close(); } catch (Exception ignored) {}
            pfd = null;
            if (u != null) {
                if (ok && length >= 1000) { Store.publish(this, u); doneNotif(u, true); }
                else { Store.discard(this, u); toast(this, getString(ok ? R.string.too_short : R.string.trim_failed)); }
            }
            ui.post(() -> { stopping = false; vibrate(); cleanup(); });
        }, "rekordo-stop").start();
    }

    private void hideOverlays() {
        if (bubble != null) { bubble.hide(); bubble = null; }
        if (brush != null) { brush.hide(); brush = null; }
        if (face != null) { face.hide(); face = null; }
        Overlay.remove(this, countView); countView = null;
        if (screenOff != null) { try { unregisterReceiver(screenOff); } catch (Exception ignored) {} screenOff = null; }
    }

    private void cleanup() {
        recording = false; paused = false; counting = false;
        hideOverlays();
        if (projection != null) { try { projection.stop(); } catch (Exception ignored) {} projection = null; }
        stopForeground(STOP_FOREGROUND_REMOVE);
        updateTile();
        stopSelf();
    }

    private void fail(Exception e) {
        toast(this, getString(R.string.rec_failed, String.valueOf(e.getMessage())));
        cleanup();
    }

    @Override public void onDestroy() {
        if (recording) stopRecording();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- notifications

    private PendingIntent action(String a, int req) {
        return PendingIntent.getService(this, req, new Intent(this, RecorderService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notif(String text, boolean withActions) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(this, CH_REC)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .setColor(Ui.ACCENT)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        if (withActions) {
            if (!paused) {
                b.setUsesChronometer(true).setShowWhen(true)
                        .setWhen(System.currentTimeMillis() - elapsed());
            }
            b.addAction(new Notification.Action.Builder(null, getString(R.string.stop), action(ACTION_STOP, 1)).build());
            b.addAction(new Notification.Action.Builder(null, getString(paused ? R.string.resume : R.string.pause), action(ACTION_PAUSE, 2)).build());
            b.addAction(new Notification.Action.Builder(null, getString(R.string.screenshot), action(ACTION_SHOT, 3)).build());
        } else {
            b.addAction(new Notification.Action.Builder(null, getString(R.string.cancel), action(ACTION_STOP, 1)).build());
        }
        return b.build();
    }

    private void refresh() {
        getSystemService(NotificationManager.class).notify(NID,
                notif(getString(paused ? R.string.paused : R.string.recording_now), true));
    }

    private void doneNotif(Uri u, boolean video) {
        Intent i = new Intent(this, PlayerActivity.class).setData(u).putExtra(PlayerActivity.EXTRA_VIDEO, video)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        PendingIntent pi = PendingIntent.getActivity(this, video ? 10 : 11, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CH_DONE)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(Ui.ACCENT)
                .setContentTitle(getString(video ? R.string.rec_saved : R.string.shot_saved))
                .setContentText(getString(R.string.rec_saved_sub))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try { getSystemService(NotificationManager.class).notify(video ? NID_DONE : NID_DONE + 1, n); } catch (Exception ignored) {}
    }

    private void vibrate() {
        try { getSystemService(Vibrator.class).vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)); } catch (Exception ignored) {}
    }

    private void updateTile() {
        try { TileService.requestListeningState(this, new ComponentName(this, RecTileService.class)); } catch (Exception ignored) {}
    }
}
