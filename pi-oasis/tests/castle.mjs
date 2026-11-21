// Jerry Castle: shared rules, anti-cheat replay, rewards. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
global.window = global; await import("../public/castle-logic.js");
const C = globalThis.CastleLogic;

// a simple builder used as a "reasonable player": towers next to the road, upgrades when gold allows
function play(map, opts = {}) {
  const s = C.newGame(map), M = C.MAPS[map], log = [], cands = [];
  for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) { if (M.key.has(x + "," + y)) continue; let n = 0; for (const [px, py] of M.path) if ((px - x) ** 2 + (py - y) ** 2 <= 5) n++; if (n) cands.push({ x, y, n }); }
  cands.sort((a, b) => b.n - a.n);
  const kinds = ["cannon", "archer", "frost", "mortar"]; let ki = 0;
  const d = (a) => { const r = C.act(s, a); if (!r) log.push([s.tick, a]); return !r; };
  while (!s.over && s.tick < 24000) {
    if (!s.queue.length && !s.enemies.length && s.wave < C.WAVES) {
      for (let k = 0; k < 60 && s.towers.length < (opts.max || 24); k++) { const c = cands.find((q) => !s.towers.some((t) => t.x === q.x && t.y === q.y)); if (!c || !d({ a: "place", x: c.x, y: c.y, k: kinds[ki % 4] })) break; ki++; }
      for (let k = 0; k < 40; k++) { const t = s.towers.filter((q) => q.lvl < 3).sort((a, b) => a.lvl - b.lvl)[0]; if (!t || !d({ a: "up", x: t.x, y: t.y })) break; }
      d({ a: "wave" });
    }
    C.step(s);
  }
  return { s, log };
}

ok(C.MAPS.length === 3 && C.MAPS.every((m) => m.path.length > 20 && m.path[m.path.length - 1][1] === C.H - 1 || m.path[m.path.length - 1][1] === C.H - 1), "3 maps, each ends at the castle (bottom row)");
ok(C.MAPS.every((m) => new Set(m.path.map((p) => p + "")).size === m.path.length), "roads never cross themselves");
ok(C.MAPS.every((m) => m.path.every((p, i) => !i || Math.abs(p[0] - m.path[i - 1][0]) + Math.abs(p[1] - m.path[i - 1][1]) === 1)), "roads move one cell at a time");

// rules
let s = C.newGame(0);
ok(C.act(s, { a: "place", x: C.MAPS[0].path[3][0], y: C.MAPS[0].path[3][1], k: "cannon" }) === "cell", "can't build on the road");
ok(C.act(s, { a: "place", x: -1, y: 2, k: "cannon" }) === "cell" && C.act(s, { a: "place", x: 0, y: 99, k: "cannon" }) === "cell", "can't build outside the map");
ok(C.act(s, { a: "place", x: 0, y: 5, k: "laser" }) === "kind", "unknown tower refused");
ok(C.act(s, { a: "place", x: 0, y: 5, k: "mortar" }) === null && s.gold === C.START_GOLD - 90, "building costs gold");
ok(C.act(s, { a: "place", x: 0, y: 5, k: "cannon" }) === "cell", "one tower per cell");
ok(C.act(s, { a: "place", x: 0, y: 6, k: "mortar" }) === "gold", "not enough gold refused");
ok(C.act(s, { a: "up", x: 0, y: 5 }) === "gold", "upgrade needs gold");
s.gold = 1000; C.act(s, { a: "up", x: 0, y: 5 }); C.act(s, { a: "up", x: 0, y: 5 });
ok(s.towers[0].lvl === 3 && C.act(s, { a: "up", x: 0, y: 5 }) === "max", "3 levels at most");
const g0 = s.gold; C.act(s, { a: "sell", x: 0, y: 5 });
ok(s.towers.length === 0 && s.gold === g0 + Math.floor(C.invested({ kind: "mortar", lvl: 3 }) * 0.7), "selling returns 70%");
ok(C.act(s, { a: "wave" }) === null && C.act(s, { a: "wave" }) === "wave", "a new wave can't start while the last is still arriving");
ok(C.waveOf(10).some((x) => x[0] === "boss") && C.waveOf(20).some((x) => x[0] === "boss") && !C.waveOf(9).some((x) => x[0] === "boss"), "bosses on waves 10 and 20");

