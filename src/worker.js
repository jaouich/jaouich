// Magiscom Terrain — portefeuille clients des commerciaux
// Cloudflare Worker + D1 (base de données) + R2 (photos, vidéos, documents)

const ASSETS = __ASSETS__;

const SESSION_DAYS = 60;
const PBKDF2_ITER = 100000;
const MB = 1024 * 1024;
const MAX_SINGLE = 95 * MB;              // un envoi simple (limite Workers : 100 Mo)
const PART_MAX = 95 * MB;
const MAX_BIG = 4096 * MB;               // vidéo longue : 4 Go
const CATEGORIES = ["photo", "video", "document", "devis"];
const KINDS = ["client", "prospect"];
const VISIT_KINDS = ["visite", "rdv", "appel"];
const VISIT_STATUS = ["planned", "done", "cancelled"];
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|js|vbs|ps1|sh|jar|apk|html?|svg)$/i;

export default {
  async fetch(req, env, ctx) {
    try {
      if (isDemoHost(new URL(req.url).hostname, env)) env = await demoEnv(env);
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e);
      return json({ error: "Erreur serveur" }, 500);
    }
  },
  async scheduled(_e, env, ctx) {
    ctx.waitUntil((async () => {
      await cleanup(env);
      if (env.DEMO_DB && env.DEMO_MEDIA) await resetDemo(demoEnvOf(env));   // la démo repart à zéro chaque nuit
    })());
  },
};

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const fail = (status, message, code) => { throw new HttpError(status, message, code); };

// ------------------------------------------------------------------ routage
async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname, m = req.method;
  if (!p.startsWith("/api/")) return asset(p);
  if (m !== "GET" && m !== "HEAD" && req.headers.get("X-Requested-With") !== "terrain") return json({ error: "Requête refusée" }, 403);

  if (p === "/api/status" && m === "GET") return status(env);
  if (p === "/api/setup" && m === "POST") return setup(req, env);
  if (p === "/api/auth/login" && m === "POST") return login(req, env);
  if (p === "/api/auth/logout" && m === "POST") return logout(req, env);

  const me = await currentUser(req, env);
  if (!me) return json({ error: "Non connecté" }, 401);
  me.p = perms(me);
  ctx.waitUntil?.(touch(env, me));
  const ip = req.headers.get("CF-Connecting-IP") || "";
  const log = (action, entity, id, detail) => audit(env, me.id, action, entity, id, detail, ip);

  if (p === "/api/me" && m === "GET") return json({ user: pubUser(me), settings: await getSettings(env) });
  if (p === "/api/me/password" && m === "POST") return changePassword(req, env, me);
  if (p === "/api/sync" && m === "GET") return sync(url, env, me);
  if (p === "/api/clients/reassign" && m === "POST") return reassign(req, env, me, log);
  if (p === "/api/files/mp" && m === "POST") return mpCreate(req, env, me);
  if (p === "/api/users" && m === "GET") return listUsers(env, me);
  if (p === "/api/users" && m === "POST") return createUser(req, env, me, log);
  if (p === "/api/stats" && m === "GET") return stats(url, env, me);
  if (p === "/api/audit" && m === "GET") return listAudit(url, env, me);
  if (p === "/api/settings" && m === "PATCH") return saveSettings(req, env, me, log);
  if (p === "/api/export/clients.xlsx" && m === "GET") return exportClients(url, env, me, log);
  if (p === "/api/export/visits.xlsx" && m === "GET") return exportVisits(url, env, me, log);

  let r;
  const ID = "([0-9a-zA-Z-]{8,40})";
  if ((r = p.match(new RegExp(`^/api/clients/${ID}$`)))) {
    if (m === "PUT") return putClient(r[1], req, env, me, log);
    if (m === "GET") return getClient(r[1], env, me);
    if (m === "DELETE") return deleteClient(r[1], env, me, log);
  }
  if ((r = p.match(new RegExp(`^/api/clients/${ID}/geo$`))) && m === "POST") return setGeo(r[1], req, env, me, log);
  if ((r = p.match(new RegExp(`^/api/visits/${ID}$`)))) {
    if (m === "PUT") return putVisit(r[1], req, env, me, log);
    if (m === "DELETE") return deleteVisit(r[1], env, me, log);
  }
  if ((r = p.match(new RegExp(`^/api/files/${ID}$`)))) {
    if (m === "PUT") return uploadFile(r[1], req, env, me, log);
    if (m === "GET" || m === "HEAD") return getFile(r[1], req, url, env, me);
    if (m === "DELETE") return deleteFile(r[1], env, me, log);
  }
  if ((r = p.match(new RegExp(`^/api/files/mp/${ID}/(\\d{1,5})$`))) && m === "PUT") return mpPart(r[1], Number(r[2]), req, env, me);
  if ((r = p.match(new RegExp(`^/api/files/mp/${ID}/complete$`))) && m === "POST") return mpComplete(r[1], req, env, me, log);
  if ((r = p.match(new RegExp(`^/api/files/mp/${ID}$`))) && m === "DELETE") return mpAbort(r[1], env, me);
  if ((r = p.match(new RegExp(`^/api/users/${ID}$`))) && m === "PATCH") return updateUser(r[1], req, env, me, log);
  if ((r = p.match(new RegExp(`^/api/users/${ID}/password$`))) && m === "POST") return resetPassword(r[1], env, me, log);
  return json({ error: "Introuvable" }, 404);
}

