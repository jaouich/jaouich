// 👑 VIP Club: for members only (5 Pi / 30 days, or a gift). Hall of Glory + the Sultan's Caravan game.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const VL = window.VipLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!VL || !G || !$("vipc")) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const dt = (ms) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  let data = null, tab = "hall", busy = false, pick = { city: 0, good: 0, qty: 10, guards: 0 }, last = null;

  async function load() {
    if (!G.account) { data = null; return render(); }
    try { data = await Pi.vipc(); } catch (e) { G.toast(e.message); }
    render();
  }
  const medal = (i) => (i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1 + ".");
  const crown = (p) => (p >= 1000 ? "🌟" : p >= 100 ? "💎" : p >= 20 ? "👑" : "✨");
  const danger = (n) => "💀".repeat(n) + "▫️".repeat(3 - n);

  function gate() {
    const top = (data.hall || []).slice(0, 3);
    return `<div class="vc-hero"><div class="vc-crown">👑</div><h2>${t("vc.t")}</h2><p>${t("vc.lead")}</p>
      <ul class="vc-perks"><li>🏛️ ${t("vc.p1")}</li><li>🐫 ${t("vc.p2")}</li><li>🏆 ${t("vc.p3")}</li><li>💎 ${t("vc.p4")}</li></ul>
      <button class="btn gold vc-buy" data-vc="buy">${t("vc.join", { p: data.price })}</button>
      <small class="vc-free">${t("vc.free")}</small></div>
      ${top.length ? `<div class="vc-teaser"><b>🏛️ ${t("vc.hall")} · ${t("vc.count", { n: data.hallCount })}</b>${top.map((x, i) => `<div class="vc-row"><span>${medal(i)} ${esc(x.username)}</span><i>🔒</i></div>`).join("")}</div>` : ""}`;
  }
  function hall() {
    return `<p class="vc-note">${t("vc.hallD")}</p>` + (data.hall.length ? data.hall.map((x, i) => `<div class="vc-row ${i < 3 ? "top" + i : ""}"><span>${medal(i)} ${esc(x.username)}</span><b dir="ltr">${crown(x.paid)} ${fmtN(x.paid)} Pi</b></div>`).join("") : `<p class="vc-note">${t("vc.hallNone")}</p>`);
  }
  function game() {
    const g = data.game, m = g.market, city = m.cities[pick.city], good = VL.GOODS[pick.good];
    const maxQ = Math.max(1, Math.min(g.cap, Math.floor(Math.max(0, g.gold - pick.guards * VL.GAME.GUARD_COST) / m.buy[good.id])));
    pick.qty = Math.min(Math.max(1, pick.qty), maxQ);
    let prev = null;
    try { prev = VL.voyage({ gold: g.gold, profit: g.profit, day: VL.dayId(G.now()), used: 0 }, { city: city.id, good: good.id, qty: pick.qty, guards: pick.guards }, G.now()); } catch (e) {}
    const best = {}; VL.GOODS.forEach((x) => { best[x.id] = Math.max(...m.cities.map((c) => c.sell[x.id])); });
    return `<div class="vc-stats"><span>🪙 <b>${fmtN(g.gold)}</b><small>${t("vc.gold")}</small></span><span>⭐ <b>${g.level}</b><small>${t("vc.level")}</small></span><span>📦 <b>${g.cap}</b><small>${t("vc.cap")}</small></span><span>🐫 <b>${g.left}</b><small>${t("vc.left")}</small></span></div>
      <h4>${t("vc.market")}</h4>
      <div class="vc-mkt"><div class="vc-mr vc-mh"><span></span>${VL.GOODS.map((x) => `<span>${x.e}</span>`).join("")}</div>
        <div class="vc-mr"><span>${t("vc.buy")}</span>${VL.GOODS.map((x) => `<b>${m.buy[x.id]}</b>`).join("")}</div>
        ${m.cities.map((c, i) => `<div class="vc-mr ${i === pick.city ? "sel" : ""}"><span>${VL.CITIES.find((z) => z.id === c.id).e} ${t("vc.c." + c.id)} <small>${danger(c.danger)}</small></span>${VL.GOODS.map((x) => `<b class="${c.sell[x.id] === best[x.id] ? "best" : ""}">${c.sell[x.id]}</b>`).join("")}</div>`).join("")}</div>
      <h4>${t("vc.plan")}</h4>
      <div class="vc-pick">${m.cities.map((c, i) => `<button data-vc="city" data-i="${i}" class="${i === pick.city ? "on" : ""}">${VL.CITIES.find((z) => z.id === c.id).e}<small>${t("vc.c." + c.id)}</small></button>`).join("")}</div>
      <div class="vc-pick">${VL.GOODS.map((x, i) => `<button data-vc="good" data-i="${i}" class="${i === pick.good ? "on" : ""}">${x.e}<small>${t("vc.g." + x.id)}</small></button>`).join("")}</div>
      <label class="vc-q">${t("vc.qty")}: <b id="vcQ">${pick.qty}</b> / ${maxQ}<input id="vcQty" type="range" min="1" max="${maxQ}" value="${pick.qty}"></label>
      <div class="vc-pick">${[0, 1, 2, 3].map((n) => `<button data-vc="guards" data-i="${n}" class="${n === pick.guards ? "on" : ""}">🛡️ ${n}<small>${n * VL.GAME.GUARD_COST} 🪙</small></button>`).join("")}</div>
      ${prev ? `<div class="vc-prev ${prev.profit >= 0 ? "up" : "down"}"><span>${t("vc.exp")}</span><b dir="ltr">${prev.profit >= 0 ? "+" : ""}${fmtN(prev.profit)} 🪙</b><small>${prev.lossPct ? t("vc.loss", { n: prev.lossPct }) : t("vc.safe")}</small></div>` : ""}
      <button class="btn gold vc-go" data-vc="go" ${g.left > 0 && prev && !busy ? "" : "disabled"}>${g.left > 0 ? "🐫 " + t("vc.send") : t("vc.none")}</button>
      ${last ? `<div class="vc-res">${t("vc.res", { p: (last.profit >= 0 ? "+" : "") + fmtN(last.profit), c: fmtN(last.coins) })}</div>` : ""}
      <h4>🏆 ${t("vc.rank")}</h4>${g.top.length ? g.top.map((x, i) => `<div class="vc-row"><span>${medal(i)} ${esc(x.username)}</span><b dir="ltr">${fmtN(x.profit)} 🪙</b></div>`).join("") : `<p class="vc-note">${t("vc.rankNone")}</p>`}
      <p class="vc-note">${t("vc.rule")}</p>`;
  }
  function render() {
    const el = $("vipc");
    if (el.classList.contains("hidden")) return;
    let body;
    if (!G.account) body = `<p class="jm-note">${t("t.loginFirst")}</p>`;
    else if (!data) body = `<p class="jm-note">…</p>`;
    else if (!data.member) body = gate();
    else body = `<div class="vc-status">👑 ${t("vc.member", { d: dt(data.until) })} <button class="btn small secondary" data-vc="buy">${t("vc.extend", { p: data.price })}</button></div>
      <div class="vc-tabs"><button data-vc="tab" data-t="hall" class="${tab === "hall" ? "on" : ""}">🏛️ ${t("vc.hall")}</button><button data-vc="tab" data-t="game" class="${tab === "game" ? "on" : ""}">🐫 ${t("vc.caravan")}</button></div>` + (tab === "hall" ? hall() : game());
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-vc="close">‹ ${t("jm.back")}</button><b>👑 ${t("vc.t")}</b><span></span></header><div class="jm-body">${body}</div>`;
  }
  $("vipc").addEventListener("input", (e) => { if (e.target.id === "vcQty") { pick.qty = Number(e.target.value); render(); } });
  $("vipc").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-vc]"); if (!b) return;
    const a = b.dataset.vc, i = Number(b.dataset.i);
    if (a === "close") { $("vipc").classList.add("hidden"); return; }
    if (a === "tab") { tab = b.dataset.t; return render(); }
    if (a === "city") { pick.city = i; return render(); }
    if (a === "good") { pick.good = i; return render(); }
    if (a === "guards") { pick.guards = i; return render(); }
    try {
      if (a === "buy") {
        if (!G.account) return G.toast(t("t.loginFirst"));
        if (!confirm(t("vc.confirm", { p: data.price }))) return;
        b.disabled = true;
        const r = await Pi.buyVipc(); if (r.account) G.setAccount(r.account); G.toast(t("vc.joined")); G.burst(); await load();
      } else if (a === "go") {
        busy = true; render();
        const g = data.game, m = g.market;
        const r = await Pi.vipcVoyage({ city: m.cities[pick.city].id, good: VL.GOODS[pick.good].id, qty: pick.qty, guards: pick.guards });
        last = r; busy = false; if (r.profit > 0) G.burst();
        await load();
      }
    } catch (err) { busy = false; G.toast(err.message); render(); }
  });
  if ($("vgGo")) $("vgGo").addEventListener("click", async () => {
    try { const r = await Pi.adminVipc($("vgUser").value.trim(), Number($("vgDays").value)); G.toast("👑 " + r.username + " +" + $("vgDays").value); } catch (e) { G.toast(e.message); }
  });
  $("vipcOpen").addEventListener("click", () => { $("vipc").classList.remove("hidden"); render(); load(); });
  document.addEventListener("langchange", render);
})();
