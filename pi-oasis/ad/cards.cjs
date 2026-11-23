// Renders the still cards of the ad (1080x1920) with Playwright
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const BG = 'background:radial-gradient(120% 70% at 50% 0%,#7c3aed 0%,#4c1d95 45%,#1e0b45 100%)';
const base = (inner, extra = '') => `<!doctype html><meta charset=utf8><style>*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;${BG};font-family:Inter,"DejaVu Sans",sans-serif;color:#fff;overflow:hidden;position:relative}
.star{position:absolute;color:#ffd86b;opacity:.7}.c{position:absolute;left:0;right:0;text-align:center}${extra}</style><body>
<span class=star style="left:90px;top:160px;font-size:60px">✦</span><span class=star style="right:120px;top:300px;font-size:40px">✦</span><span class=star style="left:160px;bottom:300px;font-size:44px">✦</span><span class=star style="right:90px;bottom:200px;font-size:70px">✦</span>${inner}</body>`;
const pages = {
  intro: base(`<div class=c style="top:300px;font-size:260px">🌴</div><div class=c style="top:640px;font-size:150px;font-weight:900;color:#ffd86b">Pi Oasis</div>
    <div class=c style="top:860px;font-size:62px;font-weight:700;padding:0 90px;line-height:1.3">A game oasis inside Pi Browser</div>
    <div class=c style="top:1180px;font-size:48px;opacity:.9;padding:0 100px;line-height:1.5">Tap the palm · Defend the castle<br>Collect rare cards · Win weekly prizes</div>
    <div class=c style="top:1620px;font-size:44px;opacity:.8">Free to play</div>`),
  appbg: base(`<div class=c style="top:70px;font-size:70px;font-weight:900;color:#ffd86b">🌴 Pi Oasis</div>
    <div style="position:absolute;left:155px;top:210px;width:770px;height:1500px;border-radius:70px;background:#0b0b10;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 6px #2b2b36"></div>`),
  outro: base(`<div class=c style="top:260px;font-size:200px">🌴</div><div class=c style="top:520px;font-size:130px;font-weight:900;color:#ffd86b">Pi Oasis</div>
    <div class=c style="top:760px;font-size:56px;font-weight:700;line-height:1.55;padding:0 80px">✅ Free to play<br>⚔️ Kombat, Derby and Castle<br>🐪 Camels, city and market<br>🎁 Daily gift code · 🏆 Weekly ranking<br>👑 VIP Club · 📖 Manga and guides</div>
    <div class=c style="top:1330px;font-size:46px;opacity:.9">Open Pi Browser, search</div>
    <div class=c style="top:1400px;font-size:92px;font-weight:900;color:#ffd86b">“Pi Oasis”</div>
    <div class=c style="top:1560px;font-size:44px;opacity:.85;padding:0 60px">jerryoasis9559.pinet.com</div>
    <div class=c style="top:1740px;font-size:34px;opacity:.6;padding:0 80px">A game for fun. Prizes and items are in the game. No promise of profit.</div>`),
};
const step = (n, t, d) => `<div style="margin:0 90px 46px;padding:36px 40px;border-radius:44px;background:rgba(255,255,255,${n ? .14 : 0});display:flex;gap:36px;align-items:center;opacity:${n ? 1 : 0}"><div style="min-width:120px;height:120px;border-radius:60px;background:#ffd86b;color:#3a2400;font-size:80px;font-weight:900;display:grid;place-items:center">${n || 0}</div><div><div style="font-size:60px;font-weight:800">${t}</div><div style="font-size:38px;opacity:.85;margin-top:6px">${d}</div></div></div>`;
const S = [['Open Pi Browser', 'From your Pi app, the Pi Browser button'], ['Find “Pi Oasis”', 'Search the Pi Apps list or open the link below'], ['Tap Open and play', 'Sign in with Pi. It is free']];
for (let k = 1; k <= 3; k++) pages['steps' + k] = base(`<div class=c style="top:170px;font-size:80px;font-weight:900;color:#ffd86b">How to start</div><div style="position:absolute;left:0;right:0;top:420px">${S.map((x, i) => step(i < k ? i + 1 : 0, x[0], x[1])).join('')}</div><div class=c style="top:1560px;font-size:46px;font-weight:700;opacity:${k === 3 ? 1 : 0}">jerryoasis9559.pinet.com</div>`);
const CAP = ['Tap the palm to knock dates down', 'Everything on one home screen', 'Jerry Kombat: tap, collect cards, fight bosses', 'Camel Derby: train your camels and race', 'Jerry Castle: defend with towers', 'Breed and collect camels', 'Build your city and fill orders', 'Save dates in the granary', 'Daily wheel, quests and arcade', 'Collect rare cards', 'Trade with other players', 'Chat with friends', 'Your box: gifts and prizes', 'Manga and guides in the magazine', 'Grab the daily gift code', 'Join the VIP Club', 'Climb the weekly ranking'];
CAP.forEach((c, i) => { pages['cap' + i] = `<!doctype html><meta charset=utf8><style>*{margin:0}body{width:1080px;height:1920px;background:transparent;font-family:Inter,"DejaVu Sans",sans-serif;color:#fff}.t{position:absolute;left:60px;right:60px;top:1745px;text-align:center;font-size:62px;font-weight:800;line-height:1.2;text-shadow:0 4px 14px rgba(0,0,0,.6)}.t b{display:inline-block;background:rgba(0,0,0,.45);padding:14px 34px;border-radius:40px}</style><body><div class=t><b>${c}</b></div>`; });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [k, h] of Object.entries(pages)) { await p.setContent(h); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/${k}.png`, omitBackground: k.startsWith('cap') }); }
  await b.close();
})();
