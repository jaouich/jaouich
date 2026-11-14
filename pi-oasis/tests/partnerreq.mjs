// Partner requests from the community. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const HA = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokA" })).session }; // owner
const HB = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokB" })).session };
const HC = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokC" })).session };
let r = await post("/api/partner/request", { note: "Jerry Development group, Casablanca" }, HB);
ok(r.account && r.account.partnerReq === "pending", "bob requests Partner: pending");
ok((await post("/api/partner/request", {}, HB)).error === "k.reqPending", "no double request while pending");
await post("/api/partner/request", {}, HC);
ok((await post("/api/admin/partner-requests", { action: "list" }, HB)).s === 403, "only the owner sees requests");
let l = await post("/api/admin/partner-requests", { action: "list" }, HA);
ok(l.requests.length === 2 && l.requests[0].username === "bob" && l.requests[0].note.includes("Casablanca"), "owner sees 2 requests with the note");
const uB = l.requests[0].uid, uC = l.requests[1].uid;
l = await post("/api/admin/partner-requests", { action: "approve", uid: uB }, HA);
ok(l.requests.length === 1, "approved request leaves the list");
let me = await fetch(B + "/api/me", { headers: HB }).then((x) => x.json());
ok(me.account.tierId === "partner" && me.account.partnerReq === "approved", "bob is now a Partner 💎");
ok((await post("/api/partner/request", {}, HB)).error === "k.alreadyPartner", "a Partner can't request again");
await post("/api/admin/partner-requests", { action: "reject", uid: uC }, HA);
me = await fetch(B + "/api/me", { headers: HC }).then((x) => x.json());
ok(me.account.partnerReq === "rejected" && me.account.tierId !== "partner", "carol rejected: no Partner");
r = await post("/api/partner/request", { note: "again" }, HC);
ok(r.account.partnerReq === "pending", "after a rejection carol can ask again");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
