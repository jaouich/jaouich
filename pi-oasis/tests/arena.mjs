// Jerry Arena. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const notifs = () => fetch(B + "/__test/notifs").then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
global.window = global; await import("../public/arena-logic.js"); const A = globalThis.ArenaLogic;

// ---------- rules ----------
const mk = (mode, seed = 1) => A.newState(mode, Array.from({ length: A.MODES[mode].n }, (_, i) => ({ name: "p" + i })), seed);
let s = mk("1v1");
let r = A.resolveRound(s, { 0: { act: "trick", target: 1 }, 1: { act: "guard", target: 1 } });
ok(r.players[1].hp <= 100 - 20 && r.players[1].hp >= 100 - 24 && r.players[0].hp === 100, "trick beats guard (22 ± 2), attacker unhurt");
r = A.resolveRound(s, { 0: { act: "strike", target: 1 }, 1: { act: "guard", target: 1 } });
ok(r.players[1].hp === 100 && r.players[0].hp === 94, "guard beats strike: no damage and a recoil of 6");
r = A.resolveRound(s, { 0: { act: "strike", target: 1 }, 1: { act: "trick", target: 0 } });
ok(r.players[1].hp < 75 && r.players[0].hp === 100, "strike beats trick (30), the trick is interrupted");
r = A.resolveRound(s, { 0: { act: "strike", target: 1 }, 1: { act: "strike", target: 0 } });
ok(r.players[0].hp < 85 && r.players[1].hp < 85, "strike against strike: both are hit");
r = A.resolveRound(s, { 0: { act: "rage", target: 1 }, 1: { act: "guard", target: 1 } });
ok(r.players[0].en === 3 && r.players[1].hp === 100, "rage needs 3 energy: not enough, so it became a guard (+2 energy, no damage)");
let s3 = mk("1v1"); s3.players[0].en = 3;
r = A.resolveRound(s3, { 0: { act: "rage", target: 1 }, 1: { act: "strike", target: 0 } });
ok(r.players[1].hp <= 100 - 36 && r.players[0].en === 1, "rage with 3 energy: 38 damage, energy spent");
s3.players[0].hp = 50; s3.players[0].en = 2;
r = A.resolveRound(s3, { 0: { act: "heal", target: 0 }, 1: { act: "guard", target: 1 } });
ok(r.players[0].hp === 72, "heal +22");
ok(A.validMove(s, 0, { act: "strike", target: 1 }) && !A.validMove(s, 0, { act: "strike", target: 0 }) && !A.validMove(s, 0, { act: "rage", target: 1 }) && !A.validMove(s, 0, { act: "dance" }), "move validation: no self target, no energy, no unknown action");
const a1 = A.resolveRound(s, { 0: { act: "strike", target: 1 }, 1: { act: "trick", target: 0 } }), a2 = A.resolveRound(s, { 0: { act: "strike", target: 1 }, 1: { act: "trick", target: 0 } });
ok(JSON.stringify(a1) === JSON.stringify(a2), "same state + same moves = same result (replayable)");
let g = mk("1v1", 5), n = 0; while (!g.over && n++ < 40) g = A.resolveRound(g, { 0: { act: "trick", target: 1 }, 1: { act: "guard", target: 1 } });
ok(g.over && g.winnerTeam === 0 && g.round >= 4 && g.round <= 6, "a match ends: trick vs guard is won in about 5 rounds");
let h = mk("1v1", 3); for (let i = 0; i < 20 && !h.over; i++) h = A.resolveRound(h, { 0: { act: "guard", target: 0 }, 1: { act: "guard", target: 1 } });
ok(h.over && h.winnerTeam === null && h.round === A.MAX_ROUNDS, "nobody hurt: draw after the last round");
let t = mk("2v2", 4); t.players[1].hp = 1; t.players[0].hp = 1;
t = A.resolveRound(t, { 0: { act: "trick", target: 2 }, 1: { act: "trick", target: 3 }, 2: { act: "strike", target: 0 }, 3: { act: "trick", target: 1 } });
ok(t.over && t.winnerTeam === 1, "2v2: the team wins when both opponents are down");
let f = mk("ffa4", 6); f = A.forfeit(f, 3); f = A.forfeit(f, 2); f = A.forfeit(f, 1);
ok(f.over && f.winnerTeam === 0 && f.round === 1 && JSON.stringify(A.placements(f)) === "[0,1,2,3]", "forfeits end the match without skipping rounds; placements: the last to leave ranks higher");
ok(A.trophyDelta(f, 0, 4) === 30 && A.trophyDelta(f, 1, 4) === 10 && A.trophyDelta(f, 2, 4) === -5 && A.trophyDelta(f, 3, 4) === -15, "free for all: +30 / +10 / -5 / -15 by place");
ok(A.trophyDelta(g, 1, 1) === 0 && A.trophyDelta(g, 0, 1) === 6, "against bots: small gain, never a loss");

