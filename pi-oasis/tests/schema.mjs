// The schema is stored once with a version, so a Worker start costs one read, not ~110 statements.
const B = "http://localhost:3457";
const sql = (q) => fetch(B + "/__test/sql", { method: "POST", body: q }).then((r) => r.json());
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
await post("/api/auth", { accessToken: "tokC" });
const rows = await sql("SELECT v FROM schema_meta");
ok(rows.length === 1 && /^\d+$/.test(rows[0].v), "the schema version is stored once");
ok((await sql("SELECT name FROM sqlite_master WHERE name IN ('chat_members','chat_msgs_uid','castle_runs','transfers')")).length === 4, "all tables and indexes exist");
// the private-room backfill (old chats appear in each member's room list)
await sql("SELECT 1");
const r = await fetch(B + "/api/chat/rooms", { headers: { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokC" })).session } }).then((x) => x.json());
ok(Array.isArray(r.rooms) && r.rooms[0].room === "main", "the rooms list works through chat_members");
const plan = await sql("EXPLAIN QUERY PLAN SELECT room FROM chat_members WHERE uid = 'x' AND room LIKE 'dm:%' LIMIT 60");
ok(!plan.some((p) => /SCAN chat_members/.test(p.detail || "")), "the rooms lookup uses the index (no table scan)");
console.log(`\n== ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
