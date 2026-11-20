// Royal cards. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC"), HA = await H("tokA");
global.window = global; await import("../public/logic.js"); const R = globalThis.OasisLogic.ROYAL;
const pay = async (h, uid, id, amount, tier, ed) => {
  await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id, uid, amount, type: "royal", tier, ed, txid: "t" + id }) });
  const a = await post("/api/payments/approve", { paymentId: id }, h);
  if (a.error) return a;
  return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, h);
};
let r = await get("/api/royal", HB);
ok(r.tiers.length === 4 && r.tiers.every((t) => t.sold === 0 && t.next === 1 && t.sig), "4 tiers, 0 sold, next copy #1 with its perk shown before buying");
ok(r.tiers[0].sig === R.sigOf("r10", 1).id, "the shown perk is the copy's own signature");
ok((await pay(HB, "uB", "r1", 5, "r10", 1)).error === "badPayment", "wrong price refused");
r = await pay(HB, "uB", "r2", 10, "r10", 1);
ok(r.ok, "bob buys Sand card #1 for 10 Pi");
ok((await pay(HC, "uC", "r3", 10, "r10", 1)).error === "rc.taken", "the same copy can't be sold twice");
r = await get("/api/royal", HC);
ok(r.tiers[0].sold === 1 && r.tiers[0].next === 2, "next copy is #2");
// the copy shown was taken between approval and completion: the buyer gets the next free one
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "r4", uid: "uC", amount: 100, type: "royal", tier: "r100", ed: 1, txid: "tr4" }) });
await post("/api/payments/approve", { paymentId: "r4" }, HC);
await exec(`INSERT INTO royal_cards (tier, ed, uid, at) VALUES ('r100', 1, 'uA', 1)`);
await post("/api/payments/complete", { paymentId: "r4", txid: "tr4" }, HC);
const cc = await sql("SELECT tier, ed FROM royal_cards WHERE uid = 'uC'");
ok(cc.length === 1 && cc[0].tier === "r100" && cc[0].ed === 2, "race for a copy: buyer gets the next free copy (#2)");
// sold out: refund
await exec(`INSERT INTO royal_cards (tier, ed, uid, at) SELECT 'r50', value, 'uA', 1 FROM (WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 499) SELECT value FROM n)`);
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "r5", uid: "uB", amount: 50, type: "royal", tier: "r50", ed: 500, txid: "tr5" }) });
await post("/api/payments/approve", { paymentId: "r5" }, HB);
await exec(`INSERT INTO royal_cards (tier, ed, uid, at) VALUES ('r50', 500, 'uA', 1)`);
await post("/api/payments/complete", { paymentId: "r5", txid: "tr5" }, HB);
ok((await sql("SELECT amount FROM payouts WHERE kind='refund' AND ref='r5'"))[0]?.amount === 50, "sold out meanwhile: the 50 Pi go back to the buyer");
ok((await get("/api/royal", HB)).tiers[2].next === null, "Golden card shows sold out");
// daily gift
const d0 = (await get("/api/me", HB)).state.dates;
r = await post("/api/royal/claim", {}, HB);
const g = R.giftOf("r10", 1);
ok(r.ok && r.gift.dates === g.dates && r.state.dates === d0 + g.dates, "daily gift: dates (with the copy's signature)");
ok((await post("/api/royal/claim", {}, HB)).error === "rc.claimed", "gift once a day");
ok((await post("/api/royal/claim", {}, (await H("tokA")))).ok, "alice (holds cards) collects too");
// perks: Derby races
const dv = await get("/api/derby", HC);
ok(dv.max === 8 + R.TIERS[3].races + (R.sigOf("r100", 2).races || 0), "Sultan card adds Derby races a day");
// Grand Royal Final: only once all 2,000 copies are sold
r = await get("/api/royal", HB);
ok(r.final === null && r.contest.length === 0 && r.total === 2000, "no final while cards remain");
await fetch(B + "/__test/cron");
ok((await sql("SELECT COUNT(*) AS n FROM nft_credits WHERE src LIKE 'royal-%'"))[0].n === 0, "no prize before the cards are sold out");
// fill every tier except one Sultan copy, then sell the last one
await exec(`INSERT OR IGNORE INTO royal_cards (tier, ed, uid, at) SELECT t.tier, n.value, 'uA', 1 FROM (SELECT 'r10' AS tier UNION SELECT 'r25' UNION SELECT 'r50' UNION SELECT 'r100') t, (WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 500) SELECT value FROM n) n WHERE NOT (t.tier = 'r100' AND n.value = 500)`);
r = await pay(HB, "uB", "r9", 100, "r100", 500);
r = await get("/api/royal", HB);
ok(r.sold === 2000 && r.final && !r.final.done && r.final.end - r.final.start === 30 * 86400000, "last copy sold: the 30-day final opens");
const fin = (await sql("SELECT start_at FROM royal_final"))[0].start_at;
const wk = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };
await exec(`INSERT OR REPLACE INTO kombat_weeks (week_id, uid, earned, updated_at) VALUES (${wk(fin)}, 'uC', 900000, 1), (${wk(fin)}, 'uB', 500000, 1), (${wk(fin)}, 'uF', 99999999, 1)`);
r = await get("/api/royal", HB);
ok(r.contest[0].username === "carol" && !r.contest.some((x) => x.username === "fatima"), "final ranking: holders only, by Kombat coins earned");
await fetch(B + "/__test/cron");
ok((await sql("SELECT COUNT(*) AS n FROM nft_credits WHERE src='royal-final'"))[0].n === 0, "no prizes before the final ends");
await exec("UPDATE royal_final SET end_at = start_at + 1");
await fetch(B + "/__test/cron");
ok((await sql("SELECT SUM(amount) AS n FROM nft_credits WHERE uid='uC' AND src='royal-final'"))[0].n === 1e9, "final #1 gets 1 billion Kombat coins");
ok((await sql("SELECT SUM(amount) AS n FROM nft_credits WHERE uid='uB' AND src='royal-final'"))[0].n === 3e8, "#2 gets 300 million");
await fetch(B + "/__test/cron");
ok((await sql("SELECT COUNT(*) AS n FROM nft_credits WHERE src='royal-final'"))[0].n === 3, "prizes given once (3 holders played)");
ok((await get("/api/royal", HB)).final.done, "final marked as done");
// surprise gift to all holders
r = await post("/api/admin/jrydrop", { preview: true, target: "cards" }, HA);
ok(r.players >= 3, "owner can send a surprise to all card holders");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
