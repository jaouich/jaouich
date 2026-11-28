// Share buttons: WhatsApp, Facebook, Telegram, X, Messenger, copy, and the phone's own share sheet.
// JShare.bar(el, { url, text, labels }) fills el with the buttons.
(function () {
  const enc = encodeURIComponent;
  const ICONS = { wa: "🟢", fb: "🔵", tg: "✈️", x: "✖️", ms: "💬", copy: "🔗", more: "📤" };
  const NAMES = { wa: "WhatsApp", fb: "Facebook", tg: "Telegram", x: "X", ms: "Messenger" };
  // Every link to this app carries the sharer's ?ref so each share is attributed (one place for all surfaces)
  function withRef(url) {
    try {
      const u = new URL(url, location.href), G = window.OasisGame;
      if (u.origin === location.origin && !u.searchParams.has("ref") && G && G.account) u.searchParams.set("ref", G.account.username);
      return u.toString();
    } catch (e) { return url; }
  }
  const tracked = () => { try { if (window.PiBridge && window.OasisGame && window.OasisGame.account) window.PiBridge.track("share_click").catch(() => {}); } catch (e) {} };
  function links(url, text) {
    const both = text ? text + "\n" + url : url;
    return {
      wa: "https://wa.me/?text=" + enc(both),
      fb: "https://www.facebook.com/sharer/sharer.php?u=" + enc(url),
      tg: "https://t.me/share/url?url=" + enc(url) + "&text=" + enc(text || ""),
      x: "https://twitter.com/intent/tweet?text=" + enc(text || "") + "&url=" + enc(url),
      ms: "fb-messenger://share/?link=" + enc(url),
    };
  }
  function bar(el, o) {
    o = { ...o, url: withRef(o.url) };
    const L = links(o.url, o.text), lab = o.labels || {};
    const keys = ["wa", "fb", "tg", "x", "ms"];
    el.classList.add("jshare");
    el.innerHTML = keys.map((k) => `<a class="js-b js-${k}" href="${L[k]}" target="_blank" rel="noopener"><i>${ICONS[k]}</i><span>${NAMES[k]}</span></a>`).join("")
      + `<button class="js-b js-copy" type="button"><i>${ICONS.copy}</i><span>${lab.copy || "Copy"}</span></button>`
      + (navigator.share ? `<button class="js-b js-more" type="button"><i>${ICONS.more}</i><span>${lab.more || "More"}</span></button>` : "");
    el.querySelectorAll("a.js-b").forEach((a) => a.addEventListener("click", tracked));
    el.querySelector(".js-copy").addEventListener("click", (e) => {
      tracked();
      const done = () => { const s = e.currentTarget.querySelector("span"); s.textContent = lab.copied || "✓"; setTimeout(() => (s.textContent = lab.copy || "Copy"), 1500); };
      (navigator.clipboard ? navigator.clipboard.writeText((o.text ? o.text + "\n" : "") + o.url) : Promise.reject()).then(done, () => { prompt("", o.url); });
    });
    const more = el.querySelector(".js-more");
    if (more) more.addEventListener("click", () => { tracked(); navigator.share({ text: o.text || "", url: o.url }).catch(() => {}); });
  }
  window.JShare = { bar, links, withRef };
})();
