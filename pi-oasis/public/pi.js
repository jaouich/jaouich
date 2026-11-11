// ربط اللعبة مع Pi SDK والسيرفر.
// خارج Pi Browser كتخدم اللعبة فـ"وضع التجربة" (demo) بلا خلاص حقيقي.
(function () {
  const cfg = window.OASIS_CONFIG;
  let piReady = false;
  let user = null; // { username, uid }
  let session = null; // التوكن ديال السيرفر

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
      if (!r.ok) throw new Error(I18N.t("e." + (data.error || "server")));
      return data;
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);
  }

  try {
    if (window.Pi) {
      window.Pi.init({ version: "2.0", sandbox: cfg.SANDBOX });
      piReady = true;
    }
  } catch (e) {
    console.warn("Pi SDK init failed", e);
  }

  // خلاص ما كملش من قبل (مثلا تقطع الإنترنت): كنصيفطوه للسيرفر يكملو
  function onIncompletePaymentFound(payment) {
    return api("/api/payments/incomplete", { payment }).catch(console.error);
  }

  async function login() {
    if (!piReady) throw new Error(I18N.t("t.openInPi"));
    const ref = new URLSearchParams(location.search).get("ref") || localStorage.getItem("oasis_ref");
    const auth = await withTimeout(
      window.Pi.authenticate(["username", "payments"], onIncompletePaymentFound),
      15000
    );
    const res = await api("/api/auth", { accessToken: auth.accessToken, ref });
    session = res.session;
    user = res.user;
    return res;
  }

  function buyVip() {
    return new Promise((resolve, reject) => {
      if (!piReady || !session) return reject(new Error(I18N.t("t.loginFirst")));
      window.Pi.createPayment(
        {
          amount: cfg.VIP_PRICE,
          memo: "Pi Oasis – 1 month VIP",
          metadata: { type: "vip_month" },
        },
        {
          onReadyForServerApproval: (paymentId) =>
            api("/api/payments/approve", { paymentId }).catch(reject),
          onReadyForServerCompletion: (paymentId, txid) =>
            api("/api/payments/complete", { paymentId, txid }).then(resolve, reject),
          onCancel: () => reject(new Error(I18N.t("e.cancelled"))),
          onError: () => reject(new Error(I18N.t("e.payment"))),
        }
      );
    });
  }

  // إعلان بمكافأة (Pi Ad Network). كيرجع true إلا تفرج اللاعب فالإعلان كامل.
  async function showRewardedAd() {
    try {
      if (!piReady || !window.Pi.Ads) return false;
      const ready = await window.Pi.Ads.isAdReady("rewarded");
      if (!ready.ready) {
        const req = await window.Pi.Ads.requestAd("rewarded");
        if (req.result !== "AD_LOADED") return false;
      }
      const res = await window.Pi.Ads.showAd("rewarded");
      return res.result === "AD_REWARDED";
    } catch (e) {
      console.warn("ad error", e);
      return false;
    }
  }

  window.PiBridge = {
    get user() { return user; },
    get loggedIn() { return !!session; },
    get piAvailable() { return piReady; },
    login,
    buyVip,
    showRewardedAd,
    me: () => api("/api/me"),
    submitScore: (weekScore) => api("/api/score", { weekScore }),
    leaderboard: () => api("/api/leaderboard"),
    redeemVip: () => api("/api/referral/redeem-vip", {}),
    withdraw: () => api("/api/referral/withdraw", {}),
  };
})();
