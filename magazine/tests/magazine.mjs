// Magazine API test on an in-memory SQLite standing in for D1. Run: node tests/magazine.mjs
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
const db = new DatabaseSync(":memory:");
const stmt = (sql, p = []) => ({ bind: (...b) => stmt(sql, b), first: async () => db.prepare(sql).get(...p) ?? null, all: async () => ({ results: db.prepare(sql).all(...p) }), run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
const env = { DB: { prepare: (s) => stmt(s), batch: async (l) => Promise.all(l.map((x) => x.run())) }, ASSETS: { fetch: async () => new Response("static") } };
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const call = (method, path, body, ip = "1.1.1.1") => worker.fetch(new Request("https://m.test" + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { "CF-Connecting-IP": ip } }), env).then(async (r) => ({ s: r.status, ...(r.headers.get("content-type")?.includes("json") ? await r.json() : { t: await r.text() }) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ok((await call("GET", "/a/x/")).t === "static", "pages are served from static files");
let r = await call("POST", "/api/comment", { slug: "a-test", name: "ali", text: "مقال جميل" });
ok(r.ok, "a comment is saved");
r = await call("GET", "/api/comments?slug=a-test");
ok(r.comments.length === 1 && r.comments[0].text === "مقال جميل" && r.comments[0].name === "ali" && !("who" in r.comments[0]), "it is listed and the fingerprint is never exposed");
ok((await call("POST", "/api/comment", { slug: "a-test", text: "x" })).error === "fast", "two comments within 20 seconds are refused");
ok((await call("POST", "/api/comment", { slug: "a-test", text: "visit http://scam.io now" }, "2.2.2.2")).error === "links", "links are refused");
ok((await call("POST", "/api/comment", { slug: "a-test", text: "see scam.com" }, "2.2.2.2")).error === "links", "bare domains are refused");
ok((await call("POST", "/api/comment", { slug: "a-test", text: "   " }, "2.2.2.2")).error === "empty", "empty comment refused");
ok((await call("POST", "/api/comment", { slug: "a-test", text: "a".repeat(501) }, "2.2.2.2")).error === "long", "over 500 characters refused");
ok((await call("POST", "/api/comment", { slug: "../bad", text: "x" }, "2.2.2.2")).error === "slug", "a bad slug is refused");
ok((await call("GET", "/api/comments?slug=other")).comments.length === 0, "comments are per page");
db.prepare("UPDATE comments SET hidden = 1").run();
ok((await call("GET", "/api/comments?slug=a-test")).comments.length === 0, "a hidden comment disappears");
// votes
r = await call("POST", "/api/vote", { week: "2026-W48", topic: "scams" }, "3.3.3.3");
ok(r.ok && r.counts.scams === 1, "a vote is counted");
r = await call("POST", "/api/vote", { week: "2026-W48", topic: "ai-apps" }, "3.3.3.3");
ok(r.counts["ai-apps"] === 1 && !r.counts.scams, "the same visitor can change the vote but not vote twice");
await call("POST", "/api/vote", { week: "2026-W48", topic: "scams" }, "4.4.4.4");
ok((await call("GET", "/api/votes?week=2026-W48")).counts.scams === 1, "votes are tallied per topic");
ok((await call("GET", "/api/votes?week=bad")).error === "week", "a bad week is refused");
// newsletter
ok((await call("POST", "/api/subscribe", { email: "Ali@Example.com" }, "5.5.5.5")).ok && db.prepare("SELECT email FROM subscribers").get().email === "ali@example.com", "a subscriber is saved in lowercase");
ok((await call("POST", "/api/subscribe", { email: "ali@example.com" }, "5.5.5.5")).ok && db.prepare("SELECT COUNT(*) AS n FROM subscribers").get().n === 1, "the same address twice is stored once");
ok((await call("POST", "/api/subscribe", { email: "nope" }, "6.6.6.6")).error === "email", "a bad address is refused");
ok((await call("GET", "/api/nothing")).s === 404, "unknown API paths are 404");
ok(db.prepare("SELECT COUNT(*) AS n FROM schema_meta").get().n === 1, "the schema version is stored once");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
