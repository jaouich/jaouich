// Personal catalog (album). Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const notifs = () => fetch(B + "/__test/notifs").then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
global.window = global; await import("../public/kombat-logic.js"); await import("../public/logic.js"); await import("../public/catalog-logic.js");
const K = globalThis.KombatLogic, C = globalThis.CatalogLogic;
const NOW = Date.now(), OLD = NOW - 4 * 86400000, DAY = 86400000;

// ---------- rules ----------
ok(C.entries().length === 28 && C.requiredCount() === 22, "28 slots in the album, 22 required");
ok(C.SECTIONS.map((s) => C.sectionEntries(s).length).join() === "7,11,4,6", "sections: series 1 (7), series 2 (11), royal cards (4), honors (6)");
ok(C.entries().filter((x) => x.r === "mythic" && x.kind === "nft").every((x) => !x.required && x.sec === "honors"), "the 2 mythic collectibles are bonus, never required");
let p = C.progressOf({ scorpion: { eds: [7], since: OLD }, palm: { eds: [1], since: NOW }, r10: { eds: [3], since: OLD }, star: { eds: [1], since: OLD } }, NOW, []);
ok(p.have === 2 && p.list.find((x) => x.id === "palm").state === "holding" && p.list.find((x) => x.id === "star").state === "counted" && p.have < 3, "an item counts only after 3 days; a mythic does not count as required");
ok(p.goals.every((g) => !g.reached), "no goal reached with 2 items");
ok(C.progressOf({ jar: { eds: [1], since: NOW - 3 * DAY } }, NOW, []).have === 1, "exactly 3 days: counted");
ok(C.boostOf(["s:series1", "s:series2", "s:royal", "master"]) === 0.05 && C.boostOf(["s:series1"]) === 0.01 && C.boostOf([]) === 0, "boost: +1% per section, +2% Master, never above 5%");

// ---------- server ----------
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HC = await H("tokC"), HD = await H("tokD"), HE = await H("tokE"), HF = await H("tokF");
const me = (h) => get("/api/me", h);
const coins = async (h) => Math.floor(((await me(h)).state.kombat || {}).coins || 0);
const giveNft = (uid, kind, ed, at) => exec(`INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES ('${kind}', ${ed}, '${uid}', ${at}); INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) SELECT id, NULL, '${uid}', 1, ${at} FROM nft_items WHERE kind='${kind}' AND edition=${ed};`);
let r = await get("/api/catalog", HC);
ok(r.mine && Object.keys(r.owned).length === 0 && r.claims.length === 0 && r.boost === 0, "an empty album at first");

// carol: scorpion, palm, lamp (old), caravan (just now) and a royal card (old)
await giveNft("uC", "scorpion", 7, OLD); await giveNft("uC", "palm", 1, OLD); await giveNft("uC", "lamp", 2, OLD); await giveNft("uC", "caravan", 5, NOW);
await exec(`INSERT INTO royal_cards (tier, ed, uid, at) VALUES ('r10', 3, 'uC', ${OLD})`);
r = await get("/api/catalog", HC);
ok(r.owned.scorpion.eds[0] === 7 && r.owned.r10.eds[0] === 3 && r.owned.caravan && r.minted.scorpion >= 1, "owned items with their edition numbers, and how many copies exist");
p = C.progressOf(r.owned, r.now, r.claims);
ok(p.have === 4 && p.list.find((x) => x.id === "caravan").state === "holding", "4 items count, the caravan is still in its 3 days");
ok((await post("/api/catalog/claim", { key: "m6" }, HC)).error === "cat.notYet" && (await post("/api/catalog/claim", { key: "bogus" }, HC)).error === "cat.notYet", "a goal not reached (or unknown) is refused");
const c0 = await coins(HC);
r = await post("/api/catalog/claim", { key: "m3" }, HC);
const gain = Math.floor(r.state.kombat.coins) - c0;
ok(r.ok && r.reward.coins === 30000 && gain >= 30000 && gain < 30500, "3 items: +30,000 coins");
ok((await post("/api/catalog/claim", { key: "m3" }, HC)).error === "cat.claimed", "each goal is claimed once");
// selling an item empties the slot
await exec("UPDATE nft_items SET owner = 'uD' WHERE kind = 'scorpion'");
r = await get("/api/catalog", HC);
ok(!r.owned.scorpion && C.progressOf(r.owned, r.now, r.claims).have === 3, "sold the scorpion: the slot is empty again");
let rd = await get("/api/catalog", HD);
ok(rd.owned.scorpion && rd.owned.scorpion.eds[0] === 7, "the buyer now has copy #7 in his album");
await exec(`INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) SELECT id, 'uC', 'uD', 20000, ${NOW} FROM nft_items WHERE kind = 'scorpion'`);
rd = await get("/api/catalog", HD);
ok(C.progressOf(rd.owned, rd.now, []).list.find((x) => x.id === "scorpion").state === "holding", "bought just now: holding, the 3 days restart for the new owner");

