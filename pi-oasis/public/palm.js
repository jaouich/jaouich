// 🌴 The Date Palm: hit it to knock dates down (energy, levels, golden hits) + yield multipliers (Club > Shop).
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("palm")) return;
  const P = L.P, fmtN = (n) => Number(n).toLocaleString("en-US");
  let pending = 0, timer = null, sending = false, last = 0;

  const palm = () => { const s = G.S; if (!s.palm) s.palm = L.freshPalm(G.now()); return s.palm; };
  function draw() {
    const el = $("palm"), p = palm(), n = G.now(), e = L.palmEnergy(p, n), max = P.maxEnergy(p.lv), acc = G.account;
    const mult = acc && acc.mult && acc.mult.until > Date.now() ? acc.mult : null;
    if (!el.firstChild) {
      el.innerHTML = `<h2>${t("palm.title")} <span id="pmBadge" class="pm-badge hidden"></span></h2>
        <button id="pmTree" class="pm-tree" type="button" aria-label="${t("palm.tap")}"><span class="pm-e">🌴</span><small>${t("palm.tap")}</small></button>
        <div class="pm-bar"><i id="pmFill"></i><b id="pmTxt"></b></div>
        <div class="pm-row"><span id="pmLv"></span><button id="pmUp" class="btn small gold" type="button"></button></div>
        <p class="hint">${t("palm.hint")}</p>`;
      $("pmTree").addEventListener("pointerdown", hit);
      $("pmUp").addEventListener("click", upgrade);
    }
    $("pmFill").style.width = Math.round((100 * e) / max) + "%";
    $("pmTxt").textContent = `${t("palm.energy")} ${e} / ${max}`;
    $("pmLv").textContent = `${t("palm.lv", { n: p.lv + 1 })} · ${t("palm.per", { n: P.perHit(p.lv) })}`;
    const up = $("pmUp"), maxed = p.lv >= P.MAX_LV;
    up.textContent = maxed ? t("palm.max") : `${t("palm.up")} · ${t("palm.upCost", { c: fmtN(P.upCost(p.lv)) })}`;
    up.disabled = maxed || G.S.dates < P.upCost(p.lv);
    const b = $("pmBadge");
    b.classList.toggle("hidden", !mult);
    if (mult) b.textContent = t("mult.badge", { f: mult.f });
    $("pmTree").classList.toggle("tired", e <= 0);
  }
  function floatText(txt, gold) {
    const tree = $("pmTree"), f = document.createElement("span");
    f.className = "pm-float" + (gold ? " gold" : ""); f.textContent = txt;
    f.style.left = 30 + Math.random() * 40 + "%";
    tree.appendChild(f); setTimeout(() => f.remove(), 900);
  }
  function hit(ev) {
    ev.preventDefault();
    const acc = G.account, n = G.now(), p = palm();
    if (L.palmEnergy(p, n) <= 0) { G.toast(t("e.noEnergy")); return; }
    const tree = $("pmTree"); tree.classList.remove("shake"); void tree.offsetWidth; tree.classList.add("shake");
    try {
      const before = G.S.dates;
      const r = L.apply(G.S, { type: "pTap", n: 1 }, { now: n, tier: acc ? acc.tier : 0, mult: acc && acc.mult && acc.mult.until > Date.now() ? acc.mult.f : 1 });
      G.S = r.s;
      floatText("+" + fmtN(G.S.dates - before), r.palm && r.palm.gold);
      if (r.palm && r.palm.gold) G.burst();
    } catch (e) { return; }
    $("dates").textContent = G.S.dates.toLocaleString("en-US");
    draw();
    if (!acc) { clearTimeout(timer); timer = setTimeout(() => { G.saveGuest(); G.render(); }, 600); return; }
    pending++;
    if (!timer) timer = setTimeout(flush, 700);
  }
  async function flush() {
    timer = null;
    if (sending || !pending) { if (pending && !timer) timer = setTimeout(flush, 400); return; }
    sending = true;
    const n = Math.min(pending, P.MAX_BATCH); pending -= n;
    try {
      const r = await Pi.action({ type: "pTap", n });
      G.setClock(r.now); if (!pending) G.S = r.state;
      G.render();
    } catch (e) {
      pending = 0;
      if (e && e.code !== "noEnergy") G.toast(e.message);
      try { const r = await Pi.action({ type: "cityTick" }); G.setClock(r.now); G.S = r.state; G.render(); } catch (x) {}
    }
    sending = false;
    if (pending) timer = setTimeout(flush, 300);
  }
  async function upgrade() {
    const b = $("pmUp"); b.disabled = true;
    try {
      if (!G.account) { const r = L.apply(G.S, { type: "pUp" }, { now: G.now(), tier: 0 }); G.S = r.s; G.saveGuest(); G.toast(G.msgText(r.msg)); }
      else { if (pending) await flush(); const r = await Pi.action({ type: "pUp" }); G.setClock(r.now); G.S = r.state; G.toast(G.msgText(r.msg)); G.burst(); }
    } catch (e) { G.toast(e.message); }
    G.render();
  }

  // ---- Yield multipliers (Club > Shop) ----
  function drawMult() {
    const el = $("multBox"); if (!el) return;
    const acc = G.account, cur = acc && acc.mult && acc.mult.until > Date.now() ? acc.mult : null;
    el.innerHTML = `<h2>⚡ ${t("mult.t")}</h2><p class="hint">${t("mult.d")}</p>
      ${cur ? `<p class="mult-on">✅ ${t("mult.active", { f: cur.f, d: new Date(cur.until).toLocaleDateString() })}</p>` : ""}
      <div class="mult-grid">${L.MULT.map((m) => `<div class="mult-card mult-${m.id}"><b>×${m.f}</b><small>${t("mult.price", { p: m.price, d: m.days })}</small>
        <button class="btn small gold" data-mult="${m.id}" ${cur && m.f < cur.f ? "disabled" : ""}>${t("mult.buy")}</button></div>`).join("")}</div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-mult]"); if (!b) return;
    if (!G.account) return G.toast(t("t.loginFirst"));
    const m = L.multById(b.dataset.mult);
    if (!confirm(t("mult.confirm", { f: m.f, p: m.price, d: m.days }))) return;
    b.disabled = true;
    try {
      const r = await Pi.buyMult(m.id);
      if (r.account) G.setAccount(r.account);
      if (r.state) G.S = r.state;
      G.toast(t("mult.bought")); G.burst();
    } catch (err) { G.toast(err.message); }
    drawMult(); draw();
  });

  const tick = () => { draw(); drawMult(); };
  tick();
  setInterval(draw, 500);
  setInterval(drawMult, 5000);
  document.addEventListener("langchange", () => { $("palm").innerHTML = ""; tick(); });
  const orig = G.render; // keep the palm in step with every redraw of the game
  G.render = () => { orig(); draw(); };
})();
