package app.rekordo;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Tuile des réglages rapides : lancer / arrêter l'enregistrement depuis n'importe où. */
public class RecTileService extends TileService {
    @Override public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean on = RecorderService.recording || RecorderService.counting;
        t.setState(on ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel(getString(on ? R.string.stop : R.string.tile_label));
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_stat));
        t.updateTile();
    }

    @Override public void onClick() {
        if (RecorderService.recording || RecorderService.counting) {
            RecorderService.send(this, RecorderService.ACTION_STOP);
            return;
        }
        Intent i = new Intent(this, CaptureActivity.class)
                .putExtra(CaptureActivity.EXTRA_MODE, CaptureActivity.MODE_RECORD)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
