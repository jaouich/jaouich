package app.rekordo;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;

import java.util.ArrayList;
import java.util.List;

/** Dessin à main levée sur tout l'écran pendant l'enregistrement (visible dans la vidéo). */
final class BrushOverlay {
    private static final int[] COLORS = {0xFFFF3D5A, 0xFFFFD60A, 0xFF34C759, 0xFF0A84FF, 0xFFFFFFFF};

    private final Context c;
    private final FrameLayout root;
    private final Board board;
    private boolean shown;
    private int color = COLORS[0];
    private float width;
    private final List<View> swatches = new ArrayList<>();
    private final Runnable onClose;

    BrushOverlay(Context c, Runnable onClose) {
        this.c = c; this.onClose = onClose;
        width = Ui.dp(c, 5);
        root = new FrameLayout(c);
        board = new Board(c);
        root.addView(board, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout bar = Ui.row(c);
        bar.setBackground(Ui.round(0xF01A1C24, Ui.dp(c, 26)));
        bar.setPadding(Ui.dp(c, 8), Ui.dp(c, 6), Ui.dp(c, 8), Ui.dp(c, 6));
        bar.setElevation(Ui.dp(c, 8));
        for (int col : COLORS) {
            View s = new View(c);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(col);
            s.setBackground(g);
            s.setOnClickListener(v -> { color = col; mark(); });
            LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(Ui.dp(c, 26), Ui.dp(c, 26));
            l.setMargins(Ui.dp(c, 5), 0, Ui.dp(c, 5), 0);
            bar.addView(s, l);
            swatches.add(s);
        }
        View thick = new View(c) {
            @Override protected void onDraw(Canvas cv) {
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setColor(Color.WHITE);
                cv.drawCircle(getWidth() / 2f, getHeight() / 2f, Math.min(width, Ui.dp(c, 12)) / 1.4f + 2, p);
            }
        };
        thick.setOnClickListener(v -> {
            float a = Ui.dp(c, 3), b = Ui.dp(c, 5), d = Ui.dp(c, 10);
            width = width == a ? b : width == b ? d : a;
            v.invalidate();
        });
        bar.addView(thick, new LinearLayout.LayoutParams(Ui.dp(c, 40), Ui.dp(c, 40)));
        tool(bar, Icons.UNDO, v -> board.undo());
        tool(bar, Icons.TRASH, v -> board.clear());
        tool(bar, Icons.CLOSE, v -> onClose.run());
        FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        bl.topMargin = Ui.dp(c, 48);
        root.addView(bar, bl);
        mark();
    }

    private void tool(LinearLayout bar, int icon, View.OnClickListener l) {
        ImageView v = new ImageView(c);
        v.setImageDrawable(new Icons(icon, Color.WHITE));
        int p = Ui.dp(c, 9);
        v.setPadding(p, p, p, p);
        Ui.press(v, Ui.round(0, Ui.dp(c, 20)));
        v.setOnClickListener(l);
        bar.addView(v, new LinearLayout.LayoutParams(Ui.dp(c, 40), Ui.dp(c, 40)));
    }

    private void mark() {
        for (int i = 0; i < swatches.size(); i++) {
            View s = swatches.get(i);
            float k = COLORS[i] == color ? 1.25f : 1f;
            s.setScaleX(k); s.setScaleY(k);
        }
    }

    void show() { if (!shown) shown = Overlay.add(c, root, Overlay.params(-1, -1, true, false)); }
    void hide() { if (shown) { Overlay.remove(c, root); shown = false; board.clear(); } }
    boolean isShown() { return shown; }

    private final class Board extends View {
        final List<Path> paths = new ArrayList<>();
        final List<Paint> paints = new ArrayList<>();
        Path cur;

        Board(Context c) { super(c); }

        @Override protected void onDraw(Canvas cv) {
            for (int i = 0; i < paths.size(); i++) cv.drawPath(paths.get(i), paints.get(i));
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            float x = e.getX(), y = e.getY();
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    cur = new Path(); cur.moveTo(x, y);
                    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                    p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND);
                    p.setStrokeWidth(width); p.setColor(color);
                    paths.add(cur); paints.add(p); invalidate(); return true;
                case MotionEvent.ACTION_MOVE:
                    if (cur == null) return true;
                    for (int h = 0; h < e.getHistorySize(); h++) cur.lineTo(e.getHistoricalX(h), e.getHistoricalY(h));
                    cur.lineTo(x, y); invalidate(); return true;
                case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
                    if (cur != null) cur.lineTo(x + 0.1f, y + 0.1f);
                    cur = null; invalidate(); performClick(); return true;
            }
            return false;
        }

        @Override public boolean performClick() { return super.performClick(); }

        void undo() { if (!paths.isEmpty()) { paths.remove(paths.size() - 1); paints.remove(paints.size() - 1); invalidate(); } }
        void clear() { paths.clear(); paints.clear(); invalidate(); }
    }
}
