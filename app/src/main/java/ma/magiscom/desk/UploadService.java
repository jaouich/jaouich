package ma.magiscom.desk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.IBinder;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;

/**
 * Envoie une vidéo à Magiscom Tech Desk, en morceaux de 10 Mo (comme le site) :
 * pas de limite d'une heure, et un morceau raté est renvoyé automatiquement.
 * Tourne en arrière-plan avec une notification de progression.
 */
public class UploadService extends Service {
    private static final String CH = "upload";
    private static final int NID = 20;
    private static final int PART = 10 * 1024 * 1024;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getData() == null) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH, "Envoi des vidéos", NotificationManager.IMPORTANCE_LOW));
        startForeground(NID, progress(0, "Préparation de l'envoi…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        new Thread(() -> run(intent), "upload").start();
        return START_NOT_STICKY;
    }

    private void run(Intent in) {
        Uri uri = in.getData();
        String ticket = in.getStringExtra("ticket");
        String title = in.getStringExtra("title");
        String message = in.getStringExtra("message");
        long secs = in.getLongExtra("secs", 0);
        String uploadId = null;
        try {
            String name = "enregistrement-telephone.mp4";
            long size = 0;
            try (Cursor c = getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.Video.Media.DURATION}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    name = c.getString(0);
                    size = c.getLong(1);
                    if (secs == 0) secs = c.getLong(2) / 1000;
                }
            }
            if (size <= 0) throw new Exception("Vidéo introuvable");
            JSONObject up = Api.call(this, "POST", "/api/uploads/mp", new JSONObject().put("type", "video/mp4").put("name", name));
            uploadId = up.getJSONObject("upload").getString("id");
            byte[] buf = new byte[PART];
            JSONArray parts = new JSONArray();
            long sent = 0;
            int n = 0;
            try (InputStream is = getContentResolver().openInputStream(uri)) {
                while (true) {
                    int len = readFully(is, buf);
                    if (len <= 0) break;
                    n++;
                    JSONObject p = null;
                    for (int attempt = 1; ; attempt++) {
                        try { p = Api.putPart(this, uploadId, n, buf, len); break; }
                        catch (Exception e) {
                            if (attempt >= 5) throw e;
                            Thread.sleep(2000L * attempt);
                        }
                    }
                    parts.put(new JSONObject().put("part", n).put("etag", p.getString("etag")));
                    sent += len;
                    int pct = (int) (sent * 100 / size);
                    notify(progress(pct, "Envoi de la vidéo · " + pct + " % (" + Ui.size(sent) + " / " + Ui.size(size) + ")"));
                    if (len < PART) break;
                }
            }
            JSONObject done = Api.call(this, "POST", "/api/uploads/mp/" + uploadId + "/complete", new JSONObject().put("parts", parts));
            String attId = done.getJSONObject("attachment").getString("id");
            uploadId = null;
            String body = (message != null && !message.trim().isEmpty() ? message.trim() + "\n\n" : "") + "📱 Enregistrement de l'écran du téléphone · " + Ui.clock(secs);
            JSONArray atts = new JSONArray().put(attId);
            String tid;
            if (ticket == null || ticket.isEmpty()) {
                String subject = title != null && title.trim().length() >= 3 ? title.trim() : "Problème montré en vidéo";
                JSONObject t = Api.call(this, "POST", "/api/tickets", new JSONObject().put("subject", subject).put("category", "autre").put("body", body).put("attachments", atts));
                tid = t.getJSONObject("ticket").getString("id");
            } else {
                Api.call(this, "POST", "/api/tickets/" + ticket + "/messages", new JSONObject().put("body", body).put("attachments", atts));
                tid = ticket;
            }
            Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + "/#/t/" + tid));
            finish("✅ Vidéo envoyée à Magiscom Tech", "Touchez pour voir la demande", view);
        } catch (Exception e) {
            if (uploadId != null) {
                final String id = uploadId;
                try { Api.call(this, "POST", "/api/uploads/mp/" + id + "/abort", null); } catch (Exception ignored) {}
            }
            Intent app = new Intent(this, MainActivity.class);
            finish("Envoi échoué", e.getMessage() == null ? "Réessayez avec une meilleure connexion" : e.getMessage(), app);
        }
    }

    private static int readFully(InputStream in, byte[] b) throws java.io.IOException {
        int off = 0;
        while (off < b.length) {
            int r = in.read(b, off, b.length - off);
            if (r < 0) break;
            off += r;
        }
        return off;
    }

    private Notification progress(int pct, String text) {
        return new Notification.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_rec)
                .setContentTitle("Magiscom Desk")
                .setContentText(text)
                .setProgress(100, pct, pct == 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    private void notify(Notification n) { getSystemService(NotificationManager.class).notify(NID, n); }

    private void finish(String title, String text, Intent open) {
        stopForeground(STOP_FOREGROUND_REMOVE);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 21, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_rec)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        getSystemService(NotificationManager.class).notify(NID + 1, n);
        stopSelf();
    }
}
