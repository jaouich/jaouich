#!/bin/bash
# Test sur un téléphone Android virtuel : installe, ouvre, enregistre, arrête. Captures + journaux dans test/out.
set -x
OUT=test/out; rm -rf $OUT; mkdir -p $OUT
PKG=ma.magiscom.desk
shot() { adb exec-out screencap -p > $OUT/$1.png; }
tap_text() {  # touche l'élément dont le texte contient $1
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml $OUT/ui.xml >/dev/null 2>&1
  b=$(python3 - "$1" <<'PY'
import re,sys,html
x=open("test/out/ui.xml",encoding="utf-8").read()
for m in re.finditer(r'<node [^>]*>', x):
    n=m.group(0); t=html.unescape(re.search(r'text="([^"]*)"',n).group(1)); d=html.unescape((re.search(r'content-desc="([^"]*)"',n) or [None,""])[1])
    if sys.argv[1].lower() in (t+" "+d).lower():
        a=list(map(int,re.findall(r'\d+',re.search(r'bounds="([^"]*)"',n).group(1)))); print((a[0]+a[2])//2,(a[1]+a[3])//2); break
PY
)
  echo "tap '$1' -> $b"; [ -n "$b" ] && adb shell input tap $b
}
adb install -r test/magiscom-desk.apk 2>&1 | tee $OUT/install.txt
adb logcat -c
adb shell pm grant $PKG android.permission.RECORD_AUDIO
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell am start -W -n $PKG/.MainActivity | tee $OUT/start.txt
sleep 4; shot 1-ouverture
tap_text "sans compte"; sleep 3; shot 2-accueil
tap_text "Enregistrer"; sleep 4; shot 3-autorisation
adb shell uiautomator dump /sdcard/ui.xml >/dev/null; adb pull /sdcard/ui.xml $OUT/dialog.xml >/dev/null
tap_text "Entire screen"; sleep 1; tap_text "A single app" ; sleep 1; tap_text "Entire screen"; sleep 1
tap_text "Start"; sleep 1; tap_text "Next"; sleep 1; tap_text "Start"
sleep 1.5; shot 4-compte-a-rebours
sleep 6; shot 5-enregistrement
tap_text "0:0"; sleep 1.5; shot 6-bulle-ouverte
tap_text "Pause"; sleep 2; shot 7-pause
tap_text "Reprendre"; sleep 3
tap_text "Arrêter"; sleep 5; shot 8-resultat
adb shell content query --uri content://media/external/video/media --projection _display_name:_size:duration:relative_path > $OUT/videos.txt 2>&1
adb logcat -d > $OUT/logcat-full.txt
grep -E "AndroidRuntime|FATAL|magiscom|MediaRecorder|MediaProjection" $OUT/logcat-full.txt | tail -200 > $OUT/logcat.txt
true
# 2026-11-20T02:12:47Z
