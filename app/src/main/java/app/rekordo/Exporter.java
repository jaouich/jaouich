package app.rekordo;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.ParcelFileDescriptor;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Export d'une nouvelle vidéo : une ou plusieurs vidéos (fusion), coupées, filtrées, tournées,
 * accélérées ou ralenties, avec texte, compressées. Le son est recopié tel quel (sans perte)
 * quand la vitesse est normale et que le son n'est pas coupé.
 */
final class Exporter {
    interface Progress { void on(float fraction); }

    static final class Clip {
        final Uri uri; final long startUs, endUs;
        Clip(Uri uri, long startUs, long endUs) { this.uri = uri; this.startUs = startUs; this.endUs = endUs; }
    }

    static final class Spec {
        final List<Clip> clips = new ArrayList<>();
        Look look = new Look();
        int rotation;          // 0, 90, 180, 270
        float speed = 1f;      // 0.5, 1, 1.5, 2
        boolean mute;
        int maxShort;          // 0 = taille d'origine, sinon 720, 480, 360…
        int quality = 1;       // 0 économie, 1 standard, 2 haute
        String text;           // texte incrusté (facultatif)
        int textPos;           // 0 bas, 1 haut, 2 centre
        String suffix = "edit";
        int crop;              // 0 origine, 1 = 9:16, 2 = 1:1, 3 = 16:9, 4 = 4:5
        Uri music;             // musique de fond (facultatif)
        int musicVol = 80, origVol = 100;
    }

    static final float[] CROP_RATIO = {0, 9f / 16, 1f, 16f / 9, 4f / 5};

    /** Part gardée {largeur, hauteur} pour une image affichée cw x ch et un format donné. */
    static float[] cropKeep(int cw, int ch, int crop) {
        if (crop <= 0) return new float[]{1, 1};
        float r = CROP_RATIO[crop], cur = cw / (float) ch;
        return cur > r ? new float[]{r / cur, 1} : new float[]{1, cur / r};
    }

    private static HandlerThread cbThread;
    static synchronized Handler callbackHandler() {
        if (cbThread == null) { cbThread = new HandlerThread("rekordo-gl-cb"); cbThread.start(); }
        return new Handler(cbThread.getLooper());
    }

    private final Context c;
    private final Spec spec;
    private final Progress progress;
    private final AtomicBoolean cancel;

    private MediaCodec enc;
    private MediaMuxer mux;
    private int vTrack = -1, aTrack = -1;
    private boolean muxing, wantAudio;
    private MediaFormat audioFormat;
    private final MediaCodec.BufferInfo encInfo = new MediaCodec.BufferInfo();
    private long lastVideoPts = -1;

    Exporter(Context c, Spec spec, Progress p, AtomicBoolean cancel) {
        this.c = c; this.spec = spec; this.progress = p; this.cancel = cancel;
    }

    static final class Info { int w, h, rotation; long durationUs; boolean hasAudio; }

