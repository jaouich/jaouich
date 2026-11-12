// Membership tiers, Partner grants and fair scoring. Start tests/harness.mjs first (fresh).
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text()).then((x) => { try { return JSON.parse(x); } catch { return x; } });
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m, extra) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra))); c ? pass++ : fail++; };
const DAY = 86400000, days = (ms) => Math.round((ms - Date.now()) / DAY);

const A = (await post("/api/auth", { accessToken: "tokA" })).session; // alice = admin
const Bo = (await post("/api/auth", { accessToken: "tokB" })).session;
const Ca = (await post("/api/auth", { accessToken: "tokC" })).session;
let n = 0;
async function buy(tok, uid, tier, amount) {
  const id = "m" + ++n;
  await post("/__test/pay", { id, uid, amount, tier });
  const a = await post("/api/payments/approve", { paymentId: id }, tok);
  if (a.error) return a;
  await post("/__test/pay", { id, uid, amount, tier, txid: "tx" + id });
  return post("/api/payments/complete", { paymentId: id, txid: "tx" + id }, tok);
}

// --- Paid tiers ---
let r = await buy(Bo, "uB", "gold", 0.25);
ok(r.error === "badPayment", "gold at the bronze price is refused", r);
r = await buy(Bo, "uB", "gold", 1);
ok(r.account && r.account.tierId === "gold" && days(r.account.vipUntil) === 30, "gold: 1 Pi = 30 days", r.account);
r = await buy(Bo, "uB", "bronze", 0.25);
ok(r.error === "lowerTier", "can't buy a lower tier while gold is active", r);
r = await buy(Bo, "uB", "gold", 1);
ok(days(r.account.vipUntil) === 60, "same tier again adds 30 days", days(r.account.vipUntil));
r = await buy(Ca, "uC", "bronze", 0.25);
ok(r.account.tierId === "bronze", "bronze bought");
r = await buy(Ca, "uC", "silver", 0.5);
ok(r.account.tierId === "silver" && days(r.account.vipUntil) === 45, "upgrade converts remaining bronze days (30 + 30×0.25/0.5 = 45)", days(r.account.vipUntil));
r = await buy(Ca, "uC", "platinum", 2);
ok(r.error === "badPayment", "unknown tier refused");
const lbPool = (await get("/api/leaderboard")).prizePool;
ok(Math.abs(lbPool - (1 + 1 + 0.25 + 0.5) * 0.7 * 0.15) < 1e-6, "prize pool = 15% of 70% of each payment", lbPool);

// --- Partner (granted by the owner) ---
r = await post("/api/admin/partners", { action: "grant", username: "carol" }, Bo);
ok(r.error === "forbidden", "a normal player can't grant Partner", r);
r = await post("/api/admin/partners", { action: "grant", username: "bad name!" }, A);
ok(r.error === "badUsername", "invalid username refused");
r = await post("/api/admin/partners", { action: "grant", username: "CAROL" }, A);
ok(r.partners && r.partners.some((p) => p.username === "CAROL" && p.joined), "owner grants Partner (any letter case)", r);
r = await post("/api/admin/partners", { action: "grant", username: "future_partner" }, A);
ok(r.partners.some((p) => p.username === "future_partner" && !p.joined), "can grant before the partner joins");
let me = await get("/api/me", Ca);
ok(me.account.tierId === "partner" && me.account.tier === 4, "carol is now Partner", me.account);
ok(me.state.animals.filter((a) => a.rarity === 3).length === 1, "welcome gift: one legendary camel");
me = await get("/api/me", Ca);
ok(me.state.animals.filter((a) => a.rarity === 3).length === 1, "gift is given only once");

// --- Fair scoring: bonuses add dates, not ranking score ---
const d0 = me.state.dates, s0 = me.state.week.score;
r = await post("/api/action", { action: { type: "daily" } }, Ca);
ok(r.state.dates - d0 === 250 && r.state.week.score - s0 === 25, "partner daily: +250 dates but only +25 score", [r.state.dates - d0, r.state.week.score - s0]);
r = await post("/api/action", { action: { type: "stake", opt: "h1", amount: 100 } }, Ca);
const st = r.state.stakes[0];
ok(st.profit === 7 && st.base === 5, "partner stake +50%: profit 7, of which 5 counts for score", st);
const free = await post("/api/action", { action: { type: "daily" } }, A);
ok(free.state.week.score === 25 && free.state.dates === 75, "free player daily: +25 dates, +25 score");
let lb = await get("/api/leaderboard");
ok(lb.top.find((x) => x.username === "carol").tier === "partner" && lb.top.find((x) => x.username === "alice").tier === "free", "ranking shows membership badges", lb.top);

// --- Remove Partner ---
r = await post("/api/admin/partners", { action: "revoke", username: "carol" }, A);
ok(!r.partners.some((p) => p.username.toLowerCase() === "carol"), "owner removes Partner");
me = await get("/api/me", Ca);
ok(me.account.tierId === "silver", "carol is back to her paid Silver", me.account.tierId);
ok(me.account.isAdmin === false && (await get("/api/me", A)).account.isAdmin === true, "only the owner is admin");

console.log(`== ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
