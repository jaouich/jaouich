// Mainnet purchases stay closed until PAYMENTS_LIVE = "1". Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokB" })).session };
const me = () => fetch(B + "/api/me", { headers: H }).then((r) => r.json());
ok((await me()).account.payOpen === true, "Testnet: purchases open");
await fetch(B + "/__test/gifts?off"); // behaves like Mainnet
ok((await me()).account.payOpen === false, "Mainnet without PAYMENTS_LIVE: purchases closed");
await fetch(B + "/__test/pay", { method: "POST", body: JSON.stringify({ id: "pc1", uid: "uB", amount: 1, type: "dates", pack: "d5k", txid: "z1" }) });
ok((await post("/api/payments/approve", { paymentId: "pc1" }, H)).error === "payClosed", "server refuses to approve a payment while closed");
await fetch(B + "/__test/gifts?on");
ok((await post("/api/payments/approve", { paymentId: "pc1" }, H)).ok === true, "open again: the payment is approved");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
