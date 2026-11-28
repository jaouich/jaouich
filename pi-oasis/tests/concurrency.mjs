// Parallel requests must never create or lose currency (state is saved with a version check). Run on a fresh harness started with D1_LATENCY_MS=4 (queries then interleave like on the real D1).
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
const C = (await post("/api/auth", { accessToken: "tokC" })).session, D = (await post("/api/auth", { accessToken: "tokD" })).session;
const uC = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid, uD = (await sql("SELECT uid FROM users WHERE username='dina'"))[0].uid;
await post("/api/me", {}, C); await post("/api/me", {}, D);
await exec(`UPDATE users SET created_at = ${Date.now() - 5 * 86400000} WHERE uid IN ('${uC}','${uD}')`);
const dates = async (u) => Number((await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${u}'`))[0].d);
const coins = async (u) => Number((await sql(`SELECT json_extract(json,'$.kombat.coins') AS d FROM state WHERE uid='${u}'`))[0].d || 0);

// 1) parallel gifts of the same dates: the sender pays once per gift that really went through
await exec(`UPDATE state SET json = json_set(json, '$.dates', 1000), ver = ver + 1 WHERE uid='${uC}'`);
await exec(`UPDATE state SET json = json_set(json, '$.dates', 0), ver = ver + 1 WHERE uid='${uD}'`);
const res = await Promise.all(Array.from({ length: 8 }, () => post("/api/gift", { to: "dina", what: "dates", n: 600 }, C)));
const wins = res.filter((r) => r.ok).length;
const sC = await dates(uC), sD = await dates(uD);
ok(sC >= 0 && wins <= 1 && sC + sD <= 1000, "parallel gifts never create dates", { wins, sC, sD });
ok(sC === 1000 - 600 * wins && sD === Math.floor(600 * 0.95) * wins, "balances match the gifts that went through", { wins, sC, sD });

// 2) parallel buys of one listed card: one buyer pays once, the seller is credited once
await exec(`INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES ('moon', 1, '${uD}', ${Date.now()})`);
const item = (await sql(`SELECT id FROM nft_items WHERE kind='moon' AND edition=1`))[0].id;
await exec(`UPDATE nft_items SET price = 100000, cur = 'coins' WHERE id = ${item}`);
await exec(`UPDATE state SET json = json_set(json, '$.kombat.coins', 1000000), ver = ver + 1 WHERE uid='${uC}'`);
await exec(`DELETE FROM nft_credits WHERE uid='${uD}'`);
const cb0 = await coins(uD);
const buys = await Promise.all(Array.from({ length: 6 }, () => post("/api/nft/buy", { id: item, price: 100000, cur: "coins" }, C)));
const bw = buys.filter((r) => r.state).length;
const owner = (await sql(`SELECT owner FROM nft_items WHERE id=${item}`))[0].owner;
const credits = Number((await sql(`SELECT COALESCE(SUM(amount),0) AS n FROM nft_credits WHERE uid='${uD}' AND (src IS NULL OR src != 'refund')`))[0].n);
const refunds = Number((await sql(`SELECT COALESCE(SUM(amount),0) AS n FROM nft_credits WHERE uid='${uC}' AND src = 'refund'`))[0].n);
const buyerCoins = (await coins(uC)) + refunds;
ok(bw === 1 && owner === uC, "only one parallel buy gets the card", { bw, owner: owner === uC });
ok(credits === 95000, "the seller is credited exactly once (5% burned)", credits);
ok(buyerCoins === 900000, "the buyer paid exactly once (refunds counted)", buyerCoins);

// 3) parallel palm taps: the energy is spent, never reused
const energyOf = async (u) => JSON.parse((await sql(`SELECT json FROM state WHERE uid='${u}'`))[0].json).palm;
await exec(`UPDATE state SET json = json_set(json, '$.palm.energy', 20, '$.palm.eAt', ${Date.now()}, '$.palm.hits', 0), ver = ver + 1 WHERE uid='${uD}'`);
const taps = await Promise.all(Array.from({ length: 10 }, () => post("/api/action", { action: { type: "pTap", n: 5 } }, D)));
const p = await energyOf(uD);
ok(p.hits <= 20 && p.hits >= 1, "parallel taps use the energy only once (at most 20 hits with 20 energy)", p);
ok(taps.every((t) => t.state || t.error), "every parallel request got an answer");
// 4) sign-in is rate limited per IP (turned on only for this check)
await fetch(B + "/__test/env", { method: "POST", body: JSON.stringify({ key: "RATE_LIMIT_PER_MIN", value: "5" }) });
const logins = await Promise.all(Array.from({ length: 9 }, () => fetch(B + "/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: "tokC" }) }).then((r) => r.status)));
ok(logins.filter((s) => s === 429).length >= 3 && logins.filter((s) => s === 200).length >= 1, "too many sign-ins from one address are refused (429)", logins);
await fetch(B + "/__test/env", { method: "POST", body: JSON.stringify({ key: "RATE_LIMIT_PER_MIN", value: "0" }) });
console.log(`== ${pass} passed, ${fail} failed`);
