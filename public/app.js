"use strict";
// Magiscom Tech Desk — application monopage (aucune dépendance)

const MB = 1024 * 1024;
const MAX_IMG = 15 * MB, MAX_VID = 95 * MB, MAX_AUD = 25 * MB, MAX_FILES = 6;
const MAX_VOICE_SEC = 300;   // message vocal : 5 minutes maximum
const STATUS = { open: "Ouvert", in_review: "En cours de traitement", resolved: "Résolu", unresolved: "Non résolu" };
const STATUS_HELP = {
  open: "Votre demande est bien reçue. Notre équipe va la prendre en charge.",
  in_review: "Notre équipe travaille sur votre demande.",
  resolved: "Le problème est réglé. Écrivez-nous s'il revient : la demande sera rouverte.",
  unresolved: "Nous n'avons pas pu régler ce problème. Écrivez-nous pour en reparler.",
};
const CATS = { ebp: "Logiciel EBP", sage: "Logiciel Sage", installation: "Installation", formation: "Formation", facturation: "Facturation / devis", autre: "Autre" };
const EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", weba: "audio/webm", wav: "audio/wav" };
const ALLOWED = new Set(Object.values(EXT));

let ME = null;
let pollTimer = null;

// ---------- Outils ----------
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const fmtDate = (ts) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
const fmtDay = (ts) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(ts));
const fmtSize = (n) => (n >= MB ? (n / MB).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko");
const badge = (s) => h("span", { class: "badge st-" + s }, STATUS[s] || s);
const ICONS = {
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3",
  video: "M23 7l-7 5 7 5V7z M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  screen: "M2 4h20v12H2z M8 20h8 M12 16v4",
  hang: "M10.7 13.3a16 16 0 0 0 3.3 2.5l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 4.2 2 2 0 0 1 5 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L9 9.9 M23 1L1 23",
  rec: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};
function icon(name) {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name].split(" M").map((x, i) => (i ? "M" + x : x))) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.append(p); }
  return h("span", { class: "ic" }, s);
}
const firstName = (n) => { const w = (n || "").split(/\s+/).filter((x) => x && !/^(m|mr|mme|mlle|m\.|mr\.|mme\.)$/i.test(x)); const f = w[0] || ""; return f.charAt(0).toUpperCase() + f.slice(1); };
const initials = (n) => (n || "?").split(/\s+/).filter((x) => x && !/^(m|mr|mme|mlle|m\.|mr\.|mme\.)$/i.test(x)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const emptyState = (ic, text, ...extra) => h("div", { class: "empty card" }, icon(ic), h("p", null, text), ...extra);
let toastT;
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500);
}
function mount(...nodes) { $("#app").replaceChildren(...nodes); window.scrollTo(0, 0); }
const go = (path) => { if (location.hash === "#" + path) router(); else location.hash = "#" + path; };
const errBox = () => h("div", { class: "err", role: "alert", hidden: true });
const showErr = (box, e) => { box.textContent = e.message || String(e); box.hidden = false; };

async function api(path, { method = "GET", body } = {}) {
  const opt = { method, headers: {}, credentials: "same-origin" };
  if (method !== "GET") opt.headers["X-Requested-With"] = "magisdesk";
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, opt); } catch { throw new Error("Pas de connexion internet"); }
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && !path.startsWith("/api/auth/")) { ME = null; go("/login"); }
  if (!r.ok) { const e = new Error(data.error || "Erreur, réessayez"); e.status = r.status; throw e; }
  return data;
}
function uploadFile(file, type, onProgress) {
  if (window.MagisDeskHooks?.upload) return window.MagisDeskHooks.upload(file, type, onProgress);
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", "/api/uploads");
    x.setRequestHeader("Content-Type", type);
    x.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "fichier"));
    x.setRequestHeader("X-Requested-With", "magisdesk");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) resolve(d.attachment);
      else reject(new Error(d.error || "Envoi du fichier impossible"));
    };
    x.onerror = () => reject(new Error("Connexion perdue pendant l'envoi du fichier"));
    x.send(file);
  });
}

// ---------- Sélecteur de photos, vidéos et messages vocaux ----------
const AUDIO_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const pickMime = (list) => { if (!window.MediaRecorder) return null; for (const t of list) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {} } return ""; };
const extOf = (type) => ({ "audio/webm": "weba", "audio/ogg": "ogg", "audio/mp4": "m4a", "video/webm": "webm", "video/mp4": "mp4" })[type] || "bin";
const clock = (sec) => Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
function mediaError(e) {
  if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) return "Accès refusé. Autorisez le micro ou la caméra dans les réglages du navigateur (icône 🔒 à côté de l'adresse).";
  if (e && e.name === "NotFoundError") return "Aucun micro ou caméra trouvé sur cet appareil.";
  if (e && e.name === "NotReadableError") return "Le micro ou la caméra est déjà utilisé par une autre application.";
  return "Micro ou caméra indisponible sur ce navigateur.";
}
function makePicker() {
  const items = []; // { file, type, url, tile, prog, att }
  const grid = h("div", { class: "picker", hidden: true });
  const input = h("input", { type: "file", accept: "image/*,video/*,audio/*", multiple: true, "aria-label": "Ajouter une photo, une vidéo ou un audio" });
  const err = errBox();
  const addBtn = h("label", { class: "btn filebtn sm" }, "📎 Photo ou vidéo", input);
  const addFile = (file) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const type = ALLOWED.has(file.type) ? file.type : EXT[ext];
    if (!type) { showErr(err, `« ${file.name} » : format non accepté (photos JPG, PNG, HEIC…, vidéos MP4, MOV… ou audio)`); return; }
    const isVid = type.startsWith("video/"), isAud = type.startsWith("audio/");
    const max = isVid ? MAX_VID : isAud ? MAX_AUD : MAX_IMG;
    if (file.size > max) { showErr(err, `« ${file.name} » est trop lourd (maximum ${max / MB} Mo).${isVid ? " Raccourcissez ou compressez la vidéo." : ""}`); return; }
    if (items.length >= MAX_FILES) { showErr(err, `Maximum ${MAX_FILES} fichiers par message.`); return; }
    const url = URL.createObjectURL(file);
    const prog = h("div", { class: "prog" });
    const it = { file, type, url, prog, att: null };
    const media = isAud ? h("div", { class: "pv-aud" }, h("span", null, "🎤 Message vocal"), h("audio", { src: url, controls: true, preload: "metadata" }))
      : isVid ? h("video", { src: url, muted: true, playsinline: true, preload: "metadata" }) : h("img", { src: url, alt: file.name });
    it.tile = h("div", { class: "pv" + (isAud ? " aud" : "") }, media,
      h("span", { class: "tag" }, (isVid ? "Vidéo · " : isAud ? "Audio · " : "") + fmtSize(file.size)),
      h("button", { type: "button", "aria-label": "Retirer", onclick: () => { URL.revokeObjectURL(url); it.tile.remove(); items.splice(items.indexOf(it), 1); grid.hidden = !items.length; } }, "×"),
      prog);
    items.push(it); grid.append(it.tile); grid.hidden = false;
  };
  input.addEventListener("change", () => { err.hidden = true; for (const file of input.files) addFile(file); input.value = ""; });

  // Message vocal enregistré directement dans le navigateur
  const recMime = pickMime(AUDIO_MIMES);
  let rec = null, recStream = null, recTimer = null, recStart = 0;
  const recBtn = h("button", { class: "btn sm", type: "button", hidden: recMime === null || !navigator.mediaDevices?.getUserMedia }, icon("mic"), "Message vocal");
  const stopRec = () => { if (rec && rec.state !== "inactive") rec.stop(); };
  recBtn.addEventListener("click", async () => {
    err.hidden = true;
    if (rec) return stopRec();
    try { recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return showErr(err, new Error(mediaError(e))); }
    const chunks = [];
    rec = new MediaRecorder(recStream, recMime ? { mimeType: recMime, audioBitsPerSecond: 48000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(recTimer); recStream.getTracks().forEach((t) => t.stop());
      const type = (rec.mimeType || recMime || "audio/webm").split(";")[0];
      rec = null; recBtn.classList.remove("rec-on"); recBtn.replaceChildren(icon("mic"), "Message vocal");
      if (!chunks.length || Date.now() - recStart < 700) return;
      const d = new Date(), stamp = String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
      addFile(new File(chunks, `message-vocal-${stamp}.${extOf(type)}`, { type }));
    };
    rec.start(1000); recStart = Date.now();
    recBtn.classList.add("rec-on");
    const tick = () => {
      const sec = (Date.now() - recStart) / 1000;
      recBtn.replaceChildren(h("span", { class: "rec-dot" }), `${clock(sec)} · Arrêter`);
      if (sec >= MAX_VOICE_SEC) stopRec();
    };
    tick(); recTimer = setInterval(tick, 500);
  });
  return {
    el: h("div", { class: "stack" }, h("div", { class: "row" }, addBtn, recBtn, h("span", { class: "muted small" }, `Jusqu'à ${MAX_FILES} fichiers · photos 15 Mo · vidéos 95 Mo · vocal 5 min`)), grid, err),
    count: () => items.length,
    busy: () => !!rec,
    stop: stopRec,
    async uploadAll() {
      const ids = [];
      for (const it of items) {
        if (!it.att) it.att = await uploadFile(it.file, it.type, (p) => (it.prog.style.width = Math.round(p * 100) + "%"));
        it.prog.style.width = "100%";
        ids.push(it.att.id);
      }
      return ids;
    },
    clear() { for (const it of items) URL.revokeObjectURL(it.url); items.length = 0; grid.replaceChildren(); grid.hidden = true; },
  };
}

