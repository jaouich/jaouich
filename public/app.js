"use strict";
// Magiscom Tech Desk — application monopage (aucune dépendance)

const MB = 1024 * 1024;
const MAX_IMG = 15 * MB, MAX_VID = 95 * MB, MAX_FILES = 6;
const STATUS = { open: "Ouvert", in_review: "En cours de traitement", resolved: "Résolu", unresolved: "Non résolu" };
const STATUS_HELP = {
  open: "Votre demande est bien reçue. Notre équipe va la prendre en charge.",
  in_review: "Notre équipe travaille sur votre demande.",
  resolved: "Le problème est réglé. Écrivez-nous s'il revient : la demande sera rouverte.",
  unresolved: "Nous n'avons pas pu régler ce problème. Écrivez-nous pour en reparler.",
};
const CATS = { ebp: "Logiciel EBP", sage: "Logiciel Sage", installation: "Installation", formation: "Formation", facturation: "Facturation / devis", autre: "Autre" };
const EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp" };
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

// ---------- Sélecteur de photos et vidéos ----------
function makePicker() {
  const items = []; // { file, type, url, tile, prog, att }
  const grid = h("div", { class: "picker", hidden: true });
  const input = h("input", { type: "file", accept: "image/*,video/*", multiple: true, "aria-label": "Ajouter une photo ou une vidéo" });
  const err = errBox();
  const addBtn = h("label", { class: "btn filebtn sm" }, "📎 Photo ou vidéo", input);
  input.addEventListener("change", () => {
    err.hidden = true;
    for (const file of input.files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const type = ALLOWED.has(file.type) ? file.type : EXT[ext];
      if (!type) { showErr(err, `« ${file.name} » : format non accepté (photos JPG, PNG, HEIC… ou vidéos MP4, MOV…)`); continue; }
      const isVid = type.startsWith("video/");
      if (file.size > (isVid ? MAX_VID : MAX_IMG)) { showErr(err, `« ${file.name} » est trop lourd (maximum ${isVid ? 95 : 15} Mo). Raccourcissez ou compressez la vidéo.`); continue; }
      if (items.length >= MAX_FILES) { showErr(err, `Maximum ${MAX_FILES} fichiers par message.`); break; }
      const url = URL.createObjectURL(file);
      const prog = h("div", { class: "prog" });
      const it = { file, type, url, prog, att: null };
      const media = isVid ? h("video", { src: url, muted: true, playsinline: true, preload: "metadata" }) : h("img", { src: url, alt: file.name });
      it.tile = h("div", { class: "pv" }, media,
        h("span", { class: "tag" }, (isVid ? "Vidéo · " : "") + fmtSize(file.size)),
        h("button", { type: "button", "aria-label": "Retirer", onclick: () => { URL.revokeObjectURL(url); it.tile.remove(); items.splice(items.indexOf(it), 1); grid.hidden = !items.length; } }, "×"),
        prog);
      items.push(it); grid.append(it.tile); grid.hidden = false;
    }
    input.value = "";
  });
  return {
    el: h("div", { class: "stack" }, h("div", { class: "row" }, addBtn, h("span", { class: "muted small" }, `Jusqu'à ${MAX_FILES} fichiers · photos 15 Mo · vidéos 95 Mo`)), grid, err),
    count: () => items.length,
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
  mount(h("div", { class: "auth stack" },
    h("div", { class: "center" }, h("div", { class: "logo" }, "M"), h("h1", null, "Magiscom Tech Desk"),
      h("p", { class: "muted" }, "L'espace support des clients Magiscom Tech. Décrivez votre problème, joignez une photo ou une vidéo, et suivez la réponse ici.")),
    h("div", { class: "card stack" },
      h("div", { class: "tabs" },
        h("button", { type: "button", "aria-pressed": String(!isReg), onclick: () => go("/login") }, "Connexion"),
        h("button", { type: "button", "aria-pressed": String(isReg), onclick: () => go("/register") }, "Créer un compte")),
      form)));
}

// ---------- Barre du haut ----------
function showBar(active) {
  $("#bar").hidden = false;
  $("#whoName").textContent = ME.name + (ME.role === "admin" ? " · Admin" : "");
  const links = ME.role === "admin"
    ? [["/", "Demandes"], ["/clients", "Clients"], ["/profil", "Mon profil"]]
    : [["/", "Mes demandes"], ["/new", "Nouvelle demande"], ["/profil", "Mon profil"]];
  $("#nav").replaceChildren(...links.map(([p, l]) => h("a", { href: "#" + p, class: active === p ? "on" : null }, l)));
}

// ---------- Liste des demandes ----------
function ticketCard(t, admin) {
  const waiting = admin && t.last_sender === "user" && (t.status === "open" || t.status === "in_review");
  return h("a", { class: "tk", href: "#/t/" + t.id },
    h("div", { class: "row between" }, h("h3", null, waiting ? h("span", { class: "dot", title: "En attente de votre réponse" }) : null, waiting ? " " : null, t.subject), badge(t.status)),
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
      : [h("div", { class: "empty card" }, tickets.length ? "Aucune demande avec ce statut." : "Vous n'avez encore envoyé aucune demande.", h("br"), h("br"), h("a", { class: "btn primary", href: "#/new" }, "Créer une demande"))]));
  };
  mount(h("div", { class: "stack" }, h("div", { class: "row between" }, h("h1", null, "Mes demandes"), h("a", { class: "btn primary", href: "#/new" }, "+ Nouvelle demande")), chips, list));
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
      if (!data.body.trim() && !picker.count()) throw new Error("Décrivez le problème ou joignez une photo ou une vidéo");
      btn.textContent = picker.count() ? "Envoi des fichiers…" : "Envoi…";
      const attachments = await picker.uploadAll();
      const r = await api("/api/tickets", { method: "POST", body: { ...data, attachments } });
      picker.clear(); toast("Demande envoyée"); go("/t/" + r.ticket.id);
    } catch (ex) { showErr(err, ex); btn.disabled = false; btn.textContent = "Envoyer la demande"; }
  });
  mount(h("div", { class: "stack" }, h("a", { href: "#/" }, "← Retour"), h("h1", null, "Nouvelle demande"), form));
}

