// King of the Game = the player with the most real Pi paid in total. Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p, h = {}) => fetch(B + p, { headers: h }).then((r) => r.json());
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const notifs = () => get("/__test/notifs");
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HB = await H("tokB"), HC = await H("tokC"), HD = await H("tokD");
// the cache lasts 60 s: tests read it through a helper that forces a fresh isolate view by calling the route after changes
const pay = async (h, uid, id, amount, pack) => { await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id, uid, amount, type: "dates", pack, txid: "t" + id }) }); await post("/api/payments/approve", { paymentId: id }, h); return post("/api/payments/complete", { paymentId: id, txid: "t" + id }, h); };
let lb = await get("/api/leaderboard", HD);
ok(lb.king && !lb.king.username && lb.king.need === 0.01, "nobody has paid: empty throne", lb.king);
// real Pi payments are written directly (the dates shop prices are small), as completed payments
const insertPay = (id, uid, amt, t) => exec(`INSERT INTO payments (id, uid, amount, status, created_at) VALUES ('${id}', '${uid}', ${amt}, 'completed', ${t});`);
await insertPay("p1", "uB", 50, 1000); await insertPay("p2", "uC", 30, 2000);
// force a refresh: the server refreshes every 60 s, so wait for a new minute by touching the cache through the exposed test hook
await fetch(B + "/__test/king-refresh");
lb = await get("/api/leaderboard", HD);
ok(lb.king.username === "bob" && lb.king.paid === 50 && lb.king.need === 50.01, "bob (50 Pi) is crowned; to dethrone him: more than 50", lb.king);
ok((await get("/api/me", HB)).account.mult.id === "king" && (await get("/api/me", HB)).account.mult.f === 3, "the King gets x3");
ok(!(await get("/api/me", HC)).account.mult, "carol does not");
let n = (await notifs()).filter((x) => /new King|ملك جديد/.test(x.title));
ok(n.length >= 1, "players are told about the new King", n.length);
// claim
ok((await post("/api/king/claim", {}, HC)).error === "king.no", "only the King can claim");
const c0 = (await sql("SELECT COALESCE(SUM(amount),0) AS n FROM nft_credits WHERE uid='uB' AND src='king'"))[0].n;
let r = await post("/api/king/claim", {}, HB);
ok(r.ok && r.coins === 10000 && r.state.kombat && r.state.kombat.coins >= 10000, "the King collects 10,000 coins", r.error);
ok((await post("/api/king/claim", {}, HB)).error === "king.done", "once a day");
// dethrone: carol must pass 50
await insertPay("p3", "uC", 20, 3000);
await insertPay("p4", "uC", 10, 4000); // 60 > 50
await insertPay("b1", "uD", 500, 5000); await exec("UPDATE payments SET status='box' WHERE id='b1'"); // paid from the box: does not count
await fetch(B + "/__test/king-refresh");
lb = await get("/api/leaderboard", HD);
ok(lb.king.username === "carol" && lb.king.paid === 60, "carol (60 Pi) passes bob and is the new King", lb.king);
ok(!(await get("/api/me", HB)).account.mult && (await get("/api/me", HC)).account.mult.f === 3, "bob loses x3, carol has it");
ok((await post("/api/king/claim", {}, HB)).error === "king.no", "bob can no longer claim");
ok((await post("/api/king/claim", {}, HC)).ok, "carol claims today's gift");
// tie: first to reach the total keeps the throne
await insertPay("p5", "uB", 10, 6000); // bob 60 too, but carol reached 60 first? carol's last payment at 4000, bob's at 6000
await fetch(B + "/__test/king-refresh");
lb = await get("/api/leaderboard", HD);
ok(lb.king.username === "carol", "tie: the one who got there first keeps the crown", lb.king);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
