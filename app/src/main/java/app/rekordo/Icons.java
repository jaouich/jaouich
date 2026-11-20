package app.rekordo;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

/** Icônes dessinées en code (pas de bibliothèque) : nettes à toutes les tailles. */
final class Icons extends Drawable {
    static final int REC = 0, STOP = 1, PAUSE = 2, PLAY = 3, CAMERA = 4, BRUSH = 5, FACE = 6, HOME = 7, CLOSE = 8,
            SHARE = 9, TRASH = 10, CUT = 11, FRAME = 12, UNDO = 13, INFO = 14, BACK = 15, VIDEO = 16, IMAGE = 17, GEAR = 18,
            FILTER = 19, ADJUST = 20, TEXT = 21, SPEED = 22, ROTATE = 23, SOUND = 24, SIZE = 25, EDIT = 26, CHECK = 27, MERGE = 28;

    private final int kind;
    private final Paint s = new Paint(Paint.ANTI_ALIAS_FLAG), f = new Paint(Paint.ANTI_ALIAS_FLAG);

    Icons(int kind, int color) {
        this.kind = kind;
        s.setStyle(Paint.Style.STROKE); s.setStrokeCap(Paint.Cap.ROUND); s.setStrokeJoin(Paint.Join.ROUND); s.setColor(color);
        f.setStyle(Paint.Style.FILL); f.setColor(color);
    }