// emad completes everything (all old)
let ei = 900; for (const c of K.COLLECTIBLES) if (c.r !== "mythic") await giveNft("uE", c.id, ei++, OLD);
for (const t of ["r10", "r25", "r50", "r100"]) await exec(`INSERT INTO royal_cards (tier, ed, uid, at) VALUES ('${t}', 1, 'uE', ${OLD})`);
r = await get("/api/catalog", HE);
p = C.progressOf(r.owned, r.now, r.claims);
ok(p.have === 22 && p.master && !p.legend && p.goals.filter((g) => g.reached).length === 8, "emad has the 22 required items: Master reached (and all 8 goals), not yet 'legend' (28/28)");
const j0 = (await me(HE)).account.jryPts;
for (const k of ["m3", "m6", "m10", "m15", "s:series1", "s:series2", "s:royal"]) await post("/api/catalog/claim", { key: k }, HE);
ok((await me(HE)).account.catBoost === 0.03 && !(await me(HE)).account.catMaster, "3 completed sections: +3% Kombat profit");
r = await post("/api/catalog/claim", { key: "master" }, HE);
ok(r.ok && r.reward.coins === 3000000 && r.reward.jry === 500 && r.account.catMaster && r.account.catBoost === 0.05, "Master Collector: 3,000,000 coins, 500 JRY, badge, boost 5% (cap)");
ok((await me(HE)).account.jryPts === j0 + 20 + 50 + 120 + 500, "JRY from the milestones and the Master prize");
const eCoins = await coins(HE);
ok(eCoins >= 4730000 && eCoins < 4735000, "all the coins credited (30K + 100K + 300K + 1M + 3 sections × 100K + 3M)");
// the boost really works in the game: profit per hour is higher
const accE = (await me(HE)).account;
ok(accE.holdBoost >= accE.catBoost && accE.holdBoost > (await me(HF)).account.holdBoost, "the catalog boost is part of the Kombat profit boost shown to the player");
// bonus items complete the album: mythic collectibles + supporter badges
await giveNft("uE", "star", 1, OLD); await giveNft("uE", "sun", 1, OLD);
await exec("UPDATE users SET sup_lvl = 3, sup_pi = 300, sup_at = 1 WHERE uid = 'uE'");
r = await get("/api/catalog", HE);
p = C.progressOf(r.owned, r.now, r.claims);
ok(p.legend && p.list.filter((x) => x.kind === "badge" && x.state === "counted").length === 4, "mythics + the 4 supporter badges: the album is 28/28 (legend)");
// public view of somebody else's album
const pub = await get("/api/catalog?u=emad");
ok(pub.name === "emad" && pub.mine === false && pub.owned.crown && pub.master && pub.claims === undefined && pub.boost === undefined && !("account" in pub), "anybody can look at another player's album (read only, no private data)");
ok((await post("/api/catalog/claim", { key: "master" }, { Authorization: "Bearer nope" })).s >= 400, "claiming needs a login");
ok((await fetch(B + "/api/catalog?u=ghost")).status === 400, "unknown player");
// ranking badge
const wid = (() => { const d = new Date(); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); })();
await exec(`INSERT OR REPLACE INTO week_scores (week_id, uid, score, updated_at) VALUES (${wid}, 'uE', 5, 1)`);
const lb = await get("/api/leaderboard", HE);
ok(lb.top.find((x) => x.username === "emad").cm === 1, "the 📚 Master Collector badge shows in the ranking");

// notification when a goal becomes claimable (once)
await giveNft("uF", "jar", 1, OLD); await giveNft("uF", "moon", 1, OLD); await giveNft("uF", "tea", 1, OLD);
const n0 = (await notifs()).filter((x) => x.user_uid === "uF").length;
await fetch(B + "/__test/cron"); await fetch(B + "/__test/cron");
const nf = (await notifs()).filter((x) => x.user_uid === "uF").slice(n0);
ok(nf.length === 1 && nf[0].subroute === "/?go=catalog", "3 items held long enough: one Pi notification that opens the catalog (not repeated)");
ok(!(await notifs()).some((x) => x.user_uid === "uE" && x.subroute === "/?go=catalog"), "no notification for goals already claimed");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
