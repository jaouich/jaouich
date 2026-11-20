package app.rekordo;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.Outline;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.widget.FrameLayout;

import java.util.Collections;
import java.util.concurrent.Executor;

/** Bulle caméra ronde et déplaçable (caméra avant) : votre visage apparaît dans la vidéo. */
final class FaceCam {
    interface Listener { void failed(); }

    private final Context c;
    private final FrameLayout root;
    private final TextureView tv;
    private final WindowManager.LayoutParams lp;
    private CameraDevice cam;
    private CameraCaptureSession session;
    private HandlerThread thread;
    private Handler h;
    private Size preview = new Size(640, 480);
    private boolean shown;
    private final Listener listener;

    FaceCam(Context c, int sizeIndex, Listener l) {
        this.c = c; this.listener = l;
        int px = Ui.dp(c, sizeIndex == 0 ? 96 : sizeIndex == 2 ? 180 : 132);
        root = new FrameLayout(c);
        tv = new TextureView(c);
        root.addView(tv, new FrameLayout.LayoutParams(px, px));
        root.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View v, Outline o) { o.setOval(0, 0, v.getWidth(), v.getHeight()); }
        });
        root.setClipToOutline(true);
        root.setElevation(Ui.dp(c, 6));
        lp = Overlay.params(px, px, true, false);
        Rect scr = c.getSystemService(WindowManager.class).getCurrentWindowMetrics().getBounds();
        lp.x = Ui.dp(c, 16);
        lp.y = scr.height() - px - Ui.dp(c, 140);
        root.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy;
            @Override public boolean onTouch(View v, MotionEvent e) {
                if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { dx = lp.x - e.getRawX(); dy = lp.y - e.getRawY(); return true; }
                if (e.getActionMasked() == MotionEvent.ACTION_MOVE) {
                    lp.x = (int) (e.getRawX() + dx); lp.y = (int) (e.getRawY() + dy);
                    Overlay.update(c, root, lp); return true;
                }
                if (e.getActionMasked() == MotionEvent.ACTION_UP) v.performClick();
                return true;
            }
        });
        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int hh) { open(st, w, hh); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int hh) { crop(w, hh); }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture st) { close(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture st) {}
        });
    }

    boolean isShown() { return shown; }

    void show() {
        if (shown) return;
        shown = Overlay.add(c, root, lp);
        if (!shown) listener.failed();
    }

    void hide() {
        if (!shown) return;
        close();
        Overlay.remove(c, root);
        shown = false;
    }

    void setVisible(boolean v) { root.setVisibility(v ? View.VISIBLE : View.INVISIBLE); }

    private void open(SurfaceTexture st, int w, int hh) {
        try {
            CameraManager cm = c.getSystemService(CameraManager.class);
            String id = null;
            for (String cid : cm.getCameraIdList()) {
                Integer f = cm.getCameraCharacteristics(cid).get(CameraCharacteristics.LENS_FACING);
                if (f != null && f == CameraCharacteristics.LENS_FACING_FRONT) { id = cid; break; }
            }
            if (id == null && cm.getCameraIdList().length > 0) id = cm.getCameraIdList()[0];
            if (id == null) { listener.failed(); return; }
            StreamConfigurationMap map = cm.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map != null) {
                Size best = null;
                for (Size s : map.getOutputSizes(SurfaceTexture.class)) {
                    if (s.getWidth() > 1280 || s.getHeight() > 960) continue;
                    if (best == null || s.getWidth() * s.getHeight() > best.getWidth() * best.getHeight()) best = s;
                }
                if (best != null) preview = best;
            }
            st.setDefaultBufferSize(preview.getWidth(), preview.getHeight());
            crop(w, hh);
            thread = new HandlerThread("rekordo-cam"); thread.start(); h = new Handler(thread.getLooper());
            Surface surface = new Surface(st);
            cm.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice d) {
                    cam = d;
                    try {
                        CaptureRequest.Builder rb = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        rb.addTarget(surface);
                        Executor ex = h::post;
                        d.createCaptureSession(new SessionConfiguration(SessionConfiguration.SESSION_REGULAR,
                                Collections.singletonList(new OutputConfiguration(surface)), ex,
                                new CameraCaptureSession.StateCallback() {
                                    @Override public void onConfigured(CameraCaptureSession s) {
                                        session = s;
                                        try { s.setRepeatingRequest(rb.build(), null, h); } catch (Exception e) { fail(); }
                                    }
                                    @Override public void onConfigureFailed(CameraCaptureSession s) { fail(); }
                                }));
                    } catch (Exception e) { fail(); }
                }
                @Override public void onDisconnected(CameraDevice d) { d.close(); cam = null; }
                @Override public void onError(CameraDevice d, int e) { d.close(); cam = null; fail(); }
            }, h);
        } catch (SecurityException e) {
            fail();
        } catch (Exception e) {
            fail();
        }
    }

    private void fail() { root.post(() -> { hide(); listener.failed(); }); }

    /** Remplit le rond sans déformer l'image (recadrage au centre). */
    private void crop(int w, int hh) {
        if (w == 0 || hh == 0) return;
        float ratio = (float) preview.getWidth() / preview.getHeight();   // image debout : hauteur = largeur * ratio
        Matrix m = new Matrix();
        m.setScale(1f, ratio, w / 2f, hh / 2f);
        tv.setTransform(m);
    }

    private void close() {
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        try { if (cam != null) cam.close(); } catch (Exception ignored) {}
        session = null; cam = null;
        if (thread != null) { thread.quitSafely(); thread = null; }
    }
}