// ---------- Dictée vocale (texte parlé → texte écrit) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANGS = { "fr-FR": "FR", "ar-MA": "ع" };
let VLANG = "fr-FR";
try { VLANG = localStorage.getItem("mtd_vlang") || "fr-FR"; } catch {}
const setVlang = (l) => { VLANG = l; try { localStorage.setItem("mtd_vlang", l); } catch {} document.querySelectorAll("[data-vlang]").forEach((b) => (b.textContent = LANGS[VLANG])); };
function langBtn() {
  return h("button", { class: "btn sm lang", type: "button", "data-vlang": "", title: "Langue de la voix : français / arabe", onclick: () => setVlang(VLANG === "fr-FR" ? "ar-MA" : "fr-FR") }, LANGS[VLANG]);
}
function dictateBtn(target) {
  if (!SR) return null;
  let r = null, base = "";
  const btn = h("button", { class: "btn sm", type: "button", title: "Parlez, le texte s'écrit tout seul" }, icon("mic"), "Dicter");
  const stop = () => { if (r) { r.onend = null; r.stop(); r = null; } btn.classList.remove("rec-on"); btn.replaceChildren(icon("mic"), "Dicter"); };
  btn.addEventListener("click", () => {
    if (r) return stop();
    r = new SR(); r.lang = VLANG; r.continuous = true; r.interimResults = true;
    base = target.value ? target.value.replace(/\s*$/, " ") : "";
    r.onresult = (e) => {
      let fin = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (tmp += e.results[i][0].transcript));
      if (fin) base += fin.trim() + " ";
      target.value = base + tmp;
    };
    r.onerror = (e) => { if (e.error === "not-allowed") toast("Autorisez le micro pour dicter"); stop(); };
    r.onend = () => stop();
    try { r.start(); } catch { return stop(); }
    btn.classList.add("rec-on"); btn.replaceChildren(h("span", { class: "rec-dot" }), "Arrêter la dictée");
  });
  return h("span", { class: "row tight" }, btn, langBtn());
}

// ---------- Connexion / inscription ----------
function viewAuth(mode) {
  $("#bar").hidden = true;
  const err = errBox();
  const isReg = mode === "register";
  const f = (label, name, type = "text", extra = {}) => h("label", { class: "f" }, label, h("input", { name, type, ...extra }));
  const form = h("form", { class: "stack", novalidate: true },
    isReg && f("Nom complet", "name", "text", { autocomplete: "name", required: true }),
    isReg && f("Entreprise", "company", "text", { autocomplete: "organization" }),
    isReg && f("Téléphone", "phone", "tel", { autocomplete: "tel" }),
    f("E-mail", "email", "email", { autocomplete: "email", required: true }),
    f("Mot de passe" + (isReg ? " (8 caractères minimum)" : ""), "password", "password", { autocomplete: isReg ? "new-password" : "current-password", required: true, minlength: isReg ? 8 : null }),
    err,
    h("button", { class: "btn primary", type: "submit" }, isReg ? "Créer mon compte" : "Se connecter"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      ME = (await api(isReg ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: data })).user;
      go("/");
    } catch (ex) { showErr(err, ex); btn.disabled = false; }
  });
  const feat = (ic, title, text) => h("li", null, icon(ic), h("div", null, h("b", null, title), h("span", null, text)));
  mount(h("div", { class: "auth" },
    h("section", { class: "hero" },
      h("div", { class: "row" }, h("div", { class: "logo" }, h("img", { src: "/icon.png", alt: "Magiscom Tech", width: 40, height: 38 })), h("div", null, h("b", null, "Magiscom Tech Desk"), h("div", { class: "small" }, "Support clients EBP & Sage"))),
      h("div", { class: "stack" }, h("h1", null, "Votre support, simple et suivi."),
        h("p", null, "Décrivez votre problème, montrez-le en photo ou en vidéo, et suivez la réponse de nos consultants ici.")),
      h("ul", { class: "feats" },
        feat("camera", "Photos et vidéos", "Montrez l'écran ou l'erreur, directement depuis votre téléphone."),
        feat("clock", "Suivi clair", "Ouvert, en cours, résolu : vous savez où en est chaque demande."),
        feat("mail", "Alerte par e-mail", "Vous êtes prévenu dès que nous répondons."),
        feat("lock", "Espace privé", "Vos demandes ne sont visibles que par vous et notre équipe."))),
    h("section", { class: "auth-form" },
      h("div", null, h("h2", null, isReg ? "Créer votre compte" : "Bon retour 👋"), h("p", { class: "sub small" }, isReg ? "Quelques secondes, puis envoyez votre première demande." : "Connectez-vous pour suivre vos demandes.")),
      h("div", { class: "tabs" },
        h("button", { type: "button", "aria-pressed": String(!isReg), onclick: () => go("/login") }, "Connexion"),
        h("button", { type: "button", "aria-pressed": String(isReg), onclick: () => go("/register") }, "Créer un compte")),
      form)));
}

// ---------- Barre du haut ----------
function showBar(active) {
  $("#bar").hidden = false;
  $("#whoName").textContent = ME.name + (ME.role === "admin" ? " · " + (ME.title || "Admin") : "");
  const links = ME.role === "admin"
    ? [["/", "Demandes"], ["/clients", "Clients"], ["/profil", "Mon profil"]]
    : [["/", "Mes demandes"], ["/new", "Nouvelle demande"], ["/profil", "Mon profil"]];
  $("#nav").replaceChildren(...links.map(([p, l]) => h("a", { href: "#" + p, class: active === p ? "on" : null }, l)));
}

// ---------- Liste des demandes ----------
function ticketCard(t, admin) {
  const waiting = admin && t.last_sender === "user" && (t.status === "open" || t.status === "in_review");
  return h("a", { class: "tk k-" + t.status, href: "#/t/" + t.id },
    h("div", { class: "row between" }, h("h3", null, waiting ? h("span", { class: "dot", title: "En attente de votre réponse" }) : null, t.subject), badge(t.status)),
    h("div", { class: "meta" },
      admin && h("b", null, t.user_name + (t.user_company ? " · " + t.user_company : "")),
      h("span", null, CATS[t.category] || t.category),
      h("span", null, "Mis à jour le " + fmtDate(t.updated_at)),
      h("span", null, t.message_count + " message" + (t.message_count > 1 ? "s" : "")),
      t.attachment_count ? h("span", null, "📎 " + t.attachment_count) : null,
      !admin && t.last_sender === "admin" && t.status !== "resolved" ? h("b", { class: "new" }, "Nouvelle réponse") : null));
}
async function viewMyTickets() {
  showBar("/");
  let filter = "all", tickets = [];
  const list = h("div", { class: "list" });
  const chips = h("div", { class: "chips" });
  const draw = () => {
    chips.replaceChildren(...[["all", "Toutes"], ...Object.entries(STATUS)].map(([k, l]) =>
      h("button", { class: "chip", "aria-pressed": String(filter === k), onclick: () => { filter = k; draw(); } }, l)));
    const shown = tickets.filter((t) => filter === "all" || t.status === filter);
    list.replaceChildren(...(shown.length ? shown.map((t) => ticketCard(t, false))
      : [tickets.length ? emptyState("inbox", "Aucune demande avec ce statut.") : emptyState("inbox", "Vous n'avez encore envoyé aucune demande.", h("a", { class: "btn primary", href: "#/new" }, "Créer ma première demande"))]));
  };
  mount(h("div", { class: "stack" }, h("div", { class: "head" }, h("div", null, h("h1", null, "Bonjour " + firstName(ME.name)), h("p", { class: "sub" }, "Suivez vos demandes et les réponses de l'équipe Magiscom Tech.")), h("a", { class: "btn primary", href: "#/new" }, "+ Nouvelle demande")), chips, list));
  list.replaceChildren(h("p", { class: "muted" }, "Chargement…"));
  try { tickets = (await api("/api/tickets")).tickets; draw(); }
  catch (e) { list.replaceChildren(h("div", { class: "err" }, e.message)); }
}

