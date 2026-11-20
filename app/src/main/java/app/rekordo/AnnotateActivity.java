package app.rekordo;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Dessiner sur une capture d'écran (flèches à main levée, surlignage) puis l'enregistrer en copie. */
public class AnnotateActivity extends Activity {
    private static final int[] COLORS = {0xFFFF3D5A, 0xFFFFD60A, 0xFF34C759, 0xFF0A84FF, 0xFFFFFFFF, 0xFF111111};
    private Bitmap src;
    private Board board;
    private int color = COLORS[0];
    private float widthK = 0.008f;
    private boolean marker;
    private int crop;   // 0 origine, 1 = 9:16, 2 = 1:1, 3 = 16:9, 4 = 4:5
    private final List<View> swatches = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri u = getIntent().getData();
        if (u == null) { finish(); return; }
        try {
            src = ImageDecoder.decodeBitmap(ImageDecoder.createSource(getContentResolver(), u),
                    (dec, info, s) -> { dec.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE); dec.setMutableRequired(false); });
        } catch (Exception e) { Toast.makeText(this, R.string.trim_failed, Toast.LENGTH_SHORT).show(); finish(); return; }

        LinearLayout root = Ui.col(this);
        root.setBackgroundColor(Color.BLACK);
        LinearLayout top = Ui.row(this);
        top.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 12), Ui.dp(this, 4));
        top.addView(icon(Icons.BACK, v -> finish()));
        top.addView(Ui.text(this, getString(R.string.draw_on_image), 17, Ui.TEXT, true), Ui.weight());
        top.addView(icon(Icons.UNDO, v -> board.undo()));
        TextView save = Ui.button(this, getString(R.string.save_copy_short), true);
        save.setOnClickListener(v -> save());
        top.addView(save);
        root.addView(top);

        board = new Board(this);
        root.addView(board, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout bar = Ui.row(this);
        bar.setGravity(Gravity.CENTER);
        bar.setBackgroundColor(Ui.CARD);
        bar.setPadding(Ui.dp(this, 8), Ui.dp(this, 10), Ui.dp(this, 8), Ui.dp(this, 10));
        for (int c : COLORS) {
            View s = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(c);
            g.setStroke(Ui.dp(this, 1), 0x55FFFFFF);
            s.setBackground(g);
            s.setOnClickListener(v -> { color = c; mark(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 28), Ui.dp(this, 28));
            lp.setMargins(Ui.dp(this, 6), 0, Ui.dp(this, 6), 0);
            bar.addView(s, lp);
            swatches.add(s);
        }
        TextView pen = Ui.text(this, "", 13, Ui.TEXT, true);
        pen.setPadding(Ui.dp(this, 12), Ui.dp(this, 6), Ui.dp(this, 12), Ui.dp(this, 6));
        Ui.press(pen, Ui.round(Ui.CARD2, Ui.dp(this, 12)));
        Runnable penLabel = () -> pen.setText(marker ? getString(R.string.highlighter) : widthK < 0.006f ? "S" : widthK < 0.01f ? "M" : "L");
        pen.setOnClickListener(v -> {
            if (marker) { marker = false; widthK = 0.004f; }
            else if (widthK < 0.006f) widthK = 0.008f;
            else if (widthK < 0.01f) widthK = 0.016f;
            else marker = true;
            penLabel.run();
        });
        penLabel.run();
        bar.addView(pen);
        TextView cropBtn = Ui.text(this, "", 13, Ui.TEXT, true);
        cropBtn.setPadding(Ui.dp(this, 12), Ui.dp(this, 6), Ui.dp(this, 12), Ui.dp(this, 6));
        Ui.press(cropBtn, Ui.round(Ui.CARD2, Ui.dp(this, 12)));
        String[] cn = {getString(R.string.crop), "9:16", "1:1", "16:9", "4:5"};
        cropBtn.setText(cn[0]);
        cropBtn.setOnClickListener(v -> { crop = (crop + 1) % 5; cropBtn.setText(cn[crop]); board.invalidate(); });
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-2, -2);
        cl.setMarginStart(Ui.dp(this, 8));
        bar.addView(cropBtn, cl);
        root.addView(bar);
        mark();
        Ui.edgeToEdge(this, root);
        setContentView(root);
    }

    private ImageView icon(int k, View.OnClickListener l) {
        ImageView v = new ImageView(this);
        v.setImageDrawable(new Icons(k, Color.WHITE));
        int p = Ui.dp(this, 12);
        v.setPadding(p, p, p, p);
        Ui.press(v, Ui.round(0, Ui.dp(this, 24)));
        v.setOnClickListener(l);
        v.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
        return v;
    }

    private void mark() {
        for (int i = 0; i < swatches.size(); i++) {
            float k = COLORS[i] == color ? 1.3f : 1f;
            swatches.get(i).setScaleX(k); swatches.get(i).setScaleY(k);
        }
    }

    private void save() {
        Bitmap out = src.copy(Bitmap.Config.ARGB_8888, true);
        board.paintOn(new Canvas(out));
        if (crop > 0) {
            android.graphics.RectF r = cropRect(out.getWidth(), out.getHeight());
            Bitmap c = Bitmap.createBitmap(out, Math.round(r.left), Math.round(r.top), Math.max(1, Math.round(r.width())), Math.max(1, Math.round(r.height())));
            out.recycle();
            final Bitmap fc = c;
            saveBitmap(fc);
            return;
        }
        saveBitmap(out);
    }

    private android.graphics.RectF cropRect(int w, int h) {
        float[] k = Exporter.cropKeep(w, h, crop);
        float cw = w * k[0], ch = h * k[1];
        return new android.graphics.RectF((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2);
    }

    private void saveBitmap(Bitmap out) {
        new Thread(() -> {
            Uri u = Store.saveImage(this, out);
            runOnUiThread(() -> {
                if (u == null) { Toast.makeText(this, R.string.trim_failed, Toast.LENGTH_SHORT).show(); return; }
                Toast.makeText(this, R.string.shot_saved, Toast.LENGTH_SHORT).show();
                startActivity(new Intent(this, PlayerActivity.class).setData(u).putExtra(PlayerActivity.EXTRA_VIDEO, false));
                finish();
            });
        }).start();
    }

    /** Traits enregistrés en coordonnées de l'image, pour être identiques à l'écran et dans le fichier. */
    private final class Board extends View {
        final List<Path> paths = new ArrayList<>();
        final List<Paint> paints = new ArrayList<>();
        final Matrix toView = new Matrix(), toImage = new Matrix();
        Path cur;

        Board(Context c) { super(c); }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            toView.setRectToRect(new RectF(0, 0, src.getWidth(), src.getHeight()), new RectF(0, 0, w, h), Matrix.ScaleToFit.CENTER);
            toView.invert(toImage);
        }

        @Override protected void onDraw(Canvas c) {
            c.save();
            c.concat(toView);
            c.drawBitmap(src, 0, 0, null);
            paintOn(c);
            if (crop > 0) {
                RectF r = cropRect(src.getWidth(), src.getHeight());
                Paint dim = new Paint(); dim.setColor(0xB0000000);
                c.drawRect(0, 0, src.getWidth(), r.top, dim);
                c.drawRect(0, r.bottom, src.getWidth(), src.getHeight(), dim);
                c.drawRect(0, r.top, r.left, r.bottom, dim);
                c.drawRect(r.right, r.top, src.getWidth(), r.bottom, dim);
            }
            c.restore();
        }

        void paintOn(Canvas c) { for (int i = 0; i < paths.size(); i++) c.drawPath(paths.get(i), paints.get(i)); }

        @Override public boolean onTouchEvent(MotionEvent e) {
            float[] pt = {e.getX(), e.getY()};
            toImage.mapPoints(pt);
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    cur = new Path(); cur.moveTo(pt[0], pt[1]);
                    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeJoin(Paint.Join.ROUND);
                    float base = Math.max(src.getWidth(), src.getHeight());
                    if (marker) { p.setStrokeCap(Paint.Cap.SQUARE); p.setStrokeWidth(base * 0.028f); p.setColor((color & 0x00FFFFFF) | 0x66000000); }
                    else { p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(base * widthK); p.setColor(color); }
                    paths.add(cur); paints.add(p); invalidate(); return true;
                case MotionEvent.ACTION_MOVE:
                    if (cur == null) return true;
                    for (int i = 0; i < e.getHistorySize(); i++) {
                        float[] q = {e.getHistoricalX(i), e.getHistoricalY(i)};
                        toImage.mapPoints(q);
                        cur.lineTo(q[0], q[1]);
                    }
                    cur.lineTo(pt[0], pt[1]); invalidate(); return true;
                case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
                    if (cur != null) cur.lineTo(pt[0] + 0.1f, pt[1] + 0.1f);
                    cur = null; invalidate(); performClick(); return true;
            }
            return false;
        }

        @Override public boolean performClick() { return super.performClick(); }

        void undo() { if (!paths.isEmpty()) { paths.remove(paths.size() - 1); paints.remove(paints.size() - 1); invalidate(); } }
    }
}
