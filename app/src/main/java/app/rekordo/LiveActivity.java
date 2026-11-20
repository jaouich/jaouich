package app.rekordo;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Préparer un direct : plateforme, adresse du serveur, clé de diffusion, qualité. */
public class LiveActivity extends Activity {
    private Prefs prefs;
    private int platform;
    private EditText url, key;
    private TextView help;
    private final List<TextView> chips = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        platform = prefs.livePlatform();

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.BG);
        sv.setFillViewport(true);
        LinearLayout l = Ui.col(this);
        l.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), Ui.dp(this, 24));
        sv.addView(l);

        LinearLayout top = Ui.row(this);
        android.widget.ImageView back = new android.widget.ImageView(this);
        back.setImageDrawable(new Icons(Icons.BACK, Color.WHITE));
        int p = Ui.dp(this, 12);
        back.setPadding(p, p, p, p);
        Ui.press(back, Ui.round(0, Ui.dp(this, 24)));
        back.setOnClickListener(v -> finish());
        top.addView(back, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
        TextView t = Ui.text(this, getString(R.string.live_title), 22, Ui.TEXT, true);
        top.addView(t, Ui.weight());
        TextView badge = Ui.text(this, "● LIVE", 12, Color.WHITE, true);
        badge.setBackground(Ui.round(0xFFE5202E, Ui.dp(this, 8)));
        badge.setPadding(Ui.dp(this, 8), Ui.dp(this, 3), Ui.dp(this, 8), Ui.dp(this, 3));
        top.addView(badge);
        l.addView(top);

        l.addView(label(getString(R.string.live_platform)));
        LinearLayout row = Ui.row(this);
        String[] names = {"YouTube", "Facebook", "Twitch", getString(R.string.live_custom)};
        for (int i = 0; i < names.length; i++) {
            final int k = i;
            TextView c = Ui.text(this, names[i], 13, Ui.TEXT, true);
            c.setGravity(Gravity.CENTER);
            c.setSingleLine(true);
            c.setAutoSizeTextTypeUniformWithConfiguration(9, 14, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            c.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4), Ui.dp(this, 10));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.dp(this, 42), 1);
            lp.setMargins(Ui.dp(this, 3), 0, Ui.dp(this, 3), 0);
            c.setOnClickListener(v -> pick(k));
            row.addView(c, lp);
            chips.add(c);
        }
        l.addView(row);

        help = Ui.text(this, "", 13, Ui.MUTED, false);
        help.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        help.setBackground(Ui.round(Ui.CARD, Ui.dp(this, 14)));
        help.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams hl = new LinearLayout.LayoutParams(-1, -2);
        hl.topMargin = Ui.dp(this, 12);
        l.addView(help, hl);

        l.addView(label(getString(R.string.live_server)));
        url = field(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        l.addView(url);
        l.addView(label(getString(R.string.live_key)));
        key = field(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        l.addView(key);
        TextView show = Ui.text(this, getString(R.string.live_show_key), 13, Ui.ACCENT, true);
        show.setPadding(0, Ui.dp(this, 6), 0, 0);
        show.setOnClickListener(v -> {
            boolean hidden = (key.getInputType() & InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0;
            key.setInputType(InputType.TYPE_CLASS_TEXT | (hidden ? InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD : InputType.TYPE_TEXT_VARIATION_PASSWORD));
            key.setSelection(key.getText().length());
        });
        l.addView(show);

        l.addView(label(getString(R.string.live_quality)));
        LinearLayout q = Ui.row(this);
        String[] qs = {"480p", "720p", "1080p"};
        List<TextView> qc = new ArrayList<>();
        for (int i = 0; i < qs.length; i++) {
            final int k = i;
            TextView c = Ui.text(this, qs[i], 14, Ui.TEXT, true);
            c.setGravity(Gravity.CENTER);
            c.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 10));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(Ui.dp(this, 3), 0, Ui.dp(this, 3), 0);
            q.addView(c, lp);
            qc.add(c);
            c.setOnClickListener(v -> { prefs.set("lr", k); paint(qc, k); });
        }
        paint(qc, prefs.liveRes());
        l.addView(q);
        l.addView(small(getString(R.string.live_quality_note)));

        LinearLayout sr = Ui.row(this);
        sr.setPadding(0, Ui.dp(this, 14), 0, 0);
        sr.addView(Ui.text(this, getString(R.string.live_save), 15, Ui.TEXT, false), Ui.weight());
        Switch sw = new Switch(this);
        sw.setChecked(prefs.liveSave());
        sw.setThumbTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{Ui.ACCENT, 0xFFCCCCCC}));
        sw.setTrackTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{0x88FF3D5A, 0x55FFFFFF}));
        sw.setOnCheckedChangeListener((x, on) -> prefs.set("ls", on));
        sr.addView(sw);
        l.addView(sr);

        TextView go = Ui.text(this, "● " + getString(R.string.live_go), 17, Color.WHITE, true);
        go.setGravity(Gravity.CENTER);
        go.setPadding(0, Ui.dp(this, 16), 0, Ui.dp(this, 16));
        Ui.press(go, Ui.round(0xFFE5202E, Ui.dp(this, 16)));
        go.setOnClickListener(v -> goLive());
        LinearLayout.LayoutParams gl = new LinearLayout.LayoutParams(-1, -2);
        gl.topMargin = Ui.dp(this, 22);
        l.addView(go, gl);
        l.addView(small(getString(R.string.live_privacy)));

        View spacer = new View(this);
        l.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));
        TextView credit = Ui.text(this, getString(R.string.created_by), 12, 0xFF6B7080, false);
        credit.setGravity(Gravity.CENTER);
        credit.setPadding(0, Ui.dp(this, 20), 0, 0);
        l.addView(credit);

        Ui.edgeToEdge(this, sv);
        setContentView(sv);
        pick(platform);
    }

    private TextView label(String s) {
        TextView t = Ui.text(this, s, 13, Ui.MUTED, true);
        t.setPadding(0, Ui.dp(this, 18), 0, Ui.dp(this, 6));
        return t;
    }

    private TextView small(String s) {
        TextView t = Ui.text(this, s, 12, Ui.MUTED, false);
        t.setPadding(0, Ui.dp(this, 8), 0, 0);
        return t;
    }

    private EditText field(int type) {
        EditText e = new EditText(this);
        e.setInputType(type);
        e.setSingleLine(true);
        e.setTextColor(Ui.TEXT);
        e.setHintTextColor(Ui.MUTED);
        e.setTextSize(15);
        e.setBackground(Ui.round(Ui.CARD, Ui.dp(this, 12)));
        e.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        return e;
    }

    private void paint(List<TextView> l, int on) {
        for (int i = 0; i < l.size(); i++) {
            l.get(i).setBackground(i == on ? Ui.grad(Ui.dp(this, 12)) : Ui.round(Ui.CARD2, Ui.dp(this, 12)));
            l.get(i).setTextColor(i == on ? Color.WHITE : Ui.TEXT);
        }
    }

    private void saveFields() {
        if (url == null) return;
        prefs.set("lu" + platform, url.getText().toString().trim());
        prefs.set("lk" + platform, key.getText().toString().trim());
    }

    private void pick(int k) {
        if (url.getTag() != null) saveFields();
        url.setTag(1);
        platform = k;
        prefs.set("lp", k);
        paint(chips, k);
        url.setText(prefs.liveUrl(k));
        url.setHint("rtmp://…");
        key.setText(prefs.liveKey(k));
        key.setHint(R.string.live_key_hint);
        int[] h = {R.string.live_help_youtube, R.string.live_help_facebook, R.string.live_help_twitch, R.string.live_help_custom};
        help.setText(h[k]);
    }

    @Override protected void onPause() { super.onPause(); saveFields(); }

    private void goLive() {
        saveFields();
        String u = url.getText().toString().trim();
        if (!u.startsWith("rtmp://") && !u.startsWith("rtmps://")) { Toast.makeText(this, R.string.live_bad_url, Toast.LENGTH_LONG).show(); return; }
        if (key.getText().toString().trim().isEmpty() && platform != 3) { Toast.makeText(this, R.string.live_no_key, Toast.LENGTH_LONG).show(); return; }
        if (RecorderService.recording || RecorderService.counting) { Toast.makeText(this, R.string.live_busy, Toast.LENGTH_LONG).show(); return; }
        startActivity(new Intent(this, CaptureActivity.class).putExtra(CaptureActivity.EXTRA_MODE, CaptureActivity.MODE_LIVE).putExtra("home", true));
        finish();
    }
}