// ------------------------------------------------------------------ réponses
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
const SEC_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data: https://*.tile.openstreetmap.org; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'self' https://cdnjs.cloudflare.com; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(self)",
};
function asset(p) {
  const a = ASSETS[p] || ASSETS["/"];
  if (a.b64) return new Response(fromB64(a.b64), { headers: { "Content-Type": a.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  const extra = p === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {};
  return new Response(a.body, { headers: { "Content-Type": a.type, "Cache-Control": "no-cache", ...SEC_HEADERS, ...extra } });
}

// ------------------------------------------------------------------ outils
const enc = new TextEncoder();
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const toB64 = (buf) => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: toB64(bits), salt: toB64(salt) };
}
async function readJson(req, max = 60000) {
  const text = await req.text();
  if (text.length > max) fail(413, "Données trop volumineuses");
  try { return JSON.parse(text || "{}"); } catch { fail(400, "Données invalides"); }
}
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v, max) => { const s = str(v, max); return s || null; };
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const tstamp = (v) => num(v, 946684800000, 4102444800000);   // entre 2000 et 2100
function cookie(token, maxAge) { return `tr_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function readCookie(req, name) {
  for (const part of (req.headers.get("Cookie") || "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return v.join("="); }
  return null;
}
function perms(u) {
  let p = {};
  try { p = JSON.parse(u.perms || "{}"); } catch {}
  const admin = u.role === "admin";
  return { admin, all: admin || p.scope === "all", edit_all: admin || !!p.edit_all, export: admin || !!p.export };
}
const pubUser = (u) => ({ id: u.id, login: u.login, name: u.name, phone: u.phone, role: u.role, active: !!u.active, perms: perms(u), must_change: !!u.must_change, last_seen: u.last_seen, created_at: u.created_at });
async function audit(env, userId, action, entity, entityId, detail, ip) {
  try {
    await env.DB.prepare("INSERT INTO audit (at,user_id,action,entity,entity_id,detail,ip) VALUES (?,?,?,?,?,?,?)")
      .bind(now(), userId, action, entity || null, entityId || null, detail ? String(detail).slice(0, 500) : null, ip || null).run();
  } catch (e) { console.error("audit", e); }
}
async function touch(env, me) {
  if (me.last_seen && now() - me.last_seen < 300000) return;
  await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now(), me.id).run();
}
async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT k, v FROM settings WHERE k IN ('company','client_prefix','prospect_prefix')").all();
  const s = { company: "Magiscom Tech", client_prefix: "CL", prospect_prefix: "PR" };
  for (const r of results) s[r.k] = r.v;
  if (env.IS_DEMO) s.demo = true;
  return s;
}

// ------------------------------------------------------------------ comptes
async function status(env) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  const code = n.n ? null : await env.DB.prepare("SELECT 1 FROM settings WHERE k = 'setup_code'").first();
  return json({ setup_needed: !n.n, setup_code: !!code, settings: await getSettings(env), demo: env.IS_DEMO ? { accounts: DEMO_ACCOUNTS } : null });
}
function checkPasswordRules(pw) {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 200) fail(400, "Le mot de passe doit faire au moins 8 caractères");
}
const normLogin = (v) => str(v, 120).toLowerCase();
async function setup(req, env) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (n.n) fail(403, "Déjà configuré");
  const b = await readJson(req);
  // code de mise en service : empêche un inconnu de créer le premier compte administrateur
  const code = await env.DB.prepare("SELECT v FROM settings WHERE k = 'setup_code'").first();
  if (code && !safeEqual(String(b.setup_code || "").trim().toUpperCase(), code.v)) fail(403, "Code de mise en service incorrect");
  const login = normLogin(b.login), name = str(b.name, 80);
  if (login.length < 3) fail(400, "Identifiant trop court");
  if (name.length < 2) fail(400, "Indiquez votre nom");
  checkPasswordRules(b.password);
  const { hash, salt } = await hashPassword(b.password);
  const id = uid();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM settings WHERE k = 'setup_code'"),
    env.DB.prepare("INSERT INTO users (id,login,name,phone,role,perms,active,password_hash,password_salt,created_at) VALUES (?,?,?,?, 'admin','{}',1,?,?,?)")
      .bind(id, login, name, opt(b.phone, 30), hash, salt, now()),
    env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('company', ?)").bind(str(b.company, 120) || "Magiscom Tech"),
  ]);
  await audit(env, id, "setup", "user", id, null, req.headers.get("CF-Connecting-IP"));
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return json({ user: pubUser(u) }, 201, { "Set-Cookie": await createSession(env, id) });
}
async function createSession(env, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(await sha256(token), userId, now() + SESSION_DAYS * 86400000, now()).run();
  return cookie(token, SESSION_DAYS * 86400);
}
async function currentUser(req, env) {
  const token = readCookie(req, "tr_session");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1").bind(await sha256(token), now()).first();
}
async function tooMany(env, key, limit) {
  const r = await env.DB.prepare("SELECT count, window_end FROM login_attempts WHERE key = ?").bind(key).first();
  return r && r.window_end > now() && r.count >= limit;
}
async function noteFailure(env, key) {
  await env.DB.prepare(`INSERT INTO login_attempts (key,count,window_end) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    count = CASE WHEN window_end > ? THEN count + 1 ELSE 1 END, window_end = CASE WHEN window_end > ? THEN window_end ELSE ? END`)
    .bind(key, now() + 900000, now(), now(), now() + 900000).run();
}
async function login(req, env) {
  const b = await readJson(req);
  const login = normLogin(b.login);
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  if ((await tooMany(env, "l:" + login, 10)) || (await tooMany(env, "i:" + ip, 40))) fail(429, "Trop de tentatives. Réessayez dans 15 minutes.");
  const u = await env.DB.prepare("SELECT * FROM users WHERE login = ?").bind(login).first();
  const { hash } = await hashPassword(password, u ? u.password_salt : toB64(new Uint8Array(16)));
  if (!u || !safeEqual(hash, u.password_hash)) { await noteFailure(env, "l:" + login); await noteFailure(env, "i:" + ip); fail(401, "Identifiant ou mot de passe incorrect"); }
  if (!u.active) fail(403, "Compte désactivé. Contactez votre responsable.");
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind("l:" + login).run();
  await audit(env, u.id, "login", "user", u.id, null, ip);
  return json({ user: pubUser(u), settings: await getSettings(env) }, 200, { "Set-Cookie": await createSession(env, u.id) });
}
async function logout(req, env) {
  const token = readCookie(req, "tr_session");
  if (token && /^[0-9a-f]{64}$/.test(token)) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
}
async function changePassword(req, env, me) {
  if (demoLocked(env, me.id)) fail(403, "Non disponible dans la démonstration");
  const b = await readJson(req);
  const { hash } = await hashPassword(String(b.current || "").slice(0, 200), me.password_salt);
  if (!safeEqual(hash, me.password_hash)) fail(400, "Mot de passe actuel incorrect");
  checkPasswordRules(b.password);
  const h = await hashPassword(b.password);
  await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change = 0 WHERE id = ?").bind(h.hash, h.salt, me.id).run();
  return json({ ok: true });
}

// ------------------------------------------------------------------ utilisateurs (admin)
const needAdmin = (me) => { if (!me.p.admin) fail(403, "Réservé à l'administrateur"); };
async function listUsers(env, me) {
  // tout le monde voit les noms (pour afficher qui a fait quoi) ; détails pour l'admin
  const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY active DESC, name").all();
  return json({ users: results.map((u) => (me.p.admin ? pubUser(u) : { id: u.id, name: u.name, role: u.role, active: !!u.active })) });
}
function readPerms(b) {
  const p = b.perms || {};
  return JSON.stringify({ scope: p.scope === "all" ? "all" : "own", edit_all: p.edit_all ? 1 : 0, export: p.export ? 1 : 0 });
}
function tempPassword() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(10))].map((x) => a[x % a.length]).join("");
}
async function createUser(req, env, me, log) {
  needAdmin(me);
  const b = await readJson(req);
  const login = normLogin(b.login), name = str(b.name, 80);
  if (login.length < 3) fail(400, "Identifiant trop court");
  if (name.length < 2) fail(400, "Indiquez le nom");
  if (await env.DB.prepare("SELECT 1 FROM users WHERE login = ?").bind(login).first()) fail(409, "Cet identifiant existe déjà");
  const role = b.role === "admin" ? "admin" : "commercial";
  const pw = typeof b.password === "string" && b.password ? b.password : tempPassword();
  checkPasswordRules(pw);
  const { hash, salt } = await hashPassword(pw);
  const id = uid();
  await env.DB.prepare("INSERT INTO users (id,login,name,phone,role,perms,active,password_hash,password_salt,must_change,created_at) VALUES (?,?,?,?,?,?,1,?,?,1,?)")
    .bind(id, login, name, opt(b.phone, 30), role, readPerms(b), hash, salt, now()).run();
  await log("user.create", "user", id, `${name} (${role})`);
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return json({ user: pubUser(u), password: pw }, 201);
}
async function updateUser(id, req, env, me, log) {
  needAdmin(me);
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!u) fail(404, "Utilisateur introuvable");
  const b = await readJson(req);
  if (demoLocked(env, id) && ((b.active !== undefined && !b.active) || (b.login !== undefined && normLogin(b.login) !== u.login) || (b.role !== undefined && b.role !== u.role))) fail(403, "Ce compte de démonstration ne peut pas être désactivé ni renommé");
  const f = { name: u.name, phone: u.phone, role: u.role, perms: u.perms, active: u.active, login: u.login };
  if (b.name !== undefined) { f.name = str(b.name, 80); if (f.name.length < 2) fail(400, "Indiquez le nom"); }
  if (b.phone !== undefined) f.phone = opt(b.phone, 30);
  if (b.login !== undefined) {
    f.login = normLogin(b.login);
    if (f.login.length < 3) fail(400, "Identifiant trop court");
    if (f.login !== u.login && (await env.DB.prepare("SELECT 1 FROM users WHERE login = ?").bind(f.login).first())) fail(409, "Cet identifiant existe déjà");
  }
  if (b.role !== undefined) f.role = b.role === "admin" ? "admin" : "commercial";
  if (b.perms !== undefined) f.perms = readPerms(b);
  if (b.active !== undefined) f.active = b.active ? 1 : 0;
  if (id === me.id && (f.role !== "admin" || !f.active)) fail(400, "Vous ne pouvez pas retirer vos propres droits d'administrateur");
  if (u.role === "admin" && (f.role !== "admin" || !f.active)) {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").first();
    if (n.n <= 1) fail(400, "Il doit rester au moins un administrateur actif");
  }
  const stmts = [env.DB.prepare("UPDATE users SET name=?, phone=?, role=?, perms=?, active=?, login=? WHERE id=?").bind(f.name, f.phone, f.role, f.perms, f.active, f.login, id)];
  if (!f.active) stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
  await env.DB.batch(stmts);
  await log(!f.active && u.active ? "user.disable" : "user.update", "user", id, f.name);
  return json({ user: pubUser(await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()) });
}
async function resetPassword(id, env, me, log) {
  needAdmin(me);
  const u = await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(id).first();
  if (!u) fail(404, "Utilisateur introuvable");
  if (demoLocked(env, id)) fail(403, "Non disponible pour ce compte de démonstration");
  const pw = tempPassword();
  const { hash, salt } = await hashPassword(pw);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change = 1 WHERE id = ?").bind(hash, salt, id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
  ]);
  await log("user.password_reset", "user", id, u.name);
  return json({ password: pw });
}
async function saveSettings(req, env, me, log) {
  needAdmin(me);
  const b = await readJson(req);
  const stmts = [];
  if (b.company !== undefined) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('company', ?)").bind(str(b.company, 120) || "Magiscom Tech"));
  for (const k of ["client_prefix", "prospect_prefix"]) {
    if (b[k] !== undefined) {
      const v = str(b[k], 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!v) fail(400, "Préfixe invalide");
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES (?, ?)").bind(k, v));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await log("settings.update", "settings", null, null);
  return json({ settings: await getSettings(env) });
}

// ------------------------------------------------------------------ droits sur les clients
function canSee(me, c) { return me.p.all || c.owner_id === me.id || c.created_by === me.id; }
function canEdit(me, c) { return me.p.edit_all || c.owner_id === me.id || (c.created_by === me.id && !c.owner_id); }
async function loadClient(env, id, me, edit) {
  const c = await env.DB.prepare("SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!c || !canSee(me, c)) fail(404, "Client introuvable");
  if (edit && !canEdit(me, c)) fail(403, "Ce client est suivi par un autre commercial");
  return c;
}
function scopeSql(me, alias = "c") {
  return me.p.all ? { sql: "1=1", args: [] } : { sql: `(${alias}.owner_id = ? OR ${alias}.created_by = ?)`, args: [me.id, me.id] };
}

// ------------------------------------------------------------------ synchronisation (téléphone hors ligne)
async function sync(url, env, me) {
  const since = Number(url.searchParams.get("since") || 0) || 0;
  const t = now();
  const sc = scopeSql(me);
  const clients = (await env.DB.prepare(`SELECT c.* FROM clients c WHERE ${sc.sql} AND c.updated_at > ? ORDER BY c.updated_at LIMIT 5000`).bind(...sc.args, since).all()).results;
  // si le client n'est plus visible (réattribué), le téléphone doit l'oublier
  let gone = [];
  if (since && !me.p.all) {
    gone = (await env.DB.prepare("SELECT id FROM clients WHERE updated_at > ? AND NOT (owner_id = ? OR created_by = ?)").bind(since, me.id, me.id).all()).results.map((r) => r.id);
  }
  const visits = (await env.DB.prepare(`SELECT v.* FROM visits v JOIN clients c ON c.id = v.client_id WHERE ${sc.sql} AND v.updated_at > ? ORDER BY v.updated_at LIMIT 20000`).bind(...sc.args, since).all()).results;
  const files = (await env.DB.prepare(`SELECT f.id, f.client_id, f.visit_id, f.user_id, f.name, f.mime, f.size, f.category, f.note, f.created_at, f.updated_at, f.deleted_at FROM files f JOIN clients c ON c.id = f.client_id WHERE ${sc.sql} AND f.updated_at > ? ORDER BY f.updated_at LIMIT 20000`).bind(...sc.args, since).all()).results;
  const users = (await env.DB.prepare("SELECT id, name, role, active FROM users").all()).results.map((u) => ({ ...u, active: !!u.active }));
  return json({ now: t, full: !since, clients, gone, visits, files, users, me: pubUser(me), settings: await getSettings(env) });
}

// ------------------------------------------------------------------ clients
async function nextCode(env, kind) {
  const s = await getSettings(env);
  const prefix = kind === "client" ? s.client_prefix : s.prospect_prefix;
  const key = "seq_" + prefix;
  const r = await env.DB.prepare("INSERT INTO settings (k,v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1 RETURNING v").bind(key).first();
  let n = Number(r.v);
  let code = `${prefix}-${String(n).padStart(5, "0")}`;
  while (await env.DB.prepare("SELECT 1 FROM clients WHERE code = ?").bind(code).first()) {
    n++; code = `${prefix}-${String(n).padStart(5, "0")}`;
    await env.DB.prepare("UPDATE settings SET v = ? WHERE k = ?").bind(String(n), key).run();
  }
  return code;
}
const CLIENT_FIELDS = { name: 160, contact: 120, phone: 40, phone2: 40, email: 160, city: 80, address: 300, sector: 80, ice: 30, notes: 4000 };
async function putClient(id, req, env, me, log) {
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  const b = await readJson(req);
  const old = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  const t = now();
  const f = {};
  for (const [k, max] of Object.entries(CLIENT_FIELDS)) if (b[k] !== undefined) f[k] = k === "name" ? str(b[k], max) : opt(b[k], max);
  if (b.kind !== undefined) f.kind = KINDS.includes(b.kind) ? b.kind : "prospect";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) fail(400, "Adresse e-mail invalide");
  if (b.lat !== undefined && b.lng !== undefined && b.lat !== null) {
    const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
    if (lat === null || lng === null) fail(400, "Position invalide");
    Object.assign(f, { lat, lng, geo_acc: num(b.geo_acc, 0, 100000), geo_at: tstamp(b.geo_at) || t, geo_by: me.id });
  }
  let code = b.code !== undefined ? str(b.code, 30).toUpperCase().replace(/\s+/g, "") : null;
  if (code && !/^[A-Z0-9][A-Z0-9_.\-\/]{0,29}$/.test(code)) fail(400, "Code invalide (lettres, chiffres, tirets)");

  if (!old) {
    if (!f.name || f.name.length < 2) fail(400, "Indiquez le nom du client");
    f.kind = f.kind || "prospect";
    if (code && (await env.DB.prepare("SELECT 1 FROM clients WHERE code = ?").bind(code).first())) code = null;   // créé hors ligne : code déjà pris -> nouveau code
    if (!code) code = await nextCode(env, f.kind);
    let owner = me.id;
    if (me.p.admin && b.owner_id) owner = await activeUserId(env, b.owner_id);
    const created = tstamp(b.created_at) && b.created_at < t ? b.created_at : t;
    const cols = ["id", "code", "owner_id", "created_by", "created_at", "updated_at", ...Object.keys(f)];
    const vals = [id, code, owner, me.id, created, t, ...Object.values(f)];
    await env.DB.prepare(`INSERT INTO clients (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...vals).run();
    await log("client.create", "client", id, `${code} ${f.name}`);
  } else {
    if (old.deleted_at) fail(410, "Ce client a été supprimé");
    if (!canSee(me, old)) fail(404, "Client introuvable");
    if (!canEdit(me, old)) fail(403, "Ce client est suivi par un autre commercial");
    if (f.name !== undefined && f.name.length < 2) fail(400, "Indiquez le nom du client");
    if (code && code !== old.code) {
      if (await env.DB.prepare("SELECT 1 FROM clients WHERE code = ? AND id <> ?").bind(code, id).first()) fail(409, "Ce code est déjà utilisé");
      f.code = code;
    }
    if (b.owner_id !== undefined && me.p.admin && b.owner_id !== old.owner_id) f.owner_id = b.owner_id ? await activeUserId(env, b.owner_id) : null;
    const keys = Object.keys(f);
    if (keys.length) {
      await env.DB.prepare(`UPDATE clients SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(f), t, id).run();
      const what = keys.includes("owner_id") ? "client.reassign" : keys.includes("lat") ? "client.geo" : keys.includes("kind") && f.kind !== old.kind ? "client.kind" : "client.update";
      await log(what, "client", id, `${old.code} ${f.name || old.name}`);
    }
  }
  return json({ client: await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first() }, old ? 200 : 201);
}
async function activeUserId(env, id) {
  const u = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND active = 1").bind(String(id)).first();
  if (!u) fail(400, "Commercial introuvable ou désactivé");
  return u.id;
}
async function getClient(id, env, me) {
  const c = await loadClient(env, id, me);
  const visits = (await env.DB.prepare("SELECT * FROM visits WHERE client_id = ? AND deleted_at IS NULL ORDER BY date DESC").bind(id).all()).results;
  const files = (await env.DB.prepare("SELECT id, client_id, visit_id, user_id, name, mime, size, category, note, created_at, updated_at FROM files WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").bind(id).all()).results;
  return json({ client: c, visits, files });
}
async function setGeo(id, req, env, me, log) {
  const c = await loadClient(env, id, me, true);
  const b = await readJson(req);
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat === null || lng === null) fail(400, "Position invalide");
  const t = now();
  await env.DB.prepare("UPDATE clients SET lat=?, lng=?, geo_acc=?, geo_at=?, geo_by=?, updated_at=? WHERE id=?").bind(lat, lng, num(b.acc, 0, 100000), tstamp(b.at) || t, me.id, t, id).run();
  await log("client.geo", "client", id, `${c.code} ${lat.toFixed(5)},${lng.toFixed(5)}`);
  return json({ client: await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first() });
}
async function deleteClient(id, env, me, log) {
  needAdmin(me);
  const c = await env.DB.prepare("SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!c) fail(404, "Client introuvable");
  const t = now();
  // suppression « douce » : rien n'est effacé, la fiche est masquée et reste récupérable
  await env.DB.prepare("UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(t, t, id).run();
  await log("client.delete", "client", id, `${c.code} ${c.name}`);
  return json({ ok: true });
}
async function reassign(req, env, me, log) {
  needAdmin(me);
  const b = await readJson(req);
  const to = await activeUserId(env, b.to);
  const t = now();
  let n = 0;
  if (Array.isArray(b.ids) && b.ids.length) {
    for (const id of b.ids.slice(0, 2000)) {
      const r = await env.DB.prepare("UPDATE clients SET owner_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(to, t, String(id)).run();
      n += r.meta.changes;
    }
  } else if (b.from) {
    const r = await env.DB.prepare("UPDATE clients SET owner_id = ?, updated_at = ? WHERE owner_id = ? AND deleted_at IS NULL").bind(to, t, String(b.from)).run();
    n = r.meta.changes;
  } else fail(400, "Choisissez les clients à transférer");
  await log("client.reassign", "user", to, `${n} client(s)` + (b.from ? ` depuis ${b.from}` : ""));
  return json({ moved: n });
}

// ------------------------------------------------------------------ visites, rendez-vous, comptes-rendus
async function putVisit(id, req, env, me, log) {
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  const b = await readJson(req);
  const old = await env.DB.prepare("SELECT * FROM visits WHERE id = ?").bind(id).first();
  const t = now();
  const f = {};
  if (b.kind !== undefined) f.kind = VISIT_KINDS.includes(b.kind) ? b.kind : "visite";
  if (b.status !== undefined) f.status = VISIT_STATUS.includes(b.status) ? b.status : "done";
  if (b.date !== undefined) { f.date = tstamp(b.date); if (!f.date) fail(400, "Date invalide"); }
  if (b.next_date !== undefined) f.next_date = b.next_date ? tstamp(b.next_date) : null;
  for (const k of ["agreed", "not_done", "demands", "next_step"]) if (b[k] !== undefined) f[k] = opt(b[k], 6000);
  if (b.lat != null && b.lng != null) {
    const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
    if (lat !== null && lng !== null) Object.assign(f, { lat, lng, geo_acc: num(b.geo_acc, 0, 100000) });
  }
  if (!old) {
    const vc = await loadClient(env, str(b.client_id, 40), me);
    f.kind = f.kind || "visite"; f.status = f.status || "done"; f.date = f.date || t;
    const created = tstamp(b.created_at) && b.created_at < t ? b.created_at : t;
    const cols = ["id", "client_id", "user_id", "created_at", "updated_at", ...Object.keys(f)];
    await env.DB.prepare(`INSERT INTO visits (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, b.client_id, me.id, created, t, ...Object.values(f)).run();
    // un prospect visité reste prospect ; la fiche remonte en tête des listes
    await env.DB.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").bind(t, b.client_id).run();
    await log(f.status === "planned" ? "visit.plan" : "visit.create", "visit", id, `${f.kind} · ${vc.code} ${vc.name}`);
  } else {
    if (old.deleted_at) fail(410, "Cette visite a été supprimée");
    const c = await loadClient(env, old.client_id, me);
    if (!(me.p.admin || old.user_id === me.id || (me.p.edit_all && canSee(me, c)))) fail(403, "Seul l'auteur peut modifier ce compte-rendu");
    const keys = Object.keys(f);
    if (keys.length) await env.DB.prepare(`UPDATE visits SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(f), t, id).run();
    await log("visit.update", "visit", id, null);
  }
  return json({ visit: await env.DB.prepare("SELECT * FROM visits WHERE id = ?").bind(id).first() }, old ? 200 : 201);
}
async function deleteVisit(id, env, me, log) {
  needAdmin(me);
  const t = now();
  const r = await env.DB.prepare("UPDATE visits SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(t, t, id).run();
  if (!r.meta.changes) fail(404, "Visite introuvable");
  await log("visit.delete", "visit", id, null);
  return json({ ok: true });
}

// ------------------------------------------------------------------ documents (GED)
function cleanName(raw, fallback) {
  let n = fallback;
  try { n = decodeURIComponent(raw || "") || fallback; } catch {}
  return n.replace(/[\u0000-\u001f\\/]/g, "").slice(0, 150) || fallback;
}
function checkType(mime, name) {
  if (!mime || mime.length > 120 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime)) fail(415, "Type de fichier inconnu");
  if (/html|javascript|svg|x-msdownload|x-sh|executable/i.test(mime) || BLOCKED_EXT.test(name)) fail(415, "Ce type de fichier n'est pas accepté");
}
function catFor(mime, wanted) {
  if (CATEGORIES.includes(wanted)) return wanted;
  return mime.startsWith("image/") ? "photo" : mime.startsWith("video/") ? "video" : "document";
}
async function uploadFile(id, req, env, me, log) {
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  const existing = await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (existing) return json({ file: existing });   // déjà reçu (renvoi après coupure)
  const clientId = str(req.headers.get("X-Client-Id"), 40);
  await loadClient(env, clientId, me);
  const visitId = str(req.headers.get("X-Visit-Id"), 40) || null;
  const mime = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const name = cleanName(req.headers.get("X-File-Name"), "fichier");
  checkType(mime, name);
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size || !req.body) fail(411, "Fichier vide");
  if (size > MAX_SINGLE) fail(413, "Fichier trop lourd pour un envoi simple");
  if (env.IS_DEMO && size > DEMO_MAX_FILE) fail(413, "Dans la démonstration, les fichiers sont limités à 20 Mo");
  const category = catFor(mime, str(req.headers.get("X-Category"), 20));
  const key = `c/${clientId}/${id}`;
  const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: mime } });
  if (!obj || obj.size !== size) { await env.MEDIA.delete(key); fail(400, "Envoi interrompu, réessayez"); }
  const t = now();
  const created = tstamp(Number(req.headers.get("X-Created-At"))) || t;
  await env.DB.prepare("INSERT INTO files (id,client_id,visit_id,user_id,r2_key,name,mime,size,category,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, clientId, visitId, me.id, key, name, mime, size, category, opt(cleanName(req.headers.get("X-Note"), ""), 300), Math.min(created, t), t).run();
  await env.DB.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").bind(t, clientId).run();
  await log("file.upload", "file", id, `${category} ${name} (${Math.round(size / 1024)} Ko)`);
  return json({ file: await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first() }, 201);
}
async function mpCreate(req, env, me) {
  if (env.IS_DEMO) fail(413, "Dans la démonstration, les fichiers sont limités à 20 Mo");
  const b = await readJson(req);
  const id = str(b.id, 40);
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  if (await env.DB.prepare("SELECT 1 FROM files WHERE id = ?").bind(id).first()) return json({ done: true });
  const old = await env.DB.prepare("SELECT id FROM uploads_mp WHERE id = ? AND user_id = ?").bind(id, me.id).first();
  if (old) return json({ upload: { id } });
  await loadClient(env, str(b.client_id, 40), me);
  const mime = str(b.mime, 120).toLowerCase(), name = cleanName(b.name, "video");
  checkType(mime, name);
  const key = `c/${b.client_id}/${id}`;
  const mpu = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
  await env.DB.prepare("INSERT INTO uploads_mp (id,user_id,client_id,visit_id,r2_key,upload_id,mime,name,category,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, me.id, b.client_id, opt(b.visit_id, 40), key, mpu.uploadId, mime, name, catFor(mime, b.category), now()).run();
  return json({ upload: { id } }, 201);
}
async function loadMp(env, id, me) {
  const u = await env.DB.prepare("SELECT * FROM uploads_mp WHERE id = ? AND user_id = ?").bind(id, me.id).first();
  if (!u) fail(404, "Envoi introuvable");
  return u;
}
async function mpPart(id, n, req, env, me) {
  const u = await loadMp(env, id, me);
  if (n < 1 || n > 10000) fail(400, "Morceau invalide");
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size || size > PART_MAX) fail(413, "Morceau trop lourd");
  const buf = await req.arrayBuffer();
  if (buf.byteLength !== size) fail(400, "Envoi interrompu, réessayez");
  const part = await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).uploadPart(n, buf);
  return json({ part: n, etag: part.etag });
}
async function mpComplete(id, req, env, me, log) {
  const u = await loadMp(env, id, me);
  const b = await readJson(req, 600000);
  if (!Array.isArray(b.parts) || !b.parts.length) fail(400, "Envoi incomplet");
  let obj;
  try { obj = await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).complete(b.parts.map((p) => ({ partNumber: Number(p.part), etag: String(p.etag || "") }))); }
  catch (e) { console.error("mp", e); fail(400, "Envoi incomplet, réessayez"); }
  if (obj.size > MAX_BIG) { await env.MEDIA.delete(u.r2_key); await env.DB.prepare("DELETE FROM uploads_mp WHERE id = ?").bind(id).run(); fail(413, "Fichier trop lourd (4 Go maximum)"); }
  const t = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO files (id,client_id,visit_id,user_id,r2_key,name,mime,size,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, u.client_id, u.visit_id, me.id, u.r2_key, u.name, u.mime, obj.size, u.category, t, t),
    env.DB.prepare("DELETE FROM uploads_mp WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").bind(t, u.client_id),
  ]);
  await log("file.upload", "file", id, `${u.category} ${u.name} (${Math.round(obj.size / MB)} Mo)`);
  return json({ file: await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first() }, 201);
}
async function mpAbort(id, env, me) {
  const u = await loadMp(env, id, me);
  try { await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).abort(); } catch {}
  await env.DB.prepare("DELETE FROM uploads_mp WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
async function getFile(id, req, url, env, me) {
  const f = await env.DB.prepare("SELECT f.*, c.owner_id, c.created_by AS c_created_by FROM files f JOIN clients c ON c.id = f.client_id WHERE f.id = ? AND f.deleted_at IS NULL").bind(id).first();
  if (!f || !canSee(me, { owner_id: f.owner_id, created_by: f.c_created_by })) return json({ error: "Introuvable" }, 404);
  const size = f.size;
  let range = null;
  const mm = (req.headers.get("Range") || "").match(/^bytes=(\d*)-(\d*)$/);
  if (mm && (mm[1] || mm[2])) {
    let s, e;
    if (mm[1] === "") { s = Math.max(0, size - Number(mm[2])); e = size - 1; }
    else { s = Number(mm[1]); e = mm[2] === "" ? size - 1 : Math.min(Number(mm[2]), size - 1); }
    if (s > e || s >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    range = { offset: s, length: e - s + 1 };
  }
  const obj = await env.MEDIA.get(f.r2_key, range ? { range } : undefined);
  if (!obj) return json({ error: "Fichier manquant" }, 404);
  const inline = !url.searchParams.has("download") && /^(image\/(jpeg|png|webp|gif)|video\/|audio\/|application\/pdf)/.test(f.mime);
  const h = new Headers({
    "Content-Type": f.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
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
async function deleteFile(id, env, me, log) {
  needAdmin(me);
  const f = await env.DB.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!f) fail(404, "Fichier introuvable");
  const t = now();
  // le fichier reste dans le stockage 30 jours (corbeille), puis le nettoyage nocturne le supprime
  await env.DB.prepare("UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(t, t, id).run();
  await log("file.delete", "file", id, f.name);
  return json({ ok: true });
}
async function cleanup(env) {
  const old = now() - 30 * 86400000;
  const { results } = await env.DB.prepare("SELECT id, r2_key FROM files WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 500").bind(old).all();
  for (const f of results) { await env.MEDIA.delete(f.r2_key); await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run(); }
  const mps = (await env.DB.prepare("SELECT * FROM uploads_mp WHERE created_at < ?").bind(now() - 7 * 86400000).all()).results;
  for (const u of mps) { try { await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).abort(); } catch {} await env.DB.prepare("DELETE FROM uploads_mp WHERE id = ?").bind(u.id).run(); }
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE window_end < ?").bind(now()).run();
  await env.DB.prepare("DELETE FROM audit WHERE at < ?").bind(now() - 3 * 365 * 86400000).run();
}

// ------------------------------------------------------------------ tableau de bord (admin)
async function stats(url, env, me) {
  needAdmin(me);
  const day = 86400000, t = now();
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
  const totals = await one(`SELECT
    (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND kind='client') AS clients,
    (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND kind='prospect') AS prospects,
    (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND lat IS NOT NULL) AS located,
    (SELECT COUNT(*) FROM visits WHERE deleted_at IS NULL AND status='done' AND date > ?) AS visits_7,
    (SELECT COUNT(*) FROM visits WHERE deleted_at IS NULL AND status='done' AND date > ?) AS visits_30,
    (SELECT COUNT(*) FROM visits WHERE deleted_at IS NULL AND status='planned' AND date > ?) AS planned,
    (SELECT COUNT(*) FROM files WHERE deleted_at IS NULL) AS files,
    (SELECT COALESCE(SUM(size),0) FROM files WHERE deleted_at IS NULL) AS storage,
    (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND created_at > ?) AS new_30`, t - 7 * day, t - 30 * day, t, t - 30 * day);
  const { results: per } = await env.DB.prepare(`SELECT u.id, u.name, u.role, u.active, u.last_seen,
      (SELECT COUNT(*) FROM clients c WHERE c.owner_id = u.id AND c.deleted_at IS NULL) AS clients,
      (SELECT COUNT(*) FROM clients c WHERE c.owner_id = u.id AND c.deleted_at IS NULL AND c.kind='prospect') AS prospects,
      (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.deleted_at IS NULL AND v.status='done' AND v.date > ?) AS visits_7,
      (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.deleted_at IS NULL AND v.status='done' AND v.date > ?) AS visits_30,
      (SELECT MAX(v.date) FROM visits v WHERE v.user_id = u.id AND v.deleted_at IS NULL AND v.status='done') AS last_visit,
      (SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS files
    FROM users u ORDER BY u.active DESC, visits_30 DESC, u.name`).bind(t - 7 * day, t - 30 * day).all();
  const { results: daily } = await env.DB.prepare(`SELECT CAST((date - ?) / ? AS INTEGER) AS d, COUNT(*) AS n FROM visits
    WHERE deleted_at IS NULL AND status='done' AND date > ? GROUP BY d`).bind(t - 30 * day, day, t - 30 * day).all();
  const { results: cities } = await env.DB.prepare("SELECT COALESCE(city,'—') AS city, COUNT(*) AS n FROM clients WHERE deleted_at IS NULL GROUP BY COALESCE(city,'—') ORDER BY n DESC LIMIT 8").all();
  return json({ totals, per_user: per.map((u) => ({ ...u, active: !!u.active })), daily, cities });
}
async function listAudit(url, env, me) {
  needAdmin(me);
  const before = Number(url.searchParams.get("before")) || now() + 1;
  const user = url.searchParams.get("user");
  const q = user ? "SELECT * FROM audit WHERE at < ? AND user_id = ? ORDER BY at DESC LIMIT 100" : "SELECT * FROM audit WHERE at < ? ORDER BY at DESC LIMIT 100";
  const { results } = await env.DB.prepare(q).bind(...(user ? [before, user] : [before])).all();
  return json({ entries: results });
}

// ------------------------------------------------------------------ export Excel (.xlsx)
const fmtDate = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "");
async function exportClients(url, env, me, log) {
  if (!me.p.export) fail(403, "Vous n'avez pas le droit d'exporter");
  const sc = scopeSql(me);
  const where = [sc.sql, "c.deleted_at IS NULL"], args = [...sc.args];
  const kind = url.searchParams.get("kind"), owner = url.searchParams.get("owner"), city = url.searchParams.get("city");
  if (KINDS.includes(kind)) { where.push("c.kind = ?"); args.push(kind); }
  if (owner) { where.push("c.owner_id = ?"); args.push(owner); }
  if (city) { where.push("c.city = ?"); args.push(city); }
  const { results } = await env.DB.prepare(`SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM visits v WHERE v.client_id = c.id AND v.deleted_at IS NULL AND v.status='done') AS nb_visits,
      (SELECT MAX(date) FROM visits v WHERE v.client_id = c.id AND v.deleted_at IS NULL AND v.status='done') AS last_visit,
      (SELECT COUNT(*) FROM files f WHERE f.client_id = c.id AND f.deleted_at IS NULL) AS nb_files
    FROM clients c LEFT JOIN users u ON u.id = c.owner_id WHERE ${where.join(" AND ")} ORDER BY c.code`).bind(...args).all();
  const head = ["Code", "Nom", "Type", "Contact", "Téléphone", "Téléphone 2", "E-mail", "Ville", "Adresse", "Secteur", "ICE", "Commercial", "Latitude", "Longitude", "Google Maps", "Nb visites", "Dernière visite", "Nb documents", "Créé le", "Notes"];
  const rows = results.map((c) => [c.code, c.name, c.kind === "client" ? "Client" : "Prospect", c.contact, c.phone, c.phone2, c.email, c.city, c.address, c.sector, c.ice, c.owner_name,
    c.lat, c.lng, c.lat != null ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : "", c.nb_visits, fmtDate(c.last_visit), c.nb_files, fmtDate(c.created_at), c.notes]);
  await log("export.clients", "export", null, `${rows.length} ligne(s)`);
  return xlsxResponse("clients", [{ name: "Clients", head, rows }]);
}
async function exportVisits(url, env, me, log) {
  if (!me.p.export) fail(403, "Vous n'avez pas le droit d'exporter");
  const sc = scopeSql(me);
  const where = [sc.sql, "v.deleted_at IS NULL", "c.deleted_at IS NULL"], args = [...sc.args];
  const from = Number(url.searchParams.get("from")) || 0, to = Number(url.searchParams.get("to")) || 4102444800000;
  where.push("v.date >= ? AND v.date <= ?"); args.push(from, to);
  const user = url.searchParams.get("user");
  if (user) { where.push("v.user_id = ?"); args.push(user); }
  const { results } = await env.DB.prepare(`SELECT v.*, c.code, c.name AS client_name, c.city, u.name AS user_name FROM visits v
    JOIN clients c ON c.id = v.client_id LEFT JOIN users u ON u.id = v.user_id WHERE ${where.join(" AND ")} ORDER BY v.date DESC LIMIT 50000`).bind(...args).all();
  const K = { visite: "Visite", rdv: "Rendez-vous", appel: "Appel" }, S = { planned: "Prévu", done: "Fait", cancelled: "Annulé" };
  const head = ["Date", "Type", "Statut", "Code client", "Client", "Ville", "Commercial", "Ce qui a été convenu", "Ce qui n'a pas été fait", "Demandes du client", "Prochaine étape", "Prochaine date", "Position"];
  const rows = results.map((v) => [fmtDate(v.date), K[v.kind] || v.kind, S[v.status] || v.status, v.code, v.client_name, v.city, v.user_name, v.agreed, v.not_done, v.demands, v.next_step, fmtDate(v.next_date), v.lat != null ? `${v.lat},${v.lng}` : ""]);
  await log("export.visits", "export", null, `${rows.length} ligne(s)`);
  return xlsxResponse("visites", [{ name: "Visites", head, rows }]);
}
function xmlEsc(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function colName(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function sheetXml(head, rows) {
  const cell = (v, r, c, style) => {
    const ref = colName(c) + r;
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const widths = head.map((h, i) => Math.min(60, Math.max(h.length + 2, ...rows.slice(0, 300).map((r) => String(r[i] ?? "").length + 1))));
  let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>`;
  x += widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols><sheetData>";
  x += `<row r="1">${head.map((h, c) => cell(h, 1, c, 1)).join("")}</row>`;
  rows.forEach((row, i) => { x += `<row r="${i + 2}">${row.map((v, c) => cell(v, i + 2, c, 0)).join("")}</row>`; });
  x += `</sheetData><autoFilter ref="A1:${colName(head.length - 1)}${rows.length + 1}"/></worksheet>`;
  return x;
}
function xlsxResponse(base, sheets) {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B4FD6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.head, s.rows); });
  const zip = zipStore(files);
  const d = new Date().toISOString().slice(0, 10);
  return new Response(zip, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${base}_${d}.xlsx"`, "Cache-Control": "no-store",
  } });
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/** ZIP sans compression (suffisant pour un classeur Excel). */
function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = enc.encode(content), nameB = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nameB.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nameB, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nameB.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

