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

  // Pi.init must finish before Pi.authenticate. Sandbox is detected automatically.
  const initDone = (async () => {
    if (!window.Pi) return false;
    try {
      await window.Pi.init({ version: "2.0" });
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
      window.Pi.authenticate(["username", "payments"], onIncompletePaymentFound),
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
  function pay(paymentData) {
    return new Promise((resolve, reject) => {
      if (!piReady || !session) return reject(new Error(I18N.t("t.loginFirst")));
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
    saveWallet: (address) => api("/api/kombat/wallet", { address }),
    airdropBlock: (username, on) => api("/api/admin/airdrop/block", { username, on }),
    testGifts: (action) => api("/api/admin/test-gifts", { action }),
    setInviter: (username) => api("/api/referral/set-inviter", { username }),
    withdraw: () => api("/api/referral/withdraw", {}),
  };
})();
