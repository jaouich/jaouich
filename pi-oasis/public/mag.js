// 🎨 Manga and magazine inside the app: the feed comes from the Jerry Magazine Worker (through /api/mag).
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fdate = (d) => { try { return new Date(d + "T12:00:00Z").toLocaleDateString(window.I18N.lang === "ar" ? "ar-MA" : window.I18N.lang, { month: "short", day: "numeric", timeZone: "UTC" }); } catch (e) { return d; } };
  let open = false, feed = null, tab = "manga", series = null, chap = null;

  const newest = () => { if (!feed) return ""; const ds = [...feed.manga.flatMap((s) => s.chapters.map((c) => c.date)), ...feed.posts.map((p) => p.date)].filter(Boolean).sort(); return ds[ds.length - 1] || ""; };
  const seen = () => { try { return localStorage.getItem("oasis_mag_seen") || ""; } catch (e) { return ""; } };
  function badge() {
    const el = $("magBadge"); if (!el) return;
    const n = newest();
    el.textContent = n && n > seen() ? "🆕 " + t("mag.new") : "";
    el.classList.toggle("hot", !!el.textContent);
  }
  async function load() {
    try { feed = await Pi.mag(); } catch (e) { feed = { manga: [], posts: [], courses: [] }; }
    badge(); if (open) render();
  }
  function render() {
    const el = $("mag");
    if (el.classList.contains("hidden")) return;
    let body = "";
    if (!feed) body = `<p class="jm-note">…</p>`;
    else if (tab === "manga" && chap) {
      const s = series, i = s.chapters.findIndex((c) => c.n === chap.n), next = s.chapters[i - 1], prev = s.chapters[i + 1];
      body = `<h3 class="mg-t">${esc(s.title)} · ${t("mag.chapter")} ${chap.n}</h3><p class="jm-note">${esc(chap.title)}</p><div class="mg-panels">${chap.panels.map((u, k) => `<img src="${esc(u)}" alt="" loading="${k < 2 ? "eager" : "lazy"}">`).join("")}</div>
        <div class="mg-nav">${prev ? `<button data-mg="chap" data-n="${prev.n}">→ ${t("mag.prev")}</button>` : "<span></span>"}${next ? `<button data-mg="chap" data-n="${next.n}">${t("mag.next")} ←</button>` : `<span class="jm-note">${t("mag.soon")}</span>`}</div>
        <button class="btn small secondary mg-web" data-mg="web" data-u="${esc(chap.url)}">💬 ${t("mag.comments")}</button>`;
    } else if (tab === "manga" && series) {
      body = `<h3 class="mg-t">${esc(series.title)}</h3><p class="jm-note">${esc(series.blurb)}</p>${series.chapters.map((c, k) => `<button class="mg-row" data-mg="chap" data-n="${c.n}"><b>${t("mag.chapter")} ${c.n}</b><span>${esc(c.title)}</span>${k === 0 ? `<em>${t("mag.latest")}</em>` : ""}<small>${fdate(c.date)}</small></button>`).join("")}`;
    } else if (tab === "manga") {
      body = feed.manga.length ? feed.manga.map((s) => `<button class="mg-card" data-mg="series" data-id="${esc(s.id)}"><img src="${esc(s.cover)}" alt=""><div><b>${esc(s.title)}</b><p>${esc(s.blurb)}</p><small>${s.chapters.length} ${t("mag.chapters")} · ${t("mag.latest")}: ${esc(s.chapters[0].title)}</small></div></button>`).join("") : `<p class="jm-note">${t("mag.none")}</p>`;
    } else if (tab === "posts") {
      body = feed.posts.length ? feed.posts.map((p) => `<button class="mg-card" data-mg="web" data-u="${esc(p.url)}"><img src="${esc(p.image)}" alt=""><div><b>${esc(p.title)}</b><p>${esc(p.excerpt)}</p><small>${fdate(p.date)}</small></div></button>`).join("") : `<p class="jm-note">${t("mag.none")}</p>`;
    } else if (tab === "docs") {
      const D = feed.docs || [];
      body = D.length ? `<p class="jm-note">${t("mag.docsNote")}</p>` + D.map((d) => `<button class="mg-card" data-mg="web" data-u="${esc(d.url)}"><img src="${esc(d.image)}" alt=""><div><b>${esc(window.I18N.lang === "ar" ? d.title.ar : d.title.en)}</b><p>${esc(window.I18N.lang === "ar" ? d.title.en : d.title.ar)}</p><small>🎬 ${t("mag.episode")} ${d.n} · AR / EN</small></div></button>`).join("") : `<p class="jm-note">${t("mag.none")}</p>`;
    } else {
      body = feed.courses.length ? `<p class="jm-note">${t("mag.coursesNote")}</p>` + feed.courses.map((c) => `<button class="mg-card" data-mg="web" data-u="${esc(c.url)}"><img src="${esc(c.image)}" alt=""><div><b>${esc(c.title)}</b><p>${esc(c.course)} · ${t("mag.lesson")} ${c.n}</p></div></button>`).join("") : `<p class="jm-note">${t("mag.none")}</p>`;
    }
    const inner = series || chap;
    el.innerHTML = `<header class="jm-head"><button class="jm-back" data-mg="${chap ? "toseries" : series ? "tolist" : "close"}">‹ ${chap || series ? t("mag.back") : t("jm.back")}</button><b>🎨 ${t("mag.t")}</b><span></span></header>
      ${inner ? "" : `<div class="mg-tabs">${["manga", "posts", "docs", "courses"].map((k) => `<button data-mg="tab" data-k="${k}" class="${tab === k ? "on" : ""}">${t("mag.tab." + k)}</button>`).join("")}</div>`}<div class="jm-body">${body}</div>`;
    if (chap) el.querySelector(".jm-body").scrollTop = 0;
  }
  $("mag").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mg]"); if (!b) return;
    const a = b.dataset.mg;
    if (a === "close") { open = false; $("mag").classList.add("hidden"); badge(); }
    else if (a === "tab") { tab = b.dataset.k; series = chap = null; render(); }
    else if (a === "series") { series = feed.manga.find((s) => s.id === b.dataset.id); render(); }
    else if (a === "chap") { chap = series.chapters.find((c) => c.n === Number(b.dataset.n)); render(); }
    else if (a === "toseries") { chap = null; render(); }
    else if (a === "tolist") { series = null; render(); }
    else if (a === "web") { try { window.open(b.dataset.u, "_blank", "noopener"); } catch (err) { location.href = b.dataset.u; } }
  });
  $("magOpen").addEventListener("click", () => {
    open = true; $("mag").classList.remove("hidden"); series = chap = null; render(); load();
    const n = newest(); if (n) { try { localStorage.setItem("oasis_mag_seen", n); } catch (e) {} }
    badge();
  });
  document.addEventListener("langchange", () => { badge(); render(); });
  setTimeout(load, 2500);
})();
