// Seasons: points summed from every game's weekly results, tier rewards once, prizes for last season's top 10. Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
global.window = global; await import("../public/logic.js"); const L = globalThis.OasisLogic, S = L.SEASON;
const now = Date.now(), id = S.id(now), start = S.start(id);
ok(new Date(start).getUTCDay() === 1 && S.id(start) === id && S.id(start - 1) === id - 1 && S.id(start + 28 * 86400000 - 1) === id, "seasons are 4 whole weeks starting on a Monday");
const toks = [["alice", "tokA"], ["bob", "tokB"], ["carol", "tokC"]]; const T = {}, U = {};
for (const [n, t] of toks) { T[n] = (await post("/api/auth", { accessToken: t })).session; U[n] = (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid; }
const wk = L.weekId(now), prev = wk - 7 * 86400000;
// carol: oasis 20000/100=200, merge 500/10=50, derby 30, kombat 40000/1000=40 -> 320 SP (weeks in this season only)
const inSeason = start; // first week of the season
await exec(`INSERT INTO week_scores VALUES (${inSeason}, '${U.carol}', 20000, 1), (${inSeason}, '${U.bob}', 5000, 1);
  INSERT INTO merge_weeks VALUES (${inSeason}, '${U.carol}', 500, 1);
  INSERT INTO derby_weeks VALUES (${inSeason}, '${U.carol}', 30, 1);
  INSERT INTO kombat_weeks VALUES (${inSeason}, '${U.carol}', 40000, 1);
  INSERT INTO week_scores VALUES (${start - 7 * 86400000}, '${U.alice}', 900000, 1);`);
let r = await get("/api/season", T.carol);
ok(r.sp === 320 && r.rank === 1, "season points add up the games", [r.sp, r.rank]);
ok(r.top.length === 2 && r.top[0].username === "carol" && r.top[1].username === "bob", "previous season weeks do not count", r.top);
ok(r.tiers[0].open && r.tiers[1].open && !r.tiers[2].open, "tiers open by points (50, 150, then 400)", r.tiers.map((t) => t.open));
const d0 = (await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${U.carol}'`))[0].d;
const j0 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U.carol}'`))[0].j;
r = await post("/api/season/claim", {}, T.carol);
const d1 = (await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${U.carol}'`))[0].d;
const j1 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U.carol}'`))[0].j;
ok(r.ok && r.tiers === 2 && d1 - d0 === 2000 && j1 - j0 === 20, "claim pays every open tier once", [r, d1 - d0, j1 - j0]);
r = await post("/api/season/claim", {}, T.carol);
ok(r.error || r.code, "second claim refused");
r = await get("/api/season", T.bob);
ok(r.sp === 50 && r.tiers[0].open && r.rank === 2, "another player: own points and rank", [r.sp, r.rank]);
// last season prizes: season id-1 board
const ps = S.start(id - 1);
await exec(`INSERT INTO week_scores VALUES (${ps}, '${U.alice}', 900000, 1), (${ps}, '${U.bob}', 300000, 1);`);
const ja0 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U.alice}'`))[0].j;
await fetch(B + "/__test/cron"); await fetch(B + "/__test/cron");
const ja1 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U.alice}'`))[0].j;
const jb = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${U.bob}'`))[0].j;
const paidRows = (await sql("SELECT COUNT(*) AS n FROM season_paid"))[0].n;
ok(paidRows === 1 && ja1 - ja0 >= 1000 && ja1 - ja0 < 2000 && jb >= 600, "last season's top players get JRY points, once", [ja1 - ja0, jb, paidRows]);
console.log(`== ${pass} passed, ${fail} failed`);
