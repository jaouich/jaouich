package app.rekordo;

import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.MediaStore;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Export d'un passage de vidéo en GIF animé (10 images/s, 15 s au plus), avec filtre, recadrage et texte. */
final class Gif {
    static final int FPS = 10;
    static final long MAX_US = 15_000_000;

    static Uri export(Context c, Uri video, long startUs, long endUs, Exporter.Spec spec, Exporter.Progress progress, AtomicBoolean cancel) throws Exception {
        if (endUs - startUs > MAX_US) endUs = startUs + MAX_US;
        Exporter.Info info = Exporter.probe(c, video);
        int rot = ((info.rotation + spec.rotation) % 360 + 360) % 360;
        int dw = info.w, dh = info.h;
        if (rot % 180 != 0) { int t = dw; dw = dh; dh = t; }
        float[] keep = Exporter.cropKeep(dw, dh, spec.crop);
        float cw = dw * keep[0], ch = dh * keep[1];
        float k = Math.min(1f, Math.min(480f / Math.max(cw, ch), 360f / Math.min(cw, ch)));
        int W = Math.max(2, Math.round(cw * k)), H = Math.max(2, Math.round(ch * k));

        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, "Rekordo_" + Store.stamp() + ".gif");
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/gif");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, Store.PDIR);
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri dst = c.getContentResolver().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
        if (dst == null) throw new IllegalStateException("storage");

