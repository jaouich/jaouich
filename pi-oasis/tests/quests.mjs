// Tasks center. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC");
const me = (h) => get("/api/me", h);
const find = async (h, title) => (await get("/api/quests", h)).list.find((x) => x.title === title);

ok((await post("/api/admin/quests", { action: "starter" }, HB)).s === 403, "only the owner manages tasks");
let r = await post("/api/admin/quests", { action: "starter" }, HA);
ok(r.list.length === 8, "8 ready-made tasks added");
r = await post("/api/admin/quests", { action: "starter" }, HA);
ok(r.list.length === 8, "ready-made tasks are not added twice");
let l = (await get("/api/quests", HB)).list;
ok(l.length === 8 && l.every((x) => !x.done && x.secret === undefined), "player sees the tasks, none done");

// check-in
const ci = await find(HB, "@q.s.checkin");
let d0 = (await me(HB)).state.dates;
r = await post("/api/quests/claim", { id: ci.id }, HB);
ok(r.ok && r.state.dates === d0 + 50, "daily check-in: +50 dates");
ok((await post("/api/quests/claim", { id: ci.id }, HB)).error === "q.done", "can't claim twice the same day");
await exec(`UPDATE quest_done SET pkey = pkey - 1 WHERE quest_id = ${ci.id}`);
ok((await post("/api/quests/claim", { id: ci.id }, HB)).ok, "daily task renews the next day");

// ads: counted by the game
const ad = await find(HB, "@q.s.ads");
ok(ad.need === 3 && ad.progress === 0, "ads task shows 0/3");
ok((await post("/api/quests/claim", { id: ad.id }, HB)).error === "q.notYet", "ads task refused before 3 ads");
const now = Date.now();
await exec(`INSERT INTO ads (id, uid, created_at) VALUES ('qa1','uB',${now}),('qa2','uB',${now}),('qa3','uB',${now}),('qold','uB',${now - 3 * 86400000})`);
ok((await find(HB, "@q.s.ads")).progress === 3, "today's ads counted (old ad not)");
r = await post("/api/quests/claim", { id: ad.id }, HB);
ok(r.ok && r.amount === 150, "ads task claimed");

// arcade, weekly
const wa = await find(HB, "@q.s.weekArcade");
await exec(`INSERT INTO arcade (uid, day, game, plays) VALUES ('uB', ${Math.floor(now / 86400000)}, 'memory', 10)`);
r = await post("/api/quests/claim", { id: wa.id }, HB);
ok(r.ok && r.kind === "coins", "weekly arcade task gives Kombat coins");

// invite (once)
const inv = await find(HC, "@q.s.invite1");
ok((await post("/api/quests/claim", { id: inv.id }, HC)).error === "q.notYet", "invite task needs a friend");
await exec(`UPDATE users SET referrer = 'uC' WHERE uid = 'uB'`);
ok((await post("/api/quests/claim", { id: inv.id }, HC)).ok, "invite task done after a friend joined");
await exec(`UPDATE quest_done SET at = 0 WHERE quest_id = ${inv.id}`);
ok((await post("/api/quests/claim", { id: inv.id }, HC)).error === "q.done", "one-time task stays done");

// spin: only daily
ok((await post("/api/admin/quests", { action: "create", title: "Spin", kind: "spin", period: "weekly", reward_kind: "dates", reward: 10 }, HA)).error === "q.spinDaily", "wheel task must be daily");

// link task
ok((await post("/api/admin/quests", { action: "create", title: "Telegram", kind: "link", period: "once", link: "javascript:alert(1)", reward_kind: "dates", reward: 200 }, HA)).error === "q.badLink", "bad link refused");
r = await post("/api/admin/quests", { action: "create", title: "Telegram", emoji: "✈️", kind: "link", period: "once", link: "https://t.me/jerrydev", reward_kind: "dates", reward: 200 }, HA);
const lk = r.list.find((x) => x.title === "Telegram");
ok(lk && lk.link === "https://t.me/jerrydev", "owner adds a link task");
ok((await post("/api/quests/claim", { id: lk.id }, HB)).error === "q.openFirst", "must open the link first");
await post("/api/quests/open", { id: lk.id }, HB);
r = await post("/api/quests/claim", { id: lk.id }, HB);
ok(r.error === "q.wait" && r.vars.s > 0, "must wait 15 s after opening");
await exec(`UPDATE quest_open SET at = at - 16000 WHERE quest_id = ${lk.id}`);
d0 = (await me(HB)).state.dates;
r = await post("/api/quests/claim", { id: lk.id }, HB);
ok(r.ok && r.state.dates === d0 + 200, "link task claimed after the wait");

// secret word, weekly, JRY reward
r = await post("/api/admin/quests", { action: "create", title: "Fireside post", kind: "secret", period: "weekly", secret: "Oasis Dates", reward_kind: "jry", reward: 20 }, HA);
const sc = r.list.find((x) => x.title === "Fireside post");
ok(sc.secret === "Oasis Dates", "owner sees the secret word");
ok(!("secret" in (await find(HB, "Fireside post"))), "players never get the secret word");
ok((await post("/api/quests/claim", { id: sc.id, answer: "dates" }, HB)).error === "q.wrong", "wrong word refused");
const j0 = (await me(HB)).account.jryPts;
r = await post("/api/quests/claim", { id: sc.id, answer: "  oasis   DATES " }, HB);
ok(r.ok && r.account.jryPts === j0 + 20, "secret word (any case/spaces): +20 JRY");

// pause / end / delete
await post("/api/admin/quests", { action: "toggle", id: sc.id }, HA);
ok(!(await find(HC, "Fireside post")), "paused task is hidden");
ok((await post("/api/quests/claim", { id: sc.id, answer: "oasis dates" }, HC)).error === "q.gone", "paused task can't be claimed");
r = await post("/api/admin/quests", { action: "create", title: "Old", kind: "checkin", period: "daily", reward_kind: "dates", reward: 5, days: 1 }, HA);
await exec(`UPDATE quests SET ends_at = 1 WHERE title = 'Old'`);
ok(!(await find(HB, "Old")), "ended task is hidden");
r = await post("/api/admin/quests", { action: "delete", id: lk.id }, HA);
ok(!r.list.some((x) => x.id === lk.id), "owner deletes a task");
ok((await post("/api/admin/quests", { action: "create", title: "x", kind: "checkin", period: "daily", reward_kind: "dates", reward: 5e9 }, HA)).error === "badAction", "too big reward refused");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
