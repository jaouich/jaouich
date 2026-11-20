package app.rekordo;

import android.media.MediaCodec;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.FileDescriptor;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/** Destination des images et du son encodés : fichier MP4, direct (RTMP), ou les deux. */
interface Sink {
    int addTrack(MediaFormat f, boolean video);
    void start();
    void write(int track, ByteBuffer b, MediaCodec.BufferInfo info);
    /** Renvoie true si la destination s'est bien terminée. */
    boolean stop();

    /** Fichier MP4. */
    final class Mp4 implements Sink {
        private final MediaMuxer m;
        private boolean started;
        Mp4(FileDescriptor fd) throws Exception { m = new MediaMuxer(fd, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4); }
        @Override public int addTrack(MediaFormat f, boolean video) { return m.addTrack(f); }
        @Override public void start() { m.start(); started = true; }
        @Override public void write(int t, ByteBuffer b, MediaCodec.BufferInfo i) { m.writeSampleData(t, b, i); }
        @Override public boolean stop() {
            boolean ok = true;
            try { if (started) m.stop(); } catch (Exception e) { ok = false; }
            try { m.release(); } catch (Exception ignored) {}
            return ok && started;
        }
    }

    /** Plusieurs destinations à la fois (direct + copie sur le téléphone). */
    final class Tee implements Sink {
        private final List<Sink> sinks = new ArrayList<>();
        private final List<int[]> map = new ArrayList<>();
        Tee(Sink... s) { for (Sink x : s) sinks.add(x); }
        @Override public int addTrack(MediaFormat f, boolean video) {
            int[] ids = new int[sinks.size()];
            for (int i = 0; i < ids.length; i++) ids[i] = sinks.get(i).addTrack(f, video);
            map.add(ids);
            return map.size() - 1;
        }
        @Override public void start() { for (Sink s : sinks) s.start(); }
        @Override public void write(int t, ByteBuffer b, MediaCodec.BufferInfo info) {
            int[] ids = map.get(t);
            int pos = b.position(), lim = b.limit();
            for (int i = 0; i < ids.length; i++) {
                b.position(pos); b.limit(lim);
                try { sinks.get(i).write(ids[i], b, info); } catch (Exception ignored) {}
            }
        }
        @Override public boolean stop() {
            boolean ok = false;
            for (Sink s : sinks) ok |= s.stop();
            return ok;
        }
    }
}
