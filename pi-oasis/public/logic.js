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
  // ---------- Oasis City ----------
  // Build homes, workshops and decorations around the oasis. Homes pay taxes, workshops
  // craft goods, and citizens' orders turn goods into dates and XP. XP raises the city
  // level, which unlocks new buildings. Everything is computed with the server's clock.
  const GOODS = [
    { id: "bread", e: "🥖", value: 30 },
    { id: "tea", e: "🍵", value: 80 },
    { id: "spice", e: "🌶️", value: 160 },
    { id: "carpet", e: "🧶", value: 300 },
    { id: "vase", e: "🏺", value: 650 },
  ];
  // cost[i] = price to build (i = 0) or upgrade to level i + 1
  const BUILDINGS = [
    { id: "house", kind: "home", unlock: 1, cost: [150, 350, 800], pop: [4, 8, 14] },
    { id: "bakery", kind: "work", unlock: 1, cost: [120, 300, 700], good: "bread", craftCost: 10, secs: 120 },
    { id: "teahouse", kind: "work", unlock: 2, cost: [250, 500, 1000], good: "tea", craftCost: 25, secs: 300 },
    { id: "spice", kind: "work", unlock: 3, cost: [500, 900, 1600], good: "spice", craftCost: 50, secs: 600 },
    { id: "weaver", kind: "work", unlock: 4, cost: [900, 1500, 2600], good: "carpet", craftCost: 90, secs: 900 },
    { id: "potter", kind: "work", unlock: 5, cost: [1600, 2600, 4200], good: "vase", craftCost: 160, secs: 1800 },
    { id: "palm", kind: "deco", unlock: 1, cost: [60], happy: [2] },
    { id: "garden", kind: "deco", unlock: 2, cost: [140], happy: [4] },
    { id: "fountain", kind: "deco", unlock: 4, cost: [400], happy: [8] },
  ];
  const CITY = {
    SIZE: 5, TILES: 25, MAX_LEVEL: 10, TAX_PER_POP: 2, TAX_CAP_HOURS: 8,
    ORDER_SLOTS: 4, ORDER_COOLDOWN: 90, ORDER_MULT: 1.4, MAX_QTY: 3,
    CAP_BASE: 20, CAP_PER_LEVEL: 5, SELL_REFUND: 0.5,
    HAPPY_PER_POINT: 0.01, HAPPY_MAX: 0.3, CRAFT_SPEEDUP: 0.2,
    START_HOUSE: 12, START_BAKERY: 13,
  };
  const buildingById = (id) => BUILDINGS.find((x) => x.id === id);
  const goodById = (id) => GOODS.find((x) => x.id === id);
  // Total XP needed to reach level l is 25·l·(l−1): 50, 150, 300, 500, …
  const xpFor = (l) => 25 * l * (l - 1);
  const cityLevel = (xp) => { let l = 1; while (l < CITY.MAX_LEVEL && xp >= xpFor(l + 1)) l++; return l; };
  const goodCap = (level) => CITY.CAP_BASE + CITY.CAP_PER_LEVEL * level;

  function freshCity(now) {
    const tiles = Array(CITY.TILES).fill(null);
    tiles[CITY.START_HOUSE] = { b: "house", lvl: 1 }; // a welcome house and bakery, so a new player can start at once
    tiles[CITY.START_BAKERY] = { b: "bakery", lvl: 1, job: null };
    return { tiles, goods: {}, xp: 0, orders: Array.from({ length: CITY.ORDER_SLOTS }, () => ({ wait: 0 })), nextOrder: 1, taxStore: 0, taxAt: now };
  }
  function cityStats(city) {
    let pop = 0, happy = 0;
    for (const t of city.tiles) {
      if (!t) continue;
      const d = buildingById(t.b);
      if (d.kind === "home") pop += d.pop[t.lvl - 1];
      if (d.kind === "deco") happy += d.happy[t.lvl - 1];
    }
    const bonus = Math.min(CITY.HAPPY_MAX, happy * CITY.HAPPY_PER_POINT);
    return { pop, happy, happyBonus: bonus, taxPerHour: pop * CITY.TAX_PER_POP * (1 + bonus) };
  }
  // Taxes pile up (up to 8 h of the current rate). Settled before anything changes the rate.
  function settleTax(city, now) {
    const st = cityStats(city);
    const hours = Math.max(0, now - city.taxAt) / 3600000;
    city.taxStore = Math.min(st.taxPerHour * CITY.TAX_CAP_HOURS, city.taxStore + st.taxPerHour * hours);
    city.taxAt = now;
  }
  const taxPending = (city, now) => {
    const st = cityStats(city);
    const hours = Math.max(0, now - city.taxAt) / 3600000;
    return Math.min(st.taxPerHour * CITY.TAX_CAP_HOURS, city.taxStore + st.taxPerHour * hours);
  };
  const jobMs = (def, lvl, qty) => Math.round(def.secs * qty * (1 - CITY.CRAFT_SPEEDUP * (lvl - 1))) * 1000;

  function genOrder(city, level, rand) {
    const owned = [...new Set(city.tiles.filter((t) => t && buildingById(t.b).kind === "work").map((t) => buildingById(t.b).good))];
    if (!owned.length) return null;
    const kinds = 1 + Math.floor(rand() * Math.min(3, owned.length));
    const maxQty = Math.min(CITY.MAX_QTY, 1 + Math.ceil(level / 3));
    const pool = owned.slice(), need = {};
    let value = 0, total = 0;
    for (let k = 0; k < kinds; k++) {
      const g = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      const qty = 1 + Math.floor(rand() * maxQty);
      need[g] = qty; value += goodById(g).value * qty; total += qty;
    }
    return { id: city.nextOrder++, need, reward: Math.round(value * CITY.ORDER_MULT), xp: 8 + total * 3 };
  }
  // Fills empty order slots whose waiting time is over. Returns true if anything changed.
  function tickCity(s, now, rand) {
    const city = s.city, level = cityLevel(city.xp);
    let changed = false;
    city.orders.forEach((o, i) => {
      if (o && o.need) return;
      if (o && o.wait > now) return;
      const n = genOrder(city, level, rand || Math.random);
      if (n) { city.orders[i] = n; changed = true; }
    });
    return changed;
  }
  function addXp(city, n) {
    const before = cityLevel(city.xp);
    city.xp += n;
    return cityLevel(city.xp) > before;
  }

  // ---------- Daily missions ----------
  // Three missions per day, picked from a pool by a seed that depends on the day, so the
  // server and the screen always agree. Finishing all three grows a streak with a bonus.
  const MISSION_POOL = [
    { k: "harvest", n: 15, r: 120 },
    { k: "plant", n: 20, r: 100 },
    { k: "deliver", n: 3, r: 220 },
    { k: "craft", n: 4, r: 150 },
    { k: "stake", n: 1, r: 80 },
    { k: "collect", n: 2, r: 90 },
  ];
  const STREAK = { BONUS: 40, MAX: 7 };
  function seeded(seed) { // small deterministic random generator (mulberry32)
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newMissions(prev, now) {
    const day = Math.floor(now / 86400000), r = seeded(day * 2654435761 + 12345);
    const pool = MISSION_POOL.slice(), list = [];
    for (let i = 0; i < 3; i++) {
      const m = pool.splice(Math.floor(r() * pool.length), 1)[0];
      list.push({ k: m.k, n: m.n, r: m.r, p: 0, c: false });
    }
    const streak = prev && prev.done && prev.day === day - 1 ? prev.streak : 0;
    return { day, list, streak, done: false };
  }
  function track(s, k, amount) {
    const m = s.missions.list.find((x) => x.k === k);
    if (m && m.p < m.n) m.p = Math.min(m.n, m.p + amount);
  }

  // Memberships. "partner" is never sold: Jerry Development grants it to its partners.
  // Bonuses give more dates but never count toward the weekly ranking (see earn()).
  const TIERS = [
    { id: "free", slots: 3, boost: 0, camels: 6, daily: 1 },
    { id: "bronze", price: 0.25, slots: 5, boost: 0.1, camels: 8, daily: 2 },
    { id: "silver", price: 0.5, slots: 10, boost: 0.2, camels: 12, daily: 3 },
    { id: "gold", price: 1, slots: 15, boost: 0.35, camels: 20, daily: 5 },
    { id: "partner", slots: 20, boost: 0.5, camels: 30, daily: 10 },
  ];
  const tierIndex = (id) => Math.max(0, TIERS.findIndex((x) => x.id === id));
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
    return { v: 1, dates: C.START_DATES, plots: Array(C.PLOTS).fill(null), stakes: [], week: { id: weekId(now), score: 0 }, lastDaily: -1, rare: 0, animals: [], nextAnimal: 1, city: freshCity(now) };
  }

  function normalize(s, now) {
    if (!s || s.v !== 1) s = fresh(now);
    if (s.week.id !== weekId(now)) s.week = { id: weekId(now), score: 0 };
    if (!Array.isArray(s.animals)) { s.animals = []; s.nextAnimal = 1; }
    if (!s.city) s.city = freshCity(now);
    if (!s.missions || s.missions.day !== Math.floor(now / 86400000)) s.missions = newMissions(s.missions, now);
    return s;
  }

  class GameError extends Error {
    constructor(code, vars) { super(code); this.code = code; this.vars = vars; }
  }
  const fail = (code, vars) => { throw new GameError(code, vars); };
  const int = (x) => (Number.isInteger(x) ? x : NaN);

  // n counts toward the weekly score; bonus (from a membership) only adds dates
  function earn(s, n, bonus) { s.dates += n + (bonus || 0); s.week.score += n; }

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
  const maxAnimals = (tier) => TIERS[tier || 0].camels;

  const seedById = (id) => SEEDS.find((x) => x.id === id);
  const stakeById = (id) => STAKES.find((x) => x.id === id);
  // Daily oasis events: the same for everyone, a new one each day (UTC)
  const EVENTS = [
    { id: "calm", e: "☀️" },
    { id: "rain", e: "🌧️", grow: 0.5 },      // crops planted today grow twice as fast
    { id: "market", e: "🛍️", orders: 1.5 },  // city orders pay +50%
    { id: "festival", e: "🐪", camels: 1.5 }, // camels give +50%
    { id: "harvest", e: "🌴", yield: 1.25 },  // harvests give +25%
  ];
  const eventOf = (t) => {
    const d = dayId(t);
    let x = (d * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13;
    return EVENTS[(x >>> 0) % EVENTS.length];
  };
  const readyAt = (p) => p.plantedAt + seedById(p.seed).time * 1000 * (p.g || 1);

  // Applies one action. Returns { s, msg } where msg = { key, vars } for the UI.
  // ctx: { now, tier (index in TIERS), adVerified, rand }
  function apply(state, a, ctx) {
    const now = ctx.now;
    const rand = ctx.rand || Math.random;
    const tier = ctx.tier || 0, perks = TIERS[tier];
    const s = normalize(JSON.parse(JSON.stringify(state)), now);
    a = a || {};
    tickCity(s, now, rand);
    // Jerry Kombat actions (kombat-logic.js)
    if (typeof a.type === "string" && /^k[A-Z]/.test(a.type) && root.KombatLogic) return root.KombatLogic.applyTo(s, a, { now, rand, boost: perks.boost + (ctx.hold || 0), member: perks.boost > 0, cityLevel, refs: ctx.refs || 0, adVerified: !!ctx.adVerified }, fail);
    switch (a.type) {
      case "plant": {
        const i = int(a.plot), seed = seedById(a.seed);
        if (!(i >= 0 && i < C.PLOTS) || !seed) fail("badAction");
        if (s.plots[i]) fail("badAction");
        if (s.dates < seed.cost) fail("notEnough");
        s.dates -= seed.cost;
        const ev = eventOf(now);
        s.plots[i] = ev.grow ? { seed: seed.id, plantedAt: now, g: ev.grow } : { seed: seed.id, plantedAt: now };
        track(s, "plant", 1);
        return { s, msg: { key: "t.planted", vars: { seed: seed.id } } };
      }
      case "harvest": {
        const i = int(a.plot), p = s.plots[i];
        if (!p) fail("badAction");
        if (readyAt(p) > now) fail("notReady");
        const seed = seedById(p.seed);
        s.plots[i] = null;
        const got = Math.floor(seed.yield * (eventOf(now).yield || 1));
        earn(s, got);
        track(s, "harvest", 1);
        return { s, msg: { key: "t.harvested", vars: { n: got } } };
      }
      case "speedup": {
        const i = int(a.plot), p = s.plots[i];
        if (!p || tier > 0 || !ctx.adVerified) fail("badAction");
        if ((readyAt(p) - now) / 1000 <= C.AD_MIN_LEFT) fail("badAction");
        p.plantedAt = now - seedById(p.seed).time * 1000 * (p.g || 1);
        return { s, msg: { key: "t.adDone" } };
      }
      case "stake": {
        const o = stakeById(a.opt), amt = int(a.amount);
        if (!o || !(amt >= C.MIN_STAKE) || amt > C.MAX_STAKE) fail("minStake", { n: C.MIN_STAKE });
        if (amt > s.dates) fail("notEnough");
        if (s.stakes.length >= perks.slots) fail(tier ? "slotsFull" : "slotsFullFree");
        const base = Math.floor(amt * o.rate);
        const profit = Math.floor(amt * o.rate * (1 + perks.boost));
        s.dates -= amt;
        s.stakes.push({ amt, profit, base, opt: o.id, end: now + o.secs * 1000 });
        track(s, "stake", 1);
        return { s, msg: { key: "t.staked", vars: { a: amt, b: amt + profit } } };
      }
      case "claim": {
        const i = int(a.index), st = s.stakes[i];
        if (!st) fail("badAction");
        if (st.end > now) fail("notReady");
        s.stakes.splice(i, 1);
        s.dates += st.amt; // the locked amount itself doesn't count toward the score
        const base = st.base == null ? st.profit : Math.min(st.base, st.profit);
        earn(s, base, st.profit - base);
        if (st.opt === "w1") {
          if (s.animals.length < maxAnimals(tier) && rand() < A.STAKE_CAMEL_CHANCE) {
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
        const n = C.DAILY * perks.daily;
        earn(s, C.DAILY, n - C.DAILY);
        return { s, msg: { key: "t.daily", vars: { n } } };
      }
      case "buyCamel": {
        if (s.animals.length >= maxAnimals(tier)) fail(tier ? "herdFull" : "herdFullFree");
        if (s.dates < A.BUY_COST) fail("notEnough");
        s.dates -= A.BUY_COST;
        addAnimal(s, 0, now, "market");
        return { s, msg: { key: "t.camelBought" } };
      }
      case "collect": {
        // Only the first camels (the free herd size) count toward the ranking
        let total = 0, scored = 0;
        s.animals.forEach((an, i) => {
          const n = Math.floor(animalReady(an, now) * (eventOf(now).camels || 1));
          if (n > 0) { total += n; if (i < TIERS[0].camels) scored += n; an.lastCollect = now; }
        });
        if (!total) fail("notReady");
        earn(s, scored, total - scored);
        track(s, "collect", 1);
        return { s, msg: { key: "t.collected", vars: { n: total } } };
      }
      case "breed": {
        const pa = s.animals.find((x) => x.id === int(a.a)), pb = s.animals.find((x) => x.id === int(a.b));
        if (!pa || !pb || pa === pb) fail("badAction");
        for (const x of [pa, pb]) if (x.lastBred && now - x.lastBred < A.BREED_COOLDOWN * 1000) fail("camelTired");
        if (s.animals.length >= maxAnimals(tier)) fail(tier ? "herdFull" : "herdFullFree");
        if (s.dates < A.BREED_COST) fail("notEnough");
        s.dates -= A.BREED_COST;
        pa.lastBred = pb.lastBred = now;
        let r = Math.min(pa.rarity, pb.rarity, A.MAX_BRED_RARITY);
        if (r < A.MAX_BRED_RARITY && rand() < A.UPGRADE_CHANCE) r++;
        const baby = addAnimal(s, r, now, "bred");
        return { s, msg: { key: "t.babyCamel", vars: { r: RARITY[baby.rarity].id } } };
      }
      case "mission": {
        const i = int(a.index), m = s.missions.list[i];
        if (!m || m.c) fail("badAction");
        if (m.p < m.n) fail("missionNotDone");
        m.c = true;
        const bonus = Math.floor(m.r * perks.boost);
        earn(s, m.r, bonus);
        if (s.missions.list.every((x) => x.c) && !s.missions.done) {
          s.missions.done = true;
          s.missions.streak++;
          const sb = Math.min(s.missions.streak, STREAK.MAX) * STREAK.BONUS, sbb = Math.floor(sb * perks.boost);
          earn(s, sb, sbb);
          return { s, msg: { key: "t.streakBonus", vars: { n: m.r + bonus + sb + sbb, s: s.missions.streak } } };
        }
        return { s, msg: { key: "t.missionDone", vars: { n: m.r + bonus } } };
      }
      // ---------- Oasis City ----------
      case "cityTick":
        return { s, msg: null };
      case "cityBuild": {
        const city = s.city, i = int(a.tile), def = buildingById(a.b);
        if (!(i >= 0 && i < CITY.TILES) || !def || city.tiles[i]) fail("badAction");
        if (def.unlock > cityLevel(city.xp)) fail("cityLocked", { n: def.unlock });
        if (s.dates < def.cost[0]) fail("notEnough");
        settleTax(city, now);
        s.dates -= def.cost[0];
        city.tiles[i] = def.kind === "work" ? { b: def.id, lvl: 1, job: null } : { b: def.id, lvl: 1 };
        const up = addXp(city, 5);
        return { s, msg: up ? { key: "t.levelUp", vars: { n: cityLevel(city.xp) } } : { key: "t.built", vars: { bld: def.id } } };
      }
      case "cityUpgrade": {
        const city = s.city, i = int(a.tile), t = city.tiles[i];
        if (!t) fail("badAction");
        const def = buildingById(t.b);
        if (t.lvl >= def.cost.length) fail("cityMax");
        if (def.unlock > cityLevel(city.xp)) fail("cityLocked", { n: def.unlock });
        const price = def.cost[t.lvl];
        if (s.dates < price) fail("notEnough");
        settleTax(city, now);
        s.dates -= price;
        t.lvl++;
        const up = addXp(city, 8);
        return { s, msg: up ? { key: "t.levelUp", vars: { n: cityLevel(city.xp) } } : { key: "t.upgraded", vars: { bld: def.id, n: t.lvl } } };
      }
      case "cityDemolish": {
        const city = s.city, i = int(a.tile), t = city.tiles[i];
        if (!t) fail("badAction");
        if (t.job) fail("cityBusy");
        const def = buildingById(t.b);
        const spent = def.cost.slice(0, t.lvl).reduce((x, y) => x + y, 0);
        settleTax(city, now);
        city.tiles[i] = null;
        const refund = Math.floor(spent * CITY.SELL_REFUND);
        s.dates += refund; // a refund of what you already paid: not an earning, so no score
        return { s, msg: { key: "t.demolished", vars: { n: refund } } };
      }
      case "cityCraft": {
        const city = s.city, i = int(a.tile), t = city.tiles[i];
        if (!t) fail("badAction");
        const def = buildingById(t.b);
        if (def.kind !== "work") fail("badAction");
        if (t.job) fail("cityBusy");
        const qty = a.qty === undefined ? 1 : int(a.qty);
        if (!(qty >= 1 && qty <= CITY.MAX_QTY)) fail("badAction");
        const cap = goodCap(cityLevel(city.xp));
        if ((city.goods[def.good] || 0) + qty > cap) fail("warehouseFull", { n: cap });
        const price = def.craftCost * qty;
        if (s.dates < price) fail("notEnough");
        s.dates -= price;
        t.job = { g: def.good, qty, end: now + jobMs(def, t.lvl, qty) };
        track(s, "craft", qty);
        return { s, msg: { key: "t.crafting", vars: { good: def.good, n: qty } } };
      }
      case "cityCollect":
      case "cityCollectAll": {
        const city = s.city;
        const idx = a.type === "cityCollect" ? [int(a.tile)] : city.tiles.map((_, k) => k);
        let got = 0, xp = 0;
        for (const i of idx) {
          const t = city.tiles[i];
          if (!t || !t.job || t.job.end > now) continue;
          city.goods[t.job.g] = (city.goods[t.job.g] || 0) + t.job.qty;
          got += t.job.qty; xp += 2 * t.job.qty;
          t.job = null;
        }
        if (!got) fail("notReady");
        const up = addXp(city, xp);
        return { s, msg: up ? { key: "t.levelUp", vars: { n: cityLevel(city.xp) } } : { key: "t.goodsCollected", vars: { n: got } } };
      }
      case "cityTax": {
        const city = s.city;
        settleTax(city, now);
        const base = Math.floor(city.taxStore);
        if (base < 1) fail("notReady");
        city.taxStore -= base;
        const bonus = Math.floor(base * perks.boost);
        earn(s, base, bonus);
        return { s, msg: { key: "t.taxCollected", vars: { n: base + bonus } } };
      }
      case "cityDeliver": {
        const city = s.city, i = int(a.slot), o = city.orders[i];
        if (!o || !o.need) fail("badAction");
        for (const g in o.need) if ((city.goods[g] || 0) < o.need[g]) fail("cityMissing");
        for (const g in o.need) city.goods[g] -= o.need[g];
        const reward = Math.floor(o.reward * (eventOf(now).orders || 1));
        const bonus = Math.floor(reward * perks.boost);
        earn(s, reward, bonus);
        city.orders[i] = { wait: now + CITY.ORDER_COOLDOWN * 1000 };
        track(s, "deliver", 1);
        const up = addXp(city, o.xp);
        return { s, msg: up ? { key: "t.levelUp", vars: { n: cityLevel(city.xp) } } : { key: "t.orderDone", vars: { n: reward + bonus } } };
      }
      default:
        fail("badAction");
    }
  }

  // Date shop: 5000 dates per 1 Pi (prices owned by the server)
  const PACKS = [
    { id: "d1k", price: 0.2, dates: 1000 },
    { id: "d5k", price: 1, dates: 5000 },
    { id: "d10k", price: 2, dates: 10000 },
    { id: "d25k", price: 5, dates: 25000 },
  ];
  // Level-up packs: dates + Kombat coins (+ wheel spins, JRY, a legendary camel for the biggest).
  // Bought points never count toward the weekly rankings.
  const LEVEL_PACKS = [
    { id: "l01", e: "🌱", price: 0.1, dates: 1000, coins: 20000 },
    { id: "l05", e: "🧭", price: 0.5, dates: 5000, coins: 100000, spins: 1 },
    { id: "l1", e: "🥉", price: 1, dates: 10000, coins: 200000, spins: 3 },
    { id: "l5", e: "🥈", price: 5, dates: 60000, coins: 1200000, spins: 10 },
    { id: "l20", e: "🥇", price: 20, dates: 250000, coins: 5000000, jry: 1000, spins: 25 },
    { id: "l100", e: "👑", price: 100, dates: 1400000, coins: 30000000, jry: 6000, spins: 100, camel: 3 },
  ];
  // Royal cards: 4 tiers × 500 numbered copies, bought with Pi. Every copy is unique (its number
  // and its signature perk), and the buyer sees exactly which copy and perks they get before paying:
  // nothing is left to chance. Perks: Kombat profit, Derby races, a daily gift. Holders compete
  // in the Grand Royal Final (skill, not luck): it opens once all 2,000 copies are sold and lasts
  // FINAL_DAYS; the 10 holders who earn the most Kombat coins in it share the prizes (1 billion for #1).
  const ROYAL = {
    MAX: 500,
    TIERS: [
      { id: "r10", e: "🥉", price: 10, boost: 0.05, races: 1, gift: { dates: 300, coins: 20000, jry: 2 }, color: "#c98a4b" },
      { id: "r25", e: "🥈", price: 25, boost: 0.1, races: 2, gift: { dates: 800, coins: 60000, jry: 5 }, color: "#9aa7b8" },
      { id: "r50", e: "🥇", price: 50, boost: 0.18, races: 3, gift: { dates: 1800, coins: 150000, jry: 12 }, color: "#e2a918" },
      { id: "r100", e: "💎", price: 100, boost: 0.3, races: 5, gift: { dates: 4000, coins: 400000, jry: 30 }, color: "#7c5cff" },
    ],
    // One signature perk per copy, all of similar value
    SIGS: [
      { id: "moon", e: "🌙", spins: 1 },          // +1 wheel spin with the daily gift
      { id: "sun", e: "☀️", dates: 0.5 },         // +50% dates in the daily gift
      { id: "wind", e: "🌪️", races: 1 },          // +1 Derby race a day
      { id: "caravan", e: "🐪", boost: 0.03 },    // +3% Kombat profit
      { id: "spring", e: "💧", feed: 1 },         // +1 golden feed with the daily gift
      { id: "flame", e: "🔥", coins: 0.5 },       // +50% coins in the daily gift
      { id: "gem", e: "💠", jry: 1 },             // +100% JRY in the daily gift
    ],
    BOOST_MAX: 0.6,
    PRIZES: [1e9, 3e8, 1e8, 2e7, 2e7, 2e7, 2e7, 2e7, 2e7, 2e7], // Grand Royal Final, Kombat coins
    FINAL_DAYS: 30,
  };
  ROYAL.tierById = (id) => ROYAL.TIERS.find((x) => x.id === id) || null;
  // The signature of copy #ed of a tier: fixed for ever, the same on every phone
  ROYAL.sigOf = (tid, ed) => { let h = 2166136261; for (const c of tid + ":" + ed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return ROYAL.SIGS[h % ROYAL.SIGS.length]; };
  // Month id (UTC): 202611 for November 2026
  ROYAL.monthId = (t) => { const d = new Date(t); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
  ROYAL.monthStart = (m) => Date.UTC(Math.floor(m / 100), (m % 100) - 1, 1);
  ROYAL.prevMonth = (m) => (m % 100 === 1 ? (Math.floor(m / 100) - 1) * 100 + 12 : m - 1);
  // Daily gift of one card (with its signature)
  ROYAL.giftOf = (tid, ed) => {
    const t = ROYAL.tierById(tid), s = ROYAL.sigOf(tid, ed), g = t.gift;
    return { dates: Math.round(g.dates * (1 + (s.dates || 0))), coins: Math.round(g.coins * (1 + (s.coins || 0))), jry: Math.round(g.jry * (1 + (s.jry || 0))), spins: s.spins || 0, feed: s.feed || 0 };
  };
  // Founding supporters: support the development of the games. A thank-you, not an investment:
  // no return and no profit, only in-game rewards and a lasting badge on the honor wall.
  const SUPPORTER = [
    { id: "s10", lvl: 1, e: "💚", price: 10, jry: 2000, camel: 1 },
    { id: "s50", lvl: 2, e: "💙", price: 50, jry: 12000, camel: 2 },
    { id: "s200", lvl: 3, e: "💎", price: 200, jry: 60000, camel: 3 },
  ];
  // Points market: players sell dates / Kombat coins to each other for Pi at their own price.
  // The buyer's Pi goes to the app wallet; the seller's share shows in their sales balance and
  // can be withdrawn from MIN_WITHDRAW Pi. TAX is kept by the app on every sale.
  const MARKET = { TAX: 0.25, MIN_WITHDRAW: 5, MIN_PI: 0.1, MAX_PI: 1000, MIN: { dates: 1000, coins: 20000 }, MAX_OPEN: 5, HOLD_MS: 10 * 60000 };
  // Lucky wheel: one free spin a day; SPINS more for PRICE Pi. Prizes are in-game only (never Pi).
  // t: dates | coins | jry | respin | energy | camel ; w: chance in %
  const WHEEL = { PRICE: 0.5, SPINS: 10, PRIZES: [
    { t: "dates", n: 100, w: 18 }, { t: "coins", n: 40000, w: 6 }, { t: "jry", n: 10, w: 8 }, { t: "dates", n: 300, w: 12 },
    { t: "coins", n: 3000, w: 18 }, { t: "camel", n: 1, w: 1 }, { t: "respin", n: 1, w: 10 }, { t: "dates", n: 1000, w: 7 },
    { t: "coins", n: 10000, w: 12 }, { t: "jry", n: 50, w: 2.5 }, { t: "energy", n: 1, w: 5 }, { t: "coins", n: 250000, w: 0.5 },
  ] };
  // Earn page: watch rewarded Pi ads for points (which can be sold on the points market).
  // DATES[i] = reward of the (i+1)th ad of the day; BONUS at the 5th and 10th ad; GAP between ads.
  // LEVELS: viewer level by lifetime ads watched (x = extra dates per ad). STREAK: days in a row
  // with STREAK_ADS ads; the streak bonus is STREAK_DATES × days (up to STREAK_MAX days).
  // AFTER: reward of every ad after the first 10 of the day (no daily limit)
  const EARN = { GAP: 45000, AFTER: 50, DATES: [50, 60, 70, 80, 100, 100, 120, 120, 150, 200], BONUS: { 5: { spins: 1 }, 10: { coins: 20000, jry: 5 } },
    LEVELS: [{ id: "bronze", n: 0, x: 0 }, { id: "silver", n: 25, x: 0.1 }, { id: "gold", n: 100, x: 0.2 }, { id: "diamond", n: 300, x: 0.35 }, { id: "legend", n: 1000, x: 0.5 }],
    STREAK_ADS: 5, STREAK_DATES: 100, STREAK_MAX: 7 };
  const earnLevel = (ads) => { let i = 0; EARN.LEVELS.forEach((l, j) => { if (ads >= l.n) i = j; }); return i; };
  // Jerry Arcade: free skill games. Dates for each game, PLAYS rewarded games per game a day.
  const ARCADE = { PLAYS: 5,
    memory: { pairs: 8, minMs: 8000, reward: (moves) => Math.max(40, 200 - Math.max(0, moves - 8) * 10) },
    catcher: { ms: 30000, maxScore: 150, reward: (score) => Math.min(300, Math.max(0, score) * 3) } };
  // Business showcase: Pi businesses pay Pi to be shown (reviewed by the owner first).
  const SPONSOR = { PLANS: [{ id: "d1", days: 1, price: 1 }, { id: "d7", days: 7, price: 5 }, { id: "d30", days: 30, price: 15 }],
    CATS: ["shop", "food", "services", "apps", "education", "travel", "other"], NAME: 40, DESC: 160 };
  // Games still in the works: each one opens when the game reaches this many players
  // Weekly ranking: 100 winners. share = part of the Pi prize pool (adds up to 100%), dates = in-game prize.
  const WEEK100 = {
    N: 100,
    BANDS: [{ from: 1, to: 1, share: 0.2, dates: 50000, jry: 500 }, { from: 2, to: 2, share: 0.12, dates: 30000, jry: 300 }, { from: 3, to: 3, share: 0.08, dates: 20000, jry: 200 },
      { from: 4, to: 10, share: 0.03, dates: 10000, jry: 100 }, { from: 11, to: 30, share: 0.01, dates: 5000, jry: 50 }, { from: 31, to: 100, share: 0.19 / 70, dates: 2000, jry: 20 }],
    band: (p) => WEEK100.BANDS.find((b) => p >= b.from && p <= b.to) || null,
    share: (p) => (WEEK100.band(p) || { share: 0 }).share,
    dates: (p) => (WEEK100.band(p) || { dates: 0 }).dates,
    jry: (p) => (WEEK100.band(p) || { jry: 0 }).jry,
  };
  const FUTURE = [{ id: "falcon", e: "🦅", players: 1000 }, { id: "quiz", e: "🧠", players: 2500 }, { id: "chess", e: "♟️", players: 5000 },
    { id: "kart", e: "🏎️", players: 10000 }, { id: "hunt", e: "🗺️", players: 25000 }, { id: "world", e: "🌍", players: 100000 }];
  const api = { ROYAL, SUPPORTER, LEVEL_PACKS, WEEK100, FUTURE, ARCADE, SPONSOR, EARN, earnLevel, MARKET, WHEEL, EVENTS, eventOf, PACKS, MISSION_POOL, STREAK, GOODS, BUILDINGS, CITY, buildingById, goodById, cityLevel, xpFor, goodCap, cityStats, taxPending, jobMs, tickCity, SEEDS, STAKES, C, A, TIERS, tierIndex, RARITY, addAnimal, animalReady, maxAnimals, weekId, dayId, fresh, normalize, apply, readyAt, seedById, stakeById, GameError };
  root.OasisLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
