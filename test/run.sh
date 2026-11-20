#!/bin/bash
# Test de Rekordo sur un téléphone virtuel Android 14 : réglages, enregistrement, bulle, pause,
# capture, arrêt, galerie, lecteur, découpe. Captures et journaux dans test/out.
set -x
OUT=test/out; rm -rf $OUT; mkdir -p $OUT
PKG=app.rekordo
shot() { adb exec-out screencap -p > $OUT/$1.png; }
N=0
dump() { N=$((N+1)); adb shell uiautomator dump /sdcard/ui.xml > $OUT/dumpmsg-$N.txt 2>&1; adb pull /sdcard/ui.xml $OUT/ui.xml >/dev/null 2>&1; cp $OUT/ui.xml $OUT/dump-$N.xml; }
tap_text() {
  dump; b=$(python3 - "$1" <<'PY'
import re,sys,html
x=open("test/out/ui.xml",encoding="utf-8").read()
for m in re.finditer(r'<node [^>]*>', x):
    n=m.group(0); t=html.unescape(re.search(r'text="([^"]*)"',n).group(1)); d=html.unescape((re.search(r'content-desc="([^"]*)"',n) or [None,""])[1])
    if sys.argv[1].lower() == t.lower() or sys.argv[1].lower() == d.lower() or (len(sys.argv[1])>6 and sys.argv[1].lower() in (t+" "+d).lower()):
        a=list(map(int,re.findall(r'\d+',re.search(r'bounds="([^"]*)"',n).group(1)))); print((a[0]+a[2])//2,(a[1]+a[3])//2); break
PY
)
  echo "tap '$1' -> $b (dump $N)" | tee -a $OUT/steps.txt; [ -n "$b" ] && adb shell input tap $b
}
adb install -r test/rekordo.apk 2>&1 | tee $OUT/install.txt
adb logcat -c
adb shell pm grant $PKG android.permission.RECORD_AUDIO
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell pm grant $PKG android.permission.CAMERA
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell am start -W -n $PKG/.MainActivity | tee $OUT/start.txt
sleep 4; shot 01-accueil
tap_text "Settings"; sleep 2; shot 02-reglages
tap_text "Videos"; sleep 1
# --- Enregistrement 1
tap_text "Record"; sleep 4; shot 03-autorisation
tap_text "Start now"
sleep 1.5; shot 04-compte-a-rebours
sleep 4; shot 05-enregistrement
adb shell am start -a android.settings.SETTINGS; sleep 3; shot 06-autre-appli
adb shell dumpsys activity services $PKG | head -30 > $OUT/service.txt
adb shell cmd statusbar expand-notifications; sleep 2; shot 07-notification
tap_text "Pause"; sleep 2
adb shell cmd statusbar expand-notifications; sleep 2; shot 08-pause
tap_text "Resume"; sleep 3
adb shell cmd statusbar expand-notifications; sleep 2
tap_text "Screenshot"; sleep 3; shot 09-apres-capture
sleep 3
adb shell cmd statusbar expand-notifications; sleep 2
tap_text "Stop"; sleep 6; shot 10-arret
adb shell content query --uri content://media/external/video/media --projection _display_name:_size:duration:width:height:relative_path > $OUT/videos.txt 2>&1
adb shell content query --uri content://media/external/images/media --projection _display_name:_size:relative_path > $OUT/images.txt 2>&1
# --- Galerie et lecteur
adb shell am start -W -n $PKG/.MainActivity; sleep 3; shot 11-galerie
dump; cp $OUT/ui.xml $OUT/galerie.xml
adb shell input tap 280 900; sleep 4; shot 12-lecteur
tap_text "Cut"; sleep 2; shot 13-couper
adb shell input keyevent BACK; sleep 1
tap_text "Save this frame"; sleep 3
adb shell input keyevent BACK; sleep 2
tap_text "Screenshots"; sleep 3; shot 14-captures
adb logcat -d > $OUT/logcat-full.txt
grep -E "AndroidRuntime|FATAL|rekordo|Rekordo|MediaCodec.*rror|MediaProjection" $OUT/logcat-full.txt | tail -250 > $OUT/logcat.txt
true
