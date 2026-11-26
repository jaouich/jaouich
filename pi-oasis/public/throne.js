// 👑 The Emperor block at the top of the Ranking tab (the player with the most real Pi paid) and the top 3 of the Court.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, L = window.OasisLogic;
  if (!G || !$("throne")) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  let last = null, lastCourt = [], lastMe = "";
  const TI = { emperor: "👑", prince: "🤴", vizier: "🎩" };
  function draw(k, me, court) {
    last = k; lastMe = me; if (court) lastCourt = court;
    const el = $("throne");
    if (!k) { el.innerHTML = ""; return; }
    const king = !!k.username, mine = king && k.username === me;
    const v = { c: fmtN(k.coins), m: k.mult, p: fmtN(k.need), u: esc(k.username || "") };
    const sub = (lastCourt || []).slice(1).map((x) => `<div class="th-sub"><i>${TI[x.title] || "🛡️"}</i><span><b>${esc(t("ct." + x.title))}</b> ${esc(x.username)}</span><small>${fmtN(x.paid)} Pi</small></div>`).join("");
    el.innerHTML = `<div class="th-card ${king ? "on" : ""}"><div class="th-crown">👑</div><b>${t("th.t")}</b>
      ${king ? `<div class="th-king">${mine ? t("th.yours") : t("th.emperor", v)}</div><small>${t("th.paid", { p: fmtN(k.paid) })}</small>` : `<div class="th-king">${t("th.empty")}</div><small>${t("th.empty2")}</small>`}
      ${sub}<p class="th-perks">${t("th.perks", v)}</p>
      ${mine ? "" : `<p class="th-need">${t("th.need", v)}</p>`}
      <button class="btn gold th-buy" data-th="court" type="button">🏛️ ${t("th.open")}</button>
      <button class="btn secondary th-buy" data-th="support" type="button">${t("th.support")}</button>
      <p class="hint">${t("th.note")}</p></div>`;
  }
  $("throne").addEventListener("click", (e) => {
    const b = e.target.closest("[data-th]"); if (!b) return;
    if (b.dataset.th === "court") { const x = $("courtOpen"); if (x) x.click(); return; }
    const x = document.querySelector("[data-tab=vip]"); if (x) x.click();
    setTimeout(() => { const s = document.querySelector("#clubNav [data-g=shop]"); if (s) s.click(); window.scrollTo(0, 0); }, 80);
  });
  window.OasisThrone = { draw };
  document.addEventListener("langchange", () => last && draw(last, lastMe));
})();
