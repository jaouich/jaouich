// Jerry Kombat rules on the server. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const exec = (q) => post("/__test/exec", q);
const S = (await post("/api/auth", { accessToken: "tokB" })).session;
const H = { Authorization: "Bearer " + S };
const act = (a) => post("/api/action", { action: a }, H);
const uid = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;
const setK = (path, v) => exec(`UPDATE state SET json = json_set(json, '$.kombat.${path}', json('${JSON.stringify(v)}')) WHERE uid='${uid}'`);

let r = await act({ type: "kSync" });
ok(r.s === 200 && r.state.kombat && r.state.kombat.coins === 0 && r.state.kombat.energy === 1000, "new fighter: 0 coins, 1000 energy");
r = await act({ type: "kTap", n: 50 });
ok(r.state.kombat.coins === 50 && r.state.kombat.energy === 950, "50 taps = 50 coins, -50 energy");
r = await act({ type: "kTap", n: 600 });
ok(r.state.kombat.coins < 200, "600 taps in a split second: speed limit keeps only a few (" + (r.state.kombat.coins - 50) + ")");
ok((await act({ type: "kTap", n: 5000 })).s === 400, "a batch over the limit is refused");
ok((await act({ type: "kTap", n: -5 })).s === 400, "negative taps refused");
// pretend 20 s passed since the last tap, with 10 energy left
await setK("tapAt", Date.now() - 20000); await setK("energy", 10); await setK("eAt", Date.now());
r = await act({ type: "kTap", n: 100 });
const got = r.state.kombat.coins;
await setK("coins", 0); await setK("total", 0);
ok(r.state.kombat.energy === 0, "taps stop when energy runs out (energy 0)");
// cards
ok((await act({ type: "kCard", id: "well" })).error === "k.noCoins", "can't buy a card without coins");
await setK("coins", 10000); await setK("total", 10000);
r = await act({ type: "kCard", id: "well" });
ok(r.state.kombat.cards.well === 1 && r.state.kombat.coins === 9900, "Water well lvl 1 for 100 coins");
r = await act({ type: "kCard", id: "well" });
ok(r.state.kombat.cards.well === 2 && r.state.kombat.coins === 9900 - 155, "level 2 costs more (155)");
ok((await act({ type: "kCard", id: "carpets" })).error === "k.locked", "Carpet loom locked below Bronze league");
ok((await act({ type: "kCard", id: "inn" })).error === "k.locked", "Caravanserai locked until Palm grove lvl 5");
ok((await act({ type: "kCard", id: "nope" })).s === 400, "unknown card refused");
// passive income while away: 3 hours max
await setK("last", Date.now() - 10 * 3600e3);
const before = (await act({ type: "kSync" })).state.kombat;
// well lvl2 = 10 + 11.2 = 21/h -> 3h = 63
await setK("last", Date.now() - 10 * 3600e3);
r = await act({ type: "kSync" });
ok(r.state.kombat.coins - before.coins === 63 && r.msg && r.msg.key === "k.away", "away 10h: paid only 3h of profit (63) and told the player");
// boosts
r = await act({ type: "kBoost", id: "tap" });
ok(r.state.kombat.tap === 1, "Multitap lvl 1");
await setK("energy", 1000); await setK("eAt", Date.now()); await setK("tapAt", Date.now() - 5000);
const c0 = r.state.kombat.coins;
r = await act({ type: "kTap", n: 10 });
ok(r.state.kombat.coins - c0 === 20, "now each tap gives 2 coins");
r = await act({ type: "kBoost", id: "cap" });
ok(r.state.kombat.cap === 1, "energy limit lvl 1 (1500)");
// refill
await setK("energy", 0); await setK("eAt", Date.now());
r = await act({ type: "kRefill" });
ok(r.state.kombat.energy === 1500, "free refill fills energy to 1500");
ok((await act({ type: "kRefill" })).error === "k.refillWait", "second refill must wait an hour");
// daily
r = await act({ type: "kDaily" });
ok(r.msg && r.msg.vars.n === 500 && r.state.kombat.daily.streak === 1, "daily day 1: 500 coins");
ok((await act({ type: "kDaily" })).error === "k.dailyDone", "only once a day");
const d = Math.floor(Date.now() / 86400000);
await setK("daily", { day: d - 1, streak: 3 });
r = await act({ type: "kDaily" });
ok(r.state.kombat.daily.streak === 4 && r.msg.vars.n === 5000, "streak continues: day 4 = 5000");
await setK("daily", { day: d - 3, streak: 6 });
r = await act({ type: "kDaily" });
ok(r.state.kombat.daily.streak === 1, "missed days: streak restarts");
// ranking
const top = await fetch(B + "/api/kombat/top").then((x) => x.json());
ok(top.top.length >= 1 && top.top[0].username === "bob" && top.top[0].total > 0, "ranking lists bob");
// Oasis game untouched
ok(typeof r.state.dates === "number" && r.state.city, "farm, city and dates still there");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
