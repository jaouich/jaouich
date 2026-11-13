// Jerry Kombat – tap-to-earn rules, shared by the browser (guest mode) and the server.
// Kombat coins are game points only (not Pi, not a token). The server checks every
// action with its own clock: tap speed, energy and passive income can't be faked.
(function (root) {
  const K = {
    E_BASE: 1000,       // energy limit at level 0
    E_STEP: 500,        // + per energy-limit level
    REGEN: 3,           // energy per second
    MAX_TPS: 20,        // fastest believable tapping
    BURST: 40,          // taps allowed on top of MAX_TPS (network delay)
    MAX_BATCH: 600,     // taps per request
    OFFLINE_H: 3,       // passive income stored while away, in hours
    REFILLS: 6,         // free full-energy refills per day
    REFILL_GAP: 3600e3, // between two refills
    MAX_CARD: 25,
    MAX_BOOST: 15,
    FURY_NEED: 250,     // taps that fill the fury bar
    FURY_MS: 10000,     // fury lasts 10 s: taps x3 and free
    FURY_X: 3,
    FURY_GRACE: 1500,   // taps sent just after fury ended (network delay) still count
    CHEST_FIRST: 3 * 60e3,
    CHEST_MIN: 20 * 60e3, CHEST_SPAN: 25 * 60e3, // next treasure jar in 20-45 min
  };
  // Tasks: one-time rewards. have(s, k, ctx) returns progress.
  const cardLevels = (k) => Object.values(k.cards).reduce((a, b) => a + b, 0);
  const TASKS = [
    { id: "taps1k", e: "👆", need: 1000, r: 2000, have: (s, k) => k.stats.taps },
    { id: "fury", e: "🔥", need: 1, r: 3000, have: (s, k) => k.stats.furies },
    { id: "cards5", e: "🃏", need: 5, r: 3000, have: (s, k) => cardLevels(k) },
    { id: "streak3", e: "📅", need: 3, r: 5000, have: (s, k) => k.daily.streak },
    { id: "chest3", e: "🏺", need: 3, r: 5000, have: (s, k) => k.stats.chests },
    { id: "camel", e: "🐪", need: 1, r: 3000, have: (s) => (s.animals || []).length },
    { id: "city2", e: "🏙️", need: 2, r: 5000, have: (s, k, x) => (x.cityLevel ? x.cityLevel(s.city ? s.city.xp : 0) : 1) },
    { id: "bronze", e: "🥉", need: 2, r: 10000, have: (s, k) => league(k.total) },
    { id: "taps10k", e: "💪", need: 10000, r: 15000, have: (s, k) => k.stats.taps },
    { id: "cards25", e: "🏗️", need: 25, r: 25000, have: (s, k) => cardLevels(k) },
    { id: "member", e: "👑", need: 1, r: 50000, have: (s, k, x) => (x.boost > 0 ? 1 : 0) },
    { id: "gold", e: "🥇", need: 4, r: 100000, have: (s, k) => league(k.total) },
    // Invite friends: only friends who really played count (x.refs from the server)
    { id: "invite1", e: "🤝", need: 1, r: 10000, have: (s, k, x) => x.refs || 0 },
    { id: "invite3", e: "👥", need: 3, r: 30000, have: (s, k, x) => x.refs || 0 },
    { id: "invite10", e: "📣", need: 10, r: 150000, have: (s, k, x) => x.refs || 0 },
  ];
  // Leagues by lifetime coins
  const LEAGUES = [0, 5e3, 25e3, 1e5, 1e6, 2e6, 1e7, 5e7, 1e8, 1e9];
  const LEAGUE_ICON = ["🏜️", "🟤", "🥉", "🥈", "🥇", "💚", "💙", "❤️", "💎", "👑"];
  const DAILY = [500, 1e3, 2500, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5];
  const CATS = ["oasis", "market", "arena", "caravan"];
  // c = first cost, p = profit per hour of level 1, req = unlock condition
  const CARDS = [
    { id: "well", cat: "oasis", e: "🪣", c: 100, p: 10 },
    { id: "dates", cat: "oasis", e: "🌴", c: 250, p: 25 },
    { id: "palms", cat: "oasis", e: "🌳", c: 800, p: 70, req: { league: 1 } },
    { id: "inn", cat: "oasis", e: "🏨", c: 3000, p: 220, req: { card: "palms", lvl: 5 } },
    { id: "spice", cat: "market", e: "🌶️", c: 400, p: 35 },
    { id: "tea", cat: "market", e: "🍵", c: 1200, p: 95 },
    { id: "carpets", cat: "market", e: "🧶", c: 5000, p: 340, req: { league: 2 } },
    { id: "jewels", cat: "market", e: "💍", c: 20000, p: 1100, req: { card: "carpets", lvl: 5 } },
    { id: "dummy", cat: "arena", e: "🪵", c: 150, p: 12 },
    { id: "dojo", cat: "arena", e: "🥋", c: 1500, p: 110 },
    { id: "coach", cat: "arena", e: "🧔", c: 8000, p: 500, req: { league: 2 } },
    { id: "belt", cat: "arena", e: "🏆", c: 50000, p: 2500, req: { league: 3 } },
    { id: "camels", cat: "caravan", e: "🐪", c: 600, p: 50 },
    { id: "route", cat: "caravan", e: "🧂", c: 2500, p: 180, req: { card: "camels", lvl: 3 } },
    { id: "map", cat: "caravan", e: "🗺️", c: 12000, p: 700, req: { league: 3 } },
    { id: "port", cat: "caravan", e: "⚓", c: 100000, p: 4500, req: { league: 4 } },
  ];
  const BOOSTS = [
    { id: "tap", e: "👊", c: 1000 },  // +1 coin per tap
    { id: "cap", e: "🔋", c: 1000 },  // +500 energy limit
  ];
  // Community bosses: every player's tap damage hits the same boss
  const BOSSES = [
    { id: "scorpion", e: "🦂" },
    { id: "viper", e: "🐍" },
    { id: "leopard", e: "🐆" },
    { id: "worm", e: "🪱" },
    { id: "djinn", e: "🧞" },
  ];
  const bossOf = (lvl) => BOSSES[(lvl - 1) % BOSSES.length];
  const bossHp = (lvl) => Math.round(50000 * Math.pow(2.2, lvl - 1));
  const KILL_BONUS = (lvl) => 5000 * lvl; // for the final blow
  // Jerry's looks: unlocked by league or bought with coins (cosmetic only)
  const SKINS = [
    { id: "classic", e: "🟥" },
    { id: "night", e: "⬛", league: 1 },
    { id: "gold", e: "🟨", league: 3 },
    { id: "turban", e: "👳", cost: 50000 },
    { id: "shades", e: "😎", cost: 150000 },
    { id: "crown", e: "👑", league: 5 },
  ];
  const cardById = (id) => CARDS.find((x) => x.id === id);
  const cardCost = (card, lvl) => Math.round(card.c * Math.pow(1.55, lvl));
  const cardProfit = (card, lvl) => Math.round((card.p * (Math.pow(1.12, lvl) - 1)) / 0.12); // total at this level
  const boostCost = (b, lvl) => Math.round(b.c * Math.pow(2, lvl));
  const league = (total) => { let i = 0; while (i + 1 < LEAGUES.length && total >= LEAGUES[i + 1]) i++; return i; };
  const tapValue = (k) => 1 + (k.tap || 0);
  const maxEnergy = (k) => K.E_BASE + K.E_STEP * (k.cap || 0);
  const day = (t) => Math.floor(t / 86400000);

  function fresh(now) {
    return { v: 1, coins: 0, total: 0, energy: K.E_BASE, eAt: now, tap: 0, cap: 0, cards: {}, last: now, tapAt: 0, refill: { day: day(now), used: 0, at: 0 }, daily: { day: -1, streak: 0 } };
  }
  function norm(k, now) {
    if (!k || k.v !== 1) k = fresh(now);
    if (!k.stats) k.stats = { taps: 0, furies: 0, chests: 0 };
    if (!k.done) k.done = {};
    if (k.fury == null) { k.fury = 0; k.furyUntil = 0; }
    if (k.chestAt == null) k.chestAt = now + K.CHEST_FIRST;
    if (!k.skins) { k.skins = { classic: 1 }; k.skin = "classic"; }
    // Airdrop record: where coins came from, days played, and signs of automated tapping
    if (!k.earn) k.earn = {};
    if (!k.act) k.act = { day: -1, days: 0 };
    if (!k.sus) k.sus = { rej: 0, mins: 0, minDay: -1, lastMin: -1, maxMins: 0 };
    if (!k.refill || k.refill.day !== day(now)) k.refill = { day: day(now), used: 0, at: (k.refill && k.refill.at) || 0 };
    return k;
  }
  // Profit per hour, with the membership boost
  function pph(k, boost) {
    let n = 0;
    for (const c of CARDS) n += cardProfit(c, k.cards[c.id] || 0);
    return Math.floor(n * (1 + (boost || 0)));
  }
  function energyNow(k, now) {
    return Math.min(maxEnergy(k), Math.floor(k.energy + (Math.max(0, now - k.eAt) / 1000) * K.REGEN));
  }
  function gain(k, n, src) {
    k.coins += n; k.total += n;
    if (src && n > 0) k.earn[src] = (k.earn[src] || 0) + n;
  }
  // Signs a player may be a bot (for the owner's airdrop review, never automatic bans)
  const SUS = { REJ: 2000, MINS: 240 };
  function flags(k) {
    const f = [];
    if (k.sus && k.sus.rej > SUS.REJ) f.push("speed");       // keeps sending taps faster than a hand can
    if (k.sus && k.sus.maxMins > SUS.MINS) f.push("marathon"); // tapped in more than 4 hours of one day
    return f;
  }
  // Passive income since the last visit (at most OFFLINE_H hours)
  function accrue(k, now, boost) {
    const ms = Math.min(Math.max(0, now - k.last), K.OFFLINE_H * 3600e3);
    const n = Math.floor((pph(k, boost) * ms) / 3600e3);
    gain(k, n, "passive");
    k.last = now;
    return n;
  }
  function unlocked(k, card) {
    const r = card.req;
    if (!r) return true;
    if (r.league != null) return league(k.total) >= r.league;
    return (k.cards[r.card] || 0) >= r.lvl;
  }
  // What the screen shows right now (no change to the saved state)
  function view(k, now, boost) {
    k = norm(JSON.parse(JSON.stringify(k || null)), now);
    const away = accrue(k, now, boost);
    return { coins: k.coins, total: k.total, energy: energyNow(k, now), max: maxEnergy(k), tap: tapValue(k), pph: pph(k, boost), league: league(k.total), away,
      fury: k.fury, furyUntil: k.furyUntil, chestAt: k.chestAt, chestReward: chestReward(k, boost) };
  }
  // Treasure jar: half an hour of profit, never less than 100 taps
  const chestReward = (k, boost) => Math.max(1000, Math.floor(pph(k, boost) / 2), tapValue(k) * 100);
  const furyOn = (k, now) => k.furyUntil > 0 && now <= k.furyUntil + K.FURY_GRACE;

  // Runs one Kombat action on the whole game state s (already a copy). Returns { s, msg }.
  function applyTo(s, a, ctx, fail) {
    const now = ctx.now, boost = ctx.boost || 0;
    const k = (s.kombat = norm(s.kombat, now));
    const awayMs = now - k.last;
    const away = accrue(k, now, boost);
    switch (a.type) {
      case "kSync":
        // only worth saying after a real break (5+ minutes)
        return { s, msg: away > 0 && awayMs >= 5 * 60e3 ? { key: "k.away", vars: { n: away } } : null };
      case "kTap": {
        const n = Number.isInteger(a.n) ? a.n : NaN;
        if (!(n >= 1 && n <= K.MAX_BATCH)) fail("badAction");
        const tv = tapValue(k);
        const e = energyNow(k, now);
        const byTime = k.tapAt ? Math.floor(((now - k.tapAt) / 1000) * K.MAX_TPS) + K.BURST : K.BURST + K.MAX_TPS * 2;
        let ok, dmg = 0;
        if (furyOn(k, now)) {
          // Fury: x3 coins and no energy used
          ok = Math.max(0, Math.min(n, byTime));
          gain(k, ok * tv * K.FURY_X, "fury");
          k.energy = e;
          dmg = ok * tv * K.FURY_X;
        } else {
          if (k.furyUntil) k.furyUntil = 0;
          ok = Math.max(0, Math.min(n, Math.floor(e / tv), byTime));
          gain(k, ok * tv, "tap");
          dmg = ok * tv;
          k.energy = e - ok * tv;
          k.fury += ok;
          if (k.fury >= K.FURY_NEED) { k.fury = 0; k.furyUntil = now + K.FURY_MS; k.stats.furies++; }
        }
        k.stats.taps += ok;
        // taps sent faster than possible (beyond what energy would allow anyway)
        const could = furyOn(k, now) ? n : Math.min(n, Math.floor(e / tv));
        if (could > byTime) k.sus.rej += could - byTime;
        if (ok > 0) {
          const d = day(now), m = Math.floor(now / 60000);
          if (k.act.day !== d) { k.act.day = d; k.act.days++; }
          if (k.sus.lastMin !== m) {
            if (k.sus.minDay !== d) { k.sus.minDay = d; k.sus.mins = 0; }
            k.sus.mins++; k.sus.lastMin = m;
            if (k.sus.mins > k.sus.maxMins) k.sus.maxMins = k.sus.mins;
          }
        }
        k.eAt = now;
        k.tapAt = now;
        return { s, msg: null, accepted: ok, dmg };
      }
      case "kCard": {
        const card = cardById(a.id);
        if (!card) fail("badAction");
        if (!unlocked(k, card)) fail("k.locked");
        const lvl = k.cards[card.id] || 0;
        if (lvl >= K.MAX_CARD) fail("k.maxed");
        const cost = cardCost(card, lvl);
        if (k.coins < cost) fail("k.noCoins", { n: cost - k.coins });
        k.coins -= cost;
        k.cards[card.id] = lvl + 1;
        return { s, msg: { key: "k.cardUp", vars: { n: cardProfit(card, lvl + 1) - cardProfit(card, lvl) } } };
      }
      case "kBoost": {
        const b = BOOSTS.find((x) => x.id === a.id);
        if (!b) fail("badAction");
        const lvl = k[b.id] || 0;
        if (lvl >= K.MAX_BOOST) fail("k.maxed");
        const cost = boostCost(b, lvl);
        if (k.coins < cost) fail("k.noCoins", { n: cost - k.coins });
        const e = energyNow(k, now);
        k.coins -= cost;
        k[b.id] = lvl + 1;
        k.energy = e; k.eAt = now;
        return { s, msg: { key: "k.boosted." + b.id } };
      }
      case "kRefill": {
        if (k.refill.used >= K.REFILLS) fail("k.noRefills");
        if (now - k.refill.at < K.REFILL_GAP) fail("k.refillWait", { m: Math.ceil((K.REFILL_GAP - (now - k.refill.at)) / 60000) });
        k.refill.used++;
        k.refill.at = now;
        k.energy = maxEnergy(k); k.eAt = now;
        return { s, msg: { key: "k.refilled" } };
      }
      case "kChest": {
        if (now < k.chestAt) fail("k.noChest");
        const n = chestReward(k, boost);
        gain(k, n, "chest");
        k.stats.chests++;
        k.chestAt = now + K.CHEST_MIN + Math.floor((ctx.rand ? ctx.rand() : Math.random()) * K.CHEST_SPAN);
        return { s, msg: { key: "k.chestGot", vars: { n } } };
      }
      case "kTask": {
        const task = TASKS.find((x) => x.id === a.id);
        if (!task) fail("badAction");
        if (k.done[task.id]) fail("k.taskDone");
        if (task.have(s, k, ctx) < task.need) fail("k.taskNotYet");
        k.done[task.id] = 1;
        gain(k, task.r, "task");
        return { s, msg: { key: "k.taskGot", vars: { n: task.r } } };
      }
      case "kSkin": {
        const sk = SKINS.find((x) => x.id === a.id);
        if (!sk) fail("badAction");
        if (!k.skins[sk.id]) {
          if (sk.league != null && league(k.total) < sk.league) fail("k.skinLocked");
          if (sk.cost) {
            if (k.coins < sk.cost) fail("k.noCoins", { n: sk.cost - k.coins });
            k.coins -= sk.cost;
          }
          k.skins[sk.id] = 1;
        }
        k.skin = sk.id;
        return { s, msg: { key: "k.skinOn" } };
      }
      case "kDaily": {
        const d = day(now);
        if (k.daily.day === d) fail("k.dailyDone");
        const streak = k.daily.day === d - 1 ? k.daily.streak + 1 : 1;
        const n = DAILY[(streak - 1) % DAILY.length];
        gain(k, n, "daily");
        k.daily = { day: d, streak };
        return { s, msg: { key: "k.dailyGot", vars: { n } } };
      }
    }
    fail("badAction");
  }

  root.KombatLogic = { AIRDROP_GOAL: 300000, flags, SUS, AIRDROP_DAYS: 7, BOSSES, bossOf, bossHp, KILL_BONUS, SKINS, TASKS, chestReward, furyOn, K, LEAGUES, LEAGUE_ICON, DAILY, CATS, CARDS, BOOSTS, cardById, cardCost, cardProfit, boostCost, league, tapValue, maxEnergy, fresh, norm, pph, energyNow, unlocked, view, applyTo, day };
})(typeof globalThis !== "undefined" ? globalThis : this);
