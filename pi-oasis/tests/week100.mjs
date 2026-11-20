// 100 weekly winners (Oasis Pi pool + dates, Kombat coins) and level-up packs. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const cron = () => fetch(B + "/__test/cron");
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const weekId = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC");
const now = Date.now(), last = weekId(now - 7 * 86400000), cur = weekId(now);
const me = (h) => get("/api/me", h);

// --- Oasis: 120 players ranked last week, pool 100 Pi ---
let rows = [];
for (let i = 1; i <= 120; i++) rows.push(`('u${i}', 'p${i}', ${now})`);
await exec(`INSERT INTO users (uid, username, created_at) VALUES ${rows.join(",")};`);
rows = []; for (let i = 1; i <= 120; i++) rows.push(`(${last}, 'u${i}', ${10000 - i}, ${i})`);
await exec(`INSERT INTO week_scores (week_id, uid, score, updated_at) VALUES ${rows.join(",")}; INSERT OR REPLACE INTO weeks (id, prize_pool, paid) VALUES (${last}, 100, 0);`);
await cron();
const po = await sql(`SELECT uid, amount, memo FROM payouts WHERE kind='prize' AND ref='${last}' ORDER BY amount DESC`);
ok(po.length === 100, "100 Pi prizes queued");
const amt = (u) => (po.find((x) => x.uid === u) || {}).amount;
ok(amt("u1") === 20 && amt("u2") === 12 && amt("u3") === 8, "#1 20 Pi, #2 12 Pi, #3 8 Pi");
ok(amt("u4") === 3 && amt("u10") === 3 && amt("u11") === 1 && amt("u30") === 1, "#4-10 3 Pi, #11-30 1 Pi");
ok(Math.abs(amt("u31") - 19 / 70) < 1e-6 && Math.abs(amt("u100") - 19 / 70) < 1e-6 && !amt("u101"), "#31-100 share 19%, #101 nothing");
ok(Math.abs(po.reduce((a, x) => a + x.amount, 0) - 100) < 1e-4, "the whole pool is shared");
const dates = await sql(`SELECT uid, json_extract(json, '$.dates') AS d FROM state WHERE uid IN ('u1','u2','u3','u10','u30','u100','u101')`);
const dOf = (u) => (dates.find((x) => x.uid === u) || {}).d;
const base = dOf("u100") - 2000; // a new player starts with a few dates
ok(!dOf("u101") && dOf("u1") - base === 50000 && dOf("u2") - base === 30000 && dOf("u10") - base === 10000 && dOf("u30") - base === 5000 && dOf("u100") - base === 2000, "dates for the top 100 (50,000 … 2,000)");
const cam = await sql(`SELECT uid, json_extract(json, '$.animals') AS a FROM state WHERE uid IN ('u1','u2','u3','u4')`);
ok(cam.filter((x) => JSON.parse(x.a).some((a) => String(a.from).startsWith("prize-"))).length === 3, "camels still go to the top 3 only");
await cron();
ok((await sql(`SELECT COUNT(*) AS n FROM payouts WHERE kind='prize' AND ref='${last}'`))[0].n === 100, "prizes given once");
const lb = await get("/api/leaderboard", HB);
ok(lb.bands.length === 6 && lb.bands[0].share === 0.2, "ranking shows the prizes by place");

// small pool: tiny shares stay for next week
const prev = last - 7 * 86400000;
await exec(`DELETE FROM payouts WHERE kind='prize'; INSERT OR REPLACE INTO weeks (id, prize_pool, paid) VALUES (${prev}, 1, 0); INSERT INTO week_scores (week_id, uid, score, updated_at) SELECT ${prev}, uid, score, updated_at FROM week_scores WHERE week_id = ${last};
  UPDATE weeks SET paid = 1 WHERE id = ${last}; INSERT OR REPLACE INTO weeks (id, prize_pool, paid) VALUES (${cur}, 0, 0);`);
// run the pay step for prev by pretending it is last week: swap ids
await exec(`UPDATE weeks SET id = -1 WHERE id = ${last}; UPDATE weeks SET id = ${last} WHERE id = ${prev}; DELETE FROM week_scores WHERE week_id = ${prev};`);
await cron();
const small = await sql(`SELECT amount FROM payouts WHERE kind='prize' AND ref='${last}'`);
ok(small.length === 30 && small.every((x) => x.amount >= 0.01), "1 Pi pool: only the 30 shares ≥ 0.01 Pi are sent");
const pool = (await sql(`SELECT prize_pool FROM weeks WHERE id=${cur}`))[0].prize_pool;
ok(Math.abs(pool - 0.19) < 1e-6, "the 0.19 Pi left rolls into this week");

// --- Kombat: 100 prize places ---
const KL = await get("/api/kombat/top?week=1", HB);
ok(KL.prizes.length === 100 && KL.prizes[0] === 1e6 && KL.prizes[10] === 5e4 && KL.prizes[99] === 2e4, "Kombat tournament pays 100 places");
rows = []; for (let i = 1; i <= 60; i++) rows.push(`(${last}, 'u${i}', ${100000 - i}, ${i})`);
await exec(`INSERT INTO kombat_weeks (week_id, uid, earned, updated_at) VALUES ${rows.join(",")}, (${last}, 'uC', 10, 99);`);
const kc = await post("/api/kombat/week/claim", {}, HC);
ok(kc.place === 61 && kc.n === 2e4, "place 61 collects 20K coins");

// --- Level-up packs ---
const d0 = (await me(HB)).state.dates;
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "lv1", uid: "uB", amount: 0.1, type: "lvl", pack: "l01", txid: "tlv1" }) });
await post("/api/payments/approve", { paymentId: "lv1" }, HB);
let r = await post("/api/payments/complete", { paymentId: "lv1", txid: "tlv1" }, HB);
ok(r.ok && r.state.dates === d0 + 1000, "0.1 Pi pack: +1,000 dates");
ok(r.state.week.score === (await me(HB)).state.week.score && r.state.kombat.coins >= 20000, "+20,000 Kombat coins, ranking score unchanged");
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "lv2", uid: "uB", amount: 5, type: "lvl", pack: "l01", txid: "tlv2" }) });
ok((await post("/api/payments/approve", { paymentId: "lv2" }, HB)).error === "badPayment", "wrong price for a pack refused");
const sp0 = (await me(HB)).account.wheelSpins, j0 = (await me(HB)).account.jryPts, cm0 = JSON.parse((await sql("SELECT json FROM state WHERE uid='uB'"))[0].json).animals.length;
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "lv3", uid: "uB", amount: 100, type: "lvl", pack: "l100", txid: "tlv3" }) });
await post("/api/payments/approve", { paymentId: "lv3" }, HB);
r = await post("/api/payments/complete", { paymentId: "lv3", txid: "tlv3" }, HB);
const a = JSON.parse((await sql("SELECT json FROM state WHERE uid='uB'"))[0].json).animals;
ok(r.ok && r.account.wheelSpins === sp0 + 100 && r.account.jryPts === j0 + 6000, "100 Pi pack: +100 spins, +6,000 JRY");
ok(a.length === cm0 + 1 && a[a.length - 1].rarity === 3, "100 Pi pack: a legendary camel");
r = await post("/api/payments/complete", { paymentId: "lv3", txid: "tlv3" }, HB);
ok(JSON.parse((await sql("SELECT json FROM state WHERE uid='uB'"))[0].json).animals.length === cm0 + 1, "completing twice gives nothing more");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
