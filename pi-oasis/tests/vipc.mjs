// VIP Club: 5 Pi a month, Hall of Glory, Sultan's Caravan, free entry (codes / grant / wheel / podium). Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then(async (r) => { const j = await r.json().catch(() => ({})); j.s = r.status; return j; });
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC"), HD = await H("tokD");
global.window = global; await import("../public/vip-logic.js"); const V = globalThis.VipLogic;
const buy = async (h, uid, id, amount) => { await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id, uid, amount, type: "vipclub", txid: "t" + id }) }); const a = await post("/api/payments/approve", { paymentId: id }, h); if (a.error) return a; return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, h); };

let r = await get("/api/vipc", HB);
ok(r.member === false && r.price === 5 && !r.game, "not a member: no game, price 5 Pi");
ok((await post("/api/vipc/voyage", { city: "cairo", good: "spice", qty: 5, guards: 0 }, HB)).error === "vc.locked", "locked without membership");
ok((await buy(HB, "uB", "v0", 4)).error === "badPayment", "wrong price refused");
ok((await buy(HB, "uB", "v1", 5)).ok, "bob pays 5 Pi");
r = await get("/api/vipc", HB);
ok(r.member && Math.abs(r.until - Date.now() - 30 * 86400000) < 60000, "member for 30 days");
ok(r.game && r.game.gold === 500 && r.game.left === 3 && r.game.market.cities.length === 3, "the game starts: 500 gold, 3 voyages, today's market");
ok(r.hall.some((x) => x.username === "bob" && x.paid >= 5), "bob is on the Hall of Glory with what he paid");
// teaser for non-members: no amounts
const rc = await get("/api/vipc", HC);
ok(rc.member === false && rc.hall.every((x) => x.paid === null) && rc.hallCount >= 1, "non-members see only a teaser of the Hall");
// extend
await buy(HB, "uB", "v2", 5);
r = await get("/api/vipc", HB);
ok(Math.abs(r.until - Date.now() - 60 * 86400000) < 60000, "paying again adds 30 days");
// game
const m = r.game.market, city = m.cities[0];
const before = r.game.gold;
const exp = V.voyage({ gold: 500, profit: 0, day: V.dayId(Date.now()), used: 0 }, { city: city.id, good: "spice", qty: 10, guards: 1 }, Date.now());
let v = await post("/api/vipc/voyage", { city: city.id, good: "spice", qty: 10, guards: 1 }, HB);
ok(v.ok && v.profit === exp.profit && v.gold === before + exp.profit && v.left === 2, "voyage result is computed by the server (same rules as the phone)", v);
ok((await post("/api/vipc/voyage", { city: "paris", good: "spice", qty: 1 }, HB)).error === "badAction", "unknown city refused");
ok((await post("/api/vipc/voyage", { city: city.id, good: "gem", qty: 500, guards: 0 }, HB)).error === "vc.cap", "more than the caravan can carry");
await post("/api/vipc/voyage", { city: city.id, good: "spice", qty: 1, guards: 0 }, HB);
await post("/api/vipc/voyage", { city: city.id, good: "spice", qty: 1, guards: 0 }, HB);
ok((await post("/api/vipc/voyage", { city: city.id, good: "spice", qty: 1, guards: 0 }, HB)).error === "vc.noVoyage", "3 voyages a day");
if (exp.profit > 0) ok((await sql("SELECT COALESCE(SUM(amount),0) AS n FROM nft_credits WHERE uid='uB' AND src='vipc'"))[0].n >= exp.coins, "profit pays Kombat coins");
// rules: guards protect the cargo
const mk = V.market(V.dayId(Date.now())); const dangerous = mk.cities.find((c) => c.danger >= 2);
if (dangerous) { const a = V.voyage({ gold: 9999, profit: 0, day: V.dayId(Date.now()), used: 0 }, { city: dangerous.id, good: "silk", qty: 10, guards: 0 }, Date.now()), b = V.voyage({ gold: 9999, profit: 0, day: V.dayId(Date.now()), used: 0 }, { city: dangerous.id, good: "silk", qty: 10, guards: 3 }, Date.now()); ok(a.lossPct > 0 && b.lossPct === 0, "guards remove the loss on a dangerous road"); }
// monthly ranking
r = await get("/api/vipc", HB);
ok(Array.isArray(r.game.top), "monthly ranking is returned");
// free entry: code, grant, wheel, podium
let c = await post("/api/admin/codes", { action: "create", kind: "vipclub", amount: 7, uses: 1, code: "VIPWEEK" }, HA);
ok(!c.error, "owner makes a VIP Club code");
r = await post("/api/code/redeem", { code: "VIPWEEK" }, HC);
ok(r.ok && (await get("/api/vipc", HC)).member, "carol redeems it and gets in");
ok(Math.abs((await get("/api/vipc", HC)).until - Date.now() - 7 * 86400000) < 60000, "7 days");
ok((await post("/api/admin/vipc", { username: "dina", days: 10 }, HB)).s === 403, "only the owner can grant");
ok((await post("/api/admin/vipc", { username: "dina", days: 10 }, HA)).ok, "owner grants dina 10 days");
ok((await get("/api/vipc", HD)).member, "dina is in");
const L = (await import("../public/logic.js"), globalThis.OasisLogic);
ok(L.WHEEL.PRIZES.some((p) => p.t === "vipc" && p.n === 3), "the wheel has a 3-day VIP Club prize");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
