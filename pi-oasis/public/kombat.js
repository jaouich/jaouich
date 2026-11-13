// Jerry Kombat – the tap page. Taps are counted on the phone and sent in small
// batches; the server checks speed and energy and keeps the real score.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const KL = window.KombatLogic;
  const L = window.OasisLogic;
  const G = window.OasisGame;
  const Pi = window.PiBridge;
  if (!KL || !G) return;

  let open = false, page = "arena", cat = KL.CATS[0];
  let pending = 0, inflight = 0, sending = false, busy = false;

  // 1234 -> "1,234", 1.2e6 -> "1.2M"
  const big = (n) => {
    n = Math.floor(n || 0);
    if (n < 1e5) return n.toLocaleString("en-US");
    const u = [[1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([v]) => n >= v);
    return (n / u[0]).toFixed(n >= u[0] * 100 ? 0 : 1).replace(/\.0$/, "") + u[1];
  };
  const errMsg = (e) => (e && e.code ? t("e." + e.code, e.vars || (e.data && e.data.vars)) : (e && e.message) || "");
  const lgName = (i) => `${KL.LEAGUE_ICON[i]} ${t("k.lg." + i)}`;
  const k = () => KL.norm(G.S.kombat, G.now());

  // Runs an action on the server (signed in) or on the phone (guest)
  async function run(action) {
    if (!G.account) {
      const r = L.apply(G.S, action, { now: G.now(), tier: 0 });
      G.S = r.s; G.saveGuest();
      return r;
    }
    const r = await Pi.action(action);
    G.setClock(r.now);
    G.S = r.state;
    return r;
  }
  async function flush() {
    if (sending || !pending) return;
    sending = true;
    inflight = pending; pending = 0;
    try { await run({ type: "kTap", n: inflight }); }
    catch (e) { if (e.data && e.data.state) G.S = e.data.state; }
    finally { inflight = 0; sending = false; paint(); }
  }
  async function act(action) {
    if (busy) return;
    busy = true;
    try {
      await flush();
      const r = await run(action);
      G.toast(r.msg ? G.msgText(r.msg) : "");
      if (action.type !== "kSync") pop();
    } catch (e) {
      if (e.data && e.data.state) G.S = e.data.state;
      G.toast(errMsg(e.code ? e : { code: e.code, message: e.message }));
    } finally { busy = false; renderAll(); }
  }

  // ---------- Live numbers ----------
  function v() {
    const x = KL.view(G.S.kombat, G.now(), G.boost());
    const used = (pending + inflight) * x.tap;
    x.coins += used; x.total += used; x.energy = Math.max(0, x.energy - used);
    return x;
  }
  function paint() {
    if (!open) return;
    const x = v();
    $("kCoins").textContent = Math.floor(x.coins).toLocaleString("en-US");
    $("kTapV").textContent = "+" + x.tap;
    $("kPph").textContent = "+" + big(x.pph);
    $("kEnergyTxt").textContent = big(x.energy);
    $("kEnergy").textContent = x.energy;
    $("kEnergyMax").textContent = x.max;
    $("kEBar").style.width = (100 * x.energy) / x.max + "%";
    const lg = x.league, next = KL.LEAGUES[lg + 1];
    $("kLeagueBtn").textContent = lgName(lg);
    $("kLgName").textContent = next ? `${lgName(lg)} → ${KL.LEAGUE_ICON[lg + 1]} ${big(next)}` : lgName(lg);
    $("kLgBar").style.width = next ? Math.min(100, (100 * (x.total - KL.LEAGUES[lg])) / (next - KL.LEAGUES[lg])) + "%" : "100%";
    $("kDailyDot").classList.toggle("hidden", k().daily.day === KL.day(G.now()));
  }

  // ---------- Tapping ----------
  const medal = $("kMedal");
  medal.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const x = v();
    if (x.energy < x.tap) { medal.classList.remove("shake"); void medal.offsetWidth; medal.classList.add("shake"); return; }
    pending++;
    // tilt toward the finger
    const r = medal.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    medal.style.transform = `perspective(600px) rotateX(${-dy * 14}deg) rotateY(${dx * 14}deg) scale(.96)`;
    clearTimeout(medal._t);
    medal._t = setTimeout(() => (medal.style.transform = ""), 120);
    const f = document.createElement("div");
    f.className = "k-float";
    f.textContent = "+" + x.tap;
    f.style.left = e.clientX + "px"; f.style.top = e.clientY + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
    if (navigator.vibrate) try { navigator.vibrate(6); } catch {}
    paint();
    if (pending >= 60) flush();
  });
  medal.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------- Cards ----------
  function renderCards() {
    const kk = k(), boost = G.boost();
    $("kCats").innerHTML = KL.CATS.map((c) => `<button class="${c === cat ? "on" : ""}" data-cat="${c}">${t("k.cat." + c)}</button>`).join("");
    const coins = v().coins;
    $("kCards").innerHTML = KL.CARDS.filter((c) => c.cat === cat).map((c) => {
      const lvl = kk.cards[c.id] || 0, max = lvl >= KL.K.MAX_CARD;
      const open = KL.unlocked(kk, c);
      const cost = KL.cardCost(c, lvl), gain = KL.cardProfit(c, lvl + 1) - KL.cardProfit(c, lvl);
      const req = c.req ? (c.req.league != null ? t("k.req.league", { lg: lgName(c.req.league) }) : t("k.req.card", { card: t("k.card." + c.req.card), n: c.req.lvl })) : "";
      return `<button class="k-card ${open ? "" : "locked"} ${!max && open && coins >= cost ? "can" : ""}" data-card="${c.id}" ${open && !max ? "" : "disabled"}>
        <span class="k-ce">${c.e}</span>
        <b>${t("k.card." + c.id)}</b>
        <small>${t("k.pphShort")} <b>+${big(KL.cardProfit(c, lvl) * (1 + boost))}</b></small>
        <span class="k-cl">${t("k.lvl", { n: lvl })}</span>
        ${max ? `<span class="k-cost">${t("k.max")}</span>`
          : open ? `<span class="k-gain">+${big(gain)}/h</span><span class="k-cost"><i class="kcoin s"></i>${big(cost)}</span>`
          : `<span class="k-cost lock">🔒 ${req}</span>`}
      </button>`;
    }).join("");
    $("kMemberNote").textContent = boost ? t("k.member", { n: Math.round(boost * 100) }) : t("k.memberAd");
  }
  $("kCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; renderCards(); } });
  $("kCards").addEventListener("click", (e) => { const b = e.target.closest("[data-card]"); if (b) act({ type: "kCard", id: b.dataset.card }); });

  // ---------- Boosts ----------
  function renderBoosts() {
    const kk = k(), nowT = G.now();
    const left = KL.K.REFILLS - kk.refill.used, wait = KL.K.REFILL_GAP - (nowT - kk.refill.at);
    $("kRefill").innerHTML = `<span class="k-be">⚡</span><span><b>${t("k.refill.t")}</b><small>${t("k.refill.d", { n: left, max: KL.K.REFILLS })}</small></span>
      <button class="btn small gold" data-kact="refill" ${left > 0 && wait <= 0 ? "" : "disabled"}>${left <= 0 ? "—" : wait > 0 ? t("k.refill.in", { m: Math.ceil(wait / 60000) }) : t("k.go")}</button>`;
    const coins = v().coins;
    $("kBoosts").innerHTML = KL.BOOSTS.map((b) => {
      const lvl = kk[b.id] || 0, max = lvl >= KL.K.MAX_BOOST, cost = KL.boostCost(b, lvl);
      return `<div class="k-boost"><span class="k-be">${b.e}</span><span><b>${t("k.boost." + b.id + ".t")}</b><small>${t("k.boost." + b.id + ".d")} · ${t("k.lvl", { n: lvl })}</small></span>
        <button class="btn small ${coins >= cost ? "" : "secondary"}" data-kboost="${b.id}" ${max ? "disabled" : ""}>${max ? t("k.max") : `<i class="kcoin s"></i>${big(cost)}`}</button></div>`;
    }).join("");
  }
  $("kRefill").addEventListener("click", (e) => { if (e.target.closest("[data-kact=refill]")) act({ type: "kRefill" }); });
  $("kBoosts").addEventListener("click", (e) => { const b = e.target.closest("[data-kboost]"); if (b) act({ type: "kBoost", id: b.dataset.kboost }); });

  // ---------- Daily reward ----------
  function renderDaily() {
    const kk = k(), d = KL.day(G.now());
    const doneToday = kk.daily.day === d;
    const streak = doneToday ? kk.daily.streak : kk.daily.day === d - 1 ? kk.daily.streak : 0; // days already in a row
    const pos = streak % KL.DAILY.length; // next day to claim (0-based) in the current 10-day round
    const shownDone = doneToday ? (pos === 0 ? KL.DAILY.length : pos) : pos;
    $("kDaily").innerHTML = KL.DAILY.map((n, i) => `<div class="${i < shownDone ? "done" : !doneToday && i === pos ? "today" : ""}">
      <small>${t("k.daily.day", { n: i + 1 })}</small><i class="kcoin s"></i><b>${big(n)}</b></div>`).join("");
    $("kDailyBtn").textContent = doneToday ? t("k.daily.done") : t("k.daily.claim");
    $("kDailyBtn").disabled = doneToday;
  }
  $("kDailyBtn").addEventListener("click", () => act({ type: "kDaily" }));

  // ---------- League ----------
  async function renderLeague() {
    const x = v(), next = KL.LEAGUES[x.league + 1];
    $("kLeague").innerHTML = `<div class="k-lg-icon">${KL.LEAGUE_ICON[x.league]}</div><h2>${t("k.lg." + x.league)}</h2>
      <p>${next ? t("k.league.next", { n: big(next - x.total), lg: lgName(x.league + 1) }) : t("k.league.max")}</p>
      <div class="k-lg-row">${KL.LEAGUE_ICON.map((ic, i) => `<span class="${i <= x.league ? "on" : ""}" title="${t("k.lg." + i)}">${ic}</span>`).join("")}</div>`;
    $("kTop").innerHTML = `<div class="k-note">…</div>`;
    try {
      const r = await Pi.kombatTop();
      const me = G.account && G.account.username;
      $("kTop").innerHTML = r.top.length ? r.top.map((p, i) => `<div class="${p.username === me ? "me" : ""}"><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
        <b>${String(p.username).replace(/[<>&"]/g, "")}</b><small>${KL.LEAGUE_ICON[KL.league(p.total)]}</small><span><i class="kcoin s"></i>${big(p.total)}</span></div>`).join("")
        : `<div class="k-note">${t("k.league.empty")}</div>`;
    } catch { $("kTop").innerHTML = `<div class="k-note">${t("k.league.offline")}</div>`; }
  }

  // ---------- Pages ----------
  function renderAll() {
    if (!open) return;
    paint();
    if (page === "cards") renderCards();
    if (page === "boost") renderBoosts();
    if (page === "daily") renderDaily();
  }
  function go(p) {
    page = p;
    document.querySelectorAll(".k-page").forEach((x) => x.classList.toggle("active", x.dataset.kp === p));
    document.querySelectorAll(".k-nav button").forEach((x) => x.classList.toggle("active", x.dataset.kgo === p));
    $("kombat").querySelector(".k-pages").scrollTop = 0;
    if (p === "league") renderLeague();
    renderAll();
  }
  $("kombat").addEventListener("click", (e) => { const b = e.target.closest("[data-kgo]"); if (b) go(b.dataset.kgo); });
  $("kLeagueBtn").addEventListener("click", () => go("league"));
  function pop() { $("kCoins").classList.remove("pop"); void $("kCoins").offsetWidth; $("kCoins").classList.add("pop"); }

  let timer = 0;
  function show() {
    if (open) return;
    open = true;
    $("kombat").classList.remove("hidden");
    $("kombat").setAttribute("aria-hidden", "false");
    document.body.classList.add("k-open");
    if (location.hash !== "#kombat") history.replaceState(null, "", "#kombat");
    go("arena");
    act({ type: "kSync" }); // collects passive income and says how much came in
    timer = setInterval(() => { paint(); if (page === "boost") renderBoosts(); }, 250);
  }
  async function hide() {
    if (!open) return;
    await flush();
    open = false;
    clearInterval(timer);
    $("kombat").classList.add("hidden");
    $("kombat").setAttribute("aria-hidden", "true");
    document.body.classList.remove("k-open");
    if (location.hash === "#kombat") history.replaceState(null, "", location.pathname + location.search);
  }
  $("kombatOpen").addEventListener("click", show);
  $("kBack").addEventListener("click", hide);
  setInterval(flush, 1000);
  addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  if (location.hash === "#kombat") setTimeout(show, 300);
  document.addEventListener("langchange", () => { renderAll(); if (open && page === "league") renderLeague(); });
})();