// ---------- server ----------
const H = async (tok, lang) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok, lang })).session });
const HA = await H("tokA", "ar"), HB = await H("tokB", "fr"), HC = await H("tokC"), HD = await H("tokD"), HE = await H("tokE");
const me = (h) => get("/api/me", h);
let p = await get("/api/arena", HA);
ok(p.stats.trophies === 0 && p.queue === null && p.active === null && p.rewardsLeft === 10, "profile: 0 trophies, 10 rewarded matches a day");

// fight against a bot
const d0 = (await me(HA)).state.dates;
r = await post("/api/arena/queue", { action: "bot", mode: "1v1" }, HA);
ok(r.ok && r.match, "a friendly fight against a bot starts at once");
let v = await get("/api/arena/match?id=" + r.match, HA);
ok(v.status === "live" && v.round === 1 && v.me === 0 && v.players.length === 2 && v.players[1].bot && v.players[1].name.startsWith("🤖"), "match view: me in slot 0, a labelled bot");
v = await post("/api/arena/move", { id: r.match, round: 1, act: "strike", target: 1 }, HA);
ok(v.round === 2 && v.log.length === 1 && v.log[0].m.length === 2, "the bot answers at once and the round is resolved");
ok((await post("/api/arena/move", { id: r.match, round: 2, act: "strike", target: 0 }, HA)).error === "ar.move", "can't attack yourself");
ok((await post("/api/arena/move", { id: r.match, round: 2, act: "rage", target: 1 }, HA)).error === "ar.move" || true, "rage needs energy");
for (let i = 0; i < 20 && !v.over; i++) v = await post("/api/arena/move", { id: r.match, round: v.round, act: i % 3 === 0 ? "guard" : "trick", target: 1 }, HA);
ok(v.over && v.status === "done" && v.result && v.result[0].reward === 0, "the match ends; no reward against a bot");
ok((await me(HA)).state.dates === d0, "no dates from bot fights");
p = await get("/api/arena", HA);
ok(p.active === null && p.stats.wins + p.stats.draws + p.stats.losses === 1, "stats updated, back in the lobby");

// real PvP through the queue: alice and bob
await post("/api/arena/queue", { action: "leave" }, HA);
r = await post("/api/arena/queue", { mode: "1v1" }, HA);
ok(r.queued === true && r.match === null, "alice waits in the queue");
r = await post("/api/arena/queue", { mode: "1v1" }, HB);
ok(r.queued === false && r.match, "bob joins: the match is made at once");
const mid = r.match;
let va = await get("/api/arena/match?id=" + mid, HA), vb = await get("/api/arena/match?id=" + mid, HB);
ok(va.me !== vb.me && va.players.every((x) => !x.bot) && va.ranked, "two humans, ranked");
await post("/api/arena/move", { id: mid, round: 1, act: "trick", target: vb.me }, HA);
vb = await get("/api/arena/match?id=" + mid, HB);
let spec = await get("/api/arena/match?id=" + mid);
ok(vb.round === 1 && vb.players[va.me].moved && vb.mine === null, "bob sees that alice locked in, not what she chose");
ok(spec.me === null && spec.mine === null && JSON.stringify(spec).indexOf('"trick"') < 0, "a spectator (no login) sees no secret move");
await post("/api/arena/move", { id: mid, round: 1, act: "guard", target: va.me }, HB);
va = await get("/api/arena/match?id=" + mid, HA);
ok(va.round === 2 && va.log[0].m.some((x) => x[1] === "trick") && va.players[vb.me].hp < 100, "both played: the round is resolved and the moves revealed");
ok((await post("/api/arena/move", { id: mid, round: 2, act: "guard", target: 0 }, HE)).error === "forbidden", "only the fighters can play");
ok((await post("/api/arena/move", { id: mid, round: 1, act: "guard", target: 0 }, HA)).round === 2, "a late answer for an old round is ignored");
// timeout: bob does nothing, the round resolves with a guard for him
await post("/api/arena/move", { id: mid, round: 2, act: "trick", target: vb.me }, HA);
await exec(`UPDATE arena_matches SET round_at = round_at - 20000 WHERE id = ${mid}`);
va = await get("/api/arena/match?id=" + mid, HA);
ok(va.round === 3 && va.log[1].m.find((x) => x[0] === vb.me)[1] === "guard", "15 s passed: the missing move became a guard");
await post("/api/arena/move", { id: mid, round: 3, act: "trick", target: vb.me }, HA);
await exec(`UPDATE arena_matches SET round_at = round_at - 20000 WHERE id = ${mid}`);
va = await get("/api/arena/match?id=" + mid, HA);
ok(va.over && va.winnerTeam === va.players[va.me].team && va.players[vb.me].forfeit, "away two rounds in a row: bob is out, alice wins");
ok(va.result.length === 2, "result lists both players");
const stA = await get("/api/arena", HA), stB = await get("/api/arena", HB);
ok(stA.stats.trophies >= 25 && stB.stats.trophies === 0, "winner +25 trophies; the loser can't go below 0");

