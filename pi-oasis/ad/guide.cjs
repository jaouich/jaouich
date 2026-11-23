// One continuous 1080x1920 recording: wrapper page (frame, captions EN+AR, finger) around the real app in an iframe.
// usage: node guide.cjs <outdir>   (needs tests/harness.mjs on :3457)
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2], B = 'http://localhost:3457';
const scenes = JSON.parse(fs.readFileSync(__dirname + '/guide-scenes.json', 'utf8'));
const S = 1.66, PX = Math.round((1080 - 390 * S) / 2), PY = 222;
const durOf = (s) => Math.max(10, Math.min(18, 3 + s.en.length / 13));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cardHtml = {
  intro: `<div style="font-size:250px;margin-top:330px">🌴</div><div style="font-size:150px;font-weight:900;color:#ffd86b">Pi Oasis</div><div style="font-size:60px;margin-top:20px">A game oasis inside Pi Browser</div><div style="font-size:62px;margin-top:14px;font-family:'Noto Sans Arabic',sans-serif">واحة ألعاب داخل متصفح Pi</div><div style="font-size:46px;margin-top:60px;opacity:.85">Complete guide · الدليل الشامل</div>`,
  start: `<div style="font-size:84px;font-weight:900;color:#ffd86b;margin-top:150px">How to start · كيف تبدأ</div>` + [['1', 'Open Pi Browser', 'افتح متصفح Pi'], ['2', 'Find “Pi Oasis”', 'ابحث عن «واحة باي»'], ['3', 'Tap Open and sign in with Pi', 'اضغط Open وسجّل الدخول عبر Pi']].map((x) => `<div style="margin:40px 90px 0;padding:36px 44px;border-radius:44px;background:rgba(255,255,255,.14);display:flex;gap:40px;align-items:center;text-align:start"><div style="min-width:120px;height:120px;border-radius:60px;background:#ffd86b;color:#3a2400;font-size:80px;font-weight:900;display:grid;place-items:center">${x[0]}</div><div><div style="font-size:58px;font-weight:800">${x[1]}</div><div style="font-size:54px;opacity:.9;font-family:'Noto Sans Arabic',sans-serif" dir="rtl">${x[2]}</div></div></div>`).join('') + `<div style="font-size:46px;margin-top:70px;font-weight:700">jerryoasis9559.pinet.com</div>`,
  fair: `<div style="font-size:200px;margin-top:300px">🛡️</div><div style="font-size:84px;font-weight:900;color:#ffd86b">Fair play</div><div style="font-size:70px;font-family:'Noto Sans Arabic',sans-serif;margin-top:10px">اللعب النزيه</div><div style="font-size:54px;margin:70px 90px 0;line-height:1.5">✅ Server-checked numbers<br>🎮 Prizes and items are in the game<br>🚫 No promise of profit</div><div style="font-size:52px;margin:30px 90px 0;line-height:1.6;font-family:'Noto Sans Arabic',sans-serif" dir="rtl">✅ أرقام تُراجَع في الخادم<br>🎮 الجوائز والأغراض داخل اللعبة<br>🚫 لا وعد بأي ربح</div>`,
  outro: `<div style="font-size:220px;margin-top:300px">🌴</div><div style="font-size:130px;font-weight:900;color:#ffd86b">Pi Oasis</div><div style="font-size:56px;margin-top:40px">Open Pi Browser and search</div><div style="font-size:100px;font-weight:900;color:#ffd86b">“Pi Oasis”</div><div style="font-size:60px;margin-top:20px;font-family:'Noto Sans Arabic',sans-serif">ابحث عن «واحة باي»</div><div style="font-size:46px;margin-top:40px;opacity:.9">jerryoasis9559.pinet.com</div><div style="font-size:34px;margin:70px 90px 0;opacity:.6">A game for fun. Prizes and items are in the game. No promise of profit.</div>`,
};
const wrapper = `<!doctype html><meta charset=utf8><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;overflow:hidden;position:relative;background:radial-gradient(120% 70% at 50% 0%,#7c3aed 0%,#4c1d95 45%,#1e0b45 100%);font-family:Inter,"Noto Sans Arabic","DejaVu Sans",sans-serif;color:#fff}
#title{position:absolute;left:30px;right:30px;top:14px;height:196px;text-align:center}
#tn{display:inline-block;background:#ffd86b;color:#3a2400;font-weight:900;font-size:26px;padding:2px 18px;border-radius:30px}
#te{font-size:44px;font-weight:900;color:#ffd86b;margin-top:4px;line-height:1.15}#ta{font-size:40px;font-weight:800;direction:rtl;line-height:1.3}
#phone{position:absolute;left:${PX - 14}px;top:${PY - 14}px;width:${390 * S + 28}px;height:${780 * S + 28}px;border-radius:64px;background:#0b0b10;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 6px #2b2b36}
#scr{position:absolute;left:14px;top:14px;width:${390 * S}px;height:${780 * S}px;border-radius:50px;overflow:hidden;background:#fff}
#app{position:absolute;left:0;top:0;width:390px;height:780px;border:0;transform:scale(${S});transform-origin:0 0}
#cap{position:absolute;left:30px;right:30px;top:${PY + 780 * S + 30}px;bottom:20px;padding:14px 26px;border-radius:32px;background:rgba(10,4,30,.7);display:flex;flex-direction:column;justify-content:center;gap:8px;overflow:hidden}
#en{font-size:28px;font-weight:600;line-height:1.28}#ar{font-size:31px;font-weight:700;line-height:1.45;color:#ffe9a8;direction:rtl;text-align:right}
#finger{position:absolute;z-index:50;font-size:84px;left:540px;top:1000px;transition:left .6s ease,top .6s ease;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5));pointer-events:none}
#card{position:absolute;inset:0;z-index:40;text-align:center;background:radial-gradient(120% 70% at 50% 0%,#7c3aed 0%,#4c1d95 45%,#1e0b45 100%);display:none}
.star{position:absolute;color:#ffd86b;opacity:.6}
</style><body>
<div id=title><span id=tn></span><div id=te></div><div id=ta></div></div>
<div id=phone><div id=scr><iframe id=app src="${B}/"></iframe></div></div>
<div id=cap><div id=en></div><div id=ar></div></div>
<div id=finger>👆</div>
<div id=card></div>
<span class=star style="left:60px;top:210px;font-size:50px">✦</span><span class=star style="right:60px;top:700px;font-size:40px">✦</span>
</body>`;
(async () => {
  // seed some content so every screen has something to show
  const J = (u, b) => fetch(B + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  const sql = (q) => fetch(B + '/__test/sql', { method: 'POST', body: q }).then((r) => r.json());
  const exec = (q) => fetch(B + '/__test/exec', { method: 'POST', body: q });
  for (const t of ['tokA', 'tokB', 'tokC']) await J('/api/auth', { accessToken: t });
  const uid = async (n) => (await sql(`SELECT uid FROM users WHERE username='${n}'`))[0].uid;
  const [uA, uB, uC] = [await uid('alice'), await uid('bob'), await uid('carol')], now = Date.now();
  await J('/api/me', {});
  const camels = JSON.stringify([0, 1, 1, 2].map((r, i) => ({ id: i + 1, rarity: r, born: now - 9 * 3600e3, lastCollect: now - 5 * 3600e3, lastBred: 0, from: 'market' })));
  await exec(`UPDATE state SET json = json_set(json, '$.dates', 12000, '$.animals', json('${camels}'), '$.nextAnimal', 5) WHERE uid='${uC}';
    INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES ('scorpion', 1, '${uC}', ${now}), ('palm', 4, '${uC}', ${now}), ('lamp', 2, '${uC}', ${now});
    INSERT INTO chat_msgs (room, uid, text, at) VALUES ('main', '${uA}', 'Salam everyone! Who wants to swap cards?', ${now - 600000}), ('main', '${uB}', 'I just reached the Silver league', ${now - 300000}), ('main', '${uA}', 'The castle map 2 is hard but fun', ${now - 120000});
    INSERT INTO mk_offers (uid, kind, amount, pi, status, created_at, updated_at) VALUES ('${uA}', 'dates', 20000, 1.5, 'open', ${now}, ${now}), ('${uB}', 'coins', 400000, 2, 'open', ${now}, ${now});`);
  const lastWk = (() => { const d = new Date(now - 7 * 86400000); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); })();
  await exec(`INSERT OR REPLACE INTO week_scores VALUES (${lastWk}, '${uA}', 1800, 1), (${lastWk}, '${uB}', 1200, 2), (${lastWk}, '${uC}', 600, 3);`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } }, userAgent: 'Mozilla/5.0 PiBrowser/2.0' });
  const p = await ctx.newPage(); const t0 = Date.now();
  await p.route('**/pi-sdk.js', (r) => r.fulfill({ body: 'window.Pi={init(){},authenticate:async()=>({accessToken:"tokC"})};', contentType: 'text/javascript' }));
  await p.route('https://fonts.**', (r) => r.abort());
  await p.addInitScript((wk) => { try { localStorage.setItem('oasis_tour', '1'); localStorage.setItem('oasis_lang', 'en'); localStorage.setItem('oasis_wk_seen', String(wk)); } catch (e) {} }, lastWk);
  await p.setContent(wrapper); await p.waitForTimeout(3500);
  const fr = () => p.frames().find((f) => f.url().startsWith(B));
  const hide = () => fr().evaluate(() => document.querySelectorAll('.media,.sheet,#kombat').forEach((e) => e.classList.add('hidden')));
  const pointTo = async (sel) => { const r = await fr().evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel); if (!r) return; await p.evaluate(({ x, y }) => { const f = document.getElementById('finger'); f.style.left = x + 'px'; f.style.top = y + 'px'; }, { x: PX + r.x * S - 22, y: PY + r.y * S - 10 }); await sleep(650); };
  const smooth = async (sel, block = 'center') => { await fr().evaluate(({ s, bl }) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ behavior: 'smooth', block: bl }); }, { s: sel, bl: block }); await sleep(1300); };
  const top = async () => { await fr().evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(800); };
  const click = async (sel) => { try { await fr().click(sel, { timeout: 4000 }); } catch (e) {} };
  const tap = async (sel) => { await pointTo(sel); await click(sel); };
  const tab = async (n, w = 3000) => { await top(); await tap('[data-tab=' + n + ']'); await sleep(w); await top(); };
  const open = async (sel, w) => { await smooth(sel); await tap(sel); await sleep(w); };
  const hits = async (sel, n, gap) => { for (let i = 0; i < n; i++) { try { await fr().dispatchEvent(sel, 'pointerdown'); } catch (e) {} await sleep(gap); } };
  const A = {
    home: async () => { await top(); await pointTo('#dates'); await sleep(1500); await pointTo('#langSelect'); await sleep(1200); await pointTo('[data-tab=vip]'); await sleep(1200); await smooth('.hub', 'start'); await sleep(2500); },
    palm: async () => { await smooth('#pmTree'); await pointTo('#pmTree'); await hits('#pmTree', 11, 300); await pointTo('#pmUp'); await sleep(2500); },
    missions: async () => { await smooth('#eventBar', 'start'); await sleep(2200); await smooth('#missions', 'center'); await pointTo('#missions'); await sleep(3500); },
    camels: async () => { await tab('camels', 7000); },
    city: async () => { await tab('city', 7000); },
    granary: async () => { await tab('stake', 7000); await tab('farm', 300); },
    kombat: async () => { await top(); await smooth('#kombatOpen'); await tap('#kombatOpen'); await sleep(1500); await pointTo('#kMedal'); await hits('#kMedal', 14, 220); await sleep(1500); await fr().evaluate(() => { const c = document.getElementById('kCards'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); await sleep(3500); await click('#kBack'); await hide(); },
    derby: async () => { await top(); await open('#derbyOpen', 8000); await hide(); },
    castle: async () => { await top(); await open('#castleOpen', 3000); await click('[data-cs=map][data-i="0"]'); await sleep(5500); await click('[data-cs=leave]'); await sleep(500); await hide(); },
    fun: async () => { await open('#wheelOpen', 3500); await hide(); await open('#qOpen', 3500); await hide(); await open('#arcOpen', 3500); await hide(); },
    catalog: async () => { await open('#catOpen', 9000); await hide(); },
    market: async () => { await open('#mkOpen', 8000); await hide(); },
    box: async () => { await open('#boxOpen', 9000); await hide(); },
    chat: async () => { await open('#chatOpen', 9000); await hide(); },
    mag: async () => { await open('#magOpen', 3500); await click('[data-mg=tab][data-k=posts]'); await sleep(3000); await click('[data-mg=tab][data-k=docs]'); await sleep(3000); await hide(); },
    club: async () => { await tab('vip', 800); await click('#clubNav [data-g=member]'); await smooth('#tiers', 'start'); await sleep(6500); },
    royal: async () => { await click('#clubNav [data-g=cards]'); await sleep(600); await smooth('#rcShop', 'start'); await sleep(3000); await fr().evaluate(() => document.querySelector('.rc-prem').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(5500); },
    shop: async () => { await click('#clubNav [data-g=shop]'); await sleep(600); await smooth('#multBox', 'start'); await sleep(4000); await click('#clubNav [data-g=invite]'); await sleep(600); await smooth('#refLink', 'center'); await sleep(4000); },
    vipc: async () => { await tab('farm', 500); await top(); await open('#vipcOpen', 4000); await fr().evaluate(() => document.querySelector('#vipc .jm-body').scrollTo({ top: 400, behavior: 'smooth' })); await sleep(4000); await hide(); },
    rank: async () => { await tab('rank', 1500); await fr().evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' })); await sleep(3500); await smooth('#lastWeek', 'start'); await sleep(3000); await tab('farm', 300); },
    code: async () => { await top(); await smooth('#dayCode', 'center'); await pointTo('#dayCode [data-dc=copy]'); await sleep(4000); },
  };
  const marks = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i], dur = durOf(sc) * 1000, st = Date.now();
    await p.evaluate(({ n, total, t, en, ar, card }) => {
      document.getElementById('tn').textContent = n + ' / ' + total; document.getElementById('te').textContent = t[0]; document.getElementById('ta').textContent = t[1];
      document.getElementById('en').textContent = en; document.getElementById('ar').textContent = ar;
      const c = document.getElementById('card'); if (card) { c.innerHTML = card; c.style.display = 'block'; } else c.style.display = 'none'; document.getElementById('finger').style.display = card ? 'none' : 'block';
    }, { n: i + 1, total: scenes.length, t: sc.t, en: sc.en, ar: sc.ar, card: cardHtml[sc.id] || '' });
    const startAt = (Date.now() - t0) / 1000;
    if (A[sc.id]) { try { await A[sc.id](); } catch (e) { console.error('scene', sc.id, e.message); } }
    const left = dur - (Date.now() - st); if (left > 0) await sleep(left);
    marks.push({ id: sc.id, start: +startAt.toFixed(2), end: +((Date.now() - t0) / 1000).toFixed(2) });
  }
  await sleep(600);
  const path = await p.video().path(); await ctx.close(); await b.close();
  fs.writeFileSync(OUT + '/marks.json', JSON.stringify({ marks, path }));
  console.log(JSON.stringify({ n: marks.length, end: marks[marks.length - 1].end }));
})();
