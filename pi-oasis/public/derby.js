// 🏁 Camel Derby – train racing camels and race other players. The server runs every race;
// this page shows it (animated lanes) and sends the player's choices.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const DL = window.DerbyLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!DL || !G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  let data = null, tactic = "steady", busy = false, anim = null, result = null, view = "home", playing = false;

  const camelName = (c, i) => (c.n ? esc(c.n) : t("db.br." + c.b) + (i != null ? " #" + (i + 1) : ""));
  const racerName = (r) => (r.me ? t("db.you") : r.bot ? "🤖 " + t("db.bot." + r.bot) : "@" + esc(r.name)) + (r.cn ? " · " + esc(r.cn) : "");
  const colorOf = (b) => DL.breedById(b).color;

  async function load() {
    if (!G.account) { render(); return; }
    try { data = await Pi.derby(); } catch (e) { G.toast(e.message); }
    render();
  }
  function apply(r) {
    if (!r) return;
    data = Object.assign(data || {}, r);
    if (r.state) { G.S = r.state; G.render(); }
  }

  function statRow(c, i) {
    const v = c.s[i], max = v >= DL.MAX_STAT, d = data.derby;
    return `<div class="db-stat"><span class="db-sl">${t("db.st." + DL.STATS[i])}</span>
      <span class="db-bar"><i style="width:${v}%"></i><b>${v}</b></span>
      <button class="db-tr" data-db="train" data-i="${i}" ${max ? "disabled" : ""}>${max ? "MAX" : `+1 · ${fmtN(DL.trainCost(v))}🌴`}</button>
      ${d.feed > 0 && !max ? `<button class="db-tr db-feed" data-db="feed" data-i="${i}">+${DL.FEED_GAIN} 🌾</button>` : ""}</div>`;
  }
  function home() {
    if (!G.account) return `<p class="jm-note">${t("t.loginFirst")}</p>`;
    if (!data) return `<p class="jm-note">…</p>`;
    const d = data.derby, c = d.camels[d.act], cup = DL.CUPS[data.cup], next = DL.CUPS[data.cup + 1];
    const raceBtn = data.left > 0 ? `<button class="db-go" data-db="race">🏁 ${t("db.race")} <small>(${data.left}/${data.max || DL.RACES_PER_DAY})</small></button>`
      : data.adLeft > 0 ? `<button class="db-go db-ad" data-db="adrace">📺 ${t("db.adRace")} <small>(${data.adLeft})</small></button>`
      : `<button class="db-go" disabled>⏳ ${t("db.tomorrow")}</button>`;
    return `<div class="jm-hero">
        <div><small>${t("db.trophies")}</small><b>🏆 ${fmtN(d.trophies)}</b></div>
        <div><small>${t("db.cup")}</small><b>${cup.e} ${t("db.cup." + cup.id)}</b></div>
        <div><small>${t("db.week")}</small><b>🔥 ${fmtN(data.week || 0)}</b></div></div>
      ${next ? `<div class="db-next"><span>${t("db.nextCup", { c: next.e + " " + t("db.cup." + next.id), n: fmtN(next.min - d.trophies) })}</span><div class="jm-bar"><i style="width:${Math.min(100, (100 * (d.trophies - cup.min)) / (next.min - cup.min))}%"></i></div></div>` : ""}
      <div class="db-camel">
        <div class="db-ava" style="--c:${colorOf(c.b)}"><span>${DL.breedById(c.b).e}</span></div>
        <div class="db-info"><b>${camelName(c, d.act)} <button class="db-pen" data-db="rename" data-i="${d.act}">✏️</button></b>
          <small>${t("db.br." + c.b)} · ⚡ ${t("db.power")} ${DL.power(c)} · 🥇 ${c.w || 0}/${c.r || 0}</small>
          <small>🌾 ${t("db.feedHave", { n: d.feed })}</small></div></div>
      ${[0, 1, 2].map((i) => statRow(c, i)).join("")}
      <h4>${t("db.tactic")}</h4>
      <div class="db-tactics">${DL.TACTICS.map((x) => `<button class="${x === tactic ? "on" : ""}" data-db="tactic" data-x="${x}"><b>${t("db.tc." + x)}</b><small>${t("db.tc." + x + ".d")}</small></button>`).join("")}</div>
      ${raceBtn}
      ${d.camels.length > 1 || d.camels.length < DL.STABLE ? `<h4>🏠 ${t("db.stable")} <small>${d.camels.length}/${DL.STABLE}</small></h4>
        <div class="db-stable">${d.camels.map((x, i) => `<button class="${i === d.act ? "on" : ""}" data-db="select" data-i="${i}"><span style="--c:${colorOf(x.b)}">${DL.breedById(x.b).e}</span><small>${camelName(x, i)}</small><em>⚡${DL.power(x)}</em></button>`).join("")}</div>` : ""}
      <h4>🛒 ${t("db.shop")}</h4>
      <div class="db-shop">${DL.FEED_PACKS.map((p) => `<div class="db-item"><i>🌾</i><b>${t("db.feedN", { n: p.feed })}</b><small>${t("db.feedD")}</small><button class="btn small gold" data-db="buyfeed" data-x="${p.id}">${p.price} Pi</button></div>`).join("")}
        ${DL.BREEDS.filter((b) => b.price).map((b) => `<div class="db-item db-breed" style="--c:${b.color}"><i>${b.e}</i><b>${t("db.br." + b.id)}</b><small>${t("db.breedD", { n: b.base })}</small><button class="btn small gold" data-db="buybreed" data-x="${b.id}">${b.price} Pi</button></div>`).join("")}</div>
      <h4>🔥 ${t("db.weekTop")}</h4>
      <div class="jm-top">${(data.top || []).length ? data.top.map((x, i) => `<div><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}. ${esc(x.username)}</span><b>🏆 ${fmtN(x.pts)}</b></div>`).join("") : `<small>${t("db.noTop")}</small>`}
        <small>${t("db.weekD")}</small></div>
      <p class="jm-note">${t("db.fair")}</p>`;
  }
  function raceView() {
    const r = result;
    return `<div class="db-track-wrap"><canvas id="dbCv" width="720" height="560"></canvas></div>
      <div id="dbRes" class="db-res ${playing ? "hidden" : ""}">
        <div class="db-place p${r.place}">${r.place <= 3 ? ["🥇", "🥈", "🥉"][r.place - 1] : "#" + r.place} ${t("db.placeT", { n: r.place })}</div>
        <div class="db-won"><span>🏆 +${r.trophies}</span><span>🌴 +${fmtN(r.dates)}</span></div>
        ${r.cupUp ? `<div class="db-cupup">🎉 ${t("db.cupUp", { c: DL.CUPS[data.cup].e + " " + t("db.cup." + DL.CUPS[data.cup].id) })}</div>` : ""}
        <div class="jm-top">${[...r.race].sort((a, b) => a.place - b.place).map((x) => `<div class="${x.me ? "db-me" : ""}"><span>${x.place}. ${racerName(x)}</span><b dir="ltr">${x.total.toFixed(2)}s</b></div>`).join("")}</div>
        <button class="db-go" data-db="back">↩ ${t("db.again")}</button></div>`;
  }
  function render() {
    const el = $("derby");
    if (el.classList.contains("hidden")) return;
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-db="close">‹ ${t("jm.back")}</button><b>🏁 ${t("db.t")}</b><button class="jm-back" data-db="help">?</button></header>
      <div class="jm-body">${view === "race" && result ? raceView() : home()}</div>`;
    if (view === "race" && result && playing) drawRace();
  }

  // Animated race: the real times (≈60-90 s) are played back in ~7 s
  function drawRace() {
    const cv = $("dbCv"); if (!cv) return;
    const ctx = cv.getContext("2d"), W = cv.width, Hh = cv.height, R = result.race;
    const lanes = R.length, lh = (Hh - 40) / lanes, x0 = 70, x1 = W - 40;
    const slow = Math.max(...R.map((r) => r.total)), PLAY = 7000, scale = PLAY / slow;
    const dist = (r, s) => { // metres done after s seconds of race time
      let d = 0, left = s;
      for (const seg of r.t) { if (left >= seg) { d += 400; left -= seg; } else { d += 400 * (left / seg); break; } }
      return Math.min(DL.DIST, d);
    };
    const start = performance.now();
    cancelAnimationFrame(anim);
    const frame = (now) => {
      const el = (now - start) / scale; // race seconds
      ctx.clearRect(0, 0, W, Hh);
      const g = ctx.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "#f7d48a"); g.addColorStop(1, "#e2a85a"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      for (let i = 0; i < lanes; i++) {
        const y = 20 + i * lh;
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,.12)" : "rgba(120,70,20,.08)"; ctx.fillRect(0, y, W, lh);
        ctx.strokeStyle = "rgba(90,50,10,.25)"; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
      }
      // finish line
      for (let k = 0; k < (Hh - 40) / 12; k++) { ctx.fillStyle = k % 2 ? "#fff" : "#222"; ctx.fillRect(x1 + 6, 20 + k * 12, 10, 12); }
      R.forEach((r, i) => {
        const y = 20 + i * lh + lh / 2, x = x0 + (x1 - x0) * (dist(r, el) / DL.DIST);
        if (r.me) { ctx.fillStyle = "rgba(255,211,77,.45)"; ctx.fillRect(0, y - lh / 2, W, lh); }
        ctx.font = "bold 22px sans-serif"; ctx.fillStyle = "#4a2a08"; ctx.textAlign = "left"; ctx.fillText(String(i + 1), 12, y + 8);
        const bob = Math.sin((now / 90) + i) * 4 * (dist(r, el) < DL.DIST ? 1 : 0);
        ctx.font = `${Math.min(64, lh * 0.8)}px sans-serif`; ctx.textAlign = "center";
        ctx.save(); ctx.translate(x, y + bob); ctx.scale(-1, 1); ctx.fillText(DL.breedById(r.b).e, 0, lh * 0.28); ctx.restore();
        if (r.me) { ctx.font = "bold 18px sans-serif"; ctx.fillStyle = "#7c2d12"; ctx.fillText("▼ " + t("db.you"), x, y - lh * 0.32); }
      });
      if (el < slow + 0.3) anim = requestAnimationFrame(frame);
      else { anim = null; playing = false; const res = $("dbRes"); if (res) res.classList.remove("hidden"); if (result.place <= 3) G.burst && G.burst(); setTimeout(() => Pi.maybeInterstitial(), 1500); }
    };
    anim = requestAnimationFrame(frame);
  }

  async function act(b) {
    const a = b.dataset.db, i = Number(b.dataset.i);
    if (a === "close") { cancelAnimationFrame(anim); anim = null; view = "home"; return $("derby").classList.add("hidden"); }
    if (a === "help") return G.openHelp();
    if (a === "tactic") { tactic = b.dataset.x; return render(); }
    if (a === "back") { view = "home"; result = null; return render(); }
    if (!G.account) return G.toast(t("t.loginFirst"));
    if (busy) return;
    busy = true; b.disabled = true;
    try {
      if (a === "train" || a === "feed") apply(await Pi.derbyTrain(i, a === "feed"));
      else if (a === "race" || a === "adrace") {
        let adId;
        if (a === "adrace") { adId = await Pi.showRewardedAd(); if (!adId) throw new Error(t("e.k.adFail")); }
        const r = await Pi.derbyRace(tactic, adId);
        apply(r); result = r; view = "race"; playing = true;
      } else if (a === "select") apply(await Pi.derbySelect(i));
      else if (a === "rename") {
        const n = await OasisAsk(t("db.nameAsk"), data.derby.camels[i].n || "");
        if (n != null) apply(await Pi.derbyRename(i, n));
      } else if (a === "buyfeed") { const r = await Pi.buyDerby({ kind: "feed", pack: b.dataset.x }); if (r.state) { G.S = r.state; G.render(); } G.toast(t("db.bought")); await load(); }
      else if (a === "buybreed") {
        if (data.derby.camels.length >= DL.STABLE && !confirm(t("db.fullStable"))) { busy = false; b.disabled = false; return; }
        const r = await Pi.buyDerby({ kind: "breed", breed: b.dataset.x }); if (r.state) { G.S = r.state; G.render(); } G.toast(t("db.bought")); await load();
      }
    } catch (e) { G.toast(e.message); }
    busy = false; b.disabled = false;
    render();
  }
  $("derby").addEventListener("click", (e) => { const b = e.target.closest("[data-db]"); if (b) act(b); });
  $("derbyOpen").addEventListener("click", () => { $("derby").classList.remove("hidden"); view = "home"; render(); load(); });
  document.addEventListener("langchange", render);
})();
