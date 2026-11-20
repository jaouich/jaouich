// Pi Notification Center. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const notifs = () => fetch(B + "/__test/notifs").then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const weekId = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };

await post("/api/auth", { accessToken: "tokC", lang: "ar" });
await post("/api/auth", { accessToken: "tokB", lang: "fr" });
await post("/api/auth", { accessToken: "tokA", lang: "xx" });
ok((await sql("SELECT lang FROM users WHERE uid='uC'"))[0].lang === "ar" && (await sql("SELECT lang FROM users WHERE uid='uA'"))[0].lang == null, "language saved at sign-in (only ar/en/fr)");

const last = weekId(Date.now() - 7 * 86400000);
await exec(`INSERT INTO week_scores (week_id, uid, score, updated_at) VALUES (${last}, 'uC', 900, 1), (${last}, 'uB', 500, 2);
  INSERT INTO kombat_weeks (week_id, uid, earned, updated_at) VALUES (${last}, 'uB', 7000, 1);
  INSERT INTO derby_weeks (week_id, uid, pts, updated_at) VALUES (${last}, 'uC', 40, 1);`);
await fetch(B + "/__test/cron");
let n = await notifs();
const c = n.filter((x) => x.user_uid === "uC"), b = n.filter((x) => x.user_uid === "uB");
ok(c.some((x) => x.title === "🏆 ترتيب الأسبوع: المركز 1" && x.body.includes("50,000") && x.subroute === "/?go=rank"), "weekly #1 told in Arabic, opens the ranking");
ok(b.some((x) => x.title === "🏆 Classement : 2e place"), "weekly #2 told in French");
ok(b.some((x) => x.title.startsWith("⚔️ Tournoi Kombat : 1e") && x.subroute === "/?go=kombat"), "Kombat tournament winner told to collect");
ok(c.some((x) => x.title === "🏁 سباق الجمال: المركز 1" && x.subroute === "/?go=derby"), "Derby weekly winner told");
const count = n.length;
await fetch(B + "/__test/cron");
ok((await notifs()).length === count, "never sent twice");
ok((await sql("SELECT COUNT(*) AS n FROM notif_log"))[0].n === count, "every notification logged once");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
