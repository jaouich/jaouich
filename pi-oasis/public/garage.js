// 🚗 Garage: cars bought with dates (small capped bonuses) and collector cars sold for Pi (limited, fixed contents). All car brands are invented.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("garage")) return;
  const GR = L.GARAGE, CR = L.CARS, fmtN = (n) => Number(n).toLocaleString("en-US");
  const pct = (x) => (Math.round(x * 1000) / 10).toString().replace(/\.0$/, "");
  let tab = "dates", busy = false, info = null;

  const SHAPES = { hatch: { c: [34, 82, 22], h: 16, len: 100 }, sedan: { c: [36, 92, 20], h: 15, len: 106 }, suv: { c: [28, 96, 26], h: 20, len: 104 }, coupe: { c: [44, 86, 18], h: 13, len: 106 }, pickup: { c: [24, 62, 24], h: 18, len: 108 }, limo: { c: [26, 104, 18], h: 13, len: 116 } };
  function carSvg(type, color) {
    const s = SHAPES[type] || SHAPES.sedan, x0 = (120 - s.len) / 2, y = 44 - s.h, [a, b, ch] = s.c;
    const w1 = x0 + 22, w2 = x0 + s.len - 22;
    return `<svg viewBox="0 0 120 56" class="gr-svg" aria-hidden="true">
      <ellipse cx="60" cy="52" rx="${s.len / 2 + 4}" ry="3" fill="rgba(0,0,0,.25)"/>
      <path d="M${a} ${y} L${a + 9} ${y - ch} L${b - 10} ${y - ch} L${b} ${y} Z" fill="${color}"/>
      <path d="M${a + 6} ${y} L${a + 12} ${y - ch + 4} L${b - 13} ${y - ch + 4} L${b - 5} ${y} Z" fill="#cfe8ff" opacity=".9"/>
      <rect x="${x0}" y="${y}" width="${s.len}" height="${s.h}" rx="7" fill="${color}"/>
      <rect x="${x0 + 4}" y="${y + 3}" width="${s.len - 8}" height="3" rx="1.5" fill="#fff" opacity=".35"/>
      <rect x="${x0 + s.len - 7}" y="${y + 3}" width="6" height="4" rx="2" fill="#fff7c2"/><rect x="${x0 + 1}" y="${y + 3}" width="5" height="4" rx="2" fill="#ff5252"/>
      <circle cx="${w1}" cy="46" r="8" fill="#1b1b1b"/><circle cx="${w1}" cy="46" r="3.5" fill="#cfd8dc"/>
      <circle cx="${w2}" cy="46" r="8" fill="#1b1b1b"/><circle cx="${w2}" cy="46" r="3.5" fill="#cfd8dc"/></svg>`;
  }
  const own = () => (G.S.garage && G.S.garage.own) || {};

  async function act(a) {
    if (busy) return; busy = true;
    try {
      if (!G.account) { const r = L.apply(G.S, a, { now: G.now(), tier: 0 }); G.S = r.s; G.saveGuest(); G.toast(G.msgText(r.msg)); }
      else { const r = await Pi.action(a); G.setClock(r.now); G.S = r.state; G.toast(G.msgText(r.msg)); G.burst(); }
    } catch (e) { G.toast(e.message); }
    busy = false; G.render(); draw();
  }
  async function loadInfo() { if (!G.account) return; try { info = await Pi.cars(); } catch (e) {} draw(); }

  const PHOTOS = !window.OASIS_CONFIG || window.OASIS_CONFIG.CAR_PHOTOS !== false;
  const img = (id, alt) => PHOTOS && L.LUXE.photo(id) ? `<img class="gr-img" src="${L.LUXE.photo(id)}" alt="${alt || ""}" loading="lazy" decoding="async" width="400" height="190">` : "";
  function starterCard(c, o, dates) {
    const lv = o[c.id] || 0, cost = lv ? (lv < GR.MAXLV ? GR.upCost(c, lv) : 0) : c.price, can = dates >= cost;
    return `<div class="gr-card ${lv ? "own" : ""}">${carSvg(c.type, c.color)}<b>${t("gr.c." + c.id)}</b>
      <small>${t("gr.bonus", { p: pct(c.b * (GR.LV[Math.max(0, lv - 1)] || 1)) })}${lv ? " · " + t("gr.level", { n: lv }) : ""}</small>
      ${lv >= GR.MAXLV ? `<span class="gr-max">✅ ${t("gr.max")}</span>` : `<button class="btn small ${lv ? "" : "gold"}" data-gr="${lv ? "up" : "buy"}" data-id="${c.id}" ${can && !busy ? "" : "disabled"}>${lv ? t("gr.up") : t("gr.buy")} · <span dir="ltr">${fmtN(cost)}</span> 🌴</button>`}</div>`;
  }
  function luxeCard(c, o, dates) {
    const lv = o[c.id] || 0, cost = lv ? (lv < GR.MAXLV ? GR.upCost(c, lv) : 0) : c.price, can = dates >= cost, name = t("gr.col." + c.col);
    return `<div class="gr-card lux ${lv ? "own" : ""}">${img(c.id, t("gr.m." + c.model) + " " + name)}<b>${name}</b>
      <small>${t("gr.bonus", { p: pct(c.b * (GR.LV[Math.max(0, lv - 1)] || 1)) })}${lv ? " · " + t("gr.level", { n: lv }) : ""}</small>
      ${lv >= GR.MAXLV ? `<span class="gr-max">✅ ${t("gr.max")}</span>` : `<button class="btn small ${lv ? "" : "gold"}" data-gr="${lv ? "up" : "buy"}" data-id="${c.id}" ${can && !busy ? "" : "disabled"}>${lv ? t("gr.up") : t("gr.buy")} · <span dir="ltr">${fmtN(cost)}</span> 🌴</button>`}</div>`;
  }
  function luxeSection(o, dates) {
    const LX = L.LUXE, have = LX.CARS.filter((c) => o[c.id]).length, crown = G.S.garage && G.S.garage.crown;
    const models = LX.MODELS.map((m) => {
      const cars = LX.CARS.filter((c) => c.model === m.id), n = cars.filter((c) => o[c.id]).length;
      return `<section class="gr-model"><h3>${t("gr.m." + m.id)} <small>· ${t("gr.n." + m.id)}</small></h3>
        <p class="gr-set ${n === 4 ? "full" : ""}">${t("gr.set", { n })}${n === 4 ? " · " + t("gr.setbonus", { p: pct(LX.SET) }) : ""}</p>
        <div class="gr-grid">${cars.map((c) => luxeCard(c, o, dates)).join("")}</div></section>`;
    }).join("");
    const cr = `<div class="gr-crown ${crown ? "own" : ""}"><b>🏆 ${t("gr.crown.t")}</b><small>${t("gr.crown.d", { n: fmtN(LX.CROWN) })}</small>
      ${crown ? `<span class="gr-max">${t("gr.crown.done")}</span>` : `<small>${t("gr.crown.have", { n: have })}</small><button class="btn small gold" data-gr="crown" ${have === LX.CARS.length && !busy ? "" : "disabled"}>${t("gr.crown.claim")}</button>`}</div>`;
    return `<h2 class="gr-h">${t("gr.lux.title")}</h2><p class="jm-note">${t("gr.lux.d")}</p>${models}${cr}`;
  }
  function datesTab() {
    const o = own(), bonus = GR.bonus(G.S), dates = Math.floor(G.S.dates);
    return `<div class="ct-me"><b>🚗 ${t("gr.total", { p: pct(bonus), m: pct(GR.CAP) })}</b><small>${t("gr.d")}</small><small>🌴 <span dir="ltr">${fmtN(dates)}</span></small></div>
      ${PHOTOS ? luxeSection(o, dates) : ""}
      <details class="gr-starter" ${PHOTOS ? "" : "open"}><summary>${t("gr.starter")}</summary><div class="gr-grid">${GR.CARS.map((c) => starterCard(c, o, dates)).join("")}</div></details>
      <p class="jm-note">${t("gr.rules")} ${PHOTOS ? t("gr.pics") : ""}</p>`;
  }
  function piTab() {
    const minted = (info && info.minted) || {};
    return `<p class="jm-note">${t("gr.pi.d")}</p><div class="gr-grid">` + CR.TIERS.map((c) => {
      const B = CR.bundle(c.n), left = c.max - (minted[c.n] || 0);
      return `<div class="gr-card pi">${PHOTOS ? img(CR.PHOTO[c.n - 1], t("n.c.car" + c.n)) : carSvg(c.type, c.color)}<b>${t("n.c.car" + c.n)}</b>
        <small>${t("gr.pi.contents", { d: fmtN(B.dates), j: B.jry, s: B.spins })}</small><small>${t("gr.pi.perk", { p: pct(c.perk) })}</small>
        <small>${t("gr.pi.left", { n: fmtN(Math.max(0, left)), m: fmtN(c.max) })}</small>
        ${left > 0 ? `<button class="btn small gold" data-gr="pi" data-n="${c.n}" data-price="${c.price}"><span dir="ltr">${c.price} Pi</span></button>` : `<span class="gr-max">${t("gr.pi.soldout")}</span>`}</div>`;
    }).join("") + `</div><p class="jm-note">${t("gr.pi.rules")}</p>`;
  }
  function draw() {
    const el = $("garage"); if (el.classList.contains("hidden")) return;
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-gr="close">‹ ${t("ct.back")}</button><b>🚗 ${t("gr.title")}</b><span></span></header>
      <div class="ct-tabs"><button data-gr="tab" data-t="dates" class="${tab === "dates" ? "on" : ""}">${t("gr.tab.dates")}</button><button data-gr="tab" data-t="pi" class="${tab === "pi" ? "on" : ""}">${t("gr.tab.pi")}</button></div>
      <div class="jm-body">${tab === "dates" ? datesTab() : piTab()}</div>`;
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#garageOpen")) { $("garage").classList.remove("hidden"); tab = "dates"; draw(); return loadInfo(); }
    const b = e.target.closest("#garage [data-gr]"); if (!b) return;
    const a = b.dataset.gr;
    if (a === "close") return $("garage").classList.add("hidden");
    if (a === "tab") { tab = b.dataset.t; draw(); return tab === "pi" ? loadInfo() : null; }
    if (a === "buy") return act({ type: "gBuy", id: b.dataset.id });
    if (a === "up") return act({ type: "gUp", id: b.dataset.id });
    if (a === "crown") return act({ type: "gCrown" });
    if (a === "pi") {
      if (!G.account) return G.toast(t("t.loginFirst"));
      const n = +b.dataset.n, price = +b.dataset.price;
      if (!confirm(t("gr.pi.confirm", { p: price }))) return;
      try { await Pi.buyCar(n, price); const me = await Pi.me(); G.setAccount(me.account); G.S = me.state; G.render(); G.toast(t("gr.pi.opened")); G.burst(); } catch (x) { G.toast(x.message); }
      loadInfo();
    }
  });
  document.addEventListener("langchange", draw);
})();
