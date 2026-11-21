// Jerry Arena: turn-based battles, simultaneous rounds. 1v1, 2v2 (teams) or 4 players free for all.
// Shared by the server (which decides everything) and the app (which only shows and sends choices).
// No luck in who wins: a seeded +-2 damage variance only, so every match can be replayed from its log.
// No pay-to-win: every fighter has the same stats; nothing bought changes a battle.
(function (root) {
  const A = {
    HP: 100, EN_START: 1, EN_MAX: 5, ROUND_MS: 15000, MAX_ROUNDS: 14, AFK_LIMIT: 2,
    MODES: { "1v1": { n: 2, teams: [0, 1] }, "2v2": { n: 4, teams: [0, 0, 1, 1] }, ffa4: { n: 4, teams: [0, 1, 2, 3] } },
    // cost = energy; attacks hit one chosen enemy. strike/trick/guard form a triangle:
    // strike beats trick, trick beats guard, guard beats strike.
    ACTS: { strike: { cost: 0 }, trick: { cost: 0 }, guard: { cost: 0 }, rage: { cost: 3 }, heal: { cost: 2 } },
    ATTACKS: ["strike", "trick", "rage"],
    HEAL: 22, VAR: 2,
    BOT_NAMES: ["Sahara", "Dune", "Mirage", "Falcon", "Scorpion", "Viper", "Storm", "Nomad", "Oryx", "Jackal"],
    TROPHIES: { WIN: 25, LOSS: -15, DRAW: 5, FFA: [30, 10, -5, -15], BOT_WIN: 6, BOT_DRAW: 2 },
  };

  // Deterministic pseudo-random number in [0, 1) from a few integers (seed, round, slots…)
  function rand(...xs) {
    let h = 2166136261;
    for (const x of xs) { h ^= (x | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; }
    return ((h >>> 0) % 100000) / 100000;
  }

  // What an attack does to a target, depending on what the target does this round
  function hit(att, tgt) {
    if (att === "strike") return tgt === "guard" ? { dmg: 0, recoil: 6 } : tgt === "trick" ? { dmg: 30, recoil: 0 } : { dmg: 20, recoil: 0 };
    if (att === "trick") return tgt === "guard" ? { dmg: 22, recoil: 0 } : tgt === "strike" ? { dmg: 0, recoil: 0 } : { dmg: 14, recoil: 0 };
    if (att === "rage") return tgt === "guard" ? { dmg: 19, recoil: 0 } : { dmg: 38, recoil: 0 };
    return { dmg: 0, recoil: 0 };
  }

  // players: [{ uid, name, bot }] in slot order. Teams come from the mode.
  function newState(mode, players, seed) {
    const M = A.MODES[mode];
    if (!M || players.length !== M.n) throw new Error("bad mode");
    return {
      mode, seed: seed | 0, round: 1, over: false, winnerTeam: null, deaths: [], log: [],
      players: players.map((p, i) => ({ slot: i, uid: p.uid || null, name: p.name, bot: !!p.bot, team: M.teams[i], hp: A.HP, en: A.EN_START, alive: true, afk: 0 })),
    };
  }
  const alive = (s) => s.players.filter((p) => p.alive);
  const enemiesOf = (s, slot) => alive(s).filter((p) => p.team !== s.players[slot].team);

  // Turns a choice into a valid one; anything invalid becomes guard (it never throws)
  function normalizeMove(s, slot, mv) {
    const me = s.players[slot];
    let act = mv && A.ACTS[mv.act] ? mv.act : "guard";
    if (!me || !me.alive) return { act: "guard", target: slot };
    if (A.ACTS[act].cost > me.en) act = "guard";
    if (act === "guard" || act === "heal") return { act, target: slot };
    const foes = enemiesOf(s, slot);
    let t = Number(mv && mv.target);
    if (!foes.some((p) => p.slot === t)) t = (foes.slice().sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0] || {}).slot;
    return { act, target: t === undefined ? slot : t };
  }
  const validMove = (s, slot, mv) => {
    const n = normalizeMove(s, slot, mv);
    return !!mv && n.act === mv.act && (n.act === "guard" || n.act === "heal" || n.target === Number(mv.target));
  };

  // Resolves one round. moves: { slot: { act, target } } for every living player. Returns the new state.
  function resolveRound(s0, moves) {
    const s = JSON.parse(JSON.stringify(s0));
    const mv = {};
    for (const p of alive(s)) mv[p.slot] = normalizeMove(s, p.slot, moves[p.slot]);
    const inc = {}, heal = {};
    for (const p of alive(s)) { inc[p.slot] = 0; heal[p.slot] = 0; }
    for (const p of alive(s)) {
      const m = mv[p.slot];
      if (m.act === "heal") heal[p.slot] = A.HEAL;
      if (!A.ATTACKS.includes(m.act)) continue;
      const tm = mv[m.target];
      if (!tm) continue;
      const h = hit(m.act, tm.act);
      if (h.dmg) inc[m.target] += Math.max(1, h.dmg + Math.round((rand(s.seed, s.round, p.slot, m.target) - 0.5) * 2 * A.VAR));
      inc[p.slot] += h.recoil;
    }
    const entry = { r: s.round, m: [], d: {}, h: {} };
    for (const p of alive(s)) {
      const m = mv[p.slot];
      entry.m.push([p.slot, m.act, m.target]);
      p.en = Math.min(A.EN_MAX, p.en - A.ACTS[m.act].cost + 1 + (m.act === "guard" ? 1 : 0));
      const before = p.hp;
      p.hp = Math.min(A.HP, p.hp + heal[p.slot]) - inc[p.slot];
      if (heal[p.slot]) entry.h[p.slot] = Math.min(A.HP, before + heal[p.slot]) - before;
      if (inc[p.slot]) entry.d[p.slot] = inc[p.slot];
      if (p.hp <= 0) { p.hp = 0; p.alive = false; s.deaths.push(p.slot); }
    }
    s.log.push(entry);
    return finishCheck(s);
  }

  // Ends the match when one team (or nobody) is left, or after the last round (highest team HP wins)
  function finishCheck(s, advance = true) {
    const teams = [...new Set(alive(s).map((p) => p.team))];
    if (teams.length <= 1) { s.over = true; s.winnerTeam = teams.length ? teams[0] : null; return s; }
    if (!advance) return s;
    if (s.round >= A.MAX_ROUNDS) {
      const hp = {};
      for (const p of alive(s)) hp[p.team] = (hp[p.team] || 0) + p.hp;
      const best = Math.max(...Object.values(hp)), top = Object.keys(hp).filter((t) => hp[t] === best);
      s.over = true; s.winnerTeam = top.length === 1 ? Number(top[0]) : null;
      return s;
    }
    s.round++;
    return s;
  }
  // Someone left or stayed away: they are out of the match
  function forfeit(s0, slot) {
    const s = JSON.parse(JSON.stringify(s0));
    const p = s.players[slot];
    if (p && p.alive) { p.alive = false; p.hp = 0; p.forfeit = true; s.deaths.push(slot); }
    return finishCheck(s, false);
  }

  // Best to worst: the survivors (by HP) first, then the others, last to die ranking higher
  function placements(s) {
    const survivors = alive(s).sort((a, b) => b.hp - a.hp || a.slot - b.slot).map((p) => p.slot);
    return [...survivors, ...s.deaths.slice().reverse().filter((x) => !survivors.includes(x))];
  }
  // Trophies won or lost by one slot at the end. humans = number of real players in the match.
  function trophyDelta(s, slot, humans) {
    const T = A.TROPHIES, p = s.players[slot];
    if (humans < 2) return s.winnerTeam === p.team ? T.BOT_WIN : s.winnerTeam === null ? T.BOT_DRAW : 0; // never lose against bots
    if (s.mode === "ffa4") return T.FFA[placements(s).indexOf(slot)] || 0;
    return s.winnerTeam === null ? T.DRAW : s.winnerTeam === p.team ? T.WIN : T.LOSS;
  }

  // Simple bot: reacts to what its target did last round, manages its energy, heals when low
  function botMove(s, slot) {
    const me = s.players[slot], foes = enemiesOf(s, slot);
    if (!foes.length) return { act: "guard", target: slot };
    const tgt = foes.slice().sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0];
    const r = rand(s.seed, s.round, slot, 777), last = s.log[s.log.length - 1];
    const lastAct = last && (last.m.find((x) => x[0] === tgt.slot) || [])[1];
    if (me.hp <= 40 && me.en >= 2 && r < 0.55) return { act: "heal", target: slot };
    if (me.en >= 3 && (tgt.hp <= 38 || r < 0.35)) return { act: "rage", target: tgt.slot };
    const counter = lastAct === "guard" ? "trick" : lastAct === "strike" ? "guard" : lastAct === "trick" ? "strike" : null;
    const pick = counter && r < 0.7 ? counter : ["strike", "trick", "guard"][Math.floor(rand(s.seed, s.round, slot, 5) * 3)];
    return normalizeMove(s, slot, { act: pick, target: tgt.slot });
  }

  root.ArenaLogic = Object.assign({}, A, { A, rand, hit, newState, normalizeMove, validMove, resolveRound, finishCheck, forfeit, placements, trophyDelta, botMove, alive, enemiesOf });
})(typeof globalThis !== "undefined" ? globalThis : this);
