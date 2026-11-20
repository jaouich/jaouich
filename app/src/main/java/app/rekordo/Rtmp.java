package app.rekordo;

import android.media.MediaCodec;
import android.media.MediaFormat;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Direct en RTMP / RTMPS (YouTube, Facebook, Twitch, serveur perso) : connexion, poignée de main,
 * commandes AMF0, puis envoi de la vidéo H.264 et du son AAC au format FLV.
 * Si le réseau est lent, les images en retard sont abandonnées jusqu'à la prochaine image clé.
 */
final class Rtmp implements Sink {
    interface Listener { void onError(String msg); }

    private static final int CHUNK = 4096;
    private final String url, key;
    private final Listener listener;
    private Socket sock;
    private OutputStream out;
    private DataInputStream in;
    private int inChunk = 128, streamId = 1;
    private volatile boolean open;
    private final Object writeLock = new Object();
    private final Map<Integer, Integer> trackKind = new HashMap<>();   // 0 vidéo, 1 son
    private MediaFormat vFormat, aFormat;
    private final BlockingQueue<Packet> queue = new ArrayBlockingQueue<>(600);
    private Thread sender, reader;
    private volatile boolean dropUntilKey;
    private long baseUs = -1;
    private long bytesIn, lastAck, windowAck = 2_500_000;
    volatile long sentBytes;
    volatile int droppedFrames;
    private int w, h, fps;

    private static final class Packet { int type; long ts; byte[] data; boolean key; }

    Rtmp(String url, String key, int w, int h, int fps, Listener l) {
        this.url = url.trim(); this.key = key.trim(); this.w = w; this.h = h; this.fps = fps; this.listener = l;
    }

    // ---------------------------------------------------------------- connexion

    /** Se connecte et ouvre la diffusion (à appeler hors du fil principal). */
    void connect() throws IOException {
        String u = url;
        String streamName = key;
        URI uri = URI.create(u.replace(" ", ""));
        String scheme = uri.getScheme() == null ? "rtmp" : uri.getScheme().toLowerCase();
        boolean tls = scheme.equals("rtmps");
        if (!scheme.equals("rtmp") && !tls) throw new IOException("rtmp:// or rtmps:// expected");
        String host = uri.getHost();
        if (host == null) throw new IOException("bad server address");
        int port = uri.getPort() > 0 ? uri.getPort() : tls ? 443 : 1935;
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        while (path.startsWith("/")) path = path.substring(1);
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        String app = path;
        if (streamName.isEmpty()) {   // clé collée à la fin de l'adresse
            int i = path.lastIndexOf('/');
            if (i > 0) { streamName = path.substring(i + 1); app = path.substring(0, i); }
        }
        if (uri.getRawQuery() != null) app = app + "?" + uri.getRawQuery();
        String tcUrl = scheme + "://" + host + (uri.getPort() > 0 ? ":" + uri.getPort() : "") + "/" + app;

        Socket s;
        if (tls) {
            SSLSocket ss = (SSLSocket) SSLSocketFactory.getDefault().createSocket();
            ss.connect(new InetSocketAddress(host, port), 10_000);
            ss.startHandshake();
            s = ss;
        } else {
            s = new Socket();
            s.connect(new InetSocketAddress(host, port), 10_000);
        }
        s.setTcpNoDelay(true);
        s.setSoTimeout(15_000);
        sock = s;
        out = new BufferedOutputStream(s.getOutputStream(), 64 * 1024);
        in = new DataInputStream(new Counting(s.getInputStream()));
        handshake();

        sendRaw(2, 1, 0, 0, int32(CHUNK));                      // Set Chunk Size
        Map<String, Object> obj = new LinkedHashMap<>();
        obj.put("app", app);
        obj.put("type", "nonprivate");
        obj.put("flashVer", "FMLE/3.0 (compatible; Rekordo)");
        obj.put("swfUrl", tcUrl);
        obj.put("tcUrl", tcUrl);
        command("connect", 1, 0, obj);
        Object[] r = waitResult(1);
        if (r == null || !"_result".equals(r[0])) throw new IOException("server refused connection " + describe(r));
        command("releaseStream", 2, 0, null, streamName);
        command("FCPublish", 3, 0, null, streamName);
        command("createStream", 4, 0, null);
        r = waitResult(4);
        if (r == null || !"_result".equals(r[0])) throw new IOException("createStream failed " + describe(r));
        if (r.length > 3 && r[3] instanceof Double) streamId = (int) (double) (Double) r[3];
        command("publish", 5, streamId, null, streamName, "live");
        Object[] st = waitStatus();
        if (st != null) {
            String code = statusCode(st);
            if (code != null && !code.contains("Start")) throw new IOException(code);
        }
        s.setSoTimeout(0);
        open = true;
        reader = new Thread(this::readLoop, "rekordo-rtmp-in");
        reader.start();
        sender = new Thread(this::sendLoop, "rekordo-rtmp-out");
        sender.start();
    }

