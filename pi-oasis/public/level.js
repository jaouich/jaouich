// 🌾 Harvest levels: a progress bar on the Farm tab and a Levels page (rewards, ranking). XP = dates earned honestly.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("levels")) return;
  const LV = L.LV, fmtN = (n) => Number(n).toLocaleString("en-US");
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = (l) => t(l > 30 ? "lv.t.10" : "lv.t." + LV.tier(l)) + " " + l;
  let D = null, top = null, busy = false, seen = 0;

  function bar() {
    const el = $("lvBar"); if (!el) return;
    const v = LV.view((G.S && G.S.xp) || 0);
    el.innerHTML = `<i>${LV.icon(v.lv)}</i><span><b>${t("lv.lv", { n: v.lv })} · ${name(v.lv).replace(/ \d+$/, "")}</b><em><u style="width:${Math.min(100, Math.round((100 * v.cur) / v.span))}%"></u></em><small dir="ltr">${fmtN(v.cur)} / ${fmtN(v.span)} XP</small></span>`;
    try { const b = Number(localStorage.getItem("oasis_best_lv") || 0); if (v.lv > b) { if (b && G.account) G.toast("🎉 " + t("lv.up", { n: v.lv })); localStorage.setItem("oasis_best_lv", String(v.lv)); } } catch (e) {}
  }
  async function load() {
    if (!G.account) { D = null; return paint(); }
    try { D = await Pi.level(); top = (await Pi.levelTop()).top; } catch (e) { G.toast(e.message); }
    paint();
  }
  function paint() {
    const el = $("levels"); if (el.classList.contains("hidden")) return;
    const v = LV.view(D ? D.xp : (G.S && G.S.xp) || 0), pend = (D && D.pending) || [];
    const sum = pend.reduce((a, p) => ({ d: a.d + p.dates, j: a.j + p.jry, s: a.s + p.spins }), { d: 0, j: 0, s: 0 });
    const rows = []; for (let l = Math.max(2, v.lv - 2); l <= v.lv + 8; l++) { const r = LV.reward(l), got = l <= v.lv; rows.push(`<div class="lv-row ${got ? "got" : ""}"><i>${LV.icon(l)}</i><span><b>${t("lv.lv", { n: l })}</b><small dir="ltr">${fmtN(LV.need(l))} XP</small></span><em dir="ltr">+${fmtN(r.dates)} 🌴${r.jry ? ` · +${r.jry} JRY` : ""}${r.spins ? " · 🎡" : ""}</em></div>`); }
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-lv="close">‹ ${t("ct.back")}</button><b>${t("lv.title")}</b><span></span></header>
      <div class="jm-body"><div class="ct-me"><b>${LV.icon(v.lv)} ${t("lv.lv", { n: v.lv })} · ${name(v.lv).replace(/ \d+$/, "")}</b><em class="lv-meter"><u style="width:${Math.min(100, Math.round((100 * v.cur) / v.span))}%"></u></em><small dir="ltr">${fmtN(v.cur)} / ${fmtN(v.span)} XP</small><small>${t("lv.how")}</small>
      ${pend.length ? `<button class="btn gold" data-lv="claim" ${busy ? "disabled" : ""}>🎁 ${t("lv.claim", { n: pend.length })} (+${fmtN(sum.d)} 🌴${sum.j ? " · +" + sum.j + " JRY" : ""}${sum.s ? " · " + sum.s + " 🎡" : ""})</button>` : `<small>${t("lv.nopend")}</small>`}
      <small>${t("lv.jry")}</small></div>
      <h4>${t("lv.rewards")}</h4>${rows.join("")}
      <h4>🏆 ${t("lv.top")}</h4>${(top || []).length ? top.map((x, i) => `<div class="ct-row"><i>${i + 1}</i><span><b>${esc(x.username)}</b><small>${t("lv.lv", { n: x.lv })}</small></span><em dir="ltr">${fmtN(x.xp)} XP</em></div>`).join("") : `<p class="jm-note">${t("ct.empty")}</p>`}</div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#lvBar,[data-lv]"); if (!b) return;
    const a = b.dataset ? b.dataset.lv : null;
    if (b.id === "lvBar") { $("levels").classList.remove("hidden"); paint(); return load(); }
    if (a === "close") return $("levels").classList.add("hidden");
    if (a === "claim") { try { busy = true; const r = await Pi.levelClaim(); G.toast(t("lv.got", { d: fmtN(r.dates), j: r.jry })); const m = await Pi.me(); if (m && m.state) { G.S = m.state; G.render(); } } catch (x) { G.toast(x.message); } busy = false; load(); }
  });
  const orig = G.render; G.render = () => { orig(); bar(); };
  document.addEventListener("langchange", () => { bar(); paint(); });
  bar();
})();
