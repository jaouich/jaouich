package app.rekordo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.List;

/**
 * Écran invisible qui prépare l'enregistrement : permissions (micro, caméra, notifications),
 * autorisation de la bulle, puis la fenêtre système « Commencer l'enregistrement ».
 */
public class CaptureActivity extends Activity {
    static final String EXTRA_MODE = "mode";
    static final String MODE_RECORD = "record", MODE_SHOT = "shot", MODE_LIVE = "live";
    private static final int REQ_PERMS = 1, REQ_PROJECTION = 2;

    private String mode;
    private Prefs prefs;
    private boolean waitingOverlay, launched;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        mode = getIntent().getStringExtra(EXTRA_MODE);
        if (mode == null) mode = MODE_RECORD;
        if (MODE_RECORD.equals(mode) && RecorderService.recording) {   // déjà en cours : on arrête
            RecorderService.send(this, RecorderService.ACTION_STOP);
            finish();
            return;
        }
        askPermissions();
    }

    private void askPermissions() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!MODE_SHOT.equals(mode)) {
            if (prefs.wantMic() && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.RECORD_AUDIO);
            if (prefs.wantInternal() && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                    && !need.contains(Manifest.permission.RECORD_AUDIO))
                need.add(Manifest.permission.RECORD_AUDIO);
            if (prefs.facecam() && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.CAMERA);
        }
        if (need.isEmpty()) checkOverlay();
        else requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        for (int i = 0; i < perms.length; i++) {
            if (res[i] == PackageManager.PERMISSION_GRANTED) continue;
            if (Manifest.permission.RECORD_AUDIO.equals(perms[i])) RecorderService.toast(this, getString(R.string.mic_denied));
            if (Manifest.permission.CAMERA.equals(perms[i])) RecorderService.toast(this, getString(R.string.cam_denied));
        }
        checkOverlay();
    }

    private void checkOverlay() {
        boolean need = !MODE_SHOT.equals(mode) && (prefs.bubble() || prefs.facecam()) && !Settings.canDrawOverlays(this);
        if (!need) { startProjection(); return; }
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.perm_overlay_title)
                .setMessage(R.string.perm_overlay_msg)
                .setCancelable(false)
                .setPositiveButton(R.string.allow, (d, w) -> {
                    waitingOverlay = true;
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) { waitingOverlay = false; startProjection(); }
                })
                .setNegativeButton(R.string.without_bubble, (d, w) -> startProjection())
                .show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (waitingOverlay) { waitingOverlay = false; startProjection(); }
    }

    private void startProjection() {
        if (launched) return;
        launched = true;
        MediaProjectionManager m = getSystemService(MediaProjectionManager.class);
        try {
            startActivityForResult(m.createScreenCaptureIntent(), REQ_PROJECTION);
        } catch (Exception e) {
            RecorderService.toast(this, getString(R.string.rec_failed, e.getMessage()));
            finish();
        }
    }

    @Override protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req, code, data);
        if (req == REQ_PROJECTION && code == RESULT_OK && data != null) {
            Intent i = new Intent(this, RecorderService.class)
                    .setAction(RecorderService.ACTION_START)
                    .putExtra(RecorderService.EXTRA_CODE, code)
                    .putExtra(RecorderService.EXTRA_DATA, data)
                    .putExtra(EXTRA_MODE, mode);
            startForegroundService(i);
            if (getIntent().getBooleanExtra("home", false)) {   // lancé depuis l'appli : on va à l'écran d'accueil
                try { startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
            }
        }
        finish();
    }

    // Pas de suite d'animations : l'écran disparaît tout de suite
    @Override public void finish() { super.finish(); overridePendingTransition(0, 0); }
}
