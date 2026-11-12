// Testnet A2U gifts (owner only). Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
const chain = () => fetch(B + "/__test/chain").then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };

const A = (await post("/api/auth", { accessToken: "tokA" })).session; // alice = owner
const Bo = (await post("/api/auth", { accessToken: "tokB" })).session;
await post("/api/auth", { accessToken: "tokC" });
const H = (s) => ({ Authorization: "Bearer " + s });

const meA = await fetch(B + "/api/me", { headers: H(A) }).then((r) => r.json());
const meB = await fetch(B + "/api/me", { headers: H(Bo) }).then((r) => r.json());
ok(meA.account.testGifts === true, "owner sees the Testnet gifts tool");
ok(!meB.account.testGifts, "other players don't");
ok((await post("/api/admin/test-gifts", { action: "send" }, H(Bo))).s === 403, "non-owner cannot send gifts");

const before = (await chain()).txs.length;
const r = await post("/api/admin/test-gifts", { action: "send" }, H(A));
const c = await chain();
const sent = c.txs.slice(before);
ok(sent.length === 3, "one 0.01 Pi gift per player (3 players)");
ok(sent.every((t) => String(t.amount) === "100000"), "each gift is 0.01 Pi");
ok(new Set(sent.map((t) => t.to)).size === 3, "3 different wallets");
ok(r.paid === 3 && r.players === 3, "report: paid 3, players 3");

const again = await post("/api/admin/test-gifts", { action: "send" }, H(A));
ok((await chain()).txs.length === before + 3, "pressing again never pays the same player twice");
ok(again.paid === 3, "report still 3");

await fetch(B + "/__test/gifts?off");
ok((await post("/api/admin/test-gifts", { action: "send" }, H(A))).s === 403, "disabled when TESTNET_GIFTS is not set (Mainnet)");
const meA2 = await fetch(B + "/api/me", { headers: H(A) }).then((r) => r.json());
ok(!meA2.account.testGifts, "tool hidden on Mainnet");
await fetch(B + "/__test/gifts?on");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
