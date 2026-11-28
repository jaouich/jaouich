// Usage measurement: once per day and system, tells the server which systems a signed-in player opens (no personal data, no text).
(function () {
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G || !Pi || !Pi.track) return;
  const IDS = { kombatOpen: "open_kombat", derbyOpen: "open_derby", mergeOpen: "open_merge", earnOpen: "open_earn", qOpen: "open_quests", wheelOpen: "open_wheel", arcOpen: "open_arcade", courtOpen: "open_court", seasonOpen: "open_season", vipcOpen: "open_vipc", castleOpen: "open_castle", magOpen: "open_magazine", catOpen: "open_catalog", mkOpen: "open_market", boxOpen: "open_box", chatOpen: "open_chat", svcOpen: "open_services", jryOpen: "open_jry", bizOpen: "open_biz", lvBar: "open_levels", achBar: "open_streak", pmTree: "palm_tap" };
  const TABS = { camels: "tab_camels", city: "tab_city", stake: "tab_granary", rank: "tab_rank", vip: "tab_club" };
  const day = () => Math.floor(Date.now() / 86400000);
  function send(name) {
    if (!name || !G.account) return;
    try { const k = "oasis_ev_" + name; if (localStorage.getItem(k) === String(day())) return; localStorage.setItem(k, String(day())); } catch (e) {}
    Pi.track(name).catch(() => {});
  }
  const hit = (e) => {
    const el = e.target.closest && e.target.closest("button, a");
    if (!el) return;
    if (el.id && IDS[el.id]) return send(IDS[el.id]);
    const tab = el.dataset && el.dataset.tab;
    if (tab && TABS[tab]) send(TABS[tab]);
  };
  document.addEventListener("click", hit, true);
  document.addEventListener("pointerdown", (e) => { if (e.target.closest && e.target.closest("#pmTree")) send("palm_tap"); }, true);
})();
