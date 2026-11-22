// 🎁 My box: the JRY balance (what was bought and every movement) and gifts to other members.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const KL = window.KombatLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!KL || !G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const dt = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const ICON = { coins: "🪙", dates: "🌴", jry: "💠", item: "🖼️" };
  let open = false, data = null, mine = [], what = "coins", busy = false;

  async function load() {
    if (!G.account) { data = null; return render(); }
    try { [data, mine] = [await Pi.box(), ((await Pi.nft()).mine || [])]; } catch (e) { G.toast(e.message); }
    render();
  }
  const kindText = (k, ref) => ({ bought: t("box.k.bought"), "gift-in": t("box.k.in", { u: esc(ref || "") }), "gift-out": t("box.k.out", { u: esc(ref || "") }) }[k] || esc(k));
  function render() {
    const el = $("box");
    if (el.classList.contains("hidden")) return;
    let body;
    if (!G.account) body = `<p class="jm-note">${t("t.loginFirst")}</p>`;
    else if (!data) body = `<p class="jm-note">…</p>`;
    else {
      const GF = KL.GIFT, usedOf = (w) => ((data.used || []).find((x) => x.what === w) || {}).n || 0;
      const fee = what === "item" ? 0 : Math.round(GF.FEE[what] * 100);
      body = `<div class="bx-bal"><span class="jp-ico">JRY</span><div><b>${fmtN(data.jry)}</b><small>${t("box.bought", { n: fmtN(data.bought) })}</small></div></div>
        ${data.piBox ? `<div class="bx-pi"><div class="bx-pih"><span>π</span><div><b dir="ltr">${data.piBox.waiting}</b><small>${t("box.pi.waiting")}</small></div></div>
          <p class="jm-note">${data.piBox.held ? t("box.pi.held") : t("box.pi.auto")}</p>
          ${data.piBox.items.length ? `<div class="bx-list">${data.piBox.items.map((x) => `<div><span>${t("box.pi.k." + x.kind) === "box.pi.k." + x.kind ? esc(x.kind) : t("box.pi.k." + x.kind)}</span><b dir="ltr">${x.amount} π</b><small>${x.done ? "✅ " + t("box.pi.sent") : "⏳ " + t("box.pi.wait")} · ${dt(x.at)}</small></div>`).join("")}</div>` : `<p class="jm-note">${t("box.pi.none")}</p>`}
          ${data.piBox.paid ? `<p class="jm-note">${t("box.pi.paid", { n: data.piBox.paid })}</p>` : ""}</div>` : ""}
        <p class="jm-note">${t("box.note")}</p>
        <h4>🎁 ${t("box.send")}</h4>
        <div class="bx-tabs">${["coins", "dates", "jry", "item"].map((w) => `<button type="button" data-bx="what" data-w="${w}" class="${w === what ? "on" : ""}">${ICON[w]} ${t("box.w." + w)}</button>`).join("")}</div>
        <div class="ref-row"><input id="bxTo" dir="auto" maxlength="40" placeholder="${t("box.to")}"></div>
        ${what === "item"
          ? (mine.length ? `<div class="bx-items">${mine.map((it) => { const c = KL.nftById(it.kind); return `<button type="button" data-bx="item" data-id="${it.id}">${c.e}<small>${esc(t("n.c." + c.id))} #${it.edition}</small></button>`; }).join("")}</div>` : `<p class="jm-note">${t("n.none")}</p>`)
          : `<div class="ref-row"><input id="bxN" type="number" inputmode="numeric" min="${GF.MIN[what]}" placeholder="${t("box.amount")}"><button class="btn small gold" data-bx="send">${t("box.sendBtn")}</button></div>
             <p class="jm-note">${t("box.rules", { fee, min: fmtN(GF.MIN[what]), left: fmtN(Math.max(0, GF.DAILY_MAX[what] - usedOf(what))) })}</p>`}
        <h4>📜 ${t("box.history")}</h4>
        <div class="bx-list">${data.transfers.length ? data.transfers.map((x) => `<div><span>${ICON[x.what]} ${x.dir === "out" ? "→" : "←"} ${esc(x.other)}</span><b dir="ltr">${x.dir === "out" ? "-" : "+"}${fmtN(x.n)}</b><small>${dt(x.at)}</small></div>`).join("") : `<p class="jm-note">${t("box.none")}</p>`}</div>
        <h4>💠 ${t("box.ledger")}</h4>
        <div class="bx-list">${data.history.length ? data.history.map((x) => `<div><span>${kindText(x.kind, x.ref)}</span><b dir="ltr">${x.delta > 0 ? "+" : ""}${fmtN(x.delta)}</b><small>${dt(x.at)}</small></div>`).join("") : `<p class="jm-note">${t("box.none")}</p>`}</div>`;
    }
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-bx="close">‹ ${t("jm.back")}</button><b>🎁 ${t("box.t")}</b><span></span></header><div class="jm-body">${body}</div>`;
  }
  async function send(extra) {
    if (busy) return; const to = ($("bxTo").value || "").trim();
    if (!to) return G.toast(t("box.to"));
    busy = true;
    try {
      const o = Object.assign({ to, what }, extra || { n: Math.floor(Number($("bxN").value)) });
      const r = await Pi.gift(o);
      G.setAccount(r.account); const me = await Pi.me(); G.S = me.state; G.render();
      G.toast(t("box.sent", { to: esc(r.to) }));
      await load();
    } catch (e) { G.toast(e.message); }
    busy = false;
  }
  $("box").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bx]"); if (!b) return;
    const a = b.dataset.bx;
    if (a === "close") { open = false; $("box").classList.add("hidden"); }
    else if (a === "what") { const to = $("bxTo") ? $("bxTo").value : ""; what = b.dataset.w; render(); $("bxTo").value = to; }
    else if (a === "send") send();
    else if (a === "item") { if (confirm(t("box.confirmItem"))) send({ id: Number(b.dataset.id) }); }
  });
  $("boxOpen").addEventListener("click", () => { open = true; $("box").classList.remove("hidden"); render(); load(); });
  document.addEventListener("langchange", render);
})();
