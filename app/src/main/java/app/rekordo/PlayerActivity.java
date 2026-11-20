package app.rekordo;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.app.RecoverableSecurityException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import java.util.Collections;

/** Lecture d'une vidéo ou d'une capture : partager, couper, extraire une image, supprimer. */
public class PlayerActivity extends Activity {
    static final String EXTRA_VIDEO = "video";
    private static final int REQ_DELETE = 5;

    private Uri uri;
    private boolean video;
    private VideoView vv;
    private SeekBar seek;
    private TextView time;
    private ImageView playBtn;
    private long duration;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        uri = getIntent().getData();
        if (uri == null) { finish(); return; }
        video = getIntent().getBooleanExtra(EXTRA_VIDEO, true);

        LinearLayout root = Ui.col(this);
        root.setBackgroundColor(Color.BLACK);

        LinearLayout top = Ui.row(this);
        top.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 8), Ui.dp(this, 4));
        top.addView(icon(Icons.BACK, v -> finish()));
        TextView title = Ui.text(this, name(), 15, Ui.TEXT, true);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        top.addView(title, Ui.weight());
        top.addView(icon(Icons.INFO, v -> info()));
        root.addView(top);

        FrameLayout stage = new FrameLayout(this);
        root.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));

        if (video) {
            vv = new VideoView(this);
            stage.addView(vv, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
            vv.setVideoURI(uri);
            vv.setOnPreparedListener(mp -> {
                duration = vv.getDuration();
                seek.setMax((int) duration);
                vv.start();
                playBtn.setImageDrawable(new Icons(Icons.PAUSE, Color.WHITE));
                h.post(progress);
            });
            vv.setOnCompletionListener(mp -> playBtn.setImageDrawable(new Icons(Icons.PLAY, Color.WHITE)));
            vv.setOnErrorListener((mp, w, e) -> { Toast.makeText(this, R.string.trim_failed, Toast.LENGTH_SHORT).show(); return true; });
            stage.setOnClickListener(v -> toggle());

            LinearLayout ctl = Ui.row(this);
            ctl.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 16), 0);
            playBtn = icon(Icons.PLAY, v -> toggle());
            ctl.addView(playBtn);
            seek = new SeekBar(this);
            seek.setProgressTintList(android.content.res.ColorStateList.valueOf(Ui.ACCENT));
            seek.setThumbTintList(android.content.res.ColorStateList.valueOf(Ui.ACCENT));
            seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) { vv.seekTo(p); showTime(p); } }
                @Override public void onStartTrackingTouch(SeekBar s) {}
                @Override public void onStopTrackingTouch(SeekBar s) {}
            });
            ctl.addView(seek, Ui.weight());
            time = Ui.text(this, "0:00", 13, Ui.MUTED, false);
            ctl.addView(time);
            root.addView(ctl);
        } else {
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            stage.addView(iv, new FrameLayout.LayoutParams(-1, -1));
            new Thread(() -> {
                try {
                    android.graphics.drawable.Drawable dr = ImageDecoder.decodeDrawable(ImageDecoder.createSource(getContentResolver(), uri));
                    runOnUiThread(() -> {
                        iv.setImageDrawable(dr);
                        if (dr instanceof android.graphics.drawable.AnimatedImageDrawable) ((android.graphics.drawable.AnimatedImageDrawable) dr).start();
                    });
                } catch (Exception ignored) {}
            }).start();
        }

        LinearLayout actions = Ui.row(this);
        actions.setGravity(Gravity.CENTER);
        actions.setPadding(Ui.dp(this, 8), Ui.dp(this, 10), Ui.dp(this, 8), Ui.dp(this, 10));
        actions.addView(action(Icons.SHARE, R.string.share, v -> share()), Ui.weight());
        boolean gif = "image/gif".equals(getContentResolver().getType(uri));
        if (!gif) actions.addView(action(Icons.EDIT, R.string.edit, v -> {
            if (vv != null && vv.isPlaying()) toggle();
            startActivity(new Intent(this, video ? EditorActivity.class : AnnotateActivity.class).setData(uri));
        }), Ui.weight());
        if (video) {
            actions.addView(action(Icons.CUT, R.string.trim, v -> trimDialog()), Ui.weight());
            actions.addView(action(Icons.FRAME, R.string.frame, v -> frame()), Ui.weight());
        }
        actions.addView(action(Icons.TRASH, R.string.delete, v -> confirmDelete()), Ui.weight());
        root.addView(actions);

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

    private View action(int k, int label, View.OnClickListener l) {
        LinearLayout c = Ui.col(this);
        c.setGravity(Gravity.CENTER);
        ImageView i = new ImageView(this);
        i.setImageDrawable(new Icons(k, Color.WHITE));
        c.addView(i, new LinearLayout.LayoutParams(Ui.dp(this, 26), Ui.dp(this, 26)));
        TextView t = Ui.text(this, getString(label), 12, Ui.MUTED, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(this, 4), 0, 0);
        c.addView(t);
        c.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        Ui.press(c, Ui.round(0, Ui.dp(this, 14)));
        c.setOnClickListener(l);
        return c;
    }

    private final Runnable progress = new Runnable() {
        @Override public void run() {
            if (vv == null) return;
            int p = vv.getCurrentPosition();
            seek.setProgress(p);
            showTime(p);
            h.postDelayed(this, 250);
        }
    };

    private void showTime(long p) { time.setText(Store.dur(p) + " / " + Store.dur(duration)); }

    private void toggle() {
        if (vv == null) return;
        if (vv.isPlaying()) { vv.pause(); playBtn.setImageDrawable(new Icons(Icons.PLAY, Color.WHITE)); }
        else { vv.start(); playBtn.setImageDrawable(new Icons(Icons.PAUSE, Color.WHITE)); }
    }

    @Override protected void onPause() { super.onPause(); if (vv != null && vv.isPlaying()) toggle(); }
    @Override protected void onDestroy() { h.removeCallbacksAndMessages(null); super.onDestroy(); }

    private String name() {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return getString(R.string.app_name);
    }

    private void info() {
        StringBuilder sb = new StringBuilder();
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) sb.append(Store.size(c.getLong(0))).append('\n');
        } catch (Exception ignored) {}
        try {
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            r.setDataSource(this, uri);
            if (video) {
                sb.append(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)).append(" × ")
                        .append(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)).append('\n');
                String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (d != null) sb.append(Store.dur(Long.parseLong(d))).append('\n');
                String br = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE);
                if (br != null) sb.append(Long.parseLong(br) / 1000).append(" kb/s\n");
                String fr = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE);
                if (fr != null) sb.append(fr).append(" fps\n");
            }
            r.release();
        } catch (Exception ignored) {}
        sb.append(name());
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.info).setMessage(sb.toString()).setPositiveButton(android.R.string.ok, null).show();
    }

    private void share() {
        String type = getContentResolver().getType(uri);
        if (type == null) type = video ? "video/mp4" : "image/png";
        Intent i = new Intent(Intent.ACTION_SEND).setType(type)
                .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, getString(R.string.share)));
    }

    private void frame() {
        long pos = vv == null ? 0 : vv.getCurrentPosition();
        new Thread(() -> {
            try {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                r.setDataSource(this, uri);
                Bitmap b = r.getFrameAtTime(pos * 1000, MediaMetadataRetriever.OPTION_CLOSEST);
                r.release();
                Uri u = b == null ? null : Store.saveImage(this, b);
                runOnUiThread(() -> Toast.makeText(this, u != null ? R.string.shot_saved : R.string.trim_failed, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, R.string.trim_failed, Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private void trimDialog() {
        if (duration <= 0) return;
        if (vv.isPlaying()) toggle();
        LinearLayout box = Ui.col(this);
        int p = Ui.dp(this, 20);
        box.setPadding(p, p / 2, p, 0);
        TextView label = Ui.text(this, "", 15, Ui.TEXT, true);
        box.addView(label);
        TextView ls = Ui.text(this, getString(R.string.start), 13, Ui.MUTED, false);
        ls.setPadding(0, p, 0, 0);
        box.addView(ls);
        SeekBar s = new SeekBar(this);
        s.setMax((int) duration);
        box.addView(s);
        TextView le = Ui.text(this, getString(R.string.end), 13, Ui.MUTED, false);
        le.setPadding(0, p / 2, 0, 0);
        box.addView(le);
        SeekBar e = new SeekBar(this);
        e.setMax((int) duration);
        e.setProgress((int) duration);
        box.addView(e);
        Runnable upd = () -> label.setText(getString(R.string.trim_title, Store.dur(s.getProgress()), Store.dur(e.getProgress())));
        SeekBar.OnSeekBarChangeListener l = new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int v, boolean user) {
                if (!user) return;
                if (sb == s && v >= e.getProgress() - 1000) s.setProgress(Math.max(0, e.getProgress() - 1000));
                if (sb == e && v <= s.getProgress() + 1000) e.setProgress(Math.min((int) duration, s.getProgress() + 1000));
                vv.seekTo(sb.getProgress());
                upd.run();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        };
        s.setOnSeekBarChangeListener(l);
        e.setOnSeekBarChangeListener(l);
        upd.run();
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.trim)
                .setView(box)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.save_copy, (d, w) -> doTrim(s.getProgress(), e.getProgress()))
                .show();
    }

    private void doTrim(long start, long end) {
        AlertDialog wait = new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setMessage(R.string.trimming).setCancelable(false).show();
        new Thread(() -> {
            Uri res = null;
            try { res = Trimmer.trim(this, uri, start, end); } catch (Exception ignored) {}
            final Uri r = res;
            runOnUiThread(() -> {
                wait.dismiss();
                if (r == null) { Toast.makeText(this, R.string.trim_failed, Toast.LENGTH_LONG).show(); return; }
                Toast.makeText(this, R.string.trim_done, Toast.LENGTH_SHORT).show();
                startActivity(new Intent(this, PlayerActivity.class).setData(r).putExtra(EXTRA_VIDEO, true));
                finish();
            });
        }).start();
    }

    private void confirmDelete() {
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setMessage(R.string.delete_q)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.delete, (d, w) -> delete())
                .show();
    }

    private void delete() {
        try {
            if (getContentResolver().delete(uri, null, null) > 0) { finish(); return; }
        } catch (RecoverableSecurityException e) {
            // Fichier créé par une installation précédente : Android demande la confirmation
        } catch (Exception e) {
            Toast.makeText(this, R.string.delete_failed, Toast.LENGTH_LONG).show();
            return;
        }
        try {
            PendingIntent pi = MediaStore.createDeleteRequest(getContentResolver(), Collections.singletonList(uri));
            startIntentSenderForResult(pi.getIntentSender(), REQ_DELETE, null, 0, 0, 0);
        } catch (Exception e) {
            Toast.makeText(this, R.string.delete_failed, Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req, code, data);
        if (req == REQ_DELETE && code == RESULT_OK) finish();
    }
}
