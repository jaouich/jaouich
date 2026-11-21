// 10,000-copy collectibles: rising mint price, selling for JRY, 1-for-1 swaps. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
global.window = global; await import("../public/kombat-logic.js");
const K = globalThis.KombatLogic;
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HC = await H("tokC"), HD = await H("tokD");
const uid = async (n) => (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid;
const uC = await uid("carol"), uD = await uid("dina");

ok(K.COLLECTIBLES.filter((c) => c.r !== "mythic").every((c) => c.max === 10000) && K.COLLECTIBLES.filter((c) => c.r === "mythic").every((c) => c.max <= 3), "10,000 copies of every card except the mythic ones");
const scorp = K.nftById("scorpion");
ok(K.mintPrice(scorp, 0) === scorp.price && K.mintPrice(scorp, 999) === scorp.price && K.mintPrice(scorp, 1000) === Math.round(scorp.price * 1.1) && K.mintPrice(scorp, 5000) === Math.round(scorp.price * 1.5), "mint price rises 10% per 1,000 copies");

const mk = async (owner, kind, ed) => { await exec(`INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES ('${kind}', ${ed}, '${owner}', ${Date.now()}); INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) SELECT id, NULL, '${owner}', 1, ${Date.now()} FROM nft_items WHERE kind='${kind}' AND edition=${ed};`); return (await sql(`SELECT id FROM nft_items WHERE kind='${kind}' AND edition=${ed}`))[0].id; };
const idC = await mk(uC, "palm", 700), idD = await mk(uD, "jar", 700);

// minted copies at the 1,000 mark cost more (fill the counter with rows owned by nobody)
let rows = ""; for (let i = 1; i <= 1000; i++) rows += `INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES ('moon', ${i}, 'x', 1);`;
await exec(rows);
await exec(`INSERT INTO nft_credits (uid, amount, at) VALUES ('${uC}', 5000000, ${Date.now()})`);
const before = (await get("/api/me", HC)).state.kombat.coins;
const m = await post("/api/nft/mint", { kind: "moon" }, HC);
const after = m.state.kombat.coins, moon = K.nftById("moon");
ok(m.item && Math.round(before - after) === K.mintPrice(moon, 1000) && K.mintPrice(moon, 1000) > moon.price, "the 1,001st copy costs the higher price");

// JRY listing
await exec(`UPDATE users SET jry_pts = 0 WHERE uid='${uC}'; UPDATE users SET jry_pts = 500 WHERE uid='${uD}'`);
ok((await post("/api/nft/list", { id: idC, price: 100, cur: "jry" }, HC)).ok, "list a copy for JRY");
const mkt = await get("/api/nft", HD);
ok(mkt.market.some((x) => x.id === idC && x.cur === "jry" && x.price === 100), "the market shows the JRY price");
ok((await post("/api/nft/buy", { id: idC, price: 100, cur: "coins" }, HD)).error === "k.nftGone", "buying with the wrong currency is refused");
const buy = await post("/api/nft/buy", { id: idC, price: 100, cur: "jry" }, HD);
const jd = (await sql(`SELECT jry_pts FROM users WHERE uid='${uD}'`))[0].jry_pts, jc = (await sql(`SELECT jry_pts FROM users WHERE uid='${uC}'`))[0].jry_pts;
ok(buy.state && jd === 400 && jc === 95, "buyer pays 100 JRY, seller gets 95 (5% burned)");
ok((await sql(`SELECT owner FROM nft_items WHERE id=${idC}`))[0].owner === uD, "the copy changed owner");
ok((await post("/api/nft/list", { id: idC, price: 100, cur: "jry" }, HC)).error === "k.nftNotYours", "the old owner can't list it any more");
await exec(`UPDATE users SET jry_pts = 3 WHERE uid='${uC}'`);
await post("/api/nft/list", { id: idC, price: 100, cur: "jry" }, HD);
ok((await post("/api/nft/buy", { id: idC, price: 100, cur: "jry" }, HC)).error === "k.noJry", "not enough JRY is refused");
await post("/api/nft/list", { id: idC, price: null }, HD);

// swap: dina offers her palm for a jar; carol owns a jar
const jarC = await mk(uC, "jar", 701);
ok((await post("/api/nft/list", { id: idC, want: "jar" }, HD)).ok, "offer my card for a swap");
ok((await get("/api/nft", HC)).market.some((x) => x.id === idC && x.swap_want === "jar"), "the swap offer is on the market");
ok((await post("/api/nft/swap", { id: idC, give: idD }, HC)).error === "k.swapWrong", "a card Carol doesn't own can't be given");
const sw = await post("/api/nft/swap", { id: idC, give: jarC }, HC);
const ow = async (i) => (await sql(`SELECT owner FROM nft_items WHERE id=${i}`))[0].owner;
ok(sw.ok && (await ow(idC)) === uC && (await ow(jarC)) === uD, "the swap exchanges both copies");
ok((await sql(`SELECT swap_want FROM nft_items WHERE id=${idC}`))[0].swap_want === null, "the offer is closed");
ok((await post("/api/nft/swap", { id: idC, give: jarC }, HC)).error === "k.nftGone", "can't swap twice");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
