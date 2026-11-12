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
  const readyAt = (p) => p.plantedAt + seedById(p.seed).time * 1000;

  // Applies one action. Returns { s, msg } where msg = { key, vars } for the UI.
  // ctx: { now, tier (index in TIERS), adVerified, rand }
  function apply(state, a, ctx) {
    const now = ctx.now;
    const rand = ctx.rand || Math.random;
    const tier = ctx.tier || 0, perks = TIERS[tier];
    const s = normalize(JSON.parse(JSON.stringify(state)), now);
    a = a || {};
    tickCity(s, now, rand);
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
        if (!p || tier > 0 || !ctx.adVerified) fail("badAction");
        if ((readyAt(p) - now) / 1000 <= C.AD_MIN_LEFT) fail("badAction");
        p.plantedAt = now - seedById(p.seed).time * 1000;
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
          const n = animalReady(an, now);
          if (n > 0) { total += n; if (i < TIERS[0].camels) scored += n; an.lastCollect = now; }
        });
        if (!total) fail("notReady");
        earn(s, scored, total - scored);
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
        const bonus = Math.floor(o.reward * perks.boost);
        earn(s, o.reward, bonus);
        city.orders[i] = { wait: now + CITY.ORDER_COOLDOWN * 1000 };
        const up = addXp(city, o.xp);
        return { s, msg: up ? { key: "t.levelUp", vars: { n: cityLevel(city.xp) } } : { key: "t.orderDone", vars: { n: o.reward + bonus } } };
      }
      default:
        fail("badAction");
    }
  }

  const api = { GOODS, BUILDINGS, CITY, buildingById, goodById, cityLevel, xpFor, goodCap, cityStats, taxPending, jobMs, tickCity, SEEDS, STAKES, C, A, TIERS, tierIndex, RARITY, addAnimal, animalReady, maxAnimals, weekId, dayId, fresh, normalize, apply, readyAt, seedById, stakeById, GameError };
  root.OasisLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
