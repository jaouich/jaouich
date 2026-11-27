// 🔥 Daily streak + 🏅 achievements: one bar on the Farm tab, one page with the 7-day calendar and the badge shelf.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("ach")) return;
  let st = null, ac = null, busy = false;
  const fmtN = (n) => Number(n).toLocaleString("en-US");

  async function refresh() {
    if (!G.account) { st = ac = null; return bar(); }
    try { st = await Pi.streak(); ac = await Pi.ach(); } catch (e) {}
    bar(); paint();
  }
  function bar() {
    const el = $("achBar"); if (!el) return;
    if (!G.account) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const pend = ac ? ac.list.filter((a) => a.done && !a.claimed).length : 0, can = st && !st.claimed;
    el.innerHTML = `<i>🔥</i><span><b>${t("ach.bar")}</b><small>${st ? (can ? t("ach.todayOpen", { d: st.day }) : t("ach.streakN", { n: st.n })) : "…"}${pend ? " · " + t("ach.pend", { n: pend }) : ""}</small></span>${can || pend ? '<b class="dot"></b>' : ""}`;
  }
  function paint() {
    const el = $("ach"); if (el.classList.contains("hidden")) return;
    const days = L.STREAK7.DATES.map((d, i) => { const n = i + 1, done = st && (st.claimed ? n <= st.day : n < st.day), now = st && !st.claimed && n === st.day;
      return `<div class="ach-day ${done ? "done" : ""} ${now ? "now" : ""}"><small>${t("ach.day", { n })}</small><b>${n === 7 ? "🎁" : "🌴"}</b><small dir="ltr">${fmtN(d)}${n === 7 ? " +" + L.STREAK7.JRY7 + " JRY" : ""}</small></div>`; }).join("");
    const pend = ac ? ac.list.filter((a) => a.done && !a.claimed).length : 0;
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-ach="close">‹ ${t("ct.back")}</button><b>${t("ach.title")}</b><span></span></header>
      <div class="jm-body"><div class="ct-me"><b>🔥 ${t("ach.streak")}</b><small>${t("ach.how")}</small><div class="ach-days">${days}</div>
      ${st && !st.claimed ? `<button class="btn gold" data-ach="streak" ${busy ? "disabled" : ""}>🎁 ${t("ach.claimDay", { d: st.day })}</button>` : `<small>${t("ach.comeBack")}</small>`}</div>
      <h4>🏅 ${t("ach.shelf")}</h4>
      ${pend ? `<button class="btn gold" data-ach="claim" ${busy ? "disabled" : ""}>🎁 ${t("ach.claimAll", { n: pend })}</button>` : ""}
      <div class="ach-grid">${(ac ? ac.list : []).map((a) => `<div class="ach-card ${a.claimed ? "got" : a.done ? "ready" : ""}"><i>${a.e}</i><b>${t("ach.n." + a.id)}</b><small>${a.claimed ? "✅" : "+" + a.jry + " JRY"}</small></div>`).join("")}</div>
      <p class="jm-note">${t("lv.jry")}</p></div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#achBar,[data-ach]"); if (!b) return;
    if (b.id === "achBar") { $("ach").classList.remove("hidden"); paint(); return refresh(); }
    const a = b.dataset.ach;
    if (a === "close") return $("ach").classList.add("hidden");
    busy = true;
    try {
      if (a === "streak") { const r = await Pi.streakClaim(); G.toast(t("ach.gotDay", { d: fmtN(r.dates) })); }
      if (a === "claim") { const r = await Pi.achClaim(); G.toast(t("ach.gotJry", { j: r.jry })); }
      const m = await Pi.me(); if (m && m.state) { G.S = m.state; G.render(); }
    } catch (x) { G.toast(x.message); }
    busy = false; refresh();
  });
  document.addEventListener("langchange", () => { bar(); paint(); });
  const orig = G.render; let loaded = false; const kick = () => { if (!loaded && G.account) { loaded = true; refresh(); } }; G.render = () => { orig(); kick(); }; setInterval(kick, 1000);
})();