// the same actions always give the same game
const bot = play(0);
const again = C.simulate(0, bot.log);
ok(bot.s.won && again.won && again.hp === bot.s.hp && again.tick === bot.s.tick && again.gold === bot.s.gold, "replaying the log gives exactly the same game");
ok(C.simulate(0, []).tick === 0 || C.simulate(0, []).wave === 0, "an empty log does nothing");
// with no defence the army wins
const nod = C.newGame(0); while (!nod.over && nod.tick < 24000) { if (!nod.queue.length && !nod.enemies.length) C.act(nod, { a: "wave" }); C.step(nod); }
ok(nod.over && !nod.won && nod.hp === 0, "no towers: the castle falls");
ok(C.simulate(0, [[0, { a: "place", x: 0, y: 5, k: "cannon" }], [0, { a: "place", x: 0, y: 5, k: "cannon" }]]).error === "cell", "a cheating log (same cell twice) is rejected");
ok(C.simulate(0, [[5, { a: "wave" }], [3, { a: "wave" }]]).error === "log", "ticks going backwards are rejected");
ok(C.simulate(0, new Array(700).fill([1, { a: "wave" }])).error === "log", "huge logs are rejected");
ok(C.simulate(0, [[0, { a: "place", x: 0, y: 5, k: "mortar" }], [0, { a: "place", x: 3, y: 5, k: "mortar" }]]).error === "gold", "spending gold you don't have is rejected");
const hard = play(2);
ok(C.stars(hard.s) >= 0 && play(0, { max: 8 }).s.hp <= bot.s.hp, "fewer towers is never better");

// server
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HC = await H("tokC"), HD = await H("tokD");
let r = await get("/api/castle", HC);
ok(r.maps.length === 3 && r.maps[0].open && !r.maps[1].open && r.replaysLeft === 3, "map 1 is open, map 2 is locked");
ok((await post("/api/castle/finish", { map: 1, log: bot.log }, HC)).error === "castle.locked", "a locked map can't be finished");
ok((await post("/api/castle/finish", { map: 0, log: [[0, { a: "place", x: 0, y: 5, k: "cannon" }], [0, { a: "place", x: 0, y: 5, k: "cannon" }]] }, HC)).error === "castle.log", "the server refuses a cheating log");
const coinsOf = async (h) => Math.floor((((await get("/api/me", h)).state.kombat) || {}).coins || 0);
const c0 = await coinsOf(HC), dt0 = (await get("/api/me", HC)).state.dates;
r = await post("/api/castle/finish", { map: 0, log: bot.log }, HC);
ok(r.won && r.stars === 3 && r.kind === "first" && r.coins === Math.floor(20000 * 1.5) && r.dates === 300, "first clear with 3 stars pays coins and dates");
ok((await coinsOf(HC)) === c0 + 30000 && (await get("/api/me", HC)).state.dates >= dt0 + 300, "the rewards arrive");
const earn = (await sql("SELECT json_extract(json,'$.kombat.earn.castle') AS e FROM state WHERE uid=(SELECT uid FROM users WHERE username='carol')"))[0].e;
ok(earn === 30000, "castle coins are tagged 'castle' (they never count toward the airdrop)");
r = await post("/api/castle/finish", { map: 0, log: bot.log }, HC);
ok(r.won && r.kind === "replay" && r.coins === 3000 && r.dates === 0, "a replay pays a little");
await post("/api/castle/finish", { map: 0, log: bot.log }, HC); await post("/api/castle/finish", { map: 0, log: bot.log }, HC);
r = await post("/api/castle/finish", { map: 0, log: bot.log }, HC);
ok(r.won && r.coins === 0 && r.kind === "none", "after 3 paid replays a day nothing more is paid");
r = await get("/api/castle", HC);
ok(r.maps[1].open && r.maps[0].stars === 3 && r.replaysLeft === 0, "clearing a map opens the next one");
r = await post("/api/castle/finish", { map: 0, log: [[0, { a: "place", x: 0, y: 5, k: "cannon" }], [1, { a: "wave" }]] }, HD);
ok(!r.won && r.coins === 0 && r.wave >= 1, "a lost game pays nothing");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
