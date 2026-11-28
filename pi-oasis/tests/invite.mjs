// Invitations: welcome gift for the invited player, reward for the inviter once the friend has played on 2 days (capped, not on the same network). Fresh harness.
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.json());
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
const sql = (q) => post("/__test/sql", q);
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m, x) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || x === undefined ? "" : " -> " + JSON.stringify(x))); c ? pass++ : fail++; };
const A = (await post("/api/auth", { accessToken: "tokA" })).session;
const uA = (await sql("SELECT uid FROM users WHERE username='alice'"))[0].uid;
const dates = async (u) => Number((await sql(`SELECT json_extract(json,'$.dates') AS d FROM state WHERE uid='${u}'`))[0].d);
const jry = async (u) => Number((await sql(`SELECT COALESCE(jry_pts,0) AS j FROM users WHERE uid='${u}'`))[0].j);
const spins = async (u) => Number((await sql(`SELECT COALESCE(wheel_spins,0) AS s FROM users WHERE uid='${u}'`))[0].s);
// a player who joins without an invitation gets no welcome gift
const plain = await post("/api/auth", { accessToken: "tokF" });
const uF = (await sql("SELECT uid FROM users WHERE username='fatima'"))[0].uid;
const baseDates = await dates(uF);
// bob joins through alice's link
const b = await post("/api/auth", { accessToken: "tokB", ref: "alice" });
const uB = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;
ok((await sql(`SELECT referrer FROM users WHERE uid='${uB}'`))[0].referrer === uA, "bob is invited by alice");
ok((await dates(uB)) - baseDates === 2000 && (await spins(uB)) === 1 && (await spins(uF)) === 0, "the invited player gets 2,000 dates and a spin; a plain sign-up gets neither", [await dates(uB), baseDates]);
const a0 = await dates(uA), j0 = await jry(uA);
await get("/api/me", b.session);
ok((await dates(uA)) === a0, "no reward for the inviter after one day");
const today = Math.floor(Date.now() / 86400000);
await exec(`INSERT OR IGNORE INTO activity VALUES ('${uB}', ${today - 1})`);
await exec(`UPDATE users SET net = 'n-bob' WHERE uid='${uB}'; UPDATE users SET net = 'n-alice' WHERE uid='${uA}'`);
await get("/api/me", b.session);
ok((await dates(uA)) - a0 === 3000 && (await jry(uA)) - j0 === 5, "the inviter gets 3,000 dates and 5 JRY points once the friend played on 2 days", [await dates(uA) - a0, await jry(uA) - j0]);
await get("/api/me", b.session); await get("/api/me", b.session);
ok((await dates(uA)) - a0 === 3000, "paid only once per invited player");
ok((await sql(`SELECT COUNT(*) AS n FROM ref_rewards WHERE inviter='${uA}' AND paid=1`))[0].n === 1, "one reward row");
// same network: no reward
const c = await post("/api/auth", { accessToken: "tokC", ref: "alice" });
const uC = (await sql("SELECT uid FROM users WHERE username='carol'"))[0].uid;
await exec(`INSERT OR IGNORE INTO activity VALUES ('${uC}', ${today - 1}); UPDATE users SET net = 'n-alice' WHERE uid='${uC}'`);
const a1 = await dates(uA);
await get("/api/me", c.session);
ok((await dates(uA)) === a1 && (await sql(`SELECT paid FROM ref_rewards WHERE invitee='${uC}'`))[0].paid === 0, "no reward when both accounts share the same network");
// daily cap
await exec(`INSERT INTO ref_rewards (invitee, inviter, at, paid) VALUES ('x1','${uA}',${Date.now()},1),('x2','${uA}',${Date.now()},1),('x3','${uA}',${Date.now()},1),('x4','${uA}',${Date.now()},1)`);
const d = await post("/api/auth", { accessToken: "tokD", ref: "alice" });
const uD = (await sql("SELECT uid FROM users WHERE username='dina'"))[0].uid;
await exec(`INSERT OR IGNORE INTO activity VALUES ('${uD}', ${today - 1}); UPDATE users SET net = 'n-dina' WHERE uid='${uD}'`);
const a2 = await dates(uA);
await get("/api/me", d.session);
ok((await dates(uA)) === a2 && (await sql(`SELECT paid FROM ref_rewards WHERE invitee='${uD}'`))[0].paid === 0, "at most 5 paid rewards per inviter per day");
console.log(`== ${pass} passed, ${fail} failed`);
