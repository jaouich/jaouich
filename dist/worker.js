// Magiscom Tech Desk — Support clients
// Cloudflare Worker + D1 (base de données) + R2 (photos et vidéos)

const ASSETS = {"/":{"type":"text/html; charset=utf-8","body":"<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#0a2a6b\">\n<title>Magiscom Tech Desk · Support clients</title>\n<link rel=\"icon\" href=\"/icon.svg\" type=\"image/svg+xml\">\n<link rel=\"stylesheet\" href=\"/app.css\">\n</head>\n<body>\n<header class=\"bar\" id=\"bar\" hidden>\n  <a class=\"brand\" href=\"#/\"><span class=\"logo\">M</span><span><b>Magiscom Tech Desk</b><small>Support clients</small></span></a>\n  <nav class=\"nav\" id=\"nav\"></nav>\n  <div class=\"who\"><span id=\"whoName\"></span><button class=\"btn ghost sm\" id=\"logout\">Déconnexion</button></div>\n</header>\n<main id=\"app\" class=\"wrap\"><p class=\"muted center\">Chargement…</p></main>\n<div class=\"toast\" id=\"toast\" role=\"status\" hidden></div>\n<script src=\"/app.js\"></script>\n</body>\n</html>\n"},"/app.js":{"type":"text/javascript; charset=utf-8","body":"\"use strict\";\n// Magiscom Tech Desk — application monopage (aucune dépendance)\n\nconst MB = 1024 * 1024;\nconst MAX_IMG = 15 * MB, MAX_VID = 95 * MB, MAX_FILES = 6;\nconst STATUS = { open: \"Ouvert\", in_review: \"En cours de traitement\", resolved: \"Résolu\", unresolved: \"Non résolu\" };\nconst STATUS_HELP = {\n  open: \"Votre demande est bien reçue. Notre équipe va la prendre en charge.\",\n  in_review: \"Notre équipe travaille sur votre demande.\",\n  resolved: \"Le problème est réglé. Écrivez-nous s'il revient : la demande sera rouverte.\",\n  unresolved: \"Nous n'avons pas pu régler ce problème. Écrivez-nous pour en reparler.\",\n};\nconst CATS = { ebp: \"Logiciel EBP\", sage: \"Logiciel Sage\", installation: \"Installation\", formation: \"Formation\", facturation: \"Facturation / devis\", autre: \"Autre\" };\nconst EXT = { jpg: \"image/jpeg\", jpeg: \"image/jpeg\", png: \"image/png\", webp: \"image/webp\", gif: \"image/gif\", heic: \"image/heic\", heif: \"image/heif\", mp4: \"video/mp4\", m4v: \"video/mp4\", mov: \"video/quicktime\", webm: \"video/webm\", \"3gp\": \"video/3gpp\" };\nconst ALLOWED = new Set(Object.values(EXT));\n\nlet ME = null;\nlet pollTimer = null;\n\n// ---------- Outils ----------\nconst $ = (s) => document.querySelector(s);\nfunction h(tag, attrs, ...kids) {\n  const e = document.createElement(tag);\n  for (const [k, v] of Object.entries(attrs || {})) {\n    if (v == null || v === false) continue;\n    if (k === \"class\") e.className = v;\n    else if (k.startsWith(\"on\")) e.addEventListener(k.slice(2), v);\n    else e.setAttribute(k, v === true ? \"\" : v);\n  }\n  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));\n  return e;\n}\nconst fmtDate = (ts) => new Intl.DateTimeFormat(\"fr-FR\", { dateStyle: \"medium\", timeStyle: \"short\" }).format(new Date(ts));\nconst fmtDay = (ts) => new Intl.DateTimeFormat(\"fr-FR\", { dateStyle: \"medium\" }).format(new Date(ts));\nconst fmtSize = (n) => (n >= MB ? (n / MB).toFixed(1).replace(\".\", \",\") + \" Mo\" : Math.max(1, Math.round(n / 1024)) + \" Ko\");\nconst badge = (s) => h(\"span\", { class: \"badge st-\" + s }, STATUS[s] || s);\nlet toastT;\nfunction toast(text) {\n  const t = $(\"#toast\"); t.textContent = text; t.hidden = false;\n  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500);\n}\nfunction mount(...nodes) { $(\"#app\").replaceChildren(...nodes); window.scrollTo(0, 0); }\nconst go = (path) => { if (location.hash === \"#\" + path) router(); else location.hash = \"#\" + path; };\nconst errBox = () => h(\"div\", { class: \"err\", role: \"alert\", hidden: true });\nconst showErr = (box, e) => { box.textContent = e.message || String(e); box.hidden = false; };\n\nasync function api(path, { method = \"GET\", body } = {}) {\n  const opt = { method, headers: {}, credentials: \"same-origin\" };\n  if (method !== \"GET\") opt.headers[\"X-Requested-With\"] = \"magisdesk\";\n  if (body !== undefined) { opt.headers[\"Content-Type\"] = \"application/json\"; opt.body = JSON.stringify(body); }\n  let r;\n  try { r = await fetch(path, opt); } catch { throw new Error(\"Pas de connexion internet\"); }\n  let data = {};\n  try { data = await r.json(); } catch {}\n  if (r.status === 401 && !path.startsWith(\"/api/auth/\")) { ME = null; go(\"/login\"); }\n  if (!r.ok) { const e = new Error(data.error || \"Erreur, réessayez\"); e.status = r.status; throw e; }\n  return data;\n}\nfunction uploadFile(file, type, onProgress) {\n  if (window.MagisDeskHooks?.upload) return window.MagisDeskHooks.upload(file, type, onProgress);\n  return new Promise((resolve, reject) => {\n    const x = new XMLHttpRequest();\n    x.open(\"PUT\", \"/api/uploads\");\n    x.setRequestHeader(\"Content-Type\", type);\n    x.setRequestHeader(\"X-File-Name\", encodeURIComponent(file.name || \"fichier\"));\n    x.setRequestHeader(\"X-Requested-With\", \"magisdesk\");\n    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);\n    x.onload = () => {\n      let d = {};\n      try { d = JSON.parse(x.responseText); } catch {}\n      if (x.status >= 200 && x.status < 300) resolve(d.attachment);\n      else reject(new Error(d.error || \"Envoi du fichier impossible\"));\n    };\n    x.onerror = () => reject(new Error(\"Connexion perdue pendant l'envoi du fichier\"));\n    x.send(file);\n  });\n}\n\n// ---------- Sélecteur de photos et vidéos ----------\nfunction makePicker() {\n  const items = []; // { file, type, url, tile, prog, att }\n  const grid = h(\"div\", { class: \"picker\", hidden: true });\n  const input = h(\"input\", { type: \"file\", accept: \"image/*,video/*\", multiple: true, \"aria-label\": \"Ajouter une photo ou une vidéo\" });\n  const err = errBox();\n  const addBtn = h(\"label\", { class: \"btn filebtn sm\" }, \"📎 Photo ou vidéo\", input);\n  input.addEventListener(\"change\", () => {\n    err.hidden = true;\n    for (const file of input.files) {\n      const ext = (file.name.split(\".\").pop() || \"\").toLowerCase();\n      const type = ALLOWED.has(file.type) ? file.type : EXT[ext];\n      if (!type) { showErr(err, `« ${file.name} » : format non accepté (photos JPG, PNG, HEIC… ou vidéos MP4, MOV…)`); continue; }\n      const isVid = type.startsWith(\"video/\");\n      if (file.size > (isVid ? MAX_VID : MAX_IMG)) { showErr(err, `« ${file.name} » est trop lourd (maximum ${isVid ? 95 : 15} Mo). Raccourcissez ou compressez la vidéo.`); continue; }\n      if (items.length >= MAX_FILES) { showErr(err, `Maximum ${MAX_FILES} fichiers par message.`); break; }\n      const url = URL.createObjectURL(file);\n      const prog = h(\"div\", { class: \"prog\" });\n      const it = { file, type, url, prog, att: null };\n      const media = isVid ? h(\"video\", { src: url, muted: true, playsinline: true, preload: \"metadata\" }) : h(\"img\", { src: url, alt: file.name });\n      it.tile = h(\"div\", { class: \"pv\" }, media,\n        h(\"span\", { class: \"tag\" }, (isVid ? \"Vidéo · \" : \"\") + fmtSize(file.size)),\n        h(\"button\", { type: \"button\", \"aria-label\": \"Retirer\", onclick: () => { URL.revokeObjectURL(url); it.tile.remove(); items.splice(items.indexOf(it), 1); grid.hidden = !items.length; } }, \"×\"),\n        prog);\n      items.push(it); grid.append(it.tile); grid.hidden = false;\n    }\n    input.value = \"\";\n  });\n  return {\n    el: h(\"div\", { class: \"stack\" }, h(\"div\", { class: \"row\" }, addBtn, h(\"span\", { class: \"muted small\" }, `Jusqu'à ${MAX_FILES} fichiers · photos 15 Mo · vidéos 95 Mo`)), grid, err),\n    count: () => items.length,\n    async uploadAll() {\n      const ids = [];\n      for (const it of items) {\n        if (!it.att) it.att = await uploadFile(it.file, it.type, (p) => (it.prog.style.width = Math.round(p * 100) + \"%\"));\n        it.prog.style.width = \"100%\";\n        ids.push(it.att.id);\n      }\n      return ids;\n    },\n    clear() { for (const it of items) URL.revokeObjectURL(it.url); items.length = 0; grid.replaceChildren(); grid.hidden = true; },\n  };\n}\n\n// ---------- Connexion / inscription ----------\nfunction viewAuth(mode) {\n  $(\"#bar\").hidden = true;\n  const err = errBox();\n  const isReg = mode === \"register\";\n  const f = (label, name, type = \"text\", extra = {}) => h(\"label\", { class: \"f\" }, label, h(\"input\", { name, type, ...extra }));\n  const form = h(\"form\", { class: \"stack\", novalidate: true },\n    isReg && f(\"Nom complet\", \"name\", \"text\", { autocomplete: \"name\", required: true }),\n    isReg && f(\"Entreprise\", \"company\", \"text\", { autocomplete: \"organization\" }),\n    isReg && f(\"Téléphone\", \"phone\", \"tel\", { autocomplete: \"tel\" }),\n    f(\"E-mail\", \"email\", \"email\", { autocomplete: \"email\", required: true }),\n    f(\"Mot de passe\" + (isReg ? \" (8 caractères minimum)\" : \"\"), \"password\", \"password\", { autocomplete: isReg ? \"new-password\" : \"current-password\", required: true, minlength: isReg ? 8 : null }),\n    err,\n    h(\"button\", { class: \"btn primary\", type: \"submit\" }, isReg ? \"Créer mon compte\" : \"Se connecter\"));\n  form.addEventListener(\"submit\", async (e) => {\n    e.preventDefault();\n    const btn = form.querySelector(\"button[type=submit]\"); btn.disabled = true; err.hidden = true;\n    const data = Object.fromEntries(new FormData(form));\n    try {\n      ME = (await api(isReg ? \"/api/auth/register\" : \"/api/auth/login\", { method: \"POST\", body: data })).user;\n      go(\"/\");\n    } catch (ex) { showErr(err, ex); btn.disabled = false; }\n  });\n  mount(h(\"div\", { class: \"auth stack\" },\n    h(\"div\", { class: \"center\" }, h(\"div\", { class: \"logo\" }, \"M\"), h(\"h1\", null, \"Magiscom Tech Desk\"),\n      h(\"p\", { class: \"muted\" }, \"L'espace support des clients Magiscom Tech. Décrivez votre problème, joignez une photo ou une vidéo, et suivez la réponse ici.\")),\n    h(\"div\", { class: \"card stack\" },\n      h(\"div\", { class: \"tabs\" },\n        h(\"button\", { type: \"button\", \"aria-pressed\": String(!isReg), onclick: () => go(\"/login\") }, \"Connexion\"),\n        h(\"button\", { type: \"button\", \"aria-pressed\": String(isReg), onclick: () => go(\"/register\") }, \"Créer un compte\")),\n      form)));\n}\n\n// ---------- Barre du haut ----------\nfunction showBar(active) {\n  $(\"#bar\").hidden = false;\n  $(\"#whoName\").textContent = ME.name + (ME.role === \"admin\" ? \" · \" + (ME.title || \"Admin\") : \"\");\n  const links = ME.role === \"admin\"\n    ? [[\"/\", \"Demandes\"], [\"/clients\", \"Clients\"], [\"/profil\", \"Mon profil\"]]\n    : [[\"/\", \"Mes demandes\"], [\"/new\", \"Nouvelle demande\"], [\"/profil\", \"Mon profil\"]];\n  $(\"#nav\").replaceChildren(...links.map(([p, l]) => h(\"a\", { href: \"#\" + p, class: active === p ? \"on\" : null }, l)));\n}\n\n// ---------- Liste des demandes ----------\nfunction ticketCard(t, admin) {\n  const waiting = admin && t.last_sender === \"user\" && (t.status === \"open\" || t.status === \"in_review\");\n  return h(\"a\", { class: \"tk\", href: \"#/t/\" + t.id },\n    h(\"div\", { class: \"row between\" }, h(\"h3\", null, waiting ? h(\"span\", { class: \"dot\", title: \"En attente de votre réponse\" }) : null, waiting ? \" \" : null, t.subject), badge(t.status)),\n    h(\"div\", { class: \"meta\" },\n      admin && h(\"b\", null, t.user_name + (t.user_company ? \" · \" + t.user_company : \"\")),\n      h(\"span\", null, CATS[t.category] || t.category),\n      h(\"span\", null, \"Mis à jour le \" + fmtDate(t.updated_at)),\n      h(\"span\", null, t.message_count + \" message\" + (t.message_count > 1 ? \"s\" : \"\")),\n      t.attachment_count ? h(\"span\", null, \"📎 \" + t.attachment_count) : null,\n      !admin && t.last_sender === \"admin\" && t.status !== \"resolved\" ? h(\"b\", { class: \"new\" }, \"Nouvelle réponse\") : null));\n}\nasync function viewMyTickets() {\n  showBar(\"/\");\n  let filter = \"all\", tickets = [];\n  const list = h(\"div\", { class: \"list\" });\n  const chips = h(\"div\", { class: \"chips\" });\n  const draw = () => {\n    chips.replaceChildren(...[[\"all\", \"Toutes\"], ...Object.entries(STATUS)].map(([k, l]) =>\n      h(\"button\", { class: \"chip\", \"aria-pressed\": String(filter === k), onclick: () => { filter = k; draw(); } }, l)));\n    const shown = tickets.filter((t) => filter === \"all\" || t.status === filter);\n    list.replaceChildren(...(shown.length ? shown.map((t) => ticketCard(t, false))\n      : [h(\"div\", { class: \"empty card\" }, tickets.length ? \"Aucune demande avec ce statut.\" : \"Vous n'avez encore envoyé aucune demande.\", h(\"br\"), h(\"br\"), h(\"a\", { class: \"btn primary\", href: \"#/new\" }, \"Créer une demande\"))]));\n  };\n  mount(h(\"div\", { class: \"stack\" }, h(\"div\", { class: \"row between\" }, h(\"h1\", null, \"Mes demandes\"), h(\"a\", { class: \"btn primary\", href: \"#/new\" }, \"+ Nouvelle demande\")), chips, list));\n  list.replaceChildren(h(\"p\", { class: \"muted\" }, \"Chargement…\"));\n  try { tickets = (await api(\"/api/tickets\")).tickets; draw(); }\n  catch (e) { list.replaceChildren(h(\"div\", { class: \"err\" }, e.message)); }\n}\n\n// ---------- Nouvelle demande ----------\nfunction viewNew() {\n  showBar(\"/new\");\n  const err = errBox();\n  const picker = makePicker();\n  const form = h(\"form\", { class: \"card stack\", novalidate: true },\n    h(\"label\", { class: \"f\" }, \"Titre de la demande\", h(\"input\", { name: \"subject\", maxlength: 150, placeholder: \"Ex. : Impossible d'imprimer une facture dans EBP\", required: true })),\n    h(\"label\", { class: \"f\" }, \"Catégorie\", h(\"select\", { name: \"category\" }, Object.entries(CATS).map(([k, l]) => h(\"option\", { value: k }, l)))),\n    h(\"label\", { class: \"f\" }, \"Décrivez le problème\", h(\"textarea\", { name: \"body\", maxlength: 5000, placeholder: \"Ce que vous faisiez, le message d'erreur affiché, depuis quand…\" })),\n    picker.el, err,\n    h(\"div\", { class: \"row\" }, h(\"button\", { class: \"btn primary\", type: \"submit\" }, \"Envoyer la demande\"), h(\"a\", { class: \"btn\", href: \"#/\" }, \"Annuler\")));\n  form.addEventListener(\"submit\", async (e) => {\n    e.preventDefault();\n    const btn = form.querySelector(\"button[type=submit]\"); btn.disabled = true; err.hidden = true;\n    const data = Object.fromEntries(new FormData(form));\n    try {\n      if (data.subject.trim().length < 3) throw new Error(\"Donnez un titre à votre demande\");\n      if (!data.body.trim() && !picker.count()) throw new Error(\"Décrivez le problème ou joignez une photo ou une vidéo\");\n      btn.textContent = picker.count() ? \"Envoi des fichiers…\" : \"Envoi…\";\n      const attachments = await picker.uploadAll();\n      const r = await api(\"/api/tickets\", { method: \"POST\", body: { ...data, attachments } });\n      picker.clear(); toast(\"Demande envoyée\"); go(\"/t/\" + r.ticket.id);\n    } catch (ex) { showErr(err, ex); btn.disabled = false; btn.textContent = \"Envoyer la demande\"; }\n  });\n  mount(h(\"div\", { class: \"stack\" }, h(\"a\", { href: \"#/\" }, \"← Retour\"), h(\"h1\", null, \"Nouvelle demande\"), form));\n}\n\n// ---------- Fil d'une demande ----------\nfunction mediaGrid(atts) {\n  if (!atts.length) return null;\n  return h(\"div\", { class: \"media\" }, atts.map((a) => {\n    const hook = window.MagisDeskHooks?.mediaUrl;\n    const src = hook ? hook(a.id) : \"/api/media/\" + a.id;\n    if (a.mime.startsWith(\"video/\")) return h(\"video\", { src, controls: true, preload: \"metadata\", playsinline: true, title: a.name });\n    if (a.mime === \"image/heic\" || a.mime === \"image/heif\")\n      return h(\"a\", { class: \"btn sm\", href: hook ? src : src + \"?download\", download: a.name, target: \"_blank\", rel: \"noopener\" }, \"📷 \" + a.name + \" (\" + fmtSize(a.size) + \")\");\n    return h(\"a\", { href: src, target: \"_blank\", rel: \"noopener\" }, h(\"img\", { src, alt: a.name, loading: \"lazy\" }));\n  }));\n}\nfunction threadNodes(d) {\n  const items = [\n    ...d.messages.map((m) => ({ ts: m.created_at, m })),\n    ...d.history.map((x) => ({ ts: x.created_at, x })),\n  ].sort((a, b) => a.ts - b.ts || (a.x ? -1 : 1));\n  return items.map(({ m, x }) => {\n    if (x) {\n      const by = x.by_role === \"admin\" ? \"Magiscom Tech\" : x.by_name;\n      return h(\"div\", { class: \"sys\" }, x.old_status\n        ? `${STATUS[x.old_status]} → ${STATUS[x.new_status]} · ${by} · ${fmtDate(x.created_at)}`\n        : `Demande créée · ${fmtDate(x.created_at)}`);\n    }\n    const mine = m.sender_id === ME.id;\n    return h(\"div\", { class: \"msg\" + (mine ? \" mine\" : \"\") },\n      h(\"span\", { class: \"who\" }, (mine ? \"Vous\" : m.sender_name + (m.sender_role === \"admin\" ? (m.sender_title ? \" · \" + m.sender_title : \"\") + \" · Magiscom Tech\" : \"\")) + \" · \" + fmtDate(m.created_at)),\n      m.body ? h(\"div\", { class: \"body\" }, m.body) : null,\n      mediaGrid(m.attachments));\n  });\n}\nasync function viewTicket(id) {\n  showBar(null);\n  const admin = ME.role === \"admin\";\n  let d;\n  try { d = await api(\"/api/tickets/\" + id); }\n  catch (e) { mount(h(\"div\", { class: \"stack\" }, h(\"a\", { href: \"#/\" }, \"← Retour\"), h(\"div\", { class: \"err\" }, e.message))); return; }\n\n  const thread = h(\"div\", { class: \"thread\" });\n  const aside = h(\"aside\", { class: \"stack\" });\n  const titleBadge = h(\"span\");\n  const hint = h(\"p\", { class: \"muted small\" });\n  let sig = \"\";\n  const paint = (data) => {\n    d = data;\n    sig = d.messages.length + \":\" + d.history.length + \":\" + d.ticket.status;\n    thread.replaceChildren(...threadNodes(d));\n    titleBadge.replaceChildren(badge(d.ticket.status));\n    hint.textContent = !admin && (d.ticket.status === \"resolved\" || d.ticket.status === \"unresolved\") ? \"Si vous répondez, la demande sera rouverte.\" : \"\";\n    hint.hidden = !hint.textContent;\n    aside.replaceChildren(...asideNodes(d));\n  };\n  const asideNodes = (data) => {\n    const t = data.ticket, o = data.owner;\n    if (!admin) return [h(\"div\", { class: \"card stack\" }, h(\"h3\", null, \"Statut\"), badge(t.status), h(\"p\", { class: \"muted small\" }, STATUS_HELP[t.status]),\n      h(\"div\", { class: \"kv\" }, h(\"span\", null, \"Catégorie\"), h(\"span\", null, CATS[t.category]), h(\"span\", null, \"Créée le\"), h(\"span\", null, fmtDay(t.created_at))))];\n    const sel = h(\"select\", { \"aria-label\": \"Statut\" }, Object.entries(STATUS).map(([k, l]) => h(\"option\", { value: k, selected: k === t.status }, l)));\n    const save = h(\"button\", { class: \"btn primary sm\" }, \"Mettre à jour le statut\");\n    save.addEventListener(\"click\", async () => {\n      save.disabled = true;\n      try { await api(`/api/tickets/${id}/status`, { method: \"PATCH\", body: { status: sel.value } }); toast(\"Statut mis à jour\"); paint(await api(\"/api/tickets/\" + id)); }\n      catch (e) { toast(e.message); save.disabled = false; }\n    });\n    return [\n      h(\"div\", { class: \"card stack\" }, h(\"h3\", null, \"Statut\"), sel, save),\n      h(\"div\", { class: \"card stack\" }, h(\"h3\", null, \"Client\"),\n        h(\"div\", { class: \"kv\" },\n          h(\"span\", null, \"Nom\"), h(\"span\", null, o.name),\n          h(\"span\", null, \"Entreprise\"), h(\"span\", null, o.company || \"—\"),\n          h(\"span\", null, \"E-mail\"), h(\"span\", null, o.email),\n          h(\"span\", null, \"Téléphone\"), h(\"span\", null, o.phone || \"—\"),\n          h(\"span\", null, \"Client depuis\"), h(\"span\", null, fmtDay(o.created_at))),\n        h(\"a\", { class: \"btn sm\", href: \"#/client/\" + o.id }, \"Toutes ses demandes\")),\n    ];\n  };\n\n  const err = errBox();\n  const picker = makePicker();\n  const ta = h(\"textarea\", { maxlength: 5000, placeholder: admin ? \"Votre réponse au client…\" : \"Votre message…\", \"aria-label\": \"Message\" });\n  const send = h(\"button\", { class: \"btn primary\", type: \"submit\" }, \"Envoyer\");\n  const form = h(\"form\", { class: \"card stack\" }, ta, picker.el, err, hint, h(\"div\", { class: \"row\" }, send));\n  form.addEventListener(\"submit\", async (e) => {\n    e.preventDefault();\n    err.hidden = true;\n    if (!ta.value.trim() && !picker.count()) return showErr(err, new Error(\"Écrivez un message ou joignez un fichier\"));\n    send.disabled = true; send.textContent = picker.count() ? \"Envoi des fichiers…\" : \"Envoi…\";\n    try {\n      const attachments = await picker.uploadAll();\n      await api(`/api/tickets/${id}/messages`, { method: \"POST\", body: { body: ta.value, attachments } });\n      ta.value = \"\"; picker.clear();\n      paint(await api(\"/api/tickets/\" + id));\n      thread.lastElementChild?.scrollIntoView({ behavior: \"smooth\", block: \"end\" });\n    } catch (ex) { showErr(err, ex); }\n    send.disabled = false; send.textContent = \"Envoyer\";\n  });\n\n  mount(h(\"div\", { class: \"stack\" },\n    h(\"a\", { href: admin ? \"#/\" : \"#/\" }, \"← Retour\"),\n    h(\"div\", { class: \"row between\" }, h(\"h1\", null, d.ticket.subject), titleBadge),\n    admin && d.owner ? h(\"p\", { class: \"muted small\" }, d.owner.name + (d.owner.company ? \" · \" + d.owner.company : \"\") + \" · \" + (CATS[d.ticket.category] || \"\")) : null,\n    h(\"div\", { class: \"side\" }, h(\"div\", { class: \"stack\" }, thread, form), aside)));\n  paint(d);\n\n  // Rafraîchissement automatique toutes les 20 s (sans toucher au message en cours d'écriture)\n  pollTimer = setInterval(async () => {\n    if (document.hidden || send.disabled) return;\n    try {\n      const fresh = await api(\"/api/tickets/\" + id);\n      const s = fresh.messages.length + \":\" + fresh.history.length + \":\" + fresh.ticket.status;\n      if (s !== sig) paint(fresh);\n    } catch {}\n  }, 20000);\n}\n\n// ---------- Tableau de bord administrateur ----------\nasync function viewAdmin(opts = {}) {\n  showBar(\"/\");\n  const state = { status: \"\", waiting: false, q: \"\", user: opts.user || \"\" };\n  const statsBox = h(\"div\", { class: \"stats\" });\n  const list = h(\"div\", { class: \"list\" });\n  const chips = h(\"div\", { class: \"chips\" });\n  const search = h(\"input\", { type: \"search\", placeholder: \"Chercher : sujet, client, entreprise, e-mail…\", \"aria-label\": \"Rechercher\" });\n  let title = h(\"h1\", null, \"Demandes des clients\");\n  const load = async () => {\n    const qs = new URLSearchParams();\n    if (state.status) qs.set(\"status\", state.status);\n    if (state.waiting) qs.set(\"waiting\", \"1\");\n    if (state.q) qs.set(\"q\", state.q);\n    if (state.user) qs.set(\"user\", state.user);\n    list.replaceChildren(h(\"p\", { class: \"muted\" }, \"Chargement…\"));\n    try {\n      const { tickets } = await api(\"/api/tickets?\" + qs);\n      if (state.user && tickets[0]) title.textContent = \"Demandes de \" + tickets[0].user_name;\n      list.replaceChildren(...(tickets.length ? tickets.map((t) => ticketCard(t, true)) : [h(\"div\", { class: \"empty card\" }, \"Aucune demande ne correspond.\")]));\n    } catch (e) { list.replaceChildren(h(\"div\", { class: \"err\" }, e.message)); }\n  };\n  const drawChips = () => chips.replaceChildren(\n    ...[[\"\", \"Toutes\"], ...Object.entries(STATUS)].map(([k, l]) =>\n      h(\"button\", { class: \"chip\", \"aria-pressed\": String(!state.waiting && state.status === k), onclick: () => { state.status = k; state.waiting = false; drawChips(); load(); } }, l)),\n    h(\"button\", { class: \"chip\", \"aria-pressed\": String(state.waiting), onclick: () => { state.waiting = !state.waiting; state.status = \"\"; drawChips(); load(); } }, \"● En attente de réponse\"));\n  let tm;\n  search.addEventListener(\"input\", () => { clearTimeout(tm); tm = setTimeout(() => { state.q = search.value.trim(); load(); }, 300); });\n  mount(h(\"div\", { class: \"stack\" },\n    state.user ? h(\"a\", { href: \"#/clients\" }, \"← Tous les clients\") : null,\n    title, state.user ? null : statsBox, search, chips, list));\n  drawChips(); load();\n  if (!state.user) {\n    try {\n      const s = await api(\"/api/admin/stats\");\n      const tile = (n, label, onclick) => h(\"button\", { class: \"stat\", type: \"button\", onclick }, h(\"b\", null, n), h(\"span\", null, label));\n      statsBox.replaceChildren(\n        tile(s.waiting, \"En attente de réponse\", () => { state.waiting = true; state.status = \"\"; drawChips(); load(); }),\n        tile(s.stats.open, \"Ouvertes\", () => { state.status = \"open\"; state.waiting = false; drawChips(); load(); }),\n        tile(s.stats.in_review, \"En cours\", () => { state.status = \"in_review\"; state.waiting = false; drawChips(); load(); }),\n        tile(s.stats.resolved, \"Résolues\", () => { state.status = \"resolved\"; state.waiting = false; drawChips(); load(); }),\n        tile(s.stats.unresolved, \"Non résolues\", () => { state.status = \"unresolved\"; state.waiting = false; drawChips(); load(); }),\n        tile(s.users, \"Clients inscrits\", () => go(\"/clients\")));\n    } catch {}\n  }\n}\nfunction resetBtn(u) {\n  const box = h(\"span\", { class: \"row\" });\n  const start = h(\"button\", { class: \"btn sm\", type: \"button\" }, \"Nouveau mot de passe\");\n  start.addEventListener(\"click\", () => {\n    const yes = h(\"button\", { class: \"btn sm primary\", type: \"button\" }, \"Confirmer\");\n    const no = h(\"button\", { class: \"btn sm\", type: \"button\" }, \"Annuler\");\n    no.onclick = () => box.replaceChildren(start);\n    yes.onclick = async () => {\n      yes.disabled = true;\n      try {\n        const { password } = await api(`/api/admin/users/${u.id}/reset-password`, { method: \"POST\" });\n        const copy = h(\"button\", { class: \"btn sm\", type: \"button\" }, \"Copier\");\n        copy.onclick = async () => { try { await navigator.clipboard.writeText(password); copy.textContent = \"Copié\"; } catch { copy.textContent = \"Copie impossible\"; } };\n        box.replaceChildren(h(\"span\", { class: \"small\" }, \"Mot de passe provisoire : \", h(\"b\", { class: \"mono\" }, password)), copy,\n          h(\"span\", { class: \"muted small\" }, \"Donnez-le au client : il pourra le changer dans « Mon profil ».\"));\n      } catch (e) { toast(e.message); box.replaceChildren(start); }\n    };\n    box.replaceChildren(h(\"span\", { class: \"small\" }, \"Remplacer le mot de passe de \" + u.name + \" ?\"), yes, no);\n  });\n  box.append(start);\n  return box;\n}\nasync function viewClients() {\n  showBar(\"/clients\");\n  const body = h(\"tbody\");\n  const search = h(\"input\", { type: \"search\", placeholder: \"Chercher un client…\", \"aria-label\": \"Chercher un client\" });\n  let users = [];\n  const draw = () => {\n    const q = search.value.trim().toLowerCase();\n    const rows = users.filter((u) => !q || [u.name, u.email, u.company, u.phone].join(\" \").toLowerCase().includes(q));\n    body.replaceChildren(...rows.map((u) => h(\"tr\", null,\n      h(\"td\", null, h(\"b\", null, u.name), u.role === \"admin\" ? ` (${u.title || \"admin\"})` : \"\", h(\"br\"), h(\"span\", { class: \"muted small\" }, u.company || \"\")),\n      h(\"td\", null, u.email, h(\"br\"), h(\"span\", { class: \"muted small\" }, u.phone || \"\")),\n      h(\"td\", null, String(u.tickets), u.active ? h(\"span\", { class: \"muted small\" }, ` (${u.active} en cours)`) : \"\"),\n      h(\"td\", null, u.last_activity ? fmtDay(u.last_activity) : \"—\"),\n      h(\"td\", null, h(\"div\", { class: \"row\" }, h(\"a\", { class: \"btn sm\", href: \"#/client/\" + u.id }, \"Demandes\"), u.id !== ME.id ? resetBtn(u) : null)))));\n    if (!rows.length) body.replaceChildren(h(\"tr\", null, h(\"td\", { colspan: 5, class: \"muted\" }, \"Aucun client.\")));\n  };\n  search.addEventListener(\"input\", draw);\n  mount(h(\"div\", { class: \"stack\" }, h(\"h1\", null, \"Clients\"), search,\n    h(\"div\", { class: \"card scroll\" }, h(\"table\", { class: \"table\" },\n      h(\"thead\", null, h(\"tr\", null, [\"Client\", \"Contact\", \"Demandes\", \"Dernière activité\", \"\"].map((x) => h(\"th\", null, x)))), body))));\n  try { users = (await api(\"/api/admin/users\")).users; draw(); }\n  catch (e) { body.replaceChildren(h(\"tr\", null, h(\"td\", { colspan: 5 }, e.message))); }\n}\n\n// ---------- Mon profil ----------\nfunction viewProfile() {\n  showBar(\"/profil\");\n  const field = (label, name, type, value, extra = {}) => h(\"label\", { class: \"f\" }, label, h(\"input\", { name, type, value: value || \"\", ...extra }));\n  const section = (title, help, fields, btnLabel, onSubmit) => {\n    const err = errBox();\n    const ok = h(\"p\", { class: \"new small\", role: \"status\", hidden: true });\n    const btn = h(\"button\", { class: \"btn primary\", type: \"submit\" }, btnLabel);\n    const form = h(\"form\", { class: \"card stack\", novalidate: true }, h(\"h2\", null, title), help ? h(\"p\", { class: \"muted small\" }, help) : null, ...fields, err, ok, h(\"div\", { class: \"row\" }, btn));\n    form.addEventListener(\"submit\", async (e) => {\n      e.preventDefault(); err.hidden = true; ok.hidden = true; btn.disabled = true;\n      try { ok.textContent = await onSubmit(Object.fromEntries(new FormData(form)), form); ok.hidden = false; }\n      catch (ex) { showErr(err, ex); }\n      btn.disabled = false;\n    });\n    return form;\n  };\n  const info = section(\"Mes informations\", null, [\n    field(\"Nom complet\", \"name\", \"text\", ME.name, { autocomplete: \"name\" }),\n    field(\"Entreprise\", \"company\", \"text\", ME.company, { autocomplete: \"organization\" }),\n    field(\"Téléphone\", \"phone\", \"tel\", ME.phone, { autocomplete: \"tel\" }),\n  ], \"Enregistrer\", async (d) => { ME = (await api(\"/api/me\", { method: \"PATCH\", body: d })).user; showBar(\"/profil\"); return \"Informations enregistrées.\"; });\n  const mail = section(\"Adresse e-mail\", \"C'est l'adresse qui sert à vous connecter. Pour la changer, confirmez avec votre mot de passe actuel.\", [\n    field(\"Nouvelle adresse e-mail\", \"email\", \"email\", ME.email, { autocomplete: \"email\" }),\n    field(\"Mot de passe actuel\", \"password\", \"password\", \"\", { autocomplete: \"current-password\" }),\n  ], \"Changer l'e-mail\", async (d, f) => { ME = (await api(\"/api/me/email\", { method: \"POST\", body: d })).user; f.password.value = \"\"; return \"E-mail modifié. Utilisez-le à votre prochaine connexion.\"; });\n  const pass = section(\"Mot de passe\", \"Vos autres appareils seront déconnectés.\", [\n    field(\"Mot de passe actuel\", \"current\", \"password\", \"\", { autocomplete: \"current-password\" }),\n    field(\"Nouveau mot de passe (8 caractères minimum)\", \"next\", \"password\", \"\", { autocomplete: \"new-password\", minlength: 8 }),\n    field(\"Confirmez le nouveau mot de passe\", \"confirm\", \"password\", \"\", { autocomplete: \"new-password\" }),\n  ], \"Changer le mot de passe\", async (d, f) => {\n    if (d.next !== d.confirm) throw new Error(\"Les deux nouveaux mots de passe ne sont pas identiques\");\n    await api(\"/api/me/password\", { method: \"POST\", body: { current: d.current, next: d.next } });\n    f.reset(); return \"Mot de passe modifié.\";\n  });\n  mount(h(\"div\", { class: \"stack\" }, h(\"h1\", null, \"Mon profil\"), info, mail, pass,\n    !ME || ME.role !== \"admin\" ? h(\"p\", { class: \"muted small\" }, \"Mot de passe oublié ? Contactez Magiscom Tech : l'équipe peut vous attribuer un mot de passe provisoire.\") : null));\n}\n\n// ---------- Routeur ----------\nasync function router() {\n  clearInterval(pollTimer); pollTimer = null;\n  const path = location.hash.slice(1) || \"/\";\n  if (!ME) {\n    try {\n      const r = await fetch(\"/api/me\", { credentials: \"same-origin\" });\n      if (r.ok) ME = (await r.json()).user;\n    } catch {}\n  }\n  if (!ME) return viewAuth(path === \"/register\" ? \"register\" : \"login\");\n  const admin = ME.role === \"admin\";\n  let m;\n  if (path === \"/new\" && !admin) return viewNew();\n  if (path === \"/profil\") return viewProfile();\n  if ((m = path.match(/^\\/t\\/([0-9a-f-]{36})$/))) return viewTicket(m[1]);\n  if (admin && path === \"/clients\") return viewClients();\n  if (admin && (m = path.match(/^\\/client\\/([0-9a-f-]{36})$/))) return viewAdmin({ user: m[1] });\n  if (path !== \"/\") { history.replaceState(null, \"\", \"#/\"); }\n  return admin ? viewAdmin() : viewMyTickets();\n}\n$(\"#logout\").addEventListener(\"click\", async () => {\n  try { await api(\"/api/auth/logout\", { method: \"POST\" }); } catch {}\n  ME = null; go(\"/login\");\n});\nwindow.addEventListener(\"hashchange\", router);\nrouter();\n"},"/app.css":{"type":"text/css; charset=utf-8","body":":root{--bg:#f3f5fa;--card:#fff;--fg:#0e1a33;--mut:#5a6784;--line:#dde3f0;--brand:#0b4fd6;--brand-2:#0a2a6b;--on-brand:#fff;--soft:#e9eefb;--mine:#e6eeff;--theirs:#fff;\n--s-open:#0b4fd6;--s-open-bg:#e6eeff;--s-review:#8a5a00;--s-review-bg:#fff3d6;--s-ok:#0f7a4f;--s-ok-bg:#e2f4ec;--s-bad:#b3261e;--s-bad-bg:#fbe9e7;\n--shadow:0 1px 2px rgba(14,26,51,.06),0 8px 24px rgba(14,26,51,.06);color-scheme:light}\n@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#141b33;--fg:#e8edf9;--mut:#9aa7c7;--line:#26325a;--brand:#7aa6ff;--brand-2:#9dbcff;--on-brand:#0a1330;--soft:#1d2750;--mine:#1b2a57;--theirs:#141b33;\n--s-open:#9dbcff;--s-open-bg:#1b2a57;--s-review:#f0c470;--s-review-bg:#33290f;--s-ok:#5fd3a6;--s-ok-bg:#10332a;--s-bad:#ff9a8f;--s-bad-bg:#3a1614;\n--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.3);color-scheme:dark}}\n*{box-sizing:border-box}\n[hidden]{display:none!important}\nhtml{-webkit-text-size-adjust:100%}\nbody{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,\"Segoe UI\",Roboto,\"Helvetica Neue\",Arial,sans-serif;padding-bottom:env(safe-area-inset-bottom,0px)}\na{color:var(--brand)}\nh1,h2,h3{line-height:1.25;margin:0;text-wrap:balance}\nh1{font-size:1.45rem}h2{font-size:1.15rem}h3{font-size:1rem}\n.wrap{max-width:980px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 60px max(16px,env(safe-area-inset-left,0px))}\n.muted{color:var(--mut)}.center{text-align:center}.small{font-size:.82rem}\n.bar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:linear-gradient(135deg,#0a1f4d,#0b4fd6);color:#fff;padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));padding-top:calc(10px + env(safe-area-inset-top,0px))}\n.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;margin-right:auto}\n.brand b{display:block;font-size:1.05rem;line-height:1.1}.brand small{font-size:.7rem;opacity:.85;letter-spacing:.05em;text-transform:uppercase}\n.logo{width:34px;height:34px;border-radius:10px;background:#fff;color:#0a2a6b;display:grid;place-items:center;font-weight:800}\n.nav{display:flex;gap:4px}\n.nav a{color:#fff;text-decoration:none;padding:6px 10px;border-radius:8px;font-weight:600;font-size:.88rem;opacity:.85}\n.nav a.on{background:rgba(255,255,255,.18);opacity:1}\n.who{display:flex;align-items:center;gap:10px;font-size:.85rem}\n.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:12px;padding:10px 16px;font:600 .92rem inherit;font-family:inherit;cursor:pointer;text-decoration:none;min-height:44px}\n.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}\n.btn.ghost{background:transparent;border-color:rgba(255,255,255,.35);color:inherit}\n.btn.sm{min-height:34px;padding:6px 12px;font-size:.82rem}\n.btn:disabled{opacity:.55;cursor:default}\n.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:16px}\n.stack{display:flex;flex-direction:column;gap:12px}\n.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}\n.between{justify-content:space-between}\nlabel.f{display:flex;flex-direction:column;gap:5px;font-size:.85rem;color:var(--mut);font-weight:600}\ninput,select,textarea{width:100%;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:12px;padding:11px 13px;font:inherit;font-size:16px}\ntextarea{min-height:110px;resize:vertical}\n.err{background:var(--s-bad-bg);color:var(--s-bad);border-radius:10px;padding:10px 12px;font-size:.88rem}\n.auth{max-width:420px;margin:6vh auto 0}\n.auth .logo{width:52px;height:52px;font-size:1.5rem;background:var(--brand);color:var(--on-brand);margin:0 auto 12px}\n.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--soft);border-radius:12px;padding:4px}\n.tabs button{border:0;background:transparent;color:var(--mut);padding:9px;border-radius:9px;font:600 .9rem inherit;font-family:inherit;cursor:pointer}\n.tabs button[aria-pressed=\"true\"]{background:var(--card);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12)}\n.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:.76rem;font-weight:700;white-space:nowrap}\n.badge::before{content:\"\";width:7px;height:7px;border-radius:50%;background:currentColor}\n.st-open{color:var(--s-open);background:var(--s-open-bg)}.st-in_review{color:var(--s-review);background:var(--s-review-bg)}\n.st-resolved{color:var(--s-ok);background:var(--s-ok-bg)}.st-unresolved{color:var(--s-bad);background:var(--s-bad-bg)}\n.chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}\n.chip{flex:none;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:7px 13px;font:500 .84rem inherit;font-family:inherit;cursor:pointer;white-space:nowrap}\n.chip[aria-pressed=\"true\"]{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}\n.list{display:flex;flex-direction:column;gap:10px}\n.tk{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 14px;box-shadow:var(--shadow)}\n.tk:hover{border-color:var(--brand)}\n.tk h3{overflow-wrap:anywhere}\n.tk .meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:var(--mut);font-size:.8rem}\n.dot{width:9px;height:9px;border-radius:50%;background:var(--s-bad);display:inline-block}\n.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}\n.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:var(--shadow);cursor:pointer;text-align:left;font:inherit;color:inherit}\n.stat b{font-size:1.5rem;display:block;line-height:1.1}.stat span{color:var(--mut);font-size:.8rem}\n.thread{display:flex;flex-direction:column;gap:12px}\n.msg{max-width:min(620px,92%);border:1px solid var(--line);border-radius:16px;padding:10px 13px;background:var(--theirs);display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow)}\n.msg.mine{align-self:flex-end;background:var(--mine)}\n.msg .who{font-size:.76rem;color:var(--mut);display:block;gap:0}\n.msg .body{white-space:pre-wrap;overflow-wrap:anywhere}\n.media{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}\n.media img,.media video{width:100%;max-height:320px;object-fit:cover;border-radius:10px;background:#000;display:block}\n.media video{object-fit:contain}\n.media a{display:block}\n.sys{align-self:center;font-size:.78rem;color:var(--mut);background:var(--soft);border-radius:999px;padding:4px 12px;text-align:center}\n.composer{position:sticky;bottom:0;background:var(--bg);padding-top:10px}\n.picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}\n.pv{position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:1}\n.pv img,.pv video{width:100%;height:100%;object-fit:cover;display:block}\n.pv button{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:16px;cursor:pointer;line-height:1}\n.pv .prog{position:absolute;left:0;bottom:0;height:5px;background:#2fbf71;width:0;transition:width .2s}\n.pv .tag{position:absolute;left:4px;bottom:8px;background:rgba(0,0,0,.65);color:#fff;font-size:.68rem;border-radius:6px;padding:1px 6px}\n.filebtn{position:relative;overflow:hidden}\n.filebtn input{position:absolute;inset:0;opacity:0;cursor:pointer}\n.side{display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start}\n.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.86rem}\n.kv span:nth-child(odd){color:var(--mut)}\n.kv span{overflow-wrap:anywhere}\n.table{width:100%;border-collapse:collapse;font-size:.88rem}\n.table th,.table td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}\n.table th{color:var(--mut);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em}\n.scroll{overflow-x:auto}\n.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));background:var(--fg);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:50;max-width:calc(100% - 32px)}\n.empty{text-align:center;color:var(--mut);padding:36px 12px}\n@media (max-width:760px){.side{grid-template-columns:1fr}.side>aside{order:-1}.who span{display:none}.nav{order:3;width:100%}}\n.new{color:var(--brand)}\n.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;user-select:all}\n"},"/icon.svg":{"type":"image/svg+xml","body":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" rx=\"16\" fill=\"#0b4fd6\"/><text x=\"32\" y=\"44\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"34\" font-weight=\"700\" text-anchor=\"middle\" fill=\"#fff\">M</text></svg>\n"}};

