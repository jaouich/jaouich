// Date shop: 5000 dates per 1 Pi. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });

const A = (await post("/api/auth", { accessToken: "tokA" })).session;          // alice
const Bo = (await post("/api/auth", { accessToken: "tokB", ref: "alice" })).session; // bob, invited by alice
const H = { Authorization: "Bearer " + Bo };
const me = await fetch(B + "/api/me", { headers: H }).then((r) => r.json());
const d0 = me.state.dates, score0 = me.state.week.score;

await pay({ id: "dp1", uid: "uB", amount: 1, type: "dates", pack: "d5k", txid: "tx1" });
let r = await post("/api/payments/approve", { paymentId: "dp1" }, H);
ok(r.ok === true, "1 Pi pack approved");
r = await post("/api/payments/complete", { paymentId: "dp1", txid: "tx1" }, H);
ok(r.ok && r.state.dates === d0 + 5000, "1 Pi = +5,000 dates (shown right away)");
ok(r.state.week.score === score0, "bought dates don't count toward the weekly ranking");
r = await post("/api/payments/complete", { paymentId: "dp1", txid: "tx1" }, H);
const after = await fetch(B + "/api/me", { headers: H }).then((x) => x.json());
ok(after.state.dates === d0 + 5000, "completing twice never adds twice");
ok(!after.account.vipUntil || after.account.vipUntil < Date.now(), "a date pack doesn't give a membership");

await pay({ id: "dp2", uid: "uB", amount: 0.5, type: "dates", pack: "d5k", txid: "tx2" });
ok((await post("/api/payments/approve", { paymentId: "dp2" }, H)).s === 400, "wrong price (0.5 Pi for the 5,000 pack) refused");
await pay({ id: "dp3", uid: "uB", amount: 1, type: "dates", pack: "d999k", txid: "tx3" });
ok((await post("/api/payments/approve", { paymentId: "dp3" }, H)).s === 400, "unknown pack refused");

await pay({ id: "dp4", uid: "uB", amount: 5, type: "dates", pack: "d25k", txid: "tx4" });
await post("/api/payments/approve", { paymentId: "dp4" }, H);
r = await post("/api/payments/complete", { paymentId: "dp4", txid: "tx4" }, H);
ok(r.state.dates === d0 + 30000, "5 Pi = +25,000 dates");

const ref = await sql("SELECT ref_balance FROM users WHERE username='alice'");
ok(Math.abs(ref[0].ref_balance - (1 + 5) * 0.7 * 0.1) < 1e-6, "inviter gets 10% of net (0.42 Pi)");
const pool = await sql("SELECT prize_pool FROM weeks ORDER BY id DESC LIMIT 1");
ok(Math.abs(pool[0].prize_pool - 6 * 0.7 * 0.15) < 1e-6, "15% of net goes to the weekly prize pool");
const vip = await fetch(B + "/api/me", { headers: H }).then((x) => x.json());
ok(vip.state.city && vip.state.animals, "the rest of the game is untouched");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
