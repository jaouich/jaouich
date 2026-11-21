package app.rekordo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Écran principal : bouton d'enregistrement, galerie des vidéos et captures, réglages. */
public class MainActivity extends Activity {
    private final Handler h = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private final LruCache<String, Bitmap> thumbs = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };
    private Prefs prefs;
    private FrameLayout content;
    private final TextView[] tabs = new TextView[3];
    private int tab;
    private ImageView recIcon;
    private TextView recLabel, recSub;
    private View recBtn;
    private boolean wasRecording;
    private final java.util.LinkedHashSet<android.net.Uri> selected = new java.util.LinkedHashSet<>();
    private LinearLayout selBar;
    private TextView selCount;
    private Adapter adapter;
    private List<Store.Item> shown = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        getWindow().getDecorView().setBackgroundColor(Ui.BG);

        LinearLayout root = Ui.col(this);
        root.setBackgroundColor(Ui.BG);

        // En-tête
        LinearLayout head = Ui.row(this);
        head.setPadding(Ui.dp(this, 20), Ui.dp(this, 14), Ui.dp(this, 20), Ui.dp(this, 6));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        head.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 34), Ui.dp(this, 34)));
        TextView name = Ui.text(this, getString(R.string.app_name), 24, Ui.TEXT, true);
        name.setPadding(Ui.dp(this, 12), 0, 0, 0);
        LinearLayout nameBox = Ui.col(this);
        nameBox.setPadding(Ui.dp(this, 12), 0, 0, 0);
        name.setPadding(0, 0, 0, 0);
        nameBox.addView(name);
        nameBox.addView(Ui.text(this, getString(R.string.created_by), 11, Ui.MUTED, false));
        head.addView(nameBox, Ui.weight());
        root.addView(head);

        // Grand bouton d'enregistrement
        LinearLayout card = Ui.row(this);
        card.setPadding(Ui.dp(this, 16), Ui.dp(this, 16), Ui.dp(this, 16), Ui.dp(this, 16));
        card.setBackground(Ui.round(Ui.CARD, Ui.dp(this, 24)));
        recBtn = new FrameLayout(this);
        recBtn.setBackground(Ui.grad(Ui.dp(this, 36)));
        recBtn.setElevation(Ui.dp(this, 4));
        recIcon = new ImageView(this);
        recIcon.setImageDrawable(new Icons(Icons.REC, Color.WHITE));
        int ip = Ui.dp(this, 20);
        recIcon.setPadding(ip, ip, ip, ip);
        ((FrameLayout) recBtn).addView(recIcon, new FrameLayout.LayoutParams(-1, -1));
        recBtn.setOnClickListener(v -> onRecord());
        card.addView(recBtn, new LinearLayout.LayoutParams(Ui.dp(this, 72), Ui.dp(this, 72)));
        LinearLayout txt = Ui.col(this);
        txt.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 8), 0);
        recLabel = Ui.text(this, getString(R.string.record), 20, Ui.TEXT, true);
        recSub = Ui.text(this, getString(R.string.home_hint), 13, Ui.MUTED, false);
        txt.addView(recLabel);
        txt.addView(recSub);
        txt.setOnClickListener(v -> onRecord());
        card.addView(txt, Ui.weight());
        ImageView shot = new ImageView(this);
        shot.setImageDrawable(new Icons(Icons.CAMERA, Ui.TEXT));
        int sp = Ui.dp(this, 12);
        shot.setPadding(sp, sp, sp, sp);
        Ui.press(shot, Ui.round(Ui.CARD2, Ui.dp(this, 24)));
        shot.setContentDescription(getString(R.string.take_shot));
        shot.setOnClickListener(v -> onShot());
        LinearLayout side = Ui.col(this);
        side.addView(shot, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
        card.addView(side);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, -2);
        clp.setMargins(Ui.dp(this, 16), Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8));
        root.addView(card, clp);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));

        // Onglets
        LinearLayout nav = Ui.row(this);
        nav.setBackgroundColor(Ui.CARD);
        nav.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
        int[] icons = {Icons.VIDEO, Icons.IMAGE, Icons.GEAR};
        int[] labels = {R.string.tab_videos, R.string.tab_shots, R.string.tab_settings};
        for (int i = 0; i < 3; i++) {
            final int k = i;
            TextView t = Ui.text(this, getString(labels[i]), 12, Ui.MUTED, true);
            t.setGravity(Gravity.CENTER);
            t.setTag(icons[i]);
            t.setPadding(0, Ui.dp(this, 4), 0, Ui.dp(this, 4));
            t.setCompoundDrawablePadding(Ui.dp(this, 2));
            Ui.press(t, Ui.round(0, Ui.dp(this, 14)));
            t.setOnClickListener(v -> show(k));
            nav.addView(t, Ui.weight());
            tabs[i] = t;
        }
        root.addView(nav);

        Ui.edgeToEdge(this, root);
        root.setOnApplyWindowInsetsListener((v, in) -> {
            android.graphics.Insets s = in.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            v.setPadding(s.left, s.top, s.right, 0);
            nav.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6) + s.bottom);
            return android.view.WindowInsets.CONSUMED;
        });
        setContentView(root);
        if (b != null) tab = b.getInt("tab", 0);
        show(tab);
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); o.putInt("tab", tab); }

    @Override protected void onResume() {
        super.onResume();
        h.post(state);
        if (tab != 2) show(tab);
    }

    @Override protected void onPause() { super.onPause(); h.removeCallbacks(state); }
    @Override protected void onDestroy() { pool.shutdownNow(); super.onDestroy(); }

    private final Runnable state = new Runnable() {
        @Override public void run() {
            boolean rec = RecorderService.recording || RecorderService.counting;
            recIcon.setImageDrawable(new Icons(rec ? Icons.STOP : Icons.REC, Color.WHITE));
            if (RecorderService.recording) {
                recLabel.setText(getString(RecorderService.paused ? R.string.paused : R.string.recording_now) + " · " + Store.dur(RecorderService.elapsed()));
                recSub.setText(R.string.stop);
            } else if (RecorderService.counting) {
                recLabel.setText(R.string.starting);
                recSub.setText(R.string.cancel);
            } else {
                recLabel.setText(R.string.record);
                recSub.setText(R.string.home_hint);
            }
            if (wasRecording && !rec && tab == 0) h.postDelayed(() -> show(0), 1200);   // la vidéo vient d'être enregistrée
            wasRecording = rec;
            h.postDelayed(this, 500);
        }
    };

    private void onRecord() {
        if (RecorderService.recording || RecorderService.counting) { RecorderService.send(this, RecorderService.ACTION_STOP); return; }
        startActivity(new Intent(this, CaptureActivity.class)
                .putExtra(CaptureActivity.EXTRA_MODE, CaptureActivity.MODE_RECORD).putExtra("home", true));
    }

    private void onShot() {
        if (RecorderService.recording) { RecorderService.send(this, RecorderService.ACTION_SHOT); return; }
        if (RecorderService.counting) return;
        startActivity(new Intent(this, CaptureActivity.class)
                .putExtra(CaptureActivity.EXTRA_MODE, CaptureActivity.MODE_SHOT).putExtra("home", true));
    }

    private void show(int k) {
        if (k != tab) selected.clear();
        tab = k;
        for (int i = 0; i < 3; i++) {
            boolean on = i == k;
            tabs[i].setTextColor(on ? Ui.ACCENT : Ui.MUTED);
            Icons ic = new Icons((Integer) tabs[i].getTag(), on ? Ui.ACCENT : Ui.MUTED);
            ic.setBounds(0, 0, Ui.dp(this, 24), Ui.dp(this, 24));
            tabs[i].setCompoundDrawablesRelative(null, ic, null, null);
        }
        content.removeAllViews();
        if (k == 2) { content.addView(settings()); return; }
        boolean video = k == 0;
        TextView loading = Ui.text(this, "", 14, Ui.MUTED, false);
        content.addView(loading);
        pool.execute(() -> {
            List<Store.Item> items = Store.list(this, video);
            runOnUiThread(() -> { if (tab == k) fillGallery(items, video); });
        });
    }

    // ---------------------------------------------------------------- galerie

    private void fillGallery(List<Store.Item> items, boolean video) {
        content.removeAllViews();
        if (items.isEmpty()) {
            LinearLayout e = Ui.col(this);
            e.setGravity(Gravity.CENTER);
            ImageView i = new ImageView(this);
            i.setImageDrawable(new Icons(video ? Icons.VIDEO : Icons.IMAGE, 0xFF3A3E4C));
            e.addView(i, new LinearLayout.LayoutParams(Ui.dp(this, 72), Ui.dp(this, 72)));
            TextView t = Ui.text(this, getString(video ? R.string.empty_videos : R.string.empty_shots), 15, Ui.MUTED, false);
            t.setGravity(Gravity.CENTER);
            t.setPadding(Ui.dp(this, 40), Ui.dp(this, 12), Ui.dp(this, 40), 0);
            e.addView(t);
            TextView p = Ui.text(this, getString(R.string.privacy_note), 12, 0xFF6B7080, false);
            p.setGravity(Gravity.CENTER);
            p.setPadding(Ui.dp(this, 40), Ui.dp(this, 24), Ui.dp(this, 40), 0);
            e.addView(p);
            content.addView(e, new FrameLayout.LayoutParams(-1, -1));
            return;
        }
        LinearLayout box = Ui.col(this);
        long total = 0;
        for (Store.Item it : items) total += it.size;
        TextView stats = Ui.text(this, getString(R.string.stats, items.size(), Store.size(total)), 13, Ui.MUTED, false);
        if (!video) stats.setText(items.size() + " · " + Store.size(total));
        stats.setPadding(Ui.dp(this, 20), Ui.dp(this, 4), Ui.dp(this, 20), Ui.dp(this, 8));
        box.addView(stats);
        box.addView(selectionBar(video));
        GridView g = new GridView(this);
        g.setNumColumns(video ? 2 : 3);
        int gap = Ui.dp(this, 10);
        g.setHorizontalSpacing(gap);
        g.setVerticalSpacing(gap);
        g.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 16), Ui.dp(this, 16));
        g.setClipToPadding(false);
        g.setSelector(new android.graphics.drawable.ColorDrawable(0));
        shown = items;
        selected.retainAll(uris(items));
        adapter = new Adapter(items, video);
        g.setAdapter(adapter);
        g.setOnItemClickListener((p, v, pos, id) -> {
            Store.Item it = items.get(pos);
            if (!selected.isEmpty()) { toggleSel(it); return; }
            startActivity(new Intent(this, PlayerActivity.class).setData(it.uri).putExtra(PlayerActivity.EXTRA_VIDEO, it.video));
        });
        g.setOnItemLongClickListener((p, v, pos, id) -> { toggleSel(items.get(pos)); return true; });
        refreshSel();
        box.addView(g, new LinearLayout.LayoutParams(-1, 0, 1));
        content.addView(box, new FrameLayout.LayoutParams(-1, -1));
    }

    private final class Adapter extends BaseAdapter {
        final List<Store.Item> items; final boolean video;
        final DateFormat df = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT);
        Adapter(List<Store.Item> items, boolean video) { this.items = items; this.video = video; }
        @Override public int getCount() { return items.size(); }
        @Override public Object getItem(int i) { return items.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int pos, View cv, ViewGroup parent) {
            Holder hd;
            if (cv == null) {
                hd = new Holder();
                LinearLayout c = Ui.col(MainActivity.this);
                FrameLayout fr = new FrameLayout(MainActivity.this);
                fr.setBackground(Ui.round(Ui.CARD, Ui.dp(MainActivity.this, 16)));
                fr.setClipToOutline(true);
                hd.img = new ImageView(MainActivity.this);
                hd.img.setScaleType(ImageView.ScaleType.CENTER_CROP);
                fr.addView(hd.img, new FrameLayout.LayoutParams(-1, -1));
                hd.badge = Ui.text(MainActivity.this, "", 11, Color.WHITE, true);
                hd.badge.setBackground(Ui.round(0xB0000000, Ui.dp(MainActivity.this, 8)));
                hd.badge.setPadding(Ui.dp(MainActivity.this, 6), Ui.dp(MainActivity.this, 2), Ui.dp(MainActivity.this, 6), Ui.dp(MainActivity.this, 2));
                FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
                bl.setMargins(0, 0, Ui.dp(MainActivity.this, 8), Ui.dp(MainActivity.this, 8));
                fr.addView(hd.badge, bl);
                int hgt = video ? Ui.dp(MainActivity.this, 190) : Ui.dp(MainActivity.this, 170);
                hd.check = new ImageView(MainActivity.this);
                int cp = Ui.dp(MainActivity.this, 3);
                hd.check.setPadding(cp, cp, cp, cp);
                FrameLayout.LayoutParams kl = new FrameLayout.LayoutParams(Ui.dp(MainActivity.this, 26), Ui.dp(MainActivity.this, 26), Gravity.TOP | Gravity.END);
                kl.setMargins(0, Ui.dp(MainActivity.this, 8), Ui.dp(MainActivity.this, 8), 0);
                fr.addView(hd.check, kl);
                hd.frame = fr;
                c.addView(fr, new LinearLayout.LayoutParams(-1, hgt));
                hd.sub = Ui.text(MainActivity.this, "", 12, Ui.MUTED, false);
                hd.sub.setPadding(Ui.dp(MainActivity.this, 4), Ui.dp(MainActivity.this, 6), 0, 0);
                hd.sub.setSingleLine(true);
                c.addView(hd.sub);
                c.setTag(hd);
                cv = c;
            } else hd = (Holder) cv.getTag();
            Store.Item it = items.get(pos);
            boolean sel = selected.contains(it.uri);
            hd.check.setVisibility(selected.isEmpty() ? View.GONE : View.VISIBLE);
            hd.check.setImageDrawable(sel ? new Icons(Icons.CHECK, Color.WHITE) : null);
            hd.check.setBackground(sel ? Ui.grad(Ui.dp(MainActivity.this, 13)) : ring());
            hd.img.setAlpha(sel ? 0.75f : 1f);
            hd.badge.setVisibility(video ? View.VISIBLE : View.GONE);
            hd.badge.setText(Store.dur(it.duration));
            hd.sub.setText(video ? df.format(new Date(it.date)) + " · " + Store.size(it.size) : Store.size(it.size));
            String key = it.uri.toString();
            hd.key = key;
            Bitmap bm = thumbs.get(key);
            hd.img.setImageBitmap(bm);
            if (bm == null) {
                final Holder fh = hd;
                pool.execute(() -> {
                    try {
                        Bitmap t = getContentResolver().loadThumbnail(it.uri, new Size(360, 360), null);
                        thumbs.put(key, t);
                        runOnUiThread(() -> { if (key.equals(fh.key)) fh.img.setImageBitmap(t); });
                    } catch (Exception ignored) {}
                });
            }
            return cv;
        }
    }

    private static final class Holder { ImageView img, check; TextView badge, sub; String key; FrameLayout frame; }

    private android.graphics.drawable.GradientDrawable ring() {
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        g.setColor(0x55000000);
        g.setStroke(Ui.dp(this, 2), Color.WHITE);
        return g;
    }

    private static java.util.Set<android.net.Uri> uris(List<Store.Item> items) {
        java.util.Set<android.net.Uri> s = new java.util.HashSet<>();
        for (Store.Item i : items) s.add(i.uri);
        return s;
    }

    // ---------------------------------------------------------------- sélection multiple

    private View selectionBar(boolean video) {
        selBar = Ui.row(this);
        selBar.setPadding(Ui.dp(this, 12), Ui.dp(this, 4), Ui.dp(this, 12), Ui.dp(this, 8));
        ImageView close = selIcon(Icons.CLOSE, v -> { selected.clear(); refreshSel(); }, R.string.close);
        selBar.addView(close);
        selCount = Ui.text(this, "", 15, Ui.TEXT, true);
        selBar.addView(selCount, Ui.weight());
        if (video) selBar.addView(selIcon(Icons.MERGE, v -> mergeSelected(), R.string.merge));
        selBar.addView(selIcon(Icons.SHARE, v -> shareSelected(video), R.string.share));
        selBar.addView(selIcon(Icons.TRASH, v -> deleteSelected(), R.string.delete));
        return selBar;
    }

    private ImageView selIcon(int k, View.OnClickListener l, int desc) {
        ImageView v = new ImageView(this);
        v.setImageDrawable(new Icons(k, Ui.TEXT));
        int p = Ui.dp(this, 10);
        v.setPadding(p, p, p, p);
        Ui.press(v, Ui.round(Ui.CARD2, Ui.dp(this, 22)));
        v.setOnClickListener(l);
        v.setContentDescription(getString(desc));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44));
        lp.setMarginStart(Ui.dp(this, 6));
        v.setLayoutParams(lp);
        return v;
    }

    private void toggleSel(Store.Item it) {
        if (!selected.remove(it.uri)) selected.add(it.uri);
        refreshSel();
    }

    private void refreshSel() {
        if (selBar == null) return;
        selBar.setVisibility(selected.isEmpty() ? View.GONE : View.VISIBLE);
        selCount.setText(getString(R.string.selected_n, selected.size()));
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private void mergeSelected() {
        if (selected.size() < 2) { android.widget.Toast.makeText(this, R.string.merge_pick, android.widget.Toast.LENGTH_SHORT).show(); return; }
        // Ordre chronologique (du plus ancien au plus récent)
        ArrayList<android.net.Uri> list = new ArrayList<>();
        for (int i = shown.size() - 1; i >= 0; i--) if (selected.contains(shown.get(i).uri)) list.add(shown.get(i).uri);
        selected.clear();
        refreshSel();
        startActivity(new Intent(this, EditorActivity.class).putParcelableArrayListExtra(EditorActivity.EXTRA_URIS, list));
    }

    private void shareSelected(boolean video) {
        ArrayList<android.net.Uri> list = new ArrayList<>(selected);
        Intent i = new Intent(Intent.ACTION_SEND_MULTIPLE).setType(video ? "video/mp4" : "image/*")
                .putParcelableArrayListExtra(Intent.EXTRA_STREAM, list).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, getString(R.string.share)));
    }

    private void deleteSelected() {
        ArrayList<android.net.Uri> list = new ArrayList<>(selected);
        try {
            android.app.PendingIntent pi = android.provider.MediaStore.createDeleteRequest(getContentResolver(), list);
            startIntentSenderForResult(pi.getIntentSender(), 9, null, 0, 0, 0);
        } catch (Exception e) {
            android.widget.Toast.makeText(this, R.string.delete_failed, android.widget.Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req, code, data);
        if (req == 9 && code == RESULT_OK) { selected.clear(); show(tab); }
    }

    @Override public void onBackPressed() {
        if (!selected.isEmpty()) { selected.clear(); refreshSel(); return; }
        super.onBackPressed();
    }

    // ---------------------------------------------------------------- réglages

    private View settings() {
        ScrollView sv = new ScrollView(this);
        LinearLayout l = Ui.col(this);
        l.setPadding(Ui.dp(this, 16), Ui.dp(this, 4), Ui.dp(this, 16), Ui.dp(this, 24));
        sv.addView(l);

        LinearLayout video = group(l);
        String[] res = {getString(R.string.res_auto), "1080p", "720p", "480p"};
        choice(video, getString(R.string.set_resolution), res, "res", prefs.res());
        choice(video, getString(R.string.set_fps), new String[]{"24 fps", "30 fps", "60 fps"}, "fps", prefs.fps());
        choice(video, getString(R.string.set_quality), new String[]{getString(R.string.q_low), getString(R.string.q_standard), getString(R.string.q_high)}, "q", prefs.quality());
        choice(video, getString(R.string.set_audio), new String[]{getString(R.string.a_none), getString(R.string.a_mic), getString(R.string.a_internal), getString(R.string.a_both)}, "audio", prefs.audio());
        choice(video, getString(R.string.set_countdown), new String[]{getString(R.string.cd_none), "3 s", "5 s", "10 s"}, "cd", prefs.countdown());

        LinearLayout ctl = group(l);
        toggle(ctl, getString(R.string.set_bubble), getString(R.string.set_bubble_sub), "bubble", prefs.bubble());
        toggle(ctl, getString(R.string.set_facecam), getString(R.string.set_facecam_sub), "face", prefs.facecam());
        choice(ctl, getString(R.string.set_cam_size), new String[]{getString(R.string.size_s), getString(R.string.size_m), getString(R.string.size_l)}, "camsize", prefs.camSize());
        toggle(ctl, getString(R.string.set_screen_off), null, "screenoff", prefs.screenOff());

        String v = "1.0";
        try { PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0); v = pi.versionName; } catch (Exception ignored) {}
        TextView foot = Ui.text(this, getString(R.string.set_storage) + "\n\n" + getString(R.string.privacy_note) + "\n" + getString(R.string.version, v) + "\n\n" + getString(R.string.created_by), 12, Ui.MUTED, false);
        foot.setPadding(Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8), 0);
        l.addView(foot);
        return sv;
    }

    private LinearLayout group(LinearLayout parent) {
        LinearLayout g = Ui.col(this);
        g.setBackground(Ui.round(Ui.CARD, Ui.dp(this, 20)));
        g.setClipToOutline(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = Ui.dp(this, 12);
        parent.addView(g, lp);
        return g;
    }

    private LinearLayout rowBase(LinearLayout g, String title, String sub) {
        LinearLayout r = Ui.row(this);
        r.setPadding(Ui.dp(this, 18), Ui.dp(this, 14), Ui.dp(this, 18), Ui.dp(this, 14));
        r.setMinimumHeight(Ui.dp(this, 56));
        LinearLayout t = Ui.col(this);
        t.addView(Ui.text(this, title, 15, Ui.TEXT, false));
        if (sub != null) t.addView(Ui.text(this, sub, 12, Ui.MUTED, false));
        r.addView(t, Ui.weight());
        Ui.press(r, Ui.round(0, 0));
        g.addView(r);
        return r;
    }

    private void choice(LinearLayout g, String title, String[] opts, String key, int cur) {
        LinearLayout r = rowBase(g, title, null);
        TextView val = Ui.text(this, opts[Math.min(cur, opts.length - 1)], 14, Ui.ACCENT, true);
        r.addView(val);
        r.setOnClickListener(v -> {
            int now = key.equals("res") ? prefs.res() : key.equals("fps") ? prefs.fps() : key.equals("q") ? prefs.quality()
                    : key.equals("audio") ? prefs.audio() : key.equals("cd") ? prefs.countdown() : prefs.camSize();
            new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                    .setTitle(title)
                    .setSingleChoiceItems(opts, now, (d, w) -> { prefs.set(key, w); val.setText(opts[w]); d.dismiss(); })
                    .setNegativeButton(R.string.cancel, null)
                    .show();
        });
    }

    private void toggle(LinearLayout g, String title, String sub, String key, boolean cur) {
        LinearLayout r = rowBase(g, title, sub);
        Switch s = new Switch(this);
        s.setChecked(cur);
        s.setThumbTintList(new android.content.res.ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{Ui.ACCENT, 0xFFCCCCCC}));
        s.setTrackTintList(new android.content.res.ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{0x88FF3D5A, 0x55FFFFFF}));
        s.setOnCheckedChangeListener((b, on) -> prefs.set(key, on));
        r.addView(s);
        r.setOnClickListener(v -> s.toggle());
    }

    @SuppressWarnings("unused")
    private static <T> List<T> copy(List<T> l) { return new ArrayList<>(l); }
}