    static Info probe(Context c, Uri u) {
        Info i = new Info();
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(c, u);
            i.w = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            i.h = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            i.rotation = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            i.durationUs = parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)) * 1000L;
            i.hasAudio = "yes".equals(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO));
        } catch (Exception ignored) {
        } finally {
            try { r.release(); } catch (Exception ignored) {}
        }
        return i;
    }

    private static int parse(String s) { try { return s == null ? 0 : Integer.parseInt(s); } catch (Exception e) { return 0; } }

    /** Lance l'export (à appeler hors du fil principal). Renvoie la nouvelle vidéo. */
    Uri run() throws Exception {
        if (spec.clips.isEmpty()) throw new IllegalArgumentException("no clip");
        Info first = probe(c, spec.clips.get(0).uri);
        if (first.w <= 0 || first.h <= 0) throw new IllegalStateException("not a video");
        int rot = ((first.rotation + spec.rotation) % 360 + 360) % 360;
        int bw = first.w, bh = first.h;
        if (rot == 90 || rot == 270) { int t = bw; bw = bh; bh = t; }
        float[] keep0 = cropKeep(bw, bh, spec.crop);
        int[] out = outputSize(Math.round(bw * keep0[0]), Math.round(bh * keep0[1]));
        int W = out[0], H = out[1];

        Uri dst = Store.newVideo(c, "Rekordo_" + Store.stamp() + "_" + spec.suffix + ".mp4");
        if (dst == null) throw new IllegalStateException("storage");
        ParcelFileDescriptor pfd = null;
        Gl gl = null;
        boolean ok = false;
        try {
            if (spec.music != null) {
                long len = 0;
                for (Clip k : spec.clips) len += (long) ((k.endUs - k.startUs) / spec.speed);
                mixFile = AudioMix.render(c, spec, len, cancel);
            }
            pfd = c.getContentResolver().openFileDescriptor(dst, "rw");
            mux = new MediaMuxer(pfd.getFileDescriptor(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            prepareAudio();

            enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            MediaFormat vf = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, W, H);
            vf.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            vf.setInteger(MediaFormat.KEY_BIT_RATE, Engine.bitrateFor(W, H, 30, spec.quality));
            vf.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
            vf.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
            enc.configure(vf, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            gl = new Gl(enc.createInputSurface());
            enc.start();
            float[][] cm = Look.toGl(spec.look.matrix());
            gl.setColor(cm[0], cm[1]);
            gl.setOverlay(textBitmap(W, H));

            long total = 0;
            for (Clip k : spec.clips) total += Math.max(1, k.endUs - k.startUs);
            long done = 0, offsetUs = 0;
            List<long[]> audioPlan = new ArrayList<>();   // {indexClip, offsetUs}
            for (int i = 0; i < spec.clips.size(); i++) {
                Clip k = spec.clips.get(i);
                Info inf = i == 0 ? first : probe(c, k.uri);
                int r = ((inf.rotation + spec.rotation) % 360 + 360) % 360;
                gl.setRotation(r);
                int cw = inf.w, ch = inf.h;
                if (r == 90 || r == 270) { int t = cw; cw = ch; ch = t; }
                float[] keep = cropKeep(cw, ch, spec.crop);
                // la part gardée est exprimée dans l'image affichée ; la texture est dans l'image source
                if (r == 90 || r == 270) gl.setCrop(keep[1], keep[0]); else gl.setCrop(keep[0], keep[1]);
                int[] vp = fit(Math.round(cw * keep[0]), Math.round(ch * keep[1]), W, H);
                audioPlan.add(new long[]{i, offsetUs});
                final long base = done, tot = total;
                long used = decodeClip(k, gl, W, H, vp, offsetUs, f -> progress.on((base + f) / (float) tot));
                done += Math.max(1, k.endUs - k.startUs);
                offsetUs += used;
            }
            enc.signalEndOfInputStream();
            drain(true);
            if (!muxing) throw new IllegalStateException("no frames");
            if (aTrack >= 0) {
                if (mixFile != null) copyAudio(new Clip(Uri.fromFile(mixFile), 0, Long.MAX_VALUE / 4), 0);
                else for (long[] a : audioPlan) copyAudio(spec.clips.get((int) a[0]), a[1]);
            }
            mux.stop();
            ok = true;
            progress.on(1f);
        } finally {
            try { if (enc != null) { enc.stop(); enc.release(); } } catch (Exception ignored) {}
            if (gl != null) gl.release();
            try { if (mux != null) mux.release(); } catch (Exception ignored) {}
            try { if (pfd != null) pfd.close(); } catch (Exception ignored) {}
            if (ok) Store.publish(c, dst); else Store.discard(c, dst);
            if (mixFile != null) mixFile.delete();
        }
        return dst;
    }

    private int[] outputSize(int w, int h) {
        int shortSide = Math.min(w, h);
        if (spec.maxShort > 0 && shortSide > spec.maxShort) {
            double k = (double) spec.maxShort / shortSide;
            w = (int) Math.round(w * k); h = (int) Math.round(h * k);
        }
        w = Math.max(16, w / 16 * 16); h = Math.max(16, h / 16 * 16);   // multiples de 16 : acceptés par tous les encodeurs
        return new int[]{w, h};
    }

    /** Rectangle qui garde les proportions de l'image dans la sortie (bandes noires si besoin). */
    private static int[] fit(int cw, int ch, int W, int H) {
        double k = Math.min((double) W / cw, (double) H / ch);
        int vw = (int) Math.round(cw * k), vh = (int) Math.round(ch * k);
        if (Math.abs(vw - W) <= 2) vw = W;
        if (Math.abs(vh - H) <= 2) vh = H;
        return new int[]{(W - vw) / 2, (H - vh) / 2, vw, vh};
    }

    private java.io.File mixFile;

    private void prepareAudio() {
        if (mixFile != null) { audioFormat = audioFormatOf(Uri.fromFile(mixFile)); wantAudio = audioFormat != null; return; }
        wantAudio = !spec.mute && spec.speed == 1f;
        if (!wantAudio) return;
        for (Clip k : spec.clips) {
            MediaFormat f = audioFormatOf(k.uri);
            if (f != null) { audioFormat = f; break; }
        }
        if (audioFormat == null) wantAudio = false;
    }

    private MediaFormat audioFormatOf(Uri u) {
        MediaExtractor ex = new MediaExtractor();
        try {
            ex.setDataSource(c, u, null);
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) return f;
            }
        } catch (Exception ignored) {
        } finally { ex.release(); }
        return null;
    }

    private static boolean sameAudio(MediaFormat a, MediaFormat b) {
        try {
            return a.getString(MediaFormat.KEY_MIME).equals(b.getString(MediaFormat.KEY_MIME))
                    && a.getInteger(MediaFormat.KEY_SAMPLE_RATE) == b.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    && a.getInteger(MediaFormat.KEY_CHANNEL_COUNT) == b.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        } catch (Exception e) { return false; }
    }

    /** Décode une vidéo et envoie chaque image filtrée à l'encodeur. Renvoie la durée produite (µs). */
    private long decodeClip(Clip k, Gl gl, int W, int H, int[] vp, long offsetUs, Progress p) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaCodec dec = null;
        long produced = 0;
        try {
            ex.setDataSource(c, k.uri, null);
            int track = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("video/")) { track = i; fmt = f; break; }
            }
            if (track < 0) throw new IllegalStateException("no video track");
            ex.selectTrack(track);
            if (fmt.containsKey(MediaFormat.KEY_ROTATION)) fmt.setInteger(MediaFormat.KEY_ROTATION, 0);
            ex.seekTo(k.startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            dec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            dec.configure(fmt, gl.decoderSurface(), null, 0);
            dec.start();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inDone = false, outDone = false;
            long frameUs = 33_333, lastOut = -1;
            while (!outDone) {
                if (cancel.get()) throw new InterruptedException("cancelled");
                if (!inDone) {
                    int in = dec.dequeueInputBuffer(10_000);
                    if (in >= 0) {
                        ByteBuffer b = dec.getInputBuffer(in);
                        int n = ex.readSampleData(b, 0);
                        long t = ex.getSampleTime();
                        if (n < 0 || t > k.endUs + 100_000) {
                            dec.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            dec.queueInputBuffer(in, 0, n, t, 0);
                            ex.advance();
                        }
                    }
                }
                int idx = dec.dequeueOutputBuffer(info, 10_000);
                if (idx >= 0) {
                    boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    long t = info.presentationTimeUs;
                    boolean render = info.size > 0 && t >= k.startUs && t <= k.endUs;
                    dec.releaseOutputBuffer(idx, render);
                    if (render && gl.awaitFrame()) {
                        long rel = (long) ((t - k.startUs) / spec.speed);
                        long pts = offsetUs + rel;
                        if (pts <= lastVideoPts) pts = lastVideoPts + 1000;
                        lastVideoPts = pts;
                        gl.draw(W, H, vp[0], vp[1], vp[2], vp[3]);
                        gl.present(pts * 1000);
                        if (lastOut >= 0 && rel > lastOut) frameUs = Math.max(5_000, Math.min(100_000, rel - lastOut));
                        lastOut = rel;
                        produced = rel + frameUs;
                        drain(false);
                        p.on(Math.min(1f, (t - k.startUs) / (float) Math.max(1, k.endUs - k.startUs)) * Math.max(1, k.endUs - k.startUs));
                    }
                    if (eos || t > k.endUs) outDone = true;
                }
                drain(false);
            }
        } finally {
            try { if (dec != null) { dec.stop(); dec.release(); } } catch (Exception ignored) {}
            ex.release();
        }
        return produced;
    }

    private void drain(boolean end) {
        long until = System.currentTimeMillis() + (end ? 5000 : 0);
        while (true) {
            int idx = enc.dequeueOutputBuffer(encInfo, end ? 10_000 : 0);
            if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!end || System.currentTimeMillis() > until) return;
                continue;
            }
            if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                vTrack = mux.addTrack(enc.getOutputFormat());
                if (wantAudio) aTrack = mux.addTrack(audioFormat);
                mux.start();
                muxing = true;
                continue;
            }
            if (idx < 0) continue;
            ByteBuffer b = enc.getOutputBuffer(idx);
            if ((encInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) encInfo.size = 0;
            if (encInfo.size > 0 && muxing && b != null) {
                b.position(encInfo.offset);
                b.limit(encInfo.offset + encInfo.size);
                mux.writeSampleData(vTrack, b, encInfo);
            }
            boolean eos = (encInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
            enc.releaseOutputBuffer(idx, false);
            if (eos) return;
        }
    }

    private long lastAudioPts = -1;

    /** Recopie le son d'une vidéo (sans le ré-encoder), décalé à sa place dans la nouvelle vidéo. */
    private void copyAudio(Clip k, long offsetUs) {
        MediaExtractor ex = new MediaExtractor();
        try {
            ex.setDataSource(c, k.uri, null);
            int track = -1;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/") && sameAudio(f, audioFormat)) { track = i; break; }
            }
            if (track < 0) return;   // pas de son (ou format différent) : passage silencieux
            ex.selectTrack(track);
            ex.seekTo(k.startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            ByteBuffer buf = ByteBuffer.allocate(256 * 1024);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (true) {
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                long t = ex.getSampleTime();
                if (t > k.endUs) break;
                if (t >= k.startUs) {
                    long pts = offsetUs + (t - k.startUs);
                    if (pts <= lastAudioPts) pts = lastAudioPts + 1;
                    lastAudioPts = pts;
                    info.set(0, n, pts, MediaCodec.BUFFER_FLAG_KEY_FRAME);
                    mux.writeSampleData(aTrack, buf, info);
                }
                ex.advance();
            }
        } catch (Exception ignored) {
        } finally { ex.release(); }
    }

    /** Texte incrusté : blanc avec contour sombre, sur toute la largeur. */
    private Bitmap textBitmap(int W, int H) {
        if (spec.text == null || spec.text.trim().isEmpty()) return null;
        Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float size = Math.max(14, Math.min(W, H) * 0.065f);
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextSize(size);
        tp.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        int width = (int) (W * 0.9f);
        TextPaint stroke = new TextPaint(tp);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.16f);
        stroke.setColor(0xCC000000);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        tp.setColor(Color.WHITE);
        StaticLayout fill = StaticLayout.Builder.obtain(spec.text, 0, spec.text.length(), tp, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build();
        StaticLayout edge = StaticLayout.Builder.obtain(spec.text, 0, spec.text.length(), stroke, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build();
        float y = spec.textPos == 1 ? H * 0.06f : spec.textPos == 2 ? (H - fill.getHeight()) / 2f : H - fill.getHeight() - H * 0.07f;
        cv.save();
        cv.translate((W - width) / 2f, y);
        edge.draw(cv);
        fill.draw(cv);
        cv.restore();
        return b;
    }
}
