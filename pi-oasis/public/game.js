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
    if (vars.bld) vars.bld = t("b." + vars.bld);
    if (vars.good) vars.good = t("good." + vars.good);
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
      t("perk.city", { n: Math.round(p.boost * 100) }),
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
      if (res.via === "appstudio") enterOldApp();
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
    if (b.dataset.tab === "city") { renderCity(); maybeCityTick(); }
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

  // ---------- Oasis City ----------
  const CITYC = L.CITY;
  const B_ICON = { house: ["🏠", "🏡", "🏘️"], bakery: ["🥖"], teahouse: ["🍵"], spice: ["🌶️"], weaver: ["🧶"], potter: ["🏺"], palm: ["🌴"], garden: ["🌺"], fountain: ["⛲"] };
  const bIcon = (id, lvl) => { const a = B_ICON[id]; return a[Math.min(lvl, a.length) - 1]; };
  let selTile = -1, isoKey = "", ordersKey = "", lastCityTick = 0;

  function bDesc(d, lvl) {
    lvl = lvl || 1;
    if (d.kind === "home") return t("cdesc.home", { n: d.pop[lvl - 1], r: d.pop[lvl - 1] * CITYC.TAX_PER_POP });
    if (d.kind === "work") return t("cdesc.work", { g: t("good." + d.good), c: d.craftCost, t: fmt(Math.round(L.jobMs(d, lvl, 1) / 1000)) });
    return t("cdesc.deco", { n: d.happy[lvl - 1] });
  }

  function isoHTML(c, n) {
    let h = '<i class="slab base"></i><i class="slab s"></i><i class="slab w"></i>';
    c.tiles.forEach((tile, i) => {
      const x = i % CITYC.SIZE, y = Math.floor(i / CITYC.SIZE);
      h += `<div class="tile ${(x + y) % 2 ? "alt" : ""} ${i === selTile ? "sel" : ""}" data-i="${i}">`;
      if (!tile) {
        h += `<div class="icon plus"><div class="ib"><span class="em">+</span></div></div>`;
      } else {
        const d = L.buildingById(tile.b);
        let st = "";
        if (tile.job) st = tile.job.end <= n ? `<em class="st rdy">${L.goodById(tile.job.g).e}✓</em>` : `<em class="st"><span class="tm" data-end="${tile.job.end}"></span></em>`;
        h += `<div class="bld b-${d.id} l${tile.lvl}"><i class="ft"></i><i class="fs"></i><i class="fw"></i>
          <div class="icon"><div class="ib"><span class="em">${bIcon(d.id, tile.lvl)}</span>${d.cost.length > 1 ? `<b class="lv">${tile.lvl}</b>` : ""}${st}</div></div></div>`;
      }
      h += "</div>";
    });
    return h;
  }

  function renderCity() {
    const c = S.city, n = now(), lvl = L.cityLevel(c.xp), st = L.cityStats(c);
    $("cityLevel").textContent = lvl;
    const lo = L.xpFor(lvl), hi = lvl >= CITYC.MAX_LEVEL ? lo : L.xpFor(lvl + 1);
    $("cityXpFill").style.width = (lvl >= CITYC.MAX_LEVEL ? 100 : ((c.xp - lo) / (hi - lo)) * 100) + "%";
    $("cityXpText").textContent = lvl >= CITYC.MAX_LEVEL ? "MAX" : `${c.xp - lo} / ${hi - lo} XP`;
    $("cityPop").textContent = st.pop;
    $("cityHappy").textContent = "+" + Math.round(st.happyBonus * 100) + "%";
    $("cityTaxRate").textContent = (Math.round(st.taxPerHour * 10) / 10).toString();

    const key = c.tiles.map((x) => (x ? `${x.b}${x.lvl}${x.job ? (x.job.end <= n ? "R" : "W") : ""}` : "-")).join("|") + "|" + selTile + "|" + window.I18N.lang;
    if (key !== isoKey) { isoKey = key; $("iso").innerHTML = isoHTML(c, n); }

    const tax = Math.floor(L.taxPending(c, n));
    $("cityTaxBtn").textContent = tax >= 1 ? t("city.taxBtn", { n: tax }) : t("city.taxNone");
    $("cityTaxBtn").disabled = tax < 1;
    const ready = c.tiles.reduce((k, x) => k + (x && x.job && x.job.end <= n ? x.job.qty : 0), 0);
    $("cityCollectBtn").textContent = ready ? t("city.collectAll", { n: ready }) : t("city.collectNone");
    $("cityCollectBtn").disabled = !ready;

    renderOrders(c);
    $("goods").innerHTML = L.GOODS.map((g) => `<div class="good"><span>${g.e}</span><b>${c.goods[g.id] || 0}</b><small>${esc(t("good." + g.id))}</small></div>`).join("");
    updateTimers();
  }

  const hasWorkshop = (c) => c.tiles.some((x) => x && L.buildingById(x.b).kind === "work");
  function renderOrders(c) {
    const key = JSON.stringify([c.orders, c.goods, myTier(), window.I18N.lang, hasWorkshop(c)]);
    if (key === ordersKey) return;
    ordersKey = key;
    const work = hasWorkshop(c);
    $("orders").innerHTML = c.orders.map((o, i) => {
      if (o.need) {
        const gs = Object.keys(o.need);
        const ok = gs.every((g) => (c.goods[g] || 0) >= o.need[g]);
        const chips = gs.map((g) => { const have = c.goods[g] || 0; return `<span class="chip-g ${have >= o.need[g] ? "ok" : "no"}">${L.goodById(g).e}<b>${have}/${o.need[g]}</b></span>`; }).join("");
        const bonus = Math.floor(o.reward * perks().boost);
        return `<div class="order"><div class="need">${chips}</div><div class="rw">🪙 ${o.reward}${bonus ? ` <small>+${bonus}</small>` : ""}<br><small>⭐ ${o.xp}</small></div>
          <button class="btn small ${ok ? "gold" : ""}" data-deliver="${i}" ${ok ? "" : "disabled"}>${t("city.deliver")}</button></div>`;
      }
      return `<div class="order wait">${work ? `<span data-wait="${o.wait || 0}"></span>` : t("city.noWorkshop")}</div>`;
    }).join("");
  }

  // Countdowns that run every second without rebuilding the page
  function updateTimers() {
    const n = now();
    document.querySelectorAll("#iso .tm").forEach((el) => { el.textContent = fmt((+el.dataset.end - n) / 1000); });
    document.querySelectorAll("#sheetCard .tm").forEach((el) => {
      el.textContent = fmt((+el.dataset.end - n) / 1000);
      const bar = el.closest(".job") && el.closest(".job").querySelector(".bar i");
      if (bar) bar.style.width = Math.min(100, Math.max(0, 100 - ((+el.dataset.end - n) / (+el.dataset.total)) * 100)) + "%";
    });
    document.querySelectorAll("#orders [data-wait]").forEach((el) => { el.textContent = t("city.nextOrder", { t: fmt((+el.dataset.wait - n) / 1000) }); });
  }
  // New citizens' orders appear on the server; ask for them once their waiting time is over
  function maybeCityTick() {
    if (!document.querySelector("#tab-city.active")) return;
    const c = S.city, n = now();
    if (hasWorkshop(c) && c.orders.some((o) => !o.need && (o.wait || 0) <= n) && Date.now() - lastCityTick > 4000) {
      lastCityTick = Date.now();
      act({ type: "cityTick" });
    }
  }

  $("iso").addEventListener("click", (e) => {
    const el = e.target.closest(".tile");
    if (!el) return;
    const i = +el.dataset.i, tile = S.city.tiles[i];
    if (tile && tile.job && tile.job.end <= now()) return act({ type: "cityCollect", tile: i }); // one tap collects finished goods
    openSheet(i);
  });
  $("cityTaxBtn").addEventListener("click", () => act({ type: "cityTax" }));
  $("cityCollectBtn").addEventListener("click", () => act({ type: "cityCollectAll" }));
  $("orders").addEventListener("click", (e) => {
    const b = e.target.closest("[data-deliver]");
    if (b) act({ type: "cityDeliver", slot: +b.dataset.deliver });
  });

  // ----- bottom sheet: build menu / building details -----
  function openSheet(i) { selTile = i; renderSheet(); $("sheet").classList.remove("hidden"); isoKey = ""; renderCity(); }
  function closeSheet() { selTile = -1; $("sheet").classList.add("hidden"); isoKey = ""; renderCity(); }
  function renderSheet() {
    const c = S.city, tile = c.tiles[selTile], lvl = L.cityLevel(c.xp), n = now();
    let h = '<div class="grab"></div>';
    if (!tile) {
      h += `<h3>${t("sheet.buildTitle")}</h3>` + L.BUILDINGS.map((d) => {
        const locked = d.unlock > lvl;
        return `<div class="brow ${locked ? "lock" : ""}"><span class="bi">${bIcon(d.id, 1)}</span>
          <div><b>${esc(t("b." + d.id))}</b><small>${bDesc(d, 1)}</small></div>
          ${locked ? `<span class="lk">🔒 ${t("sheet.locked", { n: d.unlock })}</span>`
            : `<button class="btn small" data-build="${d.id}" ${S.dates < d.cost[0] ? "disabled" : ""}>${t("sheet.buildFor", { p: d.cost[0] })}</button>`}</div>`;
      }).join("");
    } else {
      const d = L.buildingById(tile.b);
      h += `<div class="shead"><span class="bi">${bIcon(d.id, tile.lvl)}</span><div><b>${esc(t("b." + d.id))}</b><small>${t("sheet.level", { n: tile.lvl })} · ${bDesc(d, tile.lvl)}</small></div></div>`;
      if (d.kind === "work") {
        const have = c.goods[d.good] || 0, cap = L.goodCap(lvl);
        h += `<p class="hint">${L.goodById(d.good).e} ${esc(t("good." + d.good))}: <b>${have}/${cap}</b></p>`;
        if (tile.job && tile.job.end > n) {
          const total = L.jobMs(d, tile.lvl, tile.job.qty);
          h += `<div class="job"><span>${L.goodById(tile.job.g).e}×${tile.job.qty}</span><div class="bar"><i></i></div><b class="tm" data-end="${tile.job.end}" data-total="${total}"></b></div>`;
        } else if (tile.job) {
          h += `<button class="btn gold" data-collect>${t("sheet.collect")} ${L.goodById(tile.job.g).e}×${tile.job.qty}</button>`;
        } else {
          h += `<div class="craft">` + [1, 2, 3].map((q) => `<button class="btn" data-craft="${q}" ${S.dates < d.craftCost * q ? "disabled" : ""}>${t("sheet.make", { n: q })}<small>${t("sheet.makeCost", { c: d.craftCost * q, t: fmt(Math.round(L.jobMs(d, tile.lvl, q) / 1000)) })}</small></button>`).join("") + `</div>`;
        }
      }
      if (tile.lvl < d.cost.length) {
        const nx = d.cost[tile.lvl];
        const locked = d.unlock > lvl;
        h += `<button class="btn secondary" data-upgrade ${S.dates < nx || locked ? "disabled" : ""}>${t("sheet.upgrade", { n: tile.lvl + 1, p: nx })}</button>
          <p class="hint" style="margin:4px 0 0">${bDesc(d, tile.lvl + 1)}</p>`;
      } else if (d.cost.length > 1) {
        h += `<p class="hint">${t("sheet.maxLevel")}</p>`;
      }
      const refund = Math.floor(d.cost.slice(0, tile.lvl).reduce((a, b) => a + b, 0) * CITYC.SELL_REFUND);
      h += `<button class="btn danger" data-demolish ${tile.job ? "disabled" : ""}>${t("sheet.demolish", { n: refund })}</button>`;
    }
    h += `<button class="btn secondary" data-close style="margin-top:12px">${t("sheet.close")}</button>`;
    $("sheetCard").innerHTML = h;
    updateTimers();
  }
  $("sheetBg").addEventListener("click", closeSheet);
  $("sheetCard").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const i = selTile, d = b.dataset;
    if (d.close !== undefined) return closeSheet();
    if (d.build) await act({ type: "cityBuild", tile: i, b: d.build });
    else if (d.craft) await act({ type: "cityCraft", tile: i, qty: +d.craft });
    else if (d.collect !== undefined) await act({ type: "cityCollect", tile: i });
    else if (d.upgrade !== undefined) await act({ type: "cityUpgrade", tile: i });
    else if (d.demolish !== undefined) { if (!confirm(t("sheet.confirmDemolish"))) return; await act({ type: "cityDemolish", tile: i }); }
    if (selTile >= 0) renderSheet();
  });

  function render() {
    S = L.normalize(S, now());
    $("dates").textContent = S.dates.toLocaleString("en-US");
    renderFarm(); renderStakes(); renderClub(); renderCamels(); renderCity();
    if (selTile >= 0 && !$("sheet").classList.contains("hidden")) renderSheet();
    if (!document.activeElement || document.activeElement.id !== "stakeAmt") renderStakeOptions();
  }

  // The sky follows the player's clock: day, sunset, night
  function setSky() {
    const h = new Date().getHours();
    $("hero").className = "hero " + (h >= 6 && h < 17 ? "day" : h >= 17 && h < 20 ? "dusk" : "night");
  }

  // Opened through the old App Studio app? Its payments can't be approved, so point
  // players to the official app and hide the purchase buttons there.
  // Two signals: the page that embeds us, and (after sign-in) which Pi app the token belongs to.
  // The official app's address always wins, so purchases are never hidden there by mistake.
  const OLD_APPS = ["apppioasisaf7788"];
  const OFFICIAL = "oasisgame6033";
  const parents = [location.hostname, document.referrer, ...(location.ancestorOrigins ? [...location.ancestorOrigins] : [])].join(" ");
  function enterOldApp() {
    if (oldApp || parents.includes(OFFICIAL)) return;
    oldApp = true;
    const url = new URL($("gateLink").href);
    const r = new URLSearchParams(location.search).get("ref");
    if (r) url.searchParams.set("ref", r);
    $("gateLink").href = $("movedLink").href = url.href;
    $("movedBar").classList.remove("hidden");
    $("gate").classList.remove("hidden");
    render();
    // Browsers only let an embedded page change the address after a tap, but try anyway
    try { window.top.location.href = url.href; } catch {}
  }
  $("gateStay").addEventListener("click", () => $("gate").classList.add("hidden"));
  if (OLD_APPS.some((h) => parents.includes(h))) enterOldApp();

  window.I18N.apply();
  setSky();
  setInterval(setSky, 60000);
  renderSeeds();
  render();
  setInterval(() => {
    renderFarm(); renderStakes();
    if (document.querySelector("#tab-camels.active")) renderCamels();
    if (document.querySelector("#tab-city.active")) { renderCity(); maybeCityTick(); }
  }, 1000);
})();
