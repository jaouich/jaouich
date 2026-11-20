package app.rekordo;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Petits outils d'interface : couleurs, coins arrondis, marges système. */
final class Ui {
    static final int BG = 0xFF0E0F14, CARD = 0xFF1A1C24, CARD2 = 0xFF252833, TEXT = 0xFFF4F5F8, MUTED = 0xFF9CA1B0;
    static final int ACCENT = 0xFFFF3D5A, ACCENT2 = 0xFFB0179A;

    static int dp(Context c, float v) { return Math.round(v * c.getResources().getDisplayMetrics().density); }

    static GradientDrawable round(int color, float radiusPx) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radiusPx);
        return g;
    }

    static GradientDrawable grad(float radiusPx) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{ACCENT, ACCENT2});
        g.setCornerRadius(radiusPx);
        return g;
    }

    static void press(View v, android.graphics.drawable.Drawable bg) {
        v.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), bg, null));
        v.setClickable(true);
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    static TextView button(Context c, String s, boolean primary) {
        TextView b = text(c, s, 15, primary ? Color.WHITE : TEXT, true);
        b.setGravity(Gravity.CENTER);
        int p = dp(c, 12);
        b.setPadding(p + p / 2, p, p + p / 2, p);
        press(b, primary ? grad(dp(c, 14)) : round(CARD2, dp(c, 14)));
        return b;
    }

    static LinearLayout col(Context c) { LinearLayout l = new LinearLayout(c); l.setOrientation(LinearLayout.VERTICAL); return l; }
    static LinearLayout row(Context c) { LinearLayout l = new LinearLayout(c); l.setOrientation(LinearLayout.HORIZONTAL); l.setGravity(Gravity.CENTER_VERTICAL); return l; }

    static LinearLayout.LayoutParams lp(int w, int h) { return new LinearLayout.LayoutParams(w, h); }
    static LinearLayout.LayoutParams weight() { return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1); }

    /** Écran de bord à bord (Android 15) : marges pour la barre d'état et la barre de navigation. */
    static void edgeToEdge(Activity a, View root) {
        a.getWindow().setStatusBarColor(Color.TRANSPARENT);
        a.getWindow().setNavigationBarColor(Color.TRANSPARENT);
        a.getWindow().setDecorFitsSystemWindows(false);
        final int l = root.getPaddingLeft(), t = root.getPaddingTop(), r = root.getPaddingRight(), b = root.getPaddingBottom();
        root.setOnApplyWindowInsetsListener((v, in) -> {
            android.graphics.Insets s = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(l + s.left, t + s.top, r + s.right, b + s.bottom);
            return WindowInsets.CONSUMED;
        });
    }
}
