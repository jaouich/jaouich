// test JRY token on the tiny test ledger. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) }).then((r) => r.text().then((t) => { try { return { s: r.status, ...JSON.parse(t) }; } catch { return { s: r.status, t }; } }));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const sql = (q) => post("/__test/sql", q).then((r) => { const { s, ...rest } = r; return Object.values(rest); });
const exec = (q) => post("/__test/exec", q);

const A = (await post("/api/auth", { accessToken: "tokA" })).session; // alice = owner
const Bo = (await post("/api/auth", { accessToken: "tokB" })).session;
const HA = { Authorization: "Bearer " + A }, HB = { Authorization: "Bearer " + Bo };

ok((await fetch(B + "/.well-known/pi.toml")).status === 404, "no pi.toml before the token exists");
ok((await post("/api/admin/token", { action: "status" }, HB)).s === 403, "token tools are owner-only");
let st = await post("/api/admin/token", { action: "status" }, HA);
ok(st.code === "testJRY" && /^G[A-Z0-9]{55}$/.test(st.issuer) && !st.issuerActive && !st.distTrust && !st.minted && st.home === "", "status creates an issuer key; nothing on chain yet");
const toml = await fetch(B + "/.well-known/pi.toml");
const tt = await toml.text();
ok(toml.headers.get("content-type").startsWith("text/plain") && tt.includes('code="testJRY"') && tt.includes(`issuer="${st.issuer}"`) && tt.includes("image=\"https://pi-oasis.jaouich.workers.dev/jry.png\""), "pi.toml served as text with code, issuer, name, desc and image");
const issuer = st.issuer;
st = await post("/api/admin/token", { action: "setup" }, HA);
ok(st.done && st.done.length === 4 && st.issuerActive, "one button: issuer wallet, trustline, mint, home domain (" + (st.done || []).join(", ") + ")");
ok(st.issuer === issuer, "the same issuer is kept");
ok(st.distTrust && st.minted && Number(st.supply) === 10000000000 && st.distBalance === "10000000000.0000000", "app wallet holds 10,000,000,000 test JRY");
ok(st.home === "pi-oasis.jaouich.workers.dev", "issuer home domain points to our pi.toml");
st = await post("/api/admin/token", { action: "setup" }, HA);
ok(st.done.length === 0, "setup again: nothing to do (never mints twice)");

// player saves a wallet
ok((await post("/api/kombat/wallet", { address: "hello" }, HB)).error === "k.badWallet", "a wrong address is refused");
const W = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
let w = await post("/api/kombat/wallet", { address: W.toLowerCase() }, HB);
ok(w.account && w.account.jryWallet === W && w.trust === false, "address saved (upper-cased); no trustline yet");
ok((await post("/api/admin/token", { action: "send", to: W, amount: "5" }, HA)).error === "k.noTrust", "can't send before the wallet adds test JRY");
await fetch(B + "/__test/trust?g=" + W + "&issuer=" + issuer);
w = await post("/api/kombat/wallet", { address: W }, HB);
ok(w.trust === true, "after adding the token in Pi Wallet: ready");
// trial airdrop only to eligible players
const uidB = (await sql("SELECT uid FROM users WHERE username='bob'"))[0].uid;
await post("/api/action", { action: { type: "kSync" } }, HB);
let r = await post("/api/admin/token", { action: "airdrop", amount: "100" }, HA);
ok(r.report.length === 0, "bob played less than 7 days: not sent");
await exec(`UPDATE state SET json = json_set(json, '$.kombat.act', json('{"day":1,"days":8}')) WHERE uid='${uidB}'`);
r = await post("/api/admin/token", { action: "airdrop", amount: "100" }, HA);
ok(r.report.length === 1 && r.report[0].ok && r.sent === 1, "eligible bob receives 100 test JRY");
w = await post("/api/kombat/wallet", { address: W }, HB);
ok(w.balance === "100.0000000", "bob's wallet balance: 100 test JRY");
r = await post("/api/admin/token", { action: "airdrop", amount: "100" }, HA);
ok(r.report.length === 0, "never sent twice to the same player");
st = await post("/api/admin/token", { action: "status" }, HA);
ok(st.distBalance === "9999999900.0000000" && st.holders === 2, "app wallet: 9,999,999,900 left; 2 wallets hold the token");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
