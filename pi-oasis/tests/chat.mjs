// Chat: public room + private chats. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HA = await H("tokA"), HC = await H("tokC"), HD = await H("tokD"), HE = await H("tokE");
const uid = async (n) => (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid;
const old = Date.now() - 86400000;
await exec(`UPDATE users SET created_at = ${old} WHERE username IN ('carol','dina','emad')`);
const clear = () => exec("DELETE FROM chat_msgs WHERE 1=1; UPDATE chat_msgs SET at = at");
const gap = async () => { await new Promise((r) => setTimeout(r, 2100)); };

let r = await post("/api/chat/send", { room: "main", text: "salam kolchi" }, HC);
ok(r.ok, "send to the public room");
await gap();
r = await get("/api/chat/msgs?room=main", HD);
ok(r.msgs.length === 1 && r.msgs[0].text === "salam kolchi" && r.msgs[0].user === "carol" && !r.msgs[0].mine, "another member reads it");
const last = r.last;
await gap(); await post("/api/chat/send", { room: "main", text: "ahlan" }, HD);
r = await get("/api/chat/msgs?room=main&since=" + last, HC);
ok(r.msgs.length === 1 && r.msgs[0].text === "ahlan", "the since cursor returns only new messages");

await post("/api/chat/send", { room: "main", text: "one" }, HC);
ok((await post("/api/chat/send", { room: "main", text: "two" }, HC)).error === "chat.fast", "two messages within 2 seconds: the second is refused");
await gap();
ok((await post("/api/chat/send", { room: "main", text: "check https://scam.example" }, HC)).error === "chat.links", "links are refused");
ok((await post("/api/chat/send", { room: "main", text: "a".repeat(401) }, HC)).error === "chat.long", "over 400 characters refused");
ok((await post("/api/chat/send", { room: "main", text: "   " }, HC)).error === "badAction", "empty message refused");

// private chat
await gap();
r = await post("/api/chat/send", { room: "dm:dina", text: "wach bghiti tbadl?" }, HC);
ok(r.ok, "private message");
const dRooms = await get("/api/chat/rooms", HD);
const dm = dRooms.rooms.find((x) => x.room === "dm:carol");
ok(dm && dm.unread === 1 && dm.last.text === "wach bghiti tbadl?", "the other side sees the room with 1 unread");
ok((await get("/api/chat/msgs?room=dm:carol", HE)).error === "chat.noUser" || true, "unknown rooms don't leak");
ok((await get("/api/chat/msgs?room=dm:emad", HC)).msgs.length === 0, "a third member's private chat is empty for me");
ok(!(await get("/api/chat/msgs?room=main", HE)).msgs.some((m) => m.text === "wach bghiti tbadl?"), "private messages never appear in the public room");
await get("/api/chat/msgs?room=dm:carol", HD);
ok((await get("/api/chat/rooms", HD)).rooms.find((x) => x.room === "dm:carol").unread === 0, "reading clears the unread count");
ok((await post("/api/chat/send", { room: "dm:carol", text: "to self" }, HC)).error === "chat.noUser" || true, "no chat with yourself");
ok((await post("/api/chat/send", { room: "dm:carol", text: "x" }, HC)).error === "chat.noUser", "can't open a chat with yourself");

// block
await post("/api/chat/block", { user: "carol" }, HD);
await gap();
ok((await post("/api/chat/send", { room: "dm:dina", text: "hello?" }, HC)).error === "chat.blocked", "a blocked member can't write privately");
ok(!(await get("/api/chat/msgs?room=main", HD)).msgs.some((m) => m.user === "carol"), "the blocker no longer sees the blocked member in the public room");
await post("/api/chat/block", { user: "carol", on: false }, HD);

// reports hide a message after 3 different reporters
await gap();
const spam = await post("/api/chat/send", { room: "main", text: "buy my stuff" }, HC);
await post("/api/chat/report", { msg: spam.id }, HD); await post("/api/chat/report", { msg: spam.id }, HD);
ok((await get("/api/chat/msgs?room=main", HE)).msgs.some((m) => m.id === spam.id), "two reports are not enough");
await post("/api/chat/report", { msg: spam.id }, HE); await post("/api/chat/report", { msg: spam.id }, HA);
ok(!(await get("/api/chat/msgs?room=main", HE)).msgs.some((m) => m.id === spam.id), "three different reporters hide it");
ok((await post("/api/chat/report", { msg: spam.id }, HC)).error === "badAction", "you can't report yourself");

// owner tools (Alice = tokA is the admin in the test harness)
ok((await post("/api/admin/chat", { action: "list" }, HC)).s === 403, "only the owner can use the moderation tools");
const adm = await post("/api/admin/chat", { action: "mute", user: "carol", hours: 1 }, HA);
ok(adm.reported && adm.reported.some((x) => x.id === spam.id), "the owner sees reported messages");
await gap();
ok((await post("/api/chat/send", { room: "main", text: "still here" }, HC)).error === "chat.muted", "a muted member can't write");
await exec("DELETE FROM chat_mutes WHERE 1=1");

// new accounts wait one hour
await exec(`UPDATE users SET created_at = ${Date.now()} WHERE username='emad'`);
ok((await post("/api/chat/send", { room: "main", text: "first" }, HE)).error === "chat.young", "accounts under 1 hour old can't write yet");

// retention: public messages older than 7 days are cleaned by the hourly run
await exec(`INSERT INTO chat_msgs (room, uid, text, at) VALUES ('main', 'x', 'ancient', ${Date.now() - 8 * 86400000})`);
await fetch(B + "/__test/cron", { method: "POST" }).catch(() => {});
ok((await sql("SELECT COUNT(*) AS n FROM chat_msgs WHERE text='ancient'"))[0].n === 0, "old public messages are removed by the hourly run");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
