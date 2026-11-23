// 👑 The Throne: the King of the Game at the top of the Ranking tab, and the button to take it.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge, L = window.OasisLogic;
  if (!G || !$("throne")) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  let last = null, lastMe = "";
  function draw(k, me) {
    last = k; lastMe = me;
    const el = $("throne");
    if (!k) { el.innerHTML = ""; return; }
    const mine = k.active && k.username === me;
    const v = { d: fmtN(k.gift.dates), c: fmtN(k.gift.coins), j: fmtN(k.gift.jry), m: k.mult, n: k.days, p: fmtN(k.nextPrice), e: k.nextEd, u: esc(k.username || "") };
    el.innerHTML = `<div class="th-card ${k.active ? "on" : ""}"><div class="th-crown">👑</div>
      <b>${t("th.t")}</b>
      ${k.active ? `<div class="th-king">${mine ? t("th.yours") : t("th.king", v)}</div><small>${t("th.until", { d: new Date(k.until).toLocaleDateString(), e: k.ed })}</small>` : `<div class="th-king">${t("th.empty")}</div><small>${t("th.empty2")}</small>`}
      <p class="th-perks">${t("th.perks", v)}</p>
      <button class="btn gold th-buy" data-th="buy" type="button">${t("th.price", v)}</button>
      <p class="hint">${t("th.note", v)}</p></div>`;
  }
  $("throne").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-th=buy]"); if (!b || !last) return;
    if (!G.account) return G.toast(t("t.loginFirst"));
    if (!confirm(t("th.confirm", { p: fmtN(last.nextPrice), e: last.nextEd }))) return;
    b.disabled = true;
    try {
      const r = await Pi.buyRoyal("king", last.nextEd);
      if (r.account) G.setAccount(r.account); if (r.state) G.S = r.state;
      G.toast(t("th.bought")); G.burst();
      const lb = await Pi.leaderboard(); draw(lb.king, G.account.username);
    } catch (err) { G.toast(err.message); b.disabled = false; }
  });
  window.OasisThrone = { draw };
  document.addEventListener("langchange", () => last && draw(last, lastMe));
})();
