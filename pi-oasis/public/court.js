// 🏛️ The Court: titles by real Pi paid, Houses (alliances), Parliament elections and votes. Everything is in-game.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic, G = window.OasisGame, Pi = window.PiBridge;
  if (!L || !G || !$("court")) return;
  const C = L.COURT;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const dt = (ms) => new Date(ms).toLocaleDateString(window.I18N.locale, { month: "short", day: "numeric" });
  const ICON = { emperor: "👑", prince: "🤴", vizier: "🎩", emir: "🛡️", notable: "✨", citizen: "🌴" };
  let tab = "court", D = {}, busy = false, house = { name: "", emoji: "🌴" };

  async function load() {
    if (!G.account) { D = {}; return render(); }
    try {
      if (tab === "court") D.court = await Pi.court();
      else if (tab === "houses") D.houses = await Pi.houses();
      else if (tab === "parl") D.election = await Pi.election();
      else D.decrees = await Pi.decrees();
    } catch (e) { G.toast(e.message); }
    render();
  }
  const perks = (id) => { const x = C.TITLES.find((y) => y.id === id); return x ? (x.mult > 1 ? t("ct.perks", { m: x.mult, c: fmtN(x.coins) }) : t("ct.perks1", { c: fmtN(x.coins) })) : ""; };

  function courtTab() {
    const d = D.court; if (!d) return `<p class="jm-note">…</p>`;
    const me = d.me, g = d.gift;
    const mine = me.rank ? t("ct.me", { r: me.rank, t: t("ct." + me.title) }) : t("ct.me0");
    const pass = me.above ? t(me.rank > C.SEATS ? "ct.pass10" : "ct.pass", { u: esc(me.above), p: fmtN(me.need) }) : "";
    const parts = Object.entries(g.parts || {}).map(([k, n]) => `${t("ct.p." + k)}: ${fmtN(n)}`).join(" · ");
    return `<div class="ct-me"><b>${mine}</b>${pass ? `<span>${pass}</span>` : ""}
      ${g.total ? `<button class="btn gold" data-ct="claim" ${g.claimed || busy ? "disabled" : ""}>${g.claimed ? t("ct.gifted") : "🎁 " + t("ct.gift", { c: fmtN(g.total) })}</button><small>${parts}</small>` : `<small>${t("ct.nogift")}</small>`}
      <button class="btn small secondary" data-ct="support">${t("th.support")}</button></div>
      <h4>${t("ct.ranking")}</h4>` + (d.top.length ? d.top.map((x) => `<div class="ct-row ${x.me ? "me" : ""} t-${x.title}"><i>${ICON[x.title]}</i><span><b>${esc(x.username)}</b><small>${esc(t("ct." + x.title))} · ${perks(x.title)}</small></span><em dir="ltr">${fmtN(x.paid)} Pi</em></div>`).join("") : `<p class="jm-note">${t("ct.empty")}</p>`)
      + `<p class="jm-note">${t("th.note")}</p>`;
  }
  function housesTab() {
    const d = D.houses; if (!d) return `<p class="jm-note">…</p>`;
    const mine = d.mine;
    const create = mine ? "" : `<div class="ct-form"><p class="jm-note">${d.fee === 1 ? t("hs.fee1") : t("hs.fee10")}</p>
      <div class="ct-emojis">${d.emojis.map((e) => `<button type="button" data-ct="emoji" data-e="${e}" class="${e === house.emoji ? "on" : ""}">${e}</button>`).join("")}</div>
      <input id="ctHouseName" maxlength="20" placeholder="${t("hs.name")}" value="${esc(house.name)}">
      <button class="btn gold" data-ct="found" ${busy ? "disabled" : ""}>${t("hs.found", { p: d.fee })}</button></div>`;
    const my = mine ? `<div class="ct-me"><b>${mine.emoji} ${t("hs.mine", { n: esc(mine.name) })}${mine.owner ? " · " + t("hs.owner") : ""}</b>
      ${(d.members || []).map((m) => `<div class="ct-mem"><span>${esc(m.username)}</span><em dir="ltr">${fmtN(m.paid)} Pi</em></div>`).join("")}
      <button class="btn small secondary" data-ct="leave">${t("hs.leave")}</button></div>` : "";
    return `<p class="jm-note">${t("hs.d", { c: fmtN(d.daily) })}</p>${my}${create}` + (d.houses.length ? d.houses.map((h) => `<div class="ct-row ${mine && mine.id === h.id ? "me" : ""}"><i>${h.emoji}</i><span><b>${h.rank}. ${esc(h.name)}</b><small>${esc(h.owner)} · ${t("hs.members", { n: h.members, s: fmtN(h.score) })}</small></span>${mine ? "" : `<button class="btn small" data-ct="join" data-id="${h.id}">${t("hs.join")}</button>`}</div>`).join("") : `<p class="jm-note">${t("hs.none")}</p>`);
  }
  function parlTab() {
    const d = D.election; if (!d) return `<p class="jm-note">…</p>`;
    const P = C.PARLIAMENT, ph = d.phase;
    const intro = `<p class="jm-note">${t("pa.d", { n: P.SEATS, c: fmtN(P.COINS), s: fmtN(P.SPEAKER_COINS) })}</p><div class="ct-phase on">${t("pa.p." + ph)}</div><p class="jm-note">${t("pa.weight", { w: fmtN(d.weight) })}</p>`;
    let act = "";
    if (ph === "candidacy") act = d.runs ? `<p class="jm-note">${t("pa.running")}</p>` : d.canRun ? `<div class="ct-form"><input id="ctSpeech" maxlength="100" placeholder="${t("pa.speech")}"><button class="btn gold" data-ct="run">${t("pa.run")}</button></div>` : `<p class="jm-note">${t("pa.cannot")}</p>`;
    const cands = d.candidates.length ? `<h4>${t("pa.cands")}</h4>` + d.candidates.map((c) => `<div class="ct-row ${c.me ? "me" : ""}"><i>🗳️</i><span><b>${esc(c.username)}</b><small>${esc(c.speech || "")}</small></span><em dir="ltr">${fmtN(c.votes)}</em>${ph === "voting" && !c.me && !d.votedFor ? `<button class="btn small" data-ct="vote" data-uid="${esc(c.uid)}">${t("pa.vote")}</button>` : d.votedFor === c.uid ? "✅" : ""}</div>`).join("") : "";
    const mem = `<h4>🏛️ ${t("pa.members")}</h4>` + (d.parliament.members.length ? d.parliament.members.map((m) => `<div class="ct-row"><i>${m.seat === 1 ? "🎙️" : "🏛️"}</i><span><b>${esc(m.username)}</b><small>${m.seat === 1 ? t("pa.speaker") : "#" + m.seat}</small></span><em dir="ltr">${fmtN(m.votes)}</em></div>`).join("") : `<p class="jm-note">${t("pa.nomembers")}</p>`);
    const nd = new Date(); const nxt = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + (nd.getUTCDate() >= 1 && ph !== "x" && d.day > 7 ? 1 : 0), 1);
    const how = `<div class="ct-me"><b>${t("pa.how.t")}</b><small>${t("pa.how.1")}</small><small>${t("pa.how.2")}</small><small>${t("pa.how.3")}</small><small>${t("pa.how.4")}</small><small><b>${t("pa.now", { d: d.day })}</b>${d.day > 7 ? " " + t("pa.next", { date: new Date(nxt).toLocaleDateString(window.I18N.locale, { day: "numeric", month: "long", timeZone: "UTC" }) }) : ""}</small></div>`;
    return intro + how + act + cands + mem;
  }
  function votesTab() {
    const d = D.decrees; if (!d) return `<p class="jm-note">…</p>`;
    const card = (p) => { const tot = p.tally.reduce((a, b) => a + b, 0) || 1; return `<div class="ct-poll"><b>${esc(p.question)}</b><small>${t("vt.k." + p.kind)} · ${t("vt.by", { u: esc(p.by) })} · ${p.closed ? t("vt.voters", { n: p.voters }) : t("vt.left", { d: dt(p.closesAt) })}</small>
      ${p.options.map((o, i) => `<div class="ct-opt ${p.mine === i || p.winner === i ? "on" : ""}"><span>${esc(o)}</span><i style="width:${Math.round((100 * p.tally[i]) / tot)}%"></i><em dir="ltr">${fmtN(p.tally[i])}</em>${!p.closed && p.mine == null ? `<button class="btn small" data-ct="dvote" data-id="${p.id}" data-i="${i}">${t("vt.vote")}</button>` : ""}</div>`).join("")}
      ${p.closed ? `<small>${p.winner == null ? t("vt.nowin") : t("vt.winner", { o: esc(p.options[p.winner]) })}</small>` : p.mine != null ? `<small>${t("vt.voted")}</small>` : ""}</div>`; };
    const form = d.canCreate ? `<div class="ct-form"><h4>${t("vt.create")}</h4><select id="ctKind">${d.kinds.map((k) => `<option value="${k}">${t("vt.k." + k)}</option>`).join("")}</select><input id="ctQ" maxlength="140" placeholder="${t("vt.q")}"><textarea id="ctOpts" rows="4" placeholder="${t("vt.opts")}"></textarea><button class="btn gold" data-ct="dcreate">${t("vt.send")}</button></div>` : "";
    return `<p class="jm-note">${t("vt.d")}</p><p class="jm-note">${t("vt.weight", { w: fmtN(d.weight) })}</p>${form}<h4>${t("vt.open")}</h4>${d.open.length ? d.open.map(card).join("") : `<p class="jm-note">${t("vt.none")}</p>`}<h4>${t("vt.done")}</h4>${d.done.length ? d.done.map(card).join("") : `<p class="jm-note">${t("vt.none")}</p>`}`;
  }
  function render() {
    const el = $("court");
    if (el.classList.contains("hidden")) return;
    const tabs = [["court", t("ct.tab.court")], ["houses", t("ct.tab.houses")], ["parl", t("ct.tab.parl")], ["votes", t("ct.tab.votes")]];
    const body = !G.account ? `<p class="jm-note">${t("t.loginFirst")}</p>` : tab === "court" ? courtTab() : tab === "houses" ? housesTab() : tab === "parl" ? parlTab() : votesTab();
    const keep = { n: ($("ctHouseName") || {}).value, s: ($("ctSpeech") || {}).value, q: ($("ctQ") || {}).value, o: ($("ctOpts") || {}).value };
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-ct="close">‹ ${t("ct.back")}</button><b>${t("ct.title")}</b><span></span></header>
      <div class="ct-tabs">${tabs.map(([k, n]) => `<button data-ct="tab" data-t="${k}" class="${k === tab ? "on" : ""}">${n}</button>`).join("")}</div><div class="jm-body">${body}</div>`;
    if (keep.n != null && $("ctHouseName")) $("ctHouseName").value = keep.n;
    if (keep.s != null && $("ctSpeech")) $("ctSpeech").value = keep.s;
    if (keep.q != null && $("ctQ")) $("ctQ").value = keep.q;
    if (keep.o != null && $("ctOpts")) $("ctOpts").value = keep.o;
  }
  $("court").addEventListener("input", (e) => { if (e.target.id === "ctHouseName") house.name = e.target.value; });
  $("court").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ct]"); if (!b) return;
    const a = b.dataset.ct;
    if (a === "close") { $("court").classList.add("hidden"); return; }
    if (a === "tab") { tab = b.dataset.t; D = D || {}; render(); return load(); }
    if (a === "emoji") { house.emoji = b.dataset.e; return render(); }
    if (a === "support") { $("court").classList.add("hidden"); const x = document.querySelector("[data-tab=vip]"); if (x) x.click(); setTimeout(() => { const s = document.querySelector("#clubNav [data-g=shop]"); if (s) s.click(); window.scrollTo(0, 0); }, 80); return; }
    try {
      busy = true;
      if (a === "claim") { const r = await Pi.courtClaim(); if (r.account) G.setAccount(r.account); if (r.state) G.S = r.state; G.toast(t("ct.got", { c: fmtN(r.coins) })); G.burst(); }
      else if (a === "join") { await Pi.houseJoin(Number(b.dataset.id)); G.toast(t("hs.joined")); }
      else if (a === "leave") { await Pi.houseLeave(); G.toast(t("hs.left")); }
      else if (a === "found") {
        const name = ($("ctHouseName").value || "").trim().replace(/\s+/g, " "), fee = D.houses.fee;
        if (!window.KombatLogic.tribeNameOk(name)) { G.toast(t("hs.nameBad")); busy = false; return render(); }
        if (!confirm(t("hs.confirm", { p: fee, n: name }))) { busy = false; return render(); }
        const r = await Pi.buyHouse(name, house.emoji, fee); if (r.account) G.setAccount(r.account); G.toast(t("hs.created")); house.name = "";
      }
      else if (a === "run") { await Pi.electionRun($("ctSpeech").value); G.toast(t("pa.ok")); }
      else if (a === "vote") { await Pi.electionVote(b.dataset.uid); G.toast(t("pa.voted")); }
      else if (a === "dvote") { await Pi.decreeVote(Number(b.dataset.id), Number(b.dataset.i)); G.toast(t("vt.voted")); }
      else if (a === "dcreate") { await Pi.decreeCreate({ kind: $("ctKind").value, question: $("ctQ").value, options: $("ctOpts").value.split("\n") }); G.toast(t("pa.ok")); }
    } catch (err) { G.toast(err.message); }
    busy = false; load();
  });
  $("courtOpen").addEventListener("click", () => { $("court").classList.remove("hidden"); render(); load(); });
  document.addEventListener("langchange", render);
})();
