// Daily missions and streak tests. Start tests/harness.mjs first (fresh database).
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text()).then((x) => { try { return JSON.parse(x); } catch { return x; } });
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => post("/__test/exec", q);
let pass = 0, fail = 0;
const ok = (c, m, extra) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra))); c ? pass++ : fail++; };
const today = Math.floor(Date.now() / 86400000);

const C = (await post("/api/auth", { accessToken: "tokC" })).session;
const uidC = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid;
const act = (a, tok = C) => post("/api/action", { action: a }, tok);
const st = async (uid = uidC) => JSON.parse((await sql(`SELECT json FROM state WHERE uid='${uid}'`))[0].json);
const setJson = (path, value, uid = uidC) => exec(`UPDATE state SET json = json_set(json, '${path}', json('${JSON.stringify(value)}')) WHERE uid='${uid}'`);
const POOL = ["harvest", "plant", "deliver", "craft", "stake", "collect"];

let me = await get("/api/me", C);
let m = me.state.missions;
ok(m.day === today && m.list.length === 3 && new Set(m.list.map((x) => x.k)).size === 3 && m.list.every((x) => POOL.includes(x.k)), "3 different missions for today", m);
const me2 = await get("/api/me", C);
ok(JSON.stringify(me2.state.missions.list.map((x) => x.k)) === JSON.stringify(m.list.map((x) => x.k)), "the same missions all day");
let r = await act({ type: "mission", index: 0 });
ok(r.error === "missionNotDone", "can't claim before finishing", r);
ok((await act({ type: "mission", index: 9 })).error === "badAction", "unknown mission refused");

// progress is counted by the real actions
await setJson("$.missions.list", [{ k: "plant", n: 2, r: 100, p: 0, c: false }, { k: "harvest", n: 1, r: 120, p: 0, c: false }, { k: "craft", n: 2, r: 150, p: 0, c: false }]);
await setJson("$.dates", 1000);
await act({ type: "plant", plot: 0, seed: "wheat" });
r = await act({ type: "plant", plot: 1, seed: "wheat" });
ok(r.state.missions.list[0].p === 2, "planting counts toward 'plant' (2/2)");
await act({ type: "plant", plot: 2, seed: "wheat" });
ok((await st()).missions.list[0].p === 2, "progress stops at the target");
await setJson("$.plots[0].plantedAt", 1);
r = await act({ type: "harvest", plot: 0 });
ok(r.state.missions.list[1].p === 1, "harvesting counts toward 'harvest' (1/1)");
r = await act({ type: "cityCraft", tile: 13, qty: 2 });
ok(r.state.missions.list[2].p === 2, "crafting 2 goods counts 2 toward 'craft'");

// claiming
const before = await st();
r = await act({ type: "mission", index: 0 });
ok(r.msg?.key === "t.missionDone" && r.state.dates - before.dates === 100 && r.state.week.score - before.week.score === 100, "claim: +100 dates and +100 score (free player)", [r.state?.dates - before.dates, r.state?.week.score - before.week.score]);
ok((await act({ type: "mission", index: 0 })).error === "badAction", "can't claim the same mission twice");
await act({ type: "mission", index: 1 });
const b2 = await st();
r = await act({ type: "mission", index: 2 });
ok(r.msg?.key === "t.streakBonus" && r.state.missions.streak === 1 && r.state.missions.done === true, "finishing all 3 starts a streak of 1", r.msg);
ok(r.state.dates - b2.dates === 150 + 40, "last claim: 150 + streak bonus 40", r.state?.dates - b2.dates);
ok((await act({ type: "mission", index: 2 })).error === "badAction", "no second streak bonus on the same day");

// streak across days
await exec(`UPDATE state SET json = json_set(json, '$.missions.day', ${today - 1}, '$.missions.done', json('true'), '$.missions.streak', 3) WHERE uid='${uidC}'`);
me = await get("/api/me", C);
ok(me.state.missions.day === today && me.state.missions.streak === 3 && !me.state.missions.done, "next day: new missions, streak kept (3)", me.state.missions);
await exec(`UPDATE state SET json = json_set(json, '$.missions.day', ${today - 2}, '$.missions.done', json('true'), '$.missions.streak', 3) WHERE uid='${uidC}'`);
me = await get("/api/me", C);
ok(me.state.missions.streak === 0, "after a missed day the streak restarts", me.state.missions.streak);
await exec(`UPDATE state SET json = json_set(json, '$.missions.day', ${today - 1}, '$.missions.done', json('false'), '$.missions.streak', 5) WHERE uid='${uidC}'`);
me = await get("/api/me", C);
ok(me.state.missions.streak === 0, "unfinished yesterday: streak restarts");

// streak bonus grows and is capped at 7 days
await setJson("$.missions", { day: today, streak: 8, done: false, list: [{ k: "plant", n: 1, r: 10, p: 1, c: false }, { k: "plant2", n: 1, r: 10, p: 1, c: true }, { k: "plant3", n: 1, r: 10, p: 1, c: true }] });
const b3 = await st();
r = await act({ type: "mission", index: 0 });
ok(r.state.dates - b3.dates === 10 + 7 * 40, "streak bonus is capped at 7 days (280)", r.state?.dates - b3.dates);

// membership bonus: more dates, same score
const G = (await post("/api/auth", { accessToken: "tokB" })).session;
const uidB = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;
await exec(`UPDATE users SET vip_until = ${Date.now() + 9e8}, vip_tier = 'gold' WHERE uid='${uidB}'`);
await act({ type: "cityTick" }, G);
await setJson("$.missions", { day: today, streak: 0, done: false, list: [{ k: "plant", n: 1, r: 200, p: 1, c: false }, { k: "harvest", n: 1, r: 10, p: 0, c: false }, { k: "stake", n: 1, r: 10, p: 0, c: false }] }, uidB);
const b4 = await st(uidB);
r = await act({ type: "mission", index: 0 }, G);
ok(r.state.dates - b4.dates === 200 + 70 && r.state.week.score - b4.week.score === 200, "Gold: +200 +70 dates but only 200 score", [r.state?.dates - b4.dates, r.state?.week.score - b4.week.score]);

console.log(`== ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
