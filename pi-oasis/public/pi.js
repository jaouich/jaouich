// Connects the game to the Pi SDK and our server.
// Outside Pi Browser the game runs as a local demo (no sign-in, no payments).
(function () {
  const cfg = window.OASIS_CONFIG;
  let piReady = false;
  let user = null; // { username } as verified by our server via App Studio
  let session = null; // our server's session token

  function api(path, body) {
    return fetch(cfg.API_BASE + path, {
      method: body ? "POST" : "GET",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        session ? { Authorization: "Bearer " + session } : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = data.error || "server";
        const msg = I18N.has("t." + code) ? I18N.t("t." + code, data.vars) : I18N.t("e." + code);
        throw Object.assign(new Error(msg), { code, data });
      }
      return data;
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);
  }

  // Pi.init must finish before Pi.authenticate. The Pi Sandbox (developer testing on a computer,
  // sandbox.minepi.com) shows the app inside a frame: tell the SDK, or sign-in never answers.
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  const sandbox = /[?&]sandbox=1\b/.test(location.search) || (inFrame && /sandbox\.minepi\.com/.test(document.referrer || ""));
  window.PI_SANDBOX = sandbox;
  const initDone = (async () => {
    if (!window.Pi) return false;
    try {
      await window.Pi.init({ version: "2.0", sandbox });
      piReady = true;
      return true;
    } catch (e) {
      console.warn("Pi SDK init failed", e);
      return false;
    }
  })();

  // A payment that didn't finish earlier (e.g. connection lost): let the server complete it
  function onIncompletePaymentFound(payment) {
    return api("/api/payments/incomplete", { payment }).catch(console.error);
  }

  let pending = null;
  function login() {
    return (pending ||= doLogin().finally(() => { pending = null; }));
  }
  async function doLogin() {
    if (!(await initDone)) throw new Error(I18N.t("t.openInPi"));
    let ref = null;
    try { ref = new URLSearchParams(location.search).get("ref") || localStorage.getItem("oasis_ref"); } catch {}
    // "payments" scope is required for the VIP subscription (Pi.createPayment).
    const auth = await withTimeout(
      window.Pi.authenticate(["username", "payments", "wallet_address"], onIncompletePaymentFound),
      120000
    );
    // Only the accessToken is sent. The server exchanges it with App Studio
    // and trusts only the identity App Studio returns (uid/username here are ignored).
    const res = await api("/api/auth", { accessToken: auth.accessToken, ref });
    session = res.session;
    user = res.user;
    return res;
  }

  // Buys 30 days of a membership ("bronze" | "silver" | "gold"). The server checks the price.
  function buyVip(tierId) {
    const tier = window.OasisLogic.TIERS.find((x) => x.id === tierId && x.price);
    if (!tier) return Promise.reject(new Error(I18N.t("e.payment")));
    return pay({
      amount: tier.price,
      memo: `Pi Oasis – ${tier.id[0].toUpperCase() + tier.id.slice(1)} membership (30 days)`,
      metadata: { type: "vip_month", tier: tier.id },
    });
  }
  // Date shop: 5000 dates per 1 Pi
  function buyDates(packId) {
    const pack = window.OasisLogic.PACKS.find((x) => x.id === packId);
    if (!pack) return Promise.reject(new Error(I18N.t("e.payment")));
    return pay({ amount: pack.price, memo: `Pi Oasis – ${pack.dates} dates`, metadata: { type: "dates", pack: pack.id } });
  }
  // testJRY store (Testnet): pay Test-Pi, receive testJRY in the saved wallet
  function buyJry(pi) {
    return pay({ amount: pi, memo: `Pi Oasis – testJRY for ${pi} Test-Pi`, metadata: { type: "jry", pi } });
  }
  // Kombat coins: 200,000 per Pi
  function buyCoins(packId) {
    const pack = window.KombatLogic.COIN_PACKS.find((x) => x.id === packId);
    if (!pack) return Promise.reject(new Error(I18N.t("e.payment")));
    return pay({ amount: pack.price, memo: `Jerry Kombat – ${pack.coins} coins`, metadata: { type: "kcoins", pack: pack.id } });
  }
  // Lucky wheel: 10 spins for 0.5 Pi
  function buySpins() {
    const W = window.OasisLogic.WHEEL;
    return pay({ amount: W.PRICE, memo: `Pi Oasis – ${W.SPINS} wheel spins`, metadata: { type: "spins" } });
  }
  // Business showcase: pay for a listing (the owner reviews it before it is shown)
  function buySponsor(id, plan) {
    return pay({ amount: plan.price, memo: `Pi Oasis showcase – ${plan.days} days`, metadata: { type: "sponsor", ad: id, plan: plan.id } });
  }
  // Points market: pay the seller's price for one offer
  function buyMk(o) {
    return pay({ amount: o.pi, memo: `Pi Oasis market #${o.id}`, metadata: { type: "mk", offer: o.id } });
  }
  // JRY, the in-game currency
  function buyJryPts(packId) {
    const pack = window.KombatLogic.JRYP.PACKS.find((x) => x.id === packId);
    if (!pack) return Promise.reject(new Error(I18N.t("e.payment")));
    return pay({ amount: pack.price, memo: `Jerry Development – ${pack.jry} JRY`, metadata: { type: "jrypts", pack: pack.id } });
  }
  // Players' testJRY market: pay the seller's price for one offer
  function buyOffer(o) {
    return pay({ amount: o.pi, memo: `testJRY market #${o.id}`, metadata: { type: "p2p", offer: o.id } });
  }
  let payOpen = true; // false on Mainnet until the app wallet is approved (set from the account)
  function pay(paymentData) {
    return new Promise((resolve, reject) => {
      if (!piReady || !session) return reject(new Error(I18N.t("t.loginFirst")));
      if (!payOpen) return reject(new Error(I18N.t("e.payClosed")));
      window.Pi.createPayment(
        paymentData,
        {
          onReadyForServerApproval: (paymentId) =>
            api("/api/payments/approve", { paymentId }).catch((e) => {
              console.error("approve failed", e.code);
              reject(e);
            }),
          onReadyForServerCompletion: (paymentId, txid) =>
            api("/api/payments/complete", { paymentId, txid }).then(resolve, reject),
          onCancel: () => reject(new Error(I18N.t("e.cancelled"))),
          onError: () => reject(new Error(I18N.t("e.payment"))),
        }
      );
    });
  }

  // Rewarded ad (Pi Ad Network). Returns the adId when fully watched, otherwise null.
  // The server double-checks the adId with Pi before giving the reward.
  // Why ads can or can't play right now (shown on the Jerry Media Earnings page)
  // ok | nopi (not in Pi Browser) | old (Pi Browser too old) | pending (Pi hasn't enabled ads for this app yet)
  async function adsStatus() {
    if (!(await initDone) || !window.Pi || !window.Pi.Ads) return { s: "nopi" };
    try {
      if (window.Pi.nativeFeaturesList) {
        const f = await withTimeout(window.Pi.nativeFeaturesList(), 6000);
        if (Array.isArray(f) && !f.includes("ad_network")) return { s: "old" };
      }
      const ready = await withTimeout(window.Pi.Ads.isAdReady("rewarded"), 8000);
      if (ready && ready.ready) return { s: "ok" };
      const req = await withTimeout(window.Pi.Ads.requestAd("rewarded"), 12000);
      return req && req.result === "AD_LOADED" ? { s: "ok" } : { s: "pending", code: (req && req.result) || "" };
    } catch (e) { return { s: "pending", code: String((e && e.message) || e).slice(0, 60) }; }
  }
  async function showRewardedAd() {
    try {
      if (!piReady || !window.Pi.Ads) return null;
      const ready = await window.Pi.Ads.isAdReady("rewarded");
      if (!ready.ready) {
        const req = await window.Pi.Ads.requestAd("rewarded");
        if (req.result !== "AD_LOADED") return null;
      }
      const res = await window.Pi.Ads.showAd("rewarded");
      return res.result === "AD_REWARDED" ? res.adId || null : null;
    } catch (e) {
      console.warn("ad error", e);
      return null;
    }
  }

  window.PiBridge = {
    get user() { return user; },
    get loggedIn() { return !!session; },
    get piAvailable() { return piReady; },
    login,
    buyVip,
    buyDates,
    buyJry,
    buyCoins,
    buyJryPts,
    buySpins,
    setPayOpen: (v) => { payOpen = v !== false; },
    buyMk,
    wheelSpin: () => api("/api/wheel/spin", {}),
    earnAd: (adId) => api("/api/earn/ad", { adId }),
    earnTop: () => api("/api/earn/top"),
    arcade: () => api("/api/arcade"),
    arcadeClaim: (game, score, ms) => api("/api/arcade/claim", { game, score, ms }),
    sponsors: () => api("/api/sponsors"),
    sponsorClick: (id) => api("/api/sponsors/click", { id }).catch(() => {}),
    sponsorDraft: (o) => api("/api/sponsors/draft", o),
    sponsorAdmin: (action, id, note) => api("/api/admin/sponsors", { action, id, note }),
    buySponsor,
    adsStatus,
    mk: () => api("/api/mk"),
    mkOffer: (o) => api("/api/mk/offer", o),
    mkCancel: (id) => api("/api/mk/cancel", { id }),
    mkWithdraw: () => api("/api/mk/withdraw", {}),
    jryPtsSwap: (n, to) => api("/api/jrypts/swap", { n, to }),
    buyOffer,
    p2p: () => api("/api/p2p"),
    p2pOffer: (o) => api("/api/p2p/offer", o),
    p2pCheck: (id) => api("/api/p2p/check", { id }),
    p2pCancel: (id) => api("/api/p2p/cancel", { id }),
    jryRetry: () => api("/api/jry/retry", {}),
    showRewardedAd,
    me: () => api("/api/me"),
    action: (action) => api("/api/action", { action }),
    leaderboard: () => api("/api/leaderboard"),
    redeemVip: () => api("/api/referral/redeem-vip", {}),
    partners: (action, username) => api("/api/admin/partners", { action, username }),
    kombatTop: (week) => api("/api/kombat/top" + (week ? "?week=1" : "")),
    kombatWeekClaim: () => api("/api/kombat/week/claim", {}),
    kombatBoss: () => api("/api/kombat/boss"),
    stats: () => api("/api/stats"),
    kombatBossClaim: () => api("/api/kombat/boss/claim", {}),
    players: () => api("/api/admin/players", {}),
    airdrop: () => api("/api/admin/airdrop", {}),
    token: (action, extra) => api("/api/admin/token", Object.assign({ action }, extra || {})),
    jryMarket: () => api("/api/jry/market"),
    community: () => api("/api/community"),
    nft: () => api("/api/nft"),
    tribes: () => api("/api/tribes"),
    partnerRequest: (note) => api("/api/partner/request", { note }),
    partnerRequests: (action, uid) => api("/api/admin/partner-requests", { action, uid }),
    tribeCreate: (name, emoji) => api("/api/tribes/create", { name, emoji }),
    tribeJoin: (id) => api("/api/tribes/join", { id }),
    tribeLeave: () => api("/api/tribes/leave", {}),
    tribeClaim: () => api("/api/tribes/claim", {}),
    nftMint: (kind) => api("/api/nft/mint", { kind }),
    nftList: (id, price) => api("/api/nft/list", { id, price }),
    nftBuy: (id, price) => api("/api/nft/buy", { id, price }),
    vote: (id, opt) => api("/api/community/vote", { id, opt }),
    polls: (action, extra) => api("/api/admin/polls", Object.assign({ action }, extra || {})),
    saveWallet: (address) => api("/api/kombat/wallet", { address }),
    airdropBlock: (username, on) => api("/api/admin/airdrop/block", { username, on }),
    testGifts: (action) => api("/api/admin/test-gifts", { action }),
    setInviter: (username) => api("/api/referral/set-inviter", { username }),
    withdraw: () => api("/api/referral/withdraw", {}),
  };
})();
