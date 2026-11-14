// Tribes. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const exec = (q) => post("/__test/exec", q);
const S = {};
for (const [k, tok] of [["a", "tokA"], ["b", "tokB"], ["c", "tokC"]]) { S[k] = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session }; await post("/api/action", { action: { type: "kSync" } }, S[k]); }
const uid = async (n) => (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid;
const uA = await uid("alice"), uB = await uid("bob"), uC = await uid("carol");
await exec(`UPDATE state SET json = json_set(json, '$.kombat.coins', 1000000)`);

ok((await post("/api/tribes/create", { name: "<b>", emoji: "🦊" }, S.a)).error === "k.tribeName", "bad tribe name refused");
let r = await post("/api/tribes/create", { name: "أسود الصحراء", emoji: "🦊" }, S.a);
ok(r.id && r.state.kombat.coins === 750000, "alice founds 'أسود الصحراء' for 250,000");
ok((await post("/api/tribes/create", { name: "أسود الصحراء", emoji: "🐪" }, S.b)).error === "k.tribeTaken", "same name refused");
ok((await post("/api/tribes/create", { name: "Other", emoji: "🐪" }, S.a)).error === "k.tribeAlready", "one tribe per player");
const t1 = r.id;
r = await post("/api/tribes/create", { name: "Night Foxes", emoji: "🌙" }, S.c);
const t2 = r.id;
ok((await post("/api/tribes/join", { id: t1 }, S.b)).ok, "bob joins alice's tribe");
let d = await fetch(B + "/api/tribes", { headers: S.b }).then((x) => x.json());
ok(d.mine && d.mine.id === t1 && d.mine.members === 2 && !d.mine.owner, "bob sees his tribe (2 members)");
// weekly score from members' coins this week
const wk = d.ends - 7 * 86400000;
await exec(`INSERT OR REPLACE INTO kombat_weeks VALUES (${wk}, '${uA}', 5000, 1), (${wk}, '${uB}', 7000, 1), (${wk}, '${uC}', 9000, 1)`);
d = await fetch(B + "/api/tribes", { headers: S.a }).then((x) => x.json());
ok(d.top[0].id === t1 && d.top[0].score === 12000 && d.top[1].score === 9000 && d.mine.rank === 1, "ranking: members add up (12,000 vs 9,000)");
// cap
await exec(`INSERT INTO tribe_members (uid, tribe_id, joined_at) SELECT 'x' || value, ${t2}, 1 FROM json_each('[${Array.from({ length: 29 }, (_, i) => i).join(",")}]')`);
await post("/api/tribes/leave", {}, S.b);
ok((await post("/api/tribes/join", { id: t2 }, S.b)).error === "k.tribeWait", "after leaving: wait 24 h");
await exec(`DELETE FROM tribe_left`);
ok((await post("/api/tribes/join", { id: t2 }, S.b)).error === "k.tribeFull", "a full tribe (30) refuses new members");
await exec(`DELETE FROM tribe_members WHERE uid LIKE 'x%'`);
// last week's prize: only members who joined before that week
const last = wk - 7 * 86400000;
await exec(`INSERT OR REPLACE INTO kombat_weeks VALUES (${last}, '${uA}', 100, 1), (${last}, '${uC}', 50, 1)`);
await exec(`UPDATE tribe_members SET joined_at = ${last - 1000} WHERE uid = '${uA}'`);
d = await fetch(B + "/api/tribes", { headers: S.a }).then((x) => x.json());
ok(d.prize && d.prize.place === 1 && d.prize.prize === 300000 && !d.prize.claimed, "alice's tribe was #1 last week: 300,000 waiting");
const c0 = (await fetch(B + "/api/me", { headers: S.a }).then((x) => x.json())).state.kombat.coins;
r = await post("/api/tribes/claim", {}, S.a);
ok(r.n === 300000 && r.state.kombat.coins === c0 + 300000, "alice collects 300,000");
ok((await post("/api/tribes/claim", {}, S.a)).error === "k.noTribePrize", "only once");
ok((await post("/api/tribes/claim", {}, S.c)).error === "k.noTribePrize", "carol joined during that week: no prize (no last-minute jumps)");
// founder leaves: next member takes over
await post("/api/tribes/join", { id: t1 }, S.b);
await post("/api/tribes/leave", {}, S.a);
const own = await sql(`SELECT owner FROM tribes WHERE id = ${t1}`);
ok(own[0].owner === uB, "founder leaves: bob becomes the tribe's leader");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
