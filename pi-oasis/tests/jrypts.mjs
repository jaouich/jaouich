// JRY in-game currency: buy with Pi, holder perk, swap for coins / dates. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
await post("/api/auth", { accessToken: "tokA" });
const H = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokB", ref: "alice" })).session };

let me = await get("/api/me", H);
ok(me.account.jryPts === 0, "starts with 0 JRY");
await pay({ id: "jp1", uid: "uB", amount: 1, type: "jrypts", pack: "j1k", txid: "t1" });
ok((await post("/api/payments/approve", { paymentId: "jp1" }, H)).ok, "1 Pi pack approved");
let r = await post("/api/payments/complete", { paymentId: "jp1", txid: "t1" }, H);
ok(r.account.jryPts === 1000, "1 Pi = 1,000 JRY");
await post("/api/payments/complete", { paymentId: "jp1", txid: "t1" }, H);
ok((await get("/api/me", H)).account.jryPts === 1000, "completing twice never adds twice");
await pay({ id: "jp2", uid: "uB", amount: 5, type: "jrypts", pack: "j5k", txid: "t2" });
await post("/api/payments/approve", { paymentId: "jp2" }, H);
r = await post("/api/payments/complete", { paymentId: "jp2", txid: "t2" }, H);
ok(r.account.jryPts === 6500, "5 Pi pack = 5,500 JRY (bonus)");
await pay({ id: "jp3", uid: "uB", amount: 0.1, type: "jrypts", pack: "j5k", txid: "t3" });
ok((await post("/api/payments/approve", { paymentId: "jp3" }, H)).s === 400, "wrong price refused");
const ref = await sql("SELECT ref_balance FROM users WHERE username='alice'");
ok(Math.abs(ref[0].ref_balance - 6 * 0.7 * 0.1) < 1e-6, "JRY sales pay the inviter's 10% like other purchases");
ok(r.account.jryHeld >= 6500, "JRY counts as held for holder perks");

const c0 = (r.state.kombat && r.state.kombat.coins) || 0, d0 = r.state.dates;
r = await post("/api/jrypts/swap", { n: 100, to: "coins" }, H);
ok(r.got === 22000 && r.state.kombat.coins === c0 + 22000 && r.account.jryPts === 6400, "100 JRY → 22,000 Kombat coins");
r = await post("/api/jrypts/swap", { n: 200, to: "dates" }, H);
ok(r.got === 1100 && r.state.dates === d0 + 1100 && r.account.jryPts === 6200, "200 JRY → 1,100 dates");
ok((await post("/api/jrypts/swap", { n: 5, to: "coins" }, H)).error === "jp.min", "minimum swap");
ok((await post("/api/jrypts/swap", { n: 999999, to: "coins" }, H)).error === "jp.notEnough", "can't spend more than you have");
ok((await get("/api/me", H)).account.jryPts === 6200, "balance unchanged after refused swaps");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