    private void handshake() throws IOException {
        byte[] c1 = new byte[1536];
        new Random().nextBytes(c1);
        for (int i = 0; i < 8; i++) c1[i] = 0;
        out.write(3);
        out.write(c1);
        out.flush();
        int v = in.read();
        if (v < 0) throw new IOException("handshake: connection closed");
        byte[] s1 = new byte[1536];
        in.readFully(s1);
        out.write(s1);   // C2 = S1
        out.flush();
        byte[] s2 = new byte[1536];
        in.readFully(s2);
    }

    // ---------------------------------------------------------------- lecture des réponses du serveur

    private static final class Msg { int type, stream; byte[] body; }
    private final Map<Integer, int[]> chunkHdr = new HashMap<>();       // csid -> {ts, len, type, stream}
    private final Map<Integer, ByteArrayOutputStream> partial = new HashMap<>();

    private Msg readMessage() throws IOException {
        while (true) {
            int b0 = in.readUnsignedByte();
            int fmt = b0 >> 6, csid = b0 & 0x3F;
            if (csid == 0) csid = 64 + in.readUnsignedByte();
            else if (csid == 1) csid = 64 + in.readUnsignedByte() + in.readUnsignedByte() * 256;
            int[] hdr = chunkHdr.get(csid);
            if (hdr == null) hdr = new int[4];
            int ts = hdr[0];
            if (fmt <= 2) ts = read24();
            if (fmt <= 1) { hdr[1] = read24(); hdr[2] = in.readUnsignedByte(); }
            if (fmt == 0) hdr[3] = Integer.reverseBytes(in.readInt());
            if (ts == 0xFFFFFF) ts = in.readInt();
            hdr[0] = ts;
            chunkHdr.put(csid, hdr);
            ByteArrayOutputStream acc = partial.get(csid);
            if (acc == null) { acc = new ByteArrayOutputStream(); partial.put(csid, acc); }
            int left = hdr[1] - acc.size();
            int n = Math.min(left, inChunk);
            byte[] buf = new byte[n];
            in.readFully(buf);
            acc.write(buf);
            if (acc.size() >= hdr[1]) {
                Msg m = new Msg();
                m.type = hdr[2]; m.stream = hdr[3]; m.body = acc.toByteArray();
                partial.remove(csid);
                handleControl(m);
                return m;
            }
        }
    }

    private int read24() throws IOException { return (in.readUnsignedByte() << 16) | (in.readUnsignedByte() << 8) | in.readUnsignedByte(); }

    private void handleControl(Msg m) throws IOException {
        ByteBuffer b = ByteBuffer.wrap(m.body);
        switch (m.type) {
            case 1: inChunk = b.getInt() & 0x7FFFFFFF; break;                 // Set Chunk Size
            case 5: windowAck = b.getInt() & 0xFFFFFFFFL; break;               // Window Ack Size
            case 4:                                                           // User Control
                if (m.body.length >= 6 && b.getShort() == 6) {               // Ping request -> réponse
                    byte[] r = new byte[6];
                    r[1] = 7;
                    System.arraycopy(m.body, 2, r, 2, 4);
                    sendRaw(2, 4, 0, 0, r);
                }
                break;
        }
        if (bytesIn - lastAck > windowAck / 2) {
            lastAck = bytesIn;
            sendRaw(2, 3, 0, 0, int32((int) bytesIn));                          // Acknowledgement
        }
    }

