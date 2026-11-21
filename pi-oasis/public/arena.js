// ⚔️ Jerry Arena – battles between players. The server runs every battle; this page shows it and
// sends the player's choices. Also used to watch a battle (spectator) and to stream it (streamer mode).
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const AR = window.ArenaLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!AR || !G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const ICON = { strike: "⚔️", trick: "🎯", guard: "🛡️", rage: "🔥", heal: "💚" };
  const MODE_ICON = { "1v1": "⚔️", "2v2": "👥", ffa4: "🎲" };

  let open = false, screen = "lobby", mode = "1v1", prof = null, view = null, matchId = null, timer = null, offset = 0;
  let sel = null, sent = false, top = null, shownRound = 0, resultShown = null, streamer = false, queueT = 0, busy = false;
  try { streamer = localStorage.getItem("oasis_stream") === "1"; } catch (e) {}

  const setT = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const shareUrl = (q) => `${location.origin}/?go=arena&${q}`;

  // ---------- data ----------
  async function loadProfile() {
    if (!G.account) { prof = null; return; }
    try { prof = await Pi.arena(); offset = prof.now - Date.now(); } catch (e) { G.toast(e.message); }
  }
  async function poll() {
    if (!open) return;
    try {
      if (matchId) {
        const v = await Pi.arenaMatch({ id: matchId });
        offset = v.now - Date.now();
        onView(v);
        return setT(poll, v.status === "live" ? (sent ? 2200 : 1500) : v.status === "waiting" ? 2000 : 4000);
      }
      if (prof && prof.queue) {
        await loadProfile();
        if (prof && prof.active) { matchId = prof.active.id; screen = "battle"; sel = null; sent = false; render(); return poll(); }
        render();
        return setT(poll, 2000);
      }
    } catch (e) { G.toast(e.message); if (matchId && /ar\./.test(e.code || "")) { matchId = null; screen = "lobby"; await loadProfile(); render(); } }
    setT(poll, 3000);
  }
  function onView(v) {
    const prevRound = view && view.id === v.id ? view.round : 0;
    view = v;
    if (v.status === "waiting") screen = "room";
    else if (v.status === "live") { if (screen !== "battle") { screen = "battle"; sel = null; } if (v.round !== prevRound) { sent = !!v.mine; sel = null; } else if (v.mine) sent = true; }
    else { screen = "result"; }
    render();
    if (v.status === "live" || v.status === "done") floaters();
    if (v.status === "done" && resultShown !== v.id) { resultShown = v.id; if (v.me !== null) G.burst && v.winnerTeam === (v.players[v.me] || {}).team && G.burst(); loadProfile(); }
  }
  // damage numbers floating over the fighters hit in the last resolved round
  function floaters() {
    const e = view && view.log[view.log.length - 1];
    if (!e || e.r <= shownRound) return;
    if (shownRound === 0 && view.log.length > 1) { shownRound = e.r; return; }
    shownRound = e.r;
    for (const [slot, d] of Object.entries(e.d || {})) { const c = document.querySelector(`#arena [data-slot="${slot}"]`); if (c) c.insertAdjacentHTML("beforeend", `<b class="ar-fl">−${d}</b>`); }
    for (const [slot, h] of Object.entries(e.h || {})) { const c = document.querySelector(`#arena [data-slot="${slot}"]`); if (c) c.insertAdjacentHTML("beforeend", `<b class="ar-fl ar-heal">+${h}</b>`); }
  }

  // ---------- screens ----------
  const bar = (hp) => `<span class="ar-hp"><i style="width:${Math.max(0, hp)}%"></i><b>${Math.max(0, hp)}</b></span>`;
  const pips = (en) => `<span class="ar-en">${Array.from({ length: AR.EN_MAX }, (_, i) => `<i class="${i < en ? "on" : ""}"></i>`).join("")}</span>`;

  function lobby() {
    if (!G.account) return `<p class="jm-note">${t("t.loginFirst")}</p>${howTo()}`;
    const st = prof ? prof.stats : { trophies: 0, wins: 0, losses: 0, draws: 0 };
    const q = prof && prof.queue;
    return `<div class="jm-hero"><div><small>${t("arn.trophies")}</small><b>🏆 ${fmtN(st.trophies)}</b></div>
        <div><small>${t("arn.record")}</small><b dir="ltr">${st.wins} / ${st.losses} / ${st.draws}</b></div>
        <div><small>${t("arn.weekPts")}</small><b>🔥 ${fmtN(prof ? prof.week : 0)}</b></div></div>
      <p class="jm-note">${t("arn.rewards", { n: prof ? prof.rewardsLeft : 0 })}</p>
      <div class="ar-modes">${Object.keys(AR.MODES).map((m) => `<button class="${m === mode ? "on" : ""}" data-ar="mode" data-m="${m}"><i>${MODE_ICON[m]}</i><b>${t("arn.m." + m)}</b></button>`).join("")}</div>
      ${q ? `<div class="ar-search"><div class="ar-spin"></div><b>${t("arn.searching")}</b><small>${t("arn.searchD")}</small><button class="btn secondary" data-ar="cancel">${t("arn.cancel")}</button></div>`
        : `<button class="db-go" data-ar="quick">⚡ ${t("arn.quick")}</button>
           <div class="ar-row"><button class="btn secondary" data-ar="bot">🤖 ${t("arn.bot")}</button><button class="btn secondary" data-ar="room">🏠 ${t("arn.room")}</button></div>
           <div class="ref-row ar-join"><input id="arCode" dir="ltr" maxlength="8" placeholder="${t("arn.codePh")}" autocapitalize="characters"><button class="btn small gold" data-ar="join">${t("arn.joinGo")}</button></div>`}
      <h4>👁️ ${t("arn.live")}</h4>
      <div class="jm-top">${prof && prof.live.length ? prof.live.map((x) => `<div><span>${MODE_ICON[x.mode]} ${esc(x.names || "")}</span><button class="btn small secondary" data-ar="watch" data-id="${x.id}">${t("arn.watch")}</button></div>`).join("") : `<small>${t("arn.noLive")}</small>`}</div>
      <h4>🏆 ${t("arn.top")}</h4>
      <div class="jm-top">${top ? (top.week.length ? top.week.slice(0, 10).map((x, i) => `<div><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}. ${esc(x.username)}</span><b dir="ltr">🔥 ${fmtN(x.pts)}</b></div>`).join("") : `<small>${t("arn.noTop")}</small>`) : "…"}
        <small>${t("arn.topD")}</small></div>
      ${howTo()}`;
  }
  const howTo = () => `<h4>📖 ${t("arn.how")}</h4><div class="jm-how">${[1, 2, 3, 4, 5].map((i) => `<div><i>${i}</i><span>${t("arn.how." + i)}</span></div>`).join("")}</div>`;

  function room() {
    const v = view, isHost = v.isHost;
    const seat = (p) => p.name ? `<div class="ar-seat"><b>${esc(p.name)}</b></div>` : `<div class="ar-seat empty">${t("arn.seat")}</div>`;
    const teams = v.mode === "2v2" ? [0, 1] : [null];
    const body = teams.map((tm) => `${tm !== null ? `<h4>${tm === 0 ? "🔵 " + t("arn.teamA") : "🔴 " + t("arn.teamB")}</h4>` : ""}<div class="ar-seats">${v.players.filter((p) => tm === null || p.team === tm).map(seat).join("")}</div>`).join("");
    return `<div class="ar-code"><small>${t("arn.code")}</small><b dir="ltr">${esc(v.code || "")}</b></div>
      <div id="arShare"></div>
      ${body}
      <div class="ref-row ar-join"><input id="arInv" dir="auto" maxlength="40" placeholder="${t("arn.invPh")}"><button class="btn small gold" data-ar="invite">${t("arn.invite")}</button></div>
      ${isHost ? `<button class="db-go" data-ar="start">⚔️ ${v.players.filter((p) => p.name).length < v.players.length ? t("arn.startBots") : t("arn.start")}</button>` : `<p class="jm-note">${t("arn.waiting")}</p>`}
      <button class="btn secondary" data-ar="leave">${t("arn.leave")}</button>`;
  }

  function fighter(p, mine) {
    const cls = ["ar-f", p.alive ? "" : "dead", mine ? "me" : "", p.team === (view.me !== null ? view.players[view.me].team : 0) ? "ally" : "foe", sel === p.slot ? "sel" : ""].join(" ");
    return `<div class="${cls}" data-slot="${p.slot}" ${!mine && p.alive && view.me !== null && p.team !== view.players[view.me].team ? `data-ar="target" data-s="${p.slot}"` : ""}>
      <b class="ar-nm">${esc(p.name || "")}${mine ? " · " + t("arn.you") : ""}</b>${bar(p.hp)}${pips(p.en)}
      <small>${!p.alive ? "💀 " + t("arn.out") : view.status === "done" ? "" : p.moved ? "✅ " + t("arn.ready") : "💭 " + t("arn.thinking")}</small></div>`;
  }
  function battle() {
    const v = view, meP = v.me !== null ? v.players[v.me] : null;
    const spec = v.me === null || !meP.alive;
    const foes = meP ? v.players.filter((p) => p.team !== meP.team) : v.players.filter((p) => p.team === 1 || p.slot >= v.players.length / 2);
    const mates = meP ? v.players.filter((p) => p.team === meP.team) : v.players.filter((p) => !foes.includes(p));
    const left = Math.max(0, Math.ceil((v.deadline - (Date.now() + offset)) / 1000));
    if (!sel && meP) { const f = foes.filter((p) => p.alive).sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0]; sel = f ? f.slot : null; }
    const entry = v.log[v.log.length - 1];
    const nm = (s) => esc((v.players[s] || {}).name || "");
    const lines = entry ? entry.m.map(([s, a, tg]) => {
      if (a === "heal") return `${ICON.heal} ${nm(s)} ${t("arn.act.heal")} +${(entry.h || {})[s] || 0}`;
      if (a === "guard") return `${ICON.guard} ${nm(s)} ${t("arn.act.guard")}`;
      return `${ICON[a]} ${nm(s)} → ${nm(tg)}`;
    }) : [];
    const me = meP ? v.players[v.me] : null;
    return `<div class="ar-top"><span>${t("arn.round", { n: v.round, m: v.max })}</span><span class="ar-timer ${left <= 5 ? "hot" : ""}">⏱️ ${left}s</span>${streamer ? `<span class="ar-live">🔴 LIVE</span>` : ""}</div>
      <div class="ar-bar"><i style="width:${Math.min(100, (100 * left) / (AR.ROUND_MS / 1000))}%"></i></div>
      <div class="ar-field foes">${foes.map((p) => fighter(p, false)).join("")}</div>
      <div class="ar-log">${lines.length ? `<small>${t("arn.last")}</small>` + lines.map((l) => `<div>${l}</div>`).join("") : `<small>${t("arn.firstRound")}</small>`}</div>
      <div class="ar-field mates">${mates.map((p) => fighter(p, meP && p.slot === meP.slot)).join("")}</div>
      ${spec ? `<p class="jm-note">${t("arn.spec")}</p>` : `<div class="ar-acts ${sent ? "locked" : ""}">${Object.keys(AR.ACTS).map((a) => { const c = AR.ACTS[a].cost, can = me.en >= c && !sent; return `<button data-ar="act" data-a="${a}" ${can ? "" : "disabled"}><i>${ICON[a]}</i><b>${t("arn.act." + a)}</b><small>${c ? c + "⚡" : t("arn.act." + a + ".d")}</small></button>`; }).join("")}</div>
      <p class="jm-note">${sent ? t("arn.locked") : foes.filter((p) => p.alive).length > 1 ? t("arn.target") : t("arn.pick")}</p>`}
      <div class="ar-tools"><button class="btn small secondary" data-ar="live">📡 ${t("arn.stream")}</button><button class="btn small secondary" data-ar="streamer">${streamer ? "✓ " : ""}${t("arn.streamer")}</button></div>
      <div id="arShare"></div>`;
  }

  function result() {
    const v = view, meP = v.me !== null ? v.players[v.me] : null;
    const mine = meP && (v.result || []).find((x) => x.slot === v.me);
    const win = meP && v.winnerTeam === meP.team, draw = v.winnerTeam === null;
    const place = v.mode === "ffa4" && meP && v.placements ? v.placements.indexOf(v.me) + 1 : 0;
    const title = !meP ? (draw ? t("arn.draw") : t("arn.won", { n: (v.players.find((p) => p.team === v.winnerTeam) || {}).name || "" })) : v.mode === "ffa4" ? t("arn.place", { n: place }) : draw ? t("arn.draw") : win ? t("arn.win") : t("arn.lose");
    return `<div class="ar-end ${win ? "win" : ""}"><div class="ar-big">${win || place === 1 ? "🏆" : draw ? "🤝" : "💀"}</div><h2>${title}</h2>
      ${mine ? `<div class="ar-won"><span>🏆 ${mine.d >= 0 ? "+" : ""}${mine.d}</span>${mine.reward ? `<span>🌴 +${fmtN(mine.reward)}</span>` : ""}</div>` : ""}
      ${!v.ranked && meP ? `<p class="jm-note">${t("arn.noRank")}</p>` : ""}
      <div class="jm-top">${v.players.map((p) => `<div class="${meP && p.slot === v.me ? "db-me" : ""}"><span>${p.team === v.winnerTeam ? "🏆 " : ""}${esc(p.name || "")}</span><b dir="ltr">❤️ ${p.hp}</b></div>`).join("")}</div>
      ${meP ? `<button class="db-go" data-ar="again">⚔️ ${t("arn.again")}</button>` : ""}
      <button class="btn secondary" data-ar="lobby">${t("arn.lobby")}</button><div id="arShare"></div></div>`;
  }

  function render() {
    const el = $("arena");
    if (el.classList.contains("hidden")) return;
    el.classList.toggle("stm", streamer && screen === "battle");
    const body = screen === "room" && view ? room() : screen === "battle" && view ? battle() : screen === "result" && view ? result() : lobby();
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-ar="close">‹ ${t("jm.back")}</button><b>⚔️ Jerry <span>Arena</span></b><button class="jm-back" data-ar="help">?</button></header><div class="jm-body">${body}</div>`;
    const sh = $("arShare");
    if (sh && window.JShare && view) {
      if (screen === "room" && view.code) window.JShare.bar(sh, { url: shareUrl("room=" + view.code), text: t("arn.shareRoomText", { c: view.code }), labels: { copy: t("js.copy"), copied: t("js.copied"), more: t("js.more") } });
      else if (screen === "result") window.JShare.bar(sh, { url: location.origin + "/", text: t("arn.shareText"), labels: { copy: t("js.copy"), copied: t("js.copied"), more: t("js.more") } });
      else if (screen === "battle" && showShare) window.JShare.bar(sh, { url: shareUrl("watch=" + view.id), text: t("arn.watchText"), labels: { copy: t("js.copy"), copied: t("js.copied"), more: t("js.more") } });
    }
  }
  let showShare = false;

  // ---------- actions ----------
  async function act(b) {
    const a = b.dataset.ar;
    if (a === "close") { open = false; clearTimeout(timer); $("arena").classList.add("hidden"); return; }
    if (a === "help") return G.openHelp();
    if (a === "mode") { mode = b.dataset.m; return render(); }
    if (a === "target") { sel = Number(b.dataset.s); return render(); }
    if (a === "live") { showShare = !showShare; return render(); }
    if (a === "streamer") { streamer = !streamer; try { localStorage.setItem("oasis_stream", streamer ? "1" : "0"); } catch (e) {} return render(); }
    if (a === "lobby") { matchId = null; view = null; screen = "lobby"; await loadProfile(); render(); return poll(); }
    if (a === "watch") { matchId = Number(b.dataset.id); screen = "battle"; view = null; shownRound = 0; return poll(); }
    if (!G.account) return G.toast(t("t.loginFirst"));
    if (busy) return;
    busy = true; b.disabled = true;
    try {
      if (a === "quick") { const r = await Pi.arenaQueue({ mode }); if (r.match) { matchId = r.match; screen = "battle"; } await loadProfile(); }
      else if (a === "bot" || a === "again") { const r = await Pi.arenaQueue({ action: "bot", mode: a === "again" ? (view ? view.mode : mode) : mode }); if (a === "again") { matchId = null; view = null; } matchId = r.match; screen = "battle"; sel = null; sent = false; shownRound = 0; }
      else if (a === "cancel") { await Pi.arenaQueue({ action: "leave" }); await loadProfile(); }
      else if (a === "room") { const r = await Pi.arenaRoom({ action: "create", mode }); matchId = r.id; screen = "room"; }
      else if (a === "join") { const r = await Pi.arenaRoom({ action: "join", code: $("arCode").value }); matchId = r.id; screen = "room"; }
      else if (a === "invite") { await Pi.arenaRoom({ action: "invite", id: matchId, username: $("arInv").value }); G.toast(t("arn.invSent")); $("arInv").value = ""; }
      else if (a === "start") await Pi.arenaRoom({ action: "start", id: matchId, fill: true });
      else if (a === "leave") { await Pi.arenaRoom({ action: "leave", id: matchId }); matchId = null; view = null; screen = "lobby"; await loadProfile(); }
      else if (a === "act") {
        const r = await Pi.arenaMove({ id: matchId, round: view.round, act: b.dataset.a, target: sel });
        sent = true; onView(r);
      }
    } catch (e) { G.toast(e.message); }
    busy = false;
    render(); if (open) poll();
  }
  $("arena").addEventListener("click", (e) => { const b = e.target.closest("[data-ar]"); if (b) act(b); });

  async function openArena(opts) {
    open = true; screen = "lobby"; view = null; matchId = null; shownRound = 0;
    $("arena").classList.remove("hidden"); render();
    if (opts && opts.watch) { matchId = Number(opts.watch); screen = "battle"; return poll(); }
    await loadProfile();
    try { top = await Pi.arenaTop(); } catch (e) {}
    if (prof && prof.active) { matchId = prof.active.id; screen = prof.active.status === "waiting" ? "room" : "battle"; }
    render();
    if (opts && opts.room && G.account) {
      try { const r = await Pi.arenaRoom({ action: "join", code: opts.room }); matchId = r.id; screen = "room"; } catch (e) { G.toast(e.message); }
    }
    poll();
  }
  $("arenaOpen").addEventListener("click", () => {
    const q = new URLSearchParams(location.search), room = q.get("room"), watch = q.get("watch");
    openArena({ room, watch });
    // the link parameters are used once
    if (room || watch) { const u = new URL(location.href); u.searchParams.delete("room"); u.searchParams.delete("watch"); history.replaceState(null, "", u); }
  });
  document.addEventListener("langchange", render);
  // a watch link opens the battle even for a visitor who is not signed in with Pi
  { const w = new URLSearchParams(location.search).get("watch"); if (w) setTimeout(() => $("arenaOpen").click(), 1500); }
  // 1-second tick for the countdown while a battle is on screen
  setInterval(() => { if (open && screen === "battle" && view && view.status === "live") { const el = document.querySelector("#arena .ar-timer"), bar_ = document.querySelector("#arena .ar-bar i"); if (el) { const left = Math.max(0, Math.ceil((view.deadline - (Date.now() + offset)) / 1000)); el.textContent = "⏱️ " + left + "s"; el.classList.toggle("hot", left <= 5); if (bar_) bar_.style.width = Math.min(100, (100 * left) / (AR.ROUND_MS / 1000)) + "%"; } } }, 1000);
})();
