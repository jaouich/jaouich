// Pi Oasis – منطق اللعبة
(function () {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = "oasis_save_v1";

  const t = (k, v) => window.I18N.t(k, v);
  const SEEDS = [
    { id: "wheat", e: "🌾", cost: 5, time: 30, yield: 12 },
    { id: "mint", e: "🌿", cost: 15, time: 120, yield: 40 },
    { id: "melon", e: "🍉", cost: 40, time: 600, yield: 120 },
    { id: "palm", e: "🌴", cost: 100, time: 3600, yield: 350 },
  ];
  const STAKES = [
    { id: "h1", secs: 3600, rate: 0.05 },
    { id: "d1", secs: 86400, rate: 0.3 },
    { id: "w1", secs: 604800, rate: 1.5, bonus: true },
  ];
  const seedName = (s) => t("seed." + s.id);
  const stakeName = (o) => t("stake." + o.id);
  const PLOTS = 9;
  const FREE_SLOTS = 3, VIP_SLOTS = 10, VIP_BOOST = 0.2, MIN_STAKE = 10;
  const DAILY = 25;

  // ---------- الحالة ----------
  function weekId(t = Date.now()) {
    // السيمانة كتبدا نهار الاثنين 00:00 UTC
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  }
  function fresh() {
    return { dates: 50, plots: Array(PLOTS).fill(null), stakes: [], week: { id: weekId(), score: 0 }, lastDaily: 0, rare: 0, vipUntil: 0 };
  }
  let S;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch { S = fresh(); }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch {} };

  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) try { localStorage.setItem("oasis_ref", ref); } catch {}

  let selectedSeed = SEEDS[0].id;
  let account = null; // معلومات الحساب من السيرفر

  const isVip = () => (account ? account.vipUntil : S.vipUntil) > Date.now();

  function earn(n) {
    S.dates += n;
    if (S.week.id !== weekId()) S.week = { id: weekId(), score: 0 };
    S.week.score += n;
  }

  // ---------- أدوات ----------
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
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

  // ---------- الأرض ----------
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

  function renderFarm() {
    const now = Date.now();
    $("farm").innerHTML = S.plots.map((p, i) => {
      if (!p) return `<button class="plot" data-i="${i}"><span class="t">${t("farm.plant")}</span></button>`;
      const seed = SEEDS.find((s) => s.id === p.seed);
      const left = (p.plantedAt + seed.time * 1000 - now) / 1000;
      if (left <= 0) return `<button class="plot ready" data-i="${i}"><span class="e">${seed.e}</span><span class="t">${t("farm.harvest")}</span></button>`;
      const pct = 100 - (left / seed.time) * 100;
      return `<button class="plot growing" data-i="${i}"><span class="e">🌱</span><span class="t">${fmt(left)}</span><span class="bar" style="width:${pct}%"></span></button>`;
    }).join("");
  }
  $("farm").addEventListener("click", async (e) => {
    const b = e.target.closest(".plot");
    if (!b) return;
    const i = +b.dataset.i, p = S.plots[i];
    if (!p) {
      const seed = SEEDS.find((s) => s.id === selectedSeed);
      if (S.dates < seed.cost) return toast(t("t.notEnough"));
      S.dates -= seed.cost;
      S.plots[i] = { seed: seed.id, plantedAt: Date.now() };
      toast(t("t.planted", { seed: seedName(seed) + " " + seed.e }));
    } else {
      const seed = SEEDS.find((s) => s.id === p.seed);
      const left = (p.plantedAt + seed.time * 1000 - Date.now()) / 1000;
      if (left <= 0) {
        S.plots[i] = null;
        earn(seed.yield);
        toast(`+${seed.yield} 🪙`);
      } else if (!isVip() && window.PiBridge.piAvailable && left > 20) {
        if (confirm(t("t.adConfirm"))) {
          if (await window.PiBridge.showRewardedAd()) { p.plantedAt = 0; toast(t("t.adDone")); }
          else toast(t("t.adFail"));
        }
      } else toast(t("t.left", { t: fmt(left) }));
    }
    save(); render();
  });

  // ---------- المطمورة (ستيكينغ) ----------
  function renderStakeOptions() {
    const boost = isVip() ? ` <small>${t("stake.vipBoost")}</small>` : "";
    $("stakeOptions").innerHTML = `
      <div class="card"><label for="stakeAmt">${t("stake.ask")}</label>
        <input id="stakeAmt" type="number" min="${MIN_STAKE}" step="1" value="${Math.max(MIN_STAKE, Math.floor(S.dates / 2))}" style="width:110px;padding:8px;border-radius:10px;border:1px solid var(--line);font:inherit">
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
    const o = STAKES.find((x) => x.id === b.dataset.stake);
    const amt = Math.floor(+$("stakeAmt").value);
    const slots = isVip() ? VIP_SLOTS : FREE_SLOTS;
    if (!(amt >= MIN_STAKE)) return toast(t("t.minStake", { n: MIN_STAKE }));
    if (amt > S.dates) return toast(t("t.notEnough"));
    if (S.stakes.length >= slots) return toast(isVip() ? t("t.slotsFull") : t("t.slotsFullFree"));
    const profit = Math.floor(amt * o.rate * (isVip() ? 1 + VIP_BOOST : 1));
    S.dates -= amt;
    S.stakes.push({ amt, profit, opt: o.id, end: Date.now() + o.secs * 1000 });
    save(); render();
    toast(t("t.staked", { a: amt, b: amt + profit }));
  });

  function renderStakes() {
    const now = Date.now();
    $("slotInfo").textContent = `(${S.stakes.length}/${isVip() ? VIP_SLOTS : FREE_SLOTS})`;
    if (!S.stakes.length) { $("stakes").innerHTML = `<div class="hint">${t("stake.none")}</div>`; return; }
    $("stakes").innerHTML = S.stakes.map((s, i) => {
      const o = STAKES.find((x) => x.id === s.opt);
      const left = (s.end - now) / 1000;
      const action = left <= 0
        ? `<button class="btn small" data-claim="${i}">${t("stake.claim", { n: s.amt + s.profit })}</button>`
        : `<span class="hint">${fmt(left)}</span>`;
      return `<div><span>🏺 ${s.amt} 🪙 · ${stakeName(o)}</span>${action}</div>`;
    }).join("");
  }
  $("stakes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-claim]");
    if (!b) return;
    const s = S.stakes[+b.dataset.claim];
    if (!s || s.end > Date.now()) return;
    S.stakes.splice(+b.dataset.claim, 1);
    S.dates += s.amt; // الرأس مال ما كيتحسبش فالسكور
    earn(s.profit);
    if (s.opt === "w1") S.rare++;
    save(); render();
    toast(t("t.returned", { n: s.amt + s.profit }));
  });

  // ---------- الترتيب ----------
  async function renderRank() {
    const end = S.week.id + 7 * 86400000;
    $("weekLeft").textContent = fmt((end - Date.now()) / 1000);
    if (!window.PiBridge.loggedIn) {
      $("prizePool").textContent = "—";
      $("leaderboard").innerHTML = `<li class="me"><span>${t("rank.you")}</span><b>${S.week.score} 🪙</b></li>
        <li class="hint">${t("rank.login")}</li>`;
      return;
    }
    try {
      const lb = await window.PiBridge.leaderboard();
      $("prizePool").textContent = lb.prizePool.toFixed(3);
      const me = window.PiBridge.user.username;
      $("leaderboard").innerHTML = lb.top.length
        ? lb.top.map((r, i) => `<li class="${r.username === me ? "me" : ""}"><span>${["🥇", "🥈", "🥉"][i] || i + 1 + "."} ${r.username}</span><b>${r.score} 🪙</b></li>`).join("")
        : `<li class="hint">${t("rank.empty")}</li>`;
    } catch (e) { toast(e.message); }
  }

  // ---------- VIP والإحالة ----------
  function renderVip() {
    const vip = isVip();
    $("vipBadge").classList.toggle("hidden", !vip);
    const until = account ? account.vipUntil : S.vipUntil;
    $("vipStatus").textContent = vip ? t("vip.until", { date: new Date(until).toLocaleDateString(window.I18N.locale) }) : "";
    $("buyVip").textContent = vip ? t("vip.renew") : t("vip.buy");
    const today = new Date().toDateString();
    $("dailyBtn").disabled = new Date(S.lastDaily).toDateString() === today;
    $("dailyBtn").textContent = $("dailyBtn").disabled ? t("daily.done") : t("daily.claim", { n: vip ? DAILY * 2 : DAILY });
    if (account) {
      $("refLink").value = `${location.origin}${location.pathname}?ref=${encodeURIComponent(account.username)}`;
      $("refBalance").textContent = account.referralBalance.toFixed(3);
      $("refCount").textContent = account.referralCount;
    }
  }
  $("dailyBtn").addEventListener("click", () => {
    if (new Date(S.lastDaily).toDateString() === new Date().toDateString()) return;
    S.lastDaily = Date.now();
    const n = isVip() ? DAILY * 2 : DAILY;
    earn(n); save(); render();
    toast(t("t.daily", { n }));
  });
  $("buyVip").addEventListener("click", async () => {
    try {
      const res = await window.PiBridge.buyVip();
      account = res.account;
      toast(t("t.vipOk"));
      render();
    } catch (e) { toast(e.message); }
  });
  $("copyRef").addEventListener("click", () => {
    if (!account) return toast(t("t.loginFirst"));
    navigator.clipboard?.writeText($("refLink").value).then(() => toast(t("t.copied")), () => $("refLink").select());
  });
  $("redeemVip").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    try { account = (await window.PiBridge.redeemVip()).account; toast(t("t.vipAdded")); render(); }
    catch (e) { toast(e.message); }
  });
  $("withdraw").addEventListener("click", async () => {
    if (!account) return toast(t("t.loginFirst"));
    try { const r = await window.PiBridge.withdraw(); account = r.account; toast(t("t.withdrawOk", { n: r.amount })); render(); }
    catch (e) { toast(e.message); }
  });

  // ---------- الدخول ----------
  $("loginBtn").addEventListener("click", async () => {
    $("loginBtn").disabled = true;
    try {
      const res = await window.PiBridge.login();
      account = res.account;
      $("userLabel").removeAttribute("data-i18n");
      $("userLabel").textContent = t("welcome", { name: res.user.username });
      $("loginBtn").classList.add("hidden");
      render(); syncScore(true);
    } catch (e) {
      toast(e.message === "timeout" ? t("t.openInPi") : e.message);
    } finally { $("loginBtn").disabled = false; }
  });

  let lastSent = -1;
  function syncScore(force) {
    if (!window.PiBridge.loggedIn || (!force && S.week.score === lastSent)) return;
    lastSent = S.week.score;
    window.PiBridge.submitScore(S.week.score).catch(() => {});
  }
  setInterval(syncScore, 30000);

  // ---------- التبويبات ----------
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "rank") renderRank();
  });

  function render() {
    if (S.week.id !== weekId()) S.week = { id: weekId(), score: 0 };
    $("dates").textContent = S.dates;
    renderFarm(); renderStakes(); renderVip();
    if (!document.activeElement || document.activeElement.id !== "stakeAmt") renderStakeOptions();
  }
  // Language picker
  const langSel = $("langSelect");
  langSel.value = window.I18N.lang;
  langSel.addEventListener("change", () => window.I18N.set(langSel.value));
  document.addEventListener("langchange", () => {
    if (account) $("userLabel").textContent = t("welcome", { name: account.username });
    renderSeeds(); renderStakeOptions(); render();
    if (document.querySelector("#tab-rank.active")) renderRank();
  });

  window.I18N.apply();
  renderSeeds();
  render();
  setInterval(() => { renderFarm(); renderStakes(); }, 1000);
})();
