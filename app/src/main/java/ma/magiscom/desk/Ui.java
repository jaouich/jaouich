package ma.magiscom.desk;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Petits outils d'interface (sans bibliothèque externe). */
final class Ui {
    static final int BRAND = Color.parseColor("#0B4FD6");
    static final int DARK = Color.parseColor("#0A1F4D");
    static final int RED = Color.parseColor("#DC2626");
    static final int GREEN = Color.parseColor("#16A34A");
    static final int BG = Color.parseColor("#F4F6FB");
    static final int INK = Color.parseColor("#0E1A33");
    static final int MUTED = Color.parseColor("#5A6784");
    static final int LINE = Color.parseColor("#E1E6F0");

    private Ui() {}

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    static GradientDrawable round(int color, float radiusPx) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radiusPx);
        return g;
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    static Button button(Context c, String s, int bg, int fg) {
        Button b = new Button(c);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(fg);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setBackground(round(bg, dp(c, 14)));
        b.setStateListAnimator(null);
        b.setPadding(dp(c, 16), dp(c, 14), dp(c, 16), dp(c, 14));
        b.setGravity(Gravity.CENTER);
        return b;
    }

    static Button outline(Context c, String s) {
        Button b = button(c, s, Color.WHITE, INK);
        GradientDrawable g = round(Color.WHITE, dp(c, 14));
        g.setStroke(dp(c, 1), LINE);
        b.setBackground(g);
        return b;
    }

    static LinearLayout card(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable g = round(Color.WHITE, dp(c, 18));
        g.setStroke(dp(c, 1), LINE);
        l.setBackground(g);
        int p = dp(c, 16);
        l.setPadding(p, p, p, p);
        return l;
    }

    static EditText input(Context c, String hint, int type) {
        EditText e = new EditText(c);
        e.setHint(hint);
        e.setInputType(type);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setTextColor(INK);
        e.setHintTextColor(Color.parseColor("#94A0B8"));
        GradientDrawable g = round(Color.parseColor("#F1F4F9"), dp(c, 12));
        g.setStroke(dp(c, 1), LINE);
        e.setBackground(g);
        e.setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 12));
        if (type == (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE)) { e.setMinLines(3); e.setGravity(Gravity.TOP); }
        return e;
    }

    static LinearLayout.LayoutParams lp(Context c, int topDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(c, topDp);
        return p;
    }

    static String clock(long secs) {
        long h = secs / 3600, m = (secs % 3600) / 60, s = secs % 60;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, s) : String.format(java.util.Locale.ROOT, "%d:%02d", m, s);
    }

    static String size(long b) {
        if (b < 1024 * 1024) return Math.max(1, b / 1024) + " Ko";
        if (b < 1024L * 1024 * 1024) return String.format(java.util.Locale.FRANCE, "%.1f Mo", b / 1048576.0);
        return String.format(java.util.Locale.FRANCE, "%.2f Go", b / 1073741824.0);
    }
}