// ------------------------------------------------------------------ version de démonstration
// Sur une adresse qui commence par « demo. », l'application utilise une base et un stockage séparés,
// remplis de données fictives et remis à zéro chaque nuit. Les vraies données ne sont jamais touchées.
const DEMO_PASSWORD = "demo2026";
const DEMO_LOGIN_IDS = ["demo-u-dir", "demo-u-com"];
const DEMO_ACCOUNTS = [{ role: "admin", login: "direction", password: DEMO_PASSWORD }, { role: "commercial", login: "commercial", password: DEMO_PASSWORD }];
const DEMO_MAX_FILE = 20 * MB;
let demoReady = false;
const isDemoHost = (host, env) => !!(env.DEMO_DB && env.DEMO_MEDIA) && (/^demo[.-]/i.test(host) || env.FORCE_DEMO === "1");
const demoEnvOf = (env) => ({ ...env, DB: env.DEMO_DB, MEDIA: env.DEMO_MEDIA, IS_DEMO: true });
async function demoEnv(env) {
  const e = demoEnvOf(env);
  if (!demoReady) {
    const n = await e.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    if (!n.n) await seedDemo(e);
    demoReady = true;
  }
  return e;
}
const demoLocked = (env, id) => env.IS_DEMO && DEMO_LOGIN_IDS.includes(id);

