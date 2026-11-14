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
  const { K } = KL;

  let open = false, page = "arena", cat = KL.CATS[0];
  // taps not yet confirmed by the server: normal ones and fury ones (x3, free)
  let pn = 0, pf = 0, fn = 0, ff = 0, sending = false, busy = false;
  let localFury = 0; // fury predicted on the phone until the server confirms it
  let lastLeague = -1;
  let boss = null, bossLvl = 0; // community boss from the server
  let combo = 0, comboAt = 0;

  // 1234 -> "1,234", 1.2e6 -> "1.2M"
  const big = (n) => {
    n = Math.floor(n || 0);
    if (n < 1e5) return n.toLocaleString("en-US");
    const u = [[1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([v]) => n >= v);
    return (n / u[0]).toFixed(n >= u[0] * 100 ? 0 : 1).replace(/\.0$/, "") + u[1];
  };
  const errMsg = (e) => (e && e.code ? t("e." + e.code, e.vars || (e.data && e.data.vars)) : (e && e.message) || "");
  const lgName = (i) => `${KL.LEAGUE_ICON[i]} ${t("k.lg." + i)}`;
  const k = () => KL.norm(JSON.parse(JSON.stringify(G.S.kombat || null)), G.now());

  // ---------- Sound (tiny synth, no files) ----------
  let ac = null, muted = false;
  try { muted = localStorage.getItem("k_mute") === "1"; } catch {}
  function tone(f, d, type, vol, slide) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime;
      o.type = type || "sine";
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g).connect(ac.destination);
      o.start(t0); o.stop(t0 + d + 0.02);
    } catch {}
  }
  const sfx = {
    tap: (fury) => tone(fury ? 520 + Math.random() * 120 : 380 + Math.random() * 60, 0.07, "triangle", 0.05, fury ? 900 : 620),
    coin: () => { tone(988, 0.08, "square", 0.04); setTimeout(() => tone(1319, 0.16, "square", 0.04), 70); },
    fury: () => [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, "sawtooth", 0.05), i * 60)),
    chest: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.06), i * 80)),
    level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.28, "triangle", 0.07), i * 110)),
    no: () => tone(160, 0.15, "square", 0.04, 110),
  };
  function setMute(m) {
    muted = m;
    $("kSound").textContent = m ? "🔇" : "🔊";
    try { localStorage.setItem("k_mute", m ? "1" : "0"); } catch {}
  }
  $("kSound").addEventListener("click", () => setMute(!muted));
  $("kHelp").addEventListener("click", () => G.openHelp());
  setMute(muted);

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
    if (sending || !(pn + pf)) return;
    sending = true;
    fn = pn; ff = pf; pn = pf = 0;
    try { await run({ type: "kTap", n: fn + ff }); }
    catch (e) { if (e.data && e.data.state) G.S = e.data.state; }
    finally {
      fn = ff = 0; sending = false;
      if (k().furyUntil) localFury = 0; // the server's fury timer wins
      if (G.account) loadBoss();
      paint();
    }
  }
  async function act(action, sound) {
    if (busy) return;
    busy = true;
    try {
      await flush();
      const r = await run(action);
      G.toast(r.msg ? G.msgText(r.msg) : "");
      if (action.type !== "kSync") { pop(); (sound || sfx.coin)(); }
    } catch (e) {
      if (e.data && e.data.state) G.S = e.data.state;
      G.toast(errMsg(e)); sfx.no();
    } finally { busy = false; renderAll(); }
  }

  // ---------- Live numbers ----------
  function furyEnd() {
    const kk = G.S.kombat || {};
    return Math.max(kk.furyUntil || 0, localFury);
  }
  const furyNow = () => G.now() <= furyEnd();
  function v() {
    const x = KL.view(G.S.kombat, G.now(), G.boost());
    const n = pn + fn, f = pf + ff;
    x.gm = KL.golden(G.now()) ? 2 : 1; // golden hour
    x.coins += (n * x.tap + f * x.tap * K.FURY_X) * x.gm;
    x.total += (n * x.tap + f * x.tap * K.FURY_X) * x.gm;
    x.energy = Math.max(0, x.energy - n * x.tap);
    x.furyFill = furyNow() ? 1 : Math.min(1, (x.fury + n) / K.FURY_NEED);
    return x;
  }
  function paint() {
    if (!open) return;
    const x = v(), nowT = G.now();
    $("kCoins").textContent = Math.floor(x.coins).toLocaleString("en-US");
    $("kTapV").textContent = "+" + x.tap * (furyNow() ? K.FURY_X : 1) * x.gm;
    paintGold(nowT);
    $("kPph").textContent = "+" + big(x.pph);
    $("kEnergyTxt").textContent = big(x.energy);
    $("kEnergy").textContent = x.energy;
    $("kEnergyMax").textContent = x.max;
    $("kEBar").style.width = (100 * x.energy) / x.max + "%";
    $("kFBar").style.width = x.furyFill * 100 + "%";
    const lg = x.league, next = KL.LEAGUES[lg + 1];
    $("kLeagueBtn").textContent = KL.LEAGUE_ICON[lg]; // icon only: the name is on the League tab
    $("kLeagueBtn").title = t("k.lg." + lg);
    $("kLgName").textContent = next ? `${lgName(lg)} → ${KL.LEAGUE_ICON[lg + 1]} ${big(next)}` : lgName(lg);
    $("kLgBar").style.width = next ? Math.max(0, Math.min(100, (100 * (x.coins - KL.LEAGUES[lg])) / (next - KL.LEAGUES[lg]))) + "%" : "100%";
    $("kMedal").dataset.lg = lg;
    const kk = k();
    $("kMedal").dataset.skin = kk.skin || "classic";
    // energy full in…
    const miss = x.max - x.energy;
    $("kEFull").textContent = miss > 0 && !furyNow() ? t("k.full", { t: miss / K.REGEN >= 60 ? Math.ceil(miss / K.REGEN / 60) + "m" : Math.ceil(miss / K.REGEN) + "s" }) : "";
    paintBoss(x);
    $("kDailyDot").classList.toggle("hidden", kk.daily.day === KL.day(nowT) && !tasksReady(kk));
    // fury
    const on = furyNow();
    $("kombat").classList.toggle("fury", on);
    $("kFuryBanner").classList.toggle("hidden", !on);
    if (on) $("kFuryLeft").textContent = Math.max(0, Math.ceil((furyEnd() - nowT) / 1000)) + "s";
    // treasure jar
    $("kChest").classList.toggle("hidden", nowT < x.chestAt || page !== "arena");
    // league up: celebrate only a league never reached before (spending coins can lower the league)
    let best = 0;
    try { best = +localStorage.getItem("k_best_lg") || 0; } catch {}
    if (lastLeague >= 0 && lg > lastLeague && lg > best) celebrate(lg);
    if (lg > best) try { localStorage.setItem("k_best_lg", String(lg)); } catch {}
    lastLeague = lg;
  }

  // ---------- Tapping ----------
  const medal = $("kMedal");
  medal.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const x = v(), fury = furyNow();
    if (!fury && x.energy < x.tap) { medal.classList.remove("shake"); void medal.offsetWidth; medal.classList.add("shake"); sfx.no(); return; }
    if (fury) pf++; else pn++;
    // fury bar full: start fury on the phone right away (the server confirms on the next batch)
    if (!fury && x.fury + pn + fn >= K.FURY_NEED) { localFury = G.now() + K.FURY_MS; sfx.fury(); flash(); }
    // tilt toward the finger
    const r = medal.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    medal.style.transform = `perspective(600px) rotateX(${-dy * 14}deg) rotateY(${dx * 14}deg) scale(.95)`;
    clearTimeout(medal._t);
    medal._t = setTimeout(() => (medal.style.transform = ""), 120);
    floatText("+" + x.tap * (fury ? K.FURY_X : 1) * x.gm, e.clientX, e.clientY, fury || x.gm > 1);
    // combo: quick taps in a row
    const tn = Date.now();
    combo = tn - comboAt < 450 ? combo + 1 : 1;
    comboAt = tn;
    if (combo >= 5) {
      const c = $("kCombo");
      c.textContent = "COMBO ×" + combo;
      c.className = "k-combo bump " + (combo >= 100 ? "c3" : combo >= 50 ? "c2" : "");
      clearTimeout(c._t);
      c._t = setTimeout(() => c.classList.add("hidden"), 900);
      if (combo === 50 || combo === 100 || combo % 200 === 0) { sfx.level(); flash(); }
    }
    const bb = $("kBoss"); bb.classList.remove("hit"); void bb.offsetWidth; bb.classList.add("hit");
    sfx.tap(fury);
    if (navigator.vibrate) try { navigator.vibrate(fury ? 12 : 6); } catch {}
    paint();
    if (pn + pf >= 80) flush(); // ~4 s of fast tapping
  });
  medal.addEventListener("contextmenu", (e) => e.preventDefault());
  function floatText(txt, x, y, hot) {
    const f = document.createElement("div");
    f.className = "k-float" + (hot ? " hot" : "");
    f.textContent = txt;
    f.style.left = x + "px"; f.style.top = y + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  function flash() { const el = $("kombat"); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  function coinRain(n) {
    for (let i = 0; i < n; i++) {
      const c = document.createElement("i");
      c.className = "kcoin k-rain";
      c.style.left = Math.random() * 100 + "vw";
      c.style.animationDelay = Math.random() * 0.6 + "s";
      c.style.setProperty("--dx", (Math.random() * 80 - 40) + "px");
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2200);
    }
  }

  // ---------- Treasure jar ----------
  $("kChest").addEventListener("click", async (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    floatText("🏺 +" + big(v().chestReward), r.left + r.width / 2, r.top, true);
    await act({ type: "kChest" }, sfx.chest);
    coinRain(24);
  });

  // ---------- Golden hour: x2 for everyone, one hour a day ----------
  const hm = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  const clock = (t) => new Date(t).toLocaleTimeString(window.I18N.locale || undefined, { hour: "2-digit", minute: "2-digit" });
  function paintGold(nowT) {
    const el = $("kGold");
    if (KL.golden(nowT)) {
      const end = KL.goldenStart(nowT) + 3600e3;
      el.className = "k-gold on";
      el.textContent = t("k.gold.on", { t: hm(end - nowT) });
    } else {
      let start = KL.goldenStart(nowT);
      if (start <= nowT) start = KL.goldenStart(nowT + 86400000);
      el.className = "k-gold";
      el.textContent = t("k.gold.next", { time: clock(start), t: hm(start - nowT) });
    }
    $("kombat").classList.toggle("golden", KL.golden(nowT));
  }

  // ---------- Community boss ----------
  const bossName = (lvl) => t("k.boss." + KL.bossOf(lvl).id);
  let bossAt = 0;
  async function loadBoss() {
    if (Date.now() - bossAt < 5000) return; // at most every 5 s
    bossAt = Date.now();
    try {
      const r = await Pi.kombatBoss();
      if (bossLvl && r.boss.lvl > bossLvl) { // the boss fell
        G.toast(t("k.boss.down", { boss: bossName(bossLvl) }));
        sfx.level(); coinRain(30);
      }
      bossLvl = r.boss.lvl;
      boss = r;
      paint();
      if (!$("kBossSheet").classList.contains("hidden")) renderBossSheet();
    } catch {}
  }
  function paintBoss(x) {
    if (!boss) { $("kBoss").classList.add("hidden"); return; }
    $("kBoss").classList.remove("hidden");
    const b = boss.boss;
    const pend = G.account ? ((pn + fn) * x.tap + (pf + ff) * x.tap * K.FURY_X) * x.gm : 0;
    const hp = Math.max(0, b.hp - pend);
    $("kBossIc").textContent = KL.bossOf(b.lvl).e;
    $("kBossName").textContent = `${bossName(b.lvl)} · ${t("k.lvl", { n: b.lvl })}`;
    $("kBossBar").style.width = (100 * hp) / b.max + "%";
    $("kBossHp").textContent = `❤ ${big(hp)} / ${big(b.max)}`;
    $("kBossMine").textContent = !G.account ? t("k.boss.guest") : boss.reward > 0 ? t("k.boss.reward", { n: big(boss.reward) }) : t("k.boss.mine", { n: big(boss.mine + pend) });
    $("kBoss").classList.toggle("reward", boss.reward > 0);
  }
  function renderBossSheet() {
    if (!boss) return;
    const b = boss.boss, me = G.account && G.account.username;
    $("kBsIcon").textContent = KL.bossOf(b.lvl).e;
    $("kBsName").textContent = `${bossName(b.lvl)} · ${t("k.lvl", { n: b.lvl })}`;
    $("kBsHp").innerHTML = `<span dir="ltr" style="unicode-bidi:isolate">❤ ${big(b.hp)} / ${big(b.max)}</span><br>⚔️ ${t("k.boss.bonus", { n: big(KL.KILL_BONUS(b.lvl)) })}`;
    $("kBsTop").innerHTML = boss.top.length ? boss.top.map((p, i) => `<div class="${p.username === me ? "me" : ""}"><span>${["🥇", "🥈", "🥉", "4", "5"][i]}</span>
      <b>${String(p.username).replace(/[<>&"]/g, "")}</b><small>⚔️</small><span>${big(p.dmg)}</span></div>`).join("") : `<div class="k-note">${t("k.boss.first")}</div>`;
    $("kBsLast").textContent = boss.last ? t("k.boss.last", { boss: bossName(boss.last.lvl), name: boss.last.killer || "?" }) : "";
    $("kBsClaim").classList.toggle("hidden", !(boss.reward > 0));
    $("kBsClaim").textContent = t("k.boss.claim", { n: big(boss.reward) });
  }
  $("kBoss").addEventListener("click", () => { renderBossSheet(); $("kBossSheet").classList.remove("hidden"); bossAt = 0; loadBoss(); });
  $("kBsClose").addEventListener("click", () => $("kBossSheet").classList.add("hidden"));
  $("kBossSheet").addEventListener("click", (e) => { if (e.target === $("kBossSheet")) $("kBossSheet").classList.add("hidden"); });
  $("kBsClaim").addEventListener("click", async () => {
    try {
      await flush();
      const r = await Pi.kombatBossClaim();
      G.setClock(r.now); G.S = r.state;
      G.toast(t("k.boss.got", { n: big(r.n) })); sfx.chest(); coinRain(30); pop();
    } catch (e) { G.toast(errMsg(e)); }
    bossAt = 0; loadBoss();
  });

  // ---------- Community goal: 300,000 players for the airdrop ----------
  let goal = null;
  async function loadGoal() { try { goal = await Pi.stats(); paintGoal(); } catch {} }
  function paintGoal() {
    if (!goal) return;
    const pct = Math.min(100, (100 * goal.players) / goal.goal);
    document.querySelectorAll(".k-goal").forEach((el) => {
      el.querySelector(".k-goal-n").textContent = `${big(goal.players)} / ${big(goal.goal)}`;
      el.querySelector(".k-goal-bar i").style.width = Math.max(1, pct) + "%";
    });
  }
  async function share() {
    const link = G.refLink();
    if (!link) return G.toast(t("t.loginFirst"));
    const text = t("k.share.text", { ...G.piLink(), code: G.account.username, goal: big(goal ? goal.goal : KL.AIRDROP_GOAL) });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    navigator.clipboard?.writeText(text).then(() => G.toast(t("t.copied")), () => {});
  }
  document.querySelectorAll(".k-goal-share").forEach((b) => b.addEventListener("click", share));

  // ---------- Skins ----------
  function renderSkins() {
    const kk = k(), lg = KL.league(v().coins), coins = v().coins;
    $("kSkins").innerHTML = KL.SKINS.map((s) => {
      const own = !!kk.skins[s.id], on = kk.skin === s.id;
      const lock = !own && s.league != null && lg < s.league;
      const label = on ? "✓" : own ? t("k.wear") : s.league != null ? (lock ? "🔒 " + KL.LEAGUE_ICON[s.league] : t("k.wear")) : `<i class="kcoin s"></i>${big(s.cost)}`;
      return `<button class="k-skin ${on ? "on" : ""} ${lock || (!own && s.cost && coins < s.cost) ? "locked" : ""}" data-skin="${s.id}" ${lock ? "disabled" : ""}>
        <span>${s.e}</span><b>${t("k.skin." + s.id)}</b><small>${label}</small></button>`;
    }).join("");
  }
  $("kSkins").addEventListener("click", (e) => { const b = e.target.closest("[data-skin]"); if (b) act({ type: "kSkin", id: b.dataset.skin }, sfx.level); });

  // ---------- Cards ----------
  function renderCards() {
    const kk = k(), boost = G.boost();
    $("kCats").innerHTML = KL.CATS.map((c) => `<button class="${c === cat ? "on" : ""}" data-cat="${c}">${t("k.cat." + c)}</button>`).join("");
    const coins = v().coins;
    // best deal: the unlocked card that pays back its price fastest
    let best = null, bestH = Infinity;
    for (const c of KL.CARDS) {
      const lvl = kk.cards[c.id] || 0;
      if (lvl >= K.MAX_CARD || !KL.unlocked(kk, c)) continue;
      const h = KL.cardCost(c, lvl) / (KL.cardProfit(c, lvl + 1) - KL.cardProfit(c, lvl));
      if (h < bestH) { bestH = h; best = c.id; }
    }
    $("kCards").innerHTML = KL.CARDS.filter((c) => c.cat === cat).map((c) => {
      const lvl = kk.cards[c.id] || 0, max = lvl >= K.MAX_CARD;
      const isOpen = KL.unlocked(kk, c);
      const cost = KL.cardCost(c, lvl), gain = KL.cardProfit(c, lvl + 1) - KL.cardProfit(c, lvl);
      const hours = cost / (gain * (1 + boost));
      const req = c.req ? (c.req.league != null ? t("k.req.league", { lg: lgName(c.req.league) }) : t("k.req.card", { card: t("k.card." + c.req.card), n: c.req.lvl })) : "";
      return `<button class="k-card ${isOpen ? "" : "locked"} ${!max && isOpen && coins >= cost ? "can" : ""}" data-card="${c.id}" ${isOpen && !max ? "" : "disabled"}>
        ${best === c.id ? `<span class="k-best">💡 ${t("k.best")}</span>` : ""}
        <span class="k-ce">${c.e}</span>
        <b>${t("k.card." + c.id)}</b>
        <small>${t("k.pphShort")} <b>+${big(KL.cardProfit(c, lvl) * (1 + boost))}</b></small>
        <span class="k-cl">${t("k.lvl", { n: lvl })}</span>
        ${max ? `<span class="k-cost">${t("k.max")}</span>`
          : isOpen ? `<span class="k-gain">+${big(gain * (1 + boost))}/h · ⏱ ${hours < 1 ? "<1" : Math.round(hours)}h</span><span class="k-cost"><i class="kcoin s"></i>${big(cost)}</span>`
          : `<span class="k-cost lock">🔒 ${req}</span>`}
      </button>`;
    }).join("");
    $("kMemberNote").textContent = boost ? t("k.member", { n: Math.round(boost * 100) }) : t("k.memberAd");
  }
  $("kCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; renderCards(); } });
  $("kCards").addEventListener("click", (e) => {
    const b = e.target.closest("[data-card]");
    if (!b) return;
    const r = b.getBoundingClientRect();
    act({ type: "kCard", id: b.dataset.card }).then(() => coinRain(8));
    floatText("⬆️", r.left + r.width / 2, r.top + 20, false);
  });

  // ---------- Boosts ----------
  function renderBoosts() {
    const kk = k(), nowT = G.now();
    const left = K.REFILLS - kk.refill.used, wait = K.REFILL_GAP - (nowT - kk.refill.at);
    $("kRefill").innerHTML = `<span class="k-be">⚡</span><span><b>${t("k.refill.t")}</b><small>${t("k.refill.d", { n: left, max: K.REFILLS })}</small></span>
      <button class="btn small gold" data-kact="refill" ${left > 0 && wait <= 0 ? "" : "disabled"}>${left <= 0 ? "—" : wait > 0 ? t("k.refill.in", { m: Math.ceil(wait / 60000) }) : t("k.go")}</button>`;
    const coins = v().coins;
    $("kBoosts").innerHTML = KL.BOOSTS.map((b) => {
      const lvl = kk[b.id] || 0, max = lvl >= K.MAX_BOOST, cost = KL.boostCost(b, lvl);
      return `<div class="k-boost"><span class="k-be">${b.e}</span><span><b>${t("k.boost." + b.id + ".t")}</b><small>${t("k.boost." + b.id + ".d")} · ${t("k.lvl", { n: lvl })}</small></span>
        <button class="btn small ${coins >= cost ? "" : "secondary"}" data-kboost="${b.id}" ${max ? "disabled" : ""}>${max ? t("k.max") : `<i class="kcoin s"></i>${big(cost)}`}</button></div>`;
    }).join("") + `<div class="k-boost k-tip"><span class="k-be">🔥</span><span><b>${t("k.fury")}</b><small>${t("k.furyTip", { n: K.FURY_NEED })}</small></span></div>`;
  }
  $("kRefill").addEventListener("click", (e) => { if (e.target.closest("[data-kact=refill]")) act({ type: "kRefill" }, sfx.fury); });
  $("kBoosts").addEventListener("click", (e) => { const b = e.target.closest("[data-kboost]"); if (b) act({ type: "kBoost", id: b.dataset.kboost }); });

  // ---------- Earn: daily reward + tasks ----------
  const taskCtx = () => ({ boost: G.boost(), member: G.member(), cityLevel: L.cityLevel, refs: (G.account && G.account.activeRefs) || 0 });
  const tasksReady = (kk) => KL.TASKS.some((x) => !kk.done[x.id] && x.have(G.S, kk, taskCtx()) >= x.need);
  function renderDaily() {
    const kk = k(), d = KL.day(G.now());
    const doneToday = kk.daily.day === d;
    const streak = doneToday ? kk.daily.streak : kk.daily.day === d - 1 ? kk.daily.streak : 0;
    const pos = streak % KL.DAILY.length;
    const shownDone = doneToday ? (pos === 0 ? KL.DAILY.length : pos) : pos;
    $("kDaily").innerHTML = KL.DAILY.map((n, i) => `<div class="${i < shownDone ? "done" : !doneToday && i === pos ? "today" : ""}">
      <small>${t("k.daily.day", { n: i + 1 })}</small><i class="kcoin s"></i><b>${big(n)}</b></div>`).join("");
    $("kDailyBtn").textContent = doneToday ? t("k.daily.done") : t("k.daily.claim");
    $("kDailyBtn").disabled = doneToday;
    // tasks: ready first, then in progress, done last
    const rows = KL.TASKS.map((x) => {
      const have = Math.min(x.need, x.have(G.S, kk, taskCtx())), done = !!kk.done[x.id];
      return { x, have, done, ready: !done && have >= x.need };
    }).sort((a, b) => (b.ready - a.ready) || (a.done - b.done));
    $("kTasks").innerHTML = rows.map(({ x, have, done, ready }) => `<div class="k-task ${done ? "done" : ""}">
      <span class="k-be">${x.e}</span>
      <span><b>${t("k.task." + x.id, { n: big(x.need) })}</b>
        <small><i class="kcoin s"></i>+${big(x.r)}</small>
        ${done ? "" : `<span class="k-tbar"><i style="width:${(100 * have) / x.need}%"></i></span>`}</span>
      ${done ? `<span class="k-check">✓</span>` : `<button class="btn small ${ready ? "gold" : "secondary"}" data-task="${x.id}" ${ready ? "" : "disabled"}>${ready ? t("k.daily.claim") : `${big(have)}/${big(x.need)}`}</button>`}
    </div>`).join("");
  }
  $("kDailyBtn").addEventListener("click", () => act({ type: "kDaily" }, sfx.chest).then(() => coinRain(16)));
  $("kTasks").addEventListener("click", (e) => { const b = e.target.closest("[data-task]"); if (b) act({ type: "kTask", id: b.dataset.task }, sfx.chest).then(() => coinRain(16)); });

  // ---------- League ----------
  let lgTab = "week";
  const ago = (ms) => { const h = Math.max(0, Math.floor(ms / 3600e3)); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600e3) / 60000)}m`; };
  async function renderLeague() {
    const x = v(), next = KL.LEAGUES[x.league + 1];
    $("kLeague").innerHTML = `<div class="k-lg-icon">${KL.LEAGUE_ICON[x.league]}</div><h2>${t("k.lg." + x.league)}</h2>
      <p>${next ? t("k.league.next", { n: big(next - x.coins), lg: lgName(x.league + 1) }) : t("k.league.max")}</p>
      <div class="k-lg-row">${KL.LEAGUE_ICON.map((ic, i) => `<span class="${i <= x.league ? "on" : ""}" title="${t("k.lg." + i)}">${ic}</span>`).join("")}</div>
      <p class="k-note">${t("k.league.rule")}</p>
      <div class="k-tabs"><button data-lgtab="week" class="${lgTab === "week" ? "on" : ""}">🔥 ${t("k.tour.tab")}</button><button data-lgtab="all" class="${lgTab === "all" ? "on" : ""}">🏆 ${t("k.tour.all")}</button></div>
      <div id="kTour"></div>`;
    const kk = k(), need = KL.AIRDROP_DAYS, days = kk.act.days;
    $("kDrop").innerHTML = `<b>🪂 ${t("k.drop.t")}</b><span class="k-tbar"><i style="width:${Math.min(100, (100 * days) / need)}%"></i></span>
      <small>${days >= need ? t("k.drop.ok") : t("k.drop.days", { n: days, need })}</small>`;
    $("kTop").innerHTML = `<div class="k-note">…</div>`;
    const me = G.account && G.account.username;
    const row = (p, i, icon) => `<div class="${p.username === me ? "me" : ""}"><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
        <b>${String(p.username).replace(/[<>&"]/g, "")}</b><small>${icon}</small><span><i class="kcoin s"></i>${big(p.total)}</span></div>`;
    try {
      if (lgTab === "week") {
        const r = await Pi.kombatTop(true);
        const p = r.prizes;
        $("kTour").innerHTML = `<div class="k-tour">
          <div class="k-tour-top"><b>🔥 ${t("k.tour.t")}</b><span>⏳ ${ago(r.ends - G.now())}</span></div>
          <small>${t("k.tour.d")}</small>
          <div class="k-tour-mine">${t("k.tour.mine", { n: big(x.week) })}</div>
          <div class="k-prizes"><span>🥇 ${big(p[0])}</span><span>🥈 ${big(p[1])}</span><span>🥉 ${big(p[2])}</span><span>4-10 · ${big(p[3])}</span></div>
          ${r.prize && !r.prize.claimed ? `<button id="kTourClaim" class="btn gold k-wide">${t("k.tour.claim", { place: r.prize.place, n: big(r.prize.prize) })}</button>` : ""}
        </div>`;
        const cb = $("kTourClaim");
        if (cb) cb.addEventListener("click", claimWeek);
        $("kTop").innerHTML = r.top.length ? r.top.map((q, i) => row(q, i, "🔥")).join("") : `<div class="k-note">${t("k.league.empty")}</div>`;
      } else {
        const r = await Pi.kombatTop();
        $("kTour").innerHTML = "";
        $("kTop").innerHTML = r.top.length ? r.top.map((q, i) => row(q, i, KL.LEAGUE_ICON[KL.league(q.total)])).join("") : `<div class="k-note">${t("k.league.empty")}</div>`;
      }
    } catch { $("kTop").innerHTML = `<div class="k-note">${t("k.league.offline")}</div>`; }
  }
  $("kLeague").addEventListener("click", (e) => { const b = e.target.closest("[data-lgtab]"); if (b) { lgTab = b.dataset.lgtab; renderLeague(); } });
  $("kJrySave").addEventListener("click", async () => {
    try {
      const r = await Pi.saveWallet($("kJryAddr").value.trim());
      G.setAccount(r.account);
      $("kJryState").textContent = r.trust ? t("k.jry.ready", { n: r.balance }) : t("k.jry.noTrust");
      G.toast(t("k.jry.ok"));
    } catch (e) { G.toast(errMsg(e)); }
  });
  // ---------- Jerry Collectibles: mint, market, my copies ----------
  let nTab = "mint", nData = null;
  const nCard = (c, inner, ed) => `<div class="n-card r-${c.r}"><div class="n-art"><span>${c.e}</span>${ed ? `<em>#${ed}/${c.max}</em>` : ""}</div>
    <b>${t("n.c." + c.id)}</b><small class="n-r">${t("n.r." + c.r)} · +${Math.round(c.perk * 100)}%/h</small>${inner}</div>`;
  async function renderNft() {
    try { nData = await Pi.nft(); } catch { return; }
    const d = nData, coins = v().coins;
    $("nBoost").textContent = t("n.boost", { n: Math.round(d.boost * 100), max: Math.round(KL.NFT_MAX * 100) });
    document.querySelectorAll("[data-ntab]").forEach((b) => b.classList.toggle("on", b.dataset.ntab === nTab));
    let html = "";
    if (nTab === "mint") {
      html = KL.COLLECTIBLES.map((c) => {
        const n = d.minted[c.id] || 0, left = c.max - n;
        return nCard(c, `<small>${t("n.left", { n: left, max: c.max })}</small>${left > 0
          ? `<button class="k-buy" data-mint="${c.id}" ${coins >= c.price ? "" : "disabled"}><b><i class="kcoin s"></i>${big(c.price)}</b><small>${t("n.mintBtn")}</small></button>`
          : `<span class="n-out">${t("n.soldOut")}</span>`}`);
      }).join("");
    } else if (nTab === "market") {
      html = d.market.length ? d.market.map((it) => nCard(KL.nftById(it.kind), `<small>${t("n.seller", { name: esc(it.seller) })}</small>
        ${G.account && it.seller === G.account.username ? `<span class="n-out">${t("n.yours")}</span>` : `<button class="k-buy" data-buy-nft="${it.id}" data-price="${it.price}" ${coins >= it.price ? "" : "disabled"}><b><i class="kcoin s"></i>${big(it.price)}</b><small>${t("n.buyBtn")}</small></button>`}`, it.edition)).join("")
        : `<div class="k-note">${t("n.emptyMarket")}</div>`;
    } else {
      html = !G.account ? `<div class="k-note">${t("k.league.offline")}</div>` : d.mine.length ? d.mine.map((it) => nCard(KL.nftById(it.kind), it.price != null
        ? `<small>${t("n.listed", { n: big(it.price) })}</small><button class="k-goal-share" data-unlist="${it.id}">${t("n.unlist")}</button>`
        : `<button class="k-goal-share" data-list="${it.id}">${t("n.sell")}</button>`, it.edition)).join("") : `<div class="k-note">${t("n.none")}</div>`;
    }
    $("nList").innerHTML = html;
    $("nRecent").innerHTML = d.recent.length ? d.recent.map((r) => `<div><span>${KL.nftById(r.kind).e}</span><b>#${r.edition} ${esc(r.seller || "")} → ${esc(r.buyer)}</b><small></small><span><i class="kcoin s"></i>${big(r.price)}</span></div>`).join("") : `<p class="k-note">${t("n.noSales")}</p>`;
  }
  document.querySelector('[data-kp="collect"]').addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-ntab]");
    if (tab) { nTab = tab.dataset.ntab; return renderNft(); }
    const b = e.target.closest("[data-mint],[data-buy-nft],[data-list],[data-unlist]");
    if (!b) return;
    if (!G.account) return G.toast(t("t.loginFirst"));
    try {
      await flush();
      if (b.dataset.mint) {
        const r = await Pi.nftMint(b.dataset.mint);
        G.S = r.state; G.setClock(r.now);
        const c = KL.nftById(r.item.kind);
        G.toast(t("n.minted", { e: c.e, name: t("n.c." + c.id), n: r.item.edition, max: c.max })); sfx.level(); coinRain(30);
      } else if (b.dataset.buyNft) {
        if (!confirm(t("n.confirmBuy", { n: big(+b.dataset.price) }))) return;
        const r = await Pi.nftBuy(+b.dataset.buyNft, +b.dataset.price);
        G.S = r.state; G.setClock(r.now);
        G.toast(t("n.bought")); sfx.chest(); coinRain(20);
      } else if (b.dataset.list) {
        const p = prompt(t("n.askPrice"));
        if (!p) return;
        await Pi.nftList(+b.dataset.list, Math.floor(Number(String(p).replace(/[^0-9]/g, ""))));
        G.toast(t("n.listedOk")); sfx.coin();
      } else if (b.dataset.unlist) {
        await Pi.nftList(+b.dataset.unlist, null);
        G.toast(t("n.unlisted"));
      }
      const me = await Pi.me(); G.setAccount(me.account); G.S = me.state;
    } catch (err) { G.toast(errMsg(err)); }
    renderNft(); paint();
  });

  // ---------- Jerry community tab: chat, goal, market, wallet, votes, top holders ----------
  // ---------- Tribes ----------
  let trEmoji = KL.TRIBE.EMOJIS[0];
  async function renderTribes() {
    let d;
    try { d = await Pi.tribes(); } catch { return; }
    const acc = G.account, coins = v().coins;
    const row = (x, i, joinable) => `<div class="${d.mine && d.mine.id === x.id ? "me" : ""}"><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
      <b>${x.emoji} ${esc(x.name)}</b><small>👥 ${x.members}/${d.max}</small><span>${joinable && x.members < d.max ? `<button class="k-mini" data-tjoin="${x.id}">${t("tr.join")}</button>` : `<i class="kcoin s"></i>${big(x.score)}`}</span></div>`;
    let html = "";
    if (d.prize && !d.prize.claimed) html += `<button class="btn gold k-wide" data-tclaim="1">${t("tr.claim", { place: d.prize.place, e: d.prize.emoji, name: esc(d.prize.name), n: big(d.prize.prize) })}</button>`;
    if (d.mine) {
      const m = d.mine;
      html += `<div class="k-tribe-card"><div class="k-tribe-ic">${m.emoji}</div><div><b>${esc(m.name)}</b>
        <small>👥 ${m.members}/${d.max} · ${m.rank ? t("tr.rank", { n: m.rank }) : t("tr.unranked")} · 🪙 ${big(m.week)}</small></div></div>
        <div class="k-tribe-actions"><button class="k-goal-share" data-tinvite="1">📣 ${t("tr.invite")}</button><button class="k-mini" data-tleave="1">${t("tr.leave")}</button></div>
        <div class="k-top-list">${d.members.map((x, i) => `<div class="${acc && x.username === acc.username ? "me" : ""}"><span>${i + 1}</span><b>${esc(x.username)}</b><small></small><span><i class="kcoin s"></i>${big(x.week)}</span></div>`).join("")}</div>`;
    } else {
      html += `<div class="k-tribe-new"><b>🏕️ ${t("tr.new")}</b><small>${t("tr.newD", { n: big(d.cost), max: d.max })}</small>
        <div class="k-emojis">${KL.TRIBE.EMOJIS.map((e) => `<button class="${e === trEmoji ? "on" : ""}" data-temoji="${e}">${e}</button>`).join("")}</div>
        <div class="k-jry-row"><input id="trName" maxlength="20" autocomplete="off" placeholder="${t("tr.name")}"><button class="k-goal-share" data-tcreate="1" ${coins >= d.cost ? "" : "disabled"}><i class="kcoin s"></i>${big(d.cost)}</button></div></div>`;
    }
    html += `<div class="k-tour"><div class="k-tour-top"><b>🏆 ${t("tr.week")}</b><span>⏳ ${ago(d.ends - G.now())}</span></div>
      <small>${t("tr.weekD", { a: big(d.prizes[0]), b: big(d.prizes[1]), c: big(d.prizes[2]) })}</small></div>
      <div class="k-top-list">${d.top.length ? d.top.map((x, i) => row(x, i, !d.mine && acc)).join("") : `<p class="k-note">${t("tr.none")}</p>`}</div>`;
    $("kTribe").innerHTML = html;
  }
  $("kTribe").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-temoji],[data-tcreate],[data-tjoin],[data-tleave],[data-tclaim],[data-tinvite]");
    if (!b) return;
    if (b.dataset.temoji) { trEmoji = b.dataset.temoji; document.querySelectorAll("[data-temoji]").forEach((x) => x.classList.toggle("on", x === b)); return; }
    if (!G.account) return G.toast(t("t.loginFirst"));
    try {
      if (b.dataset.tinvite) {
        const text = t("tr.share", { ...G.piLink(), code: G.account.username });
        try { if (navigator.share) { await navigator.share({ text }); return; } } catch (er) { if (er && er.name === "AbortError") return; }
        return navigator.clipboard?.writeText(text).then(() => G.toast(t("t.copied")));
      }
      await flush();
      if (b.dataset.tcreate) { const r = await Pi.tribeCreate($("trName").value.trim(), trEmoji); G.S = r.state; G.setClock(r.now); G.toast(t("tr.created")); sfx.level(); coinRain(30); }
      if (b.dataset.tjoin) { await Pi.tribeJoin(+b.dataset.tjoin); G.toast(t("tr.joined")); sfx.chest(); }
      if (b.dataset.tleave) { if (!confirm(t("tr.confirmLeave"))) return; await Pi.tribeLeave(); G.toast(t("tr.left")); }
      if (b.dataset.tclaim) { const r = await Pi.tribeClaim(); G.S = r.state; G.setClock(r.now); G.toast(t("tr.got", { n: big(r.n) })); sfx.level(); coinRain(40); pop(); }
    } catch (err) { G.toast(errMsg(err)); }
    renderTribes(); paint();
  });

  // ---------- 📣 For Jerry Development members: Partner request + Testnet wallet ----------
  function renderJoin() {
    const acc = G.account;
    if (!acc) { $("kJoin").innerHTML = `<b>📣 ${t("cj.title")}</b><small>${t("t.loginFirst")}</small>`; return; }
    const st = acc.partnerReq;
    const step1 = st === "approved" ? `<span class="cj-ok">💎 ${t("cj.partnerOk")}</span>`
      : st === "pending" ? `<span class="cj-wait">⏳ ${t("cj.pending")}</span>`
      : `${st === "rejected" ? `<small>${t("cj.rejected")}</small>` : ""}<div class="k-jry-row"><input id="cjNote" maxlength="140" placeholder="${t("cj.note")}"><button class="k-goal-share" data-cjreq="1">${t("cj.request")}</button></div>`;
    const step2 = acc.jryWallet ? `<span class="cj-ok">✅ ${t("cj.walletOk", { a: acc.jryWallet.slice(0, 5) + "…" + acc.jryWallet.slice(-4) })}</span>`
      : `<button class="k-goal-share" data-cjwallet="1">🪙 ${t("cj.walletGo")}</button>`;
    $("kJoin").innerHTML = `<b>📣 ${t("cj.title")}</b><small>${t("cj.sub")}</small>
      <div class="cj-step"><em>1</em><div><b>${t("cj.s1")}</b><small>${t("cj.s1d", { name: esc(acc.username) })}</small>${step1}</div></div>
      <div class="cj-step"><em>2</em><div><b>${t("cj.s2")}</b><small>${t("cj.s2d")}</small>${step2}</div></div>`;
  }
  $("kJoin").addEventListener("click", async (e) => {
    if (e.target.closest("[data-cjwallet]")) { $("kJry").scrollIntoView({ behavior: "smooth", block: "center" }); return setTimeout(() => $("kJryAddr").focus(), 400); }
    if (!e.target.closest("[data-cjreq]")) return;
    try { const r = await Pi.partnerRequest(($("cjNote") || {}).value || ""); G.setAccount(r.account); G.toast(t("cj.sent")); sfx.coin(); }
    catch (err) { G.toast(errMsg(err)); }
    renderJoin();
  });

  async function renderCommunity() {
    renderJoin(); renderTribes(); renderMarket(); loadGoal();
    const acc = G.account;
    $("kJry").classList.toggle("hidden", !(acc && acc.jryOn));
    if (acc && acc.jryOn) {
      if (document.activeElement !== $("kJryAddr")) $("kJryAddr").value = acc.jryWallet || "";
      $("kJryState").textContent = acc.jryWallet ? t("k.jry.saved", { a: acc.jryWallet.slice(0, 5) + "…" + acc.jryWallet.slice(-4) }) : "";
    }
    let c;
    try { c = await Pi.community(); } catch { return; }
    $("kChat").classList.toggle("hidden", !c.chat);
    if (c.chat) $("kChat").href = c.chat;
    const me = acc && acc.username;
    const poll = (p) => {
      const total = p.options.reduce((n, o) => n + o.weight, 0) || 1;
      const win = Math.max(...p.options.map((o) => o.weight));
      return `<div class="k-poll ${p.open ? "" : "done"}"><b>${esc(p.q)}</b>
        <small>${p.open ? t("k.com.ends", { t: ago(p.ends - G.now()) }) + " · " + t("k.com.weight", { n: c.myWeight }) : t("k.com.closed")}</small>
        ${p.options.map((o, i) => `<button class="k-opt ${p.mine === i ? "mine" : ""} ${!p.open && o.weight === win && win > 0 ? "win" : ""}" data-poll="${p.id}" data-opt="${i}" ${p.open ? "" : "disabled"}>
          <i style="width:${(100 * o.weight) / total}%"></i><span>${p.mine === i ? "✓ " : ""}${esc(o.text)}</span><em>${Math.round((100 * o.weight) / total)}%</em></button>`).join("")}</div>`;
    };
    $("kPolls").innerHTML = c.polls.length || c.past.length ? c.polls.map(poll).join("") + c.past.map(poll).join("") : `<div class="k-note">${t("k.com.noPolls")}</div>`;
    $("kHolders").innerHTML = c.holders.length ? c.holders.map((h, i) => `<div class="${h.username === me ? "me" : ""}"><span>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
      <b>${esc(h.username)}</b><small>${(KL.HOLD_TIERS[KL.holdTier(h.bal)] || {}).e || ""}</small><span>🪙 ${big(h.bal)}</span></div>`).join("") : `<p class="k-note">${t("k.com.noHolders")}</p>`;
  }
  const esc = (x) => String(x).replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch]));
  $("kPolls").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-poll]");
    if (!b) return;
    if (!G.account) return G.toast(t("t.loginFirst"));
    try { const r = await Pi.vote(+b.dataset.poll, +b.dataset.opt); G.toast(t("k.com.voted", { n: r.weight })); sfx.coin(); renderCommunity(); }
    catch (e2) { G.toast(errMsg(e2)); }
  });

  // ---------- Jerry community market: testJRY price, pool, holders, my perks ----------
  const num = (n, d) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  async function renderMarket() {
    let m;
    try { m = await Pi.jryMarket(); } catch { return; }
    $("kMarket").classList.toggle("hidden", !m.on);
    if (!m.on) return;
    const acc = G.account, held = (acc && acc.jryHeld) || 0, ti = KL.holdTier(held);
    const perJry = m.price, perPi = m.price > 0 ? 1 / m.price : 0;
    $("kMarket").innerHTML = `<div class="k-mk-top"><img src="jry.png" alt=""><div><b>testJRY</b><small>${t("k.mk.sub")}</small></div></div>
      <div class="k-mk-grid">
        <div><small>${t("k.mk.price")}</small><b>${perJry ? num(perJry, 6) : "—"}</b><small>Test-Pi</small></div>
        <div><small>1 Test-Pi =</small><b>${perPi ? num(perPi, 0) : "—"}</b><small>testJRY</small></div>
        <div><small>${t("k.mk.holders")}</small><b>${num(m.holders, 0)}</b><small>👥</small></div>
        <div><small>${t("k.mk.pool")}</small><b>${big(m.poolPi)}</b><small>Test-Pi</small></div>
      </div>
      <div class="k-mk-me">${acc && acc.jryWallet ? t("k.mk.mine", { n: num(held, 2) }) + (ti >= 0 ? ` · ${KL.HOLD_TIERS[ti].e} +${Math.round(KL.HOLD_TIERS[ti].boost * 100)}%` : "") : t("k.mk.noWallet")}</div>
      <div class="k-mk-tiers">${KL.HOLD_TIERS.map((x, i) => `<span class="${i === ti ? "on" : ""}">${x.e} ${big(x.min)}+ → +${Math.round(x.boost * 100)}%</span>`).join("")}</div>
      <div class="k-shop"><b>🛒 ${t("k.buy.t")}</b>
        <div class="k-shop-row">${(m.packs || KL.JRY_PACKS).map((pi) => `<button class="k-buy" data-buy="${pi}"><b>${pi} Test-Pi</b><small>≈ ${num(pi * (perPi || 1000), 0)} testJRY</small></button>`).join("")}</div>
        ${m.mine && m.mine.owed ? `<button class="k-goal-share k-retry" data-retry="1">⏳ ${t("k.buy.owed", { n: num(m.mine.owedJry, 0) })}</button>` : ""}
        <small>${t("k.buy.d")}</small>
        <small class="k-sell">💱 ${t("k.sell.d")}</small></div>
      <small class="k-note">${t("k.mk.how")}</small>`;
  }
  $("kMarket").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-buy]"), r = e.target.closest("[data-retry]");
    if (!b && !r) return;
    const acc = G.account;
    if (!acc) return G.toast(t("t.loginFirst"));
    if (r) {
      try { const x = await Pi.jryRetry(); G.toast(x.sent ? t("k.buy.ok") : t("k.buy.still")); } catch (err) { G.toast(errMsg(err)); }
      return renderMarket();
    }
    if (!acc.jryWallet) { G.toast(t("e.k.needWallet")); return $("kJryAddr").focus(); }
    b.disabled = true;
    try {
      const res = await Pi.buyJry(Number(b.dataset.buy));
      if (res.account) G.setAccount(res.account);
      G.toast(t("k.buy.ok")); sfx.chest(); coinRain(30);
    } catch (err) { G.toast(errMsg(err)); }
    b.disabled = false;
    renderMarket();
  });
  async function claimWeek() {
    try {
      await flush();
      const r = await Pi.kombatWeekClaim();
      G.setClock(r.now); G.S = r.state;
      G.toast(t("k.tour.got", { place: r.place, n: big(r.n) })); sfx.level(); coinRain(50); pop();
    } catch (e) { G.toast(errMsg(e)); }
    renderLeague();
  }
  function celebrate(lg) {
    $("kLuIcon").textContent = KL.LEAGUE_ICON[lg];
    $("kLuName").textContent = t("k.lg." + lg);
    $("kLevelUp").classList.remove("hidden");
    sfx.level(); coinRain(40);
  }
  $("kLevelUp").addEventListener("click", (e) => { if (e.target.closest("button") || e.target === $("kLevelUp")) $("kLevelUp").classList.add("hidden"); });

  // ---------- Pages ----------
  function renderAll() {
    if (!open) return;
    paint();
    if (page === "cards") renderCards();
    if (page === "boost") { renderBoosts(); renderSkins(); }
    if (page === "daily") renderDaily();
  }
  function go(p) {
    page = p;
    document.querySelectorAll(".k-page").forEach((x) => x.classList.toggle("active", x.dataset.kp === p));
    document.querySelectorAll(".k-nav button").forEach((x) => x.classList.toggle("active", x.dataset.kgo === p));
    $("kombat").querySelector(".k-pages").scrollTop = 0;
    if (p === "league") renderLeague();
    if (p === "community") renderCommunity();
    if (p === "collect") renderNft();
    renderAll();
  }
  $("kombat").addEventListener("click", (e) => { const b = e.target.closest("[data-kgo]"); if (b) go(b.dataset.kgo); });
  $("kLeagueBtn").addEventListener("click", () => go("league"));
  function pop() { $("kCoins").classList.remove("pop"); void $("kCoins").offsetWidth; $("kCoins").classList.add("pop"); }

  let timer = 0, bossTimer = 0;
  function show() {
    if (open) return;
    open = true;
    lastLeague = -1;
    $("kombat").classList.remove("hidden");
    $("kombat").setAttribute("aria-hidden", "false");
    document.body.classList.add("k-open");
    if (location.hash !== "#kombat") history.replaceState(null, "", "#kombat");
    go("arena");
    act({ type: "kSync" }); // collects passive income and says how much came in
    loadBoss(); loadGoal();
    timer = setInterval(() => { paint(); if (page === "boost") renderBoosts(); }, 250);
    bossTimer = setInterval(() => { if (page === "arena" && !document.hidden) loadBoss(); }, 15000);
  }
  async function hide() {
    if (!open) return;
    await flush();
    open = false;
    clearInterval(timer); clearInterval(bossTimer);
    $("kombat").classList.add("hidden");
    $("kombat").setAttribute("aria-hidden", "true");
    document.body.classList.remove("k-open");
    if (location.hash === "#kombat") history.replaceState(null, "", location.pathname + location.search);
  }
  $("kombatOpen").addEventListener("click", show);
  $("kBack").addEventListener("click", hide);
  // Taps go to the server in batches every 4 s: the screen counts live, the server checks
  // the same limits, and the database writes ~4x less than one request per second
  setInterval(flush, 4000);
  addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  if (location.hash === "#kombat") setTimeout(show, 300);
  document.addEventListener("langchange", () => { renderAll(); if (open && page === "league") renderLeague(); });
})();
