// Payout tests (weekly prizes + referral withdrawals). Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text()).then((t) => { try { return JSON.parse(t); } catch { return t; } });
const get = (p, h = {}) => fetch(B + p, { headers: h }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => post("/__test/exec", q);
const cron = () => fetch(B + "/__test/cron").then((r) => r.text());
const chain = () => get("/__test/chain");
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };

const weekId = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };
const now = Date.now(), lastWeek = weekId(now - 7 * 86400000), thisWeek = weekId(now);

const A = (await post("/api/auth", { accessToken: "tokA" })).session;
await post("/api/auth", { accessToken: "tokB", ref: "alice" });
await post("/api/auth", { accessToken: "tokC" });
const uidA = (await sql("SELECT uid FROM users WHERE username='alice'"))[0].uid;
const uidB = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;

// --- Weekly prizes ---
await exec(`INSERT OR REPLACE INTO weeks (id, prize_pool, paid) VALUES (${lastWeek}, 1.0, 0);
  INSERT OR REPLACE INTO week_scores VALUES (${lastWeek}, '${uidA}', 300, 1), (${lastWeek}, '${uidB}', 200, 2), (${lastWeek}, 'uC', 100, 3);`);
const before = (await chain()).txs.length;
await cron();
let c = await chain();
const prizes = c.txs.slice(before);
ok(prizes.length === 3, "3 prize transactions sent");
ok(prizes.map((t) => t.amount).join() === "5000000,3000000,2000000", "amounts 0.5 / 0.3 / 0.2 Pi (50/30/20%)");
ok(prizes[0].to === c.wallets[uidA] && prizes[1].to === c.wallets[uidB] && prizes[2].to === c.wallets["uC"], "each prize goes to the right player's wallet");
ok(prizes.every((t) => c.a2u[t.memo] && c.a2u[t.memo].status.developer_completed), "memo = Pi payment id, and Pi payments completed");
ok((await sql(`SELECT paid FROM weeks WHERE id=${lastWeek}`))[0].paid === 1, "week marked as paid");
await cron();
ok((await chain()).txs.length === before + 3, "running again pays nothing twice");

// --- Referral withdrawal, with a lost blockchain response ---
await exec(`UPDATE users SET ref_balance = 1.5 WHERE uid = '${uidA}'`);
const wd = await post("/api/referral/withdraw", {}, { Authorization: "Bearer " + A });
ok(wd.amount === 1.5, "withdrawal request saved (1.5 Pi)");
await fetch(B + "/__test/drop-next");
const n0 = (await chain()).txs.length;
await cron(); // tx lands on chain but the response is lost
ok((await chain()).txs.length === n0 + 1, "transaction landed although the response was lost");
ok((await sql(`SELECT status FROM payouts WHERE kind='withdraw'`))[0].status !== "completed", "not marked completed yet");
await cron(); // must find the tx by memo instead of paying again
c = await chain();
ok(c.txs.length === n0 + 1, "NO double payment after the lost response");
ok((await sql(`SELECT status FROM payouts WHERE kind='withdraw'`))[0].status === "completed", "withdrawal completed on retry");
ok((await sql(`SELECT status FROM withdrawals`))[0].status === "paid", "withdrawal marked paid");
ok(c.txs.at(-1).amount === "15000000" && c.txs.at(-1).to === c.wallets[uidA], "1.5 Pi sent to alice's wallet");

// --- Tiny prize pool rolls over ---
await exec(`UPDATE weeks SET paid = 0, prize_pool = 0.01 WHERE id = ${lastWeek}; DELETE FROM payouts WHERE kind='prize';`);
const poolBefore = ((await sql(`SELECT prize_pool FROM weeks WHERE id=${thisWeek}`))[0] || { prize_pool: 0 }).prize_pool;
const n1 = (await chain()).txs.length;
await cron();
ok((await chain()).txs.length === n1, "pool too small: nothing sent (fees would eat it)");
ok((await sql(`SELECT paid FROM weeks WHERE id=${lastWeek}`))[0].paid === 2, "small pool marked rolled over");
ok(Math.abs((await sql(`SELECT prize_pool FROM weeks WHERE id=${thisWeek}`))[0].prize_pool - poolBefore - 0.01) < 1e-9, "and added to this week's pool");

// --- Withdrawal for a player Pi doesn't know: balance given back ---
await exec(`INSERT INTO users (uid, username, vip_until, ref_balance, created_at) VALUES ('uZ', 'zed', 0, 0, 1);
  INSERT INTO withdrawals (id, uid, username, amount, status, created_at) VALUES ('wZ', 'uZ', 'zed', 2, 'pending', 1);`);
await cron(); await cron(); await cron();
ok((await sql(`SELECT status FROM withdrawals WHERE id='wZ'`))[0].status === "failed", "unknown player: withdrawal failed after 3 tries");
ok((await sql(`SELECT ref_balance FROM users WHERE uid='uZ'`))[0].ref_balance === 2, "and the 2 Pi balance was given back");

// --- Camels (server-side) ---
const act = (action) => post("/api/action", { action }, { Authorization: "Bearer " + A });
const stA = async () => JSON.parse((await sql(`SELECT json FROM state WHERE uid='${uidA}'`))[0].json);
ok((await stA()).animals.some((x) => x.rarity === 3 && String(x.from).startsWith("prize-")), "weekly #1 got a legendary camel");
ok((await sql(`SELECT json FROM state WHERE uid='${uidB}'`)).length && JSON.parse((await sql(`SELECT json FROM state WHERE uid='${uidB}'`))[0].json).animals.some((x) => x.rarity === 2), "weekly #2 got an epic camel");
const camelsBefore = (await stA()).animals.length;
await cron();
ok((await stA()).animals.length === camelsBefore, "prize camels are given only once");
await exec(`UPDATE state SET json = json_set(json, '$.dates', 1000) WHERE uid = '${uidA}'`);
let r = await act({ type: "buyCamel" });
ok(r.msg && r.msg.key === "t.camelBought" && r.state.dates === 700, "buy camel costs 300 dates (server)");
r = await act({ type: "collect" });
ok(r.error === "notReady", "nothing to collect right after buying");
const ids = (await stA()).animals.map((x) => x.id);
r = await act({ type: "breed", a: ids[0], b: ids[1] });
ok(r.msg && r.msg.key === "t.babyCamel" && r.state.dates === 500, "breeding works and costs 200");
r = await act({ type: "breed", a: ids[0], b: ids[1] });
ok(r.error === "camelTired", "parents must rest 24 h");
r = await act({ type: "breed", a: ids[0], b: ids[0] });
ok(r.error === "badAction", "can't breed a camel with itself");
await exec(`UPDATE state SET json = json_set(json, '$.animals[0].lastCollect', ${Date.now() - 2 * 3600000}) WHERE uid = '${uidA}'`);
r = await act({ type: "collect" });
ok(r.msg && r.msg.key === "t.collected" && r.msg.vars.n === 160, "collect: legendary 80/h x 2 h = 160");

const st = await get("/api/status");
ok(st.payoutsConfigured === true && Array.isArray(st.payouts), "status shows payouts");
ok((await fetch(B + "/api/admin/run-payouts", { method: "POST" })).status === 403, "admin run refused without token");
console.log(`== ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