    @Override public void draw(Canvas c) {
        Rect b = getBounds();
        float w = Math.min(b.width(), b.height()), u = w / 24f;
        c.save();
        c.translate(b.centerX() - w / 2, b.centerY() - w / 2);
        c.scale(u, u);
        s.setStrokeWidth(2f);
        Path p = new Path();
        switch (kind) {
            case REC: c.drawCircle(12, 12, 7, f); break;
            case STOP: c.drawRoundRect(new RectF(6, 6, 18, 18), 2.5f, 2.5f, f); break;
            case PAUSE: c.drawRoundRect(new RectF(6.5f, 5, 10.5f, 19), 1.5f, 1.5f, f); c.drawRoundRect(new RectF(13.5f, 5, 17.5f, 19), 1.5f, 1.5f, f); break;
            case PLAY: p.moveTo(8, 5); p.lineTo(19, 12); p.lineTo(8, 19); p.close(); c.drawPath(p, f); break;
            case CAMERA:
                c.drawRoundRect(new RectF(3, 7, 21, 19), 3, 3, s);
                p.moveTo(8, 7); p.lineTo(9.5f, 4.5f); p.lineTo(14.5f, 4.5f); p.lineTo(16, 7); c.drawPath(p, s);
                c.drawCircle(12, 13, 3.3f, s); break;
            case BRUSH:
                p.moveTo(4, 20); p.lineTo(5, 15.5f); p.lineTo(15.5f, 5); p.lineTo(19, 8.5f); p.lineTo(8.5f, 19); p.close(); c.drawPath(p, s);
                c.drawLine(13, 7.5f, 16.5f, 11, s); break;
            case FACE:
                c.drawCircle(12, 12, 8.5f, s); c.drawCircle(9, 10.5f, 1.2f, f); c.drawCircle(15, 10.5f, 1.2f, f);
                c.drawArc(new RectF(8, 10.5f, 16, 16.5f), 20, 140, false, s); break;
            case HOME:
                p.moveTo(4, 11); p.lineTo(12, 4); p.lineTo(20, 11); c.drawPath(p, s);
                p.reset(); p.moveTo(6.5f, 9.5f); p.lineTo(6.5f, 20); p.lineTo(17.5f, 20); p.lineTo(17.5f, 9.5f); c.drawPath(p, s); break;
            case CLOSE: c.drawLine(6, 6, 18, 18, s); c.drawLine(18, 6, 6, 18, s); break;
            case SHARE:
                c.drawCircle(17, 6, 2.5f, s); c.drawCircle(7, 12, 2.5f, s); c.drawCircle(17, 18, 2.5f, s);
                c.drawLine(9.2f, 10.8f, 14.8f, 7.2f, s); c.drawLine(9.2f, 13.2f, 14.8f, 16.8f, s); break;
            case TRASH:
                c.drawLine(4, 7, 20, 7, s); p.moveTo(9, 7); p.lineTo(9, 4.5f); p.lineTo(15, 4.5f); p.lineTo(15, 7); c.drawPath(p, s);
                p.reset(); p.moveTo(6, 7); p.lineTo(7, 20); p.lineTo(17, 20); p.lineTo(18, 7); c.drawPath(p, s);
                c.drawLine(10, 11, 10, 16.5f, s); c.drawLine(14, 11, 14, 16.5f, s); break;
            case CUT:
                c.drawCircle(6.5f, 17.5f, 2.8f, s); c.drawCircle(17.5f, 17.5f, 2.8f, s);
                c.drawLine(8.5f, 15.5f, 17, 4, s); c.drawLine(15.5f, 15.5f, 7, 4, s); break;
            case FRAME:
                c.drawRoundRect(new RectF(3.5f, 4.5f, 20.5f, 19.5f), 2.5f, 2.5f, s);
                p.moveTo(3.5f, 16); p.lineTo(9, 11); p.lineTo(13, 15); p.lineTo(16, 12.5f); p.lineTo(20.5f, 16.5f); c.drawPath(p, s);
                c.drawCircle(15.5f, 8.5f, 1.5f, f); break;
            case UNDO:
                p.moveTo(9, 5); p.lineTo(4.5f, 9.5f); p.lineTo(9, 14); c.drawPath(p, s);
                p.reset(); p.moveTo(4.5f, 9.5f); p.lineTo(14, 9.5f); p.cubicTo(18, 9.5f, 20, 12, 20, 14.5f); p.cubicTo(20, 17, 18, 19.5f, 14, 19.5f); p.lineTo(10, 19.5f); c.drawPath(p, s); break;
            case INFO: c.drawCircle(12, 12, 8.5f, s); c.drawLine(12, 11, 12, 16.5f, s); c.drawCircle(12, 7.8f, 1.2f, f); break;
            case BACK: p.moveTo(14.5f, 5); p.lineTo(7.5f, 12); p.lineTo(14.5f, 19); c.drawPath(p, s); break;
            case VIDEO:
                c.drawRoundRect(new RectF(3, 6, 16, 18), 2.5f, 2.5f, s);
                p.moveTo(16, 10.5f); p.lineTo(21, 7.5f); p.lineTo(21, 16.5f); p.lineTo(16, 13.5f); c.drawPath(p, s); break;
            case IMAGE:
                c.drawRoundRect(new RectF(3.5f, 4.5f, 20.5f, 19.5f), 2.5f, 2.5f, s);
                p.moveTo(3.5f, 17); p.lineTo(10, 11); p.lineTo(20.5f, 19); c.drawPath(p, s); c.drawCircle(15.5f, 9, 1.6f, f); break;
            case GEAR:
                c.drawCircle(12, 12, 3, s);
                for (int i = 0; i < 8; i++) {
                    double a = Math.PI * i / 4;
                    c.drawLine((float) (12 + 6 * Math.cos(a)), (float) (12 + 6 * Math.sin(a)), (float) (12 + 8.5 * Math.cos(a)), (float) (12 + 8.5 * Math.sin(a)), s);
                }
                c.drawCircle(12, 12, 6, s); break;
            case FILTER:
                c.drawCircle(9, 10, 5.5f, s); c.drawCircle(15, 10, 5.5f, s); c.drawCircle(12, 15, 5.5f, s); break;
            case ADJUST:
                c.drawLine(4, 7, 20, 7, s); c.drawLine(4, 12, 20, 12, s); c.drawLine(4, 17, 20, 17, s);
                c.drawCircle(9, 7, 2.2f, f); c.drawCircle(16, 12, 2.2f, f); c.drawCircle(7, 17, 2.2f, f); break;
            case TEXT:
                c.drawLine(5, 6, 19, 6, s); c.drawLine(12, 6, 12, 19, s); c.drawLine(9, 19, 15, 19, s); break;
            case SPEED:
                c.drawArc(new RectF(3.5f, 5, 20.5f, 22), 200, 140, false, s); c.drawLine(12, 13.5f, 16.5f, 8.5f, s); c.drawCircle(12, 13.5f, 1.6f, f); break;
            case ROTATE:
                c.drawArc(new RectF(5, 5, 19, 19), -60, 300, false, s);
                p.moveTo(15.5f, 3.5f); p.lineTo(19.5f, 6.5f); p.lineTo(15, 8.5f); c.drawPath(p, s); break;
            case SOUND:
                p.moveTo(4, 9.5f); p.lineTo(8, 9.5f); p.lineTo(12.5f, 5.5f); p.lineTo(12.5f, 18.5f); p.lineTo(8, 14.5f); p.lineTo(4, 14.5f); p.close(); c.drawPath(p, s);
                c.drawArc(new RectF(12, 8.5f, 17, 15.5f), -55, 110, false, s); c.drawArc(new RectF(12, 5.5f, 21, 18.5f), -55, 110, false, s); break;
            case SIZE:
                c.drawRoundRect(new RectF(4, 4, 20, 20), 2.5f, 2.5f, s);
                c.drawLine(8.5f, 15.5f, 15.5f, 8.5f, s); p.moveTo(11.5f, 8.5f); p.lineTo(15.5f, 8.5f); p.lineTo(15.5f, 12.5f); c.drawPath(p, s); break;
            case EDIT:
                p.moveTo(4, 20); p.lineTo(5, 15.5f); p.lineTo(15.5f, 5); p.lineTo(19, 8.5f); p.lineTo(8.5f, 19); p.close(); c.drawPath(p, s);
                c.drawLine(13, 20, 20, 20, s); break;
            case CHECK: p.moveTo(5, 12.5f); p.lineTo(10, 17.5f); p.lineTo(19, 7); c.drawPath(p, s); break;
            case MERGE:
                c.drawRoundRect(new RectF(3, 7, 10.5f, 17), 2, 2, s); c.drawRoundRect(new RectF(13.5f, 7, 21, 17), 2, 2, s);
                c.drawLine(10.5f, 12, 13.5f, 12, s); break;
        }
        c.restore();
    }

    @Override public void setAlpha(int a) { s.setAlpha(a); f.setAlpha(a); }
    @Override public void setColorFilter(ColorFilter cf) { s.setColorFilter(cf); f.setColorFilter(cf); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
