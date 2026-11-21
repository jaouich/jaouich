// In-app text box: window.prompt() shows no input field in some phone browsers.
// OasisAsk(message, defaultValue, { number }) -> Promise of the text, or null if cancelled.
(function () {
  const L = () => { let l = "en"; try { l = (window.I18N && window.I18N.lang) || localStorage.getItem("oasis_lang") || "en"; } catch (e) {} return { ar: ["موافق", "إلغاء"], fr: ["OK", "Annuler"] }[l] || ["OK", "Cancel"]; };
  window.OasisAsk = (msg, def, o) => new Promise((resolve) => {
    const [ok, no] = L(), d = document.createElement("div");
    d.className = "ask-bg";
    d.innerHTML = `<form class="ask-card"><p></p><input class="ask-in" autocomplete="off" maxlength="300"><div class="ask-btns"><button type="button" class="btn secondary" data-x="0"></button><button type="submit" class="btn gold"></button></div></form>`;
    d.querySelector("p").textContent = msg;
    const inp = d.querySelector("input");
    inp.value = def || ""; if (o && o.number) inp.inputMode = "numeric";
    d.querySelector('[data-x]').textContent = no; d.querySelector('[type=submit]').textContent = ok;
    const done = (v) => { d.remove(); resolve(v); };
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-x]")) done(null); });
    d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); done(inp.value); });
    document.body.appendChild(d); setTimeout(() => inp.focus(), 50);
  });
})();
