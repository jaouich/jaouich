// 💬 Chat: one public room and private chats between members. The server stores and filters; this page shows it.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  let open = false, screen = "list", room = "main", rooms = null, msgs = [], last = 0, timer = 0, sheet = null, busy = false;

  const setT = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const title = (r) => (r === "main" ? t("chat.main") : r.slice(3));

  async function loadRooms() {
    if (!G.account) { rooms = null; return paintBadge(0); }
    try { rooms = await Pi.chatRooms(); paintBadge(rooms.unread); } catch (e) {}
    if (open && screen === "list") render();
  }
  function paintBadge(n) { const el = $("chatBadge"); if (el) el.textContent = n ? "💬 " + n : t("chat.badge"); }
  async function poll() {
    if (!open) return;
    if (screen === "list") { await loadRooms(); return setT(poll, 6000); }
    try {
      const r = await Pi.chatMsgs(room, last);
      if (r.msgs.length) { msgs = msgs.concat(r.msgs); last = r.last; paintMsgs(true); }
    } catch (e) {}
    setT(poll, 2500);
  }
  function render() {
    const el = $("chat");
    if (el.classList.contains("hidden")) return;
    let body;
    if (!G.account) body = `<p class="jm-note">${t("t.loginFirst")}</p>`;
    else if (screen === "list") {
      body = `<p class="jm-note">${t("chat.rules")}</p>` + (rooms ? rooms.rooms.map((r) => `<button class="ch-room" data-ch="room" data-r="${esc(r.room)}"><i>${r.room === "main" ? "🌍" : "👤"}</i><span><b>${esc(title(r.room))}</b><small>${r.last ? esc(r.last.username + ": " + r.last.text).slice(0, 60) : t("chat.empty")}</small></span>${r.unread ? `<em>${r.unread}</em>` : ""}</button>`).join("") : "<p class='jm-note'>…</p>")
        + `<h4>✉️ ${t("chat.new")}</h4><div class="ref-row"><input id="chTo" dir="auto" maxlength="40" placeholder="${t("box.to")}"><button class="btn small gold" data-ch="new">${t("chat.start")}</button></div>`
        + (rooms && rooms.blocked.length ? `<h4>🚫 ${t("chat.blocked")}</h4>${rooms.blocked.map((u) => `<button class="ch-room small" data-ch="unblock" data-u="${esc(u)}"><span><b>${esc(u)}</b><small>${t("chat.unblock")}</small></span></button>`).join("")}` : "");
    } else {
      body = `<div class="ch-msgs" id="chMsgs"></div><form class="ch-in" id="chForm"><input id="chText" autocomplete="off" maxlength="400" dir="auto" placeholder="${t("chat.type")}"><button class="btn gold" type="submit">➤</button></form>`;
    }
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-ch="${screen === "list" ? "close" : "back"}">‹ ${screen === "list" ? t("jm.back") : t("chat.t")}</button><b>${screen === "list" ? "💬 " + t("chat.t") : esc(title(room))}</b>${screen !== "list" && room !== "main" ? `<button class="jm-back" data-ch="gift">🎁</button>` : "<span></span>"}</header><div class="jm-body ${screen === "chat" ? "ch-body" : ""}">${body}</div>${sheet ? sheetHtml() : ""}`;
    if (screen === "chat") { paintMsgs(false); $("chForm").addEventListener("submit", send); $("chText").addEventListener("focus", () => setTimeout(() => $("chForm").scrollIntoView({ block: "end" }), 300)); }
  }
  function paintMsgs(stick) {
    const box = $("chMsgs"); if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = msgs.length ? msgs.map((m) => `<div class="ch-m ${m.mine ? "me" : ""}" data-ch="msg" data-id="${m.id}">${m.mine ? "" : `<b>${esc(m.user)}</b>`}<span>${esc(m.text)}</span><small>${hm(m.at)}</small></div>`).join("") : `<p class="jm-note">${t("chat.empty")}</p>`;
    if (!stick || near) box.scrollTop = box.scrollHeight;
  }
  function sheetHtml() {
    const m = msgs.find((x) => x.id === sheet); if (!m) return "";
    const adm = G.account && G.account.isAdmin;
    return `<div class="cat-modal" data-ch="shut"><div class="cat-card"><p><b>${esc(m.user)}</b><br>${esc(m.text)}</p>
      ${m.mine ? "" : `<button class="btn secondary" data-ch="report" data-id="${m.id}">🚩 ${t("chat.report")}</button><button class="btn secondary" data-ch="block" data-u="${esc(m.user)}">🚫 ${t("chat.block")}</button>`}
      ${m.mine ? "" : `<button class="btn secondary" data-ch="dm" data-u="${esc(m.user)}">💬 ${t("chat.dm")}</button>`}
      ${adm ? `<button class="btn secondary" data-ch="adel" data-id="${m.id}">🗑️ ${t("chat.del")}</button><button class="btn secondary" data-ch="amute" data-u="${esc(m.user)}">🔇 ${t("chat.mute")}</button>` : ""}
      <button class="btn" data-ch="shut">${t("cat.close")}</button></div></div>`;
  }
  async function enter(r) {
    room = r; screen = "chat"; msgs = []; last = 0; sheet = null; render();
    try { const x = await Pi.chatMsgs(room, 0); msgs = x.msgs; last = x.last; } catch (e) { G.toast(e.message); }
    paintMsgs(false); setT(poll, 2500); loadRooms();
  }
  async function send(e) {
    e.preventDefault(); if (busy) return;
    const inp = $("chText"), text = inp.value.trim(); if (!text) return;
    busy = true; inp.value = "";
    try { await Pi.chatSend(room, text); const r = await Pi.chatMsgs(room, last); msgs = msgs.concat(r.msgs); last = r.last; paintMsgs(false); }
    catch (err) { G.toast(err.message); inp.value = text; }
    busy = false; inp.focus();
  }
  async function act(b) {
    const a = b.dataset.ch;
    try {
      if (a === "close") { open = false; clearTimeout(timer); $("chat").classList.add("hidden"); loadRooms(); }
      else if (a === "back") { screen = "list"; render(); loadRooms(); setT(poll, 6000); }
      else if (a === "room") enter(b.dataset.r);
      else if (a === "new") { const u = ($("chTo").value || "").trim().replace(/^@/, ""); if (u) enter("dm:" + u); }
      else if (a === "msg") { sheet = Number(b.dataset.id); render(); }
      else if (a === "shut") { if (b.classList.contains("btn") || b.classList.contains("cat-modal")) { sheet = null; render(); } }
      else if (a === "report") { await Pi.chatReport(Number(b.dataset.id)); sheet = null; render(); G.toast(t("chat.reported")); }
      else if (a === "block") { await Pi.chatBlock(b.dataset.u, true); sheet = null; screen = "list"; render(); G.toast(t("chat.didBlock")); loadRooms(); }
      else if (a === "unblock") { await Pi.chatBlock(b.dataset.u, false); loadRooms(); }
      else if (a === "dm") { enter("dm:" + b.dataset.u); }
      else if (a === "gift") { open = false; $("chat").classList.add("hidden"); $("boxOpen").click(); setTimeout(() => { const i = $("bxTo"); if (i) i.value = room.slice(3); }, 400); }
      else if (a === "adel") { await Pi.adminChat({ action: "delete", id: Number(b.dataset.id) }); msgs = msgs.filter((m) => m.id !== Number(b.dataset.id)); sheet = null; render(); }
      else if (a === "amute") { await Pi.adminChat({ action: "mute", user: b.dataset.u, hours: 24 }); sheet = null; render(); G.toast(t("chat.muted")); }
    } catch (e) { G.toast(e.message); }
  }
  $("chat").addEventListener("click", (e) => { const b = e.target.closest("[data-ch]"); if (b) act(b); });
  function openChat(withUser) {
    open = true; $("chat").classList.remove("hidden");
    if (withUser) return enter("dm:" + withUser);
    screen = "list"; render(); loadRooms(); setT(poll, 6000);
  }
  $("chatOpen").addEventListener("click", () => openChat());
  window.OasisChat = { open: openChat };
  document.addEventListener("langchange", () => { render(); paintBadge(rooms ? rooms.unread : 0); });
  // unread badge on the Farm hub (checked now and every minute while signed in)
  setInterval(() => { if (G.account && !open) loadRooms(); }, 60000);
  setTimeout(loadRooms, 3500);
  const w = new URLSearchParams(location.search).get("with"); if (w) setTimeout(() => G.account && openChat(w), 1500);
  paintBadge(0);
})();
