// Mainnet copy: first sign-in brings the Testnet game progress over. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const now = Date.now();
const st = { v: 1, dates: 123456, plots: [], stakes: [], week: { id: 1, score: 99999 }, lastDaily: -1, rare: 0, animals: [], nextAnimal: 1,
  kombat: { coins: 777777, total: 900000, wk: { id: 1, n: 5000 } } };
await post("/__test/tnexec", `
  CREATE TABLE users (uid TEXT PRIMARY KEY, username TEXT, vip_until INTEGER, ref_balance REAL);
  CREATE TABLE state (uid TEXT PRIMARY KEY, json TEXT);
  CREATE TABLE partners (username TEXT PRIMARY KEY COLLATE NOCASE, granted_by TEXT, granted_at INTEGER);
  INSERT INTO users VALUES ('tD', 'Dina', ${now + 9e9}, 5.5);
  INSERT INTO state VALUES ('tD', '${JSON.stringify(st)}');
  INSERT INTO partners VALUES ('dina', 'jaouich', 1);`);
await post("/__test/mainnet/on", {});
const d = await post("/api/auth", { accessToken: "tokD" });
ok(d.state && d.state.dates === 123456, "dates carried over from Testnet");
ok(d.state.kombat && d.state.kombat.coins === 777777, "Jerry Kombat coins carried over");
ok(d.state.week.score === 0, "this week's ranking starts at 0 on Mainnet");
ok(!d.state.kombat.wk || d.state.kombat.wk.n === 0, "Kombat weekly tournament starts at 0");
ok(d.account.tierId === "partner", "Partner granted on Testnet is kept");
ok(+d.account.referralBalance === 0, "no Test-Pi referral balance comes along");
const e = await post("/api/auth", { accessToken: "tokE" });
ok(e.s === 200 && e.state.dates !== 123456 && !e.state.fromTestnet, "a player with no Testnet account starts fresh");
// second sign-in: no copy again (progress made on Mainnet stays)
await post("/__test/tnexec", `UPDATE state SET json = replace(json, '123456', '5') WHERE uid = 'tD'`);
const d2 = await post("/api/auth", { accessToken: "tokD" });
ok(d2.state.dates === 123456, "copy happens once only");
// Someone who opened the Mainnet game before the carry-over existed (emad, fresh above)
await post("/__test/tnexec", `INSERT INTO users VALUES ('tE', 'emad', 0, 0); INSERT INTO state VALUES ('tE', '${JSON.stringify({ ...st, dates: 4242 })}');`);
const e2 = await post("/api/auth", { accessToken: "tokE" });
ok(e2.state.dates === 4242 && e2.state.kombat.coins === 777777, "early Mainnet account gets its bigger Testnet progress once");
await post("/__test/tnexec", `UPDATE state SET json = replace(json, '4242', '9999999') WHERE uid = 'tE'`);
const e3 = await post("/api/auth", { accessToken: "tokE" });
ok(e3.state.dates === 4242, "...and only once");
await post("/__test/mainnet/off", {});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
