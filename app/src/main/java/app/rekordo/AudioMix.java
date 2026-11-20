package app.rekordo;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Prépare la bande son d'une vidéo avec musique : le son d'origine (si gardé) mélangé à la musique
 * (répétée si elle est plus courte), fondu à la fin, encodé en AAC stéréo dans un fichier temporaire.
 */
final class AudioMix {
    static final int RATE = 44100, FRAME = 1024;

    static File render(Context c, Exporter.Spec spec, long lenUs, AtomicBoolean cancel) throws Exception {
        File f = new File(c.getCacheDir(), "mix_" + System.nanoTime() + ".m4a");
        MediaFormat fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 2);
        fmt.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        fmt.setInteger(MediaFormat.KEY_BIT_RATE, 160_000);
        fmt.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, FRAME * 4 * 2);
        MediaCodec enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        enc.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        enc.start();
        MediaMuxer mux = new MediaMuxer(f.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int[] track = {-1};
        boolean keepOrig = !spec.mute && spec.speed == 1f && spec.origVol > 0;
        float ov = spec.origVol / 100f, mv = spec.musicVol / 100f;
        Pcm music = new Pcm(c, spec.music, 0, Long.MAX_VALUE, true);
        Pcm orig = null;
        int clip = -1;
        long clipEnd = 0;   // en échantillons de sortie
        long total = lenUs * RATE / 1_000_000, done = 0;
        long fade = Math.min(RATE * 2L, total / 4);
        float[] a = new float[FRAME * 2], m = new float[FRAME * 2];
        short[] mix = new short[FRAME * 2];
        ByteBuffer bytes = ByteBuffer.allocateDirect(FRAME * 4).order(ByteOrder.LITTLE_ENDIAN);
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean ok = false;
        try {
            while (done < total) {
                if (cancel.get()) throw new InterruptedException("cancelled");
                int n = (int) Math.min(FRAME, total - done);
                // Son d'origine : vidéo après vidéo
                java.util.Arrays.fill(a, 0);
                if (keepOrig) {
                    int filled = 0;
                    while (filled < n) {
                        if (done + filled >= clipEnd) {
                            if (orig != null) orig.release();
                            orig = null;
                            clip++;
                            if (clip >= spec.clips.size()) break;
                            Exporter.Clip k = spec.clips.get(clip);
                            clipEnd += (k.endUs - k.startUs) * RATE / 1_000_000;
                            try { orig = new Pcm(c, k.uri, k.startUs, k.endUs, false); } catch (Exception e) { orig = null; }
                        }
                        int want = (int) Math.min(n - filled, clipEnd - (done + filled));
                        if (orig != null) orig.read(a, filled, want);
                        filled += want;
                    }
                }
                music.read(m, 0, n);
                for (int i = 0; i < n; i++) {
                    long s = done + i;
                    float g = s > total - fade ? (total - s) / (float) fade : 1f;
                    for (int ch = 0; ch < 2; ch++) {
                        float v = a[i * 2 + ch] * ov + m[i * 2 + ch] * mv * g;
                        v = Math.max(-1f, Math.min(1f, v));
                        mix[i * 2 + ch] = (short) (v * 32767);
                    }
                }
                int in = enc.dequeueInputBuffer(10_000);
                while (in < 0) { drain(enc, mux, track, info, false); in = enc.dequeueInputBuffer(10_000); }
                ByteBuffer ib = enc.getInputBuffer(in);
                ib.clear();
                bytes.clear();
                bytes.asShortBuffer().put(mix, 0, n * 2);
                bytes.limit(n * 4);
                ib.put(bytes);
                enc.queueInputBuffer(in, 0, n * 4, done * 1_000_000 / RATE, 0);
                done += n;
                drain(enc, mux, track, info, false);
            }
            int in = enc.dequeueInputBuffer(10_000);
            while (in < 0) { drain(enc, mux, track, info, false); in = enc.dequeueInputBuffer(10_000); }
            enc.queueInputBuffer(in, 0, 0, done * 1_000_000 / RATE, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            drain(enc, mux, track, info, true);
            if (track[0] >= 0) mux.stop();
            ok = track[0] >= 0;
        } finally {
            music.release();
            if (orig != null) orig.release();
            try { enc.stop(); enc.release(); } catch (Exception ignored) {}
            try { mux.release(); } catch (Exception ignored) {}
            if (!ok) f.delete();
        }
        return ok ? f : null;
    }

    private static void drain(MediaCodec enc, MediaMuxer mux, int[] track, MediaCodec.BufferInfo info, boolean end) {
        long until = System.currentTimeMillis() + 5000;
        while (true) {
            int idx = enc.dequeueOutputBuffer(info, end ? 10_000 : 0);
            if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!end || System.currentTimeMillis() > until) return; continue; }
            if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { track[0] = mux.addTrack(enc.getOutputFormat()); mux.start(); continue; }
            if (idx < 0) continue;
            ByteBuffer b = enc.getOutputBuffer(idx);
            if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
            if (info.size > 0 && track[0] >= 0 && b != null) {
                b.position(info.offset); b.limit(info.offset + info.size);
                mux.writeSampleData(track[0], b, info);
            }
            boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
            enc.releaseOutputBuffer(idx, false);
            if (eos) return;
        }
    }

    /** Lecture d'un son (n'importe quel format lisible par Android) en stéréo 44,1 kHz, nombres -1..1. */
    static final class Pcm {
        private final Context c;
        private final Uri uri;
        private final long startUs, endUs;
        private final boolean loop;
        private MediaExtractor ex;
        private MediaCodec dec;
        private int srcRate = RATE, srcCh = 2;
        private float[] buf = new float[0];   // stéréo, fréquence d'origine
        private int bufLen;                   // en trames
        private double pos;                   // position dans buf (trames)
        private boolean eos, failed;
        private long sinceOpen;
        private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

        Pcm(Context c, Uri uri, long startUs, long endUs, boolean loop) throws Exception {
            this.c = c; this.uri = uri; this.startUs = startUs; this.endUs = endUs; this.loop = loop;
            open();
        }

        private void open() throws Exception {
            ex = new MediaExtractor();
            ex.setDataSource(c, uri, null);
            int t = -1;
            MediaFormat f = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat x = ex.getTrackFormat(i);
                String mm = x.getString(MediaFormat.KEY_MIME);
                if (mm != null && mm.startsWith("audio/")) { t = i; f = x; break; }
            }
            if (t < 0) { ex.release(); ex = null; throw new IllegalStateException("no audio"); }
            ex.selectTrack(t);
            if (startUs > 0) ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            srcRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            srcCh = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            dec = MediaCodec.createDecoderByType(f.getString(MediaFormat.KEY_MIME));
            dec.configure(f, null, null, 0);
            dec.start();
            eos = false;
        }

        /** Remplit n trames stéréo à partir de out[off*2] (silence une fois la fin atteinte). */
        void read(float[] out, int off, int n) {
            double step = srcRate / (double) RATE;
            for (int i = 0; i < n; i++) {
                while (!failed && (int) pos + 1 >= bufLen && !finished()) decodeMore();
                int p = (int) pos;
                if (p + 1 >= bufLen) { out[(off + i) * 2] = 0; out[(off + i) * 2 + 1] = 0; continue; }
                float fr = (float) (pos - p);
                for (int ch = 0; ch < 2; ch++)
                    out[(off + i) * 2 + ch] = buf[p * 2 + ch] * (1 - fr) + buf[(p + 1) * 2 + ch] * fr;
                pos += step;
                if (pos > 65536) compact();
            }
        }

        private boolean finished() { return eos && !loop; }

        private void compact() {
            int drop = (int) pos - 1;
            if (drop <= 0) return;
            System.arraycopy(buf, drop * 2, buf, 0, (bufLen - drop) * 2);
            bufLen -= drop;
            pos -= drop;
        }

        private void decodeMore() {
            try {
                if (eos) {
                    if (!loop) return;
                    if (sinceOpen == 0) { failed = true; return; }   // fichier sans son lisible
                    release(); open(); sinceOpen = 0;   // musique répétée
                }
                int in = dec.dequeueInputBuffer(5_000);
                if (in >= 0) {
                    int n = ex.readSampleData(dec.getInputBuffer(in), 0);
                    long t = ex.getSampleTime();
                    if (n < 0 || t > endUs) dec.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                    else { dec.queueInputBuffer(in, 0, n, t, 0); ex.advance(); }
                }
                int idx = dec.dequeueOutputBuffer(info, 5_000);
                if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = dec.getOutputFormat();
                    srcRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    srcCh = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (idx >= 0) {
                    if (info.size > 0 && info.presentationTimeUs >= startUs) {
                        ByteBuffer b = dec.getOutputBuffer(idx);
                        b.position(info.offset); b.limit(info.offset + info.size);
                        ShortBuffer sb = b.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
                        int frames = sb.remaining() / Math.max(1, srcCh);
                        ensure(bufLen + frames);
                        for (int i = 0; i < frames; i++) {
                            float l = sb.get(i * srcCh) / 32768f;
                            float r = srcCh > 1 ? sb.get(i * srcCh + 1) / 32768f : l;
                            buf[(bufLen + i) * 2] = l;
                            buf[(bufLen + i) * 2 + 1] = r;
                        }
                        bufLen += frames;
                        sinceOpen += frames;
                    }
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) eos = true;
                    dec.releaseOutputBuffer(idx, false);
                }
            } catch (Exception e) {
                failed = true;
            }
        }

        private void ensure(int frames) {
            if (buf.length >= frames * 2) return;
            float[] n = new float[Math.max(frames * 2, buf.length * 2 + 8192)];
            System.arraycopy(buf, 0, n, 0, bufLen * 2);
            buf = n;
        }

        void release() {
            try { if (dec != null) { dec.stop(); dec.release(); } } catch (Exception ignored) {}
            try { if (ex != null) ex.release(); } catch (Exception ignored) {}
            dec = null; ex = null;
        }
    }
}