// ---------- Fil d'une demande ----------
function mediaGrid(atts) {
  if (!atts.length) return null;
  return h("div", { class: "media" }, atts.map((a) => {
    const hook = window.MagisDeskHooks?.mediaUrl;
    const src = hook ? hook(a.id) : "/api/media/" + a.id;
    if (a.mime.startsWith("video/")) return h("video", { src, controls: true, preload: "metadata", playsinline: true, title: a.name });
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
    const mine = m.sender_id === ME.id;
    return h("div", { class: "msg" + (mine ? " mine" : "") },
      h("span", { class: "who" }, (mine ? "Vous" : m.sender_name + (m.sender_role === "admin" ? " · Magiscom Tech" : "")) + " · " + fmtDate(m.created_at)),
      m.body ? h("div", { class: "body" }, m.body) : null,
      mediaGrid(m.attachments));
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
  const form = h("form", { class: "card stack" }, ta, picker.el, err, hint, h("div", { class: "row" }, send));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
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

  mount(h("div", { class: "stack" },
    h("a", { href: admin ? "#/" : "#/" }, "← Retour"),
    h("div", { class: "row between" }, h("h1", null, d.ticket.subject), titleBadge),
    admin && d.owner ? h("p", { class: "muted small" }, d.owner.name + (d.owner.company ? " · " + d.owner.company : "") + " · " + (CATS[d.ticket.category] || "")) : null,
    h("div", { class: "side" }, h("div", { class: "stack" }, thread, form), aside)));
  paint(d);

  // Rafraîchissement automatique toutes les 20 s (sans toucher au message en cours d'écriture)
  pollTimer = setInterval(async () => {
    if (document.hidden || send.disabled) return;
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
  let title = h("h1", null, "Demandes des clients");
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
      list.replaceChildren(...(tickets.length ? tickets.map((t) => ticketCard(t, true)) : [h("div", { class: "empty card" }, "Aucune demande ne correspond.")]));
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
    title, state.user ? null : statsBox, search, chips, list));
  drawChips(); load();
  if (!state.user) {
    try {
      const s = await api("/api/admin/stats");
      const tile = (n, label, onclick) => h("button", { class: "stat", type: "button", onclick }, h("b", null, n), h("span", null, label));
      statsBox.replaceChildren(
        tile(s.waiting, "En attente de réponse", () => { state.waiting = true; state.status = ""; drawChips(); load(); }),
        tile(s.stats.open, "Ouvertes", () => { state.status = "open"; state.waiting = false; drawChips(); load(); }),
        tile(s.stats.in_review, "En cours", () => { state.status = "in_review"; state.waiting = false; drawChips(); load(); }),
        tile(s.stats.resolved, "Résolues", () => { state.status = "resolved"; state.waiting = false; drawChips(); load(); }),
        tile(s.stats.unresolved, "Non résolues", () => { state.status = "unresolved"; state.waiting = false; drawChips(); load(); }),
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
      h("td", null, h("b", null, u.name), u.role === "admin" ? " (admin)" : "", h("br"), h("span", { class: "muted small" }, u.company || "")),
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

// ---------- Routeur ----------
async function router() {
  clearInterval(pollTimer); pollTimer = null;
  const path = location.hash.slice(1) || "/";
  if (!ME) {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (r.ok) ME = (await r.json()).user;
    } catch {}
  }
  if (!ME) return viewAuth(path === "/register" ? "register" : "login");
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
