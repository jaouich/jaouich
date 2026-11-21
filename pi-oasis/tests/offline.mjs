// Nothing keeps producing while the player is away for more than 6 hours (pure logic, no server needed).
global.window = global; await import("../public/logic.js"); await import("../public/kombat-logic.js");
const L = globalThis.OasisLogic, K = globalThis.KombatLogic;
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = 3600000, now = Date.now();
const a = { rarity: 0, lastCollect: now - 100 * H };
ok(L.animalReady(a, now) === L.animalReady({ rarity: 0, lastCollect: now - 6 * H }, now) && L.animalReady(a, now) > 0, "camels: 100 hours away pays exactly 6 hours");
ok(L.animalReady({ rarity: 0, lastCollect: now - 3 * H }, now) < L.animalReady(a, now), "camels: 3 hours pays less than the cap");
const city = L.fresh(now).city; city.tiles[0] = { b: "house", lvl: 3 }; city.taxAt = now - 100 * H; city.taxStore = 0;
const per = L.cityStats(city).taxPerHour;
ok(per > 0 && Math.abs(L.taxPending(city, now) - per * 6) < 1e-6, "city: 100 hours away piles up exactly 6 hours of tax");
const k = K.norm(null, now); k.cards = { well: 3 }; k.last = now - 100 * H; k.coins = 0;
const p = K.pph(k, 0), c6 = Math.floor(p * 6);
ok(p > 0 && K.view(k, now, 0).coins === c6 && K.K.OFFLINE_H === 6, "Kombat: 100 hours away shows exactly 6 hours of profit");
ok(K.view(k, now + 100 * H, 0).coins === c6, "Kombat: an app left open without any action still stops at 6 hours");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