    private Object[] waitResult(int txn) throws IOException {
        long until = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < until) {
            Msg m = readMessage();
            if (m.type != 20) continue;
            Object[] v = Amf.decodeAll(m.body);
            if (v.length >= 2 && v[1] instanceof Double && ((Double) v[1]).intValue() == txn) return v;
            if (v.length > 0 && "_error".equals(v[0])) return v;
        }
        return null;
    }

    private Object[] waitStatus() throws IOException {
        long until = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < until) {
            Msg m = readMessage();
            if (m.type != 20) continue;
            Object[] v = Amf.decodeAll(m.body);
            if (v.length > 0 && "onStatus".equals(v[0])) return v;
            if (v.length > 0 && "_error".equals(v[0])) return v;
        }
        return null;
    }

    private static String statusCode(Object[] v) {
        for (Object o : v) if (o instanceof Map) { Object c = ((Map<?, ?>) o).get("code"); if (c != null) return c.toString(); }
        return null;
    }

    private static String describe(Object[] v) {
        if (v == null) return "(no answer)";
        for (Object o : v) if (o instanceof Map) {
            Object d = ((Map<?, ?>) o).get("description"); if (d == null) d = ((Map<?, ?>) o).get("code");
            if (d != null) return d.toString();
        }
        return "";
    }

    private void readLoop() {
        try {
            while (open) {
                Msg m = readMessage();
                if (m.type == 20) {
                    Object[] v = Amf.decodeAll(m.body);
                    String code = statusCode(v);
                    if (code != null && (code.contains("Failed") || code.contains("BadName") || code.contains("Rejected")))
                        fail(code);
                }
            }
        } catch (Exception e) {
            if (open) fail("connection lost");
        }
    }

    private void fail(String msg) {
        if (!open) return;
        open = false;
        queue.clear();
        try { sock.close(); } catch (Exception ignored) {}
        if (listener != null) listener.onError(msg);
    }

    boolean isOpen() { return open; }

    // ---------------------------------------------------------------- envoi

    private void command(String name, int txn, int stream, Map<String, Object> obj, Object... args) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        Amf.write(b, name);
        Amf.write(b, (double) txn);
        Amf.write(b, obj);
        for (Object a : args) Amf.write(b, a);
        sendRaw(3, 20, stream, 0, b.toByteArray());
    }

    /** Message RTMP découpé en morceaux de CHUNK octets (en-tête type 0 puis type 3). */
    private void sendRaw(int csid, int type, int stream, long ts, byte[] body) throws IOException {
        synchronized (writeLock) {
            boolean ext = ts >= 0xFFFFFF;
            int t24 = ext ? 0xFFFFFF : (int) ts;
            out.write(csid & 0x3F);
            out.write(t24 >> 16); out.write(t24 >> 8); out.write(t24);
            out.write(body.length >> 16); out.write(body.length >> 8); out.write(body.length);
            out.write(type);
            out.write(stream); out.write(stream >> 8); out.write(stream >> 16); out.write(stream >> 24);
            if (ext) out.write(int32((int) ts));
            int off = 0;
            while (off < body.length) {
                if (off > 0) { out.write(0xC0 | (csid & 0x3F)); if (ext) out.write(int32((int) ts)); }
                int n = Math.min(CHUNK, body.length - off);
                out.write(body, off, n);
                off += n;
            }
            out.flush();
            sentBytes += body.length;
        }
    }

    private void sendLoop() {
        try {
            while (open) {
                Packet p = queue.poll(500, TimeUnit.MILLISECONDS);
                if (p == null) continue;
                sendRaw(p.type == 9 ? 6 : 4, p.type, streamId, p.ts, p.data);
            }
        } catch (Exception e) {
            fail("connection lost");
        }
    }

    private void enqueue(int type, long ts, byte[] data, boolean key) {
        if (!open) return;
        if (type == 9) {
            if (dropUntilKey && !key) { droppedFrames++; return; }
            dropUntilKey = false;
        }
        Packet p = new Packet();
        p.type = type; p.ts = ts; p.data = data; p.key = key;
        if (!queue.offer(p)) {
            // Réseau trop lent : on vide la file et on attend la prochaine image clé
            queue.clear();
            droppedFrames++;
            dropUntilKey = true;
        }
    }

    // ---------------------------------------------------------------- Sink (encodeurs -> FLV)

    @Override public int addTrack(MediaFormat f, boolean video) {
        int id = trackKind.size();
        trackKind.put(id, video ? 0 : 1);
        if (video) vFormat = f; else aFormat = f;
        return id;
    }

    @Override public void start() {
        if (!open) return;
        try {
            sendMetadata();
            if (vFormat != null) {
                byte[] avcc = avcConfig(vFormat);
                if (avcc != null) enqueue(9, 0, concat(new byte[]{0x17, 0, 0, 0, 0}, avcc), true);
            }
            if (aFormat != null) {
                ByteBuffer csd = aFormat.getByteBuffer("csd-0");
                if (csd != null) enqueue(8, 0, concat(new byte[]{(byte) 0xAF, 0}, bytes(csd)), true);
            }
        } catch (Exception e) { fail("start: " + e.getMessage()); }
    }

    private void sendMetadata() throws IOException {
        Map<String, Object> md = new LinkedHashMap<>();
        md.put("duration", 0.0);
        md.put("width", (double) w);
        md.put("height", (double) h);
        md.put("framerate", (double) fps);
        md.put("videocodecid", 7.0);
        if (aFormat != null) {
            md.put("audiocodecid", 10.0);
            md.put("audiosamplerate", (double) aFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE));
            md.put("audiosamplesize", 16.0);
            md.put("stereo", aFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) > 1);
        }
        md.put("encoder", "Rekordo");
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        Amf.write(b, "@setDataFrame");
        Amf.write(b, "onMetaData");
        Amf.writeEcma(b, md);
        sendRaw(4, 18, streamId, 0, b.toByteArray());
    }

    @Override public void write(int track, ByteBuffer b, MediaCodec.BufferInfo info) {
        if (!open) return;
        Integer kind = trackKind.get(track);
        if (kind == null) return;
        if (baseUs < 0) baseUs = info.presentationTimeUs;
        long ts = Math.max(0, (info.presentationTimeUs - baseUs) / 1000);
        byte[] data = new byte[info.size];
        b.position(info.offset);
        b.get(data, 0, info.size);
        if (kind == 0) {
            boolean key = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
            byte[] avc = annexBToAvcc(data);
            if (avc.length == 0) return;
            enqueue(9, ts, concat(new byte[]{(byte) (key ? 0x17 : 0x27), 1, 0, 0, 0}, avc), key);
        } else {
            enqueue(8, ts, concat(new byte[]{(byte) 0xAF, 1}, data), false);
        }
    }

    @Override public boolean stop() {
        boolean was = open;
        try {
            if (was) {
                long until = System.currentTimeMillis() + 3000;
                while (!queue.isEmpty() && System.currentTimeMillis() < until) Thread.sleep(50);
                command("FCUnpublish", 6, streamId, null, key);
                command("deleteStream", 7, 0, null, (double) streamId);
            }
        } catch (Exception ignored) {}
        open = false;
        try { if (sock != null) sock.close(); } catch (Exception ignored) {}
        return was;
    }

    void close() { open = false; try { if (sock != null) sock.close(); } catch (Exception ignored) {} }

    // ---------------------------------------------------------------- H.264

    /** AVCDecoderConfigurationRecord à partir de SPS/PPS (csd-0, csd-1). */
    private static byte[] avcConfig(MediaFormat f) {
        ByteBuffer c0 = f.getByteBuffer("csd-0"), c1 = f.getByteBuffer("csd-1");
        if (c0 == null) return null;
        List<byte[]> nals = new ArrayList<>(splitNals(bytes(c0)));
        if (c1 != null) nals.addAll(splitNals(bytes(c1)));
        byte[] sps = null, pps = null;
        for (byte[] n : nals) {
            if (n.length == 0) continue;
            int t = n[0] & 0x1F;
            if (t == 7) sps = n; else if (t == 8) pps = n;
        }
        if (sps == null || pps == null || sps.length < 4) return null;
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(1); o.write(sps[1]); o.write(sps[2]); o.write(sps[3]);
        o.write(0xFF); o.write(0xE1);
        o.write(sps.length >> 8); o.write(sps.length); o.write(sps, 0, sps.length);
        o.write(1);
        o.write(pps.length >> 8); o.write(pps.length); o.write(pps, 0, pps.length);
        return o.toByteArray();
    }

    /** Annex-B (00 00 00 01 NAL…) vers longueurs sur 4 octets ; SPS/PPS/AUD retirés. */
    private static byte[] annexBToAvcc(byte[] d) {
        ByteArrayOutputStream o = new ByteArrayOutputStream(d.length + 16);
        for (byte[] n : splitNals(d)) {
            if (n.length == 0) continue;
            int t = n[0] & 0x1F;
            if (t == 7 || t == 8 || t == 9) continue;
            o.write(n.length >>> 24); o.write(n.length >>> 16); o.write(n.length >>> 8); o.write(n.length);
            o.write(n, 0, n.length);
        }
        return o.toByteArray();
    }

    static List<byte[]> splitNals(byte[] d) {
        List<byte[]> out = new ArrayList<>();
        int i = 0, start = -1;
        while (i + 3 <= d.length) {
            int sc = 0;
            if (d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 1) sc = 3;
            else if (i + 4 <= d.length && d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 0 && d[i + 3] == 1) sc = 4;
            if (sc > 0) {
                if (start >= 0) out.add(java.util.Arrays.copyOfRange(d, start, i));
                i += sc; start = i;
            } else i++;
        }
        if (start >= 0) out.add(java.util.Arrays.copyOfRange(d, start, d.length));
        else if (d.length > 0) out.add(d);   // déjà sans codes de début
        return out;
    }

    private static byte[] bytes(ByteBuffer b) { ByteBuffer d = b.duplicate(); d.rewind(); byte[] a = new byte[d.remaining()]; d.get(a); return a; }
    private static byte[] concat(byte[] a, byte[] b) { byte[] r = new byte[a.length + b.length]; System.arraycopy(a, 0, r, 0, a.length); System.arraycopy(b, 0, r, a.length, b.length); return r; }
    private static byte[] int32(int v) { return new byte[]{(byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v}; }

    private final class Counting extends InputStream {
        private final InputStream s;
        Counting(InputStream s) { this.s = s; }
        @Override public int read() throws IOException { int r = s.read(); if (r >= 0) bytesIn++; return r; }
        @Override public int read(byte[] b, int o, int l) throws IOException { int r = s.read(b, o, l); if (r > 0) bytesIn += r; return r; }
    }

    // ---------------------------------------------------------------- AMF0

    static final class Amf {
        static void write(ByteArrayOutputStream o, Object v) {
            if (v == null) { o.write(5); return; }
            if (v instanceof Double) { o.write(0); long b = Double.doubleToLongBits((Double) v); for (int i = 7; i >= 0; i--) o.write((int) (b >> (i * 8))); return; }
            if (v instanceof Boolean) { o.write(1); o.write((Boolean) v ? 1 : 0); return; }
            if (v instanceof String) { o.write(2); str(o, (String) v); return; }
            if (v instanceof Map) {
                o.write(3);
                for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) { str(o, e.getKey().toString()); write(o, e.getValue()); }
                o.write(0); o.write(0); o.write(9);
                return;
            }
            o.write(6);
        }

        static void writeEcma(ByteArrayOutputStream o, Map<String, Object> m) {
            o.write(8);
            int n = m.size();
            o.write(n >> 24); o.write(n >> 16); o.write(n >> 8); o.write(n);
            for (Map.Entry<String, Object> e : m.entrySet()) { str(o, e.getKey()); write(o, e.getValue()); }
            o.write(0); o.write(0); o.write(9);
        }

        private static void str(ByteArrayOutputStream o, String s) {
            byte[] b = s.getBytes(StandardCharsets.UTF_8);
            o.write(b.length >> 8); o.write(b.length); o.write(b, 0, b.length);
        }

        static Object[] decodeAll(byte[] d) {
            List<Object> out = new ArrayList<>();
            ByteBuffer b = ByteBuffer.wrap(d);
            try { while (b.hasRemaining()) out.add(read(b)); } catch (Exception ignored) {}
            return out.toArray();
        }

        private static Object read(ByteBuffer b) {
            int t = b.get() & 0xFF;
            switch (t) {
                case 0: return b.getDouble();
                case 1: return b.get() != 0;
                case 2: return rstr(b);
                case 3: case 8: {
                    if (t == 8) b.getInt();
                    Map<String, Object> m = new LinkedHashMap<>();
                    while (true) {
                        String k = rstr(b);
                        if (k.isEmpty() && (b.get(b.position()) & 0xFF) == 9) { b.get(); break; }
                        m.put(k, read(b));
                    }
                    return m;
                }
                case 5: case 6: return null;
                case 10: { int n = b.getInt(); List<Object> l = new ArrayList<>(); for (int i = 0; i < n; i++) l.add(read(b)); return l; }
                default: throw new IllegalStateException("amf " + t);
            }
        }

        private static String rstr(ByteBuffer b) {
            int n = b.getShort() & 0xFFFF;
            byte[] a = new byte[n];
            b.get(a);
            return new String(a, StandardCharsets.UTF_8);
        }
    }
}
