// 🏰 Jerry Castle: tower defense. The phone plays and draws the game with the shared rules (castle-logic.js);
// when it ends, the list of actions is sent to the server, which replays it and pays the rewards.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const CL = window.CastleLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!CL || !G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const EMO = { soldier: "🪖", runner: "🏃", shield: "🛡️", rider: "🐎", boss: "👹" };
  const TEMO = { cannon: "💣", archer: "🏹", mortar: "🔥", frost: "❄️" };
  const TCOL = { cannon: "#8d6e63", archer: "#43a047", mortar: "#e64a19", frost: "#29b6f6" };
  let open = false, screen = "maps", prog = null, map = 0, S = null, log = [], kind = "cannon", sel = null, speed = 1, paused = false;
  let raf = 0, last = 0, acc = 0, cv = null, ctx = null, cell = 40, result = null, sending = false;

  async function load() {
    if (!G.account) { prog = null; return render(); }
    try { prog = await Pi.castle(); } catch (e) { G.toast(e.message); }
    render();
  }
  const star = (n) => "★".repeat(n) + "☆".repeat(3 - n);

  function render() {
    const el = $("castle");
    if (el.classList.contains("hidden")) return;
    if (screen === "maps") {
      const body = !G.account ? `<p class="jm-note">${t("t.loginFirst")}</p>` : !prog ? `<p class="jm-note">…</p>`
        : `<p class="jm-note">${t("cs.how")}</p>` + CL.MAPS.map((m, i) => { const p = prog.maps[i]; return `<button class="cs-map ${p.open ? "" : "lock"}" data-cs="map" data-i="${i}" ${p.open ? "" : "disabled"}><i>${p.open ? "🏰" : "🔒"}</i><span><b>${t("cs.map." + m.id)}</b><small>${p.open ? t("cs.best", { w: p.best, n: CL.WAVES }) : t("cs.locked")}</small></span><em dir="ltr">${star(p.stars)}</em></button>`; }).join("")
          + `<p class="jm-note">${t("cs.rewards", { n: prog.replaysLeft })}</p>`;
      el.innerHTML = `<header class="jm-head"><button class="jm-back" data-cs="close">‹ ${t("jm.back")}</button><b>🏰 ${t("cs.t")}</b><span></span></header><div class="jm-body">${body}</div>`;
      return;
    }
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-cs="leave">‹ ${t("cs.maps")}</button><b>🏰 ${t("cs.map." + CL.MAPS[map].id)}</b><span id="csWave" dir="ltr"></span></header>
      <div class="cs-hud"><span id="csGold">🪙 0</span><span id="csHp">❤️ 20</span><span class="cs-sp"><button data-cs="speed">1×</button><button data-cs="pause">⏸</button></span></div>
      <div class="cs-board"><canvas id="csCv"></canvas><div id="csOver" class="cs-over hidden"></div></div>
      <div id="csPanel" class="cs-panel"></div>
      <div class="cs-bar">${CL.KINDS.map((k) => `<button data-cs="kind" data-k="${k}" class="${k === kind ? "on" : ""}"><i>${TEMO[k]}</i><b>${CL.TOWER[k].cost}</b></button>`).join("")}<button class="cs-go" data-cs="wave">▶ ${t("cs.start")}</button></div>`;
    cv = $("csCv");
    const w = Math.min(el.clientWidth - 12, 420, Math.floor(((el.clientHeight || 700) - 250) * CL.W / CL.H));
    cell = Math.max(24, Math.floor(w / CL.W));
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = cell * CL.W + "px"; cv.style.height = cell * CL.H + "px"; cv.width = cell * CL.W * dpr; cv.height = cell * CL.H * dpr;
    ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.addEventListener("pointerdown", tap);
    draw(); hud();
  }

  function startGame(i) {
    map = i; S = CL.newGame(i); log = []; sel = null; result = null; kind = "cannon"; speed = 1; paused = false; sending = false; screen = "game";
    render(); last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (!open || screen !== "game") return;
    const dt = Math.min(250, now - last); last = now;
    if (!paused && !S.over) {
      acc += dt * speed;
      while (acc >= CL.TICK_MS && !S.over) { CL.step(S); acc -= CL.TICK_MS; }
      if (S.over) end();
    }
    draw(); hud();
    raf = requestAnimationFrame(loop);
  }
  function hud() {
    if (!S || !$("csGold")) return;
    $("csGold").textContent = "🪙 " + S.gold; $("csHp").textContent = "❤️ " + S.hp;
    $("csWave").textContent = `${t("cs.wave")} ${S.wave}/${CL.WAVES}`;
    const go = document.querySelector(".cs-go"); if (go) go.disabled = S.over || S.queue.length > 0 || S.wave >= CL.WAVES;
    const p = $("csPanel"), tw = sel && S.towers.find((q) => q.x === sel.x && q.y === sel.y);
    const key = tw ? tw.kind + tw.lvl + (S.gold >= (CL.TOWER[tw.kind].up[tw.lvl - 1] || 1e9)) : "";
    if (p.dataset.k !== key) {
      p.dataset.k = key;
      p.innerHTML = tw ? `<b>${TEMO[tw.kind]} ${t("cs.t." + tw.kind)} · ${t("cs.lvl")} ${tw.lvl}</b>${tw.lvl < 3 ? `<button data-cs="up" ${S.gold >= CL.TOWER[tw.kind].up[tw.lvl - 1] ? "" : "disabled"}>⬆ ${CL.TOWER[tw.kind].up[tw.lvl - 1]}</button>` : `<small>${t("cs.max")}</small>`}<button data-cs="sell">💰 +${Math.floor(CL.invested(tw) * CL.SELL)}</button>` : `<small>${t("cs.hint")}</small>`;
    }
  }
  function act(a) {
    const r = CL.act(S, a);
    if (r) { G.toast(t(r === "gold" ? "cs.noGold" : "cs.cant")); return false; }
    log.push([S.tick, a]); return true;
  }
  function tap(e) {
    if (!S || S.over) return;
    const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
    const tw = S.towers.find((q) => q.x === x && q.y === y);
    if (tw) { sel = { x, y }; return hud(); }
    if (CL.MAPS[map].key.has(x + "," + y)) { sel = null; return; }
    if (act({ a: "place", x, y, k: kind })) sel = { x, y };
  }
  async function end() {
    const won = S.won;
    $("csOver").classList.remove("hidden");
    $("csOver").innerHTML = `<div class="cs-res"><h2>${won ? "🏆 " + t("cs.win") : "💥 " + t("cs.lose")}</h2><p>${t("cs.wave")} ${S.wave}/${CL.WAVES} · ${star(CL.stars(S))}</p><p id="csRew" class="jm-note">…</p><div class="cs-btns"><button class="btn gold" data-cs="again">${t("cs.again")}</button><button class="btn secondary" data-cs="leave">${t("cs.maps")}</button></div></div>`;
    if (sending) return; sending = true;
    try {
      const r = await Pi.castleFinish(map, log);
      const parts = [r.coins ? "+" + fmtN(r.coins) + " 🪙" : "", r.dates ? "+" + fmtN(r.dates) + " 🌴" : ""].filter(Boolean);
      if ($("csRew")) $("csRew").textContent = parts.length ? t("cs.got", { r: parts.join(" · ") }) : won ? t("cs.noMore") : t("cs.tryAgain");
      const me = await Pi.me(); G.setAccount(me.account); G.S = me.state; G.render();
    } catch (e) { if ($("csRew")) $("csRew").textContent = e.message; }
    load();
  }

  // ---------- drawing ----------
  function draw() {
    if (!ctx || !S) return;
    const M = CL.MAPS[map], c = cell;
    ctx.clearRect(0, 0, c * CL.W, c * CL.H);
    for (let y = 0; y < CL.H; y++) for (let x = 0; x < CL.W; x++) {
      const road = M.key.has(x + "," + y);
      ctx.fillStyle = road ? "#d9b878" : (x + y) % 2 ? "#6fa84a" : "#79b552"; ctx.fillRect(x * c, y * c, c, c);
      if (road) { ctx.fillStyle = "rgba(120,80,30,.25)"; ctx.fillRect(x * c + 3, y * c + 3, c - 6, c - 6); }
    }
    ctx.font = c * 0.7 + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const cp = M.path[M.path.length - 1]; ctx.fillText("🏰", cp[0] * c + c / 2, cp[1] * c + c / 2);
    const sp = M.path[0]; ctx.globalAlpha = 0.7; ctx.fillText("🚩", sp[0] * c + c / 2, sp[1] * c + c / 2); ctx.globalAlpha = 1;
    if (sel) { const tw = S.towers.find((q) => q.x === sel.x && q.y === sel.y); if (tw) { ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(tw.x * c + c / 2, tw.y * c + c / 2, (CL.TOWER[tw.kind].range[tw.lvl - 1] / 100) * c, 0, 7); ctx.fill(); } }
    for (const tw of S.towers) {
      const px = tw.x * c + c / 2, py = tw.y * c + c / 2;
      ctx.fillStyle = TCOL[tw.kind]; ctx.beginPath(); ctx.arc(px, py, c * 0.42, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = c * 0.5 + "px sans-serif"; ctx.fillText(TEMO[tw.kind], px, py);
      ctx.fillStyle = "#ffd34d"; for (let i = 0; i < tw.lvl; i++) ctx.fillRect(px - c * 0.3 + i * c * 0.22, py + c * 0.3, c * 0.16, c * 0.1);
      if (tw.shot && S.tick - tw.shot <= 1 && tw.aim) { ctx.strokeStyle = tw.kind === "frost" ? "#81d4fa" : "#fff59d"; ctx.lineWidth = tw.kind === "mortar" ? 4 : 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tw.aim[0] * c / 100, tw.aim[1] * c / 100); ctx.stroke(); }
    }
    ctx.font = c * 0.62 + "px sans-serif";
    for (const e of S.enemies) {
      const i = Math.min(M.path.length - 1, Math.floor(e.pos / 100)), p = M.path[i], n = M.path[Math.min(M.path.length - 1, i + 1)], f = (e.pos % 100) / 100;
      const x = (p[0] + (n[0] - p[0]) * f) * c + c / 2, y = (p[1] + (n[1] - p[1]) * f) * c + c / 2;
      ctx.fillText(EMO[e.type], x, y);
      if (e.slowUntil > S.tick) { ctx.fillStyle = "rgba(41,182,246,.5)"; ctx.beginPath(); ctx.arc(x, y, c * 0.35, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#000a"; ctx.fillRect(x - c * 0.35, y - c * 0.5, c * 0.7, 4); ctx.fillStyle = e.hp / e.max > 0.4 ? "#66bb6a" : "#ef5350"; ctx.fillRect(x - c * 0.35, y - c * 0.5, c * 0.7 * Math.max(0, e.hp / e.max), 4);
    }
  }

  $("castle").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cs]"); if (!b) return;
    const a = b.dataset.cs;
    if (a === "close") { open = false; cancelAnimationFrame(raf); $("castle").classList.add("hidden"); }
    else if (a === "map") startGame(Number(b.dataset.i));
    else if (a === "leave") { if (S && !S.over && log.length && !confirm(t("cs.leave"))) return; cancelAnimationFrame(raf); screen = "maps"; S = null; render(); load(); }
    else if (a === "again") startGame(map);
    else if (a === "kind") { kind = b.dataset.k; document.querySelectorAll(".cs-bar [data-k]").forEach((x) => x.classList.toggle("on", x.dataset.k === kind)); }
    else if (a === "wave") { if (S && !S.over) act({ a: "wave" }); }
    else if (a === "up" && sel) act({ a: "up", x: sel.x, y: sel.y });
    else if (a === "sell" && sel) { if (act({ a: "sell", x: sel.x, y: sel.y })) sel = null; }
    else if (a === "speed") { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; b.textContent = speed + "×"; }
    else if (a === "pause") { paused = !paused; b.textContent = paused ? "▶" : "⏸"; }
  });
  $("castleOpen").addEventListener("click", () => { open = true; screen = "maps"; $("castle").classList.remove("hidden"); render(); load(); });
  document.addEventListener("langchange", () => { if (screen === "maps") render(); });
})();
