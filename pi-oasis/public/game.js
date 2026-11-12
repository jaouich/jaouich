// Pi Oasis – game screen
// Guests (outside Pi Browser) play a local demo. Signed-in players play on the
// server: every action is checked there, so the score can't be faked.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic;
  const { SEEDS, STAKES, C, TIERS } = L;
  const SAVE_KEY = "oasis_guest_v1";
  const Pi = window.PiBridge;
  const TIER_ICON = ["🌱", "🥉", "🥈", "🥇", "💎"];
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let clockOffset = 0; // server time - phone time
  const now = () => Date.now() + clockOffset;

  let guest;
  try { guest = L.normalize(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"), now()); } catch { guest = L.fresh(now()); }
  let S = guest; // current state shown on screen
  let account = null; // from the server once signed in
  let publicUrl = ""; // official link for referrals (PiNet), sent by the server
  let busy = false;
  let selectedSeed = SEEDS[0].id;
  let oldApp = false; // opened through the old App Studio app (no purchases there)

  const saveGuest = () => { if (!account) try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch {} };
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) try { localStorage.setItem("oasis_ref", ref); } catch {}

  // Current membership (index in TIERS). Paid tiers end at vipUntil; partner doesn't.
  function myTier() {
    if (!account) return 0;
    if (account.tierId === "partner") return account.tier;
    return account.vipUntil > now() ? account.tier : 0;
  }
  const perks = () => TIERS[myTier()];
  const tierName = (i) => t("tier." + TIERS[i].id);
  const seedName = (s) => t("seed." + s.id);
  const stakeName = (o) => t("stake." + o.id);

  function toast(msg) {
    if (!msg) return;
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function fmt(secs) {
    secs = Math.max(0, Math.ceil(secs));
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const u = window.I18N.time;
    if (d) return `${d}${u.d} ${h}${u.h}`;
    if (h) return `${h}${u.h} ${m}${u.m}`;
    if (m) return `${m}${u.m} ${s}${u.s}`;
    return `${s}${u.s}`;
  }
  function msgText(m) {
    if (!m) return "";
    const vars = Object.assign({}, m.vars);
    if (m.key === "t.planted") { const s = L.seedById(vars.seed); vars.seed = seedName(s) + " " + s.e; }
    if (vars.r) vars.r = t("rarity." + vars.r);
    return t(m.key, vars);
  }
  const errText = (code, vars) => window.I18N.has("t." + code) ? t("t." + code, vars) : t("e." + code);

  // "+12 🪙" floating up from where the player tapped
  let lastTap = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener("pointerdown", (e) => { lastTap = { x: e.clientX, y: e.clientY }; }, true);
  function fly(n) {
    const el = document.createElement("div");
    el.className = "fly";
    el.textContent = `+${n} 🪙`;
    el.style.left = Math.max(8, Math.min(innerWidth - 110, lastTap.x - 30)) + "px";
    el.style.top = lastTap.y - 30 + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    $("coinPill").classList.remove("bump");
    void $("coinPill").offsetWidth;
    $("coinPill").classList.add("bump");
  }

  // Runs one action: on the server when signed in, locally for guests.
  async function act(action) {
    if (busy) return;
    const before = S.dates;
    const done = (state, msg) => {
      S = state; render(); toast(msgText(msg));
      if (S.dates > before) fly(S.dates - before);
    };
    if (!account) {
      try {
        const r = L.apply(S, action, { now: now(), tier: 0, adVerified: false });
        done(r.s, r.msg); saveGuest();
      } catch (e) {
        if (e instanceof L.GameError) toast(errText(e.code, e.vars)); else throw e;
      }
      return;
    }
    busy = true;
    try {
      const r = await Pi.action(action);
      clockOffset = r.now - Date.now();
      done(r.state, r.msg);
    } catch (e) {
      if (e.data && e.data.state) { S = e.data.state; render(); }
      toast(e.code ? errText(e.code, e.data && e.data.vars) : e.message);
    } finally { busy = false; }
  }

  // ---------- Farm ----------
  function renderSeeds() {
    $("seedPicker").innerHTML = SEEDS.map((s) => `
      <button class="seed ${s.id === selectedSeed ? "selected" : ""}" data-seed="${s.id}">
        <span class="e">${s.e}</span>${seedName(s)}
        <small>🪙${s.cost} → 🪙${s.yield}</small>
        <small>⏱ ${fmt(s.time)}</small>
      </button>`).join("");
  }
  $("seedPicker").addEventListener("click", (e) => {
    const b = e.target.closest(".seed");
    if (!b) return;
    selectedSeed = b.dataset.seed;
    renderSeeds();
  });

  // The grid is rebuilt only when a plot changes state, so animations keep running;
  // timers and progress bars are updated in place every second.
  let farmKey = "";
  function renderFarm() {
    const n = now();
    const info = S.plots.map((p) => {
      if (!p) return { k: "empty" };
      const seed = L.seedById(p.seed);
      const left = (L.readyAt(p) - n) / 1000;
      return left <= 0 ? { k: "ready:" + seed.id, seed } : { k: "grow:" + seed.id, seed, left, pct: 100 - (left / seed.time) * 100 };
    });
    const key = info.map((x) => x.k).join("|") + "|" + window.I18N.lang;
    if (key !== farmKey) {
      farmKey = key;
      $("farm").innerHTML = info.map((x, i) => {
        if (x.k === "empty") return `<button class="plot" data-i="${i}"><span class="plus">+</span><span class="t">${t("farm.plant")}</span></button>`;
        if (x.k.startsWith("ready")) return `<button class="plot ready" data-i="${i}"><span class="e">${x.seed.e}</span><span class="t">${t("farm.harvest")}</span></button>`;
        return `<button class="plot growing" data-i="${i}"><span class="e">🌱</span><span class="t"></span><span class="bar"><i></i></span></button>`;
      }).join("");
    }
    info.forEach((x, i) => {
      if (!x.left) return;
      const el = $("farm").children[i];
      el.querySelector(".t").textContent = fmt(x.left);
      el.querySelector(".bar i").style.width = x.pct + "%";
      el.querySelector(".e").style.setProperty("--g", (0.7 + x.pct / 180).toFixed(2));
    });
  }
  $("farm").addEventListener("click", async (e) => {
    const b = e.target.closest(".plot");
    if (!b) return;
    const i = +b.dataset.i, p = S.plots[i];
    if (!p) return act({ type: "plant", plot: i, seed: selectedSeed });
    const left = (L.readyAt(p) - now()) / 1000;
    if (left <= 0) return act({ type: "harvest", plot: i });
    // Rewarded ad to finish now (signed-in players without a membership)
    if (account && myTier() === 0 && Pi.piAvailable && left > C.AD_MIN_LEFT && confirm(t("t.adConfirm"))) {
      const adId = await Pi.showRewardedAd();
      if (!adId) return toast(t("t.adFail"));
      return act({ type: "speedup", plot: i, adId });
    }
    toast(t("t.left", { t: fmt(left) }));
  });

  // ---------- Granary (staking) ----------
  function renderStakeOptions() {
    const b = perks().boost;
    const boost = b ? ` <small>(+${Math.round(b * 100)}% ${esc(tierName(myTier()))})</small>` : "";
    $("stakeOptions").innerHTML = `
      <div class="card"><label for="stakeAmt">${t("stake.ask")}</label>
        <input id="stakeAmt" type="number" inputmode="numeric" min="${C.MIN_STAKE}" step="1" value="${Math.max(C.MIN_STAKE, Math.floor(S.dates / 2))}">
      </div>` +
      STAKES.map((o) => `
      <div class="card">
        <div><b>${stakeName(o)}: +${Math.round(o.rate * 100)}%${boost}</b><small>${o.bonus ? t("stake.rare") : "&nbsp;"}</small></div>
        <button class="btn small" data-stake="${o.id}">${t("stake.btn")}</button>
      </div>`).join("");
  }
  $("stakeOptions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-stake]");
    if (!b) return;
    act({ type: "stake", opt: b.dataset.stake, amount: Math.floor(+$("stakeAmt").value) });
  });

  function renderStakes() {
    const n = now();
    $("slotInfo").textContent = `(${S.stakes.length}/${perks().slots})`;
    if (!S.stakes.length) { $("stakes").innerHTML = `<div class="hint">${t("stake.none")}</div>`; return; }
    $("stakes").innerHTML = S.stakes.map((s, i) => {
      const left = (s.end - n) / 1000;
      const action = left <= 0
        ? `<button class="btn small gold" data-claim="${i}">${t("stake.claim", { n: s.amt + s.profit })}</button>`
        : `<span class="hint">⏳ ${fmt(left)}</span>`;
      return `<div><span>🏺 <b>${s.amt}</b> 🪙 · ${stakeName(L.stakeById(s.opt))}</span>${action}</div>`;
    }).join("");
  }
  $("stakes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-claim]");
    if (b) act({ type: "claim", index: +b.dataset.claim });
  });

  // ---------- Camels ----------
  let breedSel = [];
  function renderCamels() {
    const n = now();
    const ready = S.animals.reduce((sum, a) => sum + L.animalReady(a, n), 0);
    $("collectBtn").textContent = ready ? t("camels.collect", { n: ready }) : t("camels.collectNone");
    $("collectBtn").disabled = !ready;
    $("buyCamelBtn").textContent = t("camels.buy", { n: L.A.BUY_COST });
    $("herdInfo").textContent = `(${S.animals.length}/${L.maxAnimals(myTier())})`;
    breedSel = breedSel.filter((id) => S.animals.some((a) => a.id === id));
    $("herd").innerHTML = S.animals.length
      ? S.animals.map((a) => {
          const restLeft = a.lastBred ? (a.lastBred + L.A.BREED_COOLDOWN * 1000 - n) / 1000 : 0;
          const r = L.RARITY[a.rarity];
          return `<button class="camel r${a.rarity} ${breedSel.includes(a.id) ? "sel" : ""} ${restLeft > 0 ? "tired" : ""}" data-camel="${a.id}">
            <span class="e">${a.rarity === 3 ? "🐫" : "🐪"}</span><b>${t("rarity." + r.id)}</b>
            <small>${t("camels.perHour", { n: r.rate })}</small>
            <small>${restLeft > 0 ? t("camels.tired", { t: fmt(restLeft) }) : "🪙 " + L.animalReady(a, n)}</small>
          </button>`;
        }).join("")
      : `<p class="hint" style="grid-column:1/-1">${t("camels.empty")}</p>`;
    $("breedBtn").textContent = t("camels.breed", { n: L.A.BREED_COST });
    $("breedBtn").disabled = breedSel.length !== 2;
  }
  $("herd").addEventListener("click", (e) => {
    const b = e.target.closest("[data-camel]");
    if (!b) return;
    const id = +b.dataset.camel;
    breedSel = breedSel.includes(id) ? breedSel.filter((x) => x !== id) : [...breedSel, id].slice(-2);
    renderCamels();
  });
  $("collectBtn").addEventListener("click", () => act({ type: "collect" }));
  $("buyCamelBtn").addEventListener("click", () => act({ type: "buyCamel" }));
  $("breedBtn").addEventListener("click", async () => {
    if (breedSel.length !== 2) return;
    const [a, b] = breedSel;
    breedSel = [];
    await act({ type: "breed", a, b });
  });

  // ---------- Ranking ----------
  const chip = (tierId) => (tierId && tierId !== "free" ? `<span class="chip ${tierId}">${esc(t("tier." + tierId))}</span>` : "");
  async function renderRank() {
    $("weekLeft").textContent = fmt((L.weekId(now()) + 7 * 86400000 - now()) / 1000);
    if (!account) {
      $("prizePool").textContent = "—";
      $("podium").innerHTML = "";
      $("leaderboard").innerHTML = `<li class="me"><span>${t("rank.you")}</span><b>${S.week.score} 🪙</b></li>
        <li class="hint">${t("rank.login")}</li>`;
      return;
    }
    try {
      const lb = await Pi.leaderboard();
      $("prizePool").textContent = (+lb.prizePool).toFixed(3);
      const me = account.username;
      const pod = (r, place) => r ? `<div class="pod p${place} ${r.username === me ? "me" : ""}">
          <div class="av">${esc(r.username.slice(0, 1).toUpperCase())}</div>
          <div class="nm">${esc(r.username)}</div>${chip(r.tier)}
          <div class="sc">${r.score} 🪙</div><div class="step">${place}</div></div>` : `<div></div>`;
      $("podium").innerHTML = lb.top.length ? pod(lb.top[1], 2) + pod(lb.top[0], 1) + pod(lb.top[2], 3) : "";
      $("leaderboard").innerHTML = lb.top.length
        ? lb.top.slice(3).map((r, i) => `<li class="${r.username === me ? "me" : ""}"><span><span class="pos">${i + 4}</span>${esc(r.username)}${chip(r.tier)}</span><b>${r.score} 🪙</b></li>`).join("")
        : `<li class="hint">${t("rank.empty")}</li>`;
    } catch (e) { toast(e.message); }
  }

  // ---------- Club: memberships, daily reward, referrals ----------
  function perkList(i) {
    const p = TIERS[i];
    const items = [
      t("perk.slots", { n: p.slots }),
      t("perk.boost", { n: Math.round(p.boost * 100) }),
      t("perk.camels", { n: p.camels }),
      t("perk.daily", { n: p.daily }),
      t("perk.noads"),
      t("perk.badge"),
    ];
    if (p.id === "partner") items.push(t("perk.gift"));
    return `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  }
  function renderClub() {
    const tier = myTier();
    const badge = $("tierBadge");
    badge.className = "tier-pill tp" + tier;
    badge.textContent = `${TIER_ICON[tier]} ${tierName(tier)}`;

    const date = account && account.vipUntil > now() ? new Date(account.vipUntil).toLocaleDateString(window.I18N.locale) : "";
    $("clubStatus").innerHTML = `<span class="ic">${TIER_ICON[tier]}</span><div><small>${t("club.current")}</small><b>${esc(tierName(tier))}</b>
      <small>${tier === 4 ? t("partner.active") : tier > 0 ? t("club.until", { date }) : t("club.freeHint")}</small></div>`;

    $("tiers").innerHTML = [1, 2, 3, 4].map((i) => {
      const p = TIERS[i];
      if (p.id === "partner") {
        return `<div class="tier t4 ${tier === 4 ? "current" : ""}">
          <div class="head"><span class="ic">💎</span><div><span class="sub">Jerry Development</span><h3>${esc(tierName(4))}</h3></div>
            <div class="price">★<small>${t("partner.tag")}</small></div></div>
          <p class="hint" style="padding-top:10px">${t("partner.desc")}</p>
          ${perkList(4)}
          <div class="foot"><div class="lock">${tier === 4 ? t("partner.active") : "🔒 " + t("partner.locked")}</div></div>
        </div>`;
      }
      let foot;
      if (oldApp) foot = "";
      else if (tier === 4 || tier > i) foot = `<button class="btn secondary" disabled>${t("club.included")}</button>`;
      else if (tier === i) foot = `<button class="btn gold" data-buy="${p.id}">${t("club.extend", { p: p.price })}</button>`;
      else foot = `<button class="btn ${i === 3 ? "gold" : ""}" data-buy="${p.id}">${t(tier ? "club.upgrade" : "club.buy", { p: p.price })}</button>`;
      return `<div class="tier t${i} ${tier === i ? "current" : ""}">
        <div class="head"><span class="ic">${TIER_ICON[i]}</span><h3>${esc(tierName(i))}${i === 3 ? `<span class="tag">${t("club.best")}</span>` : ""}</h3>
          <div class="price">${p.price} Pi<small>${t("vip.month")}</small></div></div>
        ${perkList(i)}
        <div class="foot">${foot}</div>
      </div>`;
    }).join("");

    const done = S.lastDaily === L.dayId(now());
    $("dailyBtn").disabled = done;
    $("dailyBtn").textContent = done ? t("daily.done") : t("daily.claim", { n: C.DAILY * perks().daily });
    if (account) {
      const base = publicUrl || location.origin + location.pathname;
      $("refLink").value = `${base}?ref=${encodeURIComponent(account.username)}`;
      $("refCode").textContent = account.username;
      $("inviterBox").classList.toggle("hidden", !account.canSetInviter);
      $("invitedBy").classList.toggle("hidden", !account.invitedBy);
      if (account.invitedBy) $("invitedBy").textContent = t("ref.invitedBy", { name: account.invitedBy });
      $("refBalance").textContent = (+account.referralBalance).toFixed(3);
      $("refCount").textContent = account.referralCount;
      $("adminBox").classList.toggle("hidden", !account.isAdmin);
    }
  }
  $("tierBadge").addEventListener("click", () => document.querySelector('.tabs [data-tab="vip"]').click());
  $("tiers").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-buy]");
    if (!b) return;
    b.disabled = true;
    try {
      const res = await Pi.buyVip(b.dataset.buy);
      account = res.account;
      toast(t("t.memberOk", { tier: tierName(myTier()) }));
    } catch (err) { toast(err.message); }
    render();
  });
  $("dailyBtn").addEventListener("click", () => act({ type: "daily" }));
  $("copyRef").addEventListener("click", () => {
    if (!account) return toast(t("t.loginFirst"));
    navigator.clipboard?.writeText($("refLink").value).then(() => toast(t("t.copied")), () => $("refLink").select());
  });
  $("saveInviter").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    const name = $("inviterInput").value.trim().replace(/^@/, "");
    if (!name) return;
    try { account = (await Pi.setInviter(name)).account; toast(t("t.inviterSaved", { name })); render(); }
    catch (e) { toast(e.message); }
  });
  $("redeemVip").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    try { account = (await Pi.redeemVip()).account; toast(t("t.vipAdded")); render(); }
    catch (e) { toast(e.message); }
  });
  $("withdraw").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    try { const r = await Pi.withdraw(); account = r.account; toast(t("t.withdrawOk", { n: r.amount })); render(); }
    catch (e) { toast(e.message); }
  });

  // ---------- Owner: grant / remove the Partner membership ----------
  function showPartners(list) {
    $("partnerList").innerHTML = list.length
      ? list.map((p) => `<div><span>💎 <b>${esc(p.username)}</b> <small class="hint">${t(p.joined ? "admin.joined" : "admin.pending")}</small></span>
          <button class="btn small secondary" data-revoke="${esc(p.username)}">${t("admin.revoke")}</button></div>`).join("")
      : `<div class="hint">${t("admin.none")}</div>`;
  }
  async function partners(action, username) {
    try {
      const r = await Pi.partners(action, username);
      showPartners(r.partners);
      if (action === "grant") { toast(t("t.partnerGranted", { name: username })); $("partnerInput").value = ""; }
      if (action === "revoke") toast(t("t.partnerRevoked", { name: username }));
      if (action !== "list" && username.toLowerCase() === account.username.toLowerCase()) {
        const me = await Pi.me(); account = me.account; S = me.state; render();
      }
    } catch (e) { toast(e.message); }
  }
  $("grantPartner").addEventListener("click", () => {
    const name = $("partnerInput").value.trim().replace(/^@/, "");
    if (name) partners("grant", name);
  });
  $("partnerList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-revoke]");
    if (b && confirm(t("admin.confirm", { name: b.dataset.revoke }))) partners("revoke", b.dataset.revoke);
  });

  // ---------- Sign in ----------
  async function signIn(silent) {
    if (!silent) $("loginBtn").disabled = true;
    try {
      const res = await Pi.login();
      clockOffset = res.now - Date.now();
      account = res.account;
      publicUrl = res.publicUrl || "";
      S = res.state; // the server's game replaces the guest demo
      $("userLabel").removeAttribute("data-i18n");
      $("userLabel").textContent = t("welcome", { name: account.username });
      $("loginBtn").classList.add("hidden");
      render();
      if (account.isAdmin) partners("list");
    } catch (e) {
      if (!silent) toast(e.message === "timeout" ? t("t.openInPi") : e.message);
    } finally { $("loginBtn").disabled = false; }
  }
  $("loginBtn").addEventListener("click", () => signIn(false));
  // Inside Pi Browser, sign in automatically on load
  if (window.Pi) signIn(true);

  // ---------- Tabs & language ----------
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
    scrollTo({ top: 0 });
    if (b.dataset.tab === "rank") renderRank();
  });
  const langSel = $("langSelect");
  langSel.value = window.I18N.lang;
  langSel.addEventListener("change", () => window.I18N.set(langSel.value));
  document.addEventListener("langchange", () => {
    if (account) $("userLabel").textContent = t("welcome", { name: account.username });
    renderSeeds(); renderStakeOptions(); render();
    if (document.querySelector("#tab-rank.active")) renderRank();
    if (account && account.isAdmin) partners("list");
  });

  function render() {
    S = L.normalize(S, now());
    $("dates").textContent = S.dates.toLocaleString("en-US");
    renderFarm(); renderStakes(); renderClub(); renderCamels();
    if (!document.activeElement || document.activeElement.id !== "stakeAmt") renderStakeOptions();
  }

  // The sky follows the player's clock: day, sunset, night
  function setSky() {
    const h = new Date().getHours();
    $("hero").className = "hero " + (h >= 6 && h < 17 ? "day" : h >= 17 && h < 20 ? "dusk" : "night");
  }

  // Opened through the old App Studio app? Its payments can't be approved, so point
  // players to the official app and hide the purchase buttons there.
  const OLD_APPS = ["apppioasisaf7788"];
  const parents = [document.referrer, ...(location.ancestorOrigins ? [...location.ancestorOrigins] : [])].join(" ");
  if (OLD_APPS.some((h) => parents.includes(h))) {
    oldApp = true;
    $("movedBar").classList.remove("hidden");
  }

  window.I18N.apply();
  setSky();
  setInterval(setSky, 60000);
  renderSeeds();
  render();
  setInterval(() => { renderFarm(); renderStakes(); if (document.querySelector("#tab-camels.active")) renderCamels(); }, 1000);
})();