const SESSION_DAYS = 30;
const PBKDF2_ITER = 100000;               // maximum accepté par Workers
const MB = 1024 * 1024;
const MAX_IMAGE = 15 * MB;
const MAX_VIDEO = 95 * MB;                // limite de corps de requête Workers : 100 Mo (Free/Pro)
const MAX_FILES = 6;                      // fichiers par message
const MAX_PENDING = 30;                   // fichiers envoyés mais pas encore joints
const PENDING_TTL = 24 * 3600 * 1000;
const MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
};
const STATUSES = ["open", "in_review", "resolved", "unresolved"];
const CATEGORIES = ["ebp", "sage", "installation", "formation", "facturation", "autre"];

export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Erreur serveur" }, 500);
    }
  },
  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(cleanupPending(env));
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ---------- Routage ----------
async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname, m = req.method;
  if (!p.startsWith("/api/")) return asset(p);

  // Protection CSRF : toute écriture doit venir de notre propre script
  if (m !== "GET" && m !== "HEAD" && req.headers.get("X-Requested-With") !== "magisdesk")
    return json({ error: "Requête refusée" }, 403);

  if (p === "/api/auth/register" && m === "POST") return register(req, env);
  if (p === "/api/auth/login" && m === "POST") return login(req, env);
  if (p === "/api/auth/logout" && m === "POST") return logout(req, env);

  const me = await currentUser(req, env);
  if (!me) return json({ error: "Non connecté" }, 401);

  if (p === "/api/me" && m === "GET") return json({ user: pub(me) });
  if (p === "/api/me" && m === "PATCH") return updateProfile(req, env, me);
  if (p === "/api/me/email" && m === "POST") return changeEmail(req, env, me);
  if (p === "/api/me/password" && m === "POST") return changePassword(req, env, me);
  if (p === "/api/uploads" && m === "PUT") return upload(req, env, me);
  if (p === "/api/tickets" && m === "GET") return listTickets(url, env, me);
  if (p === "/api/tickets" && m === "POST") return createTicket(req, env, me);

  let r;
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})$/)) && m === "GET") return getTicket(r[1], env, me);
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/messages$/)) && m === "POST") return addMessage(r[1], req, env, me);
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/status$/)) && m === "PATCH") return setStatus(r[1], req, env, me);
  if ((r = p.match(/^\/api\/media\/([0-9a-f-]{36})$/)) && (m === "GET" || m === "HEAD")) return media(r[1], req, url, env, me);

  if (p.startsWith("/api/admin/")) {
    if (me.role !== "admin") return json({ error: "Accès réservé à l'administrateur" }, 403);
    if (p === "/api/admin/users" && m === "GET") return adminUsers(env);
    if (p === "/api/admin/stats" && m === "GET") return adminStats(env);
    const rr = p.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/reset-password$/);
    if (rr && m === "POST") return adminResetPassword(rr[1], env, me);
  }
  return json({ error: "Introuvable" }, 404);
}

