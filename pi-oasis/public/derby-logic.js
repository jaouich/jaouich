// Camel Derby: train racing camels and race other players' camels.
// Shared by the server (which decides everything) and the app (which shows it).
// Races are free (8 a day, + a few more after a rewarded ad); Pi buys golden feed and better breeds.
// Nothing here is a bet: no entry fee, and every place wins something.
(function (root) {
  const BREEDS = [
    { id: "desert", e: "🐪", base: 10, price: 0, color: "#c98a4b" },
    { id: "swift", e: "🐫", base: 18, price: 1, color: "#e0b062" },
    { id: "royal", e: "🐪", base: 28, price: 5, color: "#8e5cff" },
    { id: "legend", e: "🐫", base: 40, price: 15, color: "#ffc21a" },
  ];
  const STATS = ["spd", "sta", "acc"]; // speed, stamina, start
  const MAX_STAT = 100;
  const STABLE = 4; // camels per player
  const RACES_PER_DAY = 8;
  const AD_RACES = 4; // extra races per day, each after a rewarded Pi ad
  const RACERS = 6;
  const DIST = 1200; // metres, in 3 segments of 400
  const FEED_GAIN = 2; // golden feed: +2 to a stat, no dates needed
  const FEED_PACKS = [
    { id: "f5", price: 0.1, feed: 5 },
    { id: "f30", price: 0.5, feed: 30 },
    { id: "f140", price: 2, feed: 140 },
  ];
  // Cups by trophies; a higher cup pays more dates per race
  const CUPS = [
    { id: "sand", e: "🏜️", min: 0, mult: 1 },
    { id: "oasis", e: "🌴", min: 300, mult: 1.5 },
    { id: "gold", e: "🥇", min: 1000, mult: 2.2 },
    { id: "sultan", e: "👑", min: 3000, mult: 3.2 },
  ];
  const PLACE_TROPHIES = [30, 18, 10, 4, 2, 1];
  const PLACE_DATES = [300, 180, 120, 80, 50, 30];
  const TACTICS = ["fast", "steady", "late"];
  const BOT_NAMES = ["sahara", "wind", "dune", "storm", "moon", "pearl", "falcon", "mirage"];
  // Weekly derby: trophies won since Monday; the top 100 get dates (half of the Oasis ranking's)
  const weekDates = (place) => Math.floor((root.OasisLogic ? root.OasisLogic.WEEK100.dates(place) : 0) / 2);

  const trainCost = (v) => Math.round(40 * Math.pow(1.09, v)); // dates for +1 at value v
  const cupOf = (trophies) => { let i = 0; while (i + 1 < CUPS.length && trophies >= CUPS[i + 1].min) i++; return i; };
  const breedById = (id) => BREEDS.find((b) => b.id === id) || BREEDS[0];
  const newCamel = (breed, name) => { const b = breedById(breed); return { b: b.id, n: name || "", s: [b.base, b.base, b.base], w: 0, r: 0 }; };
  const day = (t) => Math.floor(t / 86400000);
  function fresh(now) {
    return { v: 1, camels: [newCamel("desert", "")], act: 0, feed: 0, day: day(now), used: 0, ads: 0, wins: 0, races: 0, trophies: 0 };
  }
  // New day: free races again
  function norm(d, now) {
    if (!d || !d.camels || !d.camels.length) d = fresh(now);
    if (d.day !== day(now)) { d.day = day(now); d.used = 0; d.ads = 0; }
    if (!(d.act >= 0 && d.act < d.camels.length)) d.act = 0;
    return d;
  }
  const power = (c) => Math.round((c.s[0] * 1.2 + c.s[1] + c.s[2] * 0.8) / 3);

  // Seconds each racer needs for each 400 m segment. rnd() in [0,1).
  function segTimes(c, tactic, rnd) {
    const [spd, sta, acc] = c.s;
    const v = 14 + spd * 0.06; // m/s
    const f = [0.85 + acc * 0.002, 0.94 + sta * 0.0008, 0.9 + sta * 0.0012];
    if (tactic === "fast") { f[0] *= 1.06; f[2] *= 0.95 + Math.min(sta, 80) * 0.0005; }
    if (tactic === "steady") f[1] *= 1.035;
    if (tactic === "late") { f[0] *= 0.96; f[2] *= 1.07; }
    return f.map((x) => +(400 / (v * x * (1 + (rnd() - 0.5) * 0.08))).toFixed(3));
  }
  // Runs one race. racers: [{ camel, tactic, ... }]. Returns them with times and place.
  function race(racers, rnd) {
    const out = racers.map((r) => { const t = segTimes(r.camel, r.tactic, rnd); return { ...r, t, total: +(t[0] + t[1] + t[2]).toFixed(3) }; });
    const order = out.map((r, i) => i).sort((a, b) => out[a].total - out[b].total);
    order.forEach((i, p) => { out[i].place = p + 1; });
    return out;
  }
  // A computer camel close to the player's level
  function bot(level, rnd, i) {
    const s = STATS.map(() => Math.max(5, Math.min(MAX_STAT, Math.round(level * (0.82 + rnd() * 0.34)))));
    return { camel: { b: BREEDS[Math.min(3, Math.floor(level / 30))].id, n: "", s }, tactic: TACTICS[Math.floor(rnd() * 3)], bot: BOT_NAMES[(i + Math.floor(rnd() * 8)) % BOT_NAMES.length] };
  }
  root.DerbyLogic = { BREEDS, STATS, MAX_STAT, STABLE, RACES_PER_DAY, AD_RACES, RACERS, DIST, FEED_GAIN, FEED_PACKS, CUPS, PLACE_TROPHIES, PLACE_DATES, TACTICS, BOT_NAMES,
    weekDates, trainCost, cupOf, breedById, newCamel, fresh, norm, power, segTimes, race, bot, day };
})(typeof globalThis !== "undefined" ? globalThis : this);
