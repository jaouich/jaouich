// Web-only ad banner (outside Pi Browser). Off until OASIS_CONFIG.WEB_AD_UNIT is set to an https banner address.
// Never shown in Pi Browser or the Pi Sandbox, never before the visitor accepts, never linked to rewards.
(function () {
  const cfg = window.OASIS_CONFIG || {}, unit = String(cfg.WEB_AD_UNIT || "");
  if (!/^https:\/\//.test(unit)) return;
  if (/PiBrowser/i.test(navigator.userAgent) || window.PI_SANDBOX) return;
  const slot = document.getElementById("webAd");
  if (!slot) return;
  let lang = "en";
  try { lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("oasis_lang") || "en"; } catch (e) {}
  if (!["ar", "en", "fr"].includes(lang)) lang = "en";
  const T = {
    en: { ad: "Advertisement", ask: "This page can show ads from a partner network, which may use cookies.", ok: "Accept", no: "No thanks", more: "Privacy" },
    ar: { ad: "إعلان", ask: "قد تعرض هذه الصفحة إعلانات من شبكة شريكة، وقد تستخدم ملفات تعريف الارتباط.", ok: "أوافق", no: "لا، شكرًا", more: "الخصوصية" },
    fr: { ad: "Publicité", ask: "Cette page peut afficher des publicités d'un réseau partenaire, qui peut utiliser des cookies.", ok: "Accepter", no: "Non merci", more: "Confidentialité" },
  }[lang];
  const get = () => { try { return localStorage.getItem("oasis_webads"); } catch (e) { return null; } };
  const set = (v) => { try { localStorage.setItem("oasis_webads", v); } catch (e) {} };
  function show() {
    slot.innerHTML = `<small class="wa-l">${T.ad}</small><iframe title="${T.ad}" src="${unit}" loading="lazy" scrolling="no" style="border:0;width:100%;max-width:728px;height:90px;overflow:hidden" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;
  }
  function ask() {
    slot.innerHTML = `<p class="wa-q">${T.ask} <a href="privacy.html?lang=${lang}">${T.more}</a></p><button type="button" data-a="1">${T.ok}</button> <button type="button" data-a="0">${T.no}</button>`;
    slot.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; set(b.dataset.a); slot.onclick = null; b.dataset.a === "1" ? show() : (slot.innerHTML = ""); };
  }
  slot.style.cssText = "text-align:center;margin:18px 0;font-size:.8rem;opacity:.95";
  const v = get();
  if (v === "1") show(); else if (v === null) ask();
})();