        MediaMetadataRetriever r = new MediaMetadataRetriever();
        boolean ok = false;
        try (OutputStream os = new BufferedOutputStream(c.getContentResolver().openOutputStream(dst), 1 << 16)) {
            r.setDataSource(c, video);
            Writer gw = new Writer(os, W, H);
            Bitmap frame = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(frame);
            Paint p = new Paint(Paint.FILTER_BITMAP_FLAG);
            p.setColorFilter(new ColorMatrixColorFilter(spec.look.matrix()));
            int[] px = new int[W * H];
            byte[] idx = new byte[W * H];
            long step = 1_000_000 / FPS;
            int n = (int) Math.max(1, (endUs - startUs) / step);
            // taille de l'image source affichée à l'échelle de sortie
            float scale = W / cw;
            for (int i = 0; i < n; i++) {
                if (cancel.get()) throw new InterruptedException("cancelled");
                long t = startUs + i * step;
                Bitmap src = r.getScaledFrameAtTime(t, MediaMetadataRetriever.OPTION_CLOSEST, Math.round(info.w * scale) + 2, Math.round(info.h * scale) + 2);
                if (src == null) continue;
                cv.drawColor(Color.BLACK);
                Matrix m = new Matrix();
                m.postTranslate(-src.getWidth() / 2f, -src.getHeight() / 2f);
                m.postRotate(rot);
                float sx = (dw * scale) / (rot % 180 == 0 ? src.getWidth() : src.getHeight());
                m.postScale(sx, sx);
                m.postTranslate(W / 2f, H / 2f);
                cv.drawBitmap(src, m, p);
                src.recycle();
                drawText(cv, spec, W, H);
                frame.getPixels(px, 0, W, 0, 0, W, H);
                quantize(px, idx, W, H);
                gw.frame(idx, 100 / FPS);
                progress.on((i + 1) / (float) n);
            }
            gw.finish();
            ok = true;
        } finally {
            try { r.release(); } catch (Exception ignored) {}
            if (ok) Store.publish(c, dst); else Store.discard(c, dst);
        }
        return dst;
    }

    private static void drawText(Canvas cv, Exporter.Spec spec, int W, int H) {
        if (spec.text == null || spec.text.trim().isEmpty()) return;
        float size = Math.max(10, Math.min(W, H) * 0.075f);
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextSize(size);
        tp.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        TextPaint st = new TextPaint(tp);
        st.setStyle(Paint.Style.STROKE); st.setStrokeWidth(size * 0.16f); st.setColor(Color.BLACK); st.setStrokeJoin(Paint.Join.ROUND);
        tp.setColor(Color.WHITE);
        int width = (int) (W * 0.9f);
        StaticLayout a = StaticLayout.Builder.obtain(spec.text, 0, spec.text.length(), st, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build();
        StaticLayout b = StaticLayout.Builder.obtain(spec.text, 0, spec.text.length(), tp, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build();
        float y = spec.textPos == 1 ? H * 0.05f : spec.textPos == 2 ? (H - b.getHeight()) / 2f : H - b.getHeight() - H * 0.06f;
        cv.save(); cv.translate((W - width) / 2f, y); a.draw(cv); b.draw(cv); cv.restore();
    }

    // Palette fixe 6 x 7 x 6 (252 couleurs) + tramage ordonné : rapide et sans scintillement d'une image à l'autre
    private static final int[] BAYER = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};

    private static void quantize(int[] px, byte[] out, int w, int h) {
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int c = px[y * w + x];
                float d = (BAYER[(y & 3) * 4 + (x & 3)] / 16f) - 0.47f;
                int r = q((c >> 16) & 0xFF, 5, d), g = q((c >> 8) & 0xFF, 6, d), b = q(c & 0xFF, 5, d);
                out[y * w + x] = (byte) (r * 42 + g * 6 + b);
            }
        }
    }

    private static int q(int v, int levels, float d) {
        int r = Math.round(v * levels / 255f + d);
        return Math.max(0, Math.min(levels, r));
    }

    static final class Writer {
        private final OutputStream o;
        private final int w, h;

        Writer(OutputStream o, int w, int h) throws IOException {
            this.o = o; this.w = w; this.h = h;
            o.write("GIF89a".getBytes());
            le(w); le(h);
            o.write(0xF7);  // table globale, 8 bits, 256 couleurs
            o.write(0); o.write(0);
            for (int i = 0; i < 256; i++) {
                if (i < 252) {
                    int r = i / 42, g = (i / 6) % 7, b = i % 6;
                    o.write(r * 255 / 5); o.write(g * 255 / 6); o.write(b * 255 / 5);
                } else { o.write(0); o.write(0); o.write(0); }
            }
            // boucle infinie
            o.write(new byte[]{0x21, (byte) 0xFF, 0x0B});
            o.write("NETSCAPE2.0".getBytes());
            o.write(new byte[]{3, 1, 0, 0, 0});
        }

        void frame(byte[] idx, int delayCs) throws IOException {
            o.write(new byte[]{0x21, (byte) 0xF9, 4, 0x04});
            le(delayCs);
            o.write(0); o.write(0);
            o.write(0x2C); le(0); le(0); le(w); le(h); o.write(0);
            o.write(8);
            new Lzw(idx).encode(o);
            o.write(0);
        }

        void finish() throws IOException { o.write(0x3B); o.flush(); }

        private void le(int v) throws IOException { o.write(v & 0xFF); o.write((v >> 8) & 0xFF); }
    }

    /** Compression LZW du format GIF (code de départ 8 bits, codes jusqu'à 12 bits). */
    static final class Lzw {
        private static final int HSIZE = 5003, MAXBITS = 12, MAXMAX = 1 << MAXBITS;
        private final byte[] pix;
        private final int[] htab = new int[HSIZE], codetab = new int[HSIZE];
        private int nBits, maxcode, freeEnt, clearCode, eofCode, curAccum, curBits, aCount;
        private boolean clearFlg;
        private final byte[] accum = new byte[256];
        private OutputStream out;

        Lzw(byte[] pix) { this.pix = pix; }

        void encode(OutputStream os) throws IOException {
            out = os;
            int initBits = 9;
            nBits = initBits; maxcode = (1 << nBits) - 1;
            clearCode = 1 << 8; eofCode = clearCode + 1; freeEnt = clearCode + 2;
            clearFlg = false; aCount = 0; curAccum = 0; curBits = 0;
            java.util.Arrays.fill(htab, -1);
            int i = 0;
            int ent = pix[i++] & 0xFF;
            output(clearCode);
            outer:
            while (i < pix.length) {
                int c = pix[i++] & 0xFF;
                int fcode = (c << MAXBITS) + ent;
                int h = (c << 4) ^ ent;
                if (htab[h] == fcode) { ent = codetab[h]; continue; }
                if (htab[h] >= 0) {
                    int disp = h == 0 ? 1 : HSIZE - h;
                    do {
                        h -= disp;
                        if (h < 0) h += HSIZE;
                        if (htab[h] == fcode) { ent = codetab[h]; continue outer; }
                    } while (htab[h] >= 0);
                }
                output(ent);
                ent = c;
                if (freeEnt < MAXMAX) { codetab[h] = freeEnt++; htab[h] = fcode; }
                else { java.util.Arrays.fill(htab, -1); freeEnt = clearCode + 2; clearFlg = true; output(clearCode); }
            }
            output(ent);
            output(eofCode);
        }

        private void output(int code) throws IOException {
            curAccum &= (1 << curBits) - 1;
            curAccum = curBits > 0 ? curAccum | (code << curBits) : code;
            curBits += nBits;
            while (curBits >= 8) { add((byte) curAccum); curAccum >>= 8; curBits -= 8; }
            if (freeEnt > maxcode || clearFlg) {
                if (clearFlg) { nBits = 9; maxcode = (1 << nBits) - 1; clearFlg = false; }
                else { nBits++; maxcode = nBits == MAXBITS ? MAXMAX : (1 << nBits) - 1; }
            }
            if (code == eofCode) {
                while (curBits > 0) { add((byte) curAccum); curAccum >>= 8; curBits -= 8; }
                flush();
            }
        }

        private void add(byte b) throws IOException { accum[aCount++] = b; if (aCount >= 254) flush(); }
        private void flush() throws IOException { if (aCount > 0) { out.write(aCount); out.write(accum, 0, aCount); aCount = 0; } }
    }
}
