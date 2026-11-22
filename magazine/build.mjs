// Builds the magazine into ./public (static pages + SVG art). Run: node build.mjs
import fs from "node:fs";
import path from "node:path";
import { cover, panel } from "./lib/art.mjs";

const ROOT = new URL(".", import.meta.url).pathname, OUT = path.join(ROOT, "public"), C = path.join(ROOT, "content");
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SECTIONS = {
  pi: { name: "Pi Network", icon: "🪙", scene: "pi" }, tech: { name: "تقنية وذكاء اصطناعي", icon: "🤖", scene: "tech" },
  safety: { name: "نصائح وأمان", icon: "🛡️", scene: "safety" }, community: { name: "المجتمع", icon: "👥", scene: "community" },
  stories: { name: "قصص", icon: "📖", scene: "story" }, courses: { name: "دورات (English)", icon: "🎓", scene: "tech" }, docs: { name: "وثائقيات", icon: "🎬", scene: "desert" }, manga: { name: "مانغا", icon: "🎨", scene: "oasis" },
};
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };
const KEEPS = ["courses", "docs"].map((d) => [d, "/tmp/mag-keep-" + d]);
for (const [d, k] of KEEPS) { fs.rmSync(k, { recursive: true, force: true }); if (fs.existsSync(path.join(OUT, d))) fs.cpSync(path.join(OUT, d), k, { recursive: true }); }
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const [d, k] of KEEPS) if (fs.existsSync(k)) fs.cpSync(k, path.join(OUT, d), { recursive: true });

