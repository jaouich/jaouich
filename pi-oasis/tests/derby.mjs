// Camel Derby. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC");
const weekId = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };

let r = await get("/api/derby", HB);
ok(r.derby.camels.length === 1 && r.derby.camels[0].s.join() === "10,10,10" && r.left === 8, "new player: a desert camel (10/10/10) and 8 free races");

// training with dates
await exec("UPDATE state SET json = json_set(json, '$.dates', 1000) WHERE uid = 'uB'");
r = await post("/api/derby/train", { stat: 0 }, HB);
ok(r.derby.camels[0].s[0] === 11 && r.state.dates === 1000 - 95, "train speed: +1 for 95 dates");
await exec("UPDATE state SET json = json_set(json, '$.dates', 10) WHERE uid = 'uB'");
ok((await post("/api/derby/train", { stat: 1 }, HB)).error === "notEnough", "training needs dates");
ok((await post("/api/derby/train", { stat: 1, feed: true }, HB)).error === "derby.noFeed", "no golden feed yet");

// races
r = await post("/api/derby/race", { tactic: "late" }, HB);
ok(r.race && r.race.length === 6 && r.race.filter((x) => x.me).length === 1, "a race has 6 camels, one is mine");
ok(r.place >= 1 && r.place <= 6 && r.trophies > 0 && r.dates > 0, "every place wins trophies and dates (no entry fee)");
ok(r.race.every((x) => x.t.length === 3) && [...r.race].sort((a, b) => a.total - b.total).map((x) => x.place).join() === "1,2,3,4,5,6", "places follow the times");
ok(r.left === 7 && r.derby.trophies === r.trophies, "one free race used, trophies counted");
for (let i = 0; i < 7; i++) await post("/api/derby/race", { tactic: "fast" }, HB);
r = await post("/api/derby/race", { tactic: "fast" }, HB);
ok(r.error === "derby.noRaces", "8 free races a day");
ok((await post("/api/derby/race", { tactic: "fast", adId: "bad-ad" }, HB)).error === "k.adFail", "an extra race needs a real watched ad");
const wk = await sql(`SELECT pts FROM derby_weeks WHERE uid='uB' AND week_id=${weekId(Date.now())}`);
ok(wk[0].pts === (await get("/api/derby", HB)).derby.trophies, "weekly trophies recorded");

// rival players appear
r = await post("/api/derby/race", { tactic: "steady" }, HC);
ok(r.race.some((x) => x.name === "bob"), "other players' camels race against you");
ok((await get("/api/derby", HC)).top.length === 2, "weekly Derby ranking");

// stronger camel wins more (simulation check)
global.window = global; await import("../public/logic.js"); await import("../public/derby-logic.js");
const DL = globalThis.DerbyLogic;
let wins = 0; let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 300; i++) { const res = DL.race([{ camel: { s: [60, 60, 60] }, tactic: "steady", me: true }, ...[0, 1, 2, 3, 4].map((k) => DL.bot(40, rnd, k))], rnd); if (res[0].place === 1) wins++; }
ok(wins > 200, `training pays off: a 60/60/60 camel beats level-40 bots most of the time (${wins}/300)`);

// purchases
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "dbf", uid: "uB", amount: 0.5, type: "derby", kind: "feed", pack: "f30", txid: "tdbf" }) });
await post("/api/payments/approve", { paymentId: "dbf" }, HB);
r = await post("/api/payments/complete", { paymentId: "dbf", txid: "tdbf" }, HB);
ok(r.ok && (await get("/api/derby", HB)).derby.feed === 30, "0.5 Pi: 30 golden feed");
r = await post("/api/derby/train", { stat: 2, feed: true }, HB);
ok(r.derby.feed === 29 && r.derby.camels[0].s[2] === 12, "golden feed: +2 without dates");
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "dbx", uid: "uB", amount: 1, type: "derby", kind: "breed", breed: "royal", txid: "tdbx" }) });
ok((await post("/api/payments/approve", { paymentId: "dbx" }, HB)).error === "badPayment", "a royal camel at the wrong price is refused");
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "dbr", uid: "uB", amount: 5, type: "derby", kind: "breed", breed: "royal", txid: "tdbr" }) });
await post("/api/payments/approve", { paymentId: "dbr" }, HB);
await post("/api/payments/complete", { paymentId: "dbr", txid: "tdbr" }, HB);
r = await get("/api/derby", HB);
ok(r.derby.camels.length === 2 && r.derby.camels[1].b === "royal" && r.derby.camels[1].s[0] === 28 && r.derby.act === 1, "5 Pi: a royal camel (28) joins the stable and is selected");
await post("/api/payments/complete", { paymentId: "dbr", txid: "tdbr" }, HB);
ok((await get("/api/derby", HB)).derby.camels.length === 2, "completing twice gives nothing more");
r = await post("/api/derby/select", { i: 0 }, HB);
ok(r.derby.act === 0, "switch the active camel");
ok((await post("/api/derby/rename", { i: 1, name: "<b>x" }, HB)).error === "derby.badName", "bad camel name refused");
r = await post("/api/derby/rename", { i: 1, name: "نجمة الواحة" }, HB);
ok(r.derby.camels[1].n === "نجمة الواحة", "camel renamed (Arabic name)");

// weekly prizes
const last = weekId(Date.now() - 7 * 86400000);
await exec(`INSERT INTO derby_weeks (week_id, uid, pts, updated_at) VALUES (${last}, 'uC', 500, 1), (${last}, 'uB', 300, 2);`);
const d0 = (await get("/api/me", HC)).state.dates;
await fetch(B + "/__test/cron");
ok((await get("/api/me", HC)).state.dates === d0 + 25000, "last week's Derby #1 gets 25,000 dates");
await fetch(B + "/__test/cron");
ok((await get("/api/me", HC)).state.dates === d0 + 25000, "weekly Derby prize given once");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
