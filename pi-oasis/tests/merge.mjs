// Horse Merge: buy, merge equal horses (endless levels), sell, collect with a 6 h cap, weekly ranking and cron prize. Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
global.window = global; await import("../public/logic.js"); const MG = globalThis.OasisLogic.MG;
ok(MG.rate(2) > MG.rate(1) * 1.7 && MG.rate(60) > MG.rate(30), "income grows with the level, endlessly");
ok(MG.cost(1) === 30 && MG.cost(10) > MG.cost(5), "a new horse costs more as you progress");
ok(MG.sellPrice(1) < MG.cost(1) && MG.sellPrice(3) === 60, "selling never earns more than buying");
const C = (await post("/api/auth", { accessToken: "tokC" })).session;
const uid = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid;
const act = (a) => post("/api/action", { action: a }, C);
const st = async () => (await sql(`SELECT json FROM state WHERE uid='${uid}'`)).map((r) => JSON.parse(r.json))[0];
await act({ type: "daily" });
await exec(`UPDATE state SET json = json_set(json, '$.dates', 100000) WHERE uid='${uid}'`);
let r = await act({ type: "mgBuy" });
ok(r.state && r.state.merge.grid[0] === 1 && r.state.dates === 100000 - 30, "buy puts a level-1 horse on the board and charges the price", r.error);
r = await act({ type: "mgBuy" }); r = await act({ type: "mgBuy" });
ok(r.state.merge.grid.slice(0, 3).join() === "1,1,1", "horses go to the first free cells");
r = await act({ type: "mgDrop", from: 0, to: 1 });
ok(r.state.merge.grid.slice(0, 3).join() === "0,2,1" && r.state.merge.merges === 1 && r.state.merge.best === 2, "equal horses merge into the next level", r.state && r.state.merge);
r = await act({ type: "mgDrop", from: 1, to: 2 });
ok(r.state.merge.grid.slice(0, 3).join() === "0,1,2", "different levels swap places");
r = await act({ type: "mgDrop", from: 5, to: 1 });
ok(r.error || r.code, "cannot move an empty cell", r);
r = await act({ type: "mgDrop", from: 1, to: 1 });
ok(r.error || r.code, "cannot drop a horse on itself");
r = await act({ type: "mgDrop", from: 1, to: 99 });
ok(r.error || r.code, "out-of-range cell refused");
// full board
await exec(`UPDATE state SET json = json_set(json, '$.merge.grid', json('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]')) WHERE uid='${uid}'`);
r = await act({ type: "mgBuy" });
ok(r.error || r.code, "buy refused when the board is full", r);
// poor
await exec(`UPDATE state SET json = json_set(json, '$.merge.grid', json('[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'), '$.dates', 5) WHERE uid='${uid}'`);
r = await act({ type: "mgBuy" });
ok(r.error || r.code, "buy refused without enough dates", r);
// income: 2 level-3 horses for 10 h => capped at 6 h
await exec(`UPDATE state SET json = json_set(json, '$.dates', 0, '$.merge.grid', json('[3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'), '$.merge.at', ${Date.now() - 10 * 3600e3}) WHERE uid='${uid}'`);
r = await act({ type: "mgCollect" });
ok(r.state && Math.abs(r.state.dates - 2 * MG.rate(3) * 6) <= 2 * MG.rate(3), "collect pays at most 6 hours", [r.state && r.state.dates, 2 * MG.rate(3) * 6]);
r = await act({ type: "mgCollect" });
ok(r.error || r.code, "nothing to collect right after", r);
r = await act({ type: "mgSell", cell: 0 });
ok(r.state.merge.grid[0] === 0 && r.state.dates >= MG.sellPrice(3), "sell removes the horse and pays the price");
// ranking
await exec(`UPDATE state SET json = json_set(json, '$.merge.grid', json('[1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'), '$.dates', 1000) WHERE uid='${uid}'`);
await act({ type: "mgDrop", from: 0, to: 1 });
let info = await get("/api/merge", C);
ok(info.me.rank === 1 && info.me.pts >= 2 && info.top[0].username === "carol", "weekly merge ranking", info.me);
// milestones
await exec(`UPDATE state SET json = json_set(json, '$.merge.best', 10) WHERE uid='${uid}'`);
info = await get("/api/merge", C);
ok(info.pending.length === 2 && info.pending[0].lv === 5 && info.pending[1].jry === 20, "milestone rewards at levels 5 and 10", info.pending);
const j0 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${uid}'`))[0].j;
r = await post("/api/merge/claim", {}, C);
const j1 = (await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${uid}'`))[0].j;
ok(r.ok && j1 - j0 === 30, "claim pays JRY points", [j0, j1]);
r = await post("/api/merge/claim", {}, C);
ok(r.error || r.code, "milestones pay once");
// weekly cron pays last week once
const lastWk = (() => { const d = new Date(Date.now() - 7 * 86400000); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); })();
await exec(`INSERT INTO merge_weeks VALUES (${lastWk}, '${uid}', 50, 1)`);
const d0 = (await st()).dates;
await fetch(B + "/__test/cron").catch(() => {}); await fetch(B + "/__test/cron").catch(() => {});
const d1 = (await st()).dates, paid = await sql("SELECT COUNT(*) AS n FROM merge_week_paid");
ok(paid[0].n === 1 && d1 - d0 === MG.weekPrize(1).dates, "cron pays last week once", [d1 - d0, paid[0].n]);
console.log(`== ${pass} passed, ${fail} failed`);
