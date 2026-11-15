// Earn page: rewarded ads give points. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const exec = (q) => fetch(B + "/__test/exec", { method: "POST", body: q });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokB" })).session };
const me = () => fetch(B + "/api/me", { headers: H }).then((r) => r.json());
const d0 = (await me()).state.dates;
ok((await post("/api/earn/ad", { adId: "bad1" }, H)).error === "k.adFail", "an ad Pi didn't confirm gives nothing");
let r = await post("/api/earn/ad", { adId: "goodE1" }, H);
ok(r.ok && r.dates === 50 && r.state.dates === d0 + 50 && r.account.earnN === 1, "1st ad: +50 dates");
ok(r.state.week.score === 0, "ad dates don't count in the weekly ranking");
ok((await post("/api/earn/ad", { adId: "goodE2" }, H)).error === "earn.wait", "45 seconds between ads");
ok((await post("/api/earn/ad", { adId: "goodE1" }, H)).error === "earn.wait", "the same ad can't be used again");
const skip = () => exec("UPDATE users SET earn_at = earn_at - 60000 WHERE uid='uB'");
let spins0 = (await me()).account.wheelSpins;
for (let i = 2; i <= 5; i++) { await skip(); r = await post("/api/earn/ad", { adId: "goodE" + i }, H); }
ok(r.ok && r.dates === 100 && r.bonus && r.bonus.spins === 1 && r.account.wheelSpins === spins0 + 1, "5th ad: +100 dates and a free wheel spin");
for (let i = 6; i <= 10; i++) { await skip(); r = await post("/api/earn/ad", { adId: "goodE" + i }, H); }
ok(r.ok && r.dates === 200 && r.account.jryPts === 5 && r.state.kombat.coins >= 20000, "10th ad: +200 dates, 20,000 coins and 5 JRY");
ok(r.state.dates === d0 + 1050 && r.account.earnTotal === 1050, "10 ads = 1,050 dates in total");
await skip();
ok((await post("/api/earn/ad", { adId: "goodE11" }, H)).error === "earn.done", "10 ads a day at most");
await exec("UPDATE users SET earn_day = earn_day - 1 WHERE uid='uB'");
ok((await me()).account.earnN === 0, "the counter starts again the next day");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
