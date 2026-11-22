// Premium royal cards and resale with 10% tax. Start tests/harness.mjs first (fresh).
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC");
global.window = global; await import("../public/logic.js"); const R = globalThis.OasisLogic.ROYAL;
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const buy = async (h, uid, id, amount, tier, ed) => { await pay({ id, uid, amount, type: "royal", tier, ed, txid: "t" + id }); const a = await post("/api/payments/approve", { paymentId: id }, h); if (a.error) return a; return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, h); };

ok(R.TIERS.length === 7 && ["r500", "r1000", "r5000"].every((id) => R.tierById(id)), "7 tiers incl. 500 / 1000 / 5000 Pi");
ok(R.tierById("r5000").price === 5000 && R.tierById("r5000").boost > R.tierById("r500").boost, "bigger card, bigger perks");
let r = await buy(HB, "uB", "p1", 500, "r500", 1);
ok(r.ok, "bob buys a 500 Pi card");
r = await get("/api/royal", HB);
ok(r.tiers.length === 7 && r.total === 2000 && r.sold === 0, "premium cards do not count toward the 2,000 needed for the Grand Final");
const card = r.mine[0];
ok(card && card.tier === "r500" && card.ed === 1 && card.offer === 0, "bob owns 500 Pi card #1");
// resale
ok((await post("/api/royal/list", { card: card.id, pi: 0 }, HB)).error === "rc.price", "price must be valid");
ok((await post("/api/royal/list", { card: card.id, pi: 800 }, HC)).error === "rc.notYours", "only the owner can list");
ok((await post("/api/royal/list", { card: card.id, pi: 800 }, HB)).ok, "bob lists it for 800 Pi");
ok((await post("/api/royal/list", { card: card.id, pi: 900 }, HB)).error === "rc.listed", "no double listing");
r = await get("/api/royal", HC);
ok(r.market.length === 1 && r.market[0].pi === 800 && r.market[0].tier === "r500" && r.market[0].seller === "bob" && r.market[0].mine === false, "the listing is visible to everyone");
ok((await get("/api/mk", HC)).offers.length === 0, "cards are not in the points market");
ok((await post("/api/royal/claim", {}, HB)).error === "rc.none", "a listed card does not give the daily gift");
const offer = r.market[0].offer;
ok((await post("/api/mk/offer", { kind: "dates", amount: 5, pi: 1 }, HB)).error !== undefined, "points market unaffected");
// bob can't buy his own
await pay({ id: "p2", uid: "uB", amount: 800, type: "mk", offer, txid: "x2" });
ok((await post("/api/payments/approve", { paymentId: "p2" }, HB)).error === "mk.own", "seller can't buy own card");
// wrong price
await pay({ id: "p3", uid: "uC", amount: 700, type: "mk", offer, txid: "x3" });
ok((await post("/api/payments/approve", { paymentId: "p3" }, HC)).error === "badPayment", "wrong price refused");
// carol buys
await pay({ id: "p4", uid: "uC", amount: 800, type: "mk", offer, txid: "x4" });
ok(!(await post("/api/payments/approve", { paymentId: "p4" }, HC)).error, "carol approves");
ok((await post("/api/payments/complete", { paymentId: "p4", txid: "x4" }, HC)).ok, "carol pays 800 Pi");
ok((await sql("SELECT uid, ed FROM royal_cards WHERE id = " + card.id))[0].uid === "uC", "the card now belongs to carol, same number");
const bal = (await sql("SELECT mk_balance FROM users WHERE uid = 'uB'"))[0].mk_balance;
ok(Math.abs(bal - 720) < 1e-6, "seller gets 720 Pi (800 minus 10% tax) in the sales balance");
r = await get("/api/royal", HC);
ok(r.market.length === 0 && r.mine.length === 1 && r.mine[0].ed === 1, "listing gone; carol sees her card");
ok((await post("/api/royal/claim", {}, HC)).ok, "new owner collects the daily gift");
ok((await post("/api/royal/claim", {}, HB)).error === "rc.none", "old owner has nothing to collect");
// unlist
const c2 = (await get("/api/royal", HC)).mine[0];
ok((await post("/api/royal/list", { card: c2.id, pi: 900 }, HC)).ok && (await post("/api/royal/unlist", { card: c2.id }, HC)).ok, "owner can unlist");
ok((await get("/api/royal", HC)).market.length === 0, "unlisted card is not for sale");
// perk cap
await exec(`INSERT INTO royal_cards (tier, ed, uid, at) VALUES ('r5000', 1, 'uB', 1), ('r5000', 2, 'uB', 1), ('r1000', 1, 'uB', 1)`);
const dv = await get("/api/derby", HB);
ok(dv.max <= 8 + 40, "Derby races stay capped");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
