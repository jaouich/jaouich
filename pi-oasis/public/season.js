// 🏆 Seasons: 4 weeks, points from every game, a reward track and prizes for the top 10.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G || !$("season")) return;
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DIV = ["🥉", "🥈", "🥇", "💎", "👑"], NAMES = ["bronze", "silver", "gold", "diamond", "champion"];
  let D = null, busy = false;
  const rew = (x) => [x.dates ? "+" + fmtN(x.dates) + " 🌴" : "", x.jry ? "+" + x.jry + " JRY" : "", x.spins ? x.spins + " 🎡" : ""].filter(Boolean).join(" · ");
  function lastCard() {
    const l = D && D.last; if (!l) return "";
    return `<div class="ct-me lg-last lg-${l.outcome}"><b>${l.outcome === "up" ? "⬆️" : l.outcome === "down" ? "⬇️" : "➡️"} ${t("se.last." + l.outcome, { d: t("se.div." + NAMES[l.to]) })}</b><small>${t("se.lastD", { r: l.rank, n: l.size, p: fmtN(l.sp) })} · +${fmtN(l.dates)} 🌴${l.jry ? " · +" + fmtN(l.jry) + " JRY" : ""}</small></div>`;
  }
  async function load() { if (!G.account) { D = null; return paint(); } try { D = await Pi.season(); } catch (e) { G.toast(e.message); } paint(); }
  function paint() {
    const el = $("season"); if (el.classList.contains("hidden")) return;
    const days = D ? Math.max(0, Math.ceil((D.ends - Date.now()) / 86400000)) : 0, open = D ? D.tiers.filter((x) => x.open && !x.claimed).length : 0;
    const nxt = D ? D.tiers.find((x) => !x.open) : null;
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-se="close">‹ ${t("ct.back")}</button><b>🏆 ${t("se.title")}</b><span></span></header>
      <div class="jm-body"><p class="jm-note">${t("se.d")}</p>
      ${D ? `${lastCard()}<div class="ct-me"><b>${DIV[D.div]} ${t("se.div." + NAMES[D.div])} · ${t("se.me", { p: fmtN(D.sp) })}${D.rank ? " · #" + D.rank + "/" + D.size : ""}</b><small>${t("se.left", { d: days })}</small><small>${D.zone ? t("se.zones", { n: D.zone }) : t("se.noZones")}</small>
        ${nxt ? `<em class="lv-meter"><u style="width:${Math.min(100, Math.round((100 * D.sp) / nxt.sp))}%"></u></em><small dir="ltr">${fmtN(D.sp)} / ${fmtN(nxt.sp)} SP</small>` : ""}
        ${open ? `<button class="btn gold" data-se="claim" ${busy ? "disabled" : ""}>🎁 ${t("se.claim", { n: open })}</button>` : ""}</div>
      <h4>${t("se.track")}</h4>${D.tiers.map((x, i) => `<div class="lv-row ${x.open ? "got" : ""}"><i>${x.claimed ? "✅" : x.open ? "🎁" : "🔒"}</i><span><b>${t("se.tier", { n: i + 1 })}</b><small dir="ltr">${fmtN(x.sp)} SP</small></span><em dir="ltr">${rew(x)}</em></div>`).join("")}
      <h4>🏅 ${t("se.prizes")}</h4><p class="jm-note">${t("se.prizeD", { a: D.prizes[0], b: D.prizes[1], c: D.prizes[2], d: D.prizes[3] })}</p>
      <h4>${DIV[D.div]} ${t("se.top")}</h4>${D.top.length ? D.top.map((x) => `<div class="ct-row ${x.zone === "up" ? "zone-up" : x.zone === "down" ? "zone-down" : ""}"><i>${x.zone === "up" ? "⬆️" : x.zone === "down" ? "⬇️" : x.rank}</i><span><b>${esc(x.username)}</b></span><em dir="ltr">${fmtN(x.sp)} SP</em></div>`).join("") : `<p class="jm-note">${t("ct.empty")}</p>`}
      <h4>🌍 ${t("se.general")}</h4>${D.general.map((x) => `<div class="ct-row"><i>${x.rank}</i><span><b>${esc(x.username)}</b><small>${DIV[x.div]} ${t("se.div." + NAMES[x.div])}</small></span><em dir="ltr">${fmtN(x.sp)} SP</em></div>`).join("") || `<p class="jm-note">${t("ct.empty")}</p>`}`
      : `<p class="jm-note">${G.account ? "…" : t("t.loginFirst")}</p>`}<p class="jm-note">${t("lv.jry")}</p></div>`;
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#seasonOpen")) { $("season").classList.remove("hidden"); paint(); return load(); }
    const b = e.target.closest("#season [data-se]"); if (!b) return;
    if (b.dataset.se === "close") return $("season").classList.add("hidden");
    if (b.dataset.se === "claim") { busy = true; try { const r = await Pi.seasonClaim(); G.toast(t("se.got", { d: fmtN(r.dates), j: r.jry })); const m = await Pi.me(); if (m && m.state) { G.S = m.state; G.render(); } } catch (x) { G.toast(x.message); } busy = false; load(); }
  });
  async function popup() {
    if (!G.account) return;
    try { const d = await Pi.season(), l = d.last, k = "oasis_lg_seen"; if (l && String(localStorage.getItem(k)) !== String(l.season)) { localStorage.setItem(k, String(l.season)); G.toast((l.outcome === "up" ? "⬆️ " : l.outcome === "down" ? "⬇️ " : "➡️ ") + t("se.last." + l.outcome, { d: t("se.div." + NAMES[l.to]) })); } } catch (e) {}
  }
  let shown = false; const pt = setInterval(() => { if (!shown && G.account) { shown = true; popup(); clearInterval(pt); } }, 1500);
  document.addEventListener("langchange", paint);
})();