// ---------- Nouvelle demande ----------
function viewNew() {
  showBar("/new");
  const err = errBox();
  const picker = makePicker();
  const form = h("form", { class: "card stack", novalidate: true },
    h("label", { class: "f" }, "Titre de la demande", h("input", { name: "subject", maxlength: 150, placeholder: "Ex. : Impossible d'imprimer une facture dans EBP", required: true })),
    h("label", { class: "f" }, "Catégorie", h("select", { name: "category" }, Object.entries(CATS).map(([k, l]) => h("option", { value: k }, l)))),
    h("label", { class: "f" }, "Décrivez le problème", h("textarea", { name: "body", maxlength: 5000, placeholder: "Ce que vous faisiez, le message d'erreur affiché, depuis quand…" })),
    picker.el, err,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, "Envoyer la demande"), h("a", { class: "btn", href: "#/" }, "Annuler")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (data.subject.trim().length < 3) throw new Error("Donnez un titre à votre demande");
      if (picker.busy()) throw new Error("Arrêtez d'abord l'enregistrement vocal");
      if (!data.body.trim() && !picker.count()) throw new Error("Décrivez le problème, joignez une photo, une vidéo ou un message vocal");
      btn.textContent = picker.count() ? "Envoi des fichiers…" : "Envoi…";
      const attachments = await picker.uploadAll();
      const r = await api("/api/tickets", { method: "POST", body: { ...data, attachments } });
      picker.clear(); toast("Demande envoyée"); go("/t/" + r.ticket.id);
    } catch (ex) { showErr(err, ex); btn.disabled = false; btn.textContent = "Envoyer la demande"; }
  });
  const dz = dictateBtn(form.querySelector("textarea"));
  if (dz) form.querySelector("textarea").after(dz);
  mount(h("div", { class: "stack" }, h("a", { href: "#/" }, "← Retour"), h("div", null, h("h1", null, "Nouvelle demande"), h("p", { class: "sub" }, "Plus votre description est précise, plus notre réponse sera rapide. Une photo de l'écran aide beaucoup.")), form));
}

// ---------- Fil d'une demande ----------
function mediaGrid(atts) {
  if (!atts.length) return null;
  return h("div", { class: "media" }, atts.map((a) => {
    const hook = window.MagisDeskHooks?.mediaUrl;
    const src = hook ? hook(a.id) : "/api/media/" + a.id;
    if (a.mime.startsWith("video/")) return h("video", { src, controls: true, preload: "metadata", playsinline: true, title: a.name });
    if (a.mime.startsWith("audio/")) return h("div", { class: "aud" }, h("span", { class: "small muted" }, "🎤 " + (a.name.startsWith("enregistrement-appel") ? "Enregistrement de l'appel" : "Message vocal")), h("audio", { src, controls: true, preload: "metadata" }));
    if (a.mime === "image/heic" || a.mime === "image/heif")
      return h("a", { class: "btn sm", href: hook ? src : src + "?download", download: a.name, target: "_blank", rel: "noopener" }, "📷 " + a.name + " (" + fmtSize(a.size) + ")");
    return h("a", { href: src, target: "_blank", rel: "noopener" }, h("img", { src, alt: a.name, loading: "lazy" }));
  }));
}
function threadNodes(d) {
  const items = [
    ...d.messages.map((m) => ({ ts: m.created_at, m })),
    ...d.history.map((x) => ({ ts: x.created_at, x })),
  ].sort((a, b) => a.ts - b.ts || (a.x ? -1 : 1));
  return items.map(({ m, x }) => {
    if (x) {
      const by = x.by_role === "admin" ? "Magiscom Tech" : x.by_name;
      return h("div", { class: "sys" }, x.old_status
        ? `${STATUS[x.old_status]} → ${STATUS[x.new_status]} · ${by} · ${fmtDate(x.created_at)}`
        : `Demande créée · ${fmtDate(x.created_at)}`);
    }
    const mine = m.sender_id === ME.id, staff = m.sender_role === "admin";
    const label = mine ? "Vous" : m.sender_name;
    const role = staff ? (m.sender_title ? m.sender_title + " · " : "") + "Magiscom Tech" : "";
    return h("div", { class: "mrow" + (mine ? " mine" : "") },
      h("div", { class: "av" + (staff && !mine ? " staff" : ""), "aria-hidden": "true" }, staff && !mine ? h("img", { src: "/icon.png", alt: "" }) : initials(m.sender_name)),
      h("div", { class: "msg" },
        h("span", { class: "who" }, h("b", null, label), role ? " · " + role : "", " · " + fmtDate(m.created_at)),
        m.body ? h("div", { class: "body" }, m.body) : null,
        m.body && !m.body.startsWith("📞") && !m.body.startsWith("⏺") && window.speechSynthesis ? h("button", { class: "say", type: "button", title: "Écouter ce message", onclick: () => readAloud(m.body) }, "🔊 Écouter") : null,
        mediaGrid(m.attachments)));
  });
}
async function viewTicket(id) {
  showBar(null);
  const admin = ME.role === "admin";
  let d;
  try { d = await api("/api/tickets/" + id); }
  catch (e) { mount(h("div", { class: "stack" }, h("a", { href: "#/" }, "← Retour"), h("div", { class: "err" }, e.message))); return; }

  const thread = h("div", { class: "thread" });
  const aside = h("aside", { class: "stack" });
  const titleBadge = h("span");
  const hint = h("p", { class: "muted small" });
  let sig = "";
  const paint = (data) => {
    d = data;
    sig = d.messages.length + ":" + d.history.length + ":" + d.ticket.status;
    thread.replaceChildren(...threadNodes(d));
    titleBadge.replaceChildren(badge(d.ticket.status));
    hint.textContent = !admin && (d.ticket.status === "resolved" || d.ticket.status === "unresolved") ? "Si vous répondez, la demande sera rouverte." : "";
    hint.hidden = !hint.textContent;
    aside.replaceChildren(...asideNodes(d));
  };
  const asideNodes = (data) => {
    const t = data.ticket, o = data.owner;
    if (!admin) return [h("div", { class: "card stack" }, h("h3", null, "Statut"), badge(t.status), h("p", { class: "muted small" }, STATUS_HELP[t.status]),
      h("div", { class: "kv" }, h("span", null, "Catégorie"), h("span", null, CATS[t.category]), h("span", null, "Créée le"), h("span", null, fmtDay(t.created_at))))];
    const sel = h("select", { "aria-label": "Statut" }, Object.entries(STATUS).map(([k, l]) => h("option", { value: k, selected: k === t.status }, l)));
    const save = h("button", { class: "btn primary sm" }, "Mettre à jour le statut");
    save.addEventListener("click", async () => {
      save.disabled = true;
      try { await api(`/api/tickets/${id}/status`, { method: "PATCH", body: { status: sel.value } }); toast("Statut mis à jour"); paint(await api("/api/tickets/" + id)); }
      catch (e) { toast(e.message); save.disabled = false; }
    });
    return [
      h("div", { class: "card stack" }, h("h3", null, "Statut"), sel, save),
      h("div", { class: "card stack" }, h("h3", null, "Client"),
        h("div", { class: "kv" },
          h("span", null, "Nom"), h("span", null, o.name),
          h("span", null, "Entreprise"), h("span", null, o.company || "—"),
          h("span", null, "E-mail"), h("span", null, o.email),
          h("span", null, "Téléphone"), h("span", null, o.phone || "—"),
          h("span", null, "Client depuis"), h("span", null, fmtDay(o.created_at))),
        h("a", { class: "btn sm", href: "#/client/" + o.id }, "Toutes ses demandes")),
    ];
  };

  const err = errBox();
  const picker = makePicker();
  const ta = h("textarea", { maxlength: 5000, placeholder: admin ? "Votre réponse au client…" : "Votre message…", "aria-label": "Message" });
  const send = h("button", { class: "btn primary", type: "submit" }, "Envoyer");
  const form = h("form", { class: "card stack" }, ta, picker.el, err, hint, h("div", { class: "row" }, send, dictateBtn(ta)));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (picker.busy()) return showErr(err, new Error("Arrêtez d'abord l'enregistrement vocal"));
    if (!ta.value.trim() && !picker.count()) return showErr(err, new Error("Écrivez un message ou joignez un fichier"));
    send.disabled = true; send.textContent = picker.count() ? "Envoi des fichiers…" : "Envoi…";
    try {
      const attachments = await picker.uploadAll();
      await api(`/api/tickets/${id}/messages`, { method: "POST", body: { body: ta.value, attachments } });
      ta.value = ""; picker.clear();
      paint(await api("/api/tickets/" + id));
      thread.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch (ex) { showErr(err, ex); }
    send.disabled = false; send.textContent = "Envoyer";
  });

  const peer = admin ? (d.owner ? d.owner.name : "Client") : "Magiscom Tech";
  const callBtns = h("div", { class: "row tight callbtns" },
    h("button", { class: "btn sm call-v", type: "button", onclick: () => startCall(id, true, peer) }, icon("video"), "Appel vidéo"),
    h("button", { class: "btn sm", type: "button", onclick: () => startCall(id, false, peer) }, icon("phone"), "Appel audio"));
  if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) callBtns.hidden = true;
  mount(h("div", { class: "stack" },
    h("a", { href: admin ? "#/" : "#/" }, "← Retour"),
    h("div", { class: "row between" }, h("h1", null, d.ticket.subject), h("div", { class: "row tight" }, titleBadge)),
    callBtns,
    admin && d.owner ? h("p", { class: "muted small" }, d.owner.name + (d.owner.company ? " · " + d.owner.company : "") + " · " + (CATS[d.ticket.category] || "")) : null,
    h("div", { class: "side" }, h("div", { class: "stack" }, thread, form), aside)));
  paint(d);
  VC.ticketId = id;
  VA.ctx = {
    kind: "ticket",
    async setStatus(st) { await api(`/api/tickets/${id}/status`, { method: "PATCH", body: { status: st } }); paint(await api("/api/tickets/" + id)); },
    reply(text) { ta.value = (ta.value ? ta.value.replace(/\s*$/, " ") : "") + text; ta.focus(); },
    send() { form.requestSubmit(); },
    call(video) { startCall(id, video, peer); },
    lastClientMessage() { const m = [...d.messages].reverse().find((x) => x.sender_role !== "admin" && x.body && !x.body.startsWith("📞")); return m ? m.sender_name + " a écrit : " + m.body : "Aucun message écrit du client."; },
    summary() { return `Demande « ${d.ticket.subject} », statut ${STATUS[d.ticket.status]}, ${d.messages.length} message${d.messages.length > 1 ? "s" : ""}.`; },
  };

  // Rafraîchissement automatique toutes les 20 s (sans toucher au message en cours d'écriture)
  pollTimer = setInterval(async () => {
    if (document.hidden || send.disabled || picker.busy()) return;
    try {
      const fresh = await api("/api/tickets/" + id);
      const s = fresh.messages.length + ":" + fresh.history.length + ":" + fresh.ticket.status;
      if (s !== sig) paint(fresh);
    } catch {}
  }, 20000);
}

