// Jerry Castle: a tower-defense game. Soldiers walk along a winding road toward the castle; the player builds
// towers on the free cells. Shared by the phone (which plays and draws it) and the server (which replays the
// player's action log to decide the real result and the rewards). Integer maths only, fixed 100 ms steps,
// no randomness: the same actions always give the same game.
(function (root) {
  const W = 9, H = 13, TICK_MS = 100, WAVES = 20, CASTLE_HP = 20, START_GOLD = 120, MAX_TOWERS = 24, MAX_TICKS = 24000, SELL = 0.7;
  // Roads are given by their corners; every step is one cell. The last cell is the castle.
  const ROADS = [
    { id: "oasis", pts: [[0, 0], [8, 0], [8, 3], [1, 3], [1, 6], [8, 6], [8, 9], [1, 9], [1, 12], [4, 12]] },
    { id: "canyon", pts: [[8, 0], [8, 2], [0, 2], [0, 4], [6, 4], [6, 6], [2, 6], [2, 8], [8, 8], [8, 10], [4, 10], [4, 12]] },
    { id: "gate", pts: [[4, 0], [4, 2], [1, 2], [1, 5], [7, 5], [7, 8], [2, 8], [2, 11], [4, 11], [4, 12]] },
  ];
  function expand(pts) {
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length; i++) {
      let [x, y] = out[out.length - 1];
      const [tx, ty] = pts[i];
      while (x !== tx || y !== ty) { x += Math.sign(tx - x); y += Math.sign(ty - y); out.push([x, y]); }
    }
    return out;
  }
  const DIFF = [100, 140, 170]; // enemy strength in percent, per map
  const MAPS = ROADS.map((r, i) => { const path = expand(r.pts); return { id: r.id, diff: DIFF[i] || 100, path, key: new Set(path.map((p) => p[0] + "," + p[1])) }; });

  // speed in 1/100 cell per step; leak = castle damage; gold = reward for a kill
  const ENEMY = {
    soldier: { hp: 40, spd: 10, leak: 1, gold: 6 },
    runner: { hp: 24, spd: 18, leak: 1, gold: 4 },
    shield: { hp: 110, spd: 6, leak: 2, gold: 12 },
    rider: { hp: 60, spd: 14, leak: 2, gold: 9 },
    boss: { hp: 900, spd: 5, leak: 6, gold: 60 },
  };
  // damage / range (in 1/100 cell) / reload (steps) per level; mortar splashes; frost slows
  const TOWER = {
    cannon: { cost: 50, up: [60, 90], dmg: [14, 24, 40], range: [220, 240, 260], reload: [8, 8, 7] },
    archer: { cost: 40, up: [50, 80], dmg: [5, 9, 15], range: [300, 320, 340], reload: [3, 3, 2] },
    mortar: { cost: 90, up: [100, 140], dmg: [34, 56, 90], range: [350, 370, 390], reload: [18, 17, 16], splash: [110, 130, 150] },
    frost: { cost: 60, up: [70, 100], dmg: [2, 3, 5], range: [230, 250, 270], reload: [6, 6, 5], slow: [40, 50, 60], slowTicks: 15 },
  };
  const KINDS = Object.keys(TOWER);

  // The enemies of wave n (1..WAVES): [type, count] in the order they appear, one every 6 steps
  function waveOf(n) {
    const w = [["soldier", 4 + n]];
    if (n >= 3) w.push(["runner", Math.floor(n / 2) + 1]);
    if (n >= 5) w.push(["shield", Math.floor((n - 3) / 2)]);
    if (n >= 7) w.push(["rider", Math.floor((n - 5) / 2)]);
    if (n % 10 === 0) w.push(["boss", n / 10]);
    return w;
  }
  const hpScale = (n) => 100 + 22 * (n - 1) + 3 * (n - 1) * (n - 1); // percent
  const waveBonus = (n) => 30 + 5 * n;

  function newGame(map) {
    if (!MAPS[map]) throw new Error("bad map");
    return { map, tick: 0, wave: 0, queue: [], enemies: [], towers: [], gold: START_GOLD, hp: CASTLE_HP, over: false, won: false, nextId: 1, kills: 0, cleared: true };
  }
  const invested = (t) => TOWER[t.kind].cost + TOWER[t.kind].up.slice(0, t.lvl - 1).reduce((a, b) => a + b, 0);

  // ---- player actions: return null when allowed, or a reason ----
  function act(s, a) {
    if (s.over) return "over";
    const M = MAPS[s.map];
    if (a.a === "place") {
      const x = a.x | 0, y = a.y | 0;
      if (!(x >= 0 && x < W && y >= 0 && y < H) || M.key.has(x + "," + y)) return "cell";
      if (!TOWER[a.k]) return "kind";
      if (s.towers.length >= MAX_TOWERS || s.towers.some((t) => t.x === x && t.y === y)) return "cell";
      if (s.gold < TOWER[a.k].cost) return "gold";
      s.gold -= TOWER[a.k].cost; s.towers.push({ x, y, kind: a.k, lvl: 1, cd: 0 });
      return null;
    }
    if (a.a === "wave") {
      if (s.wave >= WAVES || s.queue.length) return "wave";
      s.wave++;
      let delay = 0;
      for (const [type, n] of waveOf(s.wave)) for (let i = 0; i < n; i++) { s.queue.push({ type, at: s.tick + delay }); delay += 6; }
      s.cleared = false;
      return null;
    }
    const t = s.towers.find((q) => q.x === (a.x | 0) && q.y === (a.y | 0));
    if (!t) return "cell";
    if (a.a === "up") {
      if (t.lvl >= 3) return "max";
      const c = TOWER[t.kind].up[t.lvl - 1];
      if (s.gold < c) return "gold";
      s.gold -= c; t.lvl++;
      return null;
    }
    if (a.a === "sell") { s.gold += Math.floor(invested(t) * SELL); s.towers.splice(s.towers.indexOf(t), 1); return null; }
    return "action";
  }

  // ---- one step of 100 ms ----
  function step(s) {
    if (s.over) return s;
    const M = MAPS[s.map], last = (M.path.length - 1) * 100;
    s.tick++;
    // spawn
    while (s.queue.length && s.queue[0].at <= s.tick) {
      const q = s.queue.shift(), E = ENEMY[q.type];
      const hp = Math.floor((E.hp * hpScale(s.wave) * M.diff) / 10000);
      s.enemies.push({ id: s.nextId++, type: q.type, hp, max: hp, pos: 0, slow: 0, slowUntil: 0 });
    }
    // move, castle hits
    for (const e of s.enemies) {
      const sp = ENEMY[e.type].spd * (e.slowUntil > s.tick ? 100 - e.slow : 100);
      e.pos += Math.floor(sp / 100) + ((s.tick * sp) % 100 < sp % 100 ? 1 : 0);
      if (e.pos >= last) { s.hp -= ENEMY[e.type].leak; e.hp = 0; e.leaked = true; }
    }
    s.enemies = s.enemies.filter((e) => !e.leaked);
    if (s.hp <= 0) { s.hp = 0; s.over = true; s.won = false; return s; }
    // towers shoot the enemy that is furthest along the road
    const cell = (e) => { const i = Math.min(M.path.length - 1, Math.floor(e.pos / 100)), p = M.path[i], n = M.path[Math.min(M.path.length - 1, i + 1)], f = e.pos % 100; return [p[0] * 100 + 50 + Math.floor(((n[0] - p[0]) * f)), p[1] * 100 + 50 + Math.floor(((n[1] - p[1]) * f))]; };
    if (s.enemies.length && s.towers.length) {
      const pts = s.enemies.map(cell);
      for (const t of s.towers) {
        if (t.cd > 0) { t.cd--; continue; }
        const T = TOWER[t.kind], r = T.range[t.lvl - 1], tx = t.x * 100 + 50, ty = t.y * 100 + 50;
        let best = -1;
        for (let i = 0; i < s.enemies.length; i++) {
          const e = s.enemies[i];
          if (e.hp <= 0) continue;
          const dx = pts[i][0] - tx, dy = pts[i][1] - ty;
          if (dx * dx + dy * dy <= r * r && (best < 0 || e.pos > s.enemies[best].pos)) best = i;
        }
        if (best < 0) continue;
        t.cd = T.reload[t.lvl - 1] - 1;
        t.shot = s.tick; t.aim = [pts[best][0], pts[best][1]];
        const d = T.dmg[t.lvl - 1];
        if (T.splash) {
          const sr = T.splash[t.lvl - 1], cx = pts[best][0], cy = pts[best][1];
          s.enemies.forEach((e, i) => { const dx = pts[i][0] - cx, dy = pts[i][1] - cy; if (e.hp > 0 && dx * dx + dy * dy <= sr * sr) e.hp -= d; });
        } else {
          s.enemies[best].hp -= d;
          if (T.slow) { const e = s.enemies[best]; e.slow = Math.max(e.slow, T.slow[t.lvl - 1]); e.slowUntil = s.tick + T.slowTicks; }
        }
      }
      for (const e of s.enemies) if (e.hp <= 0) { s.gold += ENEMY[e.type].gold; s.kills++; }
      s.enemies = s.enemies.filter((e) => e.hp > 0);
    }
    // wave finished
    if (!s.cleared && !s.queue.length && !s.enemies.length) {
      s.cleared = true; s.gold += waveBonus(s.wave);
      if (s.wave >= WAVES) { s.over = true; s.won = true; }
    }
    return s;
  }
  const stars = (s) => (!s.won ? 0 : s.hp >= 18 ? 3 : s.hp >= 10 ? 2 : 1);

  // Replays an action log [[tick, action], ...] (ticks never go backwards). Returns the final game or { error }.
  function simulate(map, log) {
    const s = newGame(map);
    let i = 0;
    log = Array.isArray(log) ? log : [];
    if (log.length > 600) return { error: "log" };
    let prev = 0;
    for (const e of log) { if (!Array.isArray(e) || !(e[0] >= prev) || e[0] > MAX_TICKS || typeof e[1] !== "object") return { error: "log" }; prev = e[0]; }
    while (!s.over && s.tick < MAX_TICKS) {
      while (i < log.length && log[i][0] <= s.tick) { const bad = act(s, log[i][1] || {}); if (bad) return { error: bad, at: i }; i++; }
      if (i >= log.length && !s.queue.length && !s.enemies.length) break; // nothing left to happen
      step(s);
    }
    return s;
  }
  root.CastleLogic = { W, H, TICK_MS, WAVES, CASTLE_HP, START_GOLD, MAX_TOWERS, SELL, MAPS, ENEMY, TOWER, KINDS, waveOf, hpScale, waveBonus, newGame, act, step, stars, simulate, invested };
})(typeof globalThis !== "undefined" ? globalThis : this);
