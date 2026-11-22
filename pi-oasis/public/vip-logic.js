// VIP Club: the membership (5 Pi a month) and the Sultan's Caravan game. Shared by the server and the phone.
// The game is a skill puzzle (no luck, no Pi won): the day's prices and dangers are public and the same for
// everybody; you choose the city, the cargo, how much to buy and how many guards to hire.
(function (root) {
  const VIPC = { PRICE: 5, DAYS: 30, WHEEL_DAYS: 3, WEEK_DAYS: 30 };
  const GAME = { START_GOLD: 500, DAILY_VOYAGES: 3, STIPEND: 150, GUARD_COST: 25, MAX_GUARDS: 3, COIN_RATE: 20, MAX_LV: 10 };
  const GOODS = [
    { id: "spice", e: "🌶️", buy: 10 },
    { id: "silk", e: "🧵", buy: 24 },
    { id: "gem", e: "💎", buy: 55 },
  ];
  const CITIES = [
    { id: "marrakech", e: "🕌" },
    { id: "cairo", e: "🏛️" },
    { id: "baghdad", e: "🌇" },
  ];
  const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const dayId = (t) => Math.floor(t / 86400000);
  const monthId = (t) => { const d = new Date(t); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
  // The market of a day: what the goods cost here and what each city pays, plus the danger on each road (0-3)
  function market(day) {
    const r = seeded(day * 2654435761 + 777), q = (lo, hi) => Math.round((lo + r() * (hi - lo)) * 100) / 100;
    const buy = {}; GOODS.forEach((g) => { buy[g.id] = Math.max(1, Math.round(g.buy * q(0.85, 1.15))); });
    const cities = CITIES.map((c) => { const sell = {}; GOODS.forEach((g) => { sell[g.id] = Math.round(g.buy * q(0.8, 2.0)); }); return { id: c.id, danger: Math.floor(r() * 4), sell }; });
    return { day, buy, cities };
  }
  const levelOf = (profit) => Math.min(GAME.MAX_LV, Math.floor(Math.sqrt(Math.max(0, profit) / 400)));
  const capOf = (lv) => 20 + 4 * lv;
  const fresh = () => ({ gold: GAME.START_GOLD, profit: 0, day: -1, used: 0 });
  // One voyage. Returns { gold, profit, income, cost, loss, ... } or throws a code
  function voyage(st, a, now) {
    const day = dayId(now);
    if (st.day !== day) { st.day = day; st.used = 0; st.gold = Math.max(st.gold, GAME.STIPEND); }
    const m = market(day), city = m.cities.find((c) => c.id === a.city), good = GOODS.find((g) => g.id === a.good);
    const qty = Math.floor(Number(a.qty)), guards = Math.floor(Number(a.guards) || 0);
    if (!city || !good || !(qty >= 1) || !(guards >= 0 && guards <= GAME.MAX_GUARDS)) throw new Error("badAction");
    if (st.used >= GAME.DAILY_VOYAGES) throw new Error("vc.noVoyage");
    const cap = capOf(levelOf(st.profit));
    if (qty > cap) throw new Error("vc.cap");
    const cost = qty * m.buy[good.id], guardCost = guards * GAME.GUARD_COST;
    if (st.gold < cost + guardCost) throw new Error("vc.noGold");
    const lossPct = Math.max(0, city.danger - guards) * 20;
    const kept = Math.floor((qty * (100 - lossPct)) / 100);
    const income = kept * city.sell[good.id];
    const profit = income - cost - guardCost;
    st.gold += profit; st.profit += Math.max(0, profit); st.used++;
    return { st, profit, income, cost, guardCost, lossPct, kept, coins: Math.max(0, profit) * GAME.COIN_RATE };
  }
  root.VipLogic = { VIPC, GAME, GOODS, CITIES, market, levelOf, capOf, fresh, voyage, dayId, monthId };
})(typeof globalThis !== "undefined" ? globalThis : this);