// ---------- Tableau de bord administrateur ----------
async function viewAdmin(opts = {}) {
  showBar("/");
  const state = { status: "", waiting: false, q: "", user: opts.user || "" };
  const statsBox = h("div", { class: "stats" });
  const list = h("div", { class: "list" });
  const chips = h("div", { class: "chips" });
  const search = h("input", { type: "search", placeholder: "Chercher : sujet, client, entreprise, e-mail…", "aria-label": "Rechercher" });
  let title = h("h1", null, state.user ? "Demandes du client" : "Bonjour " + firstName(ME.name));
  const load = async () => {
    const qs = new URLSearchParams();
    if (state.status) qs.set("status", state.status);
    if (state.waiting) qs.set("waiting", "1");
    if (state.q) qs.set("q", state.q);
    if (state.user) qs.set("user", state.user);
    list.replaceChildren(h("p", { class: "muted" }, "Chargement…"));
    try {
      const { tickets } = await api("/api/tickets?" + qs);
      if (state.user && tickets[0]) title.textContent = "Demandes de " + tickets[0].user_name;
      list.replaceChildren(...(tickets.length ? tickets.map((t) => ticketCard(t, true)) : [emptyState("inbox", "Aucune demande ne correspond.")]));
    } catch (e) { list.replaceChildren(h("div", { class: "err" }, e.message)); }
  };
  const drawChips = () => chips.replaceChildren(
    ...[["", "Toutes"], ...Object.entries(STATUS)].map(([k, l]) =>
      h("button", { class: "chip", "aria-pressed": String(!state.waiting && state.status === k), onclick: () => { state.status = k; state.waiting = false; drawChips(); load(); } }, l)),
    h("button", { class: "chip", "aria-pressed": String(state.waiting), onclick: () => { state.waiting = !state.waiting; state.status = ""; drawChips(); load(); } }, "● En attente de réponse"));
  let tm;
  search.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { state.q = search.value.trim(); load(); }, 300); });
  mount(h("div", { class: "stack" },
    state.user ? h("a", { href: "#/clients" }, "← Tous les clients") : null,
    h("div", null, title, state.user ? null : h("p", { class: "sub" }, "Voici les demandes de vos clients. Les points orange attendent votre réponse.")), state.user ? null : statsBox, search, chips, list));
  drawChips(); load();
  VA.ctx = {
    kind: "list",
    setStatus(st) { state.status = st; state.waiting = false; drawChips(); load(); },
    setWaiting() { state.waiting = true; state.status = ""; drawChips(); load(); },
    search(q) { search.value = q; state.q = q; state.status = ""; state.waiting = false; drawChips(); load(); },
    async open(n) {
      for (let i = 0; i < 20 && list.querySelector("p.muted"); i++) await new Promise((r) => setTimeout(r, 150));
      const cards = [...list.querySelectorAll("a.tk")];
      const c = n === -1 ? cards[cards.length - 1] : cards[n - 1];
      if (!c) return false;
      location.hash = c.getAttribute("href"); return true;
    },
  };
  if (VA.pending) { const f = VA.pending; VA.pending = null; setTimeout(f, 0); }
  if (!state.user) {
    try {
      const s = await api("/api/admin/stats");
      const tile = (n, label, onclick, cls = "") => h("button", { class: "stat " + cls, type: "button", onclick }, h("b", null, n), h("span", null, label));
      statsBox.replaceChildren(
        tile(s.waiting, "En attente de réponse", () => { state.waiting = true; state.status = ""; drawChips(); load(); }, "hot"),
        tile(s.stats.open, "Ouvertes", () => { state.status = "open"; state.waiting = false; drawChips(); load(); }, "c-open"),
        tile(s.stats.in_review, "En cours", () => { state.status = "in_review"; state.waiting = false; drawChips(); load(); }, "c-in_review"),
        tile(s.stats.resolved, "Résolues", () => { state.status = "resolved"; state.waiting = false; drawChips(); load(); }, "c-resolved"),
        tile(s.stats.unresolved, "Non résolues", () => { state.status = "unresolved"; state.waiting = false; drawChips(); load(); }, "c-unresolved"),
        tile(s.users, "Clients inscrits", () => go("/clients")));
    } catch {}
  }
}
function resetBtn(u) {
  const box = h("span", { class: "row" });
  const start = h("button", { class: "btn sm", type: "button" }, "Nouveau mot de passe");
  start.addEventListener("click", () => {
    const yes = h("button", { class: "btn sm primary", type: "button" }, "Confirmer");
    const no = h("button", { class: "btn sm", type: "button" }, "Annuler");
    no.onclick = () => box.replaceChildren(start);
    yes.onclick = async () => {
      yes.disabled = true;
      try {
        const { password } = await api(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
        const copy = h("button", { class: "btn sm", type: "button" }, "Copier");
        copy.onclick = async () => { try { await navigator.clipboard.writeText(password); copy.textContent = "Copié"; } catch { copy.textContent = "Copie impossible"; } };
        box.replaceChildren(h("span", { class: "small" }, "Mot de passe provisoire : ", h("b", { class: "mono" }, password)), copy,
          h("span", { class: "muted small" }, "Donnez-le au client : il pourra le changer dans « Mon profil »."));
      } catch (e) { toast(e.message); box.replaceChildren(start); }
    };
    box.replaceChildren(h("span", { class: "small" }, "Remplacer le mot de passe de " + u.name + " ?"), yes, no);
  });
  box.append(start);
  return box;
}
async function viewClients() {
  showBar("/clients");
  const body = h("tbody");
  const search = h("input", { type: "search", placeholder: "Chercher un client…", "aria-label": "Chercher un client" });
  let users = [];
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = users.filter((u) => !q || [u.name, u.email, u.company, u.phone].join(" ").toLowerCase().includes(q));
    body.replaceChildren(...rows.map((u) => h("tr", null,
      h("td", null, h("b", null, u.name), u.role === "admin" ? ` (${u.title || "admin"})` : "", h("br"), h("span", { class: "muted small" }, u.company || "")),
      h("td", null, u.email, h("br"), h("span", { class: "muted small" }, u.phone || "")),
      h("td", null, String(u.tickets), u.active ? h("span", { class: "muted small" }, ` (${u.active} en cours)`) : ""),
      h("td", null, u.last_activity ? fmtDay(u.last_activity) : "—"),
      h("td", null, h("div", { class: "row" }, h("a", { class: "btn sm", href: "#/client/" + u.id }, "Demandes"), u.id !== ME.id ? resetBtn(u) : null)))));
    if (!rows.length) body.replaceChildren(h("tr", null, h("td", { colspan: 5, class: "muted" }, "Aucun client.")));
  };
  search.addEventListener("input", draw);
  mount(h("div", { class: "stack" }, h("h1", null, "Clients"), search,
    h("div", { class: "card scroll" }, h("table", { class: "table" },
      h("thead", null, h("tr", null, ["Client", "Contact", "Demandes", "Dernière activité", ""].map((x) => h("th", null, x)))), body))));
  try { users = (await api("/api/admin/users")).users; draw(); }
  catch (e) { body.replaceChildren(h("tr", null, h("td", { colspan: 5 }, e.message))); }
}

