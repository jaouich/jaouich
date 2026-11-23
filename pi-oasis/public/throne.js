// 👑 The Throne: the King of the Game (the player who supported the project with the most real Pi) at the top of the Ranking tab.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G || !$("throne")) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  let last = null, lastMe = "", got = false;
  function draw(k, me) {
    last = k; lastMe = me;
    const el = $("throne");
    if (!k) { el.innerHTML = ""; return; }
    const king = !!k.username, mine = king && k.username === me;
    const v = { c: fmtN(k.coins), m: k.mult, p: fmtN(k.need), u: esc(k.username || "") };
    el.innerHTML = `<div class="th-card ${king ? "on" : ""}"><div class="th-crown">👑</div><b>${t("th.t")}</b>
      ${king ? `<div class="th-king">${mine ? t("th.yours") : t("th.king", v)}</div><small>${t("th.paid", { p: fmtN(k.paid) })}</small>` : `<div class="th-king">${t("th.empty")}</div><small>${t("th.empty2")}</small>`}
      <p class="th-perks">${t("th.perks", v)}</p>
      ${mine ? `<button class="btn gold th-buy" data-th="claim" type="button" ${got ? "disabled" : ""}>${got ? t("th.claimed") : t("th.claim", v)}</button>` : `<p class="th-need">${t("th.need", v)}</p><button class="btn gold th-buy" data-th="support" type="button">${t("th.support")}</button>`}
      <p class="hint">${t("th.note")}</p></div>`;
  }
  $("throne").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-th]"); if (!b || !last) return;
    if (b.dataset.th === "support") { const x = document.querySelector("[data-tab=vip]"); if (x) x.click(); setTimeout(() => { const s = document.querySelector("#clubNav [data-g=shop]"); if (s) s.click(); window.scrollTo(0, 0); }, 80); return; }
    if (!G.account) return G.toast(t("t.loginFirst"));
    b.disabled = true;
    try {
      const r = await Pi.kingClaim();
      if (r.account) G.setAccount(r.account); if (r.state) G.S = r.state;
      got = true; G.toast(t("th.got", { c: fmtN(r.coins) })); G.burst(); draw(last, lastMe);
    } catch (err) { if (err.code === "king.done") got = true; G.toast(err.message); draw(last, lastMe); }
  });
  window.OasisThrone = { draw };
  document.addEventListener("langchange", () => last && draw(last, lastMe));
})();
