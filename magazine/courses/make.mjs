// Renders a lesson JSON into: MP4 (slides, silent), SRT (subtitles timed to the narration), TXT (voice-over script + upload text).
// Usage: node courses/make.mjs ai-right-way/01  (or: node courses/make.mjs all)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cover } from "../lib/art.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = new URL(".", import.meta.url).pathname, OUT = path.join(HERE, "../public/courses"), TMP = "/tmp/lesson-render";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WPS = 2.5; // narrated words per second (a calm teaching pace)
const dur = (s) => Math.max(5, Math.round((s.say.split(/\s+/).length / WPS + 0.8) * 10) / 10);

const slideHtml = (s, L, i, total) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;font-family:"DejaVu Sans",Arial,sans-serif;color:#fff;position:relative;overflow:hidden;background:#1b1308}
.bg{position:absolute;inset:0}.bg svg{width:100%;height:100%}.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(18,10,2,.88),rgba(18,10,2,.55) 60%,rgba(18,10,2,.25))}
.top{position:absolute;top:26px;left:48px;right:48px;display:flex;justify-content:space-between;font-size:22px;opacity:.9;letter-spacing:.5px}
.top b{color:#ffd34d}.main{position:absolute;left:64px;right:64px;top:110px;bottom:90px;display:flex;flex-direction:column;justify-content:center}
h1{font-size:${s.k === "title" ? 84 : 58}px;line-height:1.15;margin:0 0 20px;font-weight:800;text-shadow:0 3px 14px rgba(0,0,0,.6);white-space:pre-line}
.sub{font-size:52px;font-weight:700;color:#ffd34d;line-height:1.25;text-shadow:0 3px 12px rgba(0,0,0,.6)}
ul{list-style:none;margin:6px 0 0;padding:0}li{font-size:38px;line-height:1.35;margin:10px 0;padding-left:46px;position:relative;text-shadow:0 2px 8px rgba(0,0,0,.6)}
li:before{content:"";position:absolute;left:0;top:14px;width:26px;height:26px;border-radius:50%;background:#2b9d7a;box-shadow:0 0 0 4px rgba(43,157,122,.35)}
.bar{position:absolute;left:0;right:0;bottom:0;height:62px;background:rgba(12,7,1,.92);display:flex;align-items:center;justify-content:space-between;padding:0 48px;font-size:22px;color:#e8d6b0}
.prog{position:absolute;left:0;bottom:62px;height:6px;width:${Math.round(((i + 1) / total) * 100)}%;background:#ffd34d}
</style></head><body><div class="bg">${cover(s.scene || "desert", L.course + i).replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ')}</div><div class="shade"></div>
<div class="top"><span><b>${esc(L.course)}</b></span><span>Lesson ${L.n} · ${i + 1}/${total}</span></div>
<div class="main">${s.k === "title" ? `<div style="font-size:34px;color:#ffd34d;margin-bottom:10px">${esc(s.h)}</div><h1>${esc(s.sub)}</h1><div style="font-size:30px;opacity:.9">${esc(L.course)} · Jerry Development</div>` : s.k === "statement" ? `<h1>${esc(s.h)}</h1>` : `<h1 style="font-size:50px">${esc(s.h)}</h1><ul>${(s.pts || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`}</div>
<div class="prog"></div><div class="bar"><span>Jerry Development · Free course</span><span>jerry-magazine.jaouich.workers.dev</span></div></body></html>`;

const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`; };
function srt(slides) { // each narration sentence is a subtitle, timed in proportion to its length inside its slide
  let t = 0, n = 1, out = "";
  for (const s of slides) {
    const d = dur(s), sents = s.say.match(/[^.!?]+[.!?]*/g).map((x) => x.trim()).filter(Boolean), tot = sents.reduce((a, x) => a + x.length, 0);
    let c = t + 0.2;
    for (const x of sents) { const len = ((d - 0.4) * x.length) / tot; out += `${n++}\n${ts(c)} --> ${ts(c + len)}\n${x}\n\n`; c += len; }
    t += d;
  }
  return out;
}

async function render(rel) {
  const L = JSON.parse(fs.readFileSync(path.join(HERE, rel + ".json"), "utf8")), [course, num] = rel.split("/");
  const dir = path.join(OUT, course); fs.mkdirSync(dir, { recursive: true }); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const list = [];
  for (let i = 0; i < L.slides.length; i++) { await p.setContent(slideHtml(L.slides[i], L, i, L.slides.length)); await p.screenshot({ path: `${TMP}/s${i}.png` }); list.push(`file 's${i}.png'\nduration ${dur(L.slides[i])}`); }
  await b.close();
  list.push(`file 's${L.slides.length - 1}.png'`);
  fs.writeFileSync(`${TMP}/list.txt`, list.join("\n"));
  const total = L.slides.reduce((a, s) => a + dur(s), 0);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-i", `${TMP}/list.txt`, "-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=44100:cl=stereo", "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "30", "-tune", "stillimage", "-c:a", "aac", "-b:a", "48k", "-shortest", "-movflags", "+faststart", path.join(dir, num + ".mp4")]);
  fs.writeFileSync(path.join(dir, num + ".srt"), srt(L.slides));
  const script = L.slides.map((s, i) => `[Slide ${i + 1} · ${dur(s)}s]\n${s.say}`).join("\n\n");
  const hashtags = "#AI #ArtificialIntelligence #LearnAI #OnlineWork #Freelance #FreeCourse #JerryDevelopment";
  fs.writeFileSync(path.join(dir, num + ".txt"), `${L.course} · Lesson ${L.n}: ${L.title}\nLength: ${Math.round(total)} seconds (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})\n\n=== TITLE (YouTube / Facebook) ===\n${L.course} | Lesson ${L.n}: ${L.title}\n\n=== DESCRIPTION ===\n${L.summary}\n\nPart of the free course "${L.course}" by Jerry Development. More lessons: https://jerry-magazine.jaouich.workers.dev/courses/\n\nThis video was produced with the help of AI (script, slides and illustrations). The information is general and not financial, legal or professional advice.\n\n${hashtags}\n\n=== VOICE-OVER SCRIPT (read it, or paste it into a text-to-speech tool; slides are timed for a calm pace of about 150 words per minute) ===\n${script}\n`);
  const kb = Math.round(fs.statSync(path.join(dir, num + ".mp4")).size / 1024);
  console.log(rel, Math.round(total) + "s", kb + " KB");
  return { rel, total, kb, L };
}
const arg = process.argv[2] || "all";
const all = fs.readdirSync(HERE).filter((d) => fs.statSync(path.join(HERE, d)).isDirectory()).flatMap((d) => fs.readdirSync(path.join(HERE, d)).filter((f) => f.endsWith(".json")).map((f) => d + "/" + f.replace(".json", "")));
for (const r of arg === "all" ? all : [arg]) await render(r);
