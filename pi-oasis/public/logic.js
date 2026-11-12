// Pi Oasis – game rules, shared by the browser (guest/demo mode) and the server.
// The server is the source of truth for signed-in players: it runs every action
// with its own clock, so players cannot cheat by editing the app.
(function (root) {
  const SEEDS = [
    { id: "wheat", e: "🌾", cost: 5, time: 30, yield: 12 },
    { id: "mint", e: "🌿", cost: 15, time: 120, yield: 40 },
    { id: "melon", e: "🍉", cost: 40, time: 600, yield: 120 },
    { id: "palm", e: "🌴", cost: 100, time: 3600, yield: 350 },
  ];
  const STAKES = [
    { id: "h1", secs: 3600, rate: 0.05 },
    { id: "d1", secs: 86400, rate: 0.3 },
    { id: "w1", secs: 604800, rate: 1.5, bonus: true },
  ];
  // Camels: each one produces dates every hour (collect them in the Animals tab).
  // Rarity 0..3. Legendary camels only come from weekly prizes.
  const RARITY = [
    { id: "common", rate: 10 },
    { id: "rare", rate: 20 },
    { id: "epic", rate: 40 },
    { id: "legendary", rate: 80 },
  ];
  const A = {
    BUY_COST: 300, BREED_COST: 200, BREED_COOLDOWN: 86400, // 24 h
    MAX_FREE: 6, MAX_VIP: 12, STORE_HOURS: 8, // production waits up to 8 h
    UPGRADE_CHANCE: 0.12, MAX_BRED_RARITY: 2, // breeding can reach epic, never legendary
    STAKE_CAMEL_CHANCE: 0.3, // 7-day stake: chance of a rare camel
  };
  const C = {
    PLOTS: 9, FREE_SLOTS: 3, VIP_SLOTS: 10, VIP_BOOST: 0.2, MIN_STAKE: 10,
    MAX_STAKE: 1e9, DAILY: 25, START_DATES: 50, AD_MIN_LEFT: 20,
  };

  // Weeks start Monday 00:00 UTC
  function weekId(t) {
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  }
  const dayId = (t) => Math.floor(t / 86400000);

  function fresh(now) {
    return { v: 1, dates: C.START_DATES, plots: Array(C.PLOTS).fill(null), stakes: [], week: { id: weekId(now), score: 0 }, lastDaily: -1, rare: 0, animals: [], nextAnimal: 1 };
  }

  function normalize(s, now) {
    if (!s || s.v !== 1) s = fresh(now);
    if (s.week.id !== weekId(now)) s.week = { id: weekId(now), score: 0 };
    if (!Array.isArray(s.animals)) { s.animals = []; s.nextAnimal = 1; }
    return s;
  }

  class GameError extends Error {
    constructor(code, vars) { super(code); this.code = code; this.vars = vars; }
  }
  const fail = (code, vars) => { throw new GameError(code, vars); };
  const int = (x) => (Number.isInteger(x) ? x : NaN);

  function earn(s, n) { s.dates += n; s.week.score += n; }

  function addAnimal(s, rarity, now, from) {
    const a = { id: s.nextAnimal++, rarity, born: now, lastCollect: now, lastBred: 0, from: from || "market" };
    s.animals.push(a);
    return a;
  }
  // Dates waiting to be collected from one camel
  function animalReady(a, now) {
    const hours = Math.min(now - a.lastCollect, A.STORE_HOURS * 3600000) / 3600000;
    return Math.floor(RARITY[a.rarity].rate * hours);
  }
  const maxAnimals = (vip) => (vip ? A.MAX_VIP : A.MAX_FREE);

  const seedById = (id) => SEEDS.find((x) => x.id === id);
  const stakeById = (id) => STAKES.find((x) => x.id === id);
  const readyAt = (p) => p.plantedAt + seedById(p.seed).time * 1000;

  // Applies one action. Returns { s, msg } where msg = { key, vars } for the UI.
  // ctx: { now, vip, adVerified, rand }
  function apply(state, a, ctx) {
    const now = ctx.now;
    const rand = ctx.rand || Math.random;
    const s = normalize(JSON.parse(JSON.stringify(state)), now);
    a = a || {};
    switch (a.type) {
      case "plant": {
        const i = int(a.plot), seed = seedById(a.seed);
        if (!(i >= 0 && i < C.PLOTS) || !seed) fail("badAction");
        if (s.plots[i]) fail("badAction");
        if (s.dates < seed.cost) fail("notEnough");
        s.dates -= seed.cost;
        s.plots[i] = { seed: seed.id, plantedAt: now };
        return { s, msg: { key: "t.planted", vars: { seed: seed.id } } };
      }
      case "harvest": {
        const i = int(a.plot), p = s.plots[i];
        if (!p) fail("badAction");
        if (readyAt(p) > now) fail("notReady");
        const seed = seedById(p.seed);
        s.plots[i] = null;
        earn(s, seed.yield);
        return { s, msg: { key: "t.harvested", vars: { n: seed.yield } } };
      }
      case "speedup": {
        const i = int(a.plot), p = s.plots[i];
        if (!p || ctx.vip || !ctx.adVerified) fail("badAction");
        if ((readyAt(p) - now) / 1000 <= C.AD_MIN_LEFT) fail("badAction");
        p.plantedAt = now - seedById(p.seed).time * 1000;
        return { s, msg: { key: "t.adDone" } };
      }
      case "stake": {
        const o = stakeById(a.opt), amt = int(a.amount);
        if (!o || !(amt >= C.MIN_STAKE) || amt > C.MAX_STAKE) fail("minStake", { n: C.MIN_STAKE });
        if (amt > s.dates) fail("notEnough");
        if (s.stakes.length >= (ctx.vip ? C.VIP_SLOTS : C.FREE_SLOTS)) fail(ctx.vip ? "slotsFull" : "slotsFullFree");
        const profit = Math.floor(amt * o.rate * (ctx.vip ? 1 + C.VIP_BOOST : 1));
        s.dates -= amt;
        s.stakes.push({ amt, profit, opt: o.id, end: now + o.secs * 1000 });
        return { s, msg: { key: "t.staked", vars: { a: amt, b: amt + profit } } };
      }
      case "claim": {
        const i = int(a.index), st = s.stakes[i];
        if (!st) fail("badAction");
        if (st.end > now) fail("notReady");
        s.stakes.splice(i, 1);
        s.dates += st.amt; // the locked amount itself doesn't count toward the score
        earn(s, st.profit);
        if (st.opt === "w1") {
          if (s.animals.length < maxAnimals(ctx.vip) && rand() < A.STAKE_CAMEL_CHANCE) {
            addAnimal(s, 1, now, "stake");
            return { s, msg: { key: "t.returnedCamel", vars: { n: st.amt + st.profit } } };
          }
          s.rare++;
        }
        return { s, msg: { key: "t.returned", vars: { n: st.amt + st.profit } } };
      }
      case "daily": {
        if (s.lastDaily === dayId(now)) fail("dailyDone");
        s.lastDaily = dayId(now);
        const n = ctx.vip ? C.DAILY * 2 : C.DAILY;
        earn(s, n);
        return { s, msg: { key: "t.daily", vars: { n } } };
      }
      case "buyCamel": {
        if (s.animals.length >= maxAnimals(ctx.vip)) fail(ctx.vip ? "herdFull" : "herdFullFree");
        if (s.dates < A.BUY_COST) fail("notEnough");
        s.dates -= A.BUY_COST;
        addAnimal(s, 0, now, "market");
        return { s, msg: { key: "t.camelBought" } };
      }
      case "collect": {
        let total = 0;
        for (const an of s.animals) {
          const n = animalReady(an, now);
          if (n > 0) { total += n; an.lastCollect = now; }
        }
        if (!total) fail("notReady");
        earn(s, total);
        return { s, msg: { key: "t.collected", vars: { n: total } } };
      }
      case "breed": {
        const pa = s.animals.find((x) => x.id === int(a.a)), pb = s.animals.find((x) => x.id === int(a.b));
        if (!pa || !pb || pa === pb) fail("badAction");
        for (const x of [pa, pb]) if (x.lastBred && now - x.lastBred < A.BREED_COOLDOWN * 1000) fail("camelTired");
        if (s.animals.length >= maxAnimals(ctx.vip)) fail(ctx.vip ? "herdFull" : "herdFullFree");
        if (s.dates < A.BREED_COST) fail("notEnough");
        s.dates -= A.BREED_COST;
        pa.lastBred = pb.lastBred = now;
        let r = Math.min(pa.rarity, pb.rarity, A.MAX_BRED_RARITY);
        if (r < A.MAX_BRED_RARITY && rand() < A.UPGRADE_CHANCE) r++;
        const baby = addAnimal(s, r, now, "bred");
        return { s, msg: { key: "t.babyCamel", vars: { r: RARITY[baby.rarity].id } } };
      }
      default:
        fail("badAction");
    }
  }

  const api = { SEEDS, STAKES, C, A, RARITY, addAnimal, animalReady, maxAnimals, weekId, dayId, fresh, normalize, apply, readyAt, seedById, stakeById, GameError };
  root.OasisLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