// ---- tiny markdown: headings, lists, bold/italic, links, paragraphs ----
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\[(.+?)\]\((.+?)\)/g, (m, a, u) => `<a href="${u.replace(/&amp;/g, "&")}"${/^https?:/.test(u) ? ' rel="noopener" target="_blank"' : ""}>${a}</a>`);
function md(src) {
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); list = null; } };
  for (const block of src.trim().split(/\n{2,}/)) {
    const ls = block.split("\n");
    if (ls.every((l) => /^- /.test(l))) { flush(); out.push(`<ul>${ls.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`); }
    else if (/^## /.test(block)) { flush(); out.push(`<h2>${inline(block.slice(3))}</h2>`); }
    else if (/^### /.test(block)) { flush(); out.push(`<h3>${inline(block.slice(4))}</h3>`); }
    else { flush(); out.push(`<p>${inline(ls.join(" "))}</p>`); }
  }
  flush(); return out.join("\n");
}
const front = (txt) => { const m = txt.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); const meta = {}; for (const l of m[1].split("\n")) { const i = l.indexOf(":"); meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); } return { meta, body: m[2] }; };
const readDir = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => { const { meta, body } = front(fs.readFileSync(path.join(d, f), "utf8")); return { slug: f.replace(/\.md$/, ""), ...meta, body }; }) : [];
const fdate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("ar-MA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const words = (b) => b.split(/\s+/).length;

// ---- content ----
const posts = [...readDir(path.join(C, "articles")).map((p) => ({ ...p, kind: "a", url: `/a/${p.slug}/` })), ...readDir(path.join(C, "stories")).map((p) => ({ ...p, kind: "story", url: `/story/${p.slug}/` }))].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
const series = fs.existsSync(path.join(C, "manga")) ? fs.readdirSync(path.join(C, "manga")).map((id) => { const dir = path.join(C, "manga", id), s = JSON.parse(fs.readFileSync(path.join(dir, "series.json"), "utf8")); s.chapters = s.chapters.map((c) => ({ ...c, ...JSON.parse(fs.readFileSync(path.join(dir, String(c.n).padStart(2, "0") + ".json"), "utf8")) })); return s; }) : [];
const vote = JSON.parse(fs.readFileSync(path.join(C, "vote.json"), "utf8"));

// ---- art files ----
for (const p of posts) write(`img/${p.kind}-${p.slug}.svg`, cover(p.cover || SECTIONS[p.section].scene, p.slug));
for (const k of Object.keys(SECTIONS)) write(`img/sec-${k}.svg`, cover(SECTIONS[k].scene, k));
for (const s of series) { write(`img/manga-${s.id}.svg`, cover(s.scene, s.id)); for (const c of s.chapters) c.panels.forEach((p, i) => write(`img/manga/${s.id}-${c.n}-${i + 1}.svg`, panel(p, i + 1))); }
const imgOf = (p) => `/img/${p.kind}-${p.slug}.svg`;

// ---- layout ----
const nav = Object.entries(SECTIONS).map(([k, s]) => `<a href="${k === "manga" ? "/manga/" : k === "courses" ? "/courses/" : k === "docs" ? "/docs/" : `/s/${k}/`}">${s.icon} ${s.name}</a>`).join("");
const layout = ({ title, desc, body, path: pth = "/", og, script = "" }) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${pth === "/" ? "" : " · " + SITE.name}</title><meta name="description" content="${esc(desc || SITE.tagline)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc || SITE.tagline)}"><meta property="og:type" content="article"><meta property="og:image" content="${SITE.baseUrl}${og || "/img/sec-community.svg"}">
<link rel="alternate" type="application/rss+xml" title="${SITE.name}" href="/feed.xml"><link rel="icon" href="/img/sec-community.svg"><link rel="stylesheet" href="/style.css"></head>
<body><header class="top"><a class="brand" href="/"><b>${SITE.name}</b><small>${SITE.tagline}</small></a><nav class="nav">${nav}</nav></header>
<main>${body}</main>
<footer><p>${SITE.name} · مجتمع Jerry Development · <a href="/about/">عن المجلة وقواعدها</a> · <a href="/feed.xml">RSS</a></p><p class="ai">تُنتج هذه المجلة (مقالات ورسومات وقصص) بمساعدة الذكاء الاصطناعي. المعلومات عامة وليست نصيحة مالية أو قانونية.</p></footer>
<script src="/app.js" defer></script>${script}</body></html>`;
const card = (p) => `<a class="card" href="${p.url}"><img src="${imgOf(p)}" alt="" loading="lazy"><div><span class="tag">${SECTIONS[p.section].icon} ${SECTIONS[p.section].name}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt || "")}</p><small>${fdate(p.date)}</small></div></a>`;
const subscribe = `<form class="sub" data-sub><h3>✉️ اشترك ليصلك جديد المجلة</h3><div><input type="email" name="email" required placeholder="بريدك الإلكتروني" autocomplete="email"><button>اشترك</button></div><p class="msg" role="status"></p></form>`;
const voteBox = `<section class="votebox" data-vote data-week="${vote.week}"><h2>🗳️ صوّت على موضوع الأسبوع القادم</h2><p>اضغط على الموضوع الذي تريده. الأكثر أصواتًا نكتب عنه.</p>${vote.topics.map((t) => `<button class="vt" data-id="${t.id}"><span>${esc(t.text)}</span><i></i><b>0</b></button>`).join("")}<p class="msg" role="status"></p></section>`;

// ---- pages ----
const hero = posts[0], rest = posts.slice(1);
write("index.html", layout({ title: SITE.name, desc: SITE.tagline, og: imgOf(hero), body: `
<section class="hero"><a href="${hero.url}"><img src="${imgOf(hero)}" alt=""><div><span class="tag">${SECTIONS[hero.section].icon} ${SECTIONS[hero.section].name}</span><h1>${esc(hero.title)}</h1><p>${esc(hero.excerpt)}</p></div></a></section>
<section class="chips">${Object.entries(SECTIONS).map(([k, s]) => `<a href="${k === "manga" ? "/manga/" : k === "courses" ? "/courses/" : k === "docs" ? "/docs/" : `/s/${k}/`}"><img src="/img/sec-${k}.svg" alt=""><span>${s.icon} ${s.name}</span></a>`).join("")}</section>
${series.length ? `<section><h2>🎨 مانغا</h2><div class="grid">${series.map((s) => `<a class="card" href="/manga/${s.id}/"><img src="/img/manga-${s.id}.svg" alt=""><div><span class="tag">🎨 مانغا</span><h3>${esc(s.title)}</h3><p>${esc(s.blurb)}</p><small>${s.chapters.length} فصل</small></div></a>`).join("")}</div></section>` : ""}
<section><h2>أحدث ما نُشر</h2><div class="grid">${rest.map(card).join("")}</div></section>
${voteBox}${subscribe}` }));
for (const [k, s] of Object.entries(SECTIONS)) {
  if (k === "manga" || k === "courses" || k === "docs") continue;
  const list = posts.filter((p) => p.section === k);
  write(`s/${k}/index.html`, layout({ title: s.name, path: `/s/${k}/`, og: `/img/sec-${k}.svg`, body: `<h1 class="sec"><img src="/img/sec-${k}.svg" alt="">${s.icon} ${s.name}</h1><div class="grid">${list.length ? list.map(card).join("") : "<p>لا يوجد شيء هنا بعد، عُد قريبًا.</p>"}</div>${subscribe}` }));
}
for (const p of posts) {
  const more = posts.filter((x) => x.slug !== p.slug && x.section === p.section).slice(0, 2).concat(posts.filter((x) => x.slug !== p.slug && x.section !== p.section)).slice(0, 3);
  write(`${p.kind === "a" ? "a" : "story"}/${p.slug}/index.html`, layout({ title: p.title, desc: p.excerpt, path: p.url, og: imgOf(p), body: `<article class="post"><a class="tag" href="/s/${p.section}/">${SECTIONS[p.section].icon} ${SECTIONS[p.section].name}</a><h1>${esc(p.title)}</h1><p class="meta">${fdate(p.date)} · ${Math.max(1, Math.round(words(p.body) / 180))} دقائق قراءة</p><img class="cov" src="${imgOf(p)}" alt="">${md(p.body)}</article>
