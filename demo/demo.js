// Mode démo : remplace le serveur par une version en mémoire dans le navigateur.
(function () {
  const db = { users: [], sessions: {}, tickets: [], messages: [], atts: [], hist: [] };
  const blobs = new Map(), urls = new Map();
  let me = null;
  const uid = () => crypto.randomUUID();
  let clock = Date.now() - 3 * 86400000;
  const now = () => (clock = Math.max(clock + 1, Date.now()));
  const err = (status, message) => Object.assign(new Error(message), { status });
  const pub = (u) => ({ id: u.id, email: u.email, name: u.name, company: u.company, phone: u.phone, role: u.role, created_at: u.created_at });
  const STATUSES = ["open", "in_review", "resolved", "unresolved"];

  function addUser(email, name, company, phone, role, pw, t) {
    const u = { id: uid(), email, name, company: company || null, phone: phone || null, role, pw, created_at: t };
    db.users.push(u); return u;
  }
  function addTicket(u, subject, category, body, t) {
    const tk = { id: uid(), user_id: u.id, subject, category, status: "open", created_at: t, updated_at: t, last_sender: u.role === "admin" ? "admin" : "user" };
    db.tickets.push(tk);
    const m = { id: uid(), ticket_id: tk.id, sender_id: u.id, body, created_at: t };
    db.messages.push(m);
    db.hist.push({ ticket_id: tk.id, old_status: null, new_status: "open", changed_by: u.id, created_at: t });
    return { tk, m };
  }
  function setSt(tk, st, by, t) { db.hist.push({ ticket_id: tk.id, old_status: tk.status, new_status: st, changed_by: by.id, created_at: t }); tk.status = st; tk.updated_at = t; }
  function reply(tk, u, body, t) { db.messages.push({ id: uid(), ticket_id: tk.id, sender_id: u.id, body, created_at: t }); tk.updated_at = t; tk.last_sender = u.role === "admin" ? "admin" : "user"; return t; }

  // Données d'exemple
  const d0 = Date.now() - 3 * 86400000, H = 3600000;
  const adm = addUser("admin@demo.ma", "Support Magiscom", null, null, "admin", "demo1234", d0);
  const amina = addUser("client@demo.ma", "Amina Benali", "Atlas Distribution SARL", "0661 00 00 00", "user", "demo1234", d0);
  const karim = addUser("karim@demo.ma", "Karim Alaoui", "Oasis Matériaux", "0522 00 00 00", "user", "demo1234", d0 + H);
  let x = addTicket(amina, "Impossible d'imprimer les factures dans EBP", "ebp", "Depuis ce matin, l'impression des factures affiche « imprimante introuvable ».", d0 + 2 * H);
  reply(x.tk, adm, "Bonjour Amina, vérifiez que l'imprimante par défaut est bien choisie dans Paramètres > Impression. Je passe le dossier en cours.", d0 + 3 * H);
  setSt(x.tk, "in_review", adm, d0 + 3 * H + 1);
  x = addTicket(amina, "Formation pour une nouvelle comptable", "formation", "Nous avons recruté une comptable, pouvez-vous la former sur EBP Compta ?", d0 + 26 * H);
  reply(x.tk, adm, "Avec plaisir : nous vous proposons deux sessions de 2 h la semaine prochaine.", d0 + 27 * H);
  setSt(x.tk, "resolved", adm, d0 + 28 * H);
  addTicket(karim, "Erreur de TVA sur un devis Sage", "sage", "Le taux de 10 % ne s'applique pas sur certaines lignes du devis.", d0 + 50 * H);

  const own = (tk) => me.role === "admin" || tk.user_id === me.id;
  const user = (id) => db.users.find((u) => u.id === id);
  function claim(ids, tid, mid) {
    ids = [...new Set(Array.isArray(ids) ? ids : [])];
    if (ids.length > 6) throw err(400, "Maximum 6 fichiers par message");
    const list = ids.map((id) => db.atts.find((a) => a.id === id && a.owner_id === me.id && !a.message_id));
    if (list.some((a) => !a)) throw err(400, "Un fichier joint est introuvable, renvoyez-le");
    for (const a of list) { a.message_id = mid; a.ticket_id = tid; }
  }
  const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

  function handle(url, method, b) {
    const p = url.pathname;
    if (p === "/api/auth/register" && method === "POST") {
      const email = s(b.email, 160).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, "Adresse e-mail invalide");
      if (s(b.name, 80).length < 2) throw err(400, "Indiquez votre nom");
      if ((b.password || "").length < 8) throw err(400, "Le mot de passe doit faire au moins 8 caractères");
      if (db.users.some((u) => u.email === email)) throw err(409, "Un compte existe déjà avec cet e-mail");
      me = addUser(email, s(b.name, 80), s(b.company, 120), s(b.phone, 30), "user", b.password, now());
      return [201, { user: pub(me) }];
    }
    if (p === "/api/auth/login" && method === "POST") {
      const u = db.users.find((u) => u.email === s(b.email, 160).toLowerCase());
      if (!u || u.pw !== b.password) throw err(401, "E-mail ou mot de passe incorrect");
      me = u; return [200, { user: pub(u) }];
    }
    if (p === "/api/auth/logout") { me = null; return [200, { ok: true }]; }
    if (!me) throw err(401, "Non connecté");
    if (p === "/api/me") return [200, { user: pub(me) }];
    if (p === "/api/tickets" && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase(), st = url.searchParams.get("status"), w = url.searchParams.get("waiting"), fu = url.searchParams.get("user");
      const out = db.tickets.filter((t) => {
        if (me.role !== "admin") return t.user_id === me.id;
        const u = user(t.user_id);
        return (!st || t.status === st) && (!w || (t.last_sender === "user" && ["open", "in_review"].includes(t.status))) && (!fu || t.user_id === fu)
          && (!q || [t.subject, u.name, u.email, u.company].join(" ").toLowerCase().includes(q));
      }).sort((a, b) => b.updated_at - a.updated_at).map((t) => {
        const u = user(t.user_id);
        return { ...t, user_name: u.name, user_company: u.company, user_email: u.email, message_count: db.messages.filter((m) => m.ticket_id === t.id).length, attachment_count: db.atts.filter((a) => a.ticket_id === t.id).length };
      });
      return [200, { tickets: out }];
    }
    if (p === "/api/tickets" && method === "POST") {
      const subject = s(b.subject, 150), body = s(b.body, 5000);
      if (subject.length < 3) throw err(400, "Donnez un titre à votre demande");
      if (!body && !(b.attachments || []).length) throw err(400, "Décrivez le problème ou joignez une photo ou une vidéo");
      const { tk, m } = addTicket(me, subject, b.category || "autre", body, now());
      claim(b.attachments, tk.id, m.id);
      return [201, { ticket: { id: tk.id } }];
    }
    let r;
    if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})(\/messages|\/status)?$/))) {
      const tk = db.tickets.find((t) => t.id === r[1]);
      if (!tk || !own(tk)) throw err(404, "Demande introuvable");
      if (!r[2]) {
        const o = user(tk.user_id);
        const msgs = db.messages.filter((m) => m.ticket_id === tk.id).map((m) => {
          const u = user(m.sender_id);
          return { ...m, sender_name: u.name, sender_role: u.role, attachments: db.atts.filter((a) => a.message_id === m.id).map((a) => ({ id: a.id, message_id: a.message_id, mime: a.mime, size: a.size, name: a.name })) };
        });
        const hist = db.hist.filter((h) => h.ticket_id === tk.id).map((h) => ({ ...h, by_name: user(h.changed_by).name, by_role: user(h.changed_by).role }));
        return [200, { ticket: { ...tk }, owner: { id: o.id, name: o.name, email: o.email, company: o.company, phone: o.phone, created_at: o.created_at }, messages: msgs, history: hist }];
      }
      if (r[2] === "/messages") {
        const body = s(b.body, 5000);
        if (!body && !(b.attachments || []).length) throw err(400, "Message vide");
        const t = now(), mid = uid();
        claim(b.attachments, tk.id, mid);
        db.messages.push({ id: mid, ticket_id: tk.id, sender_id: me.id, body, created_at: t });
        if (me.role !== "admin" && ["resolved", "unresolved"].includes(tk.status)) setSt(tk, "open", me, t);
        tk.updated_at = t; tk.last_sender = me.role === "admin" ? "admin" : "user";
        return [201, { message: { id: mid } }];
      }
      if (me.role !== "admin") throw err(403, "Seul l'administrateur peut changer le statut");
      if (!STATUSES.includes(b.status)) throw err(400, "Statut invalide");
      if (b.status !== tk.status) setSt(tk, b.status, me, now());
      return [200, { ok: true }];
    }
    if (p.startsWith("/api/admin/")) {
      if (me.role !== "admin") throw err(403, "Accès réservé à l'administrateur");
      if (p === "/api/admin/users") return [200, { users: db.users.map((u) => {
        const ts = db.tickets.filter((t) => t.user_id === u.id);
        return { ...pub(u), tickets: ts.length, active: ts.filter((t) => ["open", "in_review"].includes(t.status)).length, last_activity: ts.length ? Math.max(...ts.map((t) => t.updated_at)) : null };
      }) }];
      if (p === "/api/admin/stats") {
        const stats = { open: 0, in_review: 0, resolved: 0, unresolved: 0 };
        db.tickets.forEach((t) => stats[t.status]++);
        return [200, { stats, waiting: db.tickets.filter((t) => t.last_sender === "user" && ["open", "in_review"].includes(t.status)).length, users: db.users.filter((u) => u.role === "user").length }];
      }
    }
    throw err(404, "Introuvable");
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opt = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return realFetch(input, opt);
    await new Promise((r) => setTimeout(r, 120));
    let status, data;
    try { [status, data] = handle(url, (opt.method || "GET").toUpperCase(), opt.body ? JSON.parse(opt.body) : {}); }
    catch (e) { status = e.status || 500; data = { error: e.message }; }
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  };
  window.MagisDeskHooks = {
    async upload(file, type, onProgress) {
      if (!me) throw new Error("Non connecté");
      for (let i = 1; i <= 5; i++) { await new Promise((r) => setTimeout(r, 90)); onProgress(i / 5); }
      const id = uid();
      blobs.set(id, file);
      db.atts.push({ id, owner_id: me.id, message_id: null, ticket_id: null, mime: type, size: file.size, name: file.name, created_at: now() });
      return { id, mime: type, size: file.size, name: file.name };
    },
    mediaUrl(id) {
      if (!urls.has(id) && blobs.has(id)) urls.set(id, URL.createObjectURL(blobs.get(id)));
      return urls.get(id) || "";
    },
  };
})();
