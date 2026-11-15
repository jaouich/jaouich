// Points market (25% tax, withdraw from 5 Pi) and lucky wheel. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC");
await post("/api/action", { action: { type: "kSync", taps: 0 } }, HB);
await exec("UPDATE state SET json = json_set(json, '$.dates', 50000, '$.kombat.coins', 900000) WHERE uid='uB'");

// ---- selling
ok((await post("/api/mk/offer", { kind: "dates", amount: 10, pi: 1 }, HB)).error === "mk.minDates", "too few dates refused");
ok((await post("/api/mk/offer", { kind: "dates", amount: 999999, pi: 1 }, HB)).error === "mk.notEnough", "can't sell more than you have");
let r = await post("/api/mk/offer", { kind: "dates", amount: 20000, pi: 8 }, HB);
ok(r.ok && r.state.dates === 30000, "bob lists 20,000 dates for 8 Pi: they leave his game");
r = await post("/api/mk/offer", { kind: "coins", amount: 400000, pi: 2 }, HB);
ok(r.ok && r.state.kombat.coins === 500000, "bob lists 400,000 coins for 2 Pi");
let m = await get("/api/mk", HC);
ok(m.offers.length === 2 && m.offers[0].kind === "coins" && m.offers[0].seller === "bob" && m.tax === 0.25, "market lists offers, cheapest per point first");
const oD = m.offers.find((x) => x.kind === "dates").id, oC = m.offers.find((x) => x.kind === "coins").id;

// ---- buying
await pay({ id: "mo", uid: "uB", amount: 8, type: "mk", offer: oD, txid: "x0" });
ok((await post("/api/payments/approve", { paymentId: "mo" }, HB)).error === "mk.own", "you can't buy your own offer");
await pay({ id: "mb", uid: "uC", amount: 7, type: "mk", offer: oD, txid: "x1" });
ok((await post("/api/payments/approve", { paymentId: "mb" }, HC)).s === 400, "a price different from the offer is refused");
const d0 = (await get("/api/me", HC)).state.dates;
await pay({ id: "m1", uid: "uC", amount: 8, type: "mk", offer: oD, txid: "x2" });
ok((await post("/api/payments/approve", { paymentId: "m1" }, HC)).ok, "carol's payment holds the offer");
await pay({ id: "m2", uid: "uA", amount: 8, type: "mk", offer: oD, txid: "x3" });
ok((await post("/api/payments/approve", { paymentId: "m2" }, HA)).error === "mk.taken", "a second buyer can't take a held offer");
ok((await post("/api/mk/cancel", { id: oD }, HB)).error === "mk.busy", "seller can't cancel while a buyer is paying");
r = await post("/api/payments/complete", { paymentId: "m1", txid: "x2" }, HC);
ok(r.state.dates === d0 + 20000, "carol receives the 20,000 dates");
ok(r.state.week.score === 0, "bought dates don't count in the weekly ranking");
let bal = (await get("/api/me", HB)).account.mkBalance;
ok(Math.abs(bal - 6) < 1e-9, "bob's sales balance shows 6 Pi (8 Pi minus 25% tax)");
const pool = await sql("SELECT COALESCE(SUM(prize_pool), 0) AS p FROM weeks");
ok(Math.abs(pool[0].p - 2 * 0.15) < 1e-9, "15% of the tax feeds the weekly prize pool");
await post("/api/payments/complete", { paymentId: "m1", txid: "x2" }, HC);
ok(Math.abs((await get("/api/me", HB)).account.mkBalance - 6) < 1e-9, "completing twice never pays twice");

// ---- cancel returns the points
r = await post("/api/mk/cancel", { id: oC }, HB);
ok(r.ok && r.state.kombat.coins === 900000, "cancelling returns the 400,000 coins");
ok((await post("/api/mk/cancel", { id: oC }, HB)).error === "mk.busy" || (await get("/api/me", HB)).state.kombat.coins === 900000, "cancelling again returns nothing more");

// ---- withdraw
ok((await post("/api/mk/withdraw", {}, HC)).error === "mk.minWithdraw", "no withdrawal below 5 Pi");
r = await post("/api/mk/withdraw", {}, HB);
ok(r.ok && r.amount === 6 && r.account.mkBalance === 0, "bob withdraws 6 Pi");
const po = await sql("SELECT amount, status FROM payouts WHERE kind = 'withdraw' AND uid = 'uB'");
ok(po.length === 1 && po[0].amount === 6 && po[0].status === "completed", "the 6 Pi are sent to bob's Pi wallet");
ok((await post("/api/mk/withdraw", {}, HB)).error === "mk.minWithdraw", "nothing left to withdraw");

// ---- wheel
let me = (await get("/api/me", HC)).account;
ok(me.wheelFree === true && me.wheelSpins === 0, "one free spin a day");
r = await post("/api/wheel/spin", {}, HC);
ok(r.ok && r.free && r.i >= 0 && r.i < 12 && r.prize.t !== "pi", "free spin gives one of the 12 prizes (never Pi)");
const extra = r.prize.t === "respin" ? 1 : 0;
if (!extra) ok((await post("/api/wheel/spin", {}, HC)).error === "wh.none", "no second free spin the same day"); else ok(true, "(won a re-spin)");
await exec("UPDATE users SET wheel_spins = 0 WHERE uid='uC'");
await pay({ id: "w1", uid: "uC", amount: 0.5, type: "spins", txid: "x9" });
await post("/api/payments/approve", { paymentId: "w1" }, HC);
r = await post("/api/payments/complete", { paymentId: "w1", txid: "x9" }, HC);
ok(r.account.wheelSpins === 10, "0.5 Pi = 10 spins");
await pay({ id: "w2", uid: "uC", amount: 0.1, type: "spins", txid: "x10" });
ok((await post("/api/payments/approve", { paymentId: "w2" }, HC)).s === 400, "wrong price for spins refused");
const seen = {}; let left = 10, guard = 0;
await exec("UPDATE users SET wheel_spins = 300 WHERE uid='uC'");
for (let k = 0; k < 300; k++) { const x = await post("/api/wheel/spin", {}, HC); if (x.error) break; seen[x.prize.t] = (seen[x.prize.t] || 0) + 1; guard++; }
ok(guard === 300 && seen.dates > 60 && seen.coins > 60 && seen.jry > 5 && seen.respin > 5, "300 spins: prizes follow the chances (" + JSON.stringify(seen) + ")");
me = await get("/api/me", HC);
ok(me.account.jryPts >= 10 * (seen.jry || 0) && me.account.wheelSpins === (seen.respin || 0), "JRY prizes and re-spins are credited");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