// ---------- Mon profil ----------
function viewProfile() {
  showBar("/profil");
  const field = (label, name, type, value, extra = {}) => h("label", { class: "f" }, label, h("input", { name, type, value: value || "", ...extra }));
  const section = (title, help, fields, btnLabel, onSubmit) => {
    const err = errBox();
    const ok = h("p", { class: "new small", role: "status", hidden: true });
    const btn = h("button", { class: "btn primary", type: "submit" }, btnLabel);
    const form = h("form", { class: "card stack", novalidate: true }, h("h2", null, title), help ? h("p", { class: "muted small" }, help) : null, ...fields, err, ok, h("div", { class: "row" }, btn));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); err.hidden = true; ok.hidden = true; btn.disabled = true;
      try { ok.textContent = await onSubmit(Object.fromEntries(new FormData(form)), form); ok.hidden = false; }
      catch (ex) { showErr(err, ex); }
      btn.disabled = false;
    });
    return form;
  };
  const info = section("Mes informations", null, [
    field("Nom complet", "name", "text", ME.name, { autocomplete: "name" }),
    field("Entreprise", "company", "text", ME.company, { autocomplete: "organization" }),
    field("Téléphone", "phone", "tel", ME.phone, { autocomplete: "tel" }),
  ], "Enregistrer", async (d) => { ME = (await api("/api/me", { method: "PATCH", body: d })).user; showBar("/profil"); return "Informations enregistrées."; });
  const mail = section("Adresse e-mail", "C'est l'adresse qui sert à vous connecter. Pour la changer, confirmez avec votre mot de passe actuel.", [
    field("Nouvelle adresse e-mail", "email", "email", ME.email, { autocomplete: "email" }),
    field("Mot de passe actuel", "password", "password", "", { autocomplete: "current-password" }),
  ], "Changer l'e-mail", async (d, f) => { ME = (await api("/api/me/email", { method: "POST", body: d })).user; f.password.value = ""; return "E-mail modifié. Utilisez-le à votre prochaine connexion."; });
  const pass = section("Mot de passe", "Vos autres appareils seront déconnectés.", [
    field("Mot de passe actuel", "current", "password", "", { autocomplete: "current-password" }),
    field("Nouveau mot de passe (8 caractères minimum)", "next", "password", "", { autocomplete: "new-password", minlength: 8 }),
    field("Confirmez le nouveau mot de passe", "confirm", "password", "", { autocomplete: "new-password" }),
  ], "Changer le mot de passe", async (d, f) => {
    if (d.next !== d.confirm) throw new Error("Les deux nouveaux mots de passe ne sont pas identiques");
    await api("/api/me/password", { method: "POST", body: { current: d.current, next: d.next } });
    f.reset(); return "Mot de passe modifié.";
  });
  mount(h("div", { class: "stack" }, h("h1", null, "Mon profil"), info, mail, pass,
    !ME || ME.role !== "admin" ? h("p", { class: "muted small" }, "Mot de passe oublié ? Contactez Magiscom Tech : l'équipe peut vous attribuer un mot de passe provisoire.") : null));
}

// ---------- Appels audio / vidéo en direct (WebRTC) ----------
const CALL = { cur: null, ice: null, ringing: null, dismissed: new Set(), poll: null };
async function iceServers() {
  if (!CALL.ice) { try { CALL.ice = (await api("/api/rtc-config")).iceServers; } catch { CALL.ice = [{ urls: "stun:stun.l.google.com:19302" }]; } }
  return CALL.ice;
}
const waitIce = (pc) => new Promise((res) => {
  if (pc.iceGatheringState === "complete") return res();
  const t = setTimeout(res, 3500);
  pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
});
// Petite sonnerie générée (aucun fichier son à charger)
function tone(kind) {
  let ctx, timer;
  const beep = () => {
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = kind === "in" ? 880 : 440; g.gain.value = 0.0001;
      o.connect(g).connect(ctx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "in" ? 0.9 : 1.2));
      o.stop(ctx.currentTime + 1.3);
    } catch {}
    if (kind === "in" && navigator.vibrate) navigator.vibrate([300, 200, 300]);
  };
  beep(); timer = setInterval(beep, kind === "in" ? 1600 : 3000);
  return () => { clearInterval(timer); if (ctx && ctx.state !== "closed") ctx.close().catch(() => {}); ctx = null; };
}

function callOverlay(s) {
  const remoteV = h("video", { class: "remote", autoplay: true, playsinline: true });
  const localV = h("video", { class: "local", autoplay: true, playsinline: true, muted: true, hidden: true });
  const state = h("p", { class: "call-state" }, "Préparation…");
  const timer = h("span", { class: "call-time" });
  const recFlag = h("span", { class: "call-rec", hidden: true }, h("span", { class: "rec-dot" }), "Enregistrement en cours");
  const ctl = (ic, label, onclick, cls = "") => h("button", { class: "cbtn " + cls, type: "button", "aria-label": label, title: label, onclick }, icon(ic), h("span", null, label));
  const bMic = ctl("mic", "Micro", () => toggleMic(s));
  const bCam = ctl("video", "Caméra", () => toggleCam(s));
  const bScr = ctl("screen", "Écran", () => toggleScreen(s));
  const bRec = ctl("rec", "Enregistrer", () => toggleRecord(s));
  const bEnd = ctl("hang", "Raccrocher", () => hangup(s), "end");
  if (!navigator.mediaDevices?.getDisplayMedia) bScr.hidden = true;
  if (!window.MediaRecorder) bRec.hidden = true;
  const el = h("div", { class: "call", role: "dialog", "aria-label": "Appel en cours" },
    remoteV,
    h("div", { class: "call-ph" }, h("div", { class: "call-av" }, s.peer === "Magiscom Tech" ? h("img", { src: "/icon.png", alt: "" }) : initials(s.peer)), h("b", null, s.peer), state),
    localV,
    h("div", { class: "call-top" }, h("b", null, (s.video ? "Appel vidéo" : "Appel audio") + " · " + s.peer), timer, recFlag),
    h("div", { class: "call-ctl" }, bMic, bCam, bScr, bRec, bEnd));
  document.body.append(el);
  Object.assign(s, { el, remoteV, localV, state, timer, recFlag, bMic, bCam, bScr, bRec });
  remoteV.srcObject = s.remote;
}
function setState(s, text) { s.state.textContent = text; s.state.hidden = !text; }
function refreshLocal(s) {
  const v = s.screenTrack || s.camTrack;
  s.localV.hidden = !v;
  s.localV.srcObject = v ? new MediaStream([v]) : null;
  s.localV.classList.toggle("mirror", !!s.camTrack && !s.screenTrack);
  s.bCam.classList.toggle("off", !s.camTrack);
  s.bScr.classList.toggle("on", !!s.screenTrack);
  s.bMic.classList.toggle("off", !s.micTrack || !s.micTrack.enabled);
}
function newPc(s, ice) {
  const pc = new RTCPeerConnection({ iceServers: ice });
  s.pc = pc;
  pc.ontrack = (e) => {
    s.remote.addTrack(e.track);
    if (e.track.kind === "video") {
      const upd = () => s.el.classList.toggle("has-video", !e.track.muted && e.track.readyState === "live");
      e.track.onmute = upd; e.track.onunmute = upd; e.track.onended = upd; upd();
    }
    s.remoteV.play?.().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "connected") {
      setState(s, "");
      if (!s.startedAt) { s.startedAt = Date.now(); s.tick = setInterval(() => (s.timer.textContent = clock((Date.now() - s.startedAt) / 1000)), 1000); }
    } else if (st === "disconnected") setState(s, "Connexion instable…");
    else if (st === "failed") { setState(s, "Connexion impossible : le réseau bloque l'appel. Essayez en Wi-Fi."); setTimeout(() => hangup(s), 5000); }
  };
  return pc;
}
async function getMedia(video) {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}
function session(ticketId, video, peer) {
  return { ticketId, video, peer, remote: new MediaStream(), micTrack: null, camTrack: null, screenTrack: null, ended: false };
}
async function startCall(ticketId, video, peer) {
  if (CALL.cur) return toast("Un appel est déjà en cours");
  const s = session(ticketId, video, peer);
  CALL.cur = s;
  callOverlay(s);
  try {
    const media = await getMedia(video);
    s.micTrack = media.getAudioTracks()[0]; s.camTrack = media.getVideoTracks()[0] || null;
  } catch (e) { toast(mediaError(e)); return closeCall(s); }
  refreshLocal(s);
  setState(s, "Connexion…");
  const pc = newPc(s, await iceServers());
  s.aT = pc.addTransceiver("audio", { direction: "sendrecv" });
  s.vT = pc.addTransceiver("video", { direction: "sendrecv" });   // toujours présent : permet d'activer la caméra ou de partager l'écran pendant l'appel
  await s.aT.sender.replaceTrack(s.micTrack);
  if (s.camTrack) await s.vT.sender.replaceTrack(s.camTrack);
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  if (s.ended) return;
  try { s.id = (await api(`/api/tickets/${ticketId}/calls`, { method: "POST", body: { video, offer: pc.localDescription.sdp } })).call.id; }
  catch (e) { toast(e.message); return closeCall(s); }
  setState(s, "Ça sonne… En attente de réponse");
  s.stopTone = tone("out");
  s.poll = setInterval(() => pollCall(s), 1500);
}
async function pollCall(s) {
  if (s.ended || s.polling) return;
  s.polling = true;
  try {
    const { call } = await api("/api/calls/" + s.id);
    if (call.answer && !s.answered) {
      s.answered = true; s.stopTone && s.stopTone();
      setState(s, "Connexion…");
      await s.pc.setRemoteDescription({ type: "answer", sdp: call.answer });
      clearInterval(s.poll); s.poll = setInterval(() => pollCall(s), 3000);
    }
    s.recFlag.hidden = !call.recording && !s.rec;
    if (["ended", "missed", "declined"].includes(call.status)) {
      toast(call.status === "declined" ? "Appel refusé" : call.status === "missed" ? "Pas de réponse" : "Appel terminé");
      closeCall(s);
    }
  } catch (e) { if (e.status === 404) closeCall(s); }
  s.polling = false;
}
async function acceptCall(c, video) {
  dismissRing();
  if (CALL.cur) return toast("Un appel est déjà en cours");
  const s = session(c.ticket_id, video, ME.role === "admin" ? c.caller_name : "Magiscom Tech");
  s.id = c.id; s.answered = true;
  CALL.cur = s;
  callOverlay(s);
  try {
    const media = await getMedia(video);
    s.micTrack = media.getAudioTracks()[0]; s.camTrack = media.getVideoTracks()[0] || null;
  } catch (e) { toast(mediaError(e)); api(`/api/calls/${c.id}/end`, { method: "POST", body: { reason: "declined" } }).catch(() => {}); return closeCall(s, true); }
  refreshLocal(s);
  setState(s, "Connexion…");
  let offer;
  try { offer = (await api("/api/calls/" + c.id)).call.offer; } catch {}
  if (!offer) { toast("L'appel est terminé"); return closeCall(s, true); }
  const pc = newPc(s, await iceServers());
  await pc.setRemoteDescription({ type: "offer", sdp: offer });
  for (const t of pc.getTransceivers()) {
    t.direction = "sendrecv";
    if (t.receiver.track.kind === "audio") { s.aT = t; await t.sender.replaceTrack(s.micTrack); }
    else { s.vT = t; if (s.camTrack) await t.sender.replaceTrack(s.camTrack); }
  }
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  if (s.ended) return;
  try { await api(`/api/calls/${c.id}/answer`, { method: "POST", body: { answer: pc.localDescription.sdp } }); }
  catch (e) { toast(e.message); return closeCall(s, true); }
  s.poll = setInterval(() => pollCall(s), 3000);
  if (!location.hash.includes(c.ticket_id)) go("/t/" + c.ticket_id);
}
function toggleMic(s) { if (s.micTrack) { s.micTrack.enabled = !s.micTrack.enabled; refreshLocal(s); } }
async function toggleCam(s) {
  if (!s.vT) return;
  if (s.camTrack) {
    s.camTrack.stop(); s.camTrack = null;
    if (!s.screenTrack) await s.vT.sender.replaceTrack(null);
  } else {
    try { s.camTrack = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } })).getVideoTracks()[0]; }
    catch (e) { return toast(mediaError(e)); }
    if (!s.screenTrack) await s.vT.sender.replaceTrack(s.camTrack);
  }
  refreshLocal(s);
}
async function toggleScreen(s) {
  if (!s.vT) return;
  if (s.screenTrack) { s.screenTrack.stop(); s.screenTrack = null; await s.vT.sender.replaceTrack(s.camTrack); return refreshLocal(s); }
  try { s.screenTrack = (await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })).getVideoTracks()[0]; }
  catch { return; }
  s.screenTrack.onended = () => { if (s.screenTrack) toggleScreen(s); };
  await s.vT.sender.replaceTrack(s.screenTrack);
  refreshLocal(s);
}
// Enregistrement de l'appel : les deux voix (et l'image de l'autre personne), joint ensuite à la demande
async function toggleRecord(s) {
  if (s.rec) { s.rec.stop(); return; }
  if (!s.startedAt) return toast("Attendez que l'appel soit connecté");
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(), dest = ac.createMediaStreamDestination();
  for (const t of [s.micTrack, ...s.remote.getAudioTracks()]) if (t) ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
  const vid = s.remote.getVideoTracks().find((t) => t.readyState === "live" && !t.muted);
  const mime = pickMime(vid ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"] : AUDIO_MIMES);
  const rec = new MediaRecorder(new MediaStream([...dest.stream.getAudioTracks(), ...(vid ? [vid] : [])]),
    { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 600000, audioBitsPerSecond: 64000 });
  const chunks = []; let size = 0;
  const limit = (vid ? MAX_VID : MAX_AUD) - 2 * MB;
  rec.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); size += e.data.size; if (size > limit && rec.state === "recording") { toast("Taille maximale atteinte : enregistrement arrêté"); rec.stop(); } } };
  rec.onstop = async () => {
    s.rec = null; ac.close().catch(() => {});
    s.bRec.classList.remove("on"); s.recFlag.hidden = true;
    if (s.id && !s.ended) api(`/api/calls/${s.id}/recording`, { method: "POST", body: { on: false } }).catch(() => {});
    if (!chunks.length) return;
    const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
    const d = new Date(), stamp = d.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const file = new File(chunks, `enregistrement-appel-${stamp}.${extOf(type)}`, { type });
    toast("Envoi de l'enregistrement dans la demande…");
    try {
      const att = await uploadFile(file, type, () => {});
      await api(`/api/tickets/${s.ticketId}/messages`, { method: "POST", body: { body: "⏺ Enregistrement de l'appel", attachments: [att.id] } });
      toast("Enregistrement ajouté à la demande");
      if (location.hash.includes(s.ticketId) && !CALL.cur) router();
    } catch (e) { toast("Enregistrement non envoyé : " + e.message); }
  };
  rec.start(1000);
  s.rec = rec; s.bRec.classList.add("on"); s.recFlag.hidden = false;
  api(`/api/calls/${s.id}/recording`, { method: "POST", body: { on: true } }).catch(() => {});
  toast("Enregistrement démarré. Prévenez votre interlocuteur.");
}
function hangup(s) {
  if (s.ended) return;
  if (s.id) api(`/api/calls/${s.id}/end`, { method: "POST", body: {} }).catch(() => {});
  closeCall(s);
}
function closeCall(s, silent) {
  if (s.ended) return;
  s.ended = true;
  if (s.rec && s.rec.state === "recording") s.rec.stop();
  clearInterval(s.poll); clearInterval(s.tick); s.stopTone && s.stopTone();
  for (const t of [s.micTrack, s.camTrack, s.screenTrack]) t && t.stop();
  try { s.pc && s.pc.close(); } catch {}
  s.el && s.el.remove();
  if (CALL.cur === s) CALL.cur = null;
  if (!silent && location.hash.includes(s.ticketId) && !s.rec) setTimeout(() => !CALL.cur && router(), 600);
}
// Raccroche si on ferme la page pendant un appel
window.addEventListener("pagehide", () => {
  const s = CALL.cur;
  if (s && s.id) fetch(`/api/calls/${s.id}/end`, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "X-Requested-With": "magisdesk", "Content-Type": "application/json" }, body: "{}" });
});

