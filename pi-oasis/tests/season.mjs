// Monthly League: placement points from every game, divisions with promotion/relegation, reward track, prizes. Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
global.window = global; await import("../public/logic.js"); const L = globalThis.OasisLogic, S = L.SEASON;
const now = Date.now(), id = S.id(now), start = S.start(id), ps = S.start(id - 1);
ok(new Date(start).getUTCDay() === 1 && S.id(start) === id && S.id(start - 1) === id - 1 && S.id(start + 28 * 86400000 - 1) === id, "seasons are 4 whole weeks starting on a Monday");
ok(S.DIVS.length === 5 && S.reward("up", 0).dates === 5000 && S.reward("down", 2).jry === 0, "five divisions; going up pays most");
const names = ["alice", "bob", "carol", "dina", "emad", "fatima"], tk = ["tokA", "tokB", "tokC", "tokD", "tokE", "tokF"], T = {}, U = {};
for (let i = 0; i < 6; i++) { T[names[i]] = (await post("/api/auth", { accessToken: tk[i] })).session; U[names[i]] = (await sql(`SELECT uid FROM users WHERE username='${names[i]}'`))[0].uid; }
// current season, first week: Harvest alice > bob > carol, Horse Merge bob > carol > alice
await exec(`INSERT INTO week_scores VALUES (${start}, '${U.alice}', 900, 1), (${start}, '${U.bob}', 500, 1), (${start}, '${U.carol}', 300, 1);
  INSERT INTO merge_weeks VALUES (${start}, '${U.bob}', 50, 1), (${start}, '${U.carol}', 30, 1), (${start}, '${U.alice}', 10, 1);
  INSERT INTO week_scores VALUES (${S.start(id - 2)}, '${U.dina}', 9999, 1);`);
let r = await get("/api/season", T.carol);
ok(r.sp === 145 && r.rank === 3 && r.size === 3 && r.div === 0, "points come from the place in each game (65 + 80)", [r.sp, r.rank, r.size]);
r = await get("/api/season", T.bob);
ok(r.sp === 180 && r.rank === 1 && r.top[0].username === "bob" && r.top[1].username === "alice", "ranking inside the division", r.top);
ok(r.general[0].username === "bob" && r.top.length === 3, "previous season weeks do not count; general ranking exists");
r = await get("/api/season", T.carol);
ok(r.tiers[0].open && !r.tiers[1].open, "reward track opens by points (50, then 150)", r.tiers.map((t) => t.open));
const d0 = (await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${U.carol}'`))[0].d;
r = await post("/api/season/claim", {}, T.carol);
const d1 = (await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${U.carol}'`))[0].d;
ok(r.ok && r.tiers === 1 && d1 - d0 === 2000, "claim pays the open tier once", [r, d1 - d0]);
ok((await post("/api/season/claim", {}, T.carol)).error, "second claim refused");
// last season: six players in the same division, placements in Harvest
await exec(`INSERT INTO week_scores VALUES (${ps}, '${U.alice}', 600, 1), (${ps}, '${U.bob}', 500, 1), (${ps}, '${U.carol}', 400, 1), (${ps}, '${U.dina}', 300, 1), (${ps}, '${U.emad}', 200, 1), (${ps}, '${U.fatima}', 100, 1);`);
const jry = async (n) => (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U[n]}'`))[0].j;
const dts = async (n) => (await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${U[n]}'`))[0].d;
const [ja0, jf0, da0, df0] = [await jry("alice"), await jry("fatima"), await dts("alice"), await dts("fatima")];
await fetch(B + "/__test/cron"); await fetch(B + "/__test/cron");
const res = await sql("SELECT r.*, u.username FROM league_results r JOIN users u ON u.uid = r.uid WHERE r.season = " + (id - 1) + " ORDER BY r.rank");
ok(res.length === 6 && res[0].username === "alice" && res[0].outcome === "up" && res[0].div_to === 1 && res[5].outcome === "down" && res[1].outcome === "stay", "top 20% promoted, bottom 20% relegated, the rest stay", res.map((x) => x.outcome));
const dv = await sql(`SELECT div FROM league_div WHERE uid='${U.alice}'`);
ok(dv[0].div === 1, "the winner moves to Silver");
ok((await dts("alice")) - da0 === 5000 && (await jry("alice")) - ja0 === 20 + 1000, "promotion pays dates and JRY points, the general #1 gets the big prize", [(await dts("alice")) - da0, (await jry("alice")) - ja0]);
ok((await dts("fatima")) - df0 === 200 && (await jry("fatima")) - jf0 >= 0 && (await sql("SELECT COUNT(*) AS n FROM season_paid"))[0].n === 1, "relegated players still get a small reward; the season is paid once");
r = await get("/api/season", T.alice);
ok(r.div === 1 && r.last && r.last.outcome === "up" && r.last.from === 0 && r.last.to === 1, "the player sees last season's result", r.last);
r = await get("/api/season", T.bob);
ok(r.last.outcome === "stay" && r.div === 0, "a player who stays keeps the division");
console.log(`== ${pass} passed, ${fail} failed`);
