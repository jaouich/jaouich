// Pi Oasis – game screen
// Guests (outside Pi Browser) play a local demo. Signed-in players play on the
// server: every action is checked there, so the score can't be faked.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const L = window.OasisLogic;
  const { SEEDS, STAKES, C } = L;
  const SAVE_KEY = "oasis_guest_v1";
  const Pi = window.PiBridge;

  let clockOffset = 0; // server time - phone time
  const now = () => Date.now() + clockOffset;

  let guest;
  try { guest = L.normalize(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"), now()); } catch { guest = L.fresh(now()); }
  let S = guest; // current state shown on screen
  let account = null; // from the server once signed in
  let busy = false;
  let selectedSeed = SEEDS[0].id;

  const saveGuest = () => { if (!account) try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch {} };
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) try { localStorage.setItem("oasis_ref", ref); } catch {}

  const isVip = () => !!account && account.vipUntil > now();
  const seedName = (s) => t("seed." + s.id);
  const stakeName = (o) => t("stake." + o.id);

  function toast(msg) {
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
    return t(m.key, vars);
  }
  const errText = (code, vars) => window.I18N.has("t." + code) ? t("t." + code, vars) : t("e." + code);

  // Runs one action: on the server when signed in, locally for guests.
  async function act(action) {
    if (busy) return;
    if (!account) {
      try {
        const r = L.apply(S, action, { now: now(), vip: false, adVerified: false });
        S = r.s; saveGuest(); render(); toast(msgText(r.msg));
      } catch (e) {
        if (e instanceof L.GameError) toast(errText(e.code, e.vars)); else throw e;
      }
      return;
    }
    busy = true;
    try {
      const r = await Pi.action(action);
      clockOffset = r.now - Date.now();
      S = r.state; render(); toast(msgText(r.msg));
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

  function renderFarm() {
    const n = now();
    $("farm").innerHTML = S.plots.map((p, i) => {
      if (!p) return `<button class="plot" data-i="${i}"><span class="t">${t("farm.plant")}</span></button>`;
      const seed = L.seedById(p.seed);
      const left = (L.readyAt(p) - n) / 1000;
      if (left <= 0) return `<button class="plot ready" data-i="${i}"><span class="e">${seed.e}</span><span class="t">${t("farm.harvest")}</span></button>`;
      const pct = 100 - (left / seed.time) * 100;
      return `<button class="plot growing" data-i="${i}"><span class="e">🌱</span><span class="t">${fmt(left)}</span><span class="bar" style="width:${pct}%"></span></button>`;
    }).join("");
  }
  $("farm").addEventListener("click", async (e) => {
    const b = e.target.closest(".plot");
    if (!b) return;
    const i = +b.dataset.i, p = S.plots[i];
    if (!p) return act({ type: "plant", plot: i, seed: selectedSeed });
    const left = (L.readyAt(p) - now()) / 1000;
    if (left <= 0) return act({ type: "harvest", plot: i });
    // Rewarded ad to finish now (signed-in, non-VIP players)
    if (account && !isVip() && Pi.piAvailable && left > C.AD_MIN_LEFT && confirm(t("t.adConfirm"))) {
      const adId = await Pi.showRewardedAd();
      if (!adId) return toast(t("t.adFail"));
      return act({ type: "speedup", plot: i, adId });
    }
    toast(t("t.left", { t: fmt(left) }));
  });

  // ---------- Granary (staking) ----------
  function renderStakeOptions() {
    const boost = isVip() ? ` <small>${t("stake.vipBoost")}</small>` : "";
    $("stakeOptions").innerHTML = `
      <div class="card"><label for="stakeAmt">${t("stake.ask")}</label>
        <input id="stakeAmt" type="number" min="${C.MIN_STAKE}" step="1" value="${Math.max(C.MIN_STAKE, Math.floor(S.dates / 2))}">
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
    $("slotInfo").textContent = `(${S.stakes.length}/${isVip() ? C.VIP_SLOTS : C.FREE_SLOTS})`;
    if (!S.stakes.length) { $("stakes").innerHTML = `<div class="hint">${t("stake.none")}</div>`; return; }
    $("stakes").innerHTML = S.stakes.map((s, i) => {
      const left = (s.end - n) / 1000;
      const action = left <= 0
        ? `<button class="btn small" data-claim="${i}">${t("stake.claim", { n: s.amt + s.profit })}</button>`
        : `<span class="hint">${fmt(left)}</span>`;
      return `<div><span>🏺 ${s.amt} 🪙 · ${stakeName(L.stakeById(s.opt))}</span>${action}</div>`;
    }).join("");
  }
  $("stakes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-claim]");
    if (b) act({ type: "claim", index: +b.dataset.claim });
  });

  // ---------- Ranking ----------
  async function renderRank() {
    $("weekLeft").textContent = fmt((L.weekId(now()) + 7 * 86400000 - now()) / 1000);
    if (!account) {
      $("prizePool").textContent = "—";
      $("leaderboard").innerHTML = `<li class="me"><span>${t("rank.you")}</span><b>${S.week.score} 🪙</b></li>
        <li class="hint">${t("rank.login")}</li>`;
      return;
    }
    try {
      const lb = await Pi.leaderboard();
      $("prizePool").textContent = (+lb.prizePool).toFixed(3);
      const me = account.username;
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      $("leaderboard").innerHTML = lb.top.length
        ? lb.top.map((r, i) => `<li class="${r.username === me ? "me" : ""}"><span>${["🥇", "🥈", "🥉"][i] || i + 1 + "."} ${esc(r.username)}</span><b>${r.score} 🪙</b></li>`).join("")
        : `<li class="hint">${t("rank.empty")}</li>`;
    } catch (e) { toast(e.message); }
  }

  // ---------- VIP & referrals ----------
  function renderVip() {
    const vip = isVip();
    $("vipBadge").classList.toggle("hidden", !vip);
    $("vipStatus").textContent = vip ? t("vip.until", { date: new Date(account.vipUntil).toLocaleDateString(window.I18N.locale) }) : "";
    $("buyVip").textContent = vip ? t("vip.renew") : t("vip.buy");
    const done = S.lastDaily === L.dayId(now());
    $("dailyBtn").disabled = done;
    $("dailyBtn").textContent = done ? t("daily.done") : t("daily.claim", { n: vip ? C.DAILY * 2 : C.DAILY });
    if (account) {
      const base = window.OASIS_CONFIG.PUBLIC_URL || location.origin + location.pathname;
      $("refLink").value = `${base}?ref=${encodeURIComponent(account.username)}`;
      $("refCode").textContent = account.username;
      $("inviterBox").classList.toggle("hidden", !account.canSetInviter);
      $("invitedBy").classList.toggle("hidden", !account.invitedBy);
      if (account.invitedBy) $("invitedBy").textContent = t("ref.invitedBy", { name: account.invitedBy });
      $("refBalance").textContent = (+account.referralBalance).toFixed(3);
      $("refCount").textContent = account.referralCount;
    }
  }
  $("dailyBtn").addEventListener("click", () => act({ type: "daily" }));
  $("buyVip").addEventListener("click", async () => {
    try {
      const res = await Pi.buyVip();
      account = res.account;
      toast(t("t.vipOk"));
      render();
    } catch (e) { toast(e.message); }
  });
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

  // ---------- Sign in ----------
  async function signIn(silent) {
    if (!silent) $("loginBtn").disabled = true;
    try {
      const res = await Pi.login();
      clockOffset = res.now - Date.now();
      account = res.account;
      S = res.state; // the server's game replaces the guest demo
      $("userLabel").removeAttribute("data-i18n");
      $("userLabel").textContent = t("welcome", { name: account.username });
      $("loginBtn").classList.add("hidden");
      render();
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
    if (b.dataset.tab === "rank") renderRank();
  });
  const langSel = $("langSelect");
  langSel.value = window.I18N.lang;
  langSel.addEventListener("change", () => window.I18N.set(langSel.value));
  document.addEventListener("langchange", () => {
    if (account) $("userLabel").textContent = t("welcome", { name: account.username });
    renderSeeds(); renderStakeOptions(); render();
    if (document.querySelector("#tab-rank.active")) renderRank();
  });

  function render() {
    S = L.normalize(S, now());
    $("dates").textContent = S.dates;
    renderFarm(); renderStakes(); renderVip();
    if (!document.activeElement || document.activeElement.id !== "stakeAmt") renderStakeOptions();
  }

  window.I18N.apply();
  renderSeeds();
  render();
  setInterval(() => { renderFarm(); renderStakes(); }, 1000);
})();
