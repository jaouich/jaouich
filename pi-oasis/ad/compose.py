# Builds the 60 s ad from the cards (/tmp/adv/w/*.png), the recorded app clip and a generated ambient pad.
import json, subprocess
W = '/tmp/adv/w'; d = json.load(open('/tmp/adv/rec.json')); ready = d['ready']; marks = d['marks']; R = d['path']
def run(c):
    r = subprocess.run(c, shell=True, capture_output=True, text=True)
    if r.returncode: print(r.stderr[-800:]); raise SystemExit(1)
enc = "-r 30 -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p -an"
def still(name, png, dur, fi, fo):
    f = []
    if fi: f.append("fade=t=in:st=0:d=0.4")
    if fo: f.append(f"fade=t=out:st={dur-0.4}:d=0.4")
    run(f'ffmpeg -y -v error -loop 1 -t {dur} -i {W}/{png}.png -vf "{",".join(f) or "null"}" {enc} {W}/{name}.mp4')
still('s_intro', 'intro', 5, True, False); still('s_st1', 'steps1', 2.5, False, False); still('s_st2', 'steps2', 2.5, False, False); still('s_st3', 'steps3', 4, False, True); still('s_outro', 'outro', 10, True, True)
dur = marks[-1]
N = len(marks) - 1
inputs = f'-loop 1 -framerate 30 -i {W}/appbg.png ' + ' '.join(f'-loop 1 -framerate 30 -i {W}/cap{i}.png' for i in range(N)) + f' -ss {ready} -t {dur} -i {R}'
fc = f'[{N+1}:v]crop=390:780:0:0,scale=735:1470:flags=lanczos,unsharp=5:5:0.7,setsar=1[v];[0:v][v]overlay=172:224[b0];'
prev = 'b0'
for i in range(N):
    s, e = marks[i], marks[i + 1]
    fc += f"[{prev}][{i+1}:v]overlay=0:0:enable='between(t,{s+0.15},{e-0.1})'[b{i+1}];"; prev = f'b{i+1}'
fc += f'[{prev}]fade=t=in:st=0:d=0.4,fade=t=out:st={dur-0.4}:d=0.4[out]'
run(f'ffmpeg -y -v error {inputs} -filter_complex "{fc}" -map "[out]" -t {dur} {enc} {W}/s_app.mp4')
open(f'{W}/list.txt', 'w').write(''.join(f"file '{W}/{s}.mp4'\n" for s in ['s_intro', 's_st1', 's_st2', 's_st3', 's_app', 's_outro']))
run(f'ffmpeg -y -v error -f concat -safe 0 -i {W}/list.txt -c copy {W}/video_only.mp4')
D = float(subprocess.run(f'ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 {W}/video_only.mp4', shell=True, capture_output=True, text=True).stdout)
run(f'ffmpeg -y -v error -i {W}/video_only.mp4 -i {W}/music.wav -filter_complex "[1:a]atrim=0:{D},afade=t=in:st=0:d=1.5,afade=t=out:st={D-2.7}:d=2.5[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -shortest {W}/final.mp4')
print('done')
