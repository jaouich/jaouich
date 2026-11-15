// Rewarded Pi ads in Jerry Kombat. Start tests/harness.mjs first.
const B = "http://localhost:3457";
const post = (p, b, h = {}) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); c ? pass++ : fail++; };
const H = { Authorization: "Bearer " + (await post("/api/auth", { accessToken: "tokB" })).session };
const act = (a) => post("/api/action", { action: a }, H);
let r = await act({ type: "kSync", taps: 0 });
// spend some energy
await fetch(B + "/__test/exec", { method: "POST", body: "UPDATE state SET json = json_set(json, '$.kombat.energy', 3, '$.kombat.eAt', " + Date.now() + ") WHERE uid='uB'" });
ok((await act({ type: "kAdRefill", adId: "bad1" })).error === "k.adFail", "an ad Pi didn't confirm gives nothing");
r = await act({ type: "kAdRefill", adId: "good1" });
ok(!r.error && r.state.kombat.energy >= 1000, "confirmed ad → full energy");
ok((await act({ type: "kAdRefill", adId: "good1" })).error === "k.adFail", "the same ad can't be used twice");
for (let i = 2; i <= 5; i++) await act({ type: "kAdRefill", adId: "good" + i });
ok((await act({ type: "kAdRefill", adId: "good6" })).error === "k.noAdRefills", "5 ad refills a day at most");
ok((await act({ type: "kAdDaily", adId: "good7" })).error === "k.dailyFirst", "daily ×2 only after claiming the daily reward");
r = await act({ type: "kDaily" });
const c0 = r.state.kombat.coins;
r = await act({ type: "kAdDaily", adId: "good8" });
ok(!r.error && r.state.kombat.coins === c0 * 2 && r.state.kombat.earn.ad === c0, "ad doubles today's daily reward");
ok((await act({ type: "kAdDaily", adId: "good9" })).error === "k.dailyAdDone", "only once a day");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
