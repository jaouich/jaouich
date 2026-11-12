// Two Pi apps (Developer Portal + App Studio) sharing one game server. Start tests/harness.mjs first (fresh).
const B = "http://localhost:3457";
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text()).then((x) => { try { return JSON.parse(x); } catch { return x; } });
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m, extra) => { console.log((c ? "PASS  " : "FAIL  ") + m + (c || extra === undefined ? "" : " -> " + JSON.stringify(extra))); c ? pass++ : fail++; };
let n = 0;
async function buy(tok, uid, tier, amount, studio) {
  const id = "s" + ++n;
  await post("/__test/pay", { id, uid, amount, tier, studio });
  const a = await post("/api/payments/approve", { paymentId: id }, tok);
  if (a.error) return a;
  await post("/__test/pay", { id, uid, amount, tier, studio, txid: "tx" + id });
  return post("/api/payments/complete", { paymentId: id, txid: "tx" + id }, tok);
}
const studioLogin = (await post("/api/auth", { accessToken: "tokB" })); // known to App Studio
const portalLogin = (await post("/api/auth", { accessToken: "tokC" })); // known only to the Developer Portal app
ok(studioLogin.via === "appstudio" && portalLogin.via === "portal", "sign-in says which Pi app the player is in");

// --- Before the App Studio key is configured ---
ok(studioLogin.canBuy === false, "App Studio player: can't buy yet (no key for that app)");
ok(portalLogin.canBuy === true, "official app player: can buy");
let r = await buy(studioLogin.session, "uB", "bronze", 0.25, true);
ok(r.error === "server", "a payment made in the App Studio app can't be approved without its key", r);
ok((await get("/api/status")).studioKeyConfigured === false, "status: studio key not configured");
r = await buy(portalLogin.session, "uC", "bronze", 0.25, false);
ok(r.account?.tierId === "bronze", "official app payments still work");

// --- After the key is added ---
await fetch(B + "/__test/studio?on");
ok((await post("/api/auth", { accessToken: "tokB" })).canBuy === true, "App Studio player can now buy (no redirect needed)");
ok((await get("/api/status")).studioKeyConfigured === true, "status: studio key configured");
r = await buy(studioLogin.session, "uB", "silver", 0.5, true);
ok(r.account?.tierId === "silver", "App Studio payment approved and completed with its own key", r);
const me = await get("/api/me", studioLogin.session);
ok(me.account.tierId === "silver" && me.account.vipUntil > Date.now(), "membership is granted to the player");
r = await buy(portalLogin.session, "uC", "silver", 0.5, false);
ok(r.account?.tierId === "silver", "official app payments keep working with both keys set");
r = await buy(studioLogin.session, "uB", "gold", 0.25, true);
ok(r.error === "badPayment", "wrong amount is still refused for an App Studio payment");
const pool = (await get("/api/leaderboard")).prizePool;
ok(Math.abs(pool - (0.25 + 0.5 + 0.5) * 0.7 * 0.15) < 1e-6, "prize pool counts payments from both apps", pool);
console.log(`== ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