// Appel entrant : vérifié toutes les 5 s quand l'application est ouverte
function dismissRing() { if (CALL.ringing) { CALL.ringing.stop(); CALL.ringing.el.remove(); CALL.ringing = null; } }
function showRing(c) {
  dismissRing();
  const staff = ME.role !== "admin";
  const who = staff ? `${c.caller_name}${c.caller_title ? " · " + c.caller_title : ""} · Magiscom Tech` : c.caller_name + (c.caller_company ? " · " + c.caller_company : "");
  const el = h("div", { class: "ring", role: "alertdialog", "aria-label": "Appel entrant" },
    h("div", { class: "ring-av" }, staff ? h("img", { src: "/icon.png", alt: "" }) : initials(c.caller_name)),
    h("div", { class: "ring-txt" }, h("b", null, who), h("span", null, (c.video ? "Appel vidéo" : "Appel audio") + " · " + c.subject)),
    h("div", { class: "row tight" },
      h("button", { class: "btn sm ring-no", type: "button", onclick: () => { CALL.dismissed.add(c.id); dismissRing(); api(`/api/calls/${c.id}/end`, { method: "POST", body: { reason: "declined" } }).catch(() => {}); } }, "Refuser"),
      c.video ? h("button", { class: "btn sm", type: "button", onclick: () => acceptCall(c, false) }, icon("phone"), "Audio") : null,
      h("button", { class: "btn sm ring-yes", type: "button", onclick: () => acceptCall(c, c.video) }, icon(c.video ? "video" : "phone"), "Répondre")));
  document.body.append(el);
  CALL.ringing = { id: c.id, el, stop: tone("in") };
}
async function checkIncoming() {
  if (!ME || document.hidden || CALL.cur) return;
  try {
    const { calls } = await api("/api/calls/incoming");
    const c = calls.find((x) => !CALL.dismissed.has(x.id));
    if (!c) return dismissRing();
    if (!CALL.ringing || CALL.ringing.id !== c.id) showRing(c);
  } catch {}
}
function startIncomingPoll() {
  if (CALL.poll || !window.RTCPeerConnection) return;
  CALL.poll = setInterval(checkIncoming, 5000);
  checkIncoming();
}