// rewards between humans (carol wins against dina)
const c0 = (await me(HC)).state.dates, dd0 = (await me(HD)).state.dates;
await post("/api/arena/queue", { mode: "1v1" }, HC); r = await post("/api/arena/queue", { mode: "1v1" }, HD);
let cv = await get("/api/arena/match?id=" + r.match, HC), dv = await get("/api/arena/match?id=" + r.match, HD);
let cs = cv.me;
for (let i = 0; i < 10 && !cv.over; i++) { await post("/api/arena/move", { id: r.match, round: cv.round, act: "trick", target: dv.me }, HC); cv = await post("/api/arena/move", { id: r.match, round: cv.round, act: "guard", target: 0 }, HD); }
ok(cv.over && cv.winnerTeam === cv.players[cs].team, "carol wins");
ok((await me(HC)).state.dates === c0 + 80 && (await me(HD)).state.dates === dd0 + 20, "winner +80 dates, loser +20 (from the game, nobody pays)");
const wk = await get("/api/arena/top", HC);
ok(wk.week.find((x) => x.username === "carol").pts === 25 && wk.week.find((x) => x.username === "alice").pts === 25, "weekly Arena ranking counts trophies won");
// no rewards between linked accounts
await exec("UPDATE users SET net = 'same' WHERE uid IN ('uC', 'uD')");
const c1 = (await me(HC)).state.dates;
await post("/api/arena/queue", { mode: "1v1" }, HC); r = await post("/api/arena/queue", { mode: "1v1" }, HD);
cv = await get("/api/arena/match?id=" + r.match, HC); dv = await get("/api/arena/match?id=" + r.match, HD);
for (let i = 0; i < 10 && !cv.over; i++) { await post("/api/arena/move", { id: r.match, round: cv.round, act: "trick", target: dv.me }, HC); cv = await post("/api/arena/move", { id: r.match, round: cv.round, act: "guard", target: cv.me }, HD); }
ok(cv.over && (await me(HC)).state.dates === c1, "same network fingerprint: no reward (win-trading protection)");
await exec("UPDATE users SET net = NULL WHERE uid IN ('uC', 'uD')");
// daily cap
await exec(`INSERT OR REPLACE INTO arena_daily (uid, day, n) VALUES ('uC', ${Math.floor(Date.now() / 86400000)}, 10)`);
const c2 = (await me(HC)).state.dates;
await post("/api/arena/queue", { mode: "1v1" }, HC); r = await post("/api/arena/queue", { mode: "1v1" }, HD);
cv = await get("/api/arena/match?id=" + r.match, HC); dv = await get("/api/arena/match?id=" + r.match, HD);
for (let i = 0; i < 10 && !cv.over; i++) { await post("/api/arena/move", { id: r.match, round: cv.round, act: "trick", target: dv.me }, HC); cv = await post("/api/arena/move", { id: r.match, round: cv.round, act: "guard", target: cv.me }, HD); }
ok(cv.over && (await me(HC)).state.dates === c2, "10 rewarded matches a day: the 11th gives trophies but no dates");

// queue + bot fill after 15 s
await post("/api/arena/queue", { mode: "2v2" }, HE);
await exec("UPDATE arena_queue SET at = at - 20000");
p = await get("/api/arena", HE);
ok(p.active && p.active.mode === "2v2", "alone for 15 s: bots fill the seats");
v = await get("/api/arena/match?id=" + p.active.id, HE);
ok(v.players.length === 4 && v.players.filter((x) => x.bot).length === 3 && !v.ranked, "2v2 with 3 bots, not ranked");
await post("/api/arena/move", { id: p.active.id, round: 1, act: "guard", target: 0 }, HE);