<section class="comments" data-comments data-slug="${p.kind}-${p.slug}"><h2>💬 التعليقات</h2><div class="list"></div><form><input name="name" maxlength="30" placeholder="اسمك (اختياري)"><textarea name="text" required maxlength="500" rows="3" placeholder="اكتب تعليقك… (بدون روابط)"></textarea><button>أرسل</button><p class="msg" role="status"></p></form></section>
${subscribe}<section><h2>اقرأ أيضًا</h2><div class="grid">${more.map(card).join("")}</div></section>` }));
}
write("manga/index.html", layout({ title: "مانغا", path: "/manga/", og: "/img/sec-manga.svg", body: `<h1 class="sec"><img src="/img/sec-manga.svg" alt="">🎨 مانغا</h1><p>مانغا مرسومة بالكامل داخل المجلة. تُقرأ من اليمين إلى اليسار ومن الأعلى إلى الأسفل.</p><div class="grid">${series.map((s) => `<a class="card" href="/manga/${s.id}/"><img src="/img/manga-${s.id}.svg" alt=""><div><h3>${esc(s.title)}</h3><p>${esc(s.blurb)}</p><small>${s.chapters.length} فصل</small></div></a>`).join("")}</div>${subscribe}` }));
for (const s of series) {
  write(`manga/${s.id}/index.html`, layout({ title: s.title, desc: s.blurb, path: `/manga/${s.id}/`, og: `/img/manga-${s.id}.svg`, body: `<h1 class="sec"><img src="/img/manga-${s.id}.svg" alt="">${esc(s.title)}</h1><p>${esc(s.blurb)}</p><ol class="chap">${s.chapters.map((c) => `<li><a href="/manga/${s.id}/${c.n}/">الفصل ${c.n}: ${esc(c.title)}</a></li>`).join("")}</ol>${subscribe}` }));
  for (const c of s.chapters) {
    const prev = s.chapters.find((x) => x.n === c.n - 1), next = s.chapters.find((x) => x.n === c.n + 1);
    write(`manga/${s.id}/${c.n}/index.html`, layout({ title: `${s.title} · الفصل ${c.n}`, desc: c.title, path: `/manga/${s.id}/${c.n}/`, og: `/img/manga/${s.id}-${c.n}-1.svg`, body: `<h1>${esc(s.title)}<small>الفصل ${c.n}: ${esc(c.title)}</small></h1><div class="manga">${c.panels.map((p, i) => `<img src="/img/manga/${s.id}-${c.n}-${i + 1}.svg" alt="${esc(p.note || "")}" loading="${i < 2 ? "eager" : "lazy"}">`).join("")}</div><p class="nextprev">${prev ? `<a href="/manga/${s.id}/${prev.n}/">→ الفصل السابق</a>` : "<span></span>"}${next ? `<a href="/manga/${s.id}/${next.n}/">الفصل التالي ←</a>` : "<span>الفصل التالي قريبًا</span>"}</p>
