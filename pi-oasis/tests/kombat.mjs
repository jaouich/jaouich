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
// fury mode
await setK("fury", 240); await setK("furyUntil", 0); await setK("energy", 1500); await setK("eAt", Date.now()); await setK("tapAt", Date.now() - 5000);
r = await act({ type: "kTap", n: 20 });
ok(r.state.kombat.furyUntil > Date.now() && r.state.kombat.stats.furies === 1, "250 taps fill the bar: Fury starts");
const e0 = r.state.kombat.energy, cf = r.state.kombat.coins;
await setK("tapAt", Date.now() - 2000);
r = await act({ type: "kTap", n: 10 });
ok(r.state.kombat.coins - cf === 10 * 2 * 3 && r.state.kombat.energy >= e0, "during Fury: each tap x3 and no energy used");
await setK("furyUntil", Date.now() - 5000); await setK("tapAt", Date.now() - 2000);
const cg = (await act({ type: "kSync" })).state.kombat.coins;
r = await act({ type: "kTap", n: 10 });
ok(r.state.kombat.coins - cg === 20 && !r.state.kombat.furyUntil, "after Fury ends taps are normal again");
// treasure jar
await setK("chestAt", Date.now() + 60000);
ok((await act({ type: "kChest" })).error === "k.noChest", "treasure not ready yet");
await setK("chestAt", Date.now() - 1000);
const ch0 = (await act({ type: "kSync" })).state.kombat.coins;
r = await act({ type: "kChest" });
ok(r.state.kombat.coins - ch0 >= 1000 && r.state.kombat.chestAt > Date.now() + 19 * 60e3, "treasure gives >= 1000 and the next one comes in 20+ min");
ok((await act({ type: "kChest" })).error === "k.noChest", "can't open the same treasure twice");
// tasks
ok((await act({ type: "kTask", id: "gold" })).error === "k.taskNotYet", "task not finished can't be claimed");
r = await act({ type: "kTask", id: "fury" });
ok(r.msg && r.msg.vars.n === 3000, "task 'Start Fury' pays 3000");
ok((await act({ type: "kTask", id: "fury" })).error === "k.taskDone", "task paid only once");
ok((await act({ type: "kTask", id: "member" })).error === "k.taskNotYet", "member task needs a membership");
// community boss
let bs = await fetch(B + "/api/kombat/boss", { headers: H }).then((x) => x.json());
ok(bs.boss.lvl >= 1 && bs.boss.max === 50000, "boss level 1 (Scorpion King) has 50,000 HP");
const hp0 = bs.boss.hp;
await setK("energy", 1500); await setK("eAt", Date.now()); await setK("tapAt", Date.now() - 5000); await setK("furyUntil", 0); await setK("fury", 0);
r = await act({ type: "kTap", n: 30 });
bs = await fetch(B + "/api/kombat/boss", { headers: H }).then((x) => x.json());
const tv = 1 + r.state.kombat.tap;
ok(hp0 - bs.boss.hp === tv * 30 && bs.mine >= tv * 30, "my taps hurt the boss (damage = coins tapped)");
const bobDmg = bs.mine;
ok((await post("/api/kombat/boss/claim", {}, H)).error === "k.noBossReward", "no reward while the boss is alive");
// Carol finishes it
const Sc = (await post("/api/auth", { accessToken: "tokC" })).session;
const Hc = { Authorization: "Bearer " + Sc };
await post("/api/action", { action: { type: "kSync" } }, Hc);
await exec(`UPDATE boss SET hp = 5 WHERE killed_at IS NULL`);
await post("/api/action", { action: { type: "kTap", n: 10 } }, Hc);
bs = await fetch(B + "/api/kombat/boss", { headers: H }).then((x) => x.json());
ok(bs.boss.lvl === 2 && bs.boss.max === 110000 && bs.last && bs.last.killer === "carol", "boss falls, carol gets the final blow, level 2 appears (110,000 HP)");
ok(bs.reward === bobDmg, "bob's reward = all his damage (" + bobDmg + ")");
const cb = (await act({ type: "kSync" })).state.kombat.coins;
const cl = await post("/api/kombat/boss/claim", {}, H);
ok(cl.n === bobDmg && cl.state.kombat.coins === cb + cl.n, "bob collects his boss reward");
ok((await post("/api/kombat/boss/claim", {}, H)).error === "k.noBossReward", "boss reward only once");
const cc = await post("/api/kombat/boss/claim", {}, Hc);
ok(cc.n === 10 + 5000, "carol: her damage + 5,000 final-blow bonus");
// skins
ok((await act({ type: "kSkin", id: "crown" })).error === "k.skinLocked", "crown needs the Gold league");
await setK("coins", 200000);
r = await act({ type: "kSkin", id: "shades" });
ok(r.state.kombat.skin === "shades" && r.state.kombat.coins === 50000, "shades bought for 150,000 and worn");
r = await act({ type: "kSkin", id: "classic" });
r = await act({ type: "kSkin", id: "shades" });
ok(r.state.kombat.coins === 50000, "wearing an owned look again is free");
// airdrop record
r = await act({ type: "kSync" });
const ek = r.state.kombat;
ok(ek.earn.tap > 0 && ek.earn.fury > 0 && ek.earn.chest > 0 && ek.earn.task > 0 && ek.earn.daily > 0 && ek.earn.passive > 0, "every coin source is recorded (tap, fury, chest, task, daily, passive)");
ok(ek.act.days === 1, "1 active day counted");
const rej0 = ek.sus.rej;
await setK("energy", 1500); await setK("eAt", Date.now()); await setK("furyUntil", 0); await setK("fury", 0);
await act({ type: "kTap", n: 5 });
r = await act({ type: "kTap", n: 500 });
ok(r.state.kombat.sus.rej - rej0 > 400, "taps sent faster than a hand are noted (" + (r.state.kombat.sus.rej - rej0) + ")");
await setK("sus", { rej: 5000, mins: 0, minDay: -1, lastMin: -1, maxMins: 0 });
await setK("act", { day: -1, days: 9 });
const Sa = (await post("/api/auth", { accessToken: "tokA" })).session; // alice = owner
const Ha = { Authorization: "Bearer " + Sa };
ok((await post("/api/admin/airdrop", {}, H)).s === 403, "airdrop list is owner-only");
let ad = await post("/api/admin/airdrop", {}, Ha);
let pb = ad.players.find((p) => p.username === "bob");
ok(pb && pb.flags.includes("speed") && !pb.eligible && pb.days === 9, "bob: 9 days but 'speed' warning, so not eligible yet");
await setK("sus", { rej: 0, mins: 0, minDay: -1, lastMin: -1, maxMins: 0 });
ad = await post("/api/admin/airdrop", {}, Ha);
pb = ad.players.find((p) => p.username === "bob");
ok(pb.eligible && pb.earn.boss > 0, "without warnings and 7+ days bob is eligible (boss coins recorded too)");
await post("/api/admin/airdrop/block", { username: "bob", on: true }, Ha);
ad = await post("/api/admin/airdrop", {}, Ha);
pb = ad.players.find((p) => p.username === "bob");
ok(pb.blocked && !pb.eligible && ad.blocked === 1, "owner can leave bob out");
await post("/api/admin/airdrop/block", { username: "bob", on: false }, Ha);
ad = await post("/api/admin/airdrop", {}, Ha);
ok(ad.players.find((p) => p.username === "bob").eligible, "and put him back");
// many accounts from one network
for (const tok of ["tokA", "tokB", "tokC", "tokA2"]) await post("/api/auth", { accessToken: tok }, { "CF-Connecting-IP": "203.0.113.7" });
ad = await post("/api/admin/airdrop", {}, Ha);
pb = ad.players.find((p) => p.username === "bob");
ok(pb.sameNet === 2 && !pb.flags.includes("network"), "3 accounts on one network (a family) is fine: no warning");
const bnet = (await sql("SELECT net FROM users WHERE username='bob'"))[0].net;
await exec(`INSERT INTO users (uid, username, vip_until, ref_balance, created_at, net) VALUES ('uD', 'dave', 0, 0, 1, '${bnet}')`);
ad = await post("/api/admin/airdrop", {}, Ha);
pb = ad.players.find((p) => p.username === "bob");
ok(pb.sameNet === 3 && pb.flags.includes("network"), "4 accounts from one network get a 'network' warning");
const ips = await sql("SELECT net FROM users WHERE net IS NOT NULL LIMIT 1");
ok(ips.length && !String(ips[0].net).includes("203.0.113.7") && ips[0].net.length === 16, "only a scrambled code is stored, never the address");
// ranking
const top = await fetch(B + "/api/kombat/top").then((x) => x.json());
ok(top.top.length >= 1 && top.top[0].username === "bob" && top.top[0].total > 0, "ranking lists bob");
// Oasis game untouched
ok(typeof r.state.dates === "number" && r.state.city, "farm, city and dates still there");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
