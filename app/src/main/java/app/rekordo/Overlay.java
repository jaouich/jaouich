package app.rekordo;

import android.content.Context;
import android.graphics.PixelFormat;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

/** Fenêtres au-dessus des autres applis (bulle, dessin, caméra, compte à rebours). */
final class Overlay {
    static boolean allowed(Context c) { return Settings.canDrawOverlays(c); }

    static WindowManager.LayoutParams params(int w, int h, boolean touchable, boolean focusable) {
        int flags = WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
        if (!focusable) flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        if (!touchable) flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(w, h,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        return lp;
    }

    static boolean add(Context c, View v, WindowManager.LayoutParams lp) {
        try { c.getSystemService(WindowManager.class).addView(v, lp); return true; }
        catch (Exception e) { return false; }
    }

    static void remove(Context c, View v) {
        if (v == null) return;
        try { c.getSystemService(WindowManager.class).removeViewImmediate(v); } catch (Exception ignored) {}
    }

    static void update(Context c, View v, WindowManager.LayoutParams lp) {
        try { c.getSystemService(WindowManager.class).updateViewLayout(v, lp); } catch (Exception ignored) {}
    }
}
