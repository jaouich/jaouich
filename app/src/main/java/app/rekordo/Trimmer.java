package app.rekordo;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.nio.ByteBuffer;

/** Couper une vidéo sans la ré-encoder (rapide, sans perte) : début calé sur l'image clé précédente. */
final class Trimmer {
    static Uri trim(Context c, Uri src, long startMs, long endMs) throws Exception {
        Uri dst = Store.newVideo(c, "Rekordo_" + Store.stamp() + "_cut.mp4");
        if (dst == null) throw new IllegalStateException("storage");
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mux = null;
        boolean ok = false;
        try (ParcelFileDescriptor out = c.getContentResolver().openFileDescriptor(dst, "rw")) {
            ex.setDataSource(c, src, null);
            mux = new MediaMuxer(out.getFileDescriptor(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int n = ex.getTrackCount();
            int[] map = new int[n];
            int maxSize = 1 << 20;
            int videoTrack = -1;
            for (int i = 0; i < n; i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime == null || !(mime.startsWith("video/") || mime.startsWith("audio/"))) { map[i] = -1; continue; }
                ex.selectTrack(i);
                map[i] = mux.addTrack(f);
                if (f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxSize = Math.max(maxSize, f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
                if (mime.startsWith("video/")) videoTrack = i;
            }
            try {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                r.setDataSource(c, src);
                String rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                r.release();
                if (rot != null) mux.setOrientationHint(Integer.parseInt(rot));
            } catch (Exception ignored) {}
            long startUs = startMs * 1000, endUs = endMs * 1000;
            ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long base = -1;
            if (videoTrack >= 0) base = ex.getSampleTime();
            mux.start();
            ByteBuffer buf = ByteBuffer.allocate(maxSize);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (true) {
                int t = ex.getSampleTrackIndex();
                if (t < 0) break;
                long pts = ex.getSampleTime();
                if (pts > endUs) {
                    // Continuer pour les autres pistes déjà en retard ; ici on s'arrête simplement
                    break;
                }
                if (base < 0) base = pts;
                int size = ex.readSampleData(buf, 0);
                if (size < 0) break;
                if (map[t] >= 0 && pts >= base) {
                    info.offset = 0;
                    info.size = size;
                    info.presentationTimeUs = pts - base;
                    info.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                    mux.writeSampleData(map[t], buf, info);
                }
                ex.advance();
            }
            mux.stop();
            ok = true;
        } finally {
            try { if (mux != null) mux.release(); } catch (Exception ignored) {}
            ex.release();
            if (ok) Store.publish(c, dst); else Store.discard(c, dst);
        }
        return dst;
    }
}
