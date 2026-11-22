// The magazine feed inside the app. Start tests/harness.mjs first (it serves the magazine feed through a fake service binding).
const B = "http://localhost:3457";
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const r = await fetch(B + "/api/mag"); const d = await r.json();
ok(r.status === 200 && Array.isArray(d.manga) && Array.isArray(d.posts) && Array.isArray(d.courses), "the feed has manga, posts and courses");
ok(d.manga.length >= 1 && d.manga[0].chapters.length >= 2 && d.manga[0].chapters[0].n > d.manga[0].chapters[1].n, "chapters are listed newest first");
ok(d.manga[0].chapters[0].panels.length === 8 && d.manga[0].chapters[0].panels.every((u) => /^https:\/\/.+\.svg$/.test(u)), "every chapter has its 8 panel pictures as absolute https URLs");
ok(d.manga[0].chapters.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date)), "every chapter has a date (used for the NEW badge)");
ok(d.posts.every((p) => p.url.startsWith("https://") && p.image.startsWith("https://") && p.title), "posts have links, images and titles");
// daily notification for a fresh chapter (only chapters from the last 3 days are announced)
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
await post("/api/auth", { accessToken: "tokC", lang: "ar" }); await post("/api/auth", { accessToken: "tokB", lang: "fr" });
const newestDate = d.manga.flatMap((x) => x.chapters.map((c) => c.date)).sort().pop();
const fresh = Date.now() - Date.parse(newestDate + "T00:00:00Z") <= 3 * 86400000;
await fetch(B + "/__test/cron");
const list = async () => (await (await fetch(B + "/__test/notifs")).json()).filter((x) => /manga|مانغا/i.test(x.title));
let n = await list();
if (fresh) ok(n.some((x) => x.user_uid === "uC" && x.title === "🎨 فصل مانغا جديد" && x.subroute === "/?go=mag") && n.some((x) => x.user_uid === "uB" && x.title === "🎨 Nouveau chapitre de manga"), "players are told about the new chapter in their language, with a link to the reader");
else ok(n.length === 0, "an old chapter is not announced");
const before = n.length; await fetch(B + "/__test/cron");
ok((await list()).length === before, "the same chapter is never announced twice");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
