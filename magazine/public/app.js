// Small helpers for the magazine: comments, voting and the newsletter form (all talk to /api/*).
(function () {
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const api = (p, body) => fetch(p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json().catch(() => ({})));
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const say = (el, m) => { const p = el.querySelector(".msg"); if (p) p.textContent = m; };
  const ERR = { links: "الروابط غير مسموحة في التعليقات.", fast: "تمهّل قليلًا ثم أعد المحاولة.", long: "النص طويل جدًا.", email: "اكتب بريدًا صحيحًا.", empty: "اكتب شيئًا أولًا.", busy: "الخدمة مشغولة الآن، حاول لاحقًا." };
  $$("[data-comments]").forEach((box) => {
    const slug = box.dataset.slug, list = box.querySelector(".list"), form = box.querySelector("form");
    const load = () => api("/api/comments?slug=" + encodeURIComponent(slug)).then((r) => { list.innerHTML = (r.comments || []).length ? r.comments.map((c) => `<div class="cm"><b>${esc(c.name || "زائر")}</b><small>${new Date(c.at).toLocaleDateString("ar-MA")}</small><p>${esc(c.text)}</p></div>`).join("") : "<p class='msg'>كن أول من يعلّق.</p>"; });
    load();
    form.addEventListener("submit", async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(form)); const r = await api("/api/comment", { slug, name: d.name, text: d.text }); if (r.ok) { form.reset(); say(form, "شكرًا، تم نشر تعليقك."); load(); } else say(form, ERR[r.error] || "تعذّر الإرسال."); });
  });
  $$("[data-vote]").forEach((box) => {
    const week = box.dataset.week, key = "mag_vote_" + week; let mine = null; try { mine = localStorage.getItem(key); } catch (e) {}
    const paint = (counts) => { const tot = Math.max(1, Object.values(counts).reduce((a, b) => a + b, 0)); $$(".vt", box).forEach((b) => { const n = counts[b.dataset.id] || 0; b.querySelector("b").textContent = n; b.querySelector("i").style.width = (100 * n) / tot + "%"; b.classList.toggle("on", b.dataset.id === mine); }); };
    api("/api/votes?week=" + week).then((r) => paint(r.counts || {}));
    box.addEventListener("click", async (e) => { const b = e.target.closest(".vt"); if (!b) return; const r = await api("/api/vote", { week, topic: b.dataset.id }); if (r.ok) { mine = b.dataset.id; try { localStorage.setItem(key, mine); } catch (e2) {} paint(r.counts); say(box, "تم تسجيل صوتك."); } else say(box, ERR[r.error] || "تعذّر التصويت."); });
  });
  $$("[data-sub]").forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/api/subscribe", { email: new FormData(f).get("email") }); say(f, r.ok ? "تم الاشتراك. شكرًا!" : ERR[r.error] || "تعذّر الاشتراك."); if (r.ok) f.reset(); }));
  // Share bar: Facebook, WhatsApp, Telegram, X, copy and the phone's own share sheet
  $$("[data-share]").forEach((box) => {
    const url = location.origin + location.pathname, title = box.dataset.title || document.title, enc = encodeURIComponent, b = box.querySelector(".share-b");
    const L = [["f", "Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + enc(url)], ["w", "WhatsApp", "https://wa.me/?text=" + enc(title + "\n" + url)], ["t", "Telegram", "https://t.me/share/url?url=" + enc(url) + "&text=" + enc(title)], ["x", "X", "https://twitter.com/intent/tweet?text=" + enc(title) + "&url=" + enc(url)]];
    b.innerHTML = L.map(([k, n, h]) => `<a class="sb sb-${k}" href="${h}" target="_blank" rel="noopener">${n}</a>`).join("") + `<button type="button" class="sb sb-c">🔗 نسخ الرابط</button>` + (navigator.share ? `<button type="button" class="sb sb-m">📤 المزيد</button>` : "");
    b.querySelector(".sb-c").addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(url); e.target.textContent = "✓ تم النسخ"; setTimeout(() => (e.target.textContent = "🔗 نسخ الرابط"), 1500); } catch (x) {} });
    const m = b.querySelector(".sb-m"); if (m) m.addEventListener("click", () => navigator.share({ title, url }).catch(() => {}));
  });
  // Code of the day from the game (first player to use it wins)
  $$("[data-daycode]").forEach((box) => {
    const body = box.querySelector(".dc-body");
    fetch(box.dataset.api).then((r) => r.json()).then((d) => {
      if (!d || d.error) { box.hidden = true; return; }
      if (!d.code) { body.innerHTML = "<p><b>تم أخذ كود اليوم.</b> كود جديد غدًا، فعُد في الوقت المناسب!</p>"; return; }
      const text = "كود هدية في Pi Oasis: أول من يستخدمه يربح 10,000 JRY و5,000 تمرة. أسرع: " + d.code, url = box.dataset.app;
      body.innerHTML = `<div class="dc-row"><code dir="ltr">${esc(d.code)}</code><button type="button" class="sb sb-c">نسخ</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">افتح اللعبة واستخدمه</a></div><div class="share-b"><a class="sb sb-w" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text + " " + url)}">WhatsApp</a><a class="sb sb-f" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}">Facebook</a><a class="sb sb-t" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}">Telegram</a></div>`;
      body.querySelector(".sb-c").addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(d.code); e.target.textContent = "✓"; } catch (x) {} });
    }).catch(() => { box.hidden = true; });
  });
})();