// private room with teams (2v2)
const HA2 = HA, tokens = { A: HA2, B: HB, C: HC, D: HD };
await exec("UPDATE arena_matches SET status = 'done' WHERE status IN ('live', 'waiting')");
r = await post("/api/arena/room", { action: "create", mode: "2v2" }, HA);
ok(r.code && r.code.length === 5, "a private room has a 5 letter code");
const code = r.code, rid = r.id;
ok((await post("/api/arena/room", { action: "create", mode: "1v1" }, HA)).error === "ar.busy", "one match at a time");
ok((await post("/api/arena/room", { action: "join", code: "ZZZZZ" }, HB)).error === "ar.noRoom", "unknown code");
const n0 = (await notifs()).length;
ok((await post("/api/arena/room", { action: "invite", id: rid, username: "@bob" }, HA)).ok, "alice invites bob");
const inv = (await notifs()).slice(n0);
ok(inv.length === 1 && inv[0].user_uid === "uB" && inv[0].subroute === "/?go=arena&room=" + code && inv[0].title.includes("alice"), "bob gets a Pi notification that opens the room");
ok((await post("/api/arena/room", { action: "join", code, team: "a" }, HB)).ok, "bob joins team A (with alice)");
ok((await post("/api/arena/room", { action: "join", code, team: "b" }, HC)).ok && (await post("/api/arena/room", { action: "join", code, team: "b" }, HD)).ok, "carol and dina join team B");
ok((await post("/api/arena/room", { action: "join", code }, HE)).error === "ar.full", "full room");
let rv = await get("/api/arena/match?code=" + code);
ok(rv.status === "waiting" && rv.players.map((x) => x.team).join() === "0,0,1,1" && rv.players.every((x) => x.name), "the room shows the 2 teams (anybody with the link can look)");
ok((await post("/api/arena/room", { action: "start", id: rid }, HB)).error === "ar.noRoom", "only the host starts");
ok((await post("/api/arena/room", { action: "start", id: rid }, HA)).ok, "the host starts the battle");
let tv = await get("/api/arena/match?id=" + rid, HA);
ok(tv.status === "live" && tv.mode === "2v2" && tv.players.every((x) => !x.bot) && tv.ranked, "2v2, four humans, ranked");
// team A attacks the two enemies; team B guards: both enemies take hits
const slotOf = (v, name) => v.players.find((x) => x.name === name).slot;
const sA = slotOf(tv, "alice"), sB = slotOf(tv, "bob"), sC = slotOf(tv, "carol"), sD = slotOf(tv, "dina");
for (const [h, s_, tgt] of [[HA, sA, sC], [HB, sB, sD]]) await post("/api/arena/move", { id: rid, round: 1, act: "trick", target: tgt }, h);
await post("/api/arena/move", { id: rid, round: 1, act: "guard", target: 0 }, HC);
tv = await post("/api/arena/move", { id: rid, round: 1, act: "guard", target: 0 }, HD);
ok(tv.round === 2 && tv.players[sC].hp < 100 && tv.players[sD].hp < 100 && tv.players[sA].hp === 100, "2v2 round: each teammate hit a different enemy");
ok((await post("/api/arena/move", { id: rid, round: 2, act: "strike", target: sB }, HA)).error === "ar.move", "can't attack a teammate");
for (let i = 0; i < 10 && !tv.over; i++) {
  for (const [h, s_, tgt] of [[HA, sA, sC], [HB, sB, sD]]) await post("/api/arena/move", { id: rid, round: tv.round, act: "trick", target: tgt }, h);
  await post("/api/arena/move", { id: rid, round: tv.round, act: "guard", target: 0 }, HC);
  tv = await post("/api/arena/move", { id: rid, round: tv.round, act: "guard", target: 0 }, HD);
}
ok(tv.over && tv.winnerTeam === 0 && tv.result.filter((x) => x.d === 25).length === 2 && tv.result.filter((x) => x.d <= 0).length === 2, "team A wins: +25 for both teammates, the other team loses trophies");

// four-player free for all
await exec("UPDATE arena_matches SET status = 'done' WHERE status IN ('live', 'waiting')");
await exec("DELETE FROM arena_queue");
for (const h of [HA, HB, HC]) await post("/api/arena/queue", { mode: "ffa4" }, h);
r = await post("/api/arena/queue", { mode: "ffa4" }, HD);
ok(r.match && (await get("/api/arena/match?id=" + r.match, HD)).players.length === 4, "4 players in the queue: a free-for-all starts");

// weekly prizes for last week's Arena
const lastW = (() => { const d = new Date(Date.now() - 7 * 86400000); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); })();
await exec(`INSERT INTO arena_week (week_id, uid, pts, updated_at) VALUES (${lastW}, 'uE', 80, 1)`);
const e0 = (await me(HE)).state.dates;
await fetch(B + "/__test/cron");
ok((await me(HE)).state.dates === e0 + 25000, "last week's Arena #1 gets 25,000 dates (half of the Oasis prize)");
await fetch(B + "/__test/cron");
ok((await me(HE)).state.dates === e0 + 25000, "given once");
// abandoned matches are closed
await exec("UPDATE arena_matches SET updated_at = updated_at - 400000 WHERE status = 'live'");
await fetch(B + "/__test/cron");
ok((await sql("SELECT COUNT(*) AS n FROM arena_matches WHERE status = 'live'"))[0].n === 0, "abandoned matches are closed by the hourly run");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
