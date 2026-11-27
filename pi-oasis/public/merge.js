// 🐎 Horse Merge: tap a horse, then tap an equal horse to merge into the next level. No maximum level.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("merge")) return;
  const MG = L.MG, fmtN = (n) => Number(n).toLocaleString("en-US");
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nm = (l) => (l <= 12 ? t("mg.n." + (l - 1)) : t("mg.n.x") + " " + (l - 12));
  let sel = -1, busy = false, info = null, shown = false;
  const m = () => { const s = G.S; if (!s.merge || !Array.isArray(s.merge.grid)) s.merge = MG.fresh(G.now()); return s.merge; };

  async function act(a) {
    if (busy) return; busy = true;
    try {
      if (!G.account) { const r = L.apply(G.S, a, { now: G.now(), tier: 0 }); G.S = r.s; G.saveGuest(); G.toast(G.msgText(r.msg)); }
      else { const r = await Pi.action(a); G.setClock(r.now); G.S = r.state; G.toast(G.msgText(r.msg)); if (a.type === "mgDrop") G.burst(); }
    } catch (e) { G.toast(e.message); }
    busy = false; G.render(); draw();
  }
  async function loadInfo() { if (!G.account) return; try { info = await Pi.merge(); } catch (e) {} draw(); }
  function draw() {
    const el = $("merge"); if (el.classList.contains("hidden")) return;
    const g = m(), now = G.now(), rdy = MG.ready(g, now), cost = MG.cost(g.best), hr = MG.perHour(g);
    const cells = g.grid.map((l, i) => `<button type="button" class="mg-cell ${l ? "has" : ""} ${i === sel ? "sel" : ""}" data-mg="cell" data-i="${i}">${l ? `<i>${MG.icon(l)}</i><b>${l}</b>` : ""}</button>`).join("");
    const pend = (info && info.pending) || [];
    const sumJ = pend.reduce((a, p) => a + p.jry, 0);
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-mg="close">‹ ${t("ct.back")}</button><b>🐎 ${t("mg.title")}</b><span></span></header>
      <div class="jm-body"><p class="jm-note">${t("mg.d")}</p>
      <div class="mg-stats"><span>🌴 <b dir="ltr">${fmtN(Math.floor(G.S.dates))}</b></span><span>⏱️ <b dir="ltr">+${fmtN(hr)}/h</b></span><span>🏆 ${t("mg.best", { n: g.best })}</span></div>
      <div class="mg-grid">${cells}</div>
      <div class="mg-sel">${sel >= 0 && g.grid[sel] ? `${MG.icon(g.grid[sel])} ${nm(g.grid[sel])} · ${t("mg.rate", { n: fmtN(MG.rate(g.grid[sel])) })}` : t("mg.pick")}</div>
      <div class="mg-btns"><button class="btn gold" data-mg="buy" ${busy ? "disabled" : ""}>🐴 ${t("mg.buy")} · ${fmtN(cost)} 🌴</button>
      <button class="btn" data-mg="collect" ${rdy < 1 || busy ? "disabled" : ""}>🌴 ${t("mg.collect")} +${fmtN(rdy)}</button>
      <button class="btn small secondary" data-mg="sell" ${sel < 0 || !g.grid[sel] || busy ? "disabled" : ""}>${t("mg.sell")}${sel >= 0 && g.grid[sel] ? " +" + fmtN(MG.sellPrice(g.grid[sel])) : ""}</button></div>
      <p class="jm-note">${t("mg.store")}</p>
      ${pend.length ? `<button class="btn gold" data-mg="claim">🎁 ${t("mg.claim", { n: pend.length, j: fmtN(sumJ) })}</button>` : `<p class="jm-note">${t("mg.ms")}</p>`}
      <h4>🏆 ${t("mg.top")}</h4>${info ? `<p class="jm-note">${info.me.rank ? t("mg.me", { r: info.me.rank, p: fmtN(info.me.pts) }) : t("mg.me0")}</p>` + (info.top.length ? info.top.slice(0, 30).map((x) => `<div class="ct-row"><i>${x.rank}</i><span><b>${esc(x.username)}</b><small>${x.prize.dates ? "+" + fmtN(x.prize.dates) + " 🌴" : ""}${x.prize.jry ? " · +" + x.prize.jry + " JRY" : ""}</small></span><em dir="ltr">${fmtN(x.pts)}</em></div>`).join("") : `<p class="jm-note">${t("ct.empty")}</p>`) : `<p class="jm-note">${G.account ? "…" : t("t.loginFirst")}</p>`}
      <p class="jm-note">${t("lv.jry")}</p></div>`;
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#mergeOpen")) { $("merge").classList.remove("hidden"); sel = -1; draw(); return loadInfo(); }
    const b = e.target.closest("#merge [data-mg]"); if (!b) return;
    const a = b.dataset.mg, g = m();
    if (a === "close") return $("merge").classList.add("hidden");
    if (a === "buy") return act({ type: "mgBuy" });
    if (a === "collect") return act({ type: "mgCollect" });
    if (a === "sell") { const i = sel; sel = -1; return act({ type: "mgSell", cell: i }); }
    if (a === "claim") { try { const r = await Pi.mergeClaim(); G.toast(t("mg.got", { j: r.jry })); } catch (x) { G.toast(x.message); } return loadInfo(); }
    if (a === "cell") {
      const i = Number(b.dataset.i);
      if (sel < 0) { if (g.grid[i]) sel = i; return draw(); }
      if (sel === i) { sel = -1; return draw(); }
      const from = sel; sel = -1; return act({ type: "mgDrop", from, to: i });
    }
  });
  setInterval(() => { if (!$("merge").classList.contains("hidden") && !busy) draw(); }, 2000);
  document.addEventListener("langchange", draw);
})();
