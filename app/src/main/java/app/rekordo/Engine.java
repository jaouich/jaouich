package app.rekordo;

import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Range;
import android.view.Surface;

import java.io.FileDescriptor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Moteur d'enregistrement : écran (H.264) + son (AAC) mélangé à partir du micro et/ou du son
 * interne du téléphone (Android 10+), écrits dans un MP4. Gère la pause et les captures d'écran
 * pendant l'enregistrement. Une seule surface virtuelle par autorisation (règle d'Android 14).
 */
final class Engine {
    interface ShotCallback { void done(Bitmap b); }

    static final int RATE = 44100;
    private static final int FRAME = 1024;

    private final MediaProjection projection;
    private final int dpi;
    private int width, height;
    private final int fps, bitrate;
    private final boolean wantMic, wantInternal;

    private MediaCodec venc, aenc;
    private Surface input;
    private VirtualDisplay display;
    private MediaMuxer muxer;
    private final Object lock = new Object();
    private int vTrack = -1, aTrack = -1;
    private boolean muxing, expectAudio;
    private long samples;
    private volatile boolean running, paused;
    private long pauseStartUs, pausedUs, lastV = -1, lastA = -1;
    private AudioRecord mic, internal;
    private Thread vThread, aThread;
    private HandlerThread shotThread;
    boolean internalOk, micOk;
    volatile Exception failure;

    Engine(MediaProjection p, int w, int h, int dpi, int fps, int bitrate, boolean mic, boolean internal) {
        this.projection = p; this.width = w; this.height = h; this.dpi = dpi; this.fps = fps; this.bitrate = bitrate;
        this.wantMic = mic; this.wantInternal = internal;
    }

    int width() { return width; }
    int height() { return height; }

