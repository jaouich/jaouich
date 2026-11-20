package ma.magiscom.desk;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputType;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/** Écran principal : connexion, gros bouton d'enregistrement, réglages et liste des vidéos. */
public class MainActivity extends Activity {
    private static final int REQ_CAPTURE = 1, REQ_PERMS = 2;
    private SharedPreferences sp;
    private LinearLayout list;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = Api.prefs(this);
        getWindow().setStatusBarColor(Ui.DARK);
        getWindow().setNavigationBarColor(Ui.BG);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private void render() {
        if (!Api.loggedIn(this) && !sp.getBoolean("guest", false)) showLogin();
        else showHome();
    }

    private LinearLayout page() {
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.BG);
        sv.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 20);
        col.setPadding(p, p, p, p);
        sv.addView(col);
        setContentView(sv);
        return col;
    }

    private LinearLayout header(LinearLayout col, String title, String sub) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        row.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 52), Ui.dp(this, 52)));
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setPadding(Ui.dp(this, 12), 0, 0, 0);
        t.addView(Ui.text(this, title, 22, Ui.INK, true));
        t.addView(Ui.text(this, sub, 14, Ui.MUTED, false));
        row.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        col.addView(row);
        return row;
    }

    // ---------- Connexion ----------
    private void showLogin() {
        LinearLayout col = page();
        header(col, "Magiscom Desk", "Enregistreur d'écran et support Magiscom Tech");
        LinearLayout card = Ui.card(this);
        card.addView(Ui.text(this, "Connexion", 20, Ui.INK, true));
        card.addView(Ui.text(this, "Avec le même compte que le site Magiscom Tech Desk.", 14, Ui.MUTED, false));
        EditText email = Ui.input(this, "E-mail", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText pass = Ui.input(this, "Mot de passe", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        TextView err = Ui.text(this, "", 14, Ui.RED, false);
        err.setVisibility(View.GONE);
        Button go = Ui.button(this, "Se connecter", Ui.BRAND, Color.WHITE);
        card.addView(email, Ui.lp(this, 16));
        card.addView(pass, Ui.lp(this, 10));
        card.addView(err, Ui.lp(this, 8));
        card.addView(go, Ui.lp(this, 14));
        go.setOnClickListener(v -> {
            err.setVisibility(View.GONE);
            go.setEnabled(false); go.setText("Connexion…");
            String e = email.getText().toString().trim(), pw = pass.getText().toString();
            new Thread(() -> {
                try {
                    JSONObject r = Api.call(this, "POST", "/api/auth/login", new JSONObject().put("email", e).put("password", pw));
                    JSONObject u = r.getJSONObject("user");
                    sp.edit().putString("name", u.optString("name")).putString("role", u.optString("role")).putBoolean("guest", false).apply();
                    runOnUiThread(this::afterLogin);
                } catch (Exception ex) {
                    runOnUiThread(() -> { err.setText(ex.getMessage()); err.setVisibility(View.VISIBLE); go.setEnabled(true); go.setText("Se connecter"); });
                }
            }).start();
        });
        col.addView(card, Ui.lp(this, 24));
        Button reg = Ui.outline(this, "Créer un compte sur le site");
        reg.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + "/#/register"))));
        col.addView(reg, Ui.lp(this, 14));
        Button guest = Ui.outline(this, "Enregistrer sans compte");
        guest.setOnClickListener(v -> { sp.edit().putBoolean("guest", true).apply(); render(); });
        col.addView(guest, Ui.lp(this, 10));
        TextView note = Ui.text(this, "Sans compte, vous pouvez enregistrer, revoir et partager vos vidéos. Pour les envoyer à Magiscom Tech, connectez-vous.", 13, Ui.MUTED, false);
        col.addView(note, Ui.lp(this, 12));
    }

    private void afterLogin() {
        String pending = sp.getString("pending", null);
        sp.edit().remove("pending").apply();
        if (pending != null) startActivity(new Intent(this, ResultActivity.class).setData(Uri.parse(pending)).putExtra("send", true));
        render();
    }

    // ---------- Accueil ----------
    private void showHome() {
        LinearLayout col = page();
        String name = sp.getString("name", null);
        header(col, Api.loggedIn(this) && name != null ? "Bonjour " + name.split(" ")[0] : "Magiscom Desk",
                Api.loggedIn(this) ? "Filmez votre écran et parlez : nous voyons le problème." : "Mode sans compte");

        // Gros bouton rond
        LinearLayout hero = Ui.card(this);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        Button rec = new Button(this);
        boolean on = RecorderService.running;
        rec.setText(on ? "■\nArrêter" : "⏺\nEnregistrer");
        rec.setAllCaps(false);
        rec.setTextColor(Color.WHITE);
        rec.setTextSize(20);
        rec.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        rec.setBackground(Ui.round(on ? Ui.DARK : Ui.RED, Ui.dp(this, 80)));
        rec.setStateListAnimator(null);
        rec.setElevation(Ui.dp(this, 8));
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(Ui.dp(this, 160), Ui.dp(this, 160));
        rlp.topMargin = Ui.dp(this, 8);
        hero.addView(rec, rlp);
        TextView hint = Ui.text(this, on ? "Enregistrement en cours. Utilisez la bulle ou la notification." :
                "Touchez, puis « Commencer ». Allez dans votre logiciel et montrez le problème en parlant.", 14, Ui.MUTED, false);
        hint.setGravity(Gravity.CENTER);
        hero.addView(hint, Ui.lp(this, 14));
        rec.setOnClickListener(v -> {
            if (RecorderService.running) { startService(new Intent(this, RecorderService.class).setAction(RecorderService.STOP)); rec.postDelayed(this::render, 600); }
            else startFlow();
        });
        col.addView(hero, Ui.lp(this, 20));

        // Réglages
        LinearLayout opts = Ui.card(this);
        opts.addView(Ui.text(this, "Réglages", 17, Ui.INK, true));
        opts.addView(toggle("mic", true, "🎙  Ma voix (micro)", "Expliquez le problème en parlant"));
        opts.addView(toggle("bubble", true, "🔴  Bulle flottante", "Minuteur, pause et arrêt au-dessus des applications"));
        opts.addView(toggle("countdown", true, "⏱  Compte à rebours 3 s", "Le temps d'aller dans votre application"));
        opts.addView(toggle("hd", false, "✨  Qualité HD (1080p)", "Plus net, mais la vidéo est plus lourde"));
        col.addView(opts, Ui.lp(this, 16));

        // Vidéos
        col.addView(Ui.text(this, "Mes enregistrements", 17, Ui.INK, true), Ui.lp(this, 22));
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        col.addView(list, Ui.lp(this, 8));
        loadList();

        // Bas de page
        Button site = Ui.outline(this, "Ouvrir Magiscom Tech Desk");
        site.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE))));
        col.addView(site, Ui.lp(this, 22));
        Button acc = Ui.outline(this, Api.loggedIn(this) ? "Se déconnecter" : "Se connecter");
        acc.setOnClickListener(v -> {
            if (Api.loggedIn(this)) {
                new Thread(() -> { try { Api.call(this, "POST", "/api/auth/logout", null); } catch (Exception ignored) {} }).start();
                Api.forget(this);
            }
            sp.edit().putBoolean("guest", false).apply();
            render();
        });
        col.addView(acc, Ui.lp(this, 10));
    }

    private View toggle(String key, boolean def, String title, String sub) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Ui.dp(this, 12), 0, 0);
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.addView(Ui.text(this, title, 15, Ui.INK, true));
        t.addView(Ui.text(this, sub, 13, Ui.MUTED, false));
        row.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Switch s = new Switch(this);
        s.setChecked(sp.getBoolean(key, def));
        s.setOnCheckedChangeListener((b, v) -> sp.edit().putBoolean(key, v).apply());
        row.addView(s);
        row.setOnClickListener(v -> s.toggle());
        return row;
    }

    // ---------- Démarrage : permissions, bulle, autorisation de capture ----------
    private void startFlow() {
        List<String> need = new ArrayList<>();
        if (sp.getBoolean("mic", true) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!need.isEmpty()) { requestPermissions(need.toArray(new String[0]), REQ_PERMS); return; }
        if (sp.getBoolean("bubble", true) && !Settings.canDrawOverlays(this)) {
            new AlertDialog.Builder(this)
                    .setTitle("Bulle flottante")
                    .setMessage("Pour voir le minuteur et arrêter l'enregistrement depuis n'importe quelle application, autorisez « Afficher par-dessus les autres applications » pour Magiscom Desk, puis revenez.")
                    .setPositiveButton("Autoriser", (d, w) -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))))
                    .setNegativeButton("Sans bulle", (d, w) -> { sp.edit().putBoolean("bubble", false).apply(); askCapture(); })
                    .show();
            return;
        }
        askCapture();
    }

    private void askCapture() {
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERMS) return;
        for (int i = 0; i < perms.length; i++) {
            if (perms[i].equals(Manifest.permission.RECORD_AUDIO) && res[i] != PackageManager.PERMISSION_GRANTED) {
                sp.edit().putBoolean("mic", false).apply();
                android.widget.Toast.makeText(this, "Micro refusé : la vidéo sera sans votre voix", android.widget.Toast.LENGTH_LONG).show();
            }
        }
        startFlow();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_CAPTURE) return;
        if (result != RESULT_OK || data == null) return;
        Intent svc = new Intent(this, RecorderService.class).setAction(RecorderService.START)
                .putExtra("code", result).putExtra("data", data)
                .putExtra("mic", sp.getBoolean("mic", true))
                .putExtra("bubble", sp.getBoolean("bubble", true))
                .putExtra("countdown", sp.getBoolean("countdown", true))
                .putExtra("hd", sp.getBoolean("hd", false));
        startForegroundService(svc);
        // Comme AZ : on revient à l'écran d'accueil du téléphone pour aller dans l'application à filmer
        moveTaskToBack(true);
    }

    // ---------- Liste des vidéos de la galerie (Films / Magiscom Desk) ----------
    private void loadList() {
        new Thread(() -> {
            List<Object[]> rows = new ArrayList<>();
            String[] cols = {MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.DURATION, MediaStore.Video.Media.SIZE, MediaStore.Video.Media.DATE_ADDED};
            Uri base = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            try (Cursor c = getContentResolver().query(base, cols, MediaStore.Video.Media.RELATIVE_PATH + " LIKE ?", new String[]{"Movies/Magiscom Desk%"}, MediaStore.Video.Media.DATE_ADDED + " DESC")) {
                while (c != null && c.moveToNext() && rows.size() < 50) {
                    Uri u = ContentUris.withAppendedId(base, c.getLong(0));
                    Bitmap th = null;
                    try { th = getContentResolver().loadThumbnail(u, new Size(320, 180), null); } catch (Exception ignored) {}
                    rows.add(new Object[]{u, c.getString(1), c.getLong(2), c.getLong(3), c.getLong(4), th});
                }
            } catch (Exception ignored) {}
            runOnUiThread(() -> showList(rows));
        }).start();
    }

    private void showList(List<Object[]> rows) {
        if (list == null) return;
        list.removeAllViews();
        if (rows.isEmpty()) {
            list.addView(Ui.text(this, "Vos vidéos apparaîtront ici (et dans la galerie : Films › Magiscom Desk).", 14, Ui.MUTED, false));
            return;
        }
        for (Object[] r : rows) {
            LinearLayout item = Ui.card(this);
            item.setOrientation(LinearLayout.HORIZONTAL);
            item.setGravity(Gravity.CENTER_VERTICAL);
            item.setPadding(Ui.dp(this, 10), Ui.dp(this, 10), Ui.dp(this, 14), Ui.dp(this, 10));
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setBackground(Ui.round(Color.BLACK, Ui.dp(this, 10)));
            iv.setClipToOutline(true);
            if (r[5] != null) iv.setImageBitmap((Bitmap) r[5]);
            item.addView(iv, new LinearLayout.LayoutParams(Ui.dp(this, 96), Ui.dp(this, 64)));
            LinearLayout t = new LinearLayout(this);
            t.setOrientation(LinearLayout.VERTICAL);
            t.setPadding(Ui.dp(this, 12), 0, 0, 0);
            String when = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(new Date((Long) r[4] * 1000));
            t.addView(Ui.text(this, when, 15, Ui.INK, true));
            t.addView(Ui.text(this, Ui.clock((Long) r[2] / 1000) + " · " + Ui.size((Long) r[3]), 13, Ui.MUTED, false));
            item.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            item.addView(Ui.text(this, "›", 26, Ui.MUTED, false));
            final Uri u = (Uri) r[0];
            final long secs = (Long) r[2] / 1000;
            item.setOnClickListener(v -> startActivity(new Intent(this, ResultActivity.class).setData(u).putExtra("secs", secs)));
            list.addView(item, Ui.lp(this, 8));
        }
    }
}
