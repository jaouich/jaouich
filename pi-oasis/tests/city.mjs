// Oasis City tests. Start tests/harness.mjs first (fresh database).
import "../public/logic.js";
// Today's oasis event can raise order rewards (market day +50%)
const OR = Math.floor(84 * (globalThis.OasisLogic.eventOf(Date.now()).orders || 1));
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text()).then((x) => { try { return JSON.parse(x); } catch { return x; } });
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => post("/__test/exec", q);
let pass = 0, fail = 0;
const ok = (c, m, extra) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra))); c ? pass++ : fail++; };

const C = (await post("/api/auth", { accessToken: "tokC" })).session; // carol: free player
const uidC = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid;
const act = (a, tok = C) => post("/api/action", { action: a }, tok);
const st = async (uid = uidC) => JSON.parse((await sql(`SELECT json FROM state WHERE uid='${uid}'`))[0].json);
const setJson = (path, value, uid = uidC) => exec(`UPDATE state SET json = json_set(json, '${path}', json('${JSON.stringify(value)}')) WHERE uid='${uid}'`);

// --- Start of the city ---
let me = await get("/api/me", C);
const city = me.state.city;
ok(city.tiles[12]?.b === "house" && city.tiles[13]?.b === "bakery", "new city starts with a house and a bakery");
const orders = city.orders.filter((o) => o.need);
ok(orders.length === 4, "4 citizens' orders ready at login", city.orders);
ok(orders.every((o) => Object.keys(o.need).every((g) => g === "bread")), "orders only ask for goods the player can make (bread)");

// --- Crafting ---
let r = await act({ type: "cityCraft", tile: 13, qty: 2 });
ok(r.msg?.key === "t.crafting" && r.state.dates === 30, "craft 2 bread costs 20 dates (50 → 30)", r.state?.dates);
ok((await act({ type: "cityCraft", tile: 13 })).error === "cityBusy", "a busy workshop can't start another job");
ok((await act({ type: "cityCollect", tile: 13 })).error === "notReady", "can't collect before the work is done");
await exec(`UPDATE state SET json = json_set(json, '$.city.tiles[13].job.end', 1) WHERE uid='${uidC}'`);
r = await act({ type: "cityCollect", tile: 13 });
ok(r.state.city.goods.bread === 2 && r.state.city.xp === 4, "collect: 2 bread in the warehouse, +4 XP", r.state?.city);
ok((await act({ type: "cityCollect", tile: 13 })).error === "notReady", "collecting twice gives nothing");

// --- Cheat attempts ---
ok((await act({ type: "cityCraft", tile: 12 })).error === "badAction", "a house can't craft");
ok((await act({ type: "cityCraft", tile: 99 })).error === "badAction", "tile out of range refused");
ok((await act({ type: "cityCraft", tile: 13, qty: 50 })).error === "badAction", "quantity above 3 refused");
ok((await act({ type: "cityCraft", tile: 13, qty: 1.5 })).error === "badAction", "fractional quantity refused");
ok((await act({ type: "cityBuild", tile: 12, b: "bakery" })).error === "badAction", "can't build on an occupied tile");
ok((await act({ type: "cityBuild", tile: 0, b: "castle" })).error === "badAction", "unknown building refused");
ok((await act({ type: "cityBuild", tile: 0, b: "teahouse" })).error === "cityLocked", "tea house is locked at city level 1");
ok((await act({ type: "cityDeliver", slot: 7 })).error === "badAction", "unknown order slot refused");
ok((await act({ type: "cityUpgrade", tile: 5 })).error === "badAction", "can't upgrade an empty tile");
await setJson("$.dates", 100000);
ok((await act({ type: "cityUpgrade", tile: 12 })).state.city.tiles[12].lvl === 2, "house upgraded to level 2");
ok((await act({ type: "cityUpgrade", tile: 12 })).state.city.tiles[12].lvl === 3, "…and level 3");
ok((await act({ type: "cityUpgrade", tile: 12 })).error === "cityMax", "no upgrade past the max level");

