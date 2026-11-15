// Players' testJRY market, swaps for dates / Kombat coins, Kombat coin packs. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });

const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC"); // alice owner, bob seller, carol buyer
const st = await post("/api/admin/token", { action: "setup" }, HA);
const issuer = st.issuer;
const wallet = async (h, n) => {
  const k = await fetch(B + "/__test/kp").then((r) => r.json());
  await fetch(B + `/__test/fund?g=${k.G}&issuer=${issuer}&n=${n}`);
  await post("/api/kombat/wallet", { address: k.G }, h);
  return k.G;
};
const WB = await wallet(HB, 5000), WC = await wallet(HC, 0), WA = await wallet(HA, 0);
const send = (from, n) => fetch(B + `/__test/userpay?from=${from}&issuer=${issuer}&n=${n}`).then((r) => r.text());
const bal = async (h, w) => Number((await post("/api/kombat/wallet", { address: w }, h)).balance);

// ---- Selling
let o1 = await post("/api/p2p/offer", { jry: 1000, pi: 2 }, HB);
ok(o1.ok && o1.app && o1.jry === "1000.0000000", "bob lists 1,000 testJRY for 2 Pi and gets the app address to send to");
ok((await post("/api/p2p/check", { id: o1.id }, HB)).error === "p2p.notYet", "not listed before the tokens arrive");
await send(WB, 1000);
ok((await post("/api/p2p/check", { id: o1.id }, HB)).status === "open", "after sending: the offer is open");
const o2 = await post("/api/p2p/offer", { jry: 1000, pi: 0.5 }, HB);
await send(WB, 1000); await post("/api/p2p/check", { id: o2.id }, HB);
let m = await get("/api/p2p", HC);
ok(m.on && m.offers.length === 2 && m.offers[0].id === o2.id && m.offers[0].seller === "bob", "market shows bob's offers, cheapest first");
ok(Math.abs(m.price - 0.001) < 1e-9, "pool price shown for comparison");
ok((await post("/api/p2p/offer", { jry: 1000, pi: 0.001 }, HB)).error === "p2p.price", "price below the minimum refused");

// ---- Buying
await pay({ id: "own1", uid: "uB", amount: 0.5, type: "p2p", offer: o2.id, txid: "t0" });
ok((await post("/api/payments/approve", { paymentId: "own1" }, HB)).error === "p2p.own", "you can't buy your own offer");
await pay({ id: "bad1", uid: "uC", amount: 0.4, type: "p2p", offer: o2.id, txid: "t1" });
ok((await post("/api/payments/approve", { paymentId: "bad1" }, HC)).s === 400, "a price different from the offer is refused");
await pay({ id: "buy1", uid: "uC", amount: 0.5, type: "p2p", offer: o2.id, txid: "t2" });
ok((await post("/api/payments/approve", { paymentId: "buy1" }, HC)).ok, "carol's payment holds the offer");
await fetch(B + `/__test/fund?g=${WA}&issuer=${issuer}&n=0`);
await pay({ id: "buy2", uid: "uA", amount: 0.5, type: "p2p", offer: o2.id, txid: "t3" });
ok((await post("/api/payments/approve", { paymentId: "buy2" }, HA)).error === "p2p.taken", "a second buyer can't take a held offer");
const sellerBefore = await sql("SELECT COUNT(*) AS n FROM payouts WHERE kind = 'p2p'");
await post("/api/payments/complete", { paymentId: "buy1", txid: "t2" }, HC);
ok(await bal(HC, WC) === 1000, "carol receives the 1,000 testJRY in her wallet");
const po = await sql(`SELECT amount, status FROM payouts WHERE kind = 'p2p' AND ref = '${o2.id}'`);
ok(sellerBefore[0].n === 0 && po.length === 1 && Math.abs(po[0].amount - 0.49) < 1e-9 && po[0].status === "completed", "bob is paid 0.49 Pi (2% fee kept by the app)");
const pool = await sql("SELECT COALESCE(SUM(prize_pool), 0) AS p FROM weeks");
ok(pool[0].p === 0, "player-to-player Pi is not app revenue (no prize pool share)");
m = await get("/api/p2p", HC);
ok(m.offers.length === 1 && m.offers[0].id === o1.id && m.sold.n === 1, "sold offer leaves the list");

// ---- Cancel: tokens go back
const b0 = await bal(HB, WB);
ok((await post("/api/p2p/cancel", { id: o1.id }, HC)).error === "p2p.gone", "only the seller can cancel");
ok((await post("/api/p2p/cancel", { id: o1.id }, HB)).status === "cancelled", "bob cancels his open offer");
ok(await bal(HB, WB) === b0 + 1000, "the 1,000 testJRY go back to bob");
ok((await post("/api/p2p/cancel", { id: o1.id }, HB)).status === "cancelled", "cancelling again sends nothing twice");
ok(await bal(HB, WB) === b0 + 1000, "...balance unchanged");

// ---- Swap testJRY for Kombat coins / dates
const k0 = (await get("/api/me", HB)).state;
const c0 = (k0.kombat && k0.kombat.coins) || 0, d0 = k0.dates;
const r1 = await post("/api/p2p/offer", { kind: "redeem", jry: 1000, reward: "coins" }, HB);
await send(WB, 1000);
let c = await post("/api/p2p/check", { id: r1.id }, HB);
ok(c.status === "done" && c.got === 220000, "1,000 testJRY (= 1 Pi at the pool price) → 220,000 coins (+10% for paying with testJRY)");
ok(c.state.kombat.coins === c0 + 220000, "coins credited");
ok(!c.state.kombat.wk || c.state.kombat.wk.n === 0, "swapped coins don't count in the weekly tournament");
ok((await post("/api/p2p/check", { id: r1.id }, HB)).status === "done", "checking again credits nothing more");
const r2 = await post("/api/p2p/offer", { kind: "redeem", jry: 500, reward: "dates" }, HB);
await send(WB, 500);
c = await post("/api/p2p/check", { id: r2.id }, HB);
ok(c.got === 2750 && c.state.dates === d0 + 2750, "500 testJRY → 2,750 dates");
const r3 = await post("/api/p2p/offer", { kind: "redeem", jry: 500, reward: "dates" }, HB);
ok((await post("/api/p2p/check", { id: r3.id }, HB)).error === "p2p.notYet", "an old transfer can't be used twice");

// ---- Kombat coin packs (Pi)
const kc0 = (await get("/api/me", HC)).state;
await pay({ id: "kc1", uid: "uC", amount: 1, type: "kcoins", pack: "c200k", txid: "t9" });
await post("/api/payments/approve", { paymentId: "kc1" }, HC);
const kr = await post("/api/payments/complete", { paymentId: "kc1", txid: "t9" }, HC);
ok(kr.state.kombat.coins === ((kc0.kombat && kc0.kombat.coins) || 0) + 200000, "1 Pi = 200,000 Kombat coins");
ok(kr.state.kombat.earn.shop === 200000 && (!kr.state.kombat.wk || kr.state.kombat.wk.n === 0), "bought coins are marked as bought, not tournament earnings");
await pay({ id: "kc2", uid: "uC", amount: 0.5, type: "kcoins", pack: "c200k", txid: "t10" });
ok((await post("/api/payments/approve", { paymentId: "kc2" }, HC)).s === 400, "wrong price for a coin pack refused");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
