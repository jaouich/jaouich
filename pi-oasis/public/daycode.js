// 🎁 The gift code of the day (one use, 24 h): shown on the home page with copy, use and share buttons.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G || !$("dayCode")) return;
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  let d = null;
  async function load() { try { d = await (await fetch("/api/daily-code")).json(); } catch (e) { d = null; } draw(); }
  function draw() {
    const el = $("dayCode");
    if (!d || d.error) return el.classList.add("hidden");
    el.classList.remove("hidden");
    const v = { j: fmtN(d.jry), d: fmtN(d.dates), n: fmtN(d.max || 100), l: fmtN(d.left == null ? 100 : d.left) };
    if (!d.code) { el.innerHTML = `<b>🎁 ${t("dc.t")}</b><small>${t("dc.taken", v)}</small>`; return; }
    el.innerHTML = `<b>🎁 ${t("dc.t")}</b><small>${t("dc.d", v)}</small>
      <div class="dc-row"><code dir="ltr">${d.code}</code><button class="btn small" data-dc="copy" type="button">${t("dc.copy")}</button><button class="btn small gold" data-dc="use" type="button">${t("dc.use")}</button></div>
      <div id="dcShare"></div>`;
    const link = G.refLink() || d.app || location.origin; // always the Pi Browser (pinet) link
    if (window.JShare) window.JShare.bar($("dcShare"), { url: link, text: t("dc.share", v) + d.code });
  }
  $("dayCode").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-dc]"); if (!b || !d || !d.code) return;
    if (b.dataset.dc === "copy") { try { await navigator.clipboard.writeText(d.code); G.toast(t("t.copied")); } catch (x) {} return; }
    if (!G.account) return G.toast(t("t.loginFirst"));
    b.disabled = true;
    try {
      const r = await Pi.redeemCode(d.code);
      G.setAccount(r.account); G.S = r.state; G.render(); G.burst();
      G.toast(t("dc.ok", { j: fmtN(r.amount), d: fmtN(r.amount2) }));
    } catch (err) { G.toast(err.message); }
    load();
  });
  document.addEventListener("langchange", draw);
  load(); setInterval(load, 60000);
})();
