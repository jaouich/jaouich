package app.rekordo;

import android.graphics.ColorMatrix;

/** Filtres et réglages d'image, partagés par l'aperçu (ColorMatrix) et l'export (OpenGL). */
final class Look {
    static final int NONE = 0, BW = 1, SEPIA = 2, VIVID = 3, WARM = 4, COOL = 5, FADE = 6, NOIR = 7, VINTAGE = 8;
    static final int COUNT = 9;

    int filter;
    int brightness;   // -100..100
    int contrast;     // -100..100
    int saturation;   // -100..100

    boolean isNeutral() { return filter == NONE && brightness == 0 && contrast == 0 && saturation == 0; }

    ColorMatrix matrix() {
        ColorMatrix m = new ColorMatrix();
        switch (filter) {
            case BW: m.setSaturation(0); break;
            case SEPIA: {
                m.setSaturation(0);
                ColorMatrix t = new ColorMatrix();
                t.setScale(1.07f, 0.92f, 0.72f, 1);
                m.postConcat(t);
                break;
            }
            case VIVID: m.setSaturation(1.6f); m.postConcat(contrastM(1.12f)); break;
            case WARM: m.setScale(1.08f, 1.0f, 0.86f, 1); break;
            case COOL: m.setScale(0.88f, 0.98f, 1.12f, 1); break;
            case FADE: m.setSaturation(0.75f); m.postConcat(contrastM(0.8f)); m.postConcat(offsetM(18)); break;
            case NOIR: m.setSaturation(0); m.postConcat(contrastM(1.45f)); break;
            case VINTAGE: {
                m.setSaturation(0.55f);
                ColorMatrix t = new ColorMatrix(); t.setScale(1.06f, 0.98f, 0.8f, 1);
                m.postConcat(t); m.postConcat(contrastM(0.9f)); m.postConcat(offsetM(10));
                break;
            }
        }
        if (saturation != 0) { ColorMatrix s = new ColorMatrix(); s.setSaturation(1 + saturation / 100f); m.postConcat(s); }
        if (contrast != 0) m.postConcat(contrastM(1 + contrast / 100f * (contrast > 0 ? 1f : 0.7f)));
        if (brightness != 0) m.postConcat(offsetM(brightness * 0.9f));
        return m;
    }

    private static ColorMatrix contrastM(float c) {
        float o = 128 * (1 - c);
        return new ColorMatrix(new float[]{c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0});
    }

    private static ColorMatrix offsetM(float v) {
        return new ColorMatrix(new float[]{1, 0, 0, 0, v, 0, 1, 0, 0, v, 0, 0, 1, 0, v, 0, 0, 0, 1, 0});
    }

    /** ColorMatrix (4x5, lignes, décalages 0..255) vers matrice OpenGL 4x4 (colonnes) + décalage 0..1. */
    static float[][] toGl(ColorMatrix cm) {
        float[] a = cm.getArray();
        float[] m = new float[16];
        float[] off = new float[4];
        for (int r = 0; r < 4; r++) {
            for (int c = 0; c < 4; c++) m[c * 4 + r] = a[r * 5 + c];
            off[r] = a[r * 5 + 4] / 255f;
        }
        // La 4e colonne multiplie l'alpha (=1) : on la remet à zéro, le décalage est séparé
        m[12] = m[13] = m[14] = 0; m[15] = 1;
        off[3] = 0;
        return new float[][]{m, off};
    }
}
