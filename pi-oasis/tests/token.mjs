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
// community market + holder perks
const mk = await fetch(B + "/api/jry/market").then((x) => x.json());
ok(mk.on && Math.abs(mk.price - 0.001) < 0.00001 && mk.poolPi === 1894.21 && mk.holders === 2, "market: price ≈ 0.001 Test-Pi, pool 1,894 Test-Pi, 2 holders");
let me = await fetch(B + "/api/me", { headers: HB }).then((x) => x.json());
ok(me.account.jryHeld === 100 && me.account.holdBoost === 0, "bob holds 100 testJRY: below 1,000, no perk yet");
await post("/api/admin/token", { action: "send", to: W, amount: "10000" }, HA);
w = await post("/api/kombat/wallet", { address: W }, HB);
me = await fetch(B + "/api/me", { headers: HB }).then((x) => x.json());
ok(me.account.jryHeld === 10100 && me.account.holdBoost === 0.25, "bob holds 10,100: 🥈 +25% profit/hour");
await exec(`UPDATE state SET json = json_set(json, '$.kombat.cards', json('{"well":5}'), '$.kombat.last', ${Date.now() - 3600e3}) WHERE uid='${uidB}'`);
const pphBase = Math.floor(((p, l) => Math.round((p * (Math.pow(1.12, l) - 1)) / 0.12))(10, 5));
const before = (await sql(`SELECT json FROM state WHERE uid='${uidB}'`))[0].json;
const c0 = JSON.parse(before).kombat.coins;
const r2 = await post("/api/action", { action: { type: "kSync" } }, HB);
const gained = r2.state.kombat.coins - c0;
ok(Math.abs(gained - Math.floor(pphBase * 1.25)) <= 1, `1 hour away: profit ${gained} = ${pphBase} × 1.25 (holder perk)`);
ok((await post("/api/action", { action: { type: "kTask", id: "member" } }, HB)).error === "k.taskNotYet", "holding testJRY doesn't count as a membership");

// community votes (holders count more) + top holders
ok((await post("/api/admin/polls", { action: "create", q: "Next boss?", options: ["Scorpion", "Djinn"] }, HB)).s === 403, "only the owner starts votes");
ok((await post("/api/admin/polls", { action: "create", q: "Only one", options: ["A"] }, HA)).error === "k.pollBad", "a vote needs at least 2 choices");
await post("/api/admin/polls", { action: "create", q: "Next boss?", options: ["Scorpion", "Djinn"], days: 3 }, HA);
let cm = await fetch(B + "/api/community", { headers: HB }).then((x) => x.json());
const pid = cm.polls[0].id;
ok(cm.polls.length === 1 && cm.myWeight === 3, "bob (🥈 10,100 testJRY) sees the vote; his vote counts ×3");
let v = await post("/api/community/vote", { id: pid, opt: 1 }, HB);
ok(v.weight === 3, "bob votes Djinn ×3");
v = await post("/api/community/vote", { id: pid, opt: 0 }, HA);
ok(v.weight === 1, "alice (no wallet) votes Scorpion ×1");
await post("/api/community/vote", { id: pid, opt: 1 }, HB); // voting again only changes the choice
cm = await fetch(B + "/api/community", { headers: HB }).then((x) => x.json());
ok(cm.polls[0].options[1].weight === 3 && cm.polls[0].options[0].weight === 1 && cm.polls[0].mine === 1, "tally: Djinn 3, Scorpion 1 (one vote per player)");
ok(cm.holders.length >= 1 && cm.holders[0].username === "bob" && cm.holders[0].bal === 10100, "top holders: bob first with 10,100");
ok((await post("/api/community/vote", { id: pid, opt: 9 }, HB)).s === 400, "unknown choice refused");
await post("/api/admin/polls", { action: "close", id: pid }, HA);
ok((await post("/api/community/vote", { id: pid, opt: 0 }, HB)).error === "k.pollClosed", "no votes after it closes");
cm = await fetch(B + "/api/community").then((x) => x.json());
ok(cm.polls.length === 0 && cm.past.length === 1 && cm.past[0].open === false, "closed vote shown with its result");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