<section class="comments" data-comments data-slug="manga-${s.id}-${c.n}"><h2>💬 التعليقات</h2><div class="list"></div><form><input name="name" maxlength="30" placeholder="اسمك (اختياري)"><textarea name="text" required maxlength="500" rows="3" placeholder="رأيك في الفصل…"></textarea><button>أرسل</button><p class="msg" role="status"></p></form></section>${subscribe}` }));
  }
}

// ---- courses (English video lessons; the MP4/SRT/TXT files are made by courses/make.mjs) ----
const CD = path.join(ROOT, "courses");
const courses = fs.readdirSync(CD).filter((d) => fs.statSync(path.join(CD, d)).isDirectory()).map((d) => { const lessons = fs.readdirSync(path.join(CD, d)).filter((f) => f.endsWith(".json")).sort().map((f) => ({ id: f.replace(".json", ""), ...JSON.parse(fs.readFileSync(path.join(CD, d, f), "utf8")) })).filter((l) => fs.existsSync(path.join(OUT, "courses", d, l.id + ".mp4"))); return { id: d, title: lessons[0] ? lessons[0].course : d, lessons }; }).filter((c) => c.lessons.length);
const mb = (p) => { const f = path.join(OUT, p); return fs.existsSync(f) ? (fs.statSync(f).size / 1048576).toFixed(1) : "0"; };
write("courses/index.html", layout({ title: "Free video courses (English)", desc: "Free English video courses: use AI the right way and work online the smart way.", path: "/courses/", og: "/img/sec-courses.svg", body: `<h1 class="sec" dir="ltr"><img src="/img/sec-courses.svg" alt="">🎓 Free video courses</h1><p dir="ltr">Short English video lessons with subtitles. Download the video, the subtitles and the voice-over script to share or republish.</p>${courses.map((c) => `<h2 dir="ltr">${esc(c.title)}</h2><div class="grid">${c.lessons.map((l) => `<a class="card" dir="ltr" href="/courses/${c.id}/${l.id}/"><img src="/img/course-${c.id}-${l.id}.svg" alt="" loading="lazy"><div><span class="tag">Lesson ${l.n}</span><h3>${esc(l.title)}</h3><p>${esc(l.summary)}</p></div></a>`).join("")}</div>`).join("")}${subscribe}` }));
for (const c of courses) for (const l of c.lessons) {
  write(`img/course-${c.id}-${l.id}.svg`, cover(l.slides[0].scene || "tech", c.id + l.id));
  const dir = `/courses/${c.id}/${l.id}`, nxt = c.lessons.find((x) => x.n === l.n + 1), prv = c.lessons.find((x) => x.n === l.n - 1);
  write(`courses/${c.id}/${l.id}/index.html`, layout({ title: `${c.title} · Lesson ${l.n}: ${l.title}`, desc: l.summary, path: `${dir}/`, og: `/img/course-${c.id}-${l.id}.svg`, body: `<article class="post" dir="ltr" lang="en"><a class="tag" href="/courses/">🎓 ${esc(c.title)}</a><h1>Lesson ${l.n}: ${esc(l.title)}</h1><p class="meta">${esc(l.summary)}</p>