// ---------- Assistant vocal de l'administrateur ----------
// Commandes à la voix (français ou darija) : filtrer, chercher, ouvrir une demande, changer le statut,
// dicter et envoyer une réponse, lancer un appel, se faire lire le dernier message du client.
const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ٰٟ]/g, "").replace(/[ة]/g, "ه").replace(/[ى]/g, "ي").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
function statusFrom(t) {
  if (/non resolu|pas resolu|irresolu|ماتحلش|ما تحلش|ماتحلتش|غير محلول|مامحلول/.test(t)) return "unresolved";
  if (/en cours|traitement|كنخدمو|خدامين|قيد المعالجه|في الطريق|كيتعالج/.test(t)) return "in_review";
  if (/resolu|regle|termine|mahlou|mahlol|محلول|تحل|سالي|سالات/.test(t)) return "resolved";
  if (/ouvert|rouvr|مفتوح|فتح/.test(t)) return "open";
  return null;
}
const ORD = [[/premier|premiere|\b1\b|un\b|اللول|الاول|الاولي|لولي/, 1], [/deuxieme|second|\b2\b|التاني|الثاني|التانيه|الثانيه/, 2], [/troisieme|\b3\b|التالت|الثالث|التالته|الثالثه/, 3], [/derni|اللخر|الاخير|الاخيره|لخره/, -1]];
const VA_HELP = [
  ["« Demandes en attente » · « اللي كيتسناو »", "Affiche les demandes qui attendent votre réponse"],
  ["« Ouvertes », « En cours », « Résolues »", "Filtre la liste"],
  ["« Chercher Atlas » · « قلب على أطلس »", "Recherche un client ou un sujet"],
  ["« Ouvre la première » · « حل اللولة »", "Ouvre une demande de la liste"],
  ["« Combien ? » · « شحال؟ »", "Résumé des demandes"],
  ["« Lis le message » · « اقرا »", "Lit le dernier message du client"],
  ["« Réponds bonjour, … » · « جاوب … »", "Écrit la réponse dans le champ"],
  ["« Envoie » · « صيفط »", "Envoie la réponse"],
  ["« Statut résolu » · « دير محلول »", "Change le statut de la demande"],
  ["« Appel vidéo » · « عيط »", "Appelle le client"],
  ["« Clients », « Profil », « Accueil », « Retour »", "Navigation"],
];
const VA = {
  ctx: null, pending: null, el: null, panel: null, rec: null,
  ensure() {
    if (this.el || !SR) return !!this.el;
    const out = h("p", { class: "va-out" }, "Touchez le micro et parlez.");
    const heard = h("p", { class: "va-heard" });
    const help = h("ul", { class: "va-help", hidden: true }, VA_HELP.map(([a, b]) => h("li", null, h("b", null, a), h("span", null, b))));
    this.panel = h("div", { class: "va-panel", hidden: true },
      h("div", { class: "row between" }, h("b", null, "Assistant vocal"), h("div", { class: "row tight" }, langBtn(),
        h("button", { class: "btn sm", type: "button", onclick: () => (help.hidden = !help.hidden) }, "Commandes"),
        h("button", { class: "install-x", type: "button", "aria-label": "Fermer", onclick: () => { this.stop(); this.panel.hidden = true; } }, "×"))),
      heard, out, help);
    this.out = out; this.heard = heard; this.help = help;
    this.el = h("button", { class: "va-btn", type: "button", "aria-label": "Assistant vocal", title: "Assistant vocal : donnez un ordre à la voix", onclick: () => this.listen() }, icon("mic"));
    document.body.append(this.panel, this.el);
    return true;
  },
  show() { if (this.ensure()) this.el.hidden = false; },
  hide() { if (this.el) { this.stop(); this.el.hidden = true; this.panel.hidden = true; } },
  stop() { if (this.rec) { try { this.rec.abort(); } catch {} this.rec = null; } this.el && this.el.classList.remove("on"); },
  say(text) {
    this.out.textContent = text;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, "")); u.lang = VLANG; u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch {}
  },
  listen() {
    if (this.rec) return this.stop();
    this.panel.hidden = false;
    try { speechSynthesis.cancel(); } catch {}
    const r = new SR(); r.lang = VLANG; r.interimResults = true; r.maxAlternatives = 1;
    this.rec = r; this.el.classList.add("on");
    this.heard.textContent = ""; this.out.textContent = VLANG === "ar-MA" ? "كنسمعك…" : "Je vous écoute…";
    let finalText = "";
    r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(" "); this.heard.textContent = "« " + t + " »"; if (e.results[e.results.length - 1].isFinal) finalText = t; };
    r.onerror = (e) => { this.out.textContent = e.error === "not-allowed" ? "Autorisez le micro pour utiliser l'assistant." : e.error === "no-speech" ? "Je n'ai rien entendu. Réessayez." : "Micro indisponible, réessayez."; };
    r.onend = () => { this.rec = null; this.el.classList.remove("on"); if (finalText) this.run(finalText).catch((e) => this.say(e.message || "Erreur")); };
    try { r.start(); } catch { this.stop(); }
  },
  async run(raw) {
    const t = norm(raw), c = this.ctx || {};
    const orig = raw.trim();
    if (/\b(aide|commandes|help)\b|مساعده|عاوني|شنو نقدر/.test(t)) { this.help.hidden = false; return this.say("Voici les commandes possibles."); }
    if (/combien|resume|statisti|شحال|احصائ|ملخص/.test(t)) {
      if (c.kind === "ticket") return this.say(c.summary());
      const s = await api("/api/admin/stats");
      return this.say(`${s.waiting} demande${s.waiting > 1 ? "s" : ""} en attente de réponse, ${s.stats.open} ouverte${s.stats.open > 1 ? "s" : ""}, ${s.stats.in_review} en cours, ${s.stats.resolved} résolue${s.stats.resolved > 1 ? "s" : ""}.`);
    }
    if (c.kind === "ticket") {
      let m;
      if ((m = orig.match(/^(?:r[ée]pon[ds]\w*|r[ée]ponse|[ée]cri\w*|message|tape)\s*:?\s+(.+)$/i)) || (m = orig.match(/^(?:جاوب\S*|رد|كتب|اكتب|أكتب)\s+(.+)$/))) { c.reply(m[1]); return this.say("Réponse écrite. Dites « envoie » pour l'envoyer."); }
      if (/^(envoi|envoy|valide|expedie)|^(صيفط|سيفط|ارسل|رسل)/.test(t)) { c.send(); return this.say("Envoi de la réponse."); }
      if (/^(lis|lire|lecture|relis)|اقرا|قرا|اقرأ/.test(t)) return this.say(c.lastClientMessage());
      if (/visio|video|فيديو|فيدو/.test(t) && /appel|appelle|lance|visio|عيط|اتصل|فيديو/.test(t)) { c.call(true); return this.say("Appel vidéo lancé."); }
      if (/^(appel|appelle|telephone|sonne)|عيط|اتصل|كلم/.test(t)) { c.call(false); return this.say("Appel audio lancé."); }
      const st = statusFrom(t);
      if (st) { await c.setStatus(st); return this.say("Statut changé : " + STATUS[st] + "."); }
      if (/retour|precedent|رجع/.test(t)) { history.back(); return this.say("Retour."); }
    }
    if (/clients?\b|الكليان|العملاء|الزبناء|الزبائن/.test(t)) { go("/clients"); return this.say("Liste des clients."); }
    if (/profil|البروفيل|الحساب ديالي/.test(t)) { go("/profil"); return this.say("Votre profil."); }
    // Commandes de liste : si on n'est pas sur la liste, on y va d'abord
    const listCmd = (f) => { if (c.kind === "list") return f(c); this.pending = () => f(this.ctx); go("/"); };
    let m;
    if ((m = orig.match(/^(?:cherche\w*|recherche\w*|trouve\w*)\s+(?:le client |la demande |le |la |les )?(.+)$/i)) || (m = orig.match(/^(?:قلب|ابحث|بحث|لقا)\s+(?:على|عن|علي)?\s*(.+)$/))) {
      const q = m[1].replace(/[.?!]+$/, "");
      listCmd((x) => x.search(q)); return this.say("Recherche : " + q);
    }
    if (/ouvr|affiche|montre|حل|فتح|وريني/.test(t)) {
      const o = ORD.find(([re]) => re.test(t));
      if (o) { listCmd(async (x) => { if (!(await x.open(o[1]))) this.say("Aucune demande à cette position."); }); return this.say("J'ouvre la demande."); }
    }
    if (/attente|sans reponse|pas repondu|repondre|كيتسناو|تسناو|انتظار|ماتجاوب|ماجاوبت/.test(t)) { listCmd((x) => x.setWaiting()); return this.say("Demandes en attente de votre réponse."); }
    const st = statusFrom(t);
    if (st) { listCmd((x) => x.setStatus(st)); return this.say("Demandes : " + STATUS[st] + "."); }
    if (/toutes|tout|كلشي|جميع|كاملين/.test(t)) { listCmd((x) => x.setStatus("")); return this.say("Toutes les demandes."); }
    if (/accueil|demandes|tableau|الرئيسيه|الطلبات|الديمونض/.test(t)) { go("/"); return this.say("Tableau de bord."); }
    this.help.hidden = false;
    return this.say(VLANG === "ar-MA" ? "مافهمتش. شوف لائحة الأوامر." : "Je n'ai pas compris. Voici les commandes possibles.");
  },
};


// ---------- Lecture à voix haute ----------
function readAloud(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[؀-ۿ]/.test(text) ? "ar-MA" : "fr-FR"; u.rate = 1;
    speechSynthesis.speak(u);
  } catch { toast("La lecture à voix haute n'est pas disponible sur ce navigateur"); }
}

