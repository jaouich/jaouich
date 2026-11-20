// Owner JRY distribution + weekly JRY. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const notifs = () => fetch(B + "/__test/notifs").then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok, lang: "ar" })).session });
const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC");
const jry = async (u) => (await sql(`SELECT jry_pts FROM users WHERE uid='${u}'`))[0].jry_pts;
const weekId = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };

ok((await post("/api/admin/jrydrop", { amount: 100, target: "all" }, HB)).s === 403, "only the owner gives JRY");
await exec("UPDATE state SET updated_at = 0 WHERE uid = 'uB'"); // bob hasn't played for a while
let r = await post("/api/admin/jrydrop", { preview: true, target: "active" }, HA);
ok(r.players === 2, "preview: 2 active players this week");
const b0 = await jry("uB"), c0 = await jry("uC");
r = await post("/api/admin/jrydrop", { amount: 250, target: "active", note: "شكرا على اللعب" }, HA);
ok(r.ok && r.players === 2 && r.total === 500, "250 JRY to each active player");
ok(await jry("uC") === c0 + 250 && await jry("uB") === b0, "active players got it, inactive didn't");
const n = (await notifs()).filter((x) => x.title.includes("+250 JRY"));
ok(n.length === 2 && n[0].body === "شكرا على اللعب" && n[0].title.startsWith("💠"), "players told with a Pi notification (their message)");
r = await post("/api/admin/jrydrop", { amount: 40, target: "names", names: "Bob, carol @nobody" }, HA);
ok(r.players === 2 && await jry("uB") === b0 + 40, "by usernames (unknown names skipped)");
await exec("INSERT INTO airdrop_block (username, at) VALUES ('bob', 1)");
r = await post("/api/admin/jrydrop", { amount: 10, target: "all" }, HA);
ok(await jry("uB") === b0 + 40, "blocked accounts never receive JRY");
ok((await post("/api/admin/jrydrop", { amount: 0, target: "all" }, HA)).error === "badAction" && (await post("/api/admin/jrydrop", { amount: 200000, target: "all" }, HA)).error === "badAction", "amount must be 1 to 100,000");
ok((await post("/api/admin/jrydrop", { amount: 5, target: "names", names: "ghost" }, HA)).error === "jd.nobody", "nobody to send to");
ok(r.list.length === 3, "history of distributions");

// weekly JRY for the top 100
const last = weekId(Date.now() - 7 * 86400000);
await exec(`INSERT INTO week_scores (week_id, uid, score, updated_at) VALUES (${last}, 'uC', 900, 1)`);
const c1 = await jry("uC");
await fetch(B + "/__test/cron");
ok(await jry("uC") === c1 + 500, "weekly #1 also gets 500 JRY");
ok((await notifs()).some((x) => x.user_uid === "uC" && x.body.includes("+500 JRY")), "weekly notification mentions the JRY");
// usage figures
await exec("UPDATE users SET jry_pts = 1000 WHERE uid = 'uC'");
const sw = await post("/api/jrypts/swap", { n: 200, to: "dates" }, HC);
ok(sw.ok, "a player spends 200 JRY");
const st = await fetch(B + "/api/admin/jrystats", { headers: HA }).then((x) => x.json());
ok(st.spentWeek === 200 && st.users30 === 1 && st.supply >= 800 && st.top[0].username === "carol" && st.dropped > 0, "JRY stats: supply, spending, holders, given");
ok((await fetch(B + "/api/admin/jrystats", { headers: HB })).status === 403, "stats are for the owner only");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