<video class="vid" controls preload="metadata" playsinline poster="/img/course-${c.id}-${l.id}.svg"><source src="${dir}.mp4" type="video/mp4"><track kind="subtitles" src="${dir}.srt" srclang="en" label="English"></video>
<p class="dl"><a class="btn" href="${dir}.mp4" download>⬇ Video (MP4, ${mb(`courses/${c.id}/${l.id}.mp4`)} MB)</a> <a class="btn" href="${dir}.srt" download>⬇ Subtitles (SRT)</a> <a class="btn" href="${dir}.txt" download>⬇ Script + title and description</a></p>
<h2>What you will learn</h2><ul>${l.slides.filter((s) => s.k === "points").map((s) => `<li>${esc(s.h)}</li>`).join("")}</ul><h2>Transcript</h2>${l.slides.map((s) => `<p>${esc(s.say)}</p>`).join("")}
<p class="meta">Made with the help of AI. General information, not financial, legal or professional advice.</p><p class="nextprev">${prv ? `<a href="/courses/${c.id}/${prv.id}/">← Previous lesson</a>` : "<span></span>"}${nxt ? `<a href="/courses/${c.id}/${nxt.id}/">Next lesson →</a>` : "<span>More lessons soon</span>"}</p></article>${subscribe}` }));
}

// ---- documentaries: each episode has an English and an Arabic version (made by courses/make.mjs doc:all) ----
const DD = path.join(ROOT, "docs");
const docs = fs.existsSync(DD) ? fs.readdirSync(DD).filter((f) => f.endsWith(".json")).map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")) })).filter((d) => fs.existsSync(path.join(OUT, "docs", d.id, "en.mp4"))).sort((a, b) => a.n - b.n) : [];
write("docs/index.html", layout({ title: "وثائقيات جيري · Jerry Documentaries", desc: "وثائقيات قصيرة بنسختين: عربية وإنجليزية.", path: "/docs/", og: "/img/sec-docs.svg", body: `<h1 class="sec"><img src="/img/sec-docs.svg" alt="">🎬 وثائقيات جيري</h1><p>سلسلة وثائقية قصيرة، كل حلقة بنسختين: عربية وإنجليزية. · Short documentaries, each episode in Arabic and English.</p><div class="grid">${docs.map((d) => `<a class="card" href="/docs/${d.id}/"><img src="/img/doc-${d.id}.svg" alt="" loading="lazy"><div><span class="tag">🎬 ${d.n}</span><h3>${esc(d.title.ar)}</h3><p dir="ltr" style="text-align:left">${esc(d.title.en)}</p></div></a>`).join("")}</div>${subscribe}` }));
for (const d of docs) {
  write(`img/doc-${d.id}.svg`, cover(d.slides[0].scene || "desert", d.id));
  const vid = (lang) => `<h2 ${lang === "en" ? 'dir="ltr"' : ""}>${lang === "ar" ? "النسخة العربية" : "English version"}</h2><video class="vid" controls preload="metadata" playsinline poster="/img/doc-${d.id}.svg"><source src="/docs/${d.id}/${lang}.mp4" type="video/mp4"><track kind="subtitles" src="/docs/${d.id}/${lang}.srt" srclang="${lang}" label="${lang === "ar" ? "العربية" : "English"}" ${lang === "ar" ? "default" : ""}></video><p class="dl"><a class="btn" href="/docs/${d.id}/${lang}.mp4" download>⬇ ${lang === "ar" ? "الفيديو" : "Video"} (${mb(`docs/${d.id}/${lang}.mp4`)} MB)</a> <a class="btn" href="/docs/${d.id}/${lang}.srt" download>⬇ ${lang === "ar" ? "الترجمة SRT" : "Subtitles SRT"}</a> <a class="btn" href="/docs/${d.id}/${lang}.txt" download>⬇ ${lang === "ar" ? "النص والعنوان والوصف" : "Script, title, description"}</a></p>`;
  write(`docs/${d.id}/index.html`, layout({ title: `${d.title.ar} · ${d.title.en}`, desc: d.summary.ar, path: `/docs/${d.id}/`, og: `/img/doc-${d.id}.svg`, body: `<article class="post"><a class="tag" href="/docs/">🎬 وثائقيات جيري · الحلقة ${d.n}</a><h1>${esc(d.title.ar)}</h1><p class="meta" dir="ltr" style="text-align:left">${esc(d.title.en)}</p><p>${esc(d.summary.ar)}</p>${vid("ar")}${vid("en")}<h2>المصادر · Sources</h2><ul dir="ltr" style="text-align:left">${(d.sources || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="meta">أُنتج بمساعدة الذكاء الاصطناعي. معلومات عامة وتعليمية · Made with the help of AI. General educational information.</p></article>
<section class="comments" data-comments data-slug="doc-${d.id}"><h2>💬 التعليقات</h2><div class="list"></div><form><input name="name" maxlength="30" placeholder="اسمك (اختياري)"><textarea name="text" required maxlength="500" rows="3" placeholder="رأيك في الحلقة…"></textarea><button>أرسل</button><p class="msg" role="status"></p></form></section>${subscribe}` }));
}
write("about/index.html", layout({ title: "عن المجلة وقواعدها", path: "/about/", body: `<article class="post"><h1>عن المجلة وقواعد المجتمع</h1>${md(`## ما هي مجلة جيري؟

مجلة يومية لمجتمع **Jerry Development**: مقالات مبسّطة عن Pi Network والتقنية وبناء التطبيقات بالذكاء الاصطناعي، ونصائح أمان، ومانغا وقصص.

## من يصنعها؟ (شفافية)

تُكتب وتُرسم وتُدار بمساعدة الذكاء الاصطناعي (Claude من Anthropic) لصالح مجتمع Jerry Development. نحاول ذكر المصادر، لكن قد تقع أخطاء. إن لاحظت خطأً فاكتبه في التعليقات.

## أنتم تختارون

تصويت أسبوعي على المواضيع في الصفحة الرئيسية. والأكثر أصواتًا نكتب عنه.

## قواعد التعليقات

- احترم الجميع ولا شتائم ولا تحريض.
- ممنوع الروابط والإعلانات والاحتيال، وتُحذف تلقائيًا.
- لا تشارك كلمات السر أو مفاتيح المحفظة أو بياناتك الشخصية. لن نطلبها منك أبدًا.
- ما ننشره معلومات عامة وليس نصيحة مالية أو قانونية أو طبية.

## الخصوصية

نحفظ التعليق بالاسم الذي تكتبه، والبريد إن اشتركت بالنشرة، ونستعمل بصمة مجهولة مشفّرة من اتصالك لمنع السبام. لا نبيع البيانات ولا نستعمل ملفات تتبّع إعلانية.`)}</article>${subscribe}` }));
write("404.html", layout({ title: "الصفحة غير موجودة", body: `<h1>الصفحة غير موجودة</h1><p><a href="/">العودة للرئيسية</a></p>` }));
write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${SITE.name}</title><link>${SITE.baseUrl}/</link><description>${SITE.tagline}</description><language>ar</language>${posts.slice(0, 30).map((p) => `<item><title>${esc(p.title)}</title><link>${SITE.baseUrl}${p.url}</link><guid>${SITE.baseUrl}${p.url}</guid><pubDate>${new Date(p.date + "T12:00:00Z").toUTCString()}</pubDate><description>${esc(p.excerpt || "")}</description></item>`).join("")}</channel></rss>`);
// JSON feed read by the Pi Oasis app (through a service binding): newest manga chapters, posts and course lessons
const abs = (u) => SITE.baseUrl + u;
write("feed.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), site: SITE.baseUrl,
  manga: series.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, cover: abs(`/img/manga-${s.id}.svg`), chapters: s.chapters.slice().sort((a, b) => b.n - a.n).map((c) => ({ n: c.n, title: c.title, date: c.date || "", url: abs(`/manga/${s.id}/${c.n}/`), panels: c.panels.map((p, i) => abs(`/img/manga/${s.id}-${c.n}-${i + 1}.svg`)) })) })),
  posts: posts.slice(0, 30).map((p) => ({ kind: p.kind, section: p.section, title: p.title, excerpt: p.excerpt || "", date: p.date, url: abs(p.url), image: abs(imgOf(p)) })),
  docs: docs.map((d) => ({ n: d.n, title: d.title, summary: d.summary, url: abs(`/docs/${d.id}/`), image: abs(`/img/doc-${d.id}.svg`) })),
  courses: courses.flatMap((c) => c.lessons.map((l) => ({ course: c.title, n: l.n, title: l.title, url: abs(`/courses/${c.id}/${l.id}/`), image: abs(`/img/course-${c.id}-${l.id}.svg`) }))) }));
write("robots.txt", `User-agent: *\nAllow: /\n${SITE.baseUrl ? `Sitemap: ${SITE.baseUrl}/sitemap.xml\n` : ""}`);
if (SITE.baseUrl) write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/manga/", "/about/", ...Object.keys(SECTIONS).filter((k) => k !== "manga" && k !== "courses" && k !== "docs").map((k) => `/s/${k}/`), ...posts.map((p) => p.url), ...docs.flatMap((d) => [`/docs/${d.id}/`]), "/docs/", ...courses.flatMap((c) => ["/courses/", ...c.lessons.map((l) => `/courses/${c.id}/${l.id}/`)]), ...series.flatMap((s) => [`/manga/${s.id}/`, ...s.chapters.map((c) => `/manga/${s.id}/${c.n}/`)])].map((u) => `<url><loc>${SITE.baseUrl}${u}</loc></url>`).join("")}</urlset>`);
fs.copyFileSync(path.join(ROOT, "src/style.css"), path.join(OUT, "style.css")); fs.copyFileSync(path.join(ROOT, "src/app.js"), path.join(OUT, "app.js"));
console.log("built", posts.length, "posts,", series.reduce((n, s) => n + s.chapters.length, 0), "chapters");