// --- Orders ---
await setJson("$.city.orders[0]", { id: 90, need: { bread: 2 }, reward: 84, xp: 14 });
await setJson("$.city.orders[1]", { id: 91, need: { bread: 9 }, reward: 400, xp: 14 });
ok((await act({ type: "cityDeliver", slot: 1 })).error === "cityMissing", "can't deliver without enough goods");
const before = await st();
r = await act({ type: "cityDeliver", slot: 0 });
ok(r.msg?.key === "t.orderDone" && r.state.dates - before.dates === OR && r.state.week.score - before.week.score === OR, `order: +${OR} dates and +${OR} score (free player, today's event included)`, [r.state?.dates - before.dates, r.state?.week.score - before.week.score]);
ok(r.state.city.goods.bread === 0 && r.state.city.orders[0].wait > Date.now(), "goods used and the slot waits for a new order");
ok((await act({ type: "cityDeliver", slot: 0 })).error === "badAction", "can't deliver the same order twice");
await exec(`UPDATE state SET json = json_set(json, '$.city.orders[0].wait', 1) WHERE uid='${uidC}'`);
r = await act({ type: "cityTick" });
ok(r.state.city.orders[0].need, "a new order appears once the waiting time is over");

// --- Taxes ---
await exec(`UPDATE state SET json = json_set(json, '$.city.taxAt', ${Date.now() - 3 * 3600000}, '$.city.taxStore', 0) WHERE uid='${uidC}'`);
const t0 = await st();
r = await act({ type: "cityTax" });
const rate = 14 * 2; // house level 3 = 14 citizens
ok(Math.abs((r.state.dates - t0.dates) - rate * 3) <= 1 && r.state.week.score - t0.week.score === r.state.dates - t0.dates, "3 hours of taxes: ~84 dates, all counted for the ranking", r.state.dates - t0.dates);
ok((await act({ type: "cityTax" })).error === "notReady", "no taxes right after collecting");
await exec(`UPDATE state SET json = json_set(json, '$.city.taxAt', ${Date.now() - 100 * 3600000}, '$.city.taxStore', 0) WHERE uid='${uidC}'`);
const t1 = await st();
r = await act({ type: "cityTax" });
ok(Math.abs((r.state.dates - t1.dates) - rate * 8) <= 1, "taxes stop piling up after 8 hours", r.state.dates - t1.dates);

// --- Level up, building, demolishing ---
await setJson("$.city.xp", 60);
r = await act({ type: "cityBuild", tile: 0, b: "teahouse" });
ok(r.msg?.key === "t.built" || r.msg?.key === "t.levelUp", "level 2 unlocks the tea house", r.msg);
ok(r.state.city.tiles[0]?.b === "teahouse", "tea house built on tile 0");
await setJson("$.dates", 1000);
r = await act({ type: "cityDemolish", tile: 0 });
ok(r.state.dates === 1000 + 125 && !r.state.city.tiles[0], "demolishing refunds half the price (250 → 125)", r.state?.dates);
await setJson("$.city.tiles[13].job", { g: "bread", qty: 1, end: Date.now() + 99999 });
ok((await act({ type: "cityDemolish", tile: 13 })).error === "cityBusy", "can't demolish a workshop that is working");
await setJson("$.city.tiles[13].job", null);

// --- Warehouse limit ---
await setJson("$.city.goods.bread", 29);
ok((await act({ type: "cityCraft", tile: 13, qty: 2 })).error === "warehouseFull", "warehouse limit (20 + 5 per level = 30 at level 2) blocks crafting");

// --- Membership: bonus gives dates, not score ---
const G = (await post("/api/auth", { accessToken: "tokB" })).session; // bob
const uidB = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;
await exec(`UPDATE users SET vip_until = ${Date.now() + 9e8}, vip_tier = 'gold' WHERE uid='${uidB}'`);
await act({ type: "cityTick" }, G);
await setJson("$.city.goods.bread", { bread: 3 }.bread, uidB);
await setJson("$.city.orders[0]", { id: 70, need: { bread: 2 }, reward: 84, xp: 14 }, uidB);
const b0 = await st(uidB);
r = await act({ type: "cityDeliver", slot: 0 }, G);
ok(r.state.dates - b0.dates === OR + Math.floor(OR * 0.35) && r.state.week.score - b0.week.score === OR, `Gold: order gives ${OR} + 35% dates but only ${OR} score`, [r.state?.dates - b0.dates, r.state?.week.score - b0.week.score]);

// --- Old saves get a city ---
await exec(`UPDATE state SET json = json_remove(json, '$.city') WHERE uid='${uidC}'`);
me = await get("/api/me", C);
ok(me.state.city && me.state.city.tiles[12]?.b === "house", "a save without a city gets a fresh one");

console.log(`== ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
