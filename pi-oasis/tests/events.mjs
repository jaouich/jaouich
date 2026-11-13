// Oasis daily events + Kombat golden hour (pure rules, no server needed)
import "../public/kombat-logic.js";
import "../public/logic.js";
const L = globalThis.OasisLogic, K = globalThis.KombatLogic;
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const dayOf = (id) => { for (let d = 20000; d < 21000; d++) if (L.eventOf(d * 864e5 + 1).id === id) return d * 864e5 + 3600e3; };
const ctx = (now) => ({ now, tier: 0, rand: () => 0.5 });

// rain: planted today grows twice as fast
let t = dayOf("rain"), s = L.fresh(t);
s.dates = 1000;
let r = L.apply(s, { type: "plant", plot: 0, seed: "palm" }, ctx(t));
const palm = L.seedById("palm");
ok(L.readyAt(r.s.plots[0]) - t === palm.time * 1000 * 0.5, "rain day: palm ready in half the time");
const calm = dayOf("calm");
s = L.fresh(calm); s.dates = 1000;
r = L.apply(s, { type: "plant", plot: 0, seed: "palm" }, ctx(calm));
ok(L.readyAt(r.s.plots[0]) - calm === palm.time * 1000, "calm day: normal growing time");
// harvest day: +25%
t = dayOf("harvest"); s = L.fresh(t);
s.plots[0] = { seed: "wheat", plantedAt: t - 1e7 };
r = L.apply(s, { type: "harvest", plot: 0 }, ctx(t));
ok(r.msg.vars.n === Math.floor(L.seedById("wheat").yield * 1.25), "harvest day: +25% (" + r.msg.vars.n + ")");
// festival: camels +50%
t = dayOf("festival"); s = L.fresh(t);
L.addAnimal(s, 0, t - 3 * 3600e3, "t");
const base = L.animalReady(s.animals[0], t);
r = L.apply(s, { type: "collect" }, ctx(t));
ok(r.msg.vars.n === Math.floor(base * 1.5), "camel festival: +50% (" + base + " -> " + r.msg.vars.n + ")");
// market: orders +50%
t = dayOf("market"); s = L.normalize(L.fresh(t), t);
s.city.goods = { bread: 10, tea: 10, spice: 10, carpet: 10, vase: 10 };
s.city.orders = [{ id: 1, need: { bread: 1 }, reward: 100, xp: 5 }];
r = L.apply(s, { type: "cityDeliver", slot: 0 }, ctx(t));
ok(r.s.dates - s.dates === 150, "market day: order pays 150 instead of 100");
// same event for everyone all day, changes over days
const d0 = 20500 * 864e5;
ok(L.eventOf(d0 + 1).id === L.eventOf(d0 + 864e5 - 1).id, "one event for the whole day");
const ids = new Set(); for (let d = 0; d < 30; d++) ids.add(L.eventOf(d0 + d * 864e5).id);
ok(ids.size === 5, "all 5 events show up within a month");

// Kombat golden hour: taps x2
const gs = K.goldenStart(d0 + 1);
const play = (now) => { let st = L.fresh(now); st = L.apply(st, { type: "kSync" }, ctx(now)).s; st.kombat.tapAt = now - 5000; return L.apply(st, { type: "kTap", n: 10 }, ctx(now)).s.kombat; };
ok(play(gs + 60000).coins === 20, "golden hour: 10 taps = 20 coins");
ok(play(gs + 3600e3 + 60000).coins === 10, "after the golden hour: 10 taps = 10 coins");
ok(K.golden(gs) && !K.golden(gs - 1) && !K.golden(gs + 3600e3), "exactly one hour");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
