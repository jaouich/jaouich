// Personal catalog (album): every collection item a player owns, and the goal of collecting it all.
// Shared by the server (which checks ownership and pays rewards) and the app (which draws the album).
// Items come from KombatLogic.COLLECTIBLES, OasisLogic.ROYAL and OasisLogic.SUPPORTER: nothing is duplicated.
//  - 22 REQUIRED items: 7 (series 1) + 11 (series 2) + 4 royal cards. Completing them = Master Collector.
//  - 6 BONUS items: the 2 mythic collectibles (1 and 3 copies exist, so they can't be required) and 4 supporter badges.
//  - An item counts toward rewards only after it was held HOLD_DAYS (stops buy-claim-resell loops).
(function (root) {
  const HOLD_DAYS = 3, DAY = 86400000, BOOST_MAX = 0.05;
  const MILESTONES = [
    { key: "m3", n: 3, coins: 30000 },
    { key: "m6", n: 6, coins: 100000, jry: 20 },
    { key: "m10", n: 10, coins: 300000, jry: 50 },
    { key: "m15", n: 15, coins: 1000000, jry: 120 },
  ];
  const SECTION_REWARD = { coins: 100000, boost: 0.01 };
  const MASTER = { key: "master", coins: 3000000, jry: 500, boost: 0.02 };
  const SECTIONS = ["series1", "series2", "royal", "honors"];
  const ROYAL_R = { r10: "rare", r25: "epic", r50: "legendary", r100: "mythic" }; // only for the card's look
  const BADGES = [
    { id: "b1", e: "💚", r: "rare", lvl: 1 }, { id: "b2", e: "💙", r: "epic", lvl: 2 },
    { id: "b3", e: "💎", r: "legendary", lvl: 3 }, { id: "bf", e: "🤍", r: "common", free: true },
  ];
  let cache = null;
  // All entries: { id, kind: nft | royal | badge, sec, required, r (rarity for the look), e }
  function entries() {
    if (cache) return cache;
    const C = root.KombatLogic.COLLECTIBLES.filter((x) => !x.pi), R = root.OasisLogic.ROYAL.TIERS.filter((x) => !x.premium), out = [];
    C.forEach((c, i) => out.push({ id: c.id, kind: "nft", sec: c.r === "mythic" ? "honors" : i < 8 ? "series1" : "series2", required: c.r !== "mythic", r: c.r, e: c.e, max: c.max, price: c.price, perk: c.perk }));
    R.forEach((t) => out.push({ id: t.id, kind: "royal", sec: "royal", required: true, r: ROYAL_R[t.id] || "rare", e: t.e, price: t.price, color: t.color }));
    BADGES.forEach((b) => out.push({ id: b.id, kind: "badge", sec: "honors", required: false, r: b.r, e: b.e }));
    return (cache = out);
  }
  const requiredCount = () => entries().filter((x) => x.required).length;
  const sectionEntries = (sec) => entries().filter((x) => x.sec === sec);
  // owned: { id: { eds: [numbers], since: ms } } (since = when the player got it; 0 = counts at once)
  // claims: array of claimed goal keys. Returns what the album shows and which goals can be claimed.
  function progressOf(owned, now, claims) {
    owned = owned || {}; claims = claims || [];
    const list = entries().map((x) => {
      const o = owned[x.id];
      const readyAt = o ? (o.since || 0) + (x.kind === "badge" ? 0 : HOLD_DAYS * DAY) : 0;
      const state = !o ? "none" : now >= readyAt ? "counted" : "holding";
      return { ...x, state, readyAt, eds: o ? o.eds || [] : [] };
    });
    const sections = {};
    for (const s of SECTIONS) {
      const es = list.filter((x) => x.sec === s);
      sections[s] = { total: es.length, owned: es.filter((x) => x.state !== "none").length, have: es.filter((x) => x.state === "counted").length, required: es.some((x) => x.required) };
    }
    const req = list.filter((x) => x.required), have = req.filter((x) => x.state === "counted").length;
    const goals = [
      ...MILESTONES.map((m) => ({ key: m.key, type: "milestone", need: m.n, reward: m })),
      ...["series1", "series2", "royal"].map((s) => ({ key: "s:" + s, type: "section", sec: s, need: sections[s].total, reward: SECTION_REWARD })),
      { key: "master", type: "master", need: req.length, reward: MASTER },
    ].map((g) => {
      const h = g.type === "section" ? sections[g.sec].have : have;
      return { ...g, have: h, reached: h >= g.need, claimed: claims.includes(g.key) };
    });
    return { list, sections, total: req.length, have, goals, master: have >= req.length, legend: list.every((x) => x.state === "counted"), boost: boostOf(claims) };
  }
  // Permanent Kombat profit from claimed section goals and the Master prize (never above BOOST_MAX)
  function boostOf(claims) {
    let b = 0;
    for (const k of claims || []) { if (k.startsWith("s:")) b += SECTION_REWARD.boost; if (k === "master") b += MASTER.boost; }
    return Math.min(BOOST_MAX, +b.toFixed(4));
  }
  root.CatalogLogic = { HOLD_DAYS, BOOST_MAX, MILESTONES, SECTION_REWARD, MASTER, SECTIONS, BADGES, entries, requiredCount, sectionEntries, progressOf, boostOf };
})(typeof globalThis !== "undefined" ? globalThis : this);
