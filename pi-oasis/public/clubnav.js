/* Club tab sub-navigation: one group visible at a time */
(function () {
  var tab = document.getElementById("tab-vip"), nav = document.getElementById("clubNav");
  if (!tab || !nav) return;
  var grps = [].slice.call(tab.querySelectorAll(".club-grp"));
  var icons = { member: "👑", cards: "🃏", shop: "🛍️", invite: "🤝", owner: "🛠️" };
  var cur = "member";
  try { cur = localStorage.getItem("oasis_club_grp") || cur; } catch (e) {}
  function ownerOn() {
    return ["codeAdmin", "jdAdmin", "adminBox"].some(function (id) {
      var el = document.getElementById(id); return el && !el.classList.contains("hidden");
    });
  }
  function t(k) { try { return (window.I18N && window.I18N.t ? window.I18N.t(k) : k); } catch (e) { return k; } }
  function show(g) {
    if (g === "owner" && !ownerOn()) g = "member";
    cur = g;
    try { localStorage.setItem("oasis_club_grp", g); } catch (e) {}
    grps.forEach(function (el) { el.classList.toggle("on", el.getAttribute("data-grp") === g); });
    [].forEach.call(nav.children, function (b) { b.classList.toggle("on", b.getAttribute("data-g") === g); });
  }
  function build() {
    var names = ["member", "cards", "shop", "invite"].concat(ownerOn() ? ["owner"] : []);
    nav.innerHTML = "";
    names.forEach(function (g) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("data-g", g);
      b.innerHTML = "<i>" + icons[g] + "</i> <span data-i18n=\"club.nav." + g + "\">" + t("club.nav." + g) + "</span>";
      b.onclick = function () { show(g); tab.scrollIntoView && window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    show(cur);
  }
  build();
  setInterval(function () {
    var has = !!nav.querySelector('[data-g="owner"]');
    if (has !== ownerOn()) build();
  }, 1500);
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-lang],#langSel,.lang")) setTimeout(build, 50);
  });
})();