// ---------- « Parler au support » (clients) ----------
// Le client parle : sa voix est enregistrée ET transcrite en texte. Il relit, puis envoie :
// l'équipe reçoit le texte et le message vocal. Sur une demande ouverte, c'est une réponse ;
// ailleurs, une nouvelle demande est créée.
const VC = {
  el: null, panel: null, ticketId: null, st: null,
  ensure() {
    if (this.el) return true;
    if (!navigator.mediaDevices?.getUserMedia || pickMime(AUDIO_MIMES) === null) return false;
    this.panel = h("div", { class: "va-panel vc", hidden: true });
    this.el = h("button", { class: "va-btn vc-btn", type: "button", "aria-label": "Parler au support", title: "Parler au support : votre voix et le texte sont envoyés à Magiscom Tech", onclick: () => (this.st && this.st.rec ? this.stop() : this.start()) }, icon("mic"));
    this.tip = h("span", { class: "vc-tip" }, "Parler au support");
    document.body.append(this.panel, this.tip, this.el);
    return true;
  },
  show() { if (this.ensure()) { this.el.hidden = false; this.tip.hidden = false; } },
  hide() { if (this.el) { this.cancel(); this.el.hidden = true; this.tip.hidden = true; } },
  cancel() {
    const st = this.st; this.st = null;
    if (st) { clearInterval(st.timer); try { st.sr && st.sr.abort(); } catch {} if (st.rec && st.rec.state !== "inactive") { st.rec.onstop = null; st.rec.stop(); } st.stream && st.stream.getTracks().forEach((t) => t.stop()); st.url && URL.revokeObjectURL(st.url); }
    if (this.panel) this.panel.hidden = true;
    if (this.el) this.el.classList.remove("on");
  },
  async start() {
    this.cancel();
    const st = (this.st = { text: "", interim: "", chunks: [], t0: Date.now() });
    const live = h("p", { class: "vc-live" }, "…");
    const clk = h("span", { class: "muted small" }, "0:00");
    const note = h("p", { class: "muted small", hidden: true });
    this.panel.replaceChildren(
      h("div", { class: "row between" }, h("b", null, "Parlez, je vous écoute"), h("div", { class: "row tight" }, langBtn(), h("button", { class: "install-x", type: "button", "aria-label": "Annuler", onclick: () => this.cancel() }, "×"))),
      h("p", { class: "row tight small" }, h("span", { class: "rec-dot" }), "Enregistrement ", clk),
      live, note,
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: () => this.stop() }, "Terminer"), h("button", { class: "btn", type: "button", onclick: () => this.cancel() }, "Annuler")));
    this.panel.hidden = false;
    try { st.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { this.cancel(); return toast(mediaError(e)); }
    if (this.st !== st) return st.stream.getTracks().forEach((t) => t.stop());
    const mime = pickMime(AUDIO_MIMES);
    st.rec = new MediaRecorder(st.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    st.rec.ondataavailable = (e) => e.data.size && st.chunks.push(e.data);
    st.rec.start(1000);
    this.el.classList.add("on");
    st.timer = setInterval(() => { const sec = (Date.now() - st.t0) / 1000; clk.textContent = clock(sec); if (sec >= MAX_VOICE_SEC) this.stop(); }, 500);
    // Transcription en direct (si le navigateur la propose)
    const noText = (why) => { note.textContent = why; note.hidden = false; live.textContent = "Votre message vocal sera envoyé tel quel."; };
    if (!SR) noText("La transcription n'est pas disponible sur ce navigateur.");
    else {
      const startSR = () => {
        const r = new SR(); r.lang = VLANG; r.continuous = true; r.interimResults = true;
        r.onresult = (e) => {
          st.interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (st.text += e.results[i][0].transcript.trim() + " ") : (st.interim += e.results[i][0].transcript));
          live.textContent = (st.text + st.interim).trim() || "…";
        };
        r.onerror = (e) => { if (e.error === "audio-capture" || e.error === "not-allowed" || e.error === "service-not-allowed") { st.srDead = true; noText("Transcription indisponible sur cet appareil."); } };
        r.onend = () => { if (this.st === st && st.rec && st.rec.state === "recording" && !st.srDead) { try { startSR(); } catch {} } };
        st.sr = r; try { r.start(); } catch { st.srDead = true; }
      };
      startSR();
    }
  },
  stop() {
    const st = this.st; if (!st || !st.rec) return;
    clearInterval(st.timer);
    st.srDead = true; try { st.sr && st.sr.stop(); } catch {}
    st.rec.onstop = () => { st.stream.getTracks().forEach((t) => t.stop()); setTimeout(() => this.review(st), 350); };
    if (st.rec.state !== "inactive") st.rec.stop();
    this.el.classList.remove("on");
  },
  review(st) {
    if (this.st !== st) return;
    const type = (st.rec.mimeType || "audio/webm").split(";")[0];
    st.file = st.chunks.length ? new File(st.chunks, `message-vocal-${new Date().toISOString().slice(11, 16).replace(":", "h")}.${extOf(type)}`, { type }) : null;
    st.type = type;
    st.url = st.file ? URL.createObjectURL(st.file) : null;
    const text = (st.text + st.interim).trim();
    const ta = h("textarea", { maxlength: 5000, "aria-label": "Texte de votre message" }); ta.value = text;
    const onTicket = !!this.ticketId;
    const subj = h("input", { maxlength: 150, "aria-label": "Titre", placeholder: "Titre de la demande" });
    subj.value = text ? text.split(/\s+/).slice(0, 9).join(" ").replace(/[,.;:!?]+$/, "") : "Message vocal";
    const cat = h("select", { "aria-label": "Catégorie" }, Object.entries(CATS).map(([k, l]) => h("option", { value: k, selected: k === "autre" }, l)));
    const err = errBox();
    const send = h("button", { class: "btn primary", type: "button" }, onTicket ? "Envoyer à Magiscom Tech" : "Créer la demande");
    send.addEventListener("click", async () => {
      err.hidden = true;
      if (!ta.value.trim() && !st.file) return showErr(err, new Error("Message vide"));
      if (!onTicket && subj.value.trim().length < 3) return showErr(err, new Error("Donnez un titre à votre demande"));
      send.disabled = true; send.textContent = "Envoi…";
      try {
        const attachments = st.file ? [(await uploadFile(st.file, st.type, () => {})).id] : [];
        let tid = this.ticketId;
        if (onTicket) await api(`/api/tickets/${tid}/messages`, { method: "POST", body: { body: ta.value, attachments } });
        else tid = (await api("/api/tickets", { method: "POST", body: { subject: subj.value, category: cat.value, body: ta.value, attachments } })).ticket.id;
        this.cancel(); toast("Message envoyé à Magiscom Tech");
        if (location.hash === "#/t/" + tid) router(); else go("/t/" + tid);
      } catch (e) { showErr(err, e); send.disabled = false; send.textContent = onTicket ? "Envoyer à Magiscom Tech" : "Créer la demande"; }
    });
    this.panel.replaceChildren(
      h("div", { class: "row between" }, h("b", null, onTicket ? "Votre réponse" : "Nouvelle demande"), h("button", { class: "install-x", type: "button", "aria-label": "Annuler", onclick: () => this.cancel() }, "×")),
      h("p", { class: "muted small" }, "Relisez et corrigez le texte si besoin. Votre voix est envoyée avec."),
      onTicket ? null : h("label", { class: "f" }, "Titre", subj),
      onTicket ? null : h("label", { class: "f" }, "Catégorie", cat),
      h("label", { class: "f" }, "Texte", ta),
      st.url ? h("div", { class: "aud" }, h("span", { class: "small muted" }, "🎤 Votre message vocal"), h("audio", { src: st.url, controls: true, preload: "metadata" })) : null,
      err,
      h("div", { class: "row" }, send, h("button", { class: "btn", type: "button", onclick: () => this.start() }, "Recommencer")));
  },
};
// ---------- Routeur ----------
async function router() {
  clearInterval(pollTimer); pollTimer = null;
  VA.ctx = null; VC.ticketId = null;
  const path = location.hash.slice(1) || "/";
  if (!ME) {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (r.ok) ME = (await r.json()).user;
    } catch {}
  }
  if (!ME) { VA.hide(); VC.hide(); return viewAuth(path === "/register" ? "register" : "login"); }
  startIncomingPoll();
  if (ME.role === "admin") { VA.show(); VC.hide(); } else { VA.hide(); VC.show(); }
  const admin = ME.role === "admin";
  let m;
  if (path === "/new" && !admin) return viewNew();
  if (path === "/profil") return viewProfile();
  if ((m = path.match(/^\/t\/([0-9a-f-]{36})$/))) return viewTicket(m[1]);
  if (admin && path === "/clients") return viewClients();
  if (admin && (m = path.match(/^\/client\/([0-9a-f-]{36})$/))) return viewAdmin({ user: m[1] });
  if (path !== "/") { history.replaceState(null, "", "#/"); }
  return admin ? viewAdmin() : viewMyTickets();
}
$("#logout").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  ME = null; go("/login");
});
window.addEventListener("hashchange", router);
router();

// ---------- Installation comme une application ----------
(function setupInstall() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;
  let dismissed = false;
  try { dismissed = Number(localStorage.getItem("mtd_install_x") || 0) > Date.now(); } catch {}
  if (dismissed) return;
  const bar = $("#install"), btn = $("#installBtn"), hint = $("#installHint");
  $("#installX").addEventListener("click", () => {
    bar.hidden = true;
    try { localStorage.setItem("mtd_install_x", String(Date.now() + 7 * 86400000)); } catch {}
  });
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    btn.hidden = false; bar.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({}));
    deferred = null;
    if (outcome === "accepted") bar.hidden = true;
  });
  window.addEventListener("appinstalled", () => { bar.hidden = true; toast("Application installée"); });
  // iPhone / iPad : pas de bouton automatique, on explique le geste
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    hint.textContent = "Touchez Partager (carré avec une flèche), puis « Sur l'écran d'accueil ».";
    btn.hidden = true; bar.hidden = false;
  }
})();
