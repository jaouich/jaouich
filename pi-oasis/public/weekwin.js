// 🏅 Last week's winners (bottom of the Ranking tab) and the one-time "you won" card for each winner.
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => window.I18N.t(k, v);
  const G = window.OasisGame, Pi = window.PiBridge;
  if (!G || !$("lastWeek")) return;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const pi = (n) => (Math.round(Number(n) * 1000) / 1000).toString();
  let mine = null, lastData = null, lastMe = "";
  const medal = (p) => (p <= 3 ? ["🥇", "🥈", "🥉"][p - 1] : p + ".");

  function piLine(w) {
    if (w.pi > 0) return w.piStatus === "sent" || w.sent ? t("lw.pi.sent", { pi: pi(w.pi) }) : t("lw.pi.waiting", { pi: pi(w.pi) });
    return t("lw.nopi");
  }
  function openBox() { const b = $("boxOpen"); if (b) { const x = document.querySelector("[data-tab=farm]"); if (x) x.click(); setTimeout(() => b.click(), 50); } }
  function draw(last, me) {
    lastData = last; lastMe = me;
    const el = $("lastWeek");
    const w = mine && mine.won;
    const card = w ? `<div class="lw-me"><b>🏆 ${t("lw.you", { p: w.place })}</b><span>${piLine(w)}</span><span>${t("lw.rewards", { d: fmtN(w.dates), j: fmtN(w.jry) })}${w.camel ? " · " + t("lw.camel") : ""}</span><button class="btn small gold" data-lw="box" type="button">${t("lw.box")}</button></div>` : "";
    const list = last && last.winners && last.winners.length
      ? last.winners.map((r) => `<div class="lw-row ${r.username === me ? "me" : ""}"><span class="lw-p">${medal(r.place)}</span><span class="lw-n">${esc(r.username)}</span><b dir="ltr">${r.pi > 0 ? pi(r.pi) + " π" + (r.sent ? " ✅" : " 🎁") : "—"}</b><small dir="ltr">${fmtN(r.dates)} 🌴 · ${fmtN(r.jry)} JRY</small></div>`).join("") + `<p class="hint">${t("lw.more")}</p>`
      : `<p class="hint">${t("lw.none")}</p>`;
    el.innerHTML = `<h3>${t("lw.t")}</h3>${card}${list}`;
  }
  $("lastWeek").addEventListener("click", (e) => { if (e.target.closest("[data-lw=box]")) openBox(); });

  function popup(w, week) {
    const d = document.createElement("div");
    d.className = "ask-bg";
    d.innerHTML = `<div class="ask-card lw-pop"><h3>${t("lw.popup.t", { p: w.place })}</h3><p>${piLine(w)}</p><p>${t("lw.rewards", { d: fmtN(w.dates), j: fmtN(w.jry) })}${w.camel ? " · " + t("lw.camel") : ""}</p>
      <div class="ask-btns"><button class="btn gold" data-x="box" type="button">${t("lw.box")}</button><button class="btn secondary" data-x="close" type="button">${t("lw.close")}</button></div></div>`;
    d.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]");
      if (!x && e.target !== d) return;
      d.remove();
      if (x && x.dataset.x === "box") openBox();
    });
    document.body.appendChild(d);
    try { localStorage.setItem("oasis_wk_seen", String(week)); } catch (e) {}
  }
  async function load() {
    try { mine = await Pi.weekMine(); } catch (e) { return; }
    if (lastData) draw(lastData, lastMe);
    const w = mine && mine.won; if (!w) return;
    let seen = ""; try { seen = localStorage.getItem("oasis_wk_seen") || ""; } catch (e) {}
    if (seen !== String(mine.week)) setTimeout(() => popup(w, mine.week), 1500);
  }
  window.OasisWeekWin = { draw };
  let tries = 0;
  const wait = setInterval(() => { if (G.account) { clearInterval(wait); load(); } else if (++tries > 60) clearInterval(wait); }, 1000);
  document.addEventListener("langchange", () => lastData && draw(lastData, lastMe));
})();
