// 📖 My catalog: the album of every collection item a player owns (collectibles, royal cards, supporter
// badges), the goal of collecting it all, and the rewards. The server checks everything; this page shows it.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const CL = window.CatalogLogic, KL = window.KombatLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!CL || !G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const DAY = 86400000;
  let open = false, data = null, who = null, sel = null, art = {}, busy = false;

  // optional custom artwork: put a PNG named after the item in public/cards/ and list it in cards/manifest.json
  fetch("cards/manifest.json").then((r) => (r.ok ? r.json() : [])).then((l) => { (l || []).forEach((id) => (art[id] = true)); if (open) render(); }).catch(() => {});

  const nameOf = (x) => (x.kind === "nft" ? t("n.c." + x.id) : x.kind === "royal" ? t("rc.n." + x.id) : x.id === "bf" ? t("cat.b.bf") : t("sup.n" + x.id.slice(1)));
  const rarityOf = (x) => t("n.r." + x.r);
  const daysLeft = (x, now) => Math.max(1, Math.ceil((x.readyAt - now) / DAY));

  async function load() {
    if (!G.account && !who) { data = null; return updateBadge(); }
    try {
      data = await Pi.catalog(who);
    } catch (e) { data = null; G.toast(e.message); if (who) { who = null; return load(); } }
    updateBadge(); if (open) render();
  }
  // the little progress shown on the Farm tab bar
  function updateBadge() {
    const el = $("catBadge");
    if (!el) return;
    if (!G.account || !data || who) { el.textContent = t("cat.bar.d"); return; }
    const p = CL.progressOf(data.owned, data.now, data.claims);
    const claimable = p.goals.filter((g) => g.reached && !g.claimed).length;
    el.textContent = `${p.have}/${p.total}` + (claimable ? ` · 🎁 ${claimable}` : "");
  }

  // ---------- the pictures ----------
  function card(x, now) {
    const own = x.state !== "none", num = x.eds && x.eds.length ? "#" + x.eds[0] + (x.eds.length > 1 ? " +" + (x.eds.length - 1) : "") : "";
    const status = x.state === "counted" ? "✓" : x.state === "holding" ? `⏳ ${t("cat.days", { n: daysLeft(x, now) })}` : x.price ? (x.kind === "royal" ? x.price + " Pi" : fmtN(x.price) + " 🪙") : "🤍";
    return `<button class="cc r-${x.r} ${x.state}" data-cat="open" data-id="${x.id}" type="button">
      <div class="cc-art"><i class="cc-pat"></i><span class="cc-emb">${own ? x.e : "?"}</span>${own && art[x.id] ? `<img class="cc-img" src="cards/${x.id}.png" alt="" onerror="this.remove()">` : ""}${own && num ? `<em class="cc-ed">${num}</em>` : ""}${x.required ? "" : `<u class="cc-bonus">★</u>`}</div>
      <b class="cc-nm">${own ? esc(nameOf(x)) : "???"}</b><small class="cc-st">${status}</small></button>`;
  }
  function ring(have, total) {
    const C = 2 * Math.PI * 38, off = C * (1 - Math.min(1, have / total));
    return `<div class="cat-ring"><svg viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" class="bg"/><circle cx="45" cy="45" r="38" class="fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${have}<small>/${total}</small></b></div>`;
  }
  const rewardText = (r) => [r.coins ? "+" + fmtN(r.coins) + " 🪙" : "", r.jry ? "+" + r.jry + " 💠" : "", r.boost ? "+" + Math.round(r.boost * 100) + "% ⚔️" : "", r.key === "master" ? "📚" : ""].filter(Boolean).map((x) => `<bdi dir="ltr">${x}</bdi>`).join(" · ");
  const goalTitle = (g) => (g.type === "milestone" ? t("cat.g.n", { n: g.need }) : g.type === "section" ? t("cat.g.sec", { s: t("cat.sec." + g.sec) }) : t("cat.g.master", { n: g.need }));

  function render() {
    const el = $("catalog");
    if (el.classList.contains("hidden")) return;
    let body;
    if (!G.account && !who) body = `<p class="jm-note">${t("t.loginFirst")}</p>`;
    else if (!data) body = `<p class="jm-note">…</p>`;
    else {
      const now = data.now, p = CL.progressOf(data.owned, now, data.claims || []), mine = data.mine;
      body = `<div class="cat-head">${ring(p.have, p.total)}<div class="cat-sum"><b>${mine ? t("cat.mine") : t("cat.of", { n: esc(data.name) })}</b>
          <small>${t("cat.sum", { a: p.have, b: p.total, c: p.list.filter((x) => x.state !== "none").length, d: p.list.length })}</small>
          ${data.master || p.master ? `<span class="cat-master">📚 ${t("cat.master")}</span>` : ""}${p.legend ? `<span class="cat-master gold">🌟 ${t("cat.legend")}</span>` : ""}
          ${mine && data.boost ? `<small>⚔️ ${t("cat.boost", { n: Math.round(data.boost * 100) })}</small>` : ""}</div></div>`
        + CL.SECTIONS.map((s) => { const sc = p.sections[s]; return `<h4>${t("cat.sec." + s)} <small dir="ltr">${sc.required ? sc.have : sc.owned}/${sc.total}</small></h4><div class="cat-grid">${p.list.filter((x) => x.sec === s).map((x) => card(x, now)).join("")}</div>`; }).join("")
        + (mine ? `<h4>🎁 ${t("cat.goals")}</h4><div class="cat-goals">${p.goals.map((g) => `<div class="cat-goal ${g.claimed ? "done" : g.reached ? "ready" : ""}"><span><b>${goalTitle(g)}</b><small>${rewardText({ ...g.reward, key: g.key })}</small>
            <div class="jm-bar"><i style="width:${Math.min(100, (100 * g.have) / g.need)}%"></i></div></span>
            ${g.claimed ? `<em>✅</em>` : g.reached ? `<button class="btn small gold" data-cat="claim" data-key="${g.key}">${t("cat.claim")}</button>` : `<em dir="ltr">${g.have}/${g.need}</em>`}</div>`).join("")}</div>
          <p class="jm-note">${t("cat.rule", { d: CL.HOLD_DAYS })}</p>
          <button class="btn gold cat-share" data-cat="share">📤 ${t("cat.share")}</button><div id="catShare"></div>` : "")
        + `<h4>👀 ${t("cat.look")}</h4><div class="ref-row"><input id="catWho" dir="auto" maxlength="40" placeholder="${t("cat.lookPh")}"><button class="btn small gold" data-cat="look">${t("cat.lookGo")}</button></div>${who ? `<button class="btn small secondary" data-cat="mine">↩ ${t("cat.back")}</button>` : ""}`;
      if (sel) body += modal(p, now);
    }
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-cat="close">‹ ${t("jm.back")}</button><b>📖 ${t("cat.t")}</b><button class="jm-back" data-cat="help">?</button></header><div class="jm-body">${body}</div>`;
  }
  function modal(p, now) {
    const x = p.list.find((y) => y.id === sel);
    if (!x) return "";
    const minted = data.minted && x.kind === "nft" ? data.minted[x.id] || 0 : null;
    return `<div class="cat-modal" data-cat="shut"><div class="cat-card" data-keep="1">${card(x, now).replace("data-cat=\"open\"", "")}
      <h3>${x.state === "none" ? "???" : esc(nameOf(x))}</h3>
      <p>${rarityOf(x)}${x.kind === "nft" ? ` · +${Math.round(x.perk * 100)}% ${t("cat.perH")}` : ""}${x.required ? "" : ` · ★ ${t("cat.bonus")}`}</p>
      ${minted !== null ? `<p dir="ltr">${t("cat.minted")}: ${minted}/${x.max}</p>` : ""}
      ${x.eds.length ? `<p>${t("cat.copies")}: ${x.eds.map((e) => "#" + e).join(" ")}</p>` : ""}
      <p class="cat-hint">${x.state === "counted" ? "✅ " + t("cat.counted") : x.state === "holding" ? "⏳ " + t("cat.holding", { n: daysLeft(x, now) }) : data.mine ? t("cat.missing") : ""}</p>
      ${data.mine && x.state === "none" ? `<button class="btn gold" data-cat="get" data-id="${x.id}">${t("cat.get")}</button>` : ""}
      <button class="btn secondary" data-cat="shut">${t("cat.close")}</button></div></div>`;
  }

  // ---------- share picture (drawn on a canvas) ----------
  function drawShare(p) {
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350;
    const c = cv.getContext("2d"), g = c.createLinearGradient(0, 0, 0, 1350);
    g.addColorStop(0, "#35b983"); g.addColorStop(0.5, "#0f6b4a"); g.addColorStop(1, "#06281c"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
    c.textAlign = "center"; c.fillStyle = "#fff"; c.font = "800 64px sans-serif"; c.fillText("📖 " + t("cat.t"), 540, 120);
    c.font = "700 44px sans-serif"; c.fillStyle = "#ffd34d"; c.fillText(G.account ? G.account.username : "", 540, 190);
    c.fillStyle = "#fff"; c.font = "900 190px sans-serif"; c.fillText(`${p.have}/${p.total}`, 540, 420);
    c.fillStyle = "rgba(255,255,255,.2)"; c.fillRect(140, 460, 800, 28); c.fillStyle = "#ffd34d"; c.fillRect(140, 460, 800 * Math.min(1, p.have / p.total), 28);
    c.font = "70px sans-serif"; const items = p.list, cols = 7, cw = 130;
    items.forEach((x, i) => { const cx = 540 - ((cols - 1) * cw) / 2 + (i % cols) * cw, cy = 600 + Math.floor(i / cols) * 150; c.globalAlpha = x.state === "none" ? 0.25 : 1; c.fillText(x.state === "none" ? "?" : x.e, cx, cy); });
    c.globalAlpha = 1; c.font = "700 40px sans-serif"; c.fillStyle = "#fff";
    if (p.master) c.fillText("📚 " + t("cat.master"), 540, 1020);
    c.font = "800 48px sans-serif"; c.fillStyle = "#ffd34d"; c.fillText("Pi Oasis · Jerry Development", 540, 1180);
    c.font = "700 42px sans-serif"; c.fillStyle = "#fff"; c.fillText(location.host, 540, 1250);
    return cv;
  }
  async function share() {
    const p = CL.progressOf(data.owned, data.now, data.claims || []), cv = drawShare(p);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const file = blob && new File([blob], "my-catalog.png", { type: "image/png" });
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text: t("cat.shareText", { a: p.have, b: p.total }) + " " + location.origin + "/" });
    } catch (e) { if (e && e.name === "AbortError") return; }
    const sh = $("catShare");
    if (sh && window.JShare) window.JShare.bar(sh, { url: location.origin + "/", text: t("cat.shareText", { a: p.have, b: p.total }), labels: { copy: t("js.copy"), copied: t("js.copied"), more: t("js.more") } });
    if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-catalog.png"; a.click(); }
  }

  // ---------- actions ----------
  async function act(b) {
    const a = b.dataset.cat;
    if (a === "close") { open = false; $("catalog").classList.add("hidden"); return; }
    if (a === "help") return G.openHelp();
    if (a === "shut") { if (b.closest("[data-keep]") && !b.classList.contains("btn")) return; sel = null; return render(); }
    if (a === "open") { sel = b.dataset.id; return render(); }
    if (a === "look") { const n = ($("catWho").value || "").trim().replace(/^@/, ""); if (!n) return; who = n; data = null; render(); return load(); }
    if (a === "mine") { who = null; data = null; render(); return load(); }
    if (a === "share") return share();
    if (a === "get") {
      const id = b.dataset.id, x = CL.entries().find((y) => y.id === id);
      sel = null; open = false; $("catalog").classList.add("hidden");
      if (x.kind === "nft") { $("kombatOpen").click(); setTimeout(() => { const nb = document.querySelector('.k-nav [data-kgo="collect"]'); nb && nb.click(); }, 450); }
      else { document.querySelector('.tabs [data-tab="vip"]').click(); setTimeout(() => { const e = $(x.kind === "royal" ? "rcTitle" : "supTitle"); e && e.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120); }
      return;
    }
    if (a === "claim") {
      if (busy) return; busy = true; b.disabled = true;
      try {
        const r = await Pi.catalogClaim(b.dataset.key);
        G.setAccount(r.account); G.S = r.state; G.render(); G.burst && G.burst();
        data.claims = r.claims; data.boost = CL.boostOf(r.claims);
        G.toast(t("cat.got", { r: rewardText({ ...r.reward, key: b.dataset.key }).replace(/<[^>]+>/g, "") }));
        if (b.dataset.key === "master") await load();
      } catch (e) { G.toast(e.message); }
      busy = false; updateBadge(); return render();
    }
  }
  $("catalog").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) act(b); });

  function openCatalog() {
    const q = new URLSearchParams(location.search), u = q.get("u");
    open = true; sel = null; who = u || null; $("catalog").classList.remove("hidden"); render(); load();
    if (u) { const nu = new URL(location.href); nu.searchParams.delete("u"); history.replaceState(null, "", nu); }
  }
  $("catOpen").addEventListener("click", openCatalog);
  const kb = $("nCatalog"); if (kb) kb.addEventListener("click", openCatalog);
  document.addEventListener("langchange", () => { updateBadge(); render(); });
  window.OasisCatalog = { refresh: () => { who = null; return load(); } };
  updateBadge();
})();
