// Posters for Pi Oasis (purple and gold, our own brand). usage: node make.cjs <shotsdir> <outdir>
const { chromium } = require('playwright'); const fs = require('fs');
const SH = process.argv[2], OUT = process.argv[3];
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const svg = (n) => fs.readFileSync(`/tmp/pst/${n}.svg`, 'utf8').replace(/viewBox="[^"]*"/, 'viewBox="-20 -30 240 300"');
const P = {
  launch: { shot: 'palm', ring: ['⚔️', '🏰', '🐪', '📖'], en: { h: 'Your Oasis in Pi Browser', s: 'Tap, build, collect and compete. Free to play.', b: ['🌴 Tap the palm for dates', '🏰 Defend Jerry Castle', '⚔️ Jerry Kombat and Camel Derby', '🎁 A gift code every day'] }, ar: { h: 'واحتك داخل متصفح Pi', s: 'اضغط وابنِ واجمع وتنافس. اللعب مجاني.', b: ['🌴 اضغط النخلة لتسقط التمرات', '🏰 دافع عن قلعة جيري', '⚔️ جيري كومبات وديربي الجمال', '🎁 كود هدية كل يوم'] } },
  king: { shot: 'king', ring: ['👑', '🪙', '⚡', '🔥'], en: { h: 'Become the King of the Game', s: 'Support the project with the most Pi and take the throne.', b: ['👑 Crown at the top of the ranking', '🪙 10,000 coins every day', '⚡ x3 on oasis income and Kombat profit', '🔥 Pass the King’s total to dethrone him'] }, ar: { h: 'كن ملك اللعبة', s: 'ادعم المشروع بأكبر قدر من Pi واعتلِ العرش.', b: ['👑 تاج في أعلى الترتيب', '🪙 10,000 عملة كل يوم', '⚡ ×3 على دخل الواحة وأرباح كومبات', '🔥 تجاوز مجموع الملك لتزيحه'] } },
  code: { shot: 'code', ring: ['🎁', '💠', '🌴', '⏳'], en: { h: 'A gift code every day', s: 'The first 100 players to use it win.', b: ['💠 10,000 JRY', '🌴 5,000 dates', '⏳ Valid for 24 hours', '📲 On the home page and in Jerry Magazine'] }, ar: { h: 'كود هدية كل يوم', s: 'أول 100 لاعب يستخدمونه يربحون.', b: ['💠 10,000 JRY', '🌴 5,000 تمرة', '⏳ صالح 24 ساعة', '📲 في الصفحة الرئيسية وفي مجلة جيري'] } },
  rank: { shot: 'rank', ring: ['🥇', '🐪', '🏆', '📜'], en: { h: 'The top 100 win every week', s: 'Climb the weekly ranking.', b: ['🥇 Dates and JRY for the top 100', '🐪 Prize camels for the top 3', '🏆 A share of the weekly Pi prize pool', '📜 Last week’s winners in the app'] }, ar: { h: 'أفضل 100 يربحون كل أسبوع', s: 'اصعد في الترتيب الأسبوعي.', b: ['🥇 تمر وJRY لأفضل 100', '🐪 جمال جوائز لأفضل 3', '🏆 حصة من جائزة Pi الأسبوعية', '📜 فائزو الأسبوع الماضي في التطبيق'] } },
  vip: { shot: 'vip', ring: ['🏛️', '🐫', '🏆', '👑'], en: { h: 'The VIP Club', s: 'A private club for supporters.', b: ['🏛️ Hall of Glory', '🐫 Sultan’s Caravan strategy game', '🏆 Monthly ranking', '🎟️ 5 Pi a month, or win your entry'] }, ar: { h: 'نادي VIP', s: 'نادٍ خاص بالداعمين.', b: ['🏛️ حائط المجد', '🐫 لعبة قافلة السلطان الاستراتيجية', '🏆 ترتيب شهري', '🎟️ 5 Pi شهرياً أو اربح دخولك'] } },
  all: { shot: 'hub', ring: ['🌴', '🐪', '⚔️', '🏰'], grid: [['🌴', 'Palm', 'النخلة'], ['🐪', 'Camels', 'الجمال'], ['🏙️', 'City', 'المدينة'], ['🏺', 'Granary', 'الصومعة'], ['⚔️', 'Kombat', 'كومبات'], ['🏇', 'Derby', 'الديربي'], ['🏰', 'Castle', 'القلعة'], ['🎡', 'Wheel', 'العجلة'], ['📖', 'Catalog', 'الكتالوج'], ['🏪', 'Market', 'السوق'], ['💬', 'Chat', 'الدردشة'], ['🎨', 'Manga', 'المانغا']], en: { h: 'Everything in one oasis', s: 'Twelve ways to play, all free to start.', b: [] }, ar: { h: 'كل شيء في واحة واحدة', s: 'اثنا عشر طريقة للعب، والبداية مجانية.', b: [] } },
};
const FOOT = { en: ['Open Pi Browser and search', 'Prizes and items are in the game. No promise of profit.'], ar: ['افتح متصفح Pi وابحث عن', 'الجوائز والأغراض داخل اللعبة. لا وعد بأي ربح.'] };
function html(key, lang, fmt) {
  const p = P[key], t = p[lang], rtl = lang === 'ar', W = 1080, H = fmt === 'S' ? 1920 : fmt === 'B' ? 628 : 1350, banner = fmt === 'B', story = fmt === 'S';
  const phoneW = banner ? 215 : story ? 400 : 415, phoneH = phoneW * 2;
  const font = rtl ? "'Noto Sans Arabic','Inter',sans-serif" : "'Inter','Noto Sans Arabic',sans-serif";
  const stars = Array.from({ length: 34 }, (_, i) => { const x = (i * 337) % (banner ? 1200 : W), y = (i * 211) % H, s = 14 + ((i * 7) % 5) * 8; return `<i class=st style="left:${x}px;top:${y}px;font-size:${s}px;opacity:${0.25 + ((i * 13) % 6) / 10}">✦</i>`; }).join('');
  const ring = p.ring.map((e, i) => { const pos = [[-0.10, 0.12], [1.02, 0.28], [-0.14, 0.62], [1.04, 0.74]][i]; return `<div class=orb style="left:${pos[0] * phoneW}px;top:${pos[1] * phoneH}px">${e}</div>`; }).join('');
  const bullets = t.b.map((x) => `<div class=bl>${x}</div>`).join('');
  const grid = p.grid ? `<div class=grid>${p.grid.map((g) => `<div class=gc><b>${g[0]}</b><span>${rtl ? g[2] : g[1]}</span></div>`).join('')}</div>` : '';
  const phone = `<div class=phonewrap style="width:${phoneW}px;height:${phoneH}px"><div class=glow></div><div class=phone style="width:${phoneW + 24}px;height:${phoneH + 24}px"><img src="${b64(SH + '/' + p.shot + '.png')}"></div>${ring}</div>`;
  const chars = banner ? '' : `<div class=ch style="left:6px">${svg('jerry')}</div><div class=ch r style="right:6px">${svg('nour')}</div>`;
  const text = `<div class=txt><div class=brand>🌴 Pi Oasis</div><h1>${t.h}</h1><p class=sub>${t.s}</p>${grid}<div class=bls>${bullets}</div></div>`;
  const cta = banner ? '' : `<div class=cta><small>${FOOT[lang][0]}</small><b>“Pi Oasis”</b><span dir=ltr>jerryoasis9559.pinet.com</span></div><div class=disc>${FOOT[lang][1]}</div>`;
  return `<!doctype html><meta charset=utf8><style>
html{width:${banner ? 1200 : W}px;height:${H}px;overflow:hidden;background:#1a0a42}*{box-sizing:border-box;margin:0}body{width:${banner ? 1200 : W}px;height:${H}px;overflow:hidden;position:relative;font-family:${font};color:#fff;direction:${rtl ? 'rtl' : 'ltr'};
background:radial-gradient(90% 55% at 50% 0%,#9b5cff 0%,#6d28d9 28%,#3b1480 55%,#1a0a42 100%)}
.rays{position:absolute;inset:0;background:conic-gradient(from 200deg at 50% -8%,transparent 0 8deg,rgba(255,216,107,.22) 12deg,transparent 18deg 30deg,rgba(255,216,107,.16) 36deg,transparent 42deg 56deg,rgba(255,255,255,.14) 62deg,transparent 70deg 92deg,rgba(255,216,107,.18) 98deg,transparent 106deg);filter:blur(2px)}
.spot{position:absolute;bottom:-40px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(255,216,107,.55),transparent 65%)}
.st{position:absolute;color:#ffd86b;font-style:normal}
.dunes{position:absolute;left:0;right:0;bottom:0;height:${banner ? 120 : 330}px;background:linear-gradient(180deg,transparent,rgba(10,3,30,.85))}
.main{position:absolute;inset:0;padding:${banner ? '40px 56px' : story ? '56px 56px 0' : '48px 56px 0'};display:flex;flex-direction:${banner ? 'row' : 'column'};align-items:center;gap:${banner ? 40 : 18}px}
.body{display:flex;flex-direction:${story || banner ? (banner ? 'row' : 'column') : 'row'};align-items:center;gap:${story ? 20 : 30}px;width:100%;flex:${banner ? 1 : 'none'}}
.txt{flex:${story ? 'none' : 1};min-width:0;width:${story ? '100%' : 'auto'};text-align:${story ? 'center' : rtl ? 'right' : 'left'}}
.brand{display:inline-block;background:linear-gradient(90deg,#ffd86b,#f5c542);color:#3a2400;font-weight:900;font-size:${banner ? 26 : 34}px;padding:6px 26px;border-radius:40px;margin-bottom:${banner ? 12 : 22}px;box-shadow:0 0 30px rgba(255,216,107,.6)}
h1{font-size:${banner ? 60 : story ? 92 : 72}px;line-height:1.08;font-weight:900;background:linear-gradient(180deg,#fff7d1,#ffd86b 55%,#f0a91c);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5));margin-bottom:12px}
.sub{font-size:${banner ? 28 : story ? 40 : 32}px;font-weight:600;line-height:1.3;opacity:.95;margin-bottom:${banner ? 14 : 20}px}
.bls{display:flex;flex-direction:column;gap:${banner ? 8 : 10}px}
.bl{font-size:${banner ? 25 : story ? 34 : 29}px;font-weight:700;padding:${banner ? '8px 18px' : '10px 20px'};border-radius:22px;background:rgba(255,255,255,.12);border:2px solid rgba(255,216,107,.35);backdrop-filter:blur(4px);text-align:${rtl ? 'right' : 'left'}}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:6px}
.gc{background:rgba(255,255,255,.13);border:2px solid rgba(255,216,107,.35);border-radius:22px;padding:14px 6px;text-align:center;display:flex;flex-direction:column;gap:4px}.gc b{font-size:50px;line-height:1}.gc span{font-size:26px;font-weight:800}
.phonewrap{position:relative;flex:none;margin:${banner ? '0 90px 0 40px' : story ? '30px 40px' : '20px 36px'};transform:rotate(${rtl ? 4 : -4}deg)}
.glow{position:absolute;inset:-60px;background:radial-gradient(circle,rgba(255,216,107,.65),transparent 62%);filter:blur(10px)}
.phone{position:absolute;left:-12px;top:-12px;border-radius:64px;background:#0b0b10;padding:12px;box-shadow:0 30px 70px rgba(0,0,0,.65),0 0 0 4px #ffd86b,0 0 50px rgba(255,216,107,.6);overflow:hidden}
.phone img{width:100%;height:100%;border-radius:52px;object-fit:cover;object-position:top;display:block}
.orb{position:absolute;width:104px;height:104px;border-radius:50%;display:grid;place-items:center;font-size:56px;background:radial-gradient(circle at 30% 25%,#8b5cf6,#3b1480);border:4px solid #ffd86b;box-shadow:0 0 34px rgba(255,216,107,.7),inset 0 0 20px rgba(255,255,255,.25);transform:rotate(${rtl ? -4 : 4}deg)}
.ch{position:absolute;bottom:${story ? 36 : 26}px;width:${story ? 250 : 210}px;height:${story ? 320 : 270}px;z-index:3;filter:drop-shadow(0 12px 18px rgba(0,0,0,.5))}.ch svg{width:100%;height:100%}
.cta{position:absolute;left:230px;right:230px;bottom:${story ? 90 : 62}px;text-align:center;z-index:5}.cta small{display:block;font-size:${story ? 30 : 26}px;font-weight:700;opacity:.9}.cta b{display:block;font-size:${story ? 72 : 58}px;line-height:1.1;color:#ffd86b;text-shadow:0 0 30px rgba(255,216,107,.8)}.cta span{display:block;font-size:${story ? 30 : 26}px;font-weight:700;opacity:.9;margin-top:4px}
.disc{position:absolute;left:260px;right:260px;bottom:${story ? 34 : 14}px;text-align:center;font-size:19px;line-height:1.25;opacity:.65;z-index:5}
</style><body><div class=rays></div><div class=spot style="left:-80px"></div><div class=spot style="right:-80px"></div>${stars}<div class=dunes></div>
<div class=main>${banner ? `<div class=body>${text}${phone}</div>` : story ? `${text}${phone}` : `<div class=body>${text}${phone}</div>`}</div>${chars}${cta}</body>`;
}
(async () => {
  const b = await chromium.launch(); const jobs = [];
  for (const k of Object.keys(P)) for (const l of ['en', 'ar']) jobs.push([k, l, 'P']);
  for (const k of ['launch', 'king', 'code']) for (const l of ['en', 'ar']) jobs.push([k, l, 'S']);
  for (const l of ['en', 'ar']) jobs.push(['launch', l, 'B']);
  for (const [k, l, f] of jobs) {
    const H = f === 'S' ? 1920 : f === 'B' ? 628 : 1350, W = f === 'B' ? 1200 : 1080;
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(html(k, l, f)); await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/${k}-${l}-${f === 'P' ? 'post' : f === 'S' ? 'story' : 'banner'}.png` }); await p.close();
  }
  await b.close(); console.log(jobs.length);
})();
