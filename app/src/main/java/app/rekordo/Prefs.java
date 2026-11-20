package app.rekordo;

import android.content.Context;
import android.content.SharedPreferences;

/** Réglages de l'utilisateur. */
final class Prefs {
    static final int[] RES = {0, 1080, 720, 480};      // 0 = résolution de l'écran
    static final int[] FPS = {24, 30, 60};
    static final int[] COUNTDOWN = {0, 3, 5, 10};

    private final SharedPreferences p;
    Prefs(Context c) { p = c.getSharedPreferences("rekordo", Context.MODE_PRIVATE); }

    int res() { return p.getInt("res", 0); }
    int fps() { return p.getInt("fps", 1); }
    int quality() { return p.getInt("q", 1); }
    int audio() { return p.getInt("audio", 1); }          // 0 aucun, 1 micro, 2 interne, 3 les deux
    int countdown() { return p.getInt("cd", 1); }
    boolean bubble() { return p.getBoolean("bubble", true); }
    boolean facecam() { return p.getBoolean("face", false); }
    int camSize() { return p.getInt("camsize", 1); }
    boolean screenOff() { return p.getBoolean("screenoff", false); }
    boolean overlayAsked() { return p.getBoolean("overlayAsked", false); }

    void set(String k, int v) { p.edit().putInt(k, v).apply(); }
    void set(String k, boolean v) { p.edit().putBoolean(k, v).apply(); }

    boolean wantMic() { int a = audio(); return a == 1 || a == 3; }
    boolean wantInternal() { int a = audio(); return a == 2 || a == 3; }
}