async function resetDemo(env) {
  // stockage : suppression des fichiers envoyés pendant la journée
  let cursor;
  do {
    const l = await env.MEDIA.list({ cursor, limit: 500 });
    if (l.objects.length) await env.MEDIA.delete(l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  const mps = (await env.DB.prepare("SELECT r2_key, upload_id FROM uploads_mp").all()).results;
  for (const u of mps) { try { await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).abort(); } catch {} }
  await env.DB.batch(["users", "sessions", "login_attempts", "settings", "clients", "visits", "files", "uploads_mp", "audit"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await seedDemo(env);
}

function demoRand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

async function seedDemo(env) {
  const t = now(), D = 86400000, H = 3600000;
  const R = demoRand(20261126);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const jitter = (v, amp) => Math.round((v + (R() - 0.5) * amp) * 1e5) / 1e5;
  const { hash, salt } = await hashPassword(DEMO_PASSWORD);
  const other = await hashPassword(toHex(crypto.getRandomValues(new Uint8Array(16))));
  const users = [
    ["demo-u-dir", "direction", "Directeur commercial", "0522 00 00 01", "admin", {}, hash, salt],
    ["demo-u-com", "commercial", "Karim Benali", "0661 10 20 30", "commercial", { scope: "own", edit_all: 0, export: 0 }, hash, salt],
    ["demo-u-sal", "salma.idrissi", "Salma Idrissi", "0662 11 22 33", "commercial", { scope: "all", edit_all: 0, export: 1 }, other.hash, other.salt],
    ["demo-u-you", "youssef.amrani", "Youssef Amrani", "0663 44 55 66", "commercial", { scope: "own", edit_all: 0, export: 0 }, other.hash, other.salt],
    ["demo-u-nad", "nadia.elfassi", "Nadia El Fassi", "0664 77 88 99", "commercial", { scope: "own", edit_all: 0, export: 0 }, other.hash, other.salt],
  ];
  const st = [];
  for (const [id, login, name, phone, role, p, h, s] of users) {
    st.push(env.DB.prepare("INSERT INTO users (id,login,name,phone,role,perms,active,password_hash,password_salt,must_change,created_at,last_seen) VALUES (?,?,?,?,?,?,1,?,?,0,?,?)")
      .bind(id, login, name, phone, role, JSON.stringify(p), h, s, t - 60 * D, id === "demo-u-dir" ? null : t - Math.floor(R() * 20) * H));
  }
  st.push(env.DB.prepare("INSERT INTO settings (k,v) VALUES ('company','Démo Distribution SARL')"));

  const towns = {
    Mohammedia: [33.6866, -7.3830], Casablanca: [33.5899, -7.6039], "Aïn Harrouda": [33.6378, -7.4486],
    Rabat: [34.0209, -6.8416], "Témara": [33.9287, -6.9063], "Salé": [34.0531, -6.7985],
  };
  // [nom, type, ville, contact, secteur, commercial]
  const rows = [
    ["Droguerie Al Amal", "client", "Mohammedia", "Hassan Tazi", "Quincaillerie", "demo-u-com"],
    ["Pharmacie Ennour", "client", "Mohammedia", "Dr. Bennani", "Pharmacie", "demo-u-com"],
    ["Café Les Palmiers", "prospect", "Mohammedia", "Rachid Ouazzani", "Café / restaurant", "demo-u-com"],
    ["Garage Atlas Auto", "client", "Mohammedia", "M. Alaoui", "Automobile", "demo-u-com"],
    ["Boulangerie Assalam", "prospect", "Aïn Harrouda", "Omar Kettani", "Boulangerie", "demo-u-com"],
    ["Supermarché Al Wafa", "client", "Mohammedia", "Fatima Zahra", "Distribution", "demo-u-com"],
    ["Clinique Dentaire Atlas", "client", "Casablanca", "Dr. Fassi", "Santé", "demo-u-com"],
    ["Électricité Moderne", "prospect", "Aïn Harrouda", "Said Berrada", "Électricité", "demo-u-com"],
    ["Transports Rapides SARL", "client", "Casablanca", "Mme Lahlou", "Transport", "demo-u-you"],
    ["Imprimerie Moderne", "client", "Casablanca", "Ahmed Chraibi", "Imprimerie", "demo-u-you"],
    ["Auto-école Nour", "prospect", "Casablanca", "Nour Eddine", "Formation", "demo-u-you"],
    ["Bureau Plus Fournitures", "client", "Casablanca", "Leila Benjelloun", "Fournitures de bureau", "demo-u-you"],
    ["Restaurant Dar Zitoun", "prospect", "Casablanca", "Mehdi Sqalli", "Café / restaurant", "demo-u-you"],
    ["Laboratoire Anfa Analyses", "client", "Casablanca", "Dr. Amrani", "Santé", "demo-u-you"],
    ["Hôtel Miramar", "client", "Rabat", "Khalid Mansouri", "Hôtellerie", "demo-u-sal"],
    ["Cabinet Comptable Raji", "client", "Rabat", "Youssef Raji", "Comptabilité", "demo-u-sal"],
    ["Supérette Al Baraka", "prospect", "Témara", "Aicha", "Distribution", "demo-u-sal"],
    ["Menuiserie Al Andalous", "client", "Salé", "Abdellah", "Menuiserie", "demo-u-sal"],
    ["Opticien Vision Plus", "prospect", "Rabat", "Sanaa Tahiri", "Optique", "demo-u-sal"],
    ["École Les Orangers", "client", "Témara", "Mme Bennis", "Enseignement", "demo-u-sal"],
    ["Pressing Royal", "prospect", "Salé", "Hamid", "Services", "demo-u-nad"],
    ["Parapharmacie Yasmine", "client", "Rabat", "Yasmine Alami", "Pharmacie", "demo-u-nad"],
    ["Agence Immobilière Agdal", "prospect", "Rabat", "Karim Tounsi", "Immobilier", "demo-u-nad"],
    ["Quincaillerie du Centre", "client", "Témara", "Brahim", "Quincaillerie", "demo-u-nad"],
  ];
  const streets = ["Bd Hassan II", "Av. Mohammed V", "Bd des FAR", "Rue Zerktouni", "Av. Al Massira", "Bd Anfa", "Rue Ibn Sina", "Av. Annakhil"];
  const seq = { CL: 0, PR: 0 };
  const clients = [];
  rows.forEach(([name, kind, city, contact, sector, owner], i) => {
    const pre = kind === "client" ? "CL" : "PR";
    const code = `${pre}-${String(++seq[pre]).padStart(5, "0")}`;
    const [la, ln] = towns[city];
    const located = i % 7 !== 6;                      // quelques fiches restent à localiser
    const lat = located ? jitter(la, 0.035) : null, lng = located ? jitter(ln, 0.045) : null;
    const id = `demo-c-${String(i + 1).padStart(3, "0")}`;
    const created = t - (45 - i) * D;
    const tel = `05${20 + (i % 9)} ${String(10 + i).padStart(2, "0")} ${String(30 + ((i * 7) % 60)).padStart(2, "0")} ${String(11 + ((i * 13) % 80)).padStart(2, "0")}`;
    clients.push({ id, owner, lat, lng, kind, name, city });
    st.push(env.DB.prepare(`INSERT INTO clients (id,code,name,kind,contact,phone,email,city,address,sector,ice,notes,lat,lng,geo_acc,geo_at,geo_by,owner_id,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, code, name, kind, contact, tel, null, city, `${10 + i * 3} ${pick(streets)}`, sector,
      kind === "client" ? String(1500000000000 + i * 7919).padStart(15, "0") : null, i % 5 === 0 ? "Client fidèle, préfère être appelé le matin." : null,
      lat, lng, located ? 8 + Math.floor(R() * 20) : null, located ? created : null, located ? owner : null, owner, owner, created, t - i * 60000));
  });
  st.push(env.DB.prepare("INSERT INTO settings (k,v) VALUES ('seq_CL', ?), ('seq_PR', ?)").bind(String(seq.CL), String(seq.PR)));

  const agreed = ["Commande de 40 rouleaux de câble, livraison jeudi", "Devis accepté pour 3 postes de travail", "Renouvellement du contrat annuel", "Commande test de 10 cartons, paiement à 30 jours",
    "Accord pour une démonstration en magasin", "Remise de 5 % accordée sur la prochaine commande", "Mise en place de la PLV la semaine prochaine", "Commande mensuelle confirmée"];
  const notDone = ["Le responsable était absent", "Pas de décision sur les nouveaux produits", "Formation du personnel reportée", "Livraison précédente incomplète à régulariser", "Budget pas encore validé"];
  const demands = ["Catalogue 2027 et liste de prix", "Échantillons de la nouvelle gamme", "Délais de livraison plus courts", "Facture détaillée par magasin", "Rappel la semaine prochaine", "Présentation du module stock"];
  const steps = ["Envoyer le devis", "Relancer pour la commande", "Démonstration produit", "Présenter l'offre annuelle", "Livrer les échantillons"];
  let vn = 0;
  const visit = (c, user, kind, status, date, a, nd, dm, ns, nd2, withGeo) => {
    const id = `demo-v-${String(++vn).padStart(4, "0")}`;
    const lat = withGeo && c.lat ? jitter(c.lat, 0.0004) : null, lng = withGeo && c.lng ? jitter(c.lng, 0.0004) : null;
    st.push(env.DB.prepare(`INSERT INTO visits (id,client_id,user_id,kind,status,date,agreed,not_done,demands,next_step,next_date,lat,lng,geo_acc,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, c.id, user, kind, status, date, a, nd, dm, ns, nd2, lat, lng, lat ? 10 + Math.floor(R() * 15) : null, Math.min(date, t), t - vn * 1000));
  };
  // historique des 30 derniers jours
  clients.forEach((c, i) => {
    const n = c.kind === "client" ? 1 + Math.floor(R() * 3) : Math.floor(R() * 2);
    for (let k = 0; k < n; k++) {
      const day = 2 + Math.floor(R() * 27);
      const date = t - day * D - Math.floor(R() * 8) * H;
      const ok = R() > 0.25;
      visit(c, c.owner, R() > 0.8 ? "appel" : "visite", "done", date, ok ? pick(agreed) : null, R() > 0.5 ? pick(notDone) : null, R() > 0.3 ? pick(demands) : null, null, null, true);
    }
    if (i % 3 === 0) visit(c, c.owner, i % 2 ? "appel" : "rdv", "planned", t + (1 + (i % 9)) * D + (9 + (i % 7)) * H - (t % D), null, null, null, pick(steps), null, false);
  });
  // tournée de Karim : dernier jour ouvré complet, 4 visites dans l'ordre
  const today0 = t - (t % D);
  const tourDay = t - today0 > 17 * H ? today0 : today0 - D;
  [0, 3, 1, 5].forEach((ci, k) => visit(clients[ci], "demo-u-com", "visite", "done", tourDay + [9.5, 11, 14.5, 16.5][k] * H, pick(agreed), k === 2 ? pick(notDone) : null, pick(demands), null, null, true));
  // journal : quelques lignes pour l'exemple
  st.push(env.DB.prepare("INSERT INTO audit (at,user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?), (?,?,?,?,?,?), (?,?,?,?,?,?)")
    .bind(t - 3 * D, "demo-u-dir", "user.create", "user", "demo-u-nad", "Nadia El Fassi (commercial)", t - 2 * D, "demo-u-dir", "export.clients", "export", null, "24 fiche(s)", t - D, "demo-u-com", "client.geo", "client", "demo-c-004", "CL-00003 Garage Atlas Auto"));
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
}
