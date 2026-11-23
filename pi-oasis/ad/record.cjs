// Records the real app (test server) with a finger pointer; prints the scene timestamps (s)
const { chromium } = require('playwright');
const OUT = process.argv[2], B = 'http://localhost:3457';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width: 780, height: 1560 } }, userAgent: 'Mozilla/5.0 PiBrowser/2.0' });
  const p = await ctx.newPage(); const t0 = Date.now();
  await p.route('**/pi-sdk.js', (r) => r.fulfill({ body: 'window.Pi={init(){},authenticate:async()=>({accessToken:"tokC"})};', contentType: 'text/javascript' }));
  await p.route('https://fonts.**', (r) => r.abort());
  await p.addInitScript(() => { try { localStorage.setItem('oasis_tour', '1'); localStorage.setItem('oasis_lang', 'en'); } catch (e) {}
    window.addEventListener('DOMContentLoaded', () => { const f = document.createElement('div'); f.id = 'finger'; f.textContent = '👆'; f.style.cssText = 'position:fixed;z-index:99999;left:200px;top:700px;font-size:46px;pointer-events:none;transition:left .55s ease,top .55s ease;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))'; document.body.appendChild(f); }); });
  await p.goto(B + '/'); await p.waitForTimeout(2500);
  await p.evaluate(() => window.scrollTo(0, 0));
  const ready = (Date.now() - t0) / 1000; const marks = [];
  const mark = () => marks.push(+((Date.now() - t0) / 1000 - ready).toFixed(2));
  const pointTo = async (sel) => { const bx = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (!bx) return; await p.evaluate(({ x, y }) => { const f = document.getElementById('finger'); f.style.left = x - 12 + 'px'; f.style.top = y - 6 + 'px'; }, bx); await p.waitForTimeout(650); };
  const smooth = (sel) => p.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: 'center' }), sel);
  // S1 palm
  mark(); await smooth('#pmTree'); await p.waitForTimeout(900); await pointTo('#pmTree');
  for (let i = 0; i < 14; i++) { await p.dispatchEvent('#pmTree', 'pointerdown'); await p.waitForTimeout(260); }
  await p.waitForTimeout(500);
  // S2 hub
  mark(); await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('.hub').scrollIntoView({ behavior: 'smooth', block: 'start' })); await p.waitForTimeout(1600);
  await p.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await p.waitForTimeout(2200);
  // S3 castle
  mark(); await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await p.waitForTimeout(900);
  await smooth('#castleOpen'); await p.waitForTimeout(1500); await pointTo('#castleOpen'); await p.click('#castleOpen'); await p.waitForTimeout(2800);
  await p.evaluate(() => document.querySelector('[data-cs=close]').click()); await p.waitForTimeout(500);
  // S4 catalog
  mark(); await smooth('#catOpen'); await p.waitForTimeout(1500); await pointTo('#catOpen'); await p.click('#catOpen'); await p.waitForTimeout(3200);
  await p.evaluate(() => { const x = document.querySelector('#catalog .jm-back, #catalog [data-cat=close]'); if (x) x.click(); }); await p.waitForTimeout(500);
  // S5 daily code
  mark(); await smooth('#dayCode'); await p.waitForTimeout(800); await pointTo('#dayCode [data-dc=copy]'); await p.waitForTimeout(2200);
  // S6 VIP
  mark(); await smooth('#vipcOpen'); await p.waitForTimeout(1500); await pointTo('#vipcOpen'); await p.click('#vipcOpen'); await p.waitForTimeout(3300);
  await p.evaluate(() => document.querySelector('#vipc [data-vc=close]').click()); await p.waitForTimeout(500);
  // S7 ranking
  mark(); await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await p.waitForTimeout(500);
  await pointTo('[data-tab=rank]'); await p.click('[data-tab=rank]'); await p.waitForTimeout(1200); await p.evaluate(() => window.scrollBy({ top: 520, behavior: 'smooth' })); await p.waitForTimeout(2200);
  mark();
  const path = await p.video().path(); await ctx.close(); await b.close();
  console.log(JSON.stringify({ ready, marks, path }));
})();
