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

  // Share links open straight in Pi Browser (pi://), with the plain host as a fallback to type in.
  function piShare() {
    const web = account ? `${publicUrl || location.origin + location.pathname}?ref=${encodeURIComponent(account.username)}` : "";
    let host = "";
    try { host = new URL(web || location.href).host; } catch (e) {}
    return { link: web, host };
  }

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
      if (msg && (msg.key === "t.levelUp" || msg.key === "t.streakBonus")) burst();
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
  // Today's oasis event (same for everyone) and tomorrow's
  function renderEvent() {
    const n = now(), ev = L.eventOf(n), nx = L.eventOf(n + 86400000);
    const left = (L.dayId(n) + 1) * 86400000 - n;
    const h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60000);
    $("eventBar").className = "event-bar ev-" + ev.id;
    $("eventBar").innerHTML = `<span class="ev-ic">${ev.e}</span><span class="ev-txt"><b>${t("ev." + ev.id)}</b><small>${t("ev." + ev.id + ".d")}</small></span>
      <span class="ev-side"><small>⏳ ${h}h ${m}m</small><small>${t("ev.tomorrow")} ${nx.e}</small></span>`;
  }
  function renderFarm() {
    renderEvent();
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
      const medal = (b) => (b.from === b.to ? ["🥇", "🥈", "🥉"][b.from - 1] || "#" + b.from : `${b.from}-${b.to}`);
      $("prizeTable").innerHTML = `<b>${t("rank.bands")}</b>` + (lb.bands || []).map((b) => `<div><span>${medal(b)}</span><span dir="ltr">${+(b.share * 100).toFixed(2)}% · ≈${+(lb.prizePool * b.share).toFixed(3)} π</span><span dir="ltr">+${fmtN(b.dates)} 🌴 +${b.jry} 💠</span></div>`).join("");
      const me = account.username;
      const pod = (r, place) => r ? `<div class="pod p${place} ${r.username === me ? "me" : ""}">
          <div class="av">${esc(r.username.slice(0, 1).toUpperCase())}</div>
          <div class="nm">${esc(r.username)}${r.sup ? " " + SUPN[r.sup] : ""}</div>${chip(r.tier)}
          <div class="sc">${r.score} 🪙</div><div class="step">${place}</div></div>` : `<div></div>`;
      $("podium").innerHTML = lb.top.length ? pod(lb.top[1], 2) + pod(lb.top[0], 1) + pod(lb.top[2], 3) : "";
      $("leaderboard").innerHTML = lb.top.length
        ? lb.top.slice(3).map((r, i) => `<li class="${r.username === me ? "me" : ""}"><span><span class="pos">${i + 4}</span>${esc(r.username)}${r.sup ? " " + SUPN[r.sup] : ""}${chip(r.tier)}</span><b>${r.score} 🪙</b></li>`).join("")
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
      // In the old App Studio app the purchase happens in the official app (one tap away)
      const buyBtn = (cls, label) => oldApp
        ? `<a class="btn ${cls}" href="${esc(officialHref)}" target="_top" style="text-decoration:none;text-align:center">${t("club.buyOfficial")}</a>`
        : `<button class="btn ${cls}" data-buy="${p.id}">${label}</button>`;
      if (tier === 4 || tier > i) foot = `<button class="btn secondary" disabled>${t("club.included")}</button>`;
      else if (tier === i) foot = buyBtn("gold", t("club.extend", { p: p.price }));
      else foot = buyBtn(i === 3 ? "gold" : "", t(tier ? "club.upgrade" : "club.buy", { p: p.price }));
      return `<div class="tier t${i} ${tier === i ? "current" : ""}">
        <div class="head"><span class="ic">${TIER_ICON[i]}</span><h3>${esc(tierName(i))}${i === 3 ? `<span class="tag">${t("club.best")}</span>` : ""}</h3>
          <div class="price">${p.price} Pi<small>${t("vip.month")}</small></div></div>
        ${perkList(i)}
        <div class="foot">${foot}</div>
      </div>`;
    }).join("");

    $("shop").innerHTML = L.PACKS.map((p, i) => `<div class="pack ${i === 1 ? "pop" : ""}">
        ${i === 1 ? `<span class="tag">${t("shop.popular")}</span>` : ""}
        <span class="pk-ic">${["🧺", "🪙", "💰", "🏺"][i]}</span>
        <b class="pk-n">${p.dates.toLocaleString("en-US")}</b><small>${t("shop.dates")}</small>
        ${oldApp ? `<a class="btn small" href="${esc(officialHref)}" target="_top" style="text-decoration:none">${p.price} Pi</a>`
          : `<button class="btn small ${i === 1 ? "gold" : ""}" data-pack="${p.id}">${p.price} Pi</button>`}
      </div>`).join("");

    const done = S.lastDaily === L.dayId(now());
    $("dailyBtn").disabled = done;
    $("dailyBtn").textContent = done ? t("daily.done") : t("daily.claim", { n: C.DAILY * perks().daily });
    if (account) {
      $("refLink").value = piShare().link;
      $("refCode").textContent = account.username;
      $("inviterBox").classList.toggle("hidden", !account.canSetInviter);
      $("invitedBy").classList.toggle("hidden", !account.invitedBy);
      if (account.invitedBy) $("invitedBy").textContent = t("ref.invitedBy", { name: account.invitedBy });
      $("refBalance").textContent = (+account.referralBalance).toFixed(3);
      $("refCount").textContent = account.referralCount;
      $("adminBox").classList.toggle("hidden", !account.isAdmin);
      $("giftBox").classList.toggle("hidden", !account.testGifts);
      $("tokenBox").classList.toggle("hidden", !(account.isAdmin && account.jryOn));
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
      burst();
    } catch (err) { toast(err.message); }
    render();
  });
  // ---------- 👑 Royal cards ----------
  const RC = L.ROYAL;
  let rcData = null;
  const rcPerks = (tid, sig) => { const tt = RC.tierById(tid), s = RC.SIGS.find((x) => x.id === sig) || {}; return `<li>⚔️ ${t("rc.boost", { n: Math.round(tt.boost * 100) })}</li><li>🏁 ${t("rc.races", { n: tt.races })}</li>
      <li>🎁 ${t("rc.gift", { d: fmtN(tt.gift.dates), c: fmtN(tt.gift.coins), j: tt.gift.jry })}</li>${sig ? `<li class="rc-sig">${s.e} ${t("rc.sig." + sig)}</li>` : ""}`; };
  function renderRoyal() {
    const d = rcData;
    if (!d) { $("rcShop").innerHTML = `<p class="hint">…</p>`; return; }
    $("rcShop").innerHTML = RC.TIERS.map((tt) => { const x = d.tiers.find((y) => y.id === tt.id) || {}; return `<div class="rc-card" style="--c:${tt.color}">
      <div class="rc-top"><i>${tt.e}</i><b>${t("rc.n." + tt.id)}</b><em dir="ltr">${x.sold || 0}/${RC.MAX}</em></div>
      ${x.next ? `<div class="rc-next">${t("rc.next", { n: x.next })}</div>` : `<div class="rc-next">${t("rc.soldout")}</div>`}
      <ul>${rcPerks(tt.id, x.sig)}</ul>
      <button class="btn small gold" data-rc="${tt.id}" data-ed="${x.next || 0}" ${x.next ? "" : "disabled"}>${tt.price} Pi</button></div>`; }).join("");
    const mine = d.mine || [];
    $("rcMine").innerHTML = mine.length ? `<div class="rc-mine"><b>👑 ${t("rc.mine", { n: mine.length })}</b>
      <div>${mine.map((c) => { const tt = RC.tierById(c.tier), s = RC.SIGS.find((x) => x.id === c.sig); return `<span style="--c:${tt.color}">${tt.e} #${c.ed} ${s.e}</span>`; }).join("")}</div>
      <button class="btn small gold" data-rcclaim="1" ${mine.every((c) => c.got) ? "disabled" : ""}>${mine.every((c) => c.got) ? t("rc.claimed") : "🎁 " + t("rc.claim")}</button></div>` : "";
    const P = RC.PRIZES;
    const fin = d.final, pct = Math.min(100, (100 * (d.sold || 0)) / (d.total || 2000));
    const finTxt = !fin ? `<small>${t("rc.waitD")}</small><div class="rc-bar"><i style="width:${pct}%"></i></div><small dir="ltr">${fmtN(d.sold || 0)} / ${fmtN(d.total || 2000)}</small>`
      : fin.done ? `<small>${t("rc.finalDone")}</small>` : `<small>${t("rc.finalOn", { d: new Date(fin.end).toLocaleDateString() })}</small>`;
    $("rcContest").innerHTML = `<b>🏆 ${t("rc.contest")}</b>${finTxt}
      <div class="rc-prizes"><span>🥇 ${fmtN(P[0])}</span><span>🥈 ${fmtN(P[1])}</span><span>🥉 ${fmtN(P[2])}</span><span>4-10 · ${fmtN(P[3])}</span></div>
      ${fin ? ((d.contest || []).length ? d.contest.slice(0, 10).map((r, i) => `<div class="rc-row"><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}. ${esc(r.username)}</span><b dir="ltr">🪙 ${fmtN(r.earned)}</b></div>`).join("") : `<small>${t("rc.noContest")}</small>`) : ""}`;
  }
  async function rcLoad() { try { rcData = await Pi.royal(); } catch (e) {} renderRoyal(); }
  $("tab-vip").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rc], [data-rcclaim]");
    if (!b) return;
    if (!account) return toast(t("t.loginFirst"));
    b.disabled = true;
    try {
      if (b.dataset.rcclaim) {
        const r = await Pi.royalClaim();
        account = r.account; S = r.state; render(); burst();
        toast(t("rc.got", { d: fmtN(r.gift.dates), c: fmtN(r.gift.coins), j: r.gift.jry }));
      } else {
        const tt = RC.tierById(b.dataset.rc), ed = Number(b.dataset.ed), x = rcData.tiers.find((y) => y.id === tt.id);
        if (!confirm(t("rc.confirm", { name: t("rc.n." + tt.id), n: ed, sig: t("rc.sig." + x.sig), p: tt.price }))) { b.disabled = false; return; }
        const r = await Pi.buyRoyal(tt.id, ed);
        if (r.account) account = r.account; if (r.state) S = r.state;
        toast(t("rc.bought")); burst(); render();
      }
    } catch (err) { toast(err.message); }
    await rcLoad();
  });
  rcLoad();

  // ---------- 💎 Founding supporters ----------
  const SUPN = ["", "💚", "💙", "💎", "🤍"];
  let supData = null;
  function renderSupporters() {
    const mine = (account && account.supLvl) || 0, F = L.SUPPORT_FREE;
    const got = supData && supData.surprise ? F.SURPRISES.find((x) => x.id === supData.surprise) : null;
    $("supFree").innerHTML = `<div class="sf-card"><div class="sf-top"><i>🤍</i><span><b>${t("sf.t")}</b><small>${t("sf.d", { j: F.JRY, d: fmtN(F.DATES) })}</small></span></div>
      <div class="sf-box">🎁 ${got ? t("sf.got", { s: got.e + " " + t("sf.s." + got.id) }) : t("sf.box")}</div>
      <div class="ref-row"><input id="sfAmt" type="number" inputmode="numeric" min="${F.MIN}" step="1" value="1" dir="ltr"><button class="btn small gold" data-sf="1">${t("sf.go")}</button></div></div>`;
    $("supShop").innerHTML = L.SUPPORTER.map((s) => `<div class="sup-card sup${s.lvl}${mine >= s.lvl ? " got" : ""}">
      <div class="sup-top"><i>${s.e}</i><b>${t("sup.n" + s.lvl)}</b></div>
      <ul><li>${s.e} ${t("sup.badge")}</li><li>🐪 ${t("sup.camel" + s.camel)}</li><li>💠 ${fmtN(s.jry)} JRY</li><li>📜 ${t("sup.wall")}</li></ul>
      <button class="btn small gold" data-sup="${s.id}">${mine >= s.lvl ? "✓ " : ""}${s.price} Pi</button></div>`).join("");
    const d = supData;
    $("supWall").innerHTML = d ? `<b>📜 ${t("sup.wallT", { n: d.count })}</b>` + (d.list.length ? `<div>${d.list.map((x) => `<span>${SUPN[x.lvl || 4]} ${esc(x.username)}</span>`).join("")}</div>` : `<small>${t("sup.first")}</small>`) : "";
  }
  async function supLoad() { try { supData = await Pi.supporters(); } catch (e) {} renderSupporters(); }
  $("supFree").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sf]");
    if (!b) return;
    if (!account) return toast(t("t.loginFirst"));
    const n = Math.floor(Number($("sfAmt").value));
    if (!(n >= L.SUPPORT_FREE.MIN)) return toast(t("e.sf.amount"));
    if (!confirm(t("sf.confirm", { n }))) return;
    b.disabled = true;
    try {
      const res = await Pi.buySupportFree(n);
      if (res.account) account = res.account; if (res.state) S = res.state;
      await supLoad(); burst();
      const s = supData && supData.surprise ? L.SUPPORT_FREE.SURPRISES.find((x) => x.id === supData.surprise) : null;
      toast(t("sf.thanks", { j: fmtN(n * L.SUPPORT_FREE.JRY) }) + (s ? " · 🎁 " + s.e + " " + t("sf.s." + s.id) : ""));
    } catch (err) { toast(err.message); }
    b.disabled = false; render();
  });
  $("supShop").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sup]");
    if (!b) return;
    if (!account) return toast(t("t.loginFirst"));
    if (!confirm(t("sup.confirm"))) return;
    b.disabled = true;
    try {
      const res = await Pi.buySupporter(b.dataset.sup);
      if (res.account) account = res.account; if (res.state) S = res.state;
      toast(t("sup.thanks")); burst(); await supLoad();
    } catch (err) { toast(err.message); }
    b.disabled = false; render();
  });
  supLoad();

  // ---------- 🚀 Level-up packs ----------
  function renderLevelPacks() {
    $("lvShop").innerHTML = L.LEVEL_PACKS.map((k) => `<div class="lv-card${k.price >= 20 ? " lv-big" : ""}">
      <div class="lv-top"><i>${k.e}</i><b>${t("lv.n." + k.id)}</b></div>
      <ul><li>🌴 ${fmtN(k.dates)}</li><li>🪙 ${fmtN(k.coins)}</li>${k.spins ? `<li>🎡 ${k.spins}</li>` : ""}${k.jry ? `<li>💠 ${fmtN(k.jry)} JRY</li>` : ""}${k.camel ? `<li>🐪 ${t("lv.camel")}</li>` : ""}</ul>
      <button class="btn small gold" data-lv="${k.id}">${k.price} Pi</button></div>`).join("");
  }
  $("lvShop").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-lv]");
    if (!b) return;
    if (!account) return toast(t("t.loginFirst"));
    b.disabled = true;
    try {
      const res = await Pi.buyLevel(b.dataset.lv);
      if (res.account) account = res.account; if (res.state) S = res.state;
      toast(t("lv.ok")); burst();
    } catch (err) { toast(err.message); }
    b.disabled = false; render();
  });
  $("shop").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pack]");
    if (!b) return;
    if (!account) return toast(t("t.loginFirst"));
    const pack = L.PACKS.find((x) => x.id === b.dataset.pack);
    b.disabled = true;
    const before = S.dates;
    try {
      const res = await Pi.buyDates(pack.id);
      account = res.account;
      if (res.state) S = res.state;
      toast(t("shop.ok", { n: pack.dates.toLocaleString("en-US") }));
      burst();
      if (S.dates > before) fly(S.dates - before);
    } catch (err) { toast(err.message); }
    render();
  });
  // Tapping the dates counter opens the shop
  $("coinPill").addEventListener("click", () => { document.querySelector('.tabs [data-tab="vip"]').click(); setTimeout(() => $("shopTitle").scrollIntoView({ behavior: "smooth", block: "start" }), 50); });
  $("dailyBtn").addEventListener("click", () => act({ type: "daily" }));
  $("copyRef").addEventListener("click", () => {
    if (!account) return toast(t("t.loginFirst"));
    navigator.clipboard?.writeText($("refLink").value).then(() => toast(t("t.copied")), () => $("refLink").select());
  });
  // A link can't force Pi Browser to open, so offer a ready-made message and a pi:// link as well
  $("copyPiRef").addEventListener("click", () => {
    if (!account) return toast(t("t.loginFirst"));
    const link = $("refLink").value.replace(/^https?:\/\//, "pi://");
    navigator.clipboard?.writeText(link).then(() => toast(t("t.copied")), () => {});
  });
  $("shareRef").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    const text = t("share.text", { ...piShare(), code: account.username });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    navigator.clipboard?.writeText(text).then(() => toast(t("t.copied")), () => {});
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

  // ---------- Owner: players list (to know them and reward them) ----------
  let plData = null, plShow = 30;
  const PL_ICON = { free: "", bronze: "🥉", silver: "🥈", gold: "🥇", partner: "💎" };
  const nf = (n) => Number(n || 0).toLocaleString("en-US");
  function ago(ms) {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 60) return t("pl.min", { n: Math.max(1, m) });
    if (m < 1440) return t("pl.hour", { n: Math.floor(m / 60) });
    return t("pl.day", { n: Math.floor(m / 1440) });
  }
  function showPlayers() {
    if (!plData) return;
    const q = $("plSearch").value.trim().toLowerCase(), by = $("plSort").value;
    const list = plData.players.filter((p) => !q || p.username.toLowerCase().includes(q))
      .sort((a, b) => (b[by] || 0) - (a[by] || 0));
    $("plStats").innerHTML = [["pl.total", plData.total], ["pl.today", plData.today], ["pl.week7", plData.week], ["pl.members", plData.members]]
      .map(([k, n]) => `<div><b>${nf(n)}</b><small>${t(k)}</small></div>`).join("");
    $("plList").innerHTML = list.length ? list.slice(0, plShow).map((p) => `<div class="pl">
        <span><b>${esc(p.username)}</b> ${PL_ICON[p.tier] || ""}<br><small class="hint">${t("pl.seen", { t: ago(p.seen) })} · ${t("pl.joined", { d: new Date(p.joined).toLocaleDateString() })}</small></span>
        <span class="pl-num"><small>🏆 ${nf(p.week)} · 🌴 ${nf(p.dates)}<br>🏙️ ${p.level} · 👥 ${p.refs}${p.paid ? ` · π ${p.paid}` : ""}</small></span>
      </div>`).join("") : `<div class="hint">${t("pl.none")}</div>`;
    $("plMore").classList.toggle("hidden", list.length <= plShow);
  }
  async function loadPlayers() {
    try { plData = await Pi.players(); showPlayers(); } catch (e) { toast(e.message); }
  }
  $("plSearch").addEventListener("input", () => { plShow = 30; showPlayers(); });
  $("plSort").addEventListener("change", () => { plShow = 30; showPlayers(); });
  $("plMore").addEventListener("click", () => { plShow += 50; showPlayers(); });

  // ---------- Owner: Airdrop list (fair distribution later) ----------
  let adData = null;
  const AD_FLAG = { speed: "⚡", marathon: "⏱️", network: "🔗" };
  function showAirdrop() {
    if (!adData) return;
    const f = $("adFilter").value;
    const list = adData.players.filter((p) => f === "all" || (f === "eligible" && p.eligible) || (f === "flagged" && p.flags.length) || (f === "blocked" && p.blocked));
    $("adStats").innerHTML = [["ad.sCount", adData.count], ["ad.sOk", adData.eligible], ["ad.sFlag", adData.flagged], ["ad.sBlocked", adData.blocked]]
      .map(([k, n]) => `<div><b>${nf(n)}</b><small>${t(k)}</small></div>`).join("");
    const src = (e) => Object.entries(e || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${t("ad.src." + k)} ${nf(n)}`).join(" · ");
    $("adList").innerHTML = list.length ? list.slice(0, 100).map((p) => `<div class="pl">
        <span><b>${esc(p.username)}</b> ${p.eligible ? "✅" : p.blocked ? "⛔" : ""} ${p.flags.map((x) => `<span title="${esc(t("ad.flag." + x))}">${AD_FLAG[x] || "⚠️"}</span>`).join("")}
          <br><small class="hint">${t("ad.days", { n: p.days, need: adData.minDays })}${p.sameNet ? " · " + t("ad.net", { n: p.sameNet }) : ""}</small>
          <br><small class="hint">${src(p.earn)}</small>
          ${p.flags.length ? `<br><small class="hint">⚠️ ${p.flags.map((x) => t("ad.flag." + x)).join(" · ")}</small>` : ""}</span>
        <span class="pl-num"><small>🪙 ${nf(p.coins)}</small><br><small class="hint">Σ ${nf(p.total)}</small><br>
          <button class="btn small ${p.blocked ? "" : "secondary"}" data-adblock="${esc(p.username)}" data-on="${p.blocked ? 0 : 1}">${t(p.blocked ? "ad.unblock" : "ad.block")}</button></span>
      </div>`).join("") : `<div class="hint">${t("pl.none")}</div>`;
  }
  async function loadAirdrop() {
    try { adData = await Pi.airdrop(); showAirdrop(); } catch (e) { toast(e.message); }
  }
  $("adFilter").addEventListener("change", showAirdrop);
  $("adList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-adblock]");
    if (!b) return;
    const on = b.dataset.on === "1";
    if (on && !confirm(t("ad.confirm", { name: b.dataset.adblock }))) return;
    try { await Pi.airdropBlock(b.dataset.adblock, on); await loadAirdrop(); } catch (err) { toast(err.message); }
  });
  // CSV for the distribution: username, coins, days, eligible, warnings
  $("adCsv").addEventListener("click", () => {
    if (!adData) return;
    const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
    const lines = [["username", "coins_now", "coins_earned_total", "active_days", "eligible", "blocked", "warnings", "same_network_accounts", "taps"].join(",")]
      .concat(adData.players.map((p) => [q(p.username), p.coins, p.total, p.days, p.eligible ? 1 : 0, p.blocked ? 1 : 0, q(p.flags.join(" ")), p.sameNet, p.taps].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jerry-airdrop-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast(t("ad.csvOk"));
  });

  // ---------- Owner: Partner requests from the community ----------
  async function partnerRequests(action, uid) {
    try {
      const r = await Pi.partnerRequests(action, uid);
      $("prList").innerHTML = r.requests.length ? r.requests.map((x) => `<div class="pl"><span><b>${esc(x.username)}</b> ${x.wallet ? "🪙" : ""}<br><small class="hint">${esc(x.note || "—")}</small></span>
        <span class="pl-num"><button class="btn small" data-prok="${esc(x.uid)}">${t("pr.ok")}</button> <button class="btn small secondary" data-prno="${esc(x.uid)}">${t("pr.no")}</button></span></div>`).join("")
        : `<div class="hint">${t("pr.none")}</div>`;
      if (action === "approve") { toast(t("pr.done")); partners("list"); }
    } catch (e) { toast(e.message); }
  }
  $("prList").addEventListener("click", (e) => {
    const ok = e.target.closest("[data-prok]"), no = e.target.closest("[data-prno]");
    if (ok) partnerRequests("approve", ok.dataset.prok);
    if (no) partnerRequests("reject", no.dataset.prno);
  });

  // ---------- Owner: community votes ----------
  $("paCreate").addEventListener("click", async () => {
    const q = $("paQ").value.trim(), options = $("paOpts").value.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!q || options.length < 2) return toast(t("e.k.pollBad"));
    try { await Pi.polls("create", { q, options, days: +$("paDays").value }); $("paQ").value = ""; $("paOpts").value = ""; toast(t("pa.ok")); }
    catch (e) { toast(e.code ? errText(e.code) : e.message); }
  });

  // ---------- Owner: test JRY token (Pi Testnet) ----------
  function showToken(s) {
    $("tkAppAddr").value = s.distributor || "";
    const row = (ok, k, extra) => `<div><span>${ok ? "✅" : "⬜"} ${t(k)}</span><small class="hint" style="direction:ltr">${extra || ""}</small></div>`;
    const short = (g) => (g ? g.slice(0, 5) + "…" + g.slice(-4) : "");
    $("tkStatus").innerHTML = row(s.issuerActive, "tk.issuer", short(s.issuer)) + row(s.distTrust, "tk.trust", short(s.distributor)) +
      row(s.minted, "tk.minted", s.minted ? nf(Math.round(s.supply)) + " " + s.code : "") + row(s.home === s.wantHome, "tk.home", s.home || s.wantHome) +
      `<div><span>💰 ${t("tk.appPi")}</span><small class="hint" style="direction:ltr">${s.appPi} Test-Pi</small></div>` +
      `<div><span>👥 ${t("tk.holders", { n: s.holders })}</span><small class="hint">🪂 ${t("tk.sent", { n: s.sent })}</small></div>`;
  }
  async function token(action, extra) {
    try {
      const r = await Pi.token(action, extra);
      showToken(r);
      if (r.done) toast(r.done.length ? "✅ " + r.done.join(" · ") : t("tk.nothing"));
      if (r.report) $("tkReport").textContent = r.report.length ? r.report.map((x) => `${x.ok ? "✅" : "❌"} ${x.username}${x.error ? " (" + x.error + ")" : ""}`).join(" · ") : t("tk.noneReady");
    } catch (e) { toast(e.code ? errText(e.code, e.data && e.data.vars) : e.message); }
  }
  $("tkSetup").addEventListener("click", () => token("setup"));
  $("tkCopy").addEventListener("click", () => {
    const v = $("tkAppAddr").value;
    if (!v) return;
    navigator.clipboard?.writeText(v).then(() => toast(t("t.copied")), () => { $("tkAppAddr").select(); });
  });
  $("tkSend").addEventListener("click", () => {
    const to = $("tkTo").value.trim(), amount = $("tkSendAmt").value.trim();
    if (to && amount && confirm(t("tk.sendConfirm", { n: amount, to: to.slice(0, 5) + "…" + to.slice(-4) }))) token("send", { to, amount }).then(() => toast(t("tk.sent2")));
  });
  $("tkRefresh").addEventListener("click", () => token("status"));
  $("tkDrop").addEventListener("click", () => { if (confirm(t("tk.confirm", { n: $("tkAmount").value }))) token("airdrop", { amount: $("tkAmount").value.trim() }); });

  // ---------- Owner, Testnet only: A2U gifts so the Pi portal unlocks the Mainnet wallet ----------
  async function testGifts(action) {
    try {
      const r = await Pi.testGifts(action);
      const icon = { completed: "✅", failed: "❌" };
      $("giftList").innerHTML = `<div class="hint">${t("gift.count", { n: r.paid, p: r.players })}</div>` +
        r.gifts.map((g) => `<div><span>${icon[g.status] || "⏳"} <b>${esc(g.username || "?")}</b>${g.error ? ` <small class="hint">${esc(g.error)}</small>` : ""}</span></div>`).join("");
      if (action === "send") toast(t("gift.sent"));
    } catch (e) { toast(e.message); }
  }
  $("sendGifts").addEventListener("click", () => testGifts("send"));

  // ---------- 🎡 Lucky wheel & 🏪 points market ----------
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const shortN = (n) => (n >= 1e6 ? n / 1e6 + "M" : n >= 1000 ? n / 1000 + "K" : String(n));
  const W = L.WHEEL, MKT = L.MARKET;
  const prizeLabel = (p) => (p.t === "dates" ? "🌴 " + shortN(p.n) : p.t === "coins" ? "🪙 " + shortN(p.n) : p.t === "jry" ? "JRY " + p.n : p.t === "respin" ? "🔄" : p.t === "energy" ? "⚡" : "🐪");
  let funPage = "", whRot = 0, whBusy = false, mkData = null;
  const closeFun = () => { if (!whBusy) { $("fun").classList.add("hidden"); funPage = ""; } };
  $("funBg").addEventListener("click", closeFun);
  function renderFunBadges() {
    $("whBadge").textContent = !account ? "" : account.wheelFree ? t("wh.freeNow") : account.wheelSpins ? t("wh.left", { n: account.wheelSpins }) : t("wh.tomorrow");
    $("whBadge").classList.toggle("hot", !!(account && (account.wheelFree || account.wheelSpins)));
    $("earnBadge").textContent = !account ? t("earn.badge") : t("earn.badgeN", { n: account.earnN, max: "∞" });
    $("mkBadge").textContent = account && account.mkBalance > 0 ? fmtN(+account.mkBalance.toFixed(2)) + " π" : t("mk.badge");
  }
  function renderWheel() {
    const seg = 360 / W.PRIZES.length;
    const cols = ["#0f6b4a", "#e2a918", "#c0392b", "#2d6cdf"];
    const grad = W.PRIZES.map((_, i) => `${cols[i % cols.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");
    const can = account && (account.wheelFree || account.wheelSpins > 0);
    $("funCard").innerHTML = `<div class="grab"></div><h3>🎡 ${t("wh.t")}</h3>
      <p class="hint">${t("wh.d", { n: W.SPINS, p: W.PRICE })}</p>
      <div class="wh-wrap"><div class="wh-pointer">▼</div>
        <div class="wh" id="whDisc" style="background:conic-gradient(from ${-seg / 2}deg, ${grad});transform:rotate(${whRot}deg)">
          ${W.PRIZES.map((p, i) => `<span class="wh-l" style="transform:rotate(${i * seg}deg) translateY(-104px)">${prizeLabel(p)}</span>`).join("")}
          <b class="wh-hub">🦊</b></div></div>
      <div id="whMsg" class="wh-msg"></div>
      <button class="btn gold" id="whSpin" ${can ? "" : "disabled"}>${!account ? t("t.loginFirst") : account.wheelFree ? t("wh.spinFree") : account.wheelSpins > 0 ? t("wh.spin", { n: account.wheelSpins }) : t("wh.noSpins")}</button>
      <button class="btn" id="whBuy">${t("wh.buy", { n: W.SPINS, p: W.PRICE })}</button>
      <p class="hint">${t("wh.note")}</p>`;
  }
  function renderMk() {
    const d = mkData;
    if (!d) { $("funCard").innerHTML = `<div class="grab"></div><h3>🏪 ${t("mk.t")}</h3><p class="hint">…</p>`; return; }
    const ico = (k) => (k === "coins" ? "🪙" : "🌴");
    const unit = (o) => fmtN(+(o.pi / o.amount * (o.kind === "coins" ? 100000 : 1000)).toFixed(3)) + " π / " + (o.kind === "coins" ? "100K" : "1K");
    const row = (o) => `<div class="mk-row"><span><b dir="ltr">${ico(o.kind)} ${fmtN(o.amount)}</b><small>👤 ${esc(o.seller || "")} · <span dir="ltr">${unit(o)}</span></small></span>
      ${o.mine ? `<small class="mk-tag">${t("mk.yours")}</small>` : o.status === "reserved" ? `<small class="mk-tag">⏳</small>` : `<button class="btn small gold" data-mkbuy="${o.id}"><span dir="ltr">${fmtN(o.pi)} π</span></button>`}</div>`;
    const list = (k) => { const x = d.offers.filter((o) => o.kind === k); return x.length ? x.map(row).join("") : `<p class="hint">${t("mk.empty")}</p>`; };
    const mine = d.mine.filter((o) => o.status === "open" || o.status === "reserved");
    const canW = d.balance >= d.minWithdraw;
    $("funCard").innerHTML = `<div class="grab"></div><h3>🏪 ${t("mk.t")}</h3>
      <p class="hint">${t("mk.d", { tax: Math.round(d.tax * 100) })}</p>
      <div class="mk-bal"><span><small>${t("mk.bal")}</small><b dir="ltr">${fmtN(+d.balance.toFixed(4))} π</b>${d.pending ? `<small>⏳ ${t("mk.pending", { n: d.pending })}</small>` : ""}</span>
        <button class="btn small ${canW ? "gold" : "secondary"}" id="mkWd" ${canW ? "" : "disabled"}>${canW ? t("mk.withdraw") : t("mk.wdMin", { n: d.minWithdraw })}</button></div>
      <details class="mk-sell"><summary>📤 ${t("mk.sellT")}</summary>
        <div class="mk-form"><select id="mkKind"><option value="dates">🌴 ${t("mk.dates")}</option><option value="coins">🪙 ${t("mk.coins")}</option></select>
          <input id="mkAmt" type="number" inputmode="numeric" min="1" placeholder="${t("mk.amount")}" dir="ltr">
          <input id="mkPi" type="number" inputmode="decimal" min="${MKT.MIN_PI}" step="any" placeholder="${t("mk.price")}" dir="ltr"></div>
        <small class="hint" id="mkHint">${t("mk.have", { d: fmtN(S.dates), c: fmtN(Math.floor((S.kombat && S.kombat.coins) || 0)) })}</small>
        <button class="btn gold" id="mkSell">${t("mk.list")}</button></details>
      ${mine.length ? `<h4>${t("mk.mineT")}</h4>` + mine.map((o) => `<div class="mk-row"><span><b dir="ltr">${ico(o.kind)} ${fmtN(o.amount)} → ${fmtN(o.pi)} π</b><small>${o.status === "reserved" ? "⏳ " + t("mk.held") : t("mk.onSale")}</small></span><button class="btn small secondary" data-mkcancel="${o.id}">${t("mk.cancel")}</button></div>`).join("") : ""}
      <h4>🌴 ${t("mk.dates")}</h4>${list("dates")}
      <h4>🪙 ${t("mk.coins")}</h4>${list("coins")}`;
  }
  // ---------- 📺 Jerry Media Earnings: its own page for ads and earnings ----------
  const E = L.EARN;
  const JM_ICON = { bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎", legend: "👑" };
  let jmOpen = false, jmAds = null, jmTop = null, jmBusy = false, jmTimer = 0;
  function renderMedia() {
    if (!jmOpen) return;
    const acc = account, n = acc ? acc.earnN : 0, max = E.DATES.length, done = false; // no daily limit
    const wait = acc ? Math.max(0, E.GAP - (now() - acc.earnAt)) : 0;
    const ads = acc ? acc.earnAds : 0, li = L.earnLevel(ads), lv = E.LEVELS[li], nx = E.LEVELS[li + 1];
    const mult = 1 + lv.x, next = Math.round((n < max ? E.DATES[n] : E.AFTER) * mult);
    const streak = acc ? acc.earnStreak : 0, sToday = acc && acc.earnStreakToday;
    const bonusTxt = (bn) => [bn.spins ? `🎡+${bn.spins}` : "", bn.coins ? `🪙+${shortN(bn.coins)}` : "", bn.jry ? `JRY+${bn.jry}` : ""].filter(Boolean).join(" ");
    const st = jmAds ? jmAds.s : "check";
    const stTxt = { check: "⏳ " + t("jm.st.check"), ok: "✅ " + t("jm.st.ok"), nopi: "📲 " + t("jm.st.nopi"), old: "⬆️ " + t("jm.st.old"), pending: "🕓 " + t("jm.st.pending") }[st];
    const can = acc && !done && wait <= 0 && !jmBusy;
    $("media").innerHTML = `
      <header class="jm-head"><button class="jm-back" data-jm="close">‹ ${t("jm.back")}</button><b>📺 Jerry Media <span>Earnings</span></b><button class="jm-back" data-jm="help">?</button></header>
      <div class="jm-body">
        <div class="jm-hero">
          <div><small>${t("jm.earned")}</small><b dir="ltr">🌴 ${fmtN(acc ? acc.earnTotal : 0)}</b></div>
          <div><small>${t("jm.watched")}</small><b dir="ltr">${fmtN(ads)}</b></div>
          <div><small>${t("jm.balance")}</small><b dir="ltr">${fmtN(+((acc ? acc.mkBalance : 0)).toFixed(2))} π</b></div>
        </div>
        <div class="jm-status ${st}">${stTxt}${jmAds && jmAds.code ? ` <small dir="ltr">(${esc(jmAds.code)})</small>` : ""}${st !== "ok" && st !== "check" ? `<button data-jm="recheck">${t("jm.recheck")}</button>` : ""}</div>
        <div class="jm-play">
          <button class="jm-ring" data-jm="watch" style="--p:${(100 * n) / max}%" ${can ? "" : "disabled"}>
            <span><i>${done ? "✅" : "▶"}</i><b>${!acc ? t("t.loginFirst") : done ? t("jm.doneToday") : wait > 0 ? t("jm.waitS", { s: Math.ceil(wait / 1000) }) : t("jm.watch")}</b>${!done && acc ? `<small dir="ltr">+${next} 🌴</small>` : ""}</span>
          </button>
          <div class="jm-count" dir="ltr">${n < max ? `${n} / ${max}` : `${n} · ∞`}</div>
        </div>
        <div class="jm-steps">${E.DATES.map((d, i) => `<div class="${i < n ? "done" : i === n ? "next" : ""}"><small>${i + 1}</small><b>${Math.round(d * mult)}</b>${E.BONUS[i + 1] ? `<em>${bonusTxt(E.BONUS[i + 1])}</em>` : ""}${i + 1 === E.STREAK_ADS ? `<em>🔥</em>` : ""}</div>`).join("")}<div class="${n >= max ? "next" : ""} jm-inf"><small>11+</small><b>${Math.round(E.AFTER * mult)}</b><em>∞</em></div></div>
        <div class="jm-cards">
          <div class="jm-card"><div class="jm-ct">${JM_ICON[lv.id]} ${t("jm.lv." + lv.id)} <em>+${Math.round(lv.x * 100)}%</em></div>
            <div class="jm-bar"><i style="width:${nx ? Math.min(100, (100 * (ads - lv.n)) / (nx.n - lv.n)) : 100}%"></i></div>
            <small>${nx ? t("jm.lvNext", { n: nx.n - ads, lv: t("jm.lv." + nx.id), x: Math.round(nx.x * 100) }) : t("jm.lvMax")}</small></div>
          <div class="jm-card"><div class="jm-ct">🔥 ${t("jm.streak", { n: streak })}</div>
            <div class="jm-dots">${[...Array(E.STREAK_MAX)].map((_, i) => `<i class="${i < Math.min(streak, E.STREAK_MAX) ? "on" : ""}"></i>`).join("")}</div>
            <small>${sToday ? t("jm.streakDone") : t("jm.streakDo", { n: E.STREAK_ADS, d: E.STREAK_DATES * Math.min((streak || 0) + 1, E.STREAK_MAX) })}</small></div>
        </div>
        <button class="jm-cash" data-jm="sell">💰 ${t("jm.sell")}</button>
        <div class="jm-how"><b>${t("jm.howT")}</b>
          <div><i>1</i><span>${t("jm.how1")}</span></div><div><i>2</i><span>${t("jm.how2")}</span></div><div><i>3</i><span>${t("jm.how3", { n: MKT.MIN_WITHDRAW })}</span></div></div>
        <div class="jm-top"><b>🏆 ${t("jm.topT")}</b>${jmTop ? `<small>${t("jm.topStats", { v: fmtN(jmTop.viewers), a: fmtN(jmTop.ads) })}</small>` +
          (jmTop.top.length ? jmTop.top.map((x, i) => `<div><span>${["🥇", "🥈", "🥉"][i] || i + 1} ${esc(x.username)}</span><span dir="ltr">📺 ${fmtN(x.ads)}</span></div>`).join("") : `<small>${t("jm.topEmpty")}</small>`) : ""}</div>
        <p class="jm-note">${t("jm.note")}</p>
      </div>`;
    clearTimeout(jmTimer);
    if (acc && !done && wait > 0) jmTimer = setTimeout(renderMedia, Math.min(wait, 1000));
  }
  async function jmCheckAds() { jmAds = null; renderMedia(); jmAds = await Pi.adsStatus(); renderMedia(); }
  function openMedia() {
    jmOpen = true; $("media").classList.remove("hidden"); renderMedia();
    jmCheckAds();
    if (account) Pi.earnTop().then((x) => { jmTop = x; renderMedia(); }, () => {});
  }
  $("earnOpen").addEventListener("click", openMedia);
  if (/[?&]media=1\b/.test(location.search)) setTimeout(openMedia, 600); // direct link to the page
  $("media").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-jm]");
    if (!b) return;
    const a = b.dataset.jm;
    if (a === "close") { jmOpen = false; clearTimeout(jmTimer); return $("media").classList.add("hidden"); }
    if (a === "help") return toast(t("jm.note"));
    if (a === "recheck") return jmCheckAds();
    if (!account) return toast(t("t.loginFirst"));
    if (a === "sell") { funPage = "mk"; mkData = null; renderMk(); $("fun").classList.remove("hidden"); return loadMk(); }
    if (a === "watch" && !jmBusy) {
      jmBusy = true; renderMedia();
      try {
        const adId = await Pi.showRewardedAd();
        if (!adId) { toast(t(jmAds && jmAds.s === "ok" ? "t.adFail" : "jm.st." + ((jmAds && jmAds.s) || "pending"))); if (!jmAds || jmAds.s !== "ok") jmCheckAds(); }
        else {
          const r = await Pi.earnAd(adId);
          account = r.account; S = r.state; render();
          toast(t("earn.got", { n: r.dates }) + (r.bonus && r.bonus.streak ? " 🔥" : "") + (r.bonus && (r.bonus.spins || r.bonus.coins) ? " 🎁" : "") + (r.levelUp ? " ⬆️" : ""));
          Pi.earnTop().then((x) => { jmTop = x; renderMedia(); }, () => {});
        }
      } catch (err) { toast(err.message); }
      jmBusy = false; renderMedia();
    }
  });

  // ---------- 🎟️ Gift codes ----------
  const codeIco = { dates: "🌴", coins: "🪙", jry: "JRY", spins: "🎡" };
  let caMade = [];
  $("codeGo").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    const b = $("codeGo"); b.disabled = true;
    try {
      const r = await Pi.redeemCode($("codeIn").value);
      account = r.account; S = r.state; render(); burst();
      toast(t("code.ok", { n: fmtN(r.amount), i: codeIco[r.kind] })); $("codeIn").value = "";
    } catch (e) { toast(e.message); }
    b.disabled = false;
  });
  function renderCodes(d) {
    $("caList").innerHTML = (d.list || []).map((c) => `<div><span><b dir="ltr">${esc(c.code)}</b> · ${codeIco[c.kind]} ${fmtN(c.amount)} · <span dir="ltr">${c.used}/${c.max_uses}</span>${c.expires_at ? " · ⏳ " + new Date(c.expires_at).toLocaleDateString() : ""}</span><button class="btn small secondary" data-cadel="${esc(c.code)}">🗑</button></div>`).join("");
    $("caCopy").classList.toggle("hidden", !caMade.length);
  }
  async function codeAdmin(o) { try { const d = await Pi.adminCodes(o); if (d.made && d.made.length) caMade = d.made; renderCodes(d); } catch (e) { toast(e.message); } }
  $("caMake").addEventListener("click", () => codeAdmin({ action: "create", kind: $("caKind").value, amount: $("caAmount").value, uses: $("caUses").value, count: $("caCount").value, days: $("caDays").value, code: $("caCode").value }));
  $("caCopy").addEventListener("click", () => navigator.clipboard?.writeText(caMade.join("\n")).then(() => toast(t("t.copied")), () => {}));
  $("caList").addEventListener("click", (e) => { const b = e.target.closest("[data-cadel]"); if (b && confirm(t("code.del"))) codeAdmin({ action: "delete", code: b.dataset.cadel }); });

  // ---------- 🎯 Tasks center: daily, weekly and one-time tasks made by the owner ----------
  let qData = null, qAdmin = null, qTimer = null;
  const qTitle = (x) => (x.title.startsWith("@") ? t(x.title.slice(1), { n: x.need || x.goal || 1 }) : esc(x.title));
  const qReward = (x) => `+${fmtN(x.reward)} ${codeIco[x.reward_kind]}`;
  function qBadge() {
    const n = qData ? qData.list.filter((x) => !x.done).length : 0;
    $("qBadge").textContent = qData ? (n ? t("q.left", { n }) : t("q.allDone")) : t("q.badge");
  }
  async function qLoad() {
    if (!account) return;
    try { qData = await Pi.quests(); } catch (e) { toast(e.message); }
    qBadge(); if (!$("quests").classList.contains("hidden")) renderQuests();
  }
  function qCard(x) {
    let act = "";
    if (x.done) act = `<span class="q-done">✅</span>`;
    else if (x.kind === "link") act = x.opened && x.wait <= 0 ? `<button class="btn small gold" data-q="claim" data-id="${x.id}">${t("q.claim")}</button>`
      : x.opened ? `<button class="btn small secondary" disabled>⏳ ${Math.ceil(x.wait / 1000)}s</button>`
      : `<button class="btn small gold" data-q="open" data-id="${x.id}" data-link="${esc(x.link)}">${t("q.open")}</button>`;
    else if (x.kind === "secret") act = `<button class="btn small gold" data-q="secret" data-id="${x.id}">${t("q.answer")}</button>`;
    else act = `<button class="btn small ${x.need && x.progress < x.need ? "secondary" : "gold"}" data-q="claim" data-id="${x.id}" ${x.need && x.progress < x.need ? "disabled" : ""}>${t("q.claim")}</button>`;
    const bar = x.need > 1 || (x.need && x.kind !== "spin") ? `<div class="jm-bar"><i style="width:${Math.round((100 * x.progress) / x.need)}%"></i></div><small dir="ltr">${x.progress}/${x.need}</small>` : "";
    const desc = x.title.startsWith("@") ? t(x.title.slice(1) + ".d", { n: x.need || 1 }) : esc(x.descr);
    return `<div class="q-card${x.done ? " is-done" : ""}"><i>${esc(x.emoji)}</i><span><b>${qTitle(x)}</b>${desc ? `<small>${desc}</small>` : ""}${bar}<em>${qReward(x)}</em></span>${act}</div>`;
  }
  function renderQuests() {
    const list = qData ? qData.list : [];
    const sec = (p) => { const l = list.filter((x) => x.period === p); return l.length ? `<h4>${t("q.p." + p)} <small>${t("q.r." + p)}</small></h4>` + l.map(qCard).join("") : ""; };
    const kinds = ["checkin", "link", "secret", "ads", "arcade", "invite", "spin"];
    $("quests").innerHTML = `<header class="jm-head"><button class="jm-back" data-q="close">‹ ${t("jm.back")}</button><b>🎯 ${t("q.t")}</b><span></span></header>
      <div class="jm-body">
        <p class="arc-intro">${t("q.intro")}</p>
        ${!account ? `<p class="jm-note">${t("t.loginFirst")}</p>` : !qData ? `<p class="jm-note">…</p>` : list.length ? sec("daily") + sec("weekly") + sec("once") : `<p class="jm-note">${t("q.empty")}</p>`}
        ${account && account.isAdmin ? `<details class="biz-form q-admin"><summary>🛡️ ${t("q.admin")}</summary>
          <button class="btn small secondary" data-q="starter">✨ ${t("q.starter")}</button>
          <label>${t("q.f.title")}<input id="qaTitle" maxlength="80"></label>
          <label>${t("q.f.desc")}<textarea id="qaDesc" maxlength="200" rows="2"></textarea></label>
          <div class="biz-row"><label>${t("biz.f.emoji")}<input id="qaEmoji" maxlength="4" value="🎯"></label>
            <label>${t("q.f.kind")}<select id="qaKind">${kinds.map((k) => `<option value="${k}">${t("q.k." + k)}</option>`).join("")}</select></label></div>
          <div class="biz-row"><label>${t("q.f.period")}<select id="qaPeriod"><option value="daily">${t("q.p.daily")}</option><option value="weekly">${t("q.p.weekly")}</option><option value="once">${t("q.p.once")}</option></select></label>
            <label>${t("q.f.goal")}<input id="qaGoal" type="number" min="1" value="1"></label></div>
          <label>${t("q.f.link")}<input id="qaLink" dir="ltr" placeholder="https://… / pi://…"></label>
          <label>${t("q.f.secret")}<input id="qaSecret" maxlength="40"></label>
          <div class="biz-row"><label>${t("code.f.kind")}<select id="qaRk"><option value="dates">🌴</option><option value="coins">🪙</option><option value="jry">JRY</option><option value="spins">🎡</option></select></label>
            <label>${t("code.amount")}<input id="qaRw" type="number" min="1" value="100"></label></div>
          <label>${t("q.f.days")}<input id="qaDays" type="number" min="0" value="0"></label>
          <small class="biz-rules">${t("q.f.hint")}</small>
          <button class="btn gold" data-q="create">${t("q.create")}</button>
          ${qAdmin ? qAdmin.list.map((x) => `<div class="biz-adm${x.active ? "" : " q-off"}"><span><b>${esc(x.emoji)} ${qTitle(x)}</b><small>${t("q.k." + x.kind)} · ${t("q.p." + x.period)}${x.goal > 1 ? " · " + x.goal : ""} · ${qReward(x)} · ✅ ${x.done_n}${x.secret ? " · 🔑 " + esc(x.secret) : ""}</small>${x.link ? `<small dir="ltr">${esc(x.link)}</small>` : ""}</span>
            <button class="btn small secondary" data-q="toggle" data-id="${x.id}">${x.active ? "⏸" : "▶️"}</button><button class="btn small secondary" data-q="del" data-id="${x.id}">🗑</button></div>`).join("") : ""}
        </details>` : ""}
      </div>`;
    clearTimeout(qTimer);
    if (list.some((x) => x.opened && x.wait > 0 && !x.done)) qTimer = setTimeout(() => { list.forEach((x) => { if (x.opened && x.wait > 0) x.wait = Math.max(0, x.wait - 1000); }); if (!$("quests").classList.contains("hidden")) renderQuests(); }, 1000);
  }
  async function qAdm(o) { try { qAdmin = await Pi.adminQuests(o); } catch (e) { toast(e.message); } await qLoad(); renderQuests(); }
  $("qOpen").addEventListener("click", () => {
    $("quests").classList.remove("hidden"); renderQuests(); qLoad();
    if (account && account.isAdmin && !qAdmin) qAdm({ action: "list" });
  });
  $("quests").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    const a = b.dataset.q, id = Number(b.dataset.id);
    if (a === "close") { clearTimeout(qTimer); return $("quests").classList.add("hidden"); }
    if (!account) return toast(t("t.loginFirst"));
    if (a === "create") return qAdm({ action: "create", title: $("qaTitle").value, descr: $("qaDesc").value, emoji: $("qaEmoji").value, kind: $("qaKind").value, period: $("qaPeriod").value,
      goal: $("qaGoal").value, link: $("qaLink").value, secret: $("qaSecret").value, reward_kind: $("qaRk").value, reward: $("qaRw").value, days: $("qaDays").value });
    if (a === "starter") return qAdm({ action: "starter" });
    if (a === "toggle") return qAdm({ action: "toggle", id });
    if (a === "del") return confirm(t("q.del")) && qAdm({ action: "delete", id });
    b.disabled = true;
    try {
      if (a === "open") {
        await Pi.questOpen(id);
        const link = b.dataset.link;
        if (/^(https:\/\/|pi:\/\/)/i.test(link)) window.open(link, "_blank", "noopener");
      } else {
        let answer;
        if (a === "secret") { answer = prompt(t("q.ask")); if (!answer) { b.disabled = false; return; } }
        const r = await Pi.questClaim(id, answer);
        account = r.account; S = r.state; render(); burst();
        toast(t("q.ok", { n: fmtN(r.amount), i: codeIco[r.kind] }));
      }
    } catch (err) { toast(err.message); }
    await qLoad();
  });

  // ---------- 💠 JRY distribution (owner) ----------
  const jdBody = (preview) => ({ preview, amount: $("jdAmount").value, target: $("jdTarget").value, n: $("jdN").value, names: $("jdNames").value, note: $("jdNote").value });
  function jdRender(d) {
    $("jdList").innerHTML = (d.list || []).map((x) => `<div><span>💠 ${fmtN(x.amount)} × ${x.players} · ${t("jd.t." + x.target)} · ${new Date(x.at).toLocaleDateString()}${x.note ? " · " + esc(x.note) : ""}</span></div>`).join("");
  }
  async function jdStats() {
    try {
      const d = await Pi.adminJryStats();
      $("jdStats").innerHTML = `<div><small>${t("js.supply")}</small><b>${fmtN(d.supply)}</b></div><div><small>${t("js.holders")}</small><b>${fmtN(d.holders)} / ${fmtN(d.players)}</b></div>
        <div><small>${t("js.spentWeek")}</small><b>${fmtN(d.spentWeek)}</b></div><div><small>${t("js.users30")}</small><b>${fmtN(d.users30)}</b></div>
        <div><small>${t("js.spentAll")}</small><b>${fmtN(d.spentAll)}</b></div><div><small>${t("js.dropped")}</small><b>${fmtN(d.dropped)}</b></div>
        ${d.top.length ? `<p class="jd-top">🏅 ${d.top.map((x) => `${esc(x.username)} ${fmtN(x.n)}`).join(" · ")}</p>` : ""}`;
    } catch (e) {}
  }
  async function jdPreview() { try { const d = await Pi.adminJryDrop(jdBody(true)); $("jdInfo").textContent = t("jd.count", { n: d.players, total: fmtN(d.players * (Number($("jdAmount").value) || 0)) }); jdRender(d); } catch (e) { toast(e.message); } }
  $("jdPreview").addEventListener("click", jdPreview);
  ["jdTarget", "jdAmount", "jdN"].forEach((id) => $(id).addEventListener("change", jdPreview));
  $("jdSend").addEventListener("click", async () => {
    const b = $("jdSend");
    try {
      const pre = await Pi.adminJryDrop(jdBody(true));
      if (!confirm(t("jd.confirm", { n: pre.players, a: fmtN(Number($("jdAmount").value) || 0) }))) return;
      b.disabled = true;
      const d = await Pi.adminJryDrop(jdBody(false));
      toast(t("jd.done", { n: d.players, total: fmtN(d.total) })); jdRender(d); $("jdInfo").textContent = ""; jdStats();
    } catch (e) { toast(e.message); }
    b.disabled = false;
  });

  // ---------- 🕹️ Jerry Arcade: free skill games that give dates ----------
  const AR = L.ARCADE;
  let arcInfo = null, arcGame = "", arcStop = null, arcPlayers = 0;
  const arcPlays = (g) => (arcInfo && arcInfo.plays[g]) || 0;
  function arcHome() {
    arcGame = ""; if (arcStop) { arcStop(); arcStop = null; }
    const card = (g, ico, best) => `<button class="arc-card" data-arc="${g}"><i>${ico}</i><span><b>${t("ar." + g + ".t")}</b><small>${t("ar." + g + ".d")}</small>
      <small class="arc-meta">${t("ar.plays", { n: Math.max(0, AR.PLAYS - arcPlays(g)), max: AR.PLAYS })}${best != null ? " · " + t("ar.best", { n: best }) : ""}</small></span><em>▶</em></button>`;
    const top = (g, unit) => arcInfo && arcInfo.top[g].length ? arcInfo.top[g].map((x, i) => `<div><span>${["🥇", "🥈", "🥉"][i] || i + 1} ${esc(x.username)}</span><b dir="ltr">${x.best} ${unit}</b></div>`).join("") : `<small>${t("jm.topEmpty")}</small>`;
    $("arcade").innerHTML = `<header class="jm-head"><button class="jm-back" data-arc="close">‹ ${t("jm.back")}</button><b>🕹️ Jerry <span>Arcade</span></b><span></span></header>
      <div class="jm-body"><p class="arc-intro">${t("ar.intro", { n: AR.PLAYS })}</p>
        ${card("memory", "🧠", arcInfo && arcInfo.best.memory)}${card("catcher", "🧺", arcInfo && arcInfo.best.catcher)}
        <h4>🔒 ${t("fut.t")}</h4><p class="arc-intro">${t("fut.d")}</p>
        <div class="fut-grid">${L.FUTURE.map((f) => { const have = arcPlayers || 0, pc = Math.min(100, (100 * have) / f.players);
          return `<div class="fut ${have >= f.players ? "open" : ""}"><i>${f.e}</i><b>${t("fut." + f.id)}</b><div class="jm-bar"><i style="width:${pc}%"></i></div><small dir="ltr">${fmtN(have)} / ${fmtN(f.players)} 👥</small><small>${have >= f.players ? t("fut.soon") : t("fut.lock", { n: fmtN(f.players - have) })}</small></div>`; }).join("")}</div>
        <button class="jm-cash" data-arc="share">📣 ${t("fut.share")}</button>
        <div class="jm-top"><b>🧠 ${t("ar.memory.t")} · ${t("ar.today")}</b>${top("memory", t("ar.moves"))}</div>
        <div class="jm-top"><b>🧺 ${t("ar.catcher.t")} · ${t("ar.today")}</b>${top("catcher", "🌴")}</div>
        <p class="jm-note">${t("ar.note")}</p></div>`;
  }
  async function arcLoad() {
    try { arcPlayers = (await Pi.stats()).players; } catch (e) {}
    if (account) { try { arcInfo = await Pi.arcade(); } catch (e) {} }
    if (!arcGame) arcHome();
  }
  async function arcClaim(game, score, ms) {
    if (!account) return { txt: t("t.loginFirst") };
    try {
      const r = await Pi.arcadeClaim(game, score, ms);
      S = r.state; render(); arcLoad();
      return { txt: r.reward > 0 ? t("ar.won", { n: r.reward }) : t("ar.noReward"), ok: true };
    } catch (e) { return { txt: e.message }; }
  }
  function arcEnd(title, sub, game) {
    const box = document.createElement("div");
    box.className = "arc-end"; box.innerHTML = `<b>${title}</b><small>${sub}</small><div><button class="btn gold" data-arc="${game}">🔁 ${t("ar.again")}</button><button class="btn" data-arc="home">${t("ar.menu")}</button></div>`;
    $("arcStage").appendChild(box);
    setTimeout(() => Pi.maybeInterstitial(), 1200);
  }
  // 🧠 Oasis memory: find the 8 pairs in as few moves as possible
  function arcMemory() {
    arcGame = "memory";
    const icons = ["🐪", "🌴", "🦊", "🏺", "🌙", "⭐", "💎", "🍉"];
    const deck = [...icons, ...icons].map((x) => ({ x, r: Math.random() })).sort((a, b) => a.r - b.r).map((o) => o.x);
    let open = [], found = 0, moves = 0, lock = false; const t0 = Date.now();
    $("arcade").innerHTML = `<header class="jm-head"><button class="jm-back" data-arc="home">‹ ${t("ar.menu")}</button><b>🧠 ${t("ar.memory.t")}</b><span class="arc-score" id="arcScore">0</span></header>
      <div class="jm-body"><div id="arcStage" class="arc-stage"><div class="mem-grid">${deck.map((x, i) => `<button class="mem" data-mem="${i}"><span>${x}</span></button>`).join("")}</div>
      <p class="arc-tip">${t("ar.memory.tip")}</p></div></div>`;
    $("arcade").querySelector(".mem-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mem]");
      if (!b || lock || b.classList.contains("up") || b.classList.contains("ok")) return;
      b.classList.add("up"); open.push(b);
      if (open.length < 2) return;
      moves++; $("arcScore").textContent = t("ar.movesN", { n: moves });
      const [a, c] = open; open = [];
      if (deck[a.dataset.mem] === deck[c.dataset.mem]) {
        a.classList.add("ok"); c.classList.add("ok"); found++;
        if (found === AR.memory.pairs) {
          const ms = Date.now() - t0;
          arcClaim("memory", moves, ms).then((r) => arcEnd("🎉 " + t("ar.memory.done", { n: moves }), r.txt, "memory"));
        }
      } else { lock = true; setTimeout(() => { a.classList.remove("up"); c.classList.remove("up"); lock = false; }, 700); }
    });
  }
  // 🧺 Date catcher: move the basket, catch dates (+1) and gold coins (+5), avoid scorpions (−3)
  function arcCatcher() {
    arcGame = "catcher";
    $("arcade").innerHTML = `<header class="jm-head"><button class="jm-back" data-arc="home">‹ ${t("ar.menu")}</button><b>🧺 ${t("ar.catcher.t")}</b><span class="arc-score" id="arcScore">0</span></header>
      <div class="jm-body"><div id="arcStage" class="arc-stage"><canvas id="arcCv" width="340" height="460"></canvas>
      <div class="arc-bar"><i id="arcTime"></i></div><p class="arc-tip">${t("ar.catcher.tip")}</p></div></div>`;
    const cv = $("arcCv"), cx = cv.getContext("2d"), W = cv.width, H = cv.height;
    let bx = W / 2, score = 0, items = [], last = performance.now(), spawn = 0, live = true; const t0 = Date.now();
    const move = (clientX) => { const r = cv.getBoundingClientRect(); bx = Math.max(30, Math.min(W - 30, ((clientX - r.left) / r.width) * W)); };
    cv.addEventListener("pointerdown", (e) => move(e.clientX)); cv.addEventListener("pointermove", (e) => move(e.clientX));
    cv.addEventListener("touchmove", (e) => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
    const KINDS = [{ e: "🌴", v: 1, p: 0.7 }, { e: "🪙", v: 5, p: 0.12 }, { e: "🦂", v: -3, p: 0.18 }];
    function frame(now) {
      if (!live) return;
      const dt = Math.min(50, now - last); last = now; const el = Date.now() - t0, left = AR.catcher.ms - el;
      spawn -= dt;
      if (spawn <= 0) { let r = Math.random(), k = KINDS[0]; for (const x of KINDS) { if (r < x.p) { k = x; break; } r -= x.p; } items.push({ k, x: 20 + Math.random() * (W - 40), y: -20, s: 0.12 + Math.random() * 0.08 + el / 300000 }); spawn = 520 - Math.min(300, el / 100); }
      cx.clearRect(0, 0, W, H);
      const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#7fd0f0"); g.addColorStop(1, "#f3d28f"); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.font = "30px serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
      items = items.filter((it) => {
        it.y += it.s * dt;
        if (it.y > H - 52 && it.y < H - 20 && Math.abs(it.x - bx) < 36) { score = Math.max(0, score + it.k.v); $("arcScore").textContent = score; return false; }
        if (it.y > H + 20) return false;
        cx.fillText(it.k.e, it.x, it.y); return true;
      });
      cx.font = "44px serif"; cx.fillText("🧺", bx, H - 34);
      $("arcTime").style.width = Math.max(0, (100 * left) / AR.catcher.ms) + "%";
      if (left <= 0) {
        live = false;
        arcClaim("catcher", Math.min(score, AR.catcher.maxScore), Date.now() - t0).then((r) => arcEnd("⏱️ " + t("ar.catcher.done", { n: score }), r.txt, "catcher"));
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    arcStop = () => { live = false; };
  }
  $("arcOpen").addEventListener("click", () => { $("arcade").classList.remove("hidden"); arcHome(); arcLoad(); });
  $("arcade").addEventListener("click", (e) => {
    const b = e.target.closest("[data-arc]");
    if (!b) return;
    const a = b.dataset.arc;
    if (a === "close") { if (arcStop) arcStop(); return $("arcade").classList.add("hidden"); }
    if (a === "home") return arcHome();
    if (a === "share") { const x = piShare(); const text = t("fut.shareText", { link: x.link, host: x.host }); if (navigator.share) return navigator.share({ text }).catch(() => {}); return navigator.clipboard?.writeText(text).then(() => toast(t("t.copied")), () => {}); }
    if (arcStop) { arcStop(); arcStop = null; }
    if (a === "memory") arcMemory(); else if (a === "catcher") arcCatcher();
  });

  // ---------- 📣 Business showcase: Pi businesses pay to be shown (reviewed by the owner) ----------
  const SP = L.SPONSOR;
  let bizData = null, bizAdmin = null;
  const spCard = (x, small) => `<div class="sp-card${small ? " sp-small" : ""}"><span class="sp-ico">${esc(x.emoji)}</span><span class="sp-txt"><small class="sp-tag">${t("biz.sponsored")} · ${t("biz.cat." + x.cat)}</small><b>${esc(x.name)}</b><small>${esc(x.descr)}</small></span>
    ${x.link ? `<button class="btn small gold" data-sp="${x.id}" data-link="${esc(x.link)}">${t("biz.visit")}</button>` : ""}</div>`;
  function renderStrip() {
    const live = bizData && bizData.live;
    $("spStrip").classList.toggle("hidden", !live || !live.length);
    if (live && live.length) $("spStrip").innerHTML = spCard(live[Math.floor(Date.now() / 20000) % live.length], true);
  }
  async function bizLoad() { try { bizData = await Pi.sponsors(); } catch (e) {} renderStrip(); if (!$("biz").classList.contains("hidden")) renderBiz(); }
  function renderBiz() {
    const d = bizData || { live: [], mine: [], plans: SP.PLANS, cats: SP.CATS };
    const st = (x) => t("biz.st." + x.status) + (x.status === "live" ? " · " + t("biz.until", { d: new Date(x.ends_at).toLocaleDateString() }) : "") + (x.note ? " · " + esc(x.note) : "");
    $("biz").innerHTML = `<header class="jm-head"><button class="jm-back" data-biz="close">‹ ${t("jm.back")}</button><b>📣 ${t("biz.t")}</b><span></span></header>
      <div class="jm-body">
        <p class="arc-intro">${t("biz.intro")}</p>
        ${d.live.length ? d.live.map((x) => spCard(x)).join("") : `<p class="jm-note">${t("biz.empty")}</p>`}
        <details class="biz-form" ${d.live.length ? "" : "open"}><summary>➕ ${t("biz.add")}</summary>
          <label>${t("biz.f.name")}<input id="bzName" maxlength="${SP.NAME}"></label>
          <label>${t("biz.f.desc")}<textarea id="bzDesc" maxlength="${SP.DESC}" rows="3"></textarea></label>
          <label>${t("biz.f.link")}<input id="bzLink" dir="ltr" placeholder="https://… / pi://…"></label>
          <div class="biz-row"><label>${t("biz.f.emoji")}<input id="bzEmoji" maxlength="4" value="🏪"></label>
            <label>${t("biz.f.cat")}<select id="bzCat">${d.cats.map((c) => `<option value="${c}">${t("biz.cat." + c)}</option>`).join("")}</select></label></div>
          <div class="biz-plans">${d.plans.map((p, i) => `<label class="biz-plan"><input type="radio" name="bzPlan" value="${p.id}" ${i === 1 ? "checked" : ""}><b dir="ltr">${p.price} π</b><small>${t("biz.days", { n: p.days })}</small></label>`).join("")}</div>
          <small class="biz-rules">${t("biz.rules")}</small>
          <button class="btn gold" data-biz="pay">${t("biz.pay")}</button></details>
        ${d.mine.length ? `<h4>${t("biz.mine")}</h4>` + d.mine.map((x) => `<div class="biz-mine"><b>${esc(x.emoji)} ${esc(x.name)}</b><small>${st(x)}</small><small dir="ltr">👁 ${x.views} · 👆 ${x.clicks}</small></div>`).join("") : ""}
        ${account && account.isAdmin ? `<div class="jm-top"><b>🛡️ ${t("biz.review")}</b><button class="jm-back" data-biz="adm">${t("jm.recheck")}</button>${bizAdmin ? bizAdmin.list.map((x) => `<div class="biz-adm"><span><b>${esc(x.emoji)} ${esc(x.name)}</b> <small>@${esc(x.username || "?")} · ${x.pi} π · ${t("biz.days", { n: x.days })} · ${t("biz.st." + x.status)}</small><small>${esc(x.descr)}</small><small dir="ltr">${esc(x.link || "")}</small></span>
          ${x.status === "review" ? `<button class="btn small gold" data-biz="ok" data-id="${x.id}">✅</button><button class="btn small secondary" data-biz="no" data-id="${x.id}">❌</button>` : `<button class="btn small secondary" data-biz="stop" data-id="${x.id}">⏹</button>`}</div>`).join("") || `<small>—</small>` : ""}</div>` : ""}
      </div>`;
  }
  async function openLink(id, link) {
    Pi.sponsorClick(id);
    if (!/^(https:\/\/|pi:\/\/)/i.test(link)) return;
    if (confirm(t("biz.leave", { u: link }))) window.open(link, "_blank", "noopener");
  }
  $("spStrip").addEventListener("click", (e) => { const b = e.target.closest("[data-sp]"); if (b) openLink(Number(b.dataset.sp), b.dataset.link); });
  $("bizOpen").addEventListener("click", () => { $("biz").classList.remove("hidden"); renderBiz(); bizLoad(); });
  $("biz").addEventListener("click", async (e) => {
    const sp = e.target.closest("[data-sp]");
    if (sp) return openLink(Number(sp.dataset.sp), sp.dataset.link);
    const b = e.target.closest("[data-biz]");
    if (!b) return;
    const a = b.dataset.biz;
    if (a === "close") return $("biz").classList.add("hidden");
    if (!account) return toast(t("t.loginFirst"));
    try {
      if (a === "pay") {
        b.disabled = true;
        const plan = (document.querySelector("input[name=bzPlan]:checked") || {}).value;
        const dr = await Pi.sponsorDraft({ name: $("bzName").value, descr: $("bzDesc").value, link: $("bzLink").value.trim(), emoji: $("bzEmoji").value, cat: $("bzCat").value, plan });
        await Pi.buySponsor(dr.id, dr.plan);
        toast(t("biz.paid"));
      } else if (a === "adm") {
        bizAdmin = await Pi.sponsorAdmin("list");
      } else if (a === "ok" || a === "no" || a === "stop") {
        const note = a === "no" ? prompt(t("biz.why")) || "" : "";
        bizAdmin = await Pi.sponsorAdmin(a === "ok" ? "approve" : a === "no" ? "reject" : "stop", Number(b.dataset.id), note);
      }
    } catch (err) { toast(err.message); }
    b.disabled = false;
    await bizLoad();
  });
  bizLoad();

  async function loadMk() { try { mkData = await Pi.mk(); } catch (e) { mkData = null; toast(e.message); } if (funPage === "mk") renderMk(); }
  $("wheelOpen").addEventListener("click", () => { funPage = "wheel"; renderWheel(); $("fun").classList.remove("hidden"); });
  $("mkOpen").addEventListener("click", () => {
    if (!account) return toast(t("t.loginFirst"));
    funPage = "mk"; mkData = null; renderMk(); $("fun").classList.remove("hidden"); loadMk();
  });
  $("funCard").addEventListener("input", () => {
    if (funPage !== "mk" || !mkData || !$("mkPi")) return;
    const pi = Number($("mkPi").value);
    $("mkHint").textContent = pi > 0 ? t("mk.youGet", { n: fmtN(+(pi * (1 - mkData.tax)).toFixed(4)), tax: Math.round(mkData.tax * 100) })
      : t("mk.have", { d: fmtN(S.dates), c: fmtN(Math.floor((S.kombat && S.kombat.coins) || 0)) });
  });
  $("funCard").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || whBusy) return;
    if (!account) return toast(t("t.loginFirst"));
    try {
      if (b.id === "whSpin") {
        whBusy = true; b.disabled = true;
        const r = await Pi.wheelSpin();
        const seg = 360 / W.PRIZES.length;
        whRot = Math.ceil(whRot / 360) * 360 + 360 * 5 + ((360 - r.i * seg) % 360);
        const disc = $("whDisc"); disc.style.transition = "transform 4.2s cubic-bezier(.12,.72,.1,1)"; disc.style.transform = `rotate(${whRot}deg)`;
        await new Promise((res) => setTimeout(res, 4400));
        whBusy = false; account = r.account; S = r.state; render();
        if (funPage === "wheel") { renderWheel(); $("whMsg").textContent = t("wh.won." + r.prize.t, { n: fmtN(r.prize.n) }); }
      } else if (b.id === "whBuy") {
        b.disabled = true;
        const r = await Pi.buySpins();
        if (r.account) account = r.account; if (r.state) S = r.state;
        toast(t("wh.bought", { n: W.SPINS })); render(); renderWheel();
      } else if (b.id === "mkSell") {
        b.disabled = true;
        const r = await Pi.mkOffer({ kind: $("mkKind").value, amount: Number($("mkAmt").value), pi: Number($("mkPi").value) });
        S = r.state; render(); toast(t("mk.listed")); await loadMk();
      } else if (b.dataset.mkcancel) {
        b.disabled = true;
        const r = await Pi.mkCancel(Number(b.dataset.mkcancel));
        S = r.state; render(); toast(t("mk.cancelled")); await loadMk();
      } else if (b.dataset.mkbuy) {
        b.disabled = true;
        const o = mkData.offers.find((x) => x.id === Number(b.dataset.mkbuy));
        const r = await Pi.buyMk(o);
        if (r.account) account = r.account; if (r.state) S = r.state;
        render(); toast(t("mk.bought")); await loadMk();
      } else if (b.id === "mkWd") {
        b.disabled = true;
        const r = await Pi.mkWithdraw();
        account = r.account; render(); toast(t("mk.wdOk", { n: r.amount })); await loadMk();
      }
    } catch (err) { whBusy = false; toast(err.message); if (funPage === "mk") loadMk(); else if (funPage === "wheel") renderWheel(); }
  });

  // ---------- Sign in ----------
  // Links from Pi notifications: /?go=rank | vip | derby | quests | earn | kombat | market | farm
  let goDone = false;
  function goFromLink() {
    if (goDone) return; goDone = true;
    const go = new URLSearchParams(location.search).get("go");
    const tabs = { farm: "farm", rank: "rank", vip: "vip" }, opens = { services: "svcOpen", jry: "jryOpen", derby: "derbyOpen", quests: "qOpen", earn: "earnOpen", kombat: "kombatOpen", market: "mkOpen" };
    if (tabs[go]) document.querySelector(`.tabs [data-tab="${tabs[go]}"]`).click();
    else if (opens[go]) setTimeout(() => $(opens[go]).click(), 300);
  }
  async function signIn(silent) {
    if (!silent) $("loginBtn").disabled = true;
    try {
      const res = await Pi.login();
      clockOffset = res.now - Date.now();
      account = res.account;
      document.getElementById("piGate")?.remove(); // signed in, so this is Pi Browser
      setTimeout(goFromLink, 400);
      setTimeout(renderShare, 0);
      setTimeout(() => { rcLoad(); supLoad(); }, 0);
      publicUrl = res.publicUrl || "";
      if (res.via === "appstudio" && !res.canBuy) enterOldApp(); // purchases only work in the official app until its key is set
      S = res.state; // the server's game replaces the guest demo
      $("userLabel").removeAttribute("data-i18n");
      $("userLabel").textContent = t("welcome", { name: account.username });
      $("loginBtn").classList.add("hidden");
      render();
      qLoad();
      if (account.isAdmin) { $("jdAdmin").classList.remove("hidden"); jdPreview(); jdStats(); }
      if (account.isAdmin) { $("codeAdmin").classList.remove("hidden"); codeAdmin({ action: "list" }); partners("list"); partnerRequests("list"); loadPlayers(); loadAirdrop(); if (account.jryOn) token("status"); }
      if (account.testGifts) testGifts("list");
      // Mainnet: once, say that the Testnet progress came along
      if (S.fromTestnet && Date.now() - S.fromTestnet < 7 * 864e5) {
        let seen = false;
        try { seen = localStorage.getItem("oasis.carried") === String(S.fromTestnet); localStorage.setItem("oasis.carried", String(S.fromTestnet)); } catch (e) {}
        if (!seen) setTimeout(() => toast(t("t.carried")), 1200);
      }
    } catch (e) {
      if (!silent) toast(e.message === "timeout" ? t("t.openInPi") : e.message);
    } finally { $("loginBtn").disabled = false; }
  }
  $("loginBtn").addEventListener("click", () => signIn(false));
  // Inside Pi Browser, sign in automatically on load
  if (window.Pi) signIn(true);

  // ---------- Opened from WhatsApp/Telegram in Chrome or Safari: send the visitor to Pi Browser ----------
  // Shared links are https (so they can be tapped in chats); this page opens them in Pi Browser.
  (function piBrowserGate() {
    const ua = navigator.userAgent || "";
    if (/PiBrowser/i.test(ua) || window.PI_SANDBOX) return; // Pi Browser, or the Pi Sandbox on a computer
    try { if (sessionStorage.getItem("oasis.stay")) return; } catch (e) {}
    const piUrl = "pi://" + location.host + location.pathname + location.search;
    const android = /Android/i.test(ua);
    // Android: open Pi Browser, or its Play Store page if it isn't installed
    const openUrl = android
      ? `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=pi;package=pi.browser;S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=pi.browser")};end`
      : piUrl;
    const d = document.createElement("div");
    d.id = "piGate";
    const ref = new URLSearchParams(location.search).get("ref") || "";
    function draw() {
      const l = window.I18N.lang;
      d.innerHTML = `<div class="pg-card">
        <div class="pg-langs">${[["ar", "العربية"], ["en", "English"], ["fr", "Français"]].map(([k, n]) => `<button type="button" data-pl="${k}" class="${k === l ? "on" : ""}">${n}</button>`).join("")}</div>
        <div class="pg-logo">🌴</div>
        <h2>${esc(t("pg.hello"))}</h2>
        <ul class="pg-pts"><li>${esc(t("pg.b1"))}</li><li>${esc(t("pg.b2"))}</li><li>${esc(t("pg.b3"))}</li></ul>
        <a class="btn gold pg-open" href="${esc(openUrl)}">${esc(t("pg.open"))}</a>
        <a class="btn small pg-learn" href="learn.html?lang=${l}${ref ? "&ref=" + encodeURIComponent(ref) : ""}">📚 ${esc(t("pg.learn"))}</a>
        <p class="hint">${esc(t("pg.manual"))}</p>
        <button class="btn small secondary pg-copy" type="button"><b dir="ltr">${esc(location.host)}</b> · ${esc(t("pg.copy"))}</button>
        <a class="pg-get" href="https://minepi.com" target="_blank" rel="noopener">${esc(t("pg.get"))}</a>
        <button class="pg-stay" type="button">${esc(t("pg.stay"))}</button>
      </div>`;
    }
    draw();
    document.body.appendChild(d);
    document.addEventListener("langchange", () => { if (document.body.contains(d)) draw(); });
    d.addEventListener("click", (e) => {
      const lb = e.target.closest("[data-pl]");
      if (lb) { window.I18N.set(lb.dataset.pl); $("langSelect").value = lb.dataset.pl; return; }
      if (e.target.closest(".pg-copy")) navigator.clipboard?.writeText(location.host + location.search).then(() => toast(t("t.copied")), () => {});
      if (e.target.closest(".pg-stay")) { try { sessionStorage.setItem("oasis.stay", "1"); } catch (er) {} d.remove(); }
    });
  })();

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
    if (tourI >= 0) showTour(tourI);
    if (helpOpen()) renderHelp();
    if (document.querySelector("#tab-rank.active")) renderRank();
    if (account && account.isAdmin) { partners("list"); partnerRequests("list"); loadPlayers(); loadAirdrop(); if (account.jryOn) token("status"); }
    if (account && account.testGifts) testGifts("list");
  });

  // ---------- Daily missions ----------
  const M_ICON = { harvest: "🌾", plant: "🌱", deliver: "📦", craft: "🥖", stake: "🏺", collect: "🐪" };
  function renderMissions() {
    const m = S.missions;
    const nextBonus = Math.min(m.streak + 1, L.STREAK.MAX) * L.STREAK.BONUS;
    $("missions").innerHTML =
      `<div class="mhead"><span>${t("mission.title")}</span><span class="streak">${m.streak ? t("mission.streak", { n: m.streak }) : ""}</span></div>` +
      m.list.map((x, i) => {
        const ready = x.p >= x.n && !x.c;
        return `<div class="mission"><span class="mi">${M_ICON[x.k]}</span>
          <div class="mt"><b>${esc(t("mission." + x.k, { n: x.n }))}</b><div class="mbar"><i style="width:${(x.p / x.n) * 100}%"></i></div></div>
          <div class="mr">🪙 ${x.r}<br><small>${x.p}/${x.n}</small></div>
          ${x.c ? `<span class="chip-ok">${t("mission.claimed")}</span>` : `<button class="btn small ${ready ? "gold" : ""}" data-mission="${i}" ${ready ? "" : "disabled"}>${t("mission.claim")}</button>`}</div>`;
      }).join("") + (m.done ? "" : `<p class="hint" style="margin:8px 0 0">${t("mission.bonus", { n: nextBonus })}</p>`);
  }
  $("missions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mission]");
    if (b && !b.disabled) act({ type: "mission", index: +b.dataset.mission });
  });

  // Red dots on the tabs: something is waiting for you there
  function renderBadges() {
    const n = now(), c = S.city;
    const set = (tab, on) => { const d = document.querySelector(`.tabs [data-tab="${tab}"] .dot`); if (d) d.classList.toggle("hidden", !on); };
    set("farm", S.plots.some((p) => p && L.readyAt(p) <= n) || S.missions.list.some((x) => x.p >= x.n && !x.c));
    set("camels", S.animals.some((a) => L.animalReady(a, n) >= 10));
    set("city", c.tiles.some((x) => x && x.job && x.job.end <= n) || L.taxPending(c, n) >= 1 ||
      c.orders.some((o) => o.need && Object.keys(o.need).every((g) => (c.goods[g] || 0) >= o.need[g])));
    set("stake", S.stakes.some((s) => s.end <= n));
    set("vip", S.lastDaily !== L.dayId(n));
  }

  // Small celebration (level up, streak bonus…)
  function burst() {
    const list = ["🎉", "✨", "🪙", "⭐", "🌴"];
    for (let i = 0; i < 22; i++) {
      const el = document.createElement("div");
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 140;
      el.className = "confetti";
      el.textContent = list[i % list.length];
      el.style.setProperty("--dx", Math.cos(a) * d + "px");
      el.style.setProperty("--dy", Math.sin(a) * d - 40 + "px");
      el.style.setProperty("--rot", Math.random() * 540 - 270 + "deg");
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    }
  }

  // ---------- Guide: first-time tour + help center ----------
  const TOUR = [null, "farm", "camels", "city", "stake", "rank", "vip", null];
  const HELP = ["basics", "farm", "camels", "city", "granary", "events", "shop", "ranking", "club", "referral", "missions",
    "kombat", "kfun", "kboss", "kleague", "kcollect", "ktribes", "kjry", "kp2p", "earn", "quests", "derby", "arcade", "showcase", "pmarket", "wheel", "kvote", "kairdrop", "safety", "faq"];
  const KOMBAT_HELP = HELP.filter((k) => k[0] === "k");
  let tourI = -1;
  const goTab = (tab) => document.querySelector(`.tabs [data-tab="${tab}"]`).click();
  function showTour(i) {
    tourI = i;
    const tab = TOUR[i];
    if (tab) goTab(tab);
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("ring", !!tab && b.dataset.tab === tab));
    const last = i === TOUR.length - 1;
    $("tour").classList.remove("hidden");
    $("tour").innerHTML = `<div class="tour-dots">${TOUR.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <h3>${t(`tour.s${i + 1}.t`)}</h3><p>${t(`tour.s${i + 1}.d`)}</p>
      <div class="tour-actions">${i > 0 ? `<button class="btn secondary small" data-tour="back">${t("tour.back")}</button>` : ""}
        <button class="btn ${last ? "gold" : ""}" data-tour="next">${last ? t("tour.finish") : t("tour.next")}</button>
        ${last ? "" : `<button class="skip" data-tour="skip">${t("tour.skip")}</button>`}</div>`;
  }
  function endTour() {
    tourI = -1;
    $("tour").classList.add("hidden");
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("ring"));
    try { localStorage.setItem("oasis_tour", "1"); } catch {}
    goTab("farm");
  }
  $("tour").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]");
    if (!b) return;
    if (b.dataset.tour === "skip") return endTour();
    if (b.dataset.tour === "back") return showTour(tourI - 1);
    if (tourI >= TOUR.length - 1) return endTour();
    showTour(tourI + 1);
  });
  // kombat = true: only the Jerry Kombat sections, first one open
  function renderHelp(kombat) {
    const list = kombat ? KOMBAT_HELP : HELP;
    $("helpCard").innerHTML = `<div class="grab"></div><h3>${t(kombat ? "help.ktitle" : "help.title")}</h3><p class="hint">${t(kombat ? "help.kintro" : "help.intro")}</p>` +
      list.map((k, i) => `<details class="hsec" ${i === 0 ? "open" : ""}><summary>${t(`help.${k}.t`)}</summary><p>${t(`help.${k}.d`)}</p></details>`).join("") +
      `<button class="btn" data-replay style="margin-top:10px">${t("help.replay")}</button>
       <button class="btn secondary" data-close style="margin-top:8px">${t("help.close")}</button>`;
  }
  const helpOpen = () => !$("help").classList.contains("hidden");
  function openHelp(kombat) { renderHelp(kombat === true); $("help").classList.remove("hidden"); }
  const closeHelp = () => $("help").classList.add("hidden");
  $("helpBtn").addEventListener("click", () => openHelp(false));
  $("helpBg").addEventListener("click", closeHelp);
  $("helpCard").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.close !== undefined) closeHelp();
    if (b.dataset.replay !== undefined) { closeHelp(); showTour(0); }
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
    qBadge();
    renderLevelPacks();
    renderSupporters();
    if (typeof rcData !== "undefined") renderRoyal();
    S = L.normalize(S, now());
    $("dates").textContent = S.dates.toLocaleString("en-US");
    if (account) Pi.setPayOpen(account.payOpen);
    $("payBanner").classList.toggle("hidden", !account || account.payOpen !== false);
    renderFarm(); renderStakes(); renderClub(); renderCamels(); renderCity(); renderMissions(); renderBadges(); renderFunBadges();
    if (jmOpen && !jmBusy) renderMedia();
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
  const OFFICIAL = "oasisgame6033";
  const parents = [location.hostname, document.referrer, ...(location.ancestorOrigins ? [...location.ancestorOrigins] : [])].join(" ");
  let officialHref = "https://oasisgame6033.pinet.com";
  let stayedOld = false;
  try { stayedOld = localStorage.getItem("oasis_stay_old") === "1"; } catch {}
  function enterOldApp() {
    if (oldApp || parents.includes(OFFICIAL)) return;
    oldApp = true;
    const url = new URL($("gateLink").href);
    const r = new URLSearchParams(location.search).get("ref");
    if (r) url.searchParams.set("ref", r);
    officialHref = $("gateLink").href = $("movedLink").href = url.href;
    $("movedBar").classList.remove("hidden");
    if (!stayedOld) $("gate").classList.remove("hidden"); // players who chose to stay aren't asked again
    render();
    if (stayedOld) return;
    // Browsers only let an embedded page change the address after a tap, but try anyway
    try { window.top.location.href = url.href; } catch {}
  }
  $("gateStay").addEventListener("click", () => {
    $("gate").classList.add("hidden");
    try { localStorage.setItem("oasis_stay_old", "1"); } catch {}
  });

  // Bridge for the Jerry Kombat page (kombat.js)
  // ---------- 💠 JRY token page: what JRY is, the plan for a Pi token, how to earn it now ----------
  const JRY_SUPPLY = 10000000000000; // planned total supply of the future token: 10 trillion
  function renderJryPage() {
    const steps = [["done", "jt.s1"], ["done", "jt.s2"], ["now", "jt.s3"], ["next", "jt.s4"], ["next", "jt.s5"]];
    $("jrypage").innerHTML = `<header class="jm-head"><button class="jm-back" data-jt="close">‹ ${t("jm.back")}</button><b>💠 Jerry <span>Token</span></b><span></span></header>
      <div class="jm-body">
        <div class="jt-hero"><div class="jt-coin">JRY</div><b>Jerry Token</b><small>${t("jt.by")}</small>
          <div class="jt-supply"><small>${t("jt.supply")}</small><b dir="ltr">${fmtN(JRY_SUPPLY)}</b><small>${t("jt.supplyW")}</small></div></div>
        <div class="jt-status">📝 ${t("jt.status")}</div>
        <h4>🗺️ ${t("jt.road")}</h4>
        <div class="jt-steps">${steps.map(([s, k], i) => `<div class="jt-step ${s}"><i>${s === "done" ? "✓" : i + 1}</i><span><b>${t(k)}</b><small>${t(k + ".d")}</small></span></div>`).join("")}</div>
        <h4>🎮 ${t("jt.earn")}</h4>
        <div class="jm-top">${account ? `<div><span>${t("jt.mine")}</span><b dir="ltr">💠 ${fmtN(account.jryPts || 0)}</b></div>` : ""}
          ${["jt.e1", "jt.e2", "jt.e3", "jt.e4", "jt.e5"].map((k) => `<div><span>${t(k)}</span></div>`).join("")}</div>
        <h4>🦊 ${t("jt.early")}</h4>
        <div class="jt-box">${t("jt.early.d")}</div>
        <h4>🛡️ ${t("jt.safe")}</h4>
        <div class="jt-box jt-warn">${t("jt.safe.d")}</div>
        <p class="jm-note">${t("jt.note")}</p>
      </div>`;
  }
  $("jryOpen").addEventListener("click", () => { $("jrypage").classList.remove("hidden"); renderJryPage(); });
  $("jrypage").addEventListener("click", (e) => { const b = e.target.closest("[data-jt]"); if (b && b.dataset.jt === "close") $("jrypage").classList.add("hidden"); });
  document.addEventListener("langchange", () => { if (!$("jrypage").classList.contains("hidden")) renderJryPage(); });

  // 📚 Videos & guide page, and share buttons for the invite link
  function learnHref() { return "learn.html?lang=" + window.I18N.lang + (account ? "&ref=" + encodeURIComponent(account.username) : ""); }
  function renderShare() {
    $("learnBar").href = learnHref();
    if (!account || !window.JShare) { $("refShare").innerHTML = ""; return; }
    window.JShare.bar($("refShare"), { url: G_refLink(), text: t("share.text"), labels: { copy: t("js.copy"), copied: t("js.copied"), more: t("js.more") } });
  }
  const G_refLink = () => `${publicUrl || location.origin + location.pathname}?ref=${encodeURIComponent(account.username)}`;
  document.addEventListener("langchange", renderShare);

  // ---------- 🛠️ Jerry Development services: we build Pi apps for clients ----------
  const SV = L.SERVICES;
  let svData = null, svAdmin = null;
  function renderServices() {
    const d = svData || { packs: SV.PACKS, mine: [] };
    const st = (s) => t("svc.st." + s);
    $("services").innerHTML = `<header class="jm-head"><button class="jm-back" data-sv="close">‹ ${t("jm.back")}</button><b>🛠️ Jerry <span>Development</span></b><span></span></header>
      <div class="jm-body">
        <p class="arc-intro"><b>${t("svc.title")}</b><br>${t("svc.intro")}</p>
        <div class="sv-proof"><b>🌴 ${t("svc.proof")}</b><small>${t("svc.proofD")}</small></div>
        <h4>📦 ${t("svc.packs")}</h4>
        ${d.packs.map((k) => `<div class="sv-pack"><i>${k.e}</i><span><b>${t("svc.p." + k.id)}</b><small>${t("svc.p." + k.id + ".d")}</small>
          <em>${t(k.monthly ? "svc.fromM" : "svc.from", { n: fmtN(k.from) })}${k.weeks ? " · " + t("svc.weeks", { n: k.weeks }) : ""}</em></span></div>`).join("")}
        <h4>🧭 ${t("svc.how")}</h4>
        <div class="jm-how">${[1, 2, 3, 4].map((i) => `<div><i>${i}</i><span>${t("svc.h" + i)}</span></div>`).join("")}</div>
        <h4>✉️ ${t("svc.form")}</h4>
        ${account ? `<div class="biz-form sv-form">
          <label>${t("svc.f.pkg")}<select id="svPkg">${d.packs.map((k) => `<option value="${k.id}">${k.e} ${t("svc.p." + k.id)}</option>`).join("")}</select></label>
          <label>${t("svc.f.name")}<input id="svName" maxlength="${SV.NAME}"></label>
          <label>${t("svc.f.idea")}<textarea id="svIdea" rows="4" maxlength="${SV.IDEA}" placeholder="${t("svc.f.ideaPh")}"></textarea></label>
          <label>${t("svc.f.budget")}<input id="svBudget" maxlength="${SV.BUDGET}" placeholder="${t("svc.f.budgetPh")}"></label>
          <label>${t("svc.f.contact")}<input id="svContact" maxlength="${SV.CONTACT}" placeholder="${t("svc.f.contactPh")}"></label>
          <small class="biz-rules">${t("svc.f.hint")}</small>
          <button class="btn gold" data-sv="send">${t("svc.send")}</button></div>` : `<p class="jm-note">${t("t.loginFirst")}</p>`}
        ${d.mine.length ? `<h4>📋 ${t("svc.mine")}</h4>` + d.mine.map((x) => `<div class="biz-mine"><b>${(SV.PACKS.find((k) => k.id === x.pkg) || {}).e || ""} ${t("svc.p." + x.pkg)} · #${x.id}</b><small>${st(x.status)} · ${new Date(x.at).toLocaleDateString()}</small>${x.note ? `<small>💬 ${esc(x.note)}</small>` : ""}</div>`).join("") : ""}
        <div class="jt-box sv-note">🛡️ ${t("svc.note")}</div>
        ${account && account.isAdmin ? `<div class="jm-top"><b>🛡️ ${t("svc.admin")}</b><button class="jm-back" data-sv="adm">${t("jm.recheck")}</button>
          ${svAdmin ? (svAdmin.list.length ? svAdmin.list.map((x) => `<div class="biz-adm sv-adm"><span><b>#${x.id} · ${(SV.PACKS.find((k) => k.id === x.pkg) || {}).e || ""} ${t("svc.p." + x.pkg)} · ${st(x.status)}</b>
            <small>@${esc(x.username)} · ${esc(x.name)} · ${new Date(x.at).toLocaleString()}</small><small class="sv-idea">${esc(x.idea)}</small>
            ${x.budget ? `<small>💰 ${esc(x.budget)}</small>` : ""}${x.contact ? `<small dir="auto">📞 ${esc(x.contact)}</small>` : ""}${x.note ? `<small>💬 ${esc(x.note)}</small>` : ""}</span>
            <span class="sv-btns">${SV.STATUS.filter((s) => s !== "new").map((s) => `<button class="btn small ${s === x.status ? "gold" : "secondary"}" data-sv="st" data-id="${x.id}" data-st="${s}">${st(s)}</button>`).join("")}</span></div>`).join("") : `<small>—</small>`) : ""}</div>` : ""}
      </div>`;
  }
  async function svLoad() { try { svData = await Pi.svc(); } catch (e) {} if (!$("services").classList.contains("hidden")) renderServices(); }
  $("svcOpen").addEventListener("click", () => { $("services").classList.remove("hidden"); renderServices(); svLoad(); if (account && account.isAdmin && !svAdmin) Pi.adminSvc({ action: "list" }).then((d) => { svAdmin = d; renderServices(); }, () => {}); });
  $("services").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sv]");
    if (!b) return;
    const a = b.dataset.sv;
    if (a === "close") return $("services").classList.add("hidden");
    if (!account) return toast(t("t.loginFirst"));
    b.disabled = true;
    try {
      if (a === "send") {
        await Pi.svcRequest({ pkg: $("svPkg").value, name: $("svName").value, idea: $("svIdea").value, budget: $("svBudget").value, contact: $("svContact").value });
        toast(t("svc.sent")); await svLoad();
      } else if (a === "adm") svAdmin = await Pi.adminSvc({ action: "list" });
      else if (a === "st") {
        const note = prompt(t("svc.noteAsk")) || "";
        svAdmin = await Pi.adminSvc({ action: "status", id: Number(b.dataset.id), status: b.dataset.st, note });
      }
    } catch (err) { toast(err.message); }
    b.disabled = false; renderServices();
  });
  document.addEventListener("langchange", () => { if (!$("services").classList.contains("hidden")) renderServices(); });

  // Activities grid: gift code and invite tiles jump to their place in the Club tab
  const toClub = (sel) => { document.querySelector('.tabs [data-tab="vip"]').click(); setTimeout(() => { const e = document.querySelector(sel); e && e.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80); };
  $("codeTile").addEventListener("click", () => toClub(".code-box"));
  $("inviteTile").addEventListener("click", () => toClub("#refLink"));

  // Testnet game: point players to the real game on Mainnet (their progress moves with them)
  if (/^(pi-oasis\.|oasisgame6033\.)/.test(location.hostname)) $("mainnetBar").classList.remove("hidden");

  window.OasisGame = {
    get S() { return S; },
    set S(x) { S = x; },
    get account() { return account; },
    setClock(serverNow) { clockOffset = serverNow - Date.now(); },
    member: () => perks().boost > 0,
    openHelp: () => openHelp(true),
    now, toast, msgText, saveGuest, boost: () => perks().boost + ((account && account.holdBoost) || 0),
    setAccount(a) { account = a; render(); },
    render: () => render(), burst: () => burst(),
    refLink: () => (account ? `${publicUrl || location.origin + location.pathname}?ref=${encodeURIComponent(account.username)}` : ""),
    piLink: () => piShare(),
  };

  window.I18N.apply();
  // First visit: start the guided tour once the screen has settled
  try {
    if (!localStorage.getItem("oasis_tour")) setTimeout(() => { if ($("gate").classList.contains("hidden") && tourI < 0) showTour(0); }, 1400);
  } catch {}
  setSky();
  setInterval(setSky, 60000);
  renderSeeds();
  render();
  setInterval(() => {
    renderFarm(); renderStakes(); renderBadges();
    if (document.querySelector("#tab-camels.active")) renderCamels();
    if (document.querySelector("#tab-city.active")) { renderCity(); maybeCityTick(); }
  }, 1000);
})();
