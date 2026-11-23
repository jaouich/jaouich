// The Golden King card: one throne, escalating Pi price, 90-day reign, x3 multiplier, big daily gift. Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p, h = {}) => fetch(B + p, { headers: h }).then((r) => r.json());
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC"), HD = await H("tokD");
global.window = global; await import("../public/logic.js"); const R = globalThis.OasisLogic.ROYAL;
ok([1, 2, 3, 4, 10].map(R.kingPrice).join() === "9999,11111,12222,13333,19999", "prices: 9,999 then 11,111, 12,222, +1,111 each");
const buy = async (h, uid, id, ed, amount) => { await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id, uid, amount, type: "royal", tier: "king", ed, txid: "t" + id }) }); const a = await post("/api/payments/approve", { paymentId: id }, h); if (a.error) return a; return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, h); };
let lb = await get("/api/leaderboard", HD);
ok(lb.king && lb.king.active === false && lb.king.nextEd === 1 && lb.king.nextPrice === 9999, "empty throne: copy #1 costs 9,999", lb.king);
ok((await buy(HB, "uB", "k0", 1, 5000)).error === "badPayment", "wrong price refused");
ok((await buy(HB, "uB", "k0b", 2, 11111)).error === "king.moved", "can only buy the next copy");
let r = await buy(HB, "uB", "k1", 1, 9999);
ok(r.ok, "bob takes the throne for 9,999 Pi");
lb = await get("/api/leaderboard", HD);
ok(lb.king.active && lb.king.username === "bob" && lb.king.ed === 1 && lb.king.nextEd === 2 && lb.king.nextPrice === 11111, "bob is the King; next copy 11,111", lb.king);
let me = await get("/api/me", HB);
ok(me.account.mult && me.account.mult.f === 3 && me.account.mult.id === "king", "the King gets x3");
ok(!(await get("/api/me", HC)).account.mult, "others do not");
// daily gift
const d0 = (await get("/api/me", HB)).state.dates;
r = await post("/api/royal/claim", {}, HB);
ok(r.ok && r.gift.dates >= R.KING.gift.dates && r.gift.coins >= R.KING.gift.coins && r.gift.jry >= R.KING.gift.jry, "the King's big daily gift", r.gift);
// carol is faster for #2 and bob is dethroned
ok((await buy(HC, "uC", "k2", 2, 11111)).ok, "carol takes the throne for 11,111");
lb = await get("/api/leaderboard", HD);
ok(lb.king.username === "carol" && lb.king.nextPrice === 12222, "carol is King; next 12,222");
ok(!(await get("/api/me", HB)).account.mult, "bob lost the x3");
ok((await get("/api/me", HC)).account.mult.f === 3, "carol has it");
const mine = (await get("/api/royal", HB)).mine;
ok(mine.some((c) => c.tier === "king" && c.ed === 1), "bob keeps his card");
ok((await post("/api/royal/list", { card: mine.find((c) => c.tier === "king").id, pi: 5000 }, HB)).ok, "and can resell it");
// both buy while one is behind: stale ed refused
ok((await buy(HD, "uD", "k3", 2, 11111)).error === "rc.taken", "a taken copy cannot be bought twice");
// reign ends
await exec("UPDATE royal_cards SET at = at - " + 91 * 86400000 + " WHERE tier='king'");
await new Promise((r) => setTimeout(r, 100));
// cache is 60 s: force refresh through a new purchase attempt path is not needed, read through the leaderboard after expiry
lb = await get("/api/leaderboard", HD);
ok(lb.king.ed === 2, "the newest copy is still #2");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
