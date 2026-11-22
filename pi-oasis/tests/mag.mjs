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
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
