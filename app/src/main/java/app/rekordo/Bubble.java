package app.rekordo;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Bulle flottante : un rond déplaçable qui affiche le chrono ; un appui ouvre le menu
 * (arrêter, pause, capture, dessin, caméra, ouvrir l'appli). Elle se colle au bord de l'écran.
 */
final class Bubble {
    interface Actions { void stop(); void pauseResume(); void shot(); void brush(); void face(); void openApp(); }

    private final Context c;
    private final Actions act;
    private final FrameLayout root;
    private final LinearLayout menu;
    private final TextView dot;
    private final WindowManager.LayoutParams lp;
    private ImageView pauseBtn;
    private boolean open, shown, menuLeft;
    private final int size;

    Bubble(Context c, Actions act) {
        this.c = c; this.act = act;
        size = Ui.dp(c, 52);
        root = new FrameLayout(c);
        LinearLayout wrap = Ui.row(c);
        dot = new TextView(c);
        dot.setGravity(Gravity.CENTER);
        dot.setTextColor(Color.WHITE);
        dot.setTextSize(11);
        dot.setBackground(Ui.grad(size / 2f));
        dot.setElevation(Ui.dp(c, 6));
        menu = Ui.row(c);
        menu.setBackground(Ui.round(0xF01A1C24, Ui.dp(c, 28)));
        menu.setPadding(Ui.dp(c, 6), Ui.dp(c, 4), Ui.dp(c, 6), Ui.dp(c, 4));
        menu.setElevation(Ui.dp(c, 6));
        menu.setVisibility(View.GONE);
        btn(Icons.STOP, Ui.ACCENT, v -> { collapse(); act.stop(); });
        pauseBtn = btn(Icons.PAUSE, Color.WHITE, v -> act.pauseResume());
        btn(Icons.CAMERA, Color.WHITE, v -> { collapse(); act.shot(); });
        btn(Icons.BRUSH, Color.WHITE, v -> { collapse(); act.brush(); });
        btn(Icons.FACE, Color.WHITE, v -> act.face());
        btn(Icons.HOME, Color.WHITE, v -> { collapse(); act.openApp(); });
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(size, size);
        wrap.addView(dot, dlp);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(-2, -2);
        mlp.setMarginStart(Ui.dp(c, 8));
        wrap.addView(menu, mlp);
        wrap.setPadding(Ui.dp(c, 6), Ui.dp(c, 6), Ui.dp(c, 6), Ui.dp(c, 6));
        root.addView(wrap);
        lp = Overlay.params(-2, -2, true, false);
        Point scr = screen();
        lp.x = scr.x - size - Ui.dp(c, 14);
        lp.y = scr.y / 3;
        dot.setOnTouchListener(new Drag());
        setTime(0, false);
    }

    private ImageView btn(int icon, int color, View.OnClickListener l) {
        ImageView v = new ImageView(c);
        v.setImageDrawable(new Icons(icon, color));
        int p = Ui.dp(c, 9);
        v.setPadding(p, p, p, p);
        Ui.press(v, Ui.round(0x00000000, Ui.dp(c, 22)));
        v.setOnClickListener(l);
        menu.addView(v, new LinearLayout.LayoutParams(Ui.dp(c, 44), Ui.dp(c, 44)));
        return v;
    }

    private Point screen() {
        Rect r = c.getSystemService(WindowManager.class).getCurrentWindowMetrics().getBounds();
        return new Point(r.width(), r.height());
    }

    void show() { if (!shown) shown = Overlay.add(c, root, lp); }
    void hide() { if (shown) { Overlay.remove(c, root); shown = false; } }
    boolean isShown() { return shown; }

    /** Masquée le temps d'une capture d'écran pour ne pas apparaître dessus. */
    void setVisible(boolean v) { root.setVisibility(v ? View.VISIBLE : View.INVISIBLE); }

    void setTime(long ms, boolean paused) {
        long s = ms / 1000;
        dot.setText(paused ? "❚❚" : (s >= 3600 ? String.format("%d:%02d", s / 3600, s / 60 % 60) : String.format("%d:%02d", s / 60, s % 60)));
        dot.setAlpha(paused && (SystemClock.uptimeMillis() / 600) % 2 == 0 ? 0.6f : 1f);
        pauseBtn.setImageDrawable(new Icons(paused ? Icons.PLAY : Icons.PAUSE, Color.WHITE));
    }

    private void toggle() { if (open) collapse(); else expand(); }

    private void expand() {
        open = true;
        Point scr = screen();
        // Menu du côté où il y a de la place
        menuLeft = lp.x > scr.x / 2;
        LinearLayout wrap = (LinearLayout) root.getChildAt(0);
        wrap.removeAllViews();
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(size, size);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(-2, -2);
        if (menuLeft) { mlp.setMarginEnd(Ui.dp(c, 8)); wrap.addView(menu, mlp); wrap.addView(dot, dlp); }
        else { mlp.setMarginStart(Ui.dp(c, 8)); wrap.addView(dot, dlp); wrap.addView(menu, mlp); }
        menu.setVisibility(View.VISIBLE);
        root.post(() -> {
            if (menuLeft) { lp.x = Math.max(0, lp.x - root.getWidth() + size + Ui.dp(c, 12)); Overlay.update(c, root, lp); }
        });
    }

    void collapse() {
        if (!open) return;
        open = false;
        int w = root.getWidth();
        menu.setVisibility(View.GONE);
        if (menuLeft) { lp.x = lp.x + w - size - Ui.dp(c, 12); }
        Overlay.update(c, root, lp);
    }

    private final class Drag implements View.OnTouchListener {
        float dx, dy, sx, sy; boolean moved;
        final int slop = ViewConfiguration.get(c).getScaledTouchSlop();

        @Override public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    sx = e.getRawX(); sy = e.getRawY(); dx = lp.x - sx; dy = lp.y - sy; moved = false; return true;
                case MotionEvent.ACTION_MOVE:
                    if (!moved && Math.hypot(e.getRawX() - sx, e.getRawY() - sy) < slop) return true;
                    if (!moved) { moved = true; collapse(); dx = lp.x - e.getRawX(); dy = lp.y - e.getRawY(); }
                    lp.x = (int) (e.getRawX() + dx); lp.y = (int) (e.getRawY() + dy);
                    Overlay.update(c, root, lp); return true;
                case MotionEvent.ACTION_UP:
                    if (!moved) { v.performClick(); toggle(); return true; }
                    snap(); return true;
            }
            return false;
        }

        private void snap() {
            Point scr = screen();
            int target = lp.x + size / 2 < scr.x / 2 ? Ui.dp(c, 2) : scr.x - size - Ui.dp(c, 14);
            lp.y = Math.max(Ui.dp(c, 24), Math.min(scr.y - size - Ui.dp(c, 60), lp.y));
            ValueAnimator a = ValueAnimator.ofInt(lp.x, target).setDuration(180);
            a.addUpdateListener(an -> { lp.x = (int) an.getAnimatedValue(); Overlay.update(c, root, lp); });
            a.start();
        }
    }
}
