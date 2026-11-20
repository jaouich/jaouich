package app.rekordo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Typeface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Éditeur vidéo : couper, filtres, réglages, texte, vitesse, rotation, son, taille ; fusion de plusieurs vidéos. */
public class EditorActivity extends Activity {
    static final String EXTRA_URIS = "uris";

    private final List<Uri> uris = new ArrayList<>();
    private final List<Exporter.Info> infos = new ArrayList<>();
    private final Exporter.Spec spec = new Exporter.Spec();
    private long startUs, endUs, durUs, posUs;
    private boolean merge;

    private ImageView preview;
    private TextView overlay, title, estimate;
    private FrameLayout stage, panel;
    private SeekBar scrub;
    private TextView scrubTime;
    private LinearLayout tools;
    private int tool;
    private Bitmap frame;
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Handler h = new Handler(Looper.getMainLooper());
    private MediaMetadataRetriever mmr;
    private long frameReq;

    private static final int T_CUT = 0, T_FILTER = 1, T_ADJUST = 2, T_TEXT = 3, T_SPEED = 4, T_ROTATE = 5, T_SOUND = 6, T_SIZE = 7;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ArrayList<Uri> list = getIntent().getParcelableArrayListExtra(EXTRA_URIS, Uri.class);
        if (list != null) uris.addAll(list);
        else if (getIntent().getData() != null) uris.add(getIntent().getData());
        if (uris.isEmpty()) { finish(); return; }
        merge = uris.size() > 1;
        for (Uri u : uris) infos.add(Exporter.probe(this, u));
        for (Exporter.Info i : infos) durUs += i.durationUs;
        startUs = 0; endUs = infos.get(0).durationUs;
        tool = merge ? T_FILTER : T_CUT;
        build();
        bg.execute(() -> {
            try { mmr = new MediaMetadataRetriever(); mmr.setDataSource(this, uris.get(0)); } catch (Exception e) { mmr = null; }
            loadFrame(0);
        });
    }

    @Override protected void onDestroy() {
        bg.execute(() -> { try { if (mmr != null) mmr.release(); } catch (Exception ignored) {} });
        bg.shutdown();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- mise en page

    private void build() {
        LinearLayout root = Ui.col(this);
        root.setBackgroundColor(Ui.BG);

        LinearLayout top = Ui.row(this);
        top.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 12), Ui.dp(this, 4));
        ImageView back = new ImageView(this);
        back.setImageDrawable(new Icons(Icons.BACK, Color.WHITE));
        int p = Ui.dp(this, 12);
        back.setPadding(p, p, p, p);
        Ui.press(back, Ui.round(0, Ui.dp(this, 24)));
        back.setOnClickListener(v -> finish());
        top.addView(back, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
        title = Ui.text(this, merge ? getString(R.string.merge_n, uris.size()) : getString(R.string.edit), 18, Ui.TEXT, true);
        top.addView(title, Ui.weight());
        TextView export = Ui.button(this, getString(R.string.export), true);
        export.setOnClickListener(v -> exportNow());
        top.addView(export);
        root.addView(top);

        stage = new FrameLayout(this);
        stage.setBackgroundColor(Color.BLACK);
        preview = new ImageView(this);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        stage.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        overlay = Ui.text(this, "", 20, Color.WHITE, true);
        overlay.setGravity(Gravity.CENTER);
        overlay.setShadowLayer(6, 0, 0, Color.BLACK);
        overlay.setPadding(Ui.dp(this, 20), Ui.dp(this, 16), Ui.dp(this, 20), Ui.dp(this, 16));
        stage.addView(overlay, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout sc = Ui.row(this);
        sc.setPadding(Ui.dp(this, 12), Ui.dp(this, 4), Ui.dp(this, 16), Ui.dp(this, 4));
        scrub = new SeekBar(this);
        tint(scrub);
        scrub.setMax(1000);
        scrub.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int v, boolean user) { if (user) { posUs = infos.get(0).durationUs * v / 1000; requestFrame(); } }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        sc.addView(scrub, Ui.weight());
        scrubTime = Ui.text(this, "0:00", 12, Ui.MUTED, false);
        sc.addView(scrubTime);
        root.addView(sc);

        panel = new FrameLayout(this);
        panel.setPadding(Ui.dp(this, 16), Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8));
        panel.setMinimumHeight(Ui.dp(this, 150));
        root.addView(panel, new LinearLayout.LayoutParams(-1, -2));

        estimate = Ui.text(this, "", 12, Ui.MUTED, false);
        estimate.setGravity(Gravity.CENTER);
        root.addView(estimate);

        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        tools = Ui.row(this);
        tools.setPadding(Ui.dp(this, 8), Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 6));
        hs.addView(tools);
        hs.setBackgroundColor(Ui.CARD);
        root.addView(hs);
        int[][] all = {{T_CUT, Icons.CUT, R.string.trim}, {T_FILTER, Icons.FILTER, R.string.filters}, {T_ADJUST, Icons.ADJUST, R.string.adjust},
                {T_TEXT, Icons.TEXT, R.string.text}, {T_SPEED, Icons.SPEED, R.string.speed}, {T_ROTATE, Icons.ROTATE, R.string.rotate},
                {T_SOUND, Icons.SOUND, R.string.sound}, {T_SIZE, Icons.SIZE, R.string.size}};
        for (int[] t : all) {
            if (merge && t[0] == T_CUT) continue;
            LinearLayout c = Ui.col(this);
            c.setGravity(Gravity.CENTER);
            c.setTag(t[0]);
            ImageView i = new ImageView(this);
            i.setImageDrawable(new Icons(t[1], Ui.MUTED));
            i.setTag("i" + t[1]);
            c.addView(i, new LinearLayout.LayoutParams(Ui.dp(this, 24), Ui.dp(this, 24)));
            TextView l = Ui.text(this, getString(t[2]), 11, Ui.MUTED, true);
            l.setPadding(0, Ui.dp(this, 3), 0, 0);
            c.addView(l);
            c.setPadding(Ui.dp(this, 12), Ui.dp(this, 6), Ui.dp(this, 12), Ui.dp(this, 6));
            Ui.press(c, Ui.round(0, Ui.dp(this, 12)));
            final int id = t[0], icon = t[1];
            c.setOnClickListener(v -> showTool(id));
            c.setContentDescription(getString(t[2]));
            tools.addView(c, new LinearLayout.LayoutParams(Ui.dp(this, 76), -2));
            c.setTag(R.id.tag_icon, icon);
        }

        Ui.edgeToEdge(this, root);
        setContentView(root);
        showTool(tool);
        updatePreview();
    }

    private void tint(SeekBar s) {
        s.setProgressTintList(ColorStateList.valueOf(Ui.ACCENT));
        s.setThumbTintList(ColorStateList.valueOf(Ui.ACCENT));
    }

    private void showTool(int t) {
        tool = t;
        for (int i = 0; i < tools.getChildCount(); i++) {
            LinearLayout c = (LinearLayout) tools.getChildAt(i);
            boolean on = (int) c.getTag() == t;
            ((ImageView) c.getChildAt(0)).setImageDrawable(new Icons((int) c.getTag(R.id.tag_icon), on ? Ui.ACCENT : Ui.MUTED));
            ((TextView) c.getChildAt(1)).setTextColor(on ? Ui.ACCENT : Ui.MUTED);
        }
        panel.removeAllViews();
        View v;
        switch (t) {
            case T_CUT: v = cutPanel(); break;
            case T_FILTER: v = filterPanel(); break;
            case T_ADJUST: v = adjustPanel(); break;
            case T_TEXT: v = textPanel(); break;
            case T_SPEED: v = chips(new String[]{"0.5×", "1×", "1.5×", "2×"}, new float[]{0.5f, 1f, 1.5f, 2f}, spec.speed, f -> { spec.speed = f; updateEstimate(); }, getString(R.string.speed_note)); break;
            case T_ROTATE: v = rotatePanel(); break;
            case T_SOUND: v = soundPanel(); break;
            default: v = sizePanel(); break;
        }
        panel.addView(v, new FrameLayout.LayoutParams(-1, -2));
        updateEstimate();
    }

    // ---------------------------------------------------------------- outils

    private View cutPanel() {
        LinearLayout l = Ui.col(this);
        TextView label = Ui.text(this, "", 14, Ui.TEXT, true);
        l.addView(label);
        long d = infos.get(0).durationUs;
        SeekBar s = new SeekBar(this), e = new SeekBar(this);
        tint(s); tint(e);
        s.setMax(1000); e.setMax(1000);
        s.setProgress((int) (startUs * 1000 / Math.max(1, d)));
        e.setProgress((int) (endUs * 1000 / Math.max(1, d)));
        Runnable upd = () -> label.setText(getString(R.string.trim_title, Store.dur(startUs / 1000), Store.dur(endUs / 1000)));
        SeekBar.OnSeekBarChangeListener lis = new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int v, boolean user) {
                if (!user) return;
                long us = d * v / 1000;
                if (sb == s) { startUs = Math.min(us, endUs - 500_000); if (startUs < 0) startUs = 0; posUs = startUs; }
                else { endUs = Math.max(us, startUs + 500_000); if (endUs > d) endUs = d; posUs = endUs; }
                upd.run(); requestFrame(); updateEstimate();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) { s.setProgress((int) (startUs * 1000 / d)); e.setProgress((int) (endUs * 1000 / d)); }
        };
        s.setOnSeekBarChangeListener(lis); e.setOnSeekBarChangeListener(lis);
        l.addView(small(getString(R.string.start)));
        l.addView(s);
        l.addView(small(getString(R.string.end)));
        l.addView(e);
        upd.run();
        return l;
    }

    private View filterPanel() {
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout row = Ui.row(this);
        hs.addView(row);
        int[] names = {R.string.f_none, R.string.f_bw, R.string.f_sepia, R.string.f_vivid, R.string.f_warm, R.string.f_cool, R.string.f_fade, R.string.f_noir, R.string.f_vintage};
        for (int f = 0; f < Look.COUNT; f++) {
            final int ff = f;
            LinearLayout c = Ui.col(this);
            c.setGravity(Gravity.CENTER_HORIZONTAL);
            ImageView th = new ImageView(this);
            th.setScaleType(ImageView.ScaleType.CENTER_CROP);
            th.setBackground(Ui.round(Ui.CARD2, Ui.dp(this, 12)));
            th.setClipToOutline(true);
            if (frame != null) th.setImageBitmap(frame);
            Look lk = new Look(); lk.filter = f;
            th.setColorFilter(new ColorMatrixColorFilter(lk.matrix()));
            int sz = Ui.dp(this, 64);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(sz, sz);
            c.addView(th, lp);
            if (spec.look.filter == f) { th.setPadding(3, 3, 3, 3); th.setBackground(Ui.round(Ui.ACCENT, Ui.dp(this, 12))); }
            TextView t = Ui.text(this, getString(names[f]), 12, spec.look.filter == f ? Ui.ACCENT : Ui.MUTED, true);
            t.setPadding(0, Ui.dp(this, 4), 0, 0);
            c.addView(t);
            c.setPadding(Ui.dp(this, 5), 0, Ui.dp(this, 5), 0);
            c.setContentDescription(getString(names[f]));
            c.setOnClickListener(v -> { spec.look.filter = ff; updatePreview(); showTool(T_FILTER); });
            row.addView(c);
        }
        return hs;
    }

    private View adjustPanel() {
        LinearLayout l = Ui.col(this);
        slider(l, getString(R.string.brightness), spec.look.brightness, v -> spec.look.brightness = v);
        slider(l, getString(R.string.contrast), spec.look.contrast, v -> spec.look.contrast = v);
        slider(l, getString(R.string.saturation), spec.look.saturation, v -> spec.look.saturation = v);
        return l;
    }

    interface IntSet { void set(int v); }
    interface FloatSet { void set(float v); }

    private void slider(LinearLayout l, String name, int value, IntSet set) {
        LinearLayout r = Ui.row(this);
        TextView t = Ui.text(this, name, 13, Ui.TEXT, false);
        r.addView(t, new LinearLayout.LayoutParams(Ui.dp(this, 96), -2));
        SeekBar s = new SeekBar(this);
        tint(s);
        s.setMax(200);
        s.setProgress(value + 100);
        TextView val = Ui.text(this, String.valueOf(value), 12, Ui.MUTED, false);
        val.setGravity(Gravity.END);
        s.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int v, boolean user) { set.set(v - 100); val.setText(String.valueOf(v - 100)); updatePreview(); }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });
        r.addView(s, Ui.weight());
        r.addView(val, new LinearLayout.LayoutParams(Ui.dp(this, 36), -2));
        l.addView(r);
    }

    private View textPanel() {
        LinearLayout l = Ui.col(this);
        EditText e = new EditText(this);
        e.setHint(R.string.text_hint);
        e.setText(spec.text == null ? "" : spec.text);
        e.setTextColor(Ui.TEXT);
        e.setHintTextColor(Ui.MUTED);
        e.setBackgroundTintList(ColorStateList.valueOf(Ui.ACCENT));
        e.setSingleLine(false);
        e.setMaxLines(3);
        e.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { spec.text = s.toString(); updatePreview(); }
        });
        l.addView(e);
        l.addView(chips(new String[]{getString(R.string.pos_bottom), getString(R.string.pos_top), getString(R.string.pos_center)},
                new float[]{0, 1, 2}, spec.textPos, f -> { spec.textPos = (int) f; updatePreview(); }, null));
        return l;
    }

    private View rotatePanel() {
        LinearLayout l = Ui.col(this);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView b = Ui.button(this, getString(R.string.rotate) + "  ↻ 90°", false);
        TextView cur = Ui.text(this, spec.rotation + "°", 14, Ui.MUTED, false);
        cur.setPadding(0, Ui.dp(this, 10), 0, 0);
        b.setOnClickListener(v -> { spec.rotation = (spec.rotation + 90) % 360; cur.setText(spec.rotation + "°"); updatePreview(); });
        l.addView(b);
        l.addView(cur);
        return l;
    }

    private View soundPanel() {
        boolean any = false;
        for (Exporter.Info i : infos) any |= i.hasAudio;
        String note = !any ? getString(R.string.no_sound_in_video) : spec.speed != 1f ? getString(R.string.speed_note) : null;
        return chips(new String[]{getString(R.string.keep_sound), getString(R.string.mute)}, new float[]{0, 1}, spec.mute ? 1 : 0,
                f -> { spec.mute = f == 1; updateEstimate(); }, note);
    }

    private View sizePanel() {
        LinearLayout l = Ui.col(this);
        int sw = infos.get(0).w, shh = infos.get(0).h;
        l.addView(small(getString(R.string.resolution_now, sw + " × " + shh)));
        l.addView(chips(new String[]{getString(R.string.original), "720p", "480p", "360p"}, new float[]{0, 720, 480, 360}, spec.maxShort,
                f -> { spec.maxShort = (int) f; updateEstimate(); }, null));
        l.addView(small(getString(R.string.set_quality)));
        l.addView(chips(new String[]{getString(R.string.q_low), getString(R.string.q_standard), getString(R.string.q_high)}, new float[]{0, 1, 2}, spec.quality,
                f -> { spec.quality = (int) f; updateEstimate(); }, null));
        return l;
    }

    private TextView small(String s) {
        TextView t = Ui.text(this, s, 12, Ui.MUTED, false);
        t.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 4));
        return t;
    }

    private View chips(String[] labels, float[] values, float cur, FloatSet set, String note) {
        LinearLayout l = Ui.col(this);
        LinearLayout row = Ui.row(this);
        List<TextView> all = new ArrayList<>();
        for (int i = 0; i < labels.length; i++) {
            TextView c = Ui.text(this, labels[i], 14, Ui.TEXT, true);
            c.setGravity(Gravity.CENTER);
            c.setPadding(Ui.dp(this, 14), Ui.dp(this, 9), Ui.dp(this, 14), Ui.dp(this, 9));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(Ui.dp(this, 3), 0, Ui.dp(this, 3), 0);
            row.addView(c, lp);
            all.add(c);
            final float v = values[i];
            c.setTag(v);
            c.setOnClickListener(x -> { set.set(v); paintChips(all, v); });
        }
        paintChips(all, cur);
        l.addView(row);
        if (note != null) l.addView(small(note));
        return l;
    }

    private void paintChips(List<TextView> all, float v) {
        for (TextView c : all) {
            boolean on = (float) c.getTag() == v;
            c.setBackground(on ? Ui.grad(Ui.dp(this, 12)) : Ui.round(Ui.CARD2, Ui.dp(this, 12)));
            c.setTextColor(on ? Color.WHITE : Ui.TEXT);
        }
    }

    // ---------------------------------------------------------------- aperçu

    private void requestFrame() {
        scrubTime.setText(Store.dur(posUs / 1000));
        scrub.setProgress((int) (posUs * 1000 / Math.max(1, infos.get(0).durationUs)));
        final long req = ++frameReq;
        h.removeCallbacksAndMessages("frame");
        h.postAtTime(() -> bg.execute(() -> { if (req == frameReq) loadFrame(posUs); }), "frame", android.os.SystemClock.uptimeMillis() + 120);
    }

    private void loadFrame(long us) {
        if (mmr == null) return;
        Bitmap b = null;
        try { b = mmr.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 720, 720); } catch (Exception ignored) {}
        if (b == null) try { b = mmr.getFrameAtTime(us); } catch (Exception ignored) {}
        final Bitmap fb = b;
        runOnUiThread(() -> {
            if (fb == null) return;
            boolean first = frame == null;
            frame = fb;
            preview.setImageBitmap(fb);
            updatePreview();
            if (first && tool == T_FILTER) showTool(T_FILTER);
        });
    }

    private void updatePreview() {
        preview.setColorFilter(new ColorMatrixColorFilter(spec.look.matrix()));
        preview.setRotation(spec.rotation);
        boolean side = spec.rotation % 180 != 0;
        if (side && frame != null && stage.getWidth() > 0) {
            float k = Math.min(stage.getWidth() / (float) stage.getHeight(), stage.getHeight() / (float) stage.getWidth());
            preview.setScaleX(k); preview.setScaleY(k);
        } else { preview.setScaleX(1); preview.setScaleY(1); }
        overlay.setText(spec.text == null ? "" : spec.text);
        overlay.setTypeface(Typeface.DEFAULT_BOLD);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) overlay.getLayoutParams();
        lp.gravity = spec.textPos == 1 ? Gravity.TOP : spec.textPos == 2 ? Gravity.CENTER : Gravity.BOTTOM;
        overlay.setLayoutParams(lp);
    }

    private void updateEstimate() {
        long len = merge ? durUs : endUs - startUs;
        len = (long) (len / spec.speed);
        int w = infos.get(0).w, hh = infos.get(0).h;
        int sh = Math.min(w, hh);
        if (spec.maxShort > 0 && sh > spec.maxShort) { double k = spec.maxShort / (double) sh; w = (int) (w * k); hh = (int) (hh * k); }
        long bits = (long) Engine.bitrateFor(w, hh, 30, spec.quality) * len / 1_000_000;
        boolean audio = !spec.mute && spec.speed == 1f;
        if (audio) bits += 128_000L * len / 1_000_000;
        estimate.setText(getString(R.string.estimate, Store.dur(len / 1000), "≈ " + Store.size(bits / 8)));
    }

    // ---------------------------------------------------------------- export

    private void exportNow() {
        spec.clips.clear();
        if (merge) for (int i = 0; i < uris.size(); i++) spec.clips.add(new Exporter.Clip(uris.get(i), 0, infos.get(i).durationUs));
        else spec.clips.add(new Exporter.Clip(uris.get(0), startUs, endUs));
        spec.suffix = merge ? "merge" : "edit";
        AtomicBoolean cancel = new AtomicBoolean();
        LinearLayout box = Ui.col(this);
        int p = Ui.dp(this, 24);
        box.setPadding(p, p / 2, p, 0);
        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        bar.setProgressTintList(ColorStateList.valueOf(Ui.ACCENT));
        TextView pct = Ui.text(this, "0 %", 14, Ui.MUTED, false);
        box.addView(bar);
        box.addView(pct);
        AlertDialog d = new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.exporting).setView(box).setCancelable(false)
                .setNegativeButton(R.string.cancel, (x, w) -> cancel.set(true)).show();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        new Thread(() -> {
            Uri out = null;
            String err = null;
            try {
                out = new Exporter(this, spec, f -> runOnUiThread(() -> { bar.setProgress((int) (f * 1000)); pct.setText(Math.round(f * 100) + " %"); }), cancel).run();
            } catch (InterruptedException e) {
                err = null;
            } catch (Exception e) {
                err = String.valueOf(e.getMessage());
            }
            final Uri r = out; final String fe = err;
            runOnUiThread(() -> {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                try { d.dismiss(); } catch (Exception ignored) {}
                if (cancel.get()) return;
                if (r == null) { Toast.makeText(this, getString(R.string.export_failed, fe), Toast.LENGTH_LONG).show(); return; }
                Toast.makeText(this, R.string.trim_done, Toast.LENGTH_SHORT).show();
                startActivity(new Intent(this, PlayerActivity.class).setData(r).putExtra(PlayerActivity.EXTRA_VIDEO, true));
                finish();
            });
        }, "rekordo-export").start();
    }
}
