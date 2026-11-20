package app.rekordo;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Fichiers de l'utilisateur dans la galerie du téléphone (Movies/Rekordo, Pictures/Rekordo). */
final class Store {
    static final String VDIR = Environment.DIRECTORY_MOVIES + "/Rekordo";
    static final String PDIR = Environment.DIRECTORY_PICTURES + "/Rekordo";

    static final class Item {
        Uri uri; String name; long size, duration, date; boolean video;
    }

    static String stamp() { return new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()); }

    static Uri newVideo(Context c, String name) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        v.put(MediaStore.Video.Media.RELATIVE_PATH, VDIR);
        v.put(MediaStore.Video.Media.IS_PENDING, 1);
        return c.getContentResolver().insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
    }

    static void publish(Context c, Uri u) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.IS_PENDING, 0);
        c.getContentResolver().update(u, v, null, null);
    }

    static void discard(Context c, Uri u) {
        try { c.getContentResolver().delete(u, null, null); } catch (Exception ignored) {}
    }

    static Uri saveImage(Context c, Bitmap b) {
        ContentResolver r = c.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, "Rekordo_" + stamp() + ".png");
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, PDIR);
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri u = r.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
        if (u == null) return null;
        try (OutputStream os = r.openOutputStream(u)) {
            b.compress(Bitmap.CompressFormat.PNG, 100, os);
        } catch (Exception e) { discard(c, u); return null; }
        publish(c, u);
        return u;
    }

    static List<Item> list(Context c, boolean video) {
        List<Item> out = new ArrayList<>();
        Uri base = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String[] cols = video
                ? new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_ADDED, MediaStore.Video.Media.DURATION}
                : new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_ADDED};
        String sel = MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?";
        String[] args = {(video ? VDIR : PDIR) + "%"};
        try (Cursor cur = c.getContentResolver().query(base, cols, sel, args, MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                Item it = new Item();
                it.uri = ContentUris.withAppendedId(base, cur.getLong(0));
                it.name = cur.getString(1);
                it.size = cur.getLong(2);
                it.date = cur.getLong(3) * 1000;
                it.duration = video ? cur.getLong(4) : 0;
                it.video = video;
                out.add(it);
            }
        } catch (Exception ignored) {}
        return out;
    }

    static String size(long b) {
        if (b < 1024 * 1024) return Math.max(1, b / 1024) + " KB";
        if (b < 1024L * 1024 * 1024) return String.format(Locale.US, "%.1f MB", b / 1048576.0);
        return String.format(Locale.US, "%.2f GB", b / 1073741824.0);
    }

    static String dur(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
                : String.format(Locale.US, "%d:%02d", s / 60, s % 60);
    }
}