    void start(FileDescriptor fd) throws Exception {
        venc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        fitToEncoder(venc.getCodecInfo().getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC).getVideoCapabilities());
        MediaFormat vf = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height);
        vf.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        vf.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        vf.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
        vf.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
        vf.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 1_000_000L / fps); // écran immobile : la vidéo continue
        venc.configure(vf, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        input = venc.createInputSurface();
        venc.start();
        muxer = new MediaMuxer(fd, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        setupAudio();
        display = projection.createVirtualDisplay("Rekordo", width, height, dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, input, null, null);
        running = true;
        vThread = new Thread(this::videoLoop, "rekordo-video");
        vThread.start();
        if (expectAudio) { aThread = new Thread(this::audioLoop, "rekordo-audio"); aThread.start(); }
    }

    /** Taille, débit et cadence acceptés par l'encodeur du téléphone. */
    private void fitToEncoder(MediaCodecInfo.VideoCapabilities caps) {
        if (caps == null) return;
        int w = width, h = height;
        for (int i = 0; i < 12 && !caps.isSizeSupported(w, h); i++) {
            w = Math.max(16, (int) (w * 0.9) / 16 * 16);
            h = Math.max(16, (int) (h * 0.9) / 16 * 16);
        }
        if (caps.isSizeSupported(w, h)) { width = w; height = h; }
        else { width = (width / 16) * 16; height = (height / 16) * 16; }
    }

    private void setupAudio() {
        AudioFormat fmt = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build();
        int buf = Math.max(AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT) * 4, FRAME * 8);
        if (wantMic) {
            try {
                mic = new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC).setAudioFormat(fmt).setBufferSizeInBytes(buf).build();
                if (mic.getState() != AudioRecord.STATE_INITIALIZED) { mic.release(); mic = null; }
            } catch (Exception e) { mic = null; }
        }
        if (wantInternal) {
            try {
                AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(projection)
                        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                        .addMatchingUsage(AudioAttributes.USAGE_GAME)
                        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build();
                internal = new AudioRecord.Builder().setAudioPlaybackCaptureConfig(cfg).setAudioFormat(fmt).setBufferSizeInBytes(buf).build();
                if (internal.getState() != AudioRecord.STATE_INITIALIZED) { internal.release(); internal = null; }
            } catch (Exception e) { internal = null; }
        }
        micOk = mic != null; internalOk = internal != null;
        expectAudio = micOk || internalOk;
        if (!expectAudio) return;
        try {
            MediaFormat af = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 1);
            af.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            af.setInteger(MediaFormat.KEY_BIT_RATE, 128000);
            af.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, FRAME * 2 * 4);
            aenc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
            aenc.configure(af, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            aenc.start();
        } catch (Exception e) {
            expectAudio = false;
            releaseAudio();
        }
    }

    // ---------- Vidéo ----------
    private void videoLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (true) {
                int idx = venc.dequeueOutputBuffer(info, 10_000);
                if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    synchronized (lock) { vTrack = muxer.addTrack(venc.getOutputFormat()); maybeStartMuxer(); }
                } else if (idx >= 0) {
                    ByteBuffer bb = venc.getOutputBuffer(idx);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
                    if (info.size > 0 && !paused && bb != null) {
                        long pts = info.presentationTimeUs - pausedUs;
                        if (pts <= lastV) pts = lastV + 1;
                        info.presentationTimeUs = pts;
                        if (write(vTrack, bb, info)) lastV = pts;
                    }
                    boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    venc.releaseOutputBuffer(idx, false);
                    if (eos) break;
                } else if (!running && idx == MediaCodec.INFO_TRY_AGAIN_LATER && eosSent && ++eosWait > 200) break;
            }
        } catch (Exception e) { if (failure == null) failure = e; }
    }
    private volatile boolean eosSent;
    private int eosWait;

    // ---------- Son : micro + son interne mélangés ----------
    private void audioLoop() {
        short[] a = new short[FRAME], b = new short[FRAME], mix = new short[FRAME];
        ByteBuffer bytes = ByteBuffer.allocateDirect(FRAME * 2).order(ByteOrder.LITTLE_ENDIAN);
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            if (mic != null) mic.startRecording();
            if (internal != null) internal.startRecording();
            AudioRecord primary = mic != null ? mic : internal;
            AudioRecord secondary = mic != null ? internal : null;
            while (running) {
                int n = primary.read(a, 0, FRAME, AudioRecord.READ_BLOCKING);
                if (n <= 0) continue;
                int m = 0;
                if (secondary != null) { m = secondary.read(b, 0, n, AudioRecord.READ_NON_BLOCKING); if (m < 0) m = 0; }
                for (int i = 0; i < n; i++) {
                    int s = a[i] + (i < m ? b[i] : 0);
                    mix[i] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, s));
                }
                if (paused) { drainAudio(info); continue; }
                long pts = System.nanoTime() / 1000 - pausedUs - (n * 1_000_000L / RATE);
                if (pts <= lastA) pts = lastA + 1;
                lastA = pts;
                int in = aenc.dequeueInputBuffer(10_000);
                if (in >= 0) {
                    ByteBuffer ib = aenc.getInputBuffer(in);
                    ib.clear();
                    bytes.clear(); bytes.asShortBuffer().put(mix, 0, n);
                    bytes.limit(n * 2);
                    ib.put(bytes);
                    aenc.queueInputBuffer(in, 0, n * 2, pts, 0);
                    samples += n;
                }
                drainAudio(info);
            }
            int in = aenc.dequeueInputBuffer(10_000);
            if (in >= 0) aenc.queueInputBuffer(in, 0, 0, lastA + 1, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            for (int i = 0; i < 100; i++) { if (drainAudio(info)) break; }
        } catch (Exception e) { if (failure == null) failure = e; }
    }

    private boolean drainAudio(MediaCodec.BufferInfo info) {
        while (true) {
            int idx = aenc.dequeueOutputBuffer(info, 5_000);
            if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) return false;
            if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                synchronized (lock) { aTrack = muxer.addTrack(aenc.getOutputFormat()); maybeStartMuxer(); }
                continue;
            }
            if (idx < 0) continue;
            ByteBuffer bb = aenc.getOutputBuffer(idx);
            if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
            if (info.size > 0 && bb != null) write(aTrack, bb, info);
            boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
            aenc.releaseOutputBuffer(idx, false);
            if (eos) return true;
        }
    }

    private void maybeStartMuxer() {
        if (muxing || vTrack < 0 || (expectAudio && aTrack < 0)) return;
        muxer.start();
        muxing = true;
        requestKeyFrame();
    }

    private boolean write(int track, ByteBuffer bb, MediaCodec.BufferInfo info) {
        synchronized (lock) {
            if (!muxing || track < 0) return false;
            bb.position(info.offset);
            bb.limit(info.offset + info.size);
            muxer.writeSampleData(track, bb, info);
            if (track == vTrack) wroteVideo = true;
            return true;
        }
    }
    private boolean wroteVideo;

    private void requestKeyFrame() {
        try { Bundle p = new Bundle(); p.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0); venc.setParameters(p); } catch (Exception ignored) {}
    }

    void pause() { if (!paused) { pauseStartUs = System.nanoTime() / 1000; paused = true; } }
    void resume() { if (paused) { pausedUs += System.nanoTime() / 1000 - pauseStartUs; paused = false; requestKeyFrame(); } }
    boolean isPaused() { return paused; }

    /** Capture d'écran pendant l'enregistrement : la surface est prêtée un instant à un ImageReader. */
    void screenshot(ShotCallback cb) {
        if (display == null) return;
        if (shotThread == null) { shotThread = new HandlerThread("rekordo-shot"); shotThread.start(); }
        Handler h = new Handler(shotThread.getLooper());
        ImageReader r = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        final boolean[] done = {false};
        r.setOnImageAvailableListener(rr -> {
            if (done[0]) return;
            Image img = rr.acquireLatestImage();
            if (img == null) return;
            done[0] = true;
            Bitmap bmp = toBitmap(img, width, height);
            img.close();
            try { display.setSurface(input); } catch (Exception ignored) {}
            rr.close();
            cb.done(bmp);
        }, h);
        display.setSurface(r.getSurface());
        h.postDelayed(() -> { if (!done[0]) { done[0] = true; try { display.setSurface(input); } catch (Exception ignored) {} r.close(); cb.done(null); } }, 2000);
    }

    static Bitmap toBitmap(Image img, int w, int h) {
        Image.Plane p = img.getPlanes()[0];
        ByteBuffer buf = p.getBuffer();
        int ps = p.getPixelStride(), rs = p.getRowStride();
        Bitmap full = Bitmap.createBitmap(rs / ps, h, Bitmap.Config.ARGB_8888);
        full.copyPixelsFromBuffer(buf);
        if (full.getWidth() == w) return full;
        Bitmap b = Bitmap.createBitmap(full, 0, 0, w, h);
        full.recycle();
        return b;
    }

    /** Arrête et finalise le MP4. Renvoie true si une vidéo valide a été écrite. */
    boolean stop() {
        running = false;
        if (paused) resume();
        try { venc.signalEndOfInputStream(); } catch (Exception ignored) {}
        eosSent = true;
        try { if (aThread != null) aThread.join(4000); } catch (InterruptedException ignored) {}
        try { if (vThread != null) vThread.join(4000); } catch (InterruptedException ignored) {}
        boolean ok;
        synchronized (lock) {
            ok = muxing && wroteVideo;
            try { if (muxing) muxer.stop(); } catch (Exception e) { ok = false; }
            try { muxer.release(); } catch (Exception ignored) {}
        }
        try { if (display != null) display.release(); } catch (Exception ignored) {}
        try { venc.stop(); } catch (Exception ignored) {}
        try { venc.release(); } catch (Exception ignored) {}
        try { if (input != null) input.release(); } catch (Exception ignored) {}
        try { if (aenc != null) { aenc.stop(); aenc.release(); } } catch (Exception ignored) {}
        releaseAudio();
        if (shotThread != null) shotThread.quitSafely();
        return ok;
    }

    private void releaseAudio() {
        try { if (mic != null) { mic.stop(); } } catch (Exception ignored) {}
        try { if (mic != null) mic.release(); } catch (Exception ignored) {}
        try { if (internal != null) { internal.stop(); } } catch (Exception ignored) {}
        try { if (internal != null) internal.release(); } catch (Exception ignored) {}
        mic = null; internal = null;
    }

    static int bitrateFor(int w, int h, int fps, int quality) {
        double bpp = quality == 2 ? 0.14 : quality == 0 ? 0.05 : 0.09;   // bits par pixel
        return (int) Math.max(1_000_000, Math.min(20_000_000, w * (double) h * fps * bpp));
    }

    @SuppressWarnings("unused")
    private static int clamp(Range<Integer> r, int v) { return r == null ? v : Math.max(r.getLower(), Math.min(r.getUpper(), v)); }
}
