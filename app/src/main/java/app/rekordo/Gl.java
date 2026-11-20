package app.rekordo;

import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.opengl.Matrix;
import android.view.Surface;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * OpenGL pour l'export : le décodeur dessine chaque image dans une texture, le shader applique
 * le filtre (matrice de couleurs), puis le texte par-dessus, et le résultat part dans l'encodeur.
 */
final class Gl {
    private static final int EGL_RECORDABLE_ANDROID = 0x3142;

    private EGLDisplay dpy = EGL14.EGL_NO_DISPLAY;
    private EGLContext ctx = EGL14.EGL_NO_CONTEXT;
    private EGLSurface surf = EGL14.EGL_NO_SURFACE;

    private int videoProg, overlayProg, oesTex, overlayTex = -1;
    private SurfaceTexture st;
    private Surface decoderSurface;
    private final Object frameLock = new Object();
    private boolean frameAvailable;
    private final float[] stMatrix = new float[16], mvp = new float[16];
    private float[] color = identity(), offset = new float[4], crop = {0, 0, 1, 1};

    private static final float[] QUAD = {-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1};
    private final FloatBuffer quad = ByteBuffer.allocateDirect(QUAD.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().put(QUAD);

    private static final String VS =
            "uniform mat4 uMVP; uniform mat4 uST; uniform vec4 uCrop; attribute vec4 aPos; attribute vec4 aTex; varying vec2 vTex;\n" +
            "void main(){ gl_Position = uMVP * vec4(aPos.xy,0.0,1.0); vec2 t = uCrop.xy + aTex.xy * uCrop.zw; vTex = (uST * vec4(t,0.0,1.0)).xy; }";
    private static final String FS =
            "#extension GL_OES_EGL_image_external : require\nprecision mediump float; varying vec2 vTex;\n" +
            "uniform samplerExternalOES sTex; uniform mat4 uColor; uniform vec4 uOff;\n" +
            "void main(){ vec4 c = texture2D(sTex, vTex); vec4 o = uColor * vec4(c.rgb,1.0) + uOff; gl_FragColor = vec4(clamp(o.rgb,0.0,1.0),1.0); }";
    private static final String OVS =
            "attribute vec4 aPos; attribute vec4 aTex; varying vec2 vTex; void main(){ gl_Position = vec4(aPos.xy,0.0,1.0); vTex = vec2(aTex.x, 1.0-aTex.y); }";
    private static final String OFS =
            "precision mediump float; varying vec2 vTex; uniform sampler2D sTex; void main(){ gl_FragColor = texture2D(sTex, vTex); }";

    /** Prépare EGL sur la surface d'entrée de l'encodeur. */
    Gl(Surface encoderInput) {
        dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        int[] v = new int[2];
        if (!EGL14.eglInitialize(dpy, v, 0, v, 1)) throw new IllegalStateException("eglInitialize");
        int[] attr = {EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL_RECORDABLE_ANDROID, 1, EGL14.EGL_NONE};
        EGLConfig[] cfg = new EGLConfig[1];
        int[] n = new int[1];
        EGL14.eglChooseConfig(dpy, attr, 0, cfg, 0, 1, n, 0);
        if (n[0] == 0) throw new IllegalStateException("eglChooseConfig");
        ctx = EGL14.eglCreateContext(dpy, cfg[0], EGL14.EGL_NO_CONTEXT, new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE}, 0);
        surf = EGL14.eglCreateWindowSurface(dpy, cfg[0], encoderInput, new int[]{EGL14.EGL_NONE}, 0);
        if (!EGL14.eglMakeCurrent(dpy, surf, surf, ctx)) throw new IllegalStateException("eglMakeCurrent");

        videoProg = program(VS, FS);
        overlayProg = program(OVS, OFS);
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        oesTex = t[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        st = new SurfaceTexture(oesTex);
        st.setOnFrameAvailableListener(s -> { synchronized (frameLock) { frameAvailable = true; frameLock.notifyAll(); } }, Exporter.callbackHandler());
        decoderSurface = new Surface(st);
        Matrix.setIdentityM(mvp, 0);
    }

    Surface decoderSurface() { return decoderSurface; }

    /** Couleurs : matrice 4x4 (colonnes, comme OpenGL) + décalage. */
    void setColor(float[] m4, float[] off) { color = m4; offset = off; }

    /** Rotation en degrés (0, 90, 180, 270) appliquée à l'image. */
    void setRotation(int deg) { Matrix.setIdentityM(mvp, 0); Matrix.rotateM(mvp, 0, -deg, 0, 0, 1); }

    /** Recadrage centré : part de la largeur / hauteur de l'image source gardée (0..1). */
    void setCrop(float sx, float sy) { crop = new float[]{(1 - sx) / 2, (1 - sy) / 2, sx, sy}; }

    void setOverlay(Bitmap b) {
        if (b == null) return;
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        overlayTex = t[0];
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTex);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, b, 0);
    }

    /** Attend l'image que le décodeur vient de rendre (false si elle n'arrive pas). */
    boolean awaitFrame() {
        synchronized (frameLock) {
            long until = System.currentTimeMillis() + 2500;
            while (!frameAvailable) {
                long left = until - System.currentTimeMillis();
                if (left <= 0) return false;
                try { frameLock.wait(left); } catch (InterruptedException e) { return false; }
            }
            frameAvailable = false;
        }
        st.updateTexImage();
        st.getTransformMatrix(stMatrix);
        return true;
    }

    /** Dessine l'image dans le rectangle (vx, vy, vw, vh) d'une sortie w x h (bandes noires autour). */
    void draw(int w, int h, int vx, int vy, int vw, int vh) {
        GLES20.glViewport(0, 0, w, h);
        GLES20.glClearColor(0, 0, 0, 1);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        GLES20.glViewport(vx, vy, vw, vh);
        GLES20.glUseProgram(videoProg);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex);
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(videoProg, "uMVP"), 1, false, mvp, 0);
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(videoProg, "uST"), 1, false, stMatrix, 0);
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(videoProg, "uColor"), 1, false, color, 0);
        GLES20.glUniform4fv(GLES20.glGetUniformLocation(videoProg, "uOff"), 1, offset, 0);
        GLES20.glUniform4fv(GLES20.glGetUniformLocation(videoProg, "uCrop"), 1, crop, 0);
        quadAttribs(videoProg);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        if (overlayTex >= 0) {
            GLES20.glViewport(0, 0, w, h);
            GLES20.glEnable(GLES20.GL_BLEND);
            GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA);   // bitmap Android = alpha prémultiplié
            GLES20.glUseProgram(overlayProg);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTex);
            quadAttribs(overlayProg);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
            GLES20.glDisable(GLES20.GL_BLEND);
        }
    }

    private void quadAttribs(int prog) {
        int p = GLES20.glGetAttribLocation(prog, "aPos"), t = GLES20.glGetAttribLocation(prog, "aTex");
        quad.position(0);
        GLES20.glVertexAttribPointer(p, 2, GLES20.GL_FLOAT, false, 16, quad);
        GLES20.glEnableVertexAttribArray(p);
        quad.position(2);
        GLES20.glVertexAttribPointer(t, 2, GLES20.GL_FLOAT, false, 16, quad);
        GLES20.glEnableVertexAttribArray(t);
    }

    void present(long ptsNs) {
        EGLExt.eglPresentationTimeANDROID(dpy, surf, ptsNs);
        EGL14.eglSwapBuffers(dpy, surf);
    }

    void release() {
        try { if (decoderSurface != null) decoderSurface.release(); } catch (Exception ignored) {}
        try { if (st != null) st.release(); } catch (Exception ignored) {}
        if (dpy != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            if (surf != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(dpy, surf);
            if (ctx != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(dpy, ctx);
            EGL14.eglReleaseThread();
            EGL14.eglTerminate(dpy);
        }
        dpy = EGL14.EGL_NO_DISPLAY;
    }

    private static int program(String vs, String fs) {
        int v = shader(GLES20.GL_VERTEX_SHADER, vs), f = shader(GLES20.GL_FRAGMENT_SHADER, fs);
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, v);
        GLES20.glAttachShader(p, f);
        GLES20.glLinkProgram(p);
        int[] ok = new int[1];
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0);
        if (ok[0] == 0) throw new IllegalStateException("link: " + GLES20.glGetProgramInfoLog(p));
        return p;
    }

    private static int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) throw new IllegalStateException("shader: " + GLES20.glGetShaderInfoLog(s));
        return s;
    }

    static float[] identity() { float[] m = new float[16]; Matrix.setIdentityM(m, 0); return m; }
}
