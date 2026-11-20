package ma.magiscom.desk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Après l'enregistrement : revoir la vidéo, l'envoyer à Magiscom Tech, la partager ou la supprimer. */
public class ResultActivity extends Activity {
    private Uri uri;
    private long secs;
    private VideoView video;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Ui.DARK);
        uri = getIntent().getData();
        if (uri == null) { finish(); return; }
        secs = getIntent().getLongExtra("secs", 0);
        String name = "Vidéo";
        long size = 0;
        try (Cursor c = getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.Video.Media.DURATION}, null, null, null)) {
            if (c != null && c.moveToFirst()) { name = c.getString(0); size = c.getLong(1); if (secs == 0) secs = c.getLong(2) / 1000; }
            else { Toast.makeText(this, "Cette vidéo n'existe plus", Toast.LENGTH_SHORT).show(); finish(); return; }
        } catch (Exception e) { finish(); return; }

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.BG);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 20);
        col.setPadding(p, p, p, p);
        sv.addView(col);

        col.addView(Ui.text(this, "Votre enregistrement", 22, Ui.INK, true));
        col.addView(Ui.text(this, Ui.clock(secs) + " · " + Ui.size(size) + " · Galerie › Films › Magiscom Desk", 14, Ui.MUTED, false), Ui.lp(this, 4));

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.round(Color.BLACK, Ui.dp(this, 16)));
        frame.setClipToOutline(true);
        video = new VideoView(this);
        FrameLayout.LayoutParams vlp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        frame.addView(video, vlp);
        int hgt = (int) (getResources().getDisplayMetrics().heightPixels * 0.5);
        col.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, hgt) {{ topMargin = Ui.dp(ResultActivity.this, 14); }});
        MediaController mc = new MediaController(this);
        mc.setAnchorView(frame);
        video.setMediaController(mc);
        video.setVideoURI(uri);
        video.setOnPreparedListener(mp -> video.seekTo(1));

        Button send = Ui.button(this, "📤  Envoyer à Magiscom Tech", Ui.BRAND, Color.WHITE);
        send.setOnClickListener(v -> send());
        col.addView(send, Ui.lp(this, 18));
        Button share = Ui.outline(this, "↗  Partager (WhatsApp, e-mail…)");
        share.setOnClickListener(v -> {
            Intent s = new Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(s, "Partager la vidéo"));
        });
        col.addView(share, Ui.lp(this, 10));
        Button again = Ui.outline(this, "⏺  Nouvel enregistrement");
        again.setOnClickListener(v -> { startActivity(new Intent(this, MainActivity.class)); finish(); });
        col.addView(again, Ui.lp(this, 10));
        Button del = Ui.outline(this, "🗑  Supprimer");
        del.setTextColor(Ui.RED);
        del.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setMessage("Supprimer cette vidéo du téléphone ?")
                .setPositiveButton("Supprimer", (d, w) -> {
                    try { getContentResolver().delete(uri, null, null); Toast.makeText(this, "Vidéo supprimée", Toast.LENGTH_SHORT).show(); finish(); }
                    catch (Exception e) { Toast.makeText(this, "Supprimez-la depuis la galerie", Toast.LENGTH_LONG).show(); }
                })
                .setNegativeButton("Annuler", null).show());
        col.addView(del, Ui.lp(this, 10));
        setContentView(sv);

        if (getIntent().getBooleanExtra("send", false)) send();
    }

    private void send() {
        if (!Api.loggedIn(this)) {
            new AlertDialog.Builder(this)
                    .setTitle("Connexion nécessaire")
                    .setMessage("Connectez-vous avec votre compte Magiscom Tech Desk pour envoyer la vidéo. Elle vous attend ici.")
                    .setPositiveButton("Se connecter", (d, w) -> {
                        Api.prefs(this).edit().putString("pending", uri.toString()).putBoolean("guest", false).apply();
                        startActivity(new Intent(this, MainActivity.class));
                        finish();
                    })
                    .setNegativeButton("Annuler", null).show();
            return;
        }
        Toast.makeText(this, "Chargement de vos demandes…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            List<String> labels = new ArrayList<>();
            List<String> ids = new ArrayList<>();
            labels.add("➕ Nouveau problème"); ids.add("");
            try {
                JSONArray ts = Api.call(this, "GET", "/api/tickets", null).getJSONArray("tickets");
                boolean admin = "admin".equals(Api.prefs(this).getString("role", ""));
                for (int i = 0; i < ts.length(); i++) {
                    JSONObject t = ts.getJSONObject(i);
                    if ("resolved".equals(t.optString("status")) && !admin) continue;
                    labels.add((admin ? t.optString("user_name") + " · " : "") + t.optString("subject"));
                    ids.add(t.getString("id"));
                }
            } catch (Exception e) {
                runOnUiThread(() -> {
                    Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
                    if (!Api.loggedIn(this)) send();
                });
                return;
            }
            runOnUiThread(() -> sendDialog(labels, ids));
        }).start();
    }

    private void sendDialog(List<String> labels, List<String> ids) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 20);
        box.setPadding(p, Ui.dp(this, 8), p, 0);
        box.addView(Ui.text(this, "Pour quelle demande ?", 14, Ui.MUTED, true));
        Spinner sp = new Spinner(this);
        sp.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
        box.addView(sp, Ui.lp(this, 4));
        EditText title = Ui.input(this, "Le problème en quelques mots", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        box.addView(title, Ui.lp(this, 10));
        EditText msg = Ui.input(this, "Message (facultatif)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        box.addView(msg, Ui.lp(this, 10));
        TextView note = Ui.text(this, "La vidéo part en arrière-plan : vous pouvez fermer l'application. Une notification indique la progression.", 13, Ui.MUTED, false);
        box.addView(note, Ui.lp(this, 10));
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> a, View v, int pos, long id) { title.setVisibility(pos == 0 ? View.VISIBLE : View.GONE); }
            @Override public void onNothingSelected(AdapterView<?> a) {}
        });
        new AlertDialog.Builder(this)
                .setTitle("Envoyer à Magiscom Tech")
                .setView(box)
                .setPositiveButton("Envoyer", (d, w) -> {
                    int pos = sp.getSelectedItemPosition();
                    Intent up = new Intent(this, UploadService.class).setData(uri)
                            .putExtra("ticket", ids.get(Math.max(0, pos)))
                            .putExtra("title", title.getText().toString())
                            .putExtra("message", msg.getText().toString())
                            .putExtra("secs", secs)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startForegroundService(up);
                    Toast.makeText(this, "Envoi en cours… suivez la notification", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Annuler", null)
                .show();
    }
}
