package ma.magiscom.desk;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Appels à Magiscom Tech Desk (même API que le site). La session est gardée sous forme de cookie, jamais le mot de passe. */
public final class Api {
    public static final String BASE = "https://support.integrateurebp.com";

    public static final class ApiException extends Exception {
        public final int status;
        public ApiException(int status, String message) { super(message); this.status = status; }
    }

    private Api() {}

    public static SharedPreferences prefs(Context c) { return c.getSharedPreferences("desk", Context.MODE_PRIVATE); }
    public static String cookie(Context c) { return prefs(c).getString("cookie", null); }
    public static boolean loggedIn(Context c) { return cookie(c) != null; }

    public static void forget(Context c) {
        prefs(c).edit().remove("cookie").remove("name").remove("role").apply();
    }

    public static JSONObject call(Context c, String method, String path, JSONObject body) throws Exception {
        HttpURLConnection h = open(c, method, path);
        if (body != null) {
            byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json");
            h.setFixedLengthStreamingMode(b.length);
            try (OutputStream o = h.getOutputStream()) { o.write(b); }
        }
        return finish(c, h);
    }

    /** Un morceau d'une longue vidéo (envoi en plusieurs parties). */
    public static JSONObject putPart(Context c, String uploadId, int n, byte[] buf, int len) throws Exception {
        HttpURLConnection h = open(c, "PUT", "/api/uploads/mp/" + uploadId + "/" + n);
        h.setReadTimeout(180000);
        h.setDoOutput(true);
        h.setRequestProperty("Content-Type", "application/octet-stream");
        h.setFixedLengthStreamingMode(len);
        try (OutputStream o = h.getOutputStream()) { o.write(buf, 0, len); }
        return finish(c, h);
    }

    private static HttpURLConnection open(Context c, String method, String path) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(BASE + path).openConnection();
        h.setRequestMethod(method);
        h.setConnectTimeout(20000);
        h.setReadTimeout(60000);
        h.setUseCaches(false);
        h.setRequestProperty("X-Requested-With", "magisdesk");
        h.setRequestProperty("Accept", "application/json");
        h.setRequestProperty("User-Agent", "MagiscomDesk-Android/1.0");
        String ck = cookie(c);
        if (ck != null) h.setRequestProperty("Cookie", ck);
        return h;
    }

    private static JSONObject finish(Context c, HttpURLConnection h) throws Exception {
        int code;
        try { code = h.getResponseCode(); }
        catch (java.io.IOException e) { throw new ApiException(0, "Pas de connexion internet"); }
        // Cookie de session
        for (Map.Entry<String, List<String>> e : h.getHeaderFields().entrySet()) {
            if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String v : e.getValue()) {
                if (!v.startsWith("md_session=")) continue;
                String pair = v.split(";", 2)[0];
                if (pair.length() <= "md_session=".length() || v.contains("Max-Age=0")) prefs(c).edit().remove("cookie").apply();
                else prefs(c).edit().putString("cookie", pair).apply();
            }
        }
        InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
        String txt = "";
        if (in != null) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192]; int r;
            while ((r = in.read(b)) > 0) bo.write(b, 0, r);
            in.close();
            txt = bo.toString("UTF-8");
        }
        h.disconnect();
        JSONObject j;
        try { j = txt.isEmpty() ? new JSONObject() : new JSONObject(txt); } catch (Exception e) { j = new JSONObject(); }
        if (code == 401) forget(c);
        if (code >= 400) throw new ApiException(code, j.optString("error", "Erreur " + code));
        return j;
    }
}
