package ma.magiscom.desk;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Icon;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Enregistre l'écran du téléphone et la voix (comme AZ Screen Recorder).
 * Une bulle flottante (minuteur, pause, arrêt) reste au-dessus de toutes les applications,
 * et la notification permet aussi de mettre en pause ou d'arrêter.
 * La vidéo MP4 est enregistrée directement dans la galerie : Films / Magiscom Desk.
 */
public class RecorderService extends Service {
    public static final String START = "ma.magiscom.desk.START";
    public static final String STOP = "ma.magiscom.desk.STOP";
    public static final String PAUSE = "ma.magiscom.desk.PAUSE";
    public static volatile boolean running = false;

    private static final String CH = "rec";
    private static final int NID = 1;

    private final Handler h = new Handler(Looper.getMainLooper());
    private MediaProjection projection;
    private VirtualDisplay display;
    private MediaRecorder recorder;
    private ParcelFileDescriptor pfd;
    private Uri uri;
    private WindowManager wm;
    private View bubble, countView;
    private TextView bubbleTime;
    private LinearLayout panel;
    private Button pauseBtn;
    private WindowManager.LayoutParams bubbleLp;
    private boolean mic, hd, recording, paused, stopping;
    private long t0, pausedTotal, pausedAt;
    private int width, height, dpi;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        if (START.equals(a)) start(intent);
        else if (STOP.equals(a)) stopRec();
        else if (PAUSE.equals(a)) togglePause();
        return START_NOT_STICKY;
    }

    private void start(Intent in) {
        if (running) return;
        running = true;
        mic = in.getBooleanExtra("mic", true) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        hd = in.getBooleanExtra("hd", false);
        boolean showBubble = in.getBooleanExtra("bubble", true) && Settings.canDrawOverlays(this);
        boolean countdown = in.getBooleanExtra("countdown", true);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        channel();
        // Android 14 : le service doit être au premier plan AVANT d'ouvrir la capture d'écran
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION | (mic ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0);
        try { startForeground(NID, notif("Préparation…"), type); }
        catch (Exception e) { fail("Démarrage impossible : " + e.getMessage()); return; }
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            Intent data = Build.VERSION.SDK_INT >= 33 ? in.getParcelableExtra("data", Intent.class) : in.getParcelableExtra("data");
            projection = mpm.getMediaProjection(in.getIntExtra("code", 0), data);
            if (projection == null) { fail("Autorisation de capture refusée"); return; }
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { h.post(RecorderService.this::stopRec); }
            }, h);
        } catch (Exception e) { fail("Capture d'écran impossible : " + e.getMessage()); return; }
        computeSize();
        if (countdown) countdown(3, showBubble);
        else begin(showBubble);
    }

    /** Taille de la vidéo : le côté court à 720 (ou 1080 en HD), le côté long au plus 1920, multiples de 16. */
    private void computeSize() {
        int w, hh;
        if (Build.VERSION.SDK_INT >= 30) {
            Rect b = wm.getMaximumWindowMetrics().getBounds();
            w = b.width(); hh = b.height();
        } else {
            android.util.DisplayMetrics m = new android.util.DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(m);
            w = m.widthPixels; hh = m.heightPixels;
        }
        dpi = getResources().getDisplayMetrics().densityDpi;
        int shortSide = Math.min(w, hh), longSide = Math.max(w, hh);
        double s = Math.min(1.0, Math.min((hd ? 1080.0 : 720.0) / shortSide, 1920.0 / longSide));
        width = Math.max(16, (int) Math.round(w * s / 16.0) * 16);
        height = Math.max(16, (int) Math.round(hh * s / 16.0) * 16);
    }

    private void countdown(final int n, final boolean showBubble) {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "L'enregistrement commence dans 3 secondes…", Toast.LENGTH_SHORT).show();
            h.postDelayed(() -> begin(showBubble), 3000);
            return;
        }
        TextView t = new TextView(this);
        t.setTextColor(Color.WHITE);
        t.setTextSize(64);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        t.setBackground(Ui.round(Color.parseColor("#E60A1F4D"), Ui.dp(this, 90)));
        int size = Ui.dp(this, 160);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;
        lp.alpha = 0.78f;   // en dessous de 0.8 : ne bloque pas les touchers (Android 12+)
        countView = t;
        try { wm.addView(t, lp); } catch (Exception e) { countView = null; }
        final int[] left = {n};
        Runnable step = new Runnable() {
            @Override public void run() {
                if (stopping) return;
                if (left[0] <= 0) {
                    removeView(countView); countView = null;
                    // petit délai : le compte à rebours ne doit pas apparaître dans la vidéo
                    h.postDelayed(() -> begin(showBubble), 150);
                    return;
                }
                t.setText(String.valueOf(left[0]));
                left[0]--;
                h.postDelayed(this, 1000);
            }
        };
        step.run();
    }

    private void begin(boolean showBubble) {
        if (stopping || projection == null) return;
        try {
            String name = "Magiscom-" + new SimpleDateFormat("yyyy-MM-dd-HH'h'mm-ss", Locale.ROOT).format(new Date()) + ".mp4";
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            cv.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            cv.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Magiscom Desk");
            cv.put(MediaStore.Video.Media.IS_PENDING, 1);
            uri = getContentResolver().insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), cv);
            if (uri == null) throw new IllegalStateException("galerie indisponible");
            pfd = getContentResolver().openFileDescriptor(uri, "rw");

            // Certains téléphones refusent une taille : on réessaie plus petit
            Exception last = null;
            double[] scales = {1.0, 0.75, 0.5};
            for (double sc : scales) {
                int vw = Math.max(16, (int) Math.round(width * sc / 16.0) * 16), vh = Math.max(16, (int) Math.round(height * sc / 16.0) * 16);
                try { prepareRecorder(vw, vh); recorder.start(); last = null; break; }
                catch (Exception e) {
                    last = e;
                    // Android 14 : une seule surface virtuelle par autorisation, on la garde et on change sa taille
                    try { if (display != null) display.setSurface(null); } catch (Exception ignored) {}
                    try { if (recorder != null) recorder.release(); } catch (Exception ignored) {}
                    recorder = null;
                }
            }
            if (last != null) throw last;
        } catch (Exception e) {
            fail("L'enregistrement n'a pas pu démarrer : " + e.getMessage());
            return;
        }
        recording = true;
        t0 = SystemClock.elapsedRealtime();
        if (showBubble) showBubble();
        tick();
    }

    private void prepareRecorder(int vw, int vh) throws Exception {
        recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        if (mic) recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setOutputFile(pfd.getFileDescriptor());
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        if (mic) {
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(128000);
            recorder.setAudioSamplingRate(44100);
            recorder.setAudioChannels(1);
        }
        recorder.setVideoSize(vw, vh);
        recorder.setVideoFrameRate(30);
        recorder.setVideoEncodingBitRate(hd ? 6_000_000 : 3_000_000);
        recorder.prepare();
        if (display == null) display = projection.createVirtualDisplay("MagiscomDesk", vw, vh, dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, recorder.getSurface(), null, null);
        else { display.resize(vw, vh, dpi); display.setSurface(recorder.getSurface()); }
    }

    private long elapsedSecs() {
        long now = paused ? pausedAt : SystemClock.elapsedRealtime();
        return Math.max(0, (now - t0 - pausedTotal) / 1000);
    }

    private void tick() {
        if (!recording || stopping) return;
        String t = Ui.clock(elapsedSecs());
        if (bubbleTime != null) bubbleTime.setText(paused ? "⏸ " + t : t);
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.notify(NID, notif((paused ? "En pause · " : "Enregistrement · ") + t));
        h.postDelayed(this::tick, 1000);
    }

    private void togglePause() {
        if (!recording || stopping) return;
        try {
            if (paused) { recorder.resume(); pausedTotal += SystemClock.elapsedRealtime() - pausedAt; paused = false; }
            else { recorder.pause(); pausedAt = SystemClock.elapsedRealtime(); paused = true; }
        } catch (Exception ignored) {}
        if (pauseBtn != null) pauseBtn.setText(paused ? "▶ Reprendre" : "⏸ Pause");
        h.removeCallbacksAndMessages(null);
        tick();
    }

    /** Bulle flottante : un toucher ouvre Pause / Arrêter, on peut la déplacer. */
    private void showBubble() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        LinearLayout pill = new LinearLayout(this);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setBackground(Ui.round(Color.parseColor("#EE0A1F4D"), Ui.dp(this, 26)));
        pill.setPadding(Ui.dp(this, 14), Ui.dp(this, 10), Ui.dp(this, 16), Ui.dp(this, 10));
        View dot = new View(this);
        dot.setBackground(Ui.round(Color.parseColor("#EF4444"), Ui.dp(this, 6)));
        pill.addView(dot, new LinearLayout.LayoutParams(Ui.dp(this, 12), Ui.dp(this, 12)));
        bubbleTime = Ui.text(this, "0:00", 16, Color.WHITE, true);
        bubbleTime.setPadding(Ui.dp(this, 8), 0, 0, 0);
        pill.addView(bubbleTime);
        root.addView(pill);

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setVisibility(View.GONE);
        panel.setPadding(0, Ui.dp(this, 6), 0, 0);
        pauseBtn = Ui.button(this, "⏸ Pause", Color.parseColor("#EE1D3A7A"), Color.WHITE);
        pauseBtn.setOnClickListener(v -> togglePause());
        Button stop = Ui.button(this, "■ Arrêter", Ui.RED, Color.WHITE);
        stop.setOnClickListener(v -> stopRec());
        panel.addView(pauseBtn, Ui.lp(this, 0));
        panel.addView(stop, Ui.lp(this, 6));
        root.addView(panel);

        bubbleLp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        bubbleLp.gravity = Gravity.TOP | Gravity.START;
        bubbleLp.x = Ui.dp(this, 12);
        bubbleLp.y = Ui.dp(this, 160);

        pill.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int ox, oy; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        sx = e.getRawX(); sy = e.getRawY(); ox = bubbleLp.x; oy = bubbleLp.y; moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
                        if (Math.abs(dx) + Math.abs(dy) > Ui.dp(RecorderService.this, 8)) moved = true;
                        bubbleLp.x = ox + (int) dx; bubbleLp.y = oy + (int) dy;
                        try { wm.updateViewLayout(bubble, bubbleLp); } catch (Exception ignored) {}
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) panel.setVisibility(panel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
                        return true;
                }
                return false;
            }
        });
        bubble = root;
        try { wm.addView(bubble, bubbleLp); } catch (Exception e) { bubble = null; }
    }

    private void removeView(View v) {
        if (v == null) return;
        try { wm.removeView(v); } catch (Exception ignored) {}
    }

    private void stopRec() {
        if (stopping) return;
        stopping = true;
        h.removeCallbacksAndMessages(null);
        removeView(countView); countView = null;
        removeView(bubble); bubble = null;
        long secs = elapsedSecs();
        boolean ok = false;
        if (recording) {
            try { if (paused) recorder.resume(); recorder.stop(); ok = true; } catch (Exception ignored) { ok = false; }
        }
        recording = false;
        try { if (recorder != null) recorder.release(); } catch (Exception ignored) {}
        try { if (display != null) display.release(); } catch (Exception ignored) {}
        try { if (projection != null) projection.stop(); } catch (Exception ignored) {}
        try { if (pfd != null) pfd.close(); } catch (Exception ignored) {}
        if (uri != null) {
            try {
                if (ok) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Video.Media.IS_PENDING, 0);
                    getContentResolver().update(uri, cv, null, null);
                } else getContentResolver().delete(uri, null, null);
            } catch (Exception ignored) {}
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        running = false;
        if (ok && uri != null) done(uri, secs);
        else if (uri != null) Toast.makeText(this, "Enregistrement trop court", Toast.LENGTH_SHORT).show();
        stopSelf();
    }

    private void done(Uri u, long secs) {
        Intent open = new Intent(this, ResultActivity.class).setData(u).putExtra("secs", secs)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        PendingIntent pi = PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_rec)
                .setContentTitle("Enregistrement terminé · " + Ui.clock(secs))
                .setContentText("Touchez pour le revoir, le partager ou l'envoyer à Magiscom Tech")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        getSystemService(NotificationManager.class).notify(3, n);
        // Ouvre l'écran du résultat (autorisé quand la bulle flottante est permise)
        try { startActivity(open); } catch (Exception ignored) {}
    }

    private void fail(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        recording = false;
        stopRec();
    }

    private void channel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel c = new NotificationChannel(CH, "Enregistrement de l'écran", NotificationManager.IMPORTANCE_LOW);
        c.setShowBadge(false);
        nm.createNotificationChannel(c);
    }

    private Notification notif(String text) {
        PendingIntent stop = PendingIntent.getService(this, 10, new Intent(this, RecorderService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent pause = PendingIntent.getService(this, 11, new Intent(this, RecorderService.class).setAction(PAUSE), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent app = PendingIntent.getActivity(this, 12, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Icon ic = Icon.createWithResource(this, R.drawable.ic_stat_rec);
        Notification.Builder b = new Notification.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_rec)
                .setContentTitle("Magiscom Desk")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(app)
                .setColor(Ui.RED);
        if (recording) b.addAction(new Notification.Action.Builder(ic, paused ? "Reprendre" : "Pause", pause).build());
        b.addAction(new Notification.Action.Builder(ic, "Arrêter", stop).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    @Override public void onDestroy() {
        if (running && !stopping) stopRec();
        super.onDestroy();
    }
}
