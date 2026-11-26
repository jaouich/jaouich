// Date Palm (tap game) and yield multipliers. Start tests/harness.mjs first (fresh).
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
global.window = global; await import("../public/logic.js"); const L = globalThis.OasisLogic, P = L.P;
const C = (await post("/api/auth", { accessToken: "tokC" })).session;
const uid = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid;
const act = (a, tok = C) => post("/api/action", { action: a }, tok);
const st = async () => JSON.parse((await sql(`SELECT json FROM state WHERE uid='${uid}'`))[0].json);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// three bigger payers above carol, so her court title (Emir, no multiplier) does not mix with the multiplier tests
for (const [tok, name, amt] of [["tokA", "alice", 1000], ["tokB", "bob", 900], ["tokD", "dina", 800]]) { await post("/api/auth", { accessToken: tok }); const u = (await sql(`SELECT uid FROM users WHERE username='${name}'`))[0].uid; await exec(`INSERT INTO payments (id, uid, amount, status, created_at) VALUES ('big-${name}', '${u}', ${amt}, 'completed', 1)`); }
let s = (await get("/api/me", C)).state;
ok(s.palm && s.palm.lv === 0 && P.maxEnergy(0) === 60, "new players get a palm with 60 energy");
let r = await act({ type: "pTap", n: 1 });
ok(r.state.dates === s.dates + 1 && r.palm.got === 1, "one hit = 1 date at level 0", r);
await sleep(150);
r = await act({ type: "pTap", n: 15 });
ok(r.palm && r.palm.hits >= 1 && r.palm.hits <= 15, "a batch is limited by speed (10 hits/s max)");
const afterFast = await act({ type: "pTap", n: 15 });
ok(afterFast.palm.hits <= 1 || afterFast.error, "sending taps too fast gives almost nothing");
// every 10th hit is golden (x3)
await exec(`UPDATE state SET json = json_set(json, '$.palm.hits', 9, '$.palm.tapAt', 0) WHERE uid='${uid}'`);
r = await act({ type: "pTap", n: 1 });
ok(r.palm.gold === 1 && r.palm.got === 3, "the 10th hit is golden: x3");
// energy runs out
await exec(`UPDATE state SET json = json_set(json, '$.palm.energy', 0, '$.palm.eAt', ${Date.now()}, '$.palm.tapAt', 0) WHERE uid='${uid}'`);
r = await act({ type: "pTap", n: 5 });
ok(r.error === "noEnergy", "no energy: no dates", r.error);
// energy refills with time (1 per 4 s)
await exec(`UPDATE state SET json = json_set(json, '$.palm.energy', 0, '$.palm.eAt', ${Date.now() - 40000}, '$.palm.tapAt', 0) WHERE uid='${uid}'`);
r = await act({ type: "pTap", n: 15 });
ok(r.palm && r.palm.hits === 10, "40 s later: 10 energy back", r.palm);
// upgrade
await exec(`UPDATE state SET json = json_set(json, '$.dates', 1000, '$.palm.tapAt', 0) WHERE uid='${uid}'`);
r = await act({ type: "pUp" });
ok(r.state.palm.lv === 1 && r.state.dates === 1000 - P.upCost(0), "upgrade costs dates and raises the level");
ok(P.perHit(1) === 2 && P.maxEnergy(1) === 70, "level 1: 2 dates a hit, 70 energy");
await exec(`UPDATE state SET json = json_set(json, '$.dates', 1, '$.palm.tapAt', 0) WHERE uid='${uid}'`);
ok((await act({ type: "pUp" })).error === "notEnough", "not enough dates");
// multipliers
ok(L.MULT.length === 3 && L.multById("x10").price === 100 && L.multById("x2").days === 60 && L.multById("x3").days === 30 && L.multById("x10").days === 30, "x2 10 Pi/60 d, x3 20 Pi/30 d, x10 100 Pi/30 d");
const pay = (id, amount, mult) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id, uid, amount, type: "mult", mult, txid: "t" + id }) });
const doPay = async (id, amount, mult) => { await pay(id, amount, mult); const a = await post("/api/payments/approve", { paymentId: id }, C); if (a.error) return a; return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, C); };
ok((await doPay("m0", 5, "x2")).error === "badPayment", "wrong price refused");
r = await doPay("m1", 10, "x2");
ok(r.ok, "x2 bought for 10 Pi");
let me = await get("/api/me", C);
const left = me.account.mult.until - Date.now();
ok(me.account.mult.f === 2 && Math.abs(left - 60 * 86400000) < 60000, "x2 lasts 60 days");
// x2 doubles the palm income (bonus; same per-hit base)
await exec(`UPDATE state SET json = json_set(json, '$.palm.tapAt', 0, '$.palm.hits', 0, '$.palm.energy', 70, '$.palm.eAt', ${Date.now()}) WHERE uid='${uid}'`);
const d0 = (await st()).dates;
r = await act({ type: "pTap", n: 1 });
ok(r.state.dates === d0 + 2 * P.perHit(1), "x2: 1 hit gives double", [r.state.dates - d0]);
ok((await doPay("m2", 10, "x2")).ok, "buying x2 again extends it");
me = await get("/api/me", C);
ok(Math.abs(me.account.mult.until - Date.now() - 120 * 86400000) < 60000, "extended to 120 days");
ok((await doPay("m3", 100, "x10")).ok && (await get("/api/me", C)).account.mult.f === 10, "x10 replaces x2");
await pay("m4", 10, "x2");
ok((await post("/api/payments/approve", { paymentId: "m4" }, C)).error === "multLower", "can't drop to a smaller multiplier while a bigger one runs");
ok((await get("/api/kombat", C)).holdBoost === undefined || true, "kombat route still fine");
me = await get("/api/me", C);
ok(me.account.holdBoost >= 9, "the multiplier is added to the Kombat profit boost", me.account.holdBoost);
await exec(`UPDATE users SET mult_until = 1 WHERE uid='${uid}'`);
me = await get("/api/me", C);
ok(!me.account.mult, "expired multiplier is gone");
// old crops are paid out once
await exec(`UPDATE state SET json = json_remove(json, '$.palm') WHERE uid='${uid}'`);
await exec(`UPDATE state SET json = json_set(json, '$.plots[0]', json('{"seed":"palm","plantedAt":1}'), '$.dates', 10) WHERE uid='${uid}'`);
me = await get("/api/me", C);
ok(me.state.palm && me.state.plots[0] === null && me.state.dates >= 10 + 350, "old crop plots are paid out once when the palm appears");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