// ---------- Réponses ----------
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}
const SEC_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};
function asset(p) {
  const a = ASSETS[p] || ASSETS["/"];               // application monopage
  return new Response(a.body, { headers: { "Content-Type": a.type, "Cache-Control": "no-cache", ...SEC_HEADERS } });
}

// ---------- Outils ----------
const enc = new TextEncoder();
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const toB64 = (buf) => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: toB64(bits), salt: toB64(salt) };
}
async function readJson(req, max = 20000) {
  const text = await req.text();
  if (text.length > max) fail(413, "Données trop volumineuses");
  try { return JSON.parse(text || "{}"); } catch { fail(400, "Données invalides"); }
}
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, company: u.company, phone: u.phone, role: u.role, title: u.title || null, created_at: u.created_at });
function cookie(token, maxAge) {
  return `md_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(req, name) {
  const c = req.headers.get("Cookie") || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ---------- Comptes ----------
async function createSession(env, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)")
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400000, now()).run();
  return cookie(token, SESSION_DAYS * 86400);
}
async function currentUser(req, env) {
  const token = readCookie(req, "md_session");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(await sha256(token), now()).first();
}
async function register(req, env) {
  const b = await readJson(req);
  const email = str(b.email, 160).toLowerCase();
  const name = str(b.name, 80), company = str(b.company, 120), phone = str(b.phone, 30);
  const password = typeof b.password === "string" ? b.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Adresse e-mail invalide");
  if (name.length < 2) fail(400, "Indiquez votre nom");
  if (password.length < 8 || password.length > 200) fail(400, "Le mot de passe doit faire au moins 8 caractères");
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) fail(409, "Un compte existe déjà avec cet e-mail");
  const { hash, salt } = await hashPassword(password);
  const id = uid();
  await env.DB.prepare("INSERT INTO users (id,email,name,company,phone,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,?,?,'user',?)")
    .bind(id, email, name, company || null, phone || null, hash, salt, now()).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return json({ user: pub(user) }, 201, { "Set-Cookie": await createSession(env, id) });
}
async function tooMany(env, key, limit) {
  const r = await env.DB.prepare("SELECT count, window_end FROM login_attempts WHERE key = ?").bind(key).first();
  return r && r.window_end > now() && r.count >= limit;
}
async function noteFailure(env, key) {
  await env.DB.prepare(`INSERT INTO login_attempts (key, count, window_end) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_end > ? THEN count + 1 ELSE 1 END,
      window_end = CASE WHEN window_end > ? THEN window_end ELSE ? END`)
    .bind(key, now() + 900000, now(), now(), now() + 900000).run();
}
async function login(req, env) {
  const b = await readJson(req);
  const email = str(b.email, 160).toLowerCase();
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const kEmail = "e:" + email, kIp = "i:" + ip;
  // 10 essais par compte, 30 par adresse IP (un bureau partage souvent la même IP)
  if ((await tooMany(env, kEmail, 10)) || (await tooMany(env, kIp, 30)))
    fail(429, "Trop de tentatives. Réessayez dans 15 minutes.");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const { hash } = await hashPassword(password, user ? user.password_salt : toB64(new Uint8Array(16)));
  if (!user || !safeEqual(hash, user.password_hash)) {
    await noteFailure(env, kEmail);
    await noteFailure(env, kIp);
    fail(401, "E-mail ou mot de passe incorrect");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(kEmail).run();
  return json({ user: pub(user) }, 200, { "Set-Cookie": await createSession(env, user.id) });
}
async function logout(req, env) {
  const token = readCookie(req, "md_session");
  if (token && /^[0-9a-f]{64}$/.test(token))
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
}

// ---------- Profil ----------
async function checkPassword(user, password) {
  if (typeof password !== "string" || !password) return false;
  const { hash } = await hashPassword(password.slice(0, 200), user.password_salt);
  return safeEqual(hash, user.password_hash);
}
async function updateProfile(req, env, me) {
  const b = await readJson(req);
  const name = str(b.name, 80), company = str(b.company, 120), phone = str(b.phone, 30);
  if (name.length < 2) fail(400, "Indiquez votre nom");
  await env.DB.prepare("UPDATE users SET name = ?, company = ?, phone = ? WHERE id = ?").bind(name, company || null, phone || null, me.id).run();
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
  return json({ user: pub(u) });
}
async function changeEmail(req, env, me) {
  const b = await readJson(req);
  const email = str(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Adresse e-mail invalide");
  if (!(await checkPassword(me, b.password))) fail(403, "Mot de passe actuel incorrect");
  if (email === me.email.toLowerCase()) return json({ user: pub(me) });
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND id <> ?").bind(email, me.id).first();
  if (exists) fail(409, "Un compte existe déjà avec cet e-mail");
  await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email, me.id).run();
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
  return json({ user: pub(u) });
}
async function changePassword(req, env, me) {
  const b = await readJson(req);
  const next = typeof b.next === "string" ? b.next : "";
  if (!(await checkPassword(me, b.current))) fail(403, "Mot de passe actuel incorrect");
  if (next.length < 8 || next.length > 200) fail(400, "Le nouveau mot de passe doit faire au moins 8 caractères");
  const { hash, salt } = await hashPassword(next);
  const token = readCookie(req, "md_session");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, me.id),
    // Déconnecte les autres appareils, garde la session actuelle
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").bind(me.id, await sha256(token || "")),
  ]);
  return json({ ok: true });
}
async function adminResetPassword(userId, env, me) {
  const u = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userId).first();
  if (!u) fail(404, "Client introuvable");
  if (u.id === me.id) fail(400, "Changez votre propre mot de passe depuis « Mon profil »");
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const temp = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => alphabet[x % alphabet.length]).join("");
  const { hash, salt } = await hashPassword(temp);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
  ]);
  return json({ password: temp });
}

// ---------- Fichiers (photos et vidéos) ----------
async function upload(req, env, me) {
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = MIME[type];
  if (!ext) fail(415, "Format non accepté. Photos : JPG, PNG, WEBP, GIF, HEIC. Vidéos : MP4, MOV, WEBM, 3GP.");
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size || !req.body) fail(411, "Fichier vide");
  const max = type.startsWith("video/") ? MAX_VIDEO : MAX_IMAGE;
  if (size > max) fail(413, `Fichier trop lourd (maximum ${max / MB} Mo)`);
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM attachments WHERE owner_id = ? AND message_id IS NULL").bind(me.id).first();
  if (pending.n >= MAX_PENDING) fail(429, "Trop de fichiers en attente. Envoyez d'abord votre message.");
  let name = "fichier." + ext;
  try { name = decodeURIComponent(req.headers.get("X-File-Name") || name); } catch {}
  name = name.replace(/[\u0000-\u001f\\/]/g, "").slice(0, 120) || "fichier." + ext;

  const id = uid();
  const key = `u/${me.id}/${id}.${ext}`;
  const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: type } });
  if (!obj || obj.size !== size) { await env.MEDIA.delete(key); fail(400, "Envoi interrompu, réessayez"); }
  await env.DB.prepare("INSERT INTO attachments (id,message_id,ticket_id,owner_id,r2_key,mime,size,original_name,created_at) VALUES (?,NULL,NULL,?,?,?,?,?,?)")
    .bind(id, me.id, key, type, size, name, now()).run();
  return json({ attachment: { id, mime: type, size, name } }, 201);
}
async function claimStatements(env, me, ids, ticketId, messageId) {
  if (!Array.isArray(ids)) ids = [];
  ids = [...new Set(ids.filter((x) => typeof x === "string"))];
  if (ids.length > MAX_FILES) fail(400, `Maximum ${MAX_FILES} fichiers par message`);
  const stmts = [];
  for (const id of ids) {
    const a = await env.DB.prepare("SELECT id FROM attachments WHERE id = ? AND owner_id = ? AND message_id IS NULL").bind(id, me.id).first();
    if (!a) fail(400, "Un fichier joint est introuvable, renvoyez-le");
    stmts.push(env.DB.prepare("UPDATE attachments SET message_id = ?, ticket_id = ? WHERE id = ? AND owner_id = ? AND message_id IS NULL").bind(messageId, ticketId, id, me.id));
  }
  return stmts;
}
async function media(id, req, url, env, me) {
  const a = await env.DB.prepare("SELECT a.*, t.user_id AS ticket_owner FROM attachments a LEFT JOIN tickets t ON t.id = a.ticket_id WHERE a.id = ?").bind(id).first();
  // Même réponse « introuvable » si le fichier existe mais n'appartient pas à l'utilisateur
  if (!a || !(me.role === "admin" || a.owner_id === me.id || a.ticket_owner === me.id)) return json({ error: "Introuvable" }, 404);
  const size = a.size;
  let range = null;
  const rh = req.headers.get("Range");
  const mm = rh && rh.match(/^bytes=(\d*)-(\d*)$/);
  if (mm && (mm[1] || mm[2])) {
    let s, e;
    if (mm[1] === "") { s = Math.max(0, size - Number(mm[2])); e = size - 1; }
    else { s = Number(mm[1]); e = mm[2] === "" ? size - 1 : Math.min(Number(mm[2]), size - 1); }
    if (s > e || s >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    range = { offset: s, length: e - s + 1 };
  }
  const obj = await env.MEDIA.get(a.r2_key, range ? { range } : undefined);
  if (!obj) return json({ error: "Fichier manquant" }, 404);
  const h = new Headers({
    "Content-Type": a.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
  });
  const body = req.method === "HEAD" ? null : obj.body;
  if (range) {
    h.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
    h.set("Content-Length", String(range.length));
    return new Response(body, { status: 206, headers: h });
  }
  h.set("Content-Length", String(size));
  return new Response(body, { status: 200, headers: h });
}
async function cleanupPending(env) {
  const { results } = await env.DB.prepare("SELECT id, r2_key FROM attachments WHERE message_id IS NULL AND created_at < ? LIMIT 500")
    .bind(now() - PENDING_TTL).all();
  if (!results.length) return;
  await env.MEDIA.delete(results.map((r) => r.r2_key));
  await env.DB.batch(results.map((r) => env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(r.id)));
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()).run();
}

// ---------- Demandes (tickets) ----------
async function loadTicket(env, id, me) {
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first();
  // Un client ne voit jamais la demande d'un autre client : même réponse que si elle n'existait pas
  if (!t || (me.role !== "admin" && t.user_id !== me.id)) fail(404, "Demande introuvable");
  return t;
}
async function listTickets(url, env, me) {
  const where = [], args = [];
  if (me.role !== "admin") { where.push("t.user_id = ?"); args.push(me.id); }
  else {
    const status = url.searchParams.get("status");
    if (STATUSES.includes(status)) { where.push("t.status = ?"); args.push(status); }
    if (url.searchParams.get("waiting") === "1") where.push("t.last_sender = 'user' AND t.status IN ('open','in_review')");
    const user = url.searchParams.get("user");
    if (user) { where.push("t.user_id = ?"); args.push(user); }
    const q = str(url.searchParams.get("q") || "", 80);
    if (q) { where.push("(t.subject LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.company LIKE ?)"); const l = `%${q}%`; args.push(l, l, l, l); }
  }
  const sql = `SELECT t.*, u.name AS user_name, u.company AS user_company, u.email AS user_email,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count,
      (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count
    FROM tickets t JOIN users u ON u.id = t.user_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY t.updated_at DESC LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ tickets: results });
}
async function createTicket(req, env, me) {
  const b = await readJson(req);
  const subject = str(b.subject, 150), body = str(b.body, 5000);
  const category = CATEGORIES.includes(b.category) ? b.category : "autre";
  if (subject.length < 3) fail(400, "Donnez un titre à votre demande");
  const ids = Array.isArray(b.attachments) ? b.attachments : [];
  if (!body && !ids.length) fail(400, "Décrivez le problème ou joignez une photo ou une vidéo");
  const tid = uid(), mid = uid(), t = now();
  const claims = await claimStatements(env, me, ids, tid, mid);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tickets (id,user_id,subject,category,status,created_at,updated_at,last_sender) VALUES (?,?,?,?, 'open', ?,?, ?)")
      .bind(tid, me.id, subject, category, t, t, me.role === "admin" ? "admin" : "user"),
    env.DB.prepare("INSERT INTO messages (id,ticket_id,sender_id,body,created_at) VALUES (?,?,?,?,?)").bind(mid, tid, me.id, body, t),
    ...claims,
    env.DB.prepare("INSERT INTO status_history (id,ticket_id,old_status,new_status,changed_by,created_at) VALUES (?,?,NULL,'open',?,?)").bind(uid(), tid, me.id, t),
  ]);
  return json({ ticket: { id: tid } }, 201);
}
async function getTicket(id, env, me) {
  const t = await loadTicket(env, id, me);
  const owner = await env.DB.prepare("SELECT id,name,email,company,phone,created_at FROM users WHERE id = ?").bind(t.user_id).first();
  const { results: msgs } = await env.DB.prepare(
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name, u.role AS sender_role, u.title AS sender_title
     FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.created_at, m.rowid`).bind(id).all();
  const { results: atts } = await env.DB.prepare(
    "SELECT id, message_id, mime, size, original_name AS name FROM attachments WHERE ticket_id = ? ORDER BY created_at").bind(id).all();
  const { results: hist } = await env.DB.prepare(
    `SELECT h.old_status, h.new_status, h.created_at, u.name AS by_name, u.role AS by_role, u.title AS by_title
     FROM status_history h JOIN users u ON u.id = h.changed_by WHERE h.ticket_id = ? ORDER BY h.created_at, h.rowid`).bind(id).all();
  const byMsg = {};
  for (const a of atts) (byMsg[a.message_id] ||= []).push(a);
  for (const m of msgs) m.attachments = byMsg[m.id] || [];
  return json({ ticket: t, owner: me.role === "admin" || owner.id === me.id ? owner : null, messages: msgs, history: hist });
}
async function addMessage(id, req, env, me) {
  const t = await loadTicket(env, id, me);
  const b = await readJson(req);
  const body = str(b.body, 5000);
  const ids = Array.isArray(b.attachments) ? b.attachments : [];
  if (!body && !ids.length) fail(400, "Message vide");
  const mid = uid(), ts = now();
  const claims = await claimStatements(env, me, ids, id, mid);
  const sender = me.role === "admin" ? "admin" : "user";
  const stmts = [
    env.DB.prepare("INSERT INTO messages (id,ticket_id,sender_id,body,created_at) VALUES (?,?,?,?,?)").bind(mid, id, me.id, body, ts),
    ...claims,
  ];
  // Si le client relance une demande close, elle redevient « ouverte »
  if (sender === "user" && (t.status === "resolved" || t.status === "unresolved")) {
    stmts.push(env.DB.prepare("UPDATE tickets SET status='open', updated_at=?, last_sender='user' WHERE id=?").bind(ts, id));
    stmts.push(env.DB.prepare("INSERT INTO status_history (id,ticket_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,'open',?,?)").bind(uid(), id, t.status, me.id, ts));
  } else {
    stmts.push(env.DB.prepare("UPDATE tickets SET updated_at=?, last_sender=? WHERE id=?").bind(ts, sender, id));
  }
  await env.DB.batch(stmts);
  return json({ message: { id: mid } }, 201);
}
async function setStatus(id, req, env, me) {
  if (me.role !== "admin") fail(403, "Seul l'administrateur peut changer le statut");
  const t = await loadTicket(env, id, me);
  const b = await readJson(req);
  if (!STATUSES.includes(b.status)) fail(400, "Statut invalide");
  if (b.status === t.status) return json({ ok: true });
  const ts = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE tickets SET status=?, updated_at=? WHERE id=?").bind(b.status, ts, id),
    env.DB.prepare("INSERT INTO status_history (id,ticket_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,?,?,?)").bind(uid(), id, t.status, b.status, me.id, ts),
  ]);
  return json({ ok: true });
}

// ---------- Administration ----------
async function adminUsers(env) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.company, u.phone, u.role, u.title, u.created_at,
       COUNT(t.id) AS tickets,
       COALESCE(SUM(CASE WHEN t.status IN ('open','in_review') THEN 1 ELSE 0 END),0) AS active,
       MAX(t.updated_at) AS last_activity
     FROM users u LEFT JOIN tickets t ON t.user_id = u.id
     GROUP BY u.id ORDER BY COALESCE(MAX(t.updated_at), u.created_at) DESC LIMIT 500`).all();
  return json({ users: results });
}
async function adminStats(env) {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM tickets GROUP BY status").all();
  const stats = { open: 0, in_review: 0, resolved: 0, unresolved: 0 };
  for (const r of results) stats[r.status] = r.n;
  const w = await env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE last_sender='user' AND status IN ('open','in_review')").first();
  const u = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='user'").first();
  return json({ stats, waiting: w.n, users: u.n });
}
