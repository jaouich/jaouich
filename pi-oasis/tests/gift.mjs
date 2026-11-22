// JRY box and gifts between members. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HC = await H("tokC"), HD = await H("tokD");
const uid = async (n) => (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid;
const uC = await uid("carol"), uD = await uid("dina");
const old = Date.now() - 3 * 86400000;
await exec(`UPDATE users SET created_at = ${old} WHERE uid IN ('${uC}','${uD}'); UPDATE users SET jry_pts = 1000 WHERE uid='${uC}'; UPDATE users SET jry_pts = 0 WHERE uid='${uD}'; INSERT INTO nft_credits (uid, amount, at) VALUES ('${uC}', 1000000, ${Date.now()});`);
const kc = async (h) => Math.floor((((await get("/api/me", h)).state.kombat) || {}).coins || 0);
const dates = async (h) => (await get("/api/me", h)).state.dates;
const c0 = await kc(HC), d0 = await kc(HD);

let r = await post("/api/gift", { to: "dina", what: "jry", n: 100 }, HC);
ok(r.ok && r.fee === 2, "send 100 JRY, 2% fee");
const jr = async (u) => Number((await sql(`SELECT jry_pts FROM users WHERE uid='${u}'`))[0].jry_pts);
ok((await jr(uC)) === 900 && (await jr(uD)) === 98, "sender -100, receiver +98");
ok((await sql(`SELECT COUNT(*) AS c FROM jry_ledger WHERE kind LIKE 'gift-%'`))[0].c === 2, "both sides are in the JRY ledger");
ok((await post("/api/gift", { to: "carol", what: "jry", n: 5 }, HC)).error === "gift.self", "not to yourself");
ok((await post("/api/gift", { to: "nobody", what: "jry", n: 5 }, HC)).error === "gift.noUser", "unknown member refused");
ok((await post("/api/gift", { to: "dina", what: "jry", n: 950 }, HC)).error === "k.noJry", "not enough JRY refused");
ok((await post("/api/gift", { to: "dina", what: "jry", n: 5000000 }, HC)).error === "gift.limit", "huge number is refused");

r = await post("/api/gift", { to: "dina", what: "coins", n: 100000 }, HC);
ok(r.ok && r.fee === 5000, "send 100,000 coins, 5% burned");
ok((await kc(HC)) === c0 - 100000 && (await kc(HD)) === d0 + 95000, "coins moved (receiver gets 95,000)");
ok((await post("/api/gift", { to: "dina", what: "coins", n: 600000 }, HC)).error === "gift.share", "cannot send more than 20% of the balance at once");
const tot = (((await get("/api/me", HD)).state.kombat) || {}).total || 0;
ok((await sql(`SELECT json_extract(json, '$.kombat.earn.gift') AS g FROM state WHERE uid='${uD}'`))[0].g === 95000, "gift coins are tagged 'gift'");
ok(tot < 95000, "gift coins do not count toward the airdrop total");
ok((await post("/api/gift", { to: "dina", what: "coins", n: 10 }, HC)).error === "gift.min", "below the minimum refused");

await exec(`UPDATE state SET json = json_set(json, '$.dates', 5000) WHERE uid='${uC}'`);
r = await post("/api/gift", { to: "dina", what: "dates", n: 1000 }, HC);
ok(r.ok && r.fee === 50 && (await dates(HC)) === 4000 && (await dates(HD)) >= 950, "dates move with a 5% fee");

const idC = (async () => { await exec(`INSERT INTO nft_items (kind, edition, owner, minted_at, price) VALUES ('palm', 800, '${uC}', ${old}, 50)`); return (await sql("SELECT id FROM nft_items WHERE kind='palm' AND edition=800"))[0].id; })();
const gid = await idC;
ok((await post("/api/gift", { to: "carol", what: "item", id: gid }, HD)).error === "k.nftNotYours", "only the owner can give an item");
r = await post("/api/gift", { to: "dina", what: "item", id: gid }, HC);
const row = (await sql(`SELECT owner, price FROM nft_items WHERE id=${gid}`))[0];
ok(r.ok && row.owner === uD && row.price === null, "the collectible changes owner and its listing is cleared");
ok((await post("/api/gift", { to: "dina", what: "item", id: gid }, HC)).error === "k.nftNotYours", "can't give it twice");

await exec(`INSERT INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES ('p-a', 'prize', '1', '${uC}', 0.5, 'Pi Oasis weekly prize #1', 'new', ${Date.now()}, ${Date.now()}), ('p-b', 'prize', '2', '${uC}', 0.25, 'Pi Oasis weekly prize #2', 'completed', ${Date.now() - 1000}, ${Date.now()}), ('p-c', 'prize', '3', '${uD}', 9, 'x', 'new', ${Date.now()}, ${Date.now()})`);
const pb = (await get("/api/box", HC)).piBox;
ok(pb && pb.waiting === 0.5 && pb.paid === 0.25 && pb.items.length === 2 && pb.items.some((x) => x.done) && typeof pb.held === "boolean", "the Pi prize box shows what waits (0.5) and what was already sent (0.25), only the player's own");
const box = await get("/api/box", HC);
ok(box.jry === 900 && box.transfers.length >= 4 && box.transfers[0].dir, "box shows balance and transfers");

await exec(`UPDATE users SET created_at = ${Date.now()} WHERE uid='${uC}'`);
ok((await post("/api/gift", { to: "dina", what: "jry", n: 5 }, HC)).error === "gift.young", "a brand new account can't send gifts");
await exec(`UPDATE users SET created_at = ${old} WHERE uid='${uC}'`);
for (let i = 0; i < 8; i++) await exec(`INSERT INTO transfers (from_uid,to_uid,what,n,fee,at) VALUES ('${uC}','${uD}','jry',1,0,${Date.now()})`);
ok((await post("/api/gift", { to: "dina", what: "jry", n: 5 }, HC)).error === "gift.daily", "10 gifts per day at most");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
