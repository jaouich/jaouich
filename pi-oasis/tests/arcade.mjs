// Jerry Arcade and the business showcase. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const get = (p, h) => fetch(B + p, { headers: h }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const pay = (o) => fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify(o) });
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const H = async (tok) => ({ Authorization: "Bearer " + (await post("/api/auth", { accessToken: tok })).session });
const HA = await H("tokA"), HB = await H("tokB"), HC = await H("tokC"); // alice = owner

// ---- arcade
const d0 = (await get("/api/me", HB)).state.dates;
let r = await post("/api/arcade/claim", { game: "memory", score: 10, ms: 30000 }, HB);
ok(r.ok && r.reward === 180 && r.state.dates === d0 + 180, "memory in 10 moves → 180 dates");
ok(r.state.week.score === 0, "arcade dates don't count in the weekly ranking");
ok((await post("/api/arcade/claim", { game: "memory", score: 10, ms: 1000 }, HB)).error === "ar.bad", "a memory game finished impossibly fast is refused");
ok((await post("/api/arcade/claim", { game: "memory", score: 3, ms: 30000 }, HB)).error === "ar.bad", "fewer moves than pairs is impossible");
r = await post("/api/arcade/claim", { game: "catcher", score: 60, ms: 30000 }, HB);
ok(r.ok && r.reward === 180, "catcher score 60 → 180 dates");
ok((await post("/api/arcade/claim", { game: "catcher", score: 999, ms: 30000 }, HB)).error === "ar.bad", "impossible catcher score refused");
ok((await post("/api/arcade/claim", { game: "catcher", score: 50, ms: 5000 }, HB)).error === "ar.bad", "a catcher game shorter than 30 s is refused");
for (let i = 0; i < 4; i++) await post("/api/arcade/claim", { game: "memory", score: 12, ms: 20000 }, HB);
ok((await post("/api/arcade/claim", { game: "memory", score: 9, ms: 20000 }, HB)).error === "ar.limit", "5 rewarded games per game a day");
await post("/api/arcade/claim", { game: "memory", score: 14, ms: 20000 }, HC);
let a = await get("/api/arcade", HB);
ok(a.plays.memory === 5 && a.best.memory === 10 && a.top.memory[0].username === "bob" && a.top.memory[0].best === 10, "best of the day = fewest moves; today's top list");
ok(a.top.catcher[0].best === 60, "catcher top = highest score");

// ---- showcase
ok((await post("/api/sponsors/draft", { name: "X", descr: "short", plan: "d7" }, HB)).error === "sp.short", "name and description are required");
ok((await post("/api/sponsors/draft", { name: "Lucky Bet", descr: "Best casino odds in town, pay in Pi", plan: "d7" }, HB)).error === "sp.rules", "gambling listings are refused");
ok((await post("/api/sponsors/draft", { name: "Shop", descr: "We sell spices and accept Pi", link: "http://x.com", plan: "d7" }, HB)).error === "sp.link", "links must be https:// or pi://");
let dr = await post("/api/sponsors/draft", { name: "Spice House", descr: "Moroccan spices in Fes, we accept Pi", link: "https://spice.example", emoji: "🌶️", cat: "shop", plan: "d7" }, HB);
ok(dr.ok && dr.plan.price === 5, "draft created for 7 days / 5 Pi");
ok((await get("/api/sponsors", HC)).live.length === 0, "nothing shown before payment and review");
await pay({ id: "sp1", uid: "uB", amount: 1, type: "sponsor", ad: dr.id, plan: "d7", txid: "y1" });
ok((await post("/api/payments/approve", { paymentId: "sp1" }, HB)).s === 400, "wrong price refused");
await pay({ id: "sp2", uid: "uB", amount: 5, type: "sponsor", ad: dr.id, plan: "d7", txid: "y2" });
ok((await post("/api/payments/approve", { paymentId: "sp2" }, HB)).ok, "payment approved");
await post("/api/payments/complete", { paymentId: "sp2", txid: "y2" }, HB);
let me = await get("/api/sponsors", HB);
ok(me.mine[0].status === "review" && me.live.length === 0, "paid → under review, not shown yet");
ok((await post("/api/admin/sponsors", { action: "list" }, HB)).s === 403, "only the owner reviews");
let adm = await post("/api/admin/sponsors", { action: "list" }, HA);
ok(adm.list.length === 1 && adm.list[0].status === "review" && adm.list[0].username === "bob", "owner sees the listing to review");
await post("/api/admin/sponsors", { action: "approve", id: dr.id }, HA);
let pub = await get("/api/sponsors", HC);
ok(pub.live.length === 1 && pub.live[0].name === "Spice House" && pub.live[0].ends_at - Date.now() > 6.9 * 86400000, "approved: shown for 7 days");
await post("/api/sponsors/click", { id: dr.id }, HC);
me = await get("/api/sponsors", HB);
ok(me.mine[0].views >= 2 && me.mine[0].clicks === 1, "views and clicks counted for the business");
// rejected → refund
const dr2 = await post("/api/sponsors/draft", { name: "Tea Corner", descr: "Mint tea and pastries, Pi accepted", cat: "food", plan: "d1" }, HC);
await pay({ id: "sp3", uid: "uC", amount: 1, type: "sponsor", ad: dr2.id, plan: "d1", txid: "y3" });
await post("/api/payments/approve", { paymentId: "sp3" }, HC);
await post("/api/payments/complete", { paymentId: "sp3", txid: "y3" }, HC);
await post("/api/admin/sponsors", { action: "reject", id: dr2.id, note: "Please add your city" }, HA);
const ref = await sql(`SELECT amount, status FROM payouts WHERE kind = 'refund' AND ref = 'sp${dr2.id}'`);
ok(ref.length === 1 && ref[0].amount === 1 && ref[0].status === "completed", "refused listing: the 1 Pi is sent back");
me = await get("/api/sponsors", HC);
ok(me.mine[0].status === "rejected" && me.mine[0].note === "Please add your city", "the business sees why it was refused");
await post("/api/admin/sponsors", { action: "stop", id: dr.id }, HA);
ok((await get("/api/sponsors", HC)).live.length === 0, "owner can stop a live listing");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
