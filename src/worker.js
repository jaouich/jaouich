// Magiscom CRM — fiches clients, notes vocales et réunions transcrites par l'IA
// Cloudflare Worker + D1 (base de données) + R2 (photos, vidéos, documents)

const ASSETS = __ASSETS__;

const SESSION_DAYS = 60;
const PBKDF2_ITER = 100000;
const MB = 1024 * 1024;
const MAX_SINGLE = 95 * MB;              // un envoi simple (limite Workers : 100 Mo)
const PART_MAX = 95 * MB;
const MAX_BIG = 4096 * MB;               // vidéo longue : 4 Go
const CATEGORIES = ["photo", "video", "document", "devis", "audio"];
const KINDS = ["client", "prospect"];
const VISIT_KINDS = ["visite", "rdv", "appel", "note", "vocal", "reunion", "tache"];
const DEAL_STAGES = ["nouveau", "devis", "negociation", "gagne", "perdu"];
const VISIT_STATUS = ["planned", "done", "cancelled"];
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|js|vbs|ps1|sh|jar|apk|html?|svg)$/i;

export default {
  async fetch(req, env, ctx) {
    try {
      const u = new URL(req.url);
      // démonstration : https://<adresse>/demo (ou une adresse qui commence par « demo. »)
      if (/^\/demo(\/|$)/.test(u.pathname) && env.DEMO_DB && env.DEMO_MEDIA) {
        u.pathname = u.pathname.slice(5) || "/";
        env = u.pathname.startsWith("/api/") ? { ...(await demoEnv(env)), DEMO_PATH: true } : { ...demoEnvOf(env), DEMO_PATH: true };
      } else if (u.pathname.startsWith("/api/") && isDemoHost(u.hostname, env)) env = await demoEnv(env);
      return await route(req, env, ctx, u);
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
async function route(req, env, ctx, url = new URL(req.url)) {
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
  if (p === "/api/clients/import" && m === "POST") return importClients(req, env, me, log);
  if (p === "/api/export/deals.xlsx" && m === "GET") return exportDeals(url, env, me, log);
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
  if ((r = p.match(new RegExp(`^/api/deals/${ID}$`)))) {
    if (m === "PUT") return putDeal(r[1], req, env, me, log);
    if (m === "DELETE") return deleteDeal(r[1], env, me, log);
  }
  if (p === "/api/ai/assistant" && m === "POST") return aiAssistant(req, env, me);
  if (p === "/api/ai/listen" && m === "POST") return aiListen(req, env, me);
  if ((r = p.match(new RegExp(`^/api/ai/brief/${ID}$`))) && m === "POST") return aiBrief(r[1], req, env, me);
  if ((r = p.match(new RegExp(`^/api/ai/followup/${ID}$`))) && m === "POST") return aiFollowup(r[1], req, env, me);
  if ((r = p.match(new RegExp(`^/api/clients/${ID}$`)))) {
    if (m === "PUT") return putClient(r[1], req, env, me, log);
    if (m === "GET") return getClient(r[1], env, me);
    if (m === "DELETE") return deleteClient(r[1], env, me, log);
  }
  if ((r = p.match(new RegExp(`^/api/clients/${ID}/geo$`))) && m === "POST") return setGeo(r[1], req, env, me, log);
  if ((r = p.match(new RegExp(`^/api/ai/process/${ID}$`))) && m === "POST") return aiProcess(r[1], req, env, me, log);
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
const cookieName = (env) => (env.IS_DEMO ? "tr_demo" : "tr_session");
function cookie(env, token, maxAge) { return `${cookieName(env)}=${token}; Path=${env.DEMO_PATH ? "/demo" : "/"}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
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
  return cookie(env, token, SESSION_DAYS * 86400);
}
async function currentUser(req, env) {
  const token = readCookie(req, cookieName(env));
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
  const token = readCookie(req, cookieName(env));
  if (token && /^[0-9a-f]{64}$/.test(token)) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookie(env, "", 0) });
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
  if (b.theme !== undefined) {
    if (!["indigo", "majorelle", "menthe", "ocean", "nuit"].includes(b.theme)) fail(400, "Thème inconnu");
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('theme', ?)").bind(b.theme));
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
  const files = (await env.DB.prepare(`SELECT f.id, f.client_id, f.visit_id, f.user_id, f.name, f.mime, f.size, f.category, f.note, f.seq, f.transcript, f.created_at, f.updated_at, f.deleted_at FROM files f JOIN clients c ON c.id = f.client_id WHERE ${sc.sql} AND f.updated_at > ? ORDER BY f.updated_at LIMIT 20000`).bind(...sc.args, since).all()).results;
  const deals = (await env.DB.prepare(`SELECT d.* FROM deals d JOIN clients c ON c.id = d.client_id WHERE ${sc.sql} AND d.updated_at > ? ORDER BY d.updated_at LIMIT 20000`).bind(...sc.args, since).all()).results;
  const users = (await env.DB.prepare("SELECT id, name, role, active FROM users").all()).results.map((u) => ({ ...u, active: !!u.active }));
  return json({ now: t, full: !since, clients, gone, visits, files, deals, users, me: pubUser(me), settings: await getSettings(env) });
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
const CLIENT_FIELDS = { name: 160, company: 160, contact: 120, phone: 40, phone2: 40, email: 160, website: 300, city: 80, address: 300, sector: 80, ice: 30, notes: 8000 };
async function putClient(id, req, env, me, log) {
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  const b = await readJson(req);
  const old = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  const t = now();
  const f = {};
  for (const [k, max] of Object.entries(CLIENT_FIELDS)) if (b[k] !== undefined) f[k] = k === "name" ? str(b[k], max) : opt(b[k], max);
  if (b.kind !== undefined) f.kind = KINDS.includes(b.kind) ? b.kind : "prospect";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) fail(400, "Adresse e-mail invalide");
  if (f.website) {
    let w = f.website.replace(/\s+/g, "");
    if (!/^https?:\/\//i.test(w)) w = "https://" + w;
    try { const u = new URL(w); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw 0; f.website = u.href.slice(0, 300); } catch { fail(400, "Adresse du site web invalide"); }
  }
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
  for (const k of ["summary", "transcript"]) if (b[k] !== undefined) f[k] = opt(b[k], 100000);
  if (b.lang !== undefined) f.lang = ["fr", "ar", "en"].includes(b.lang) ? b.lang : null;
  if (b.duration !== undefined) f.duration = num(b.duration, 0, 86400);
  if (b.ai_status !== undefined) f.ai_status = b.ai_status === "pending" ? "pending" : null;   // l'appli peut seulement demander un traitement
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
  return mime.startsWith("image/") ? "photo" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
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
  const seq = num(Number(req.headers.get("X-Seq")), 0, 100000);
  await env.DB.prepare("INSERT INTO files (id,client_id,visit_id,user_id,r2_key,name,mime,size,category,note,seq,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, clientId, visitId, me.id, key, name, mime, size, category, opt(cleanName(req.headers.get("X-Note"), ""), 300), seq, Math.min(created, t), t).run();
  await env.DB.prepare("UPDATE clients SET updated_at = ? WHERE id = ?").bind(t, clientId).run();
  await log("file.upload", "file", id, `${category} ${name} (${Math.round(size / 1024)} Ko)`);
  let file = await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  // morceau d'une note vocale ou d'une réunion : transcrit tout de suite (le rapport final sera plus rapide)
  const mode = req.headers.get("X-Transcribe");
  if (category === "audio" && (mode === "vocal" || mode === "reunion") && env.AI) {
    try { file = await transcribeFile(env, file, mode, str(req.headers.get("X-Lang"), 5)); } catch (e) { console.error("transcription", e); }
  }
  return json({ file }, 201);
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
  const { results: pipeline } = await env.DB.prepare("SELECT stage, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount FROM deals WHERE deleted_at IS NULL AND (stage NOT IN ('gagne','perdu') OR closed_at > ?) GROUP BY stage").bind(t - 30 * day).all();
  let ai_usage = null; try { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'ai_usage'").first(); ai_usage = r ? JSON.parse(r.v) : null; } catch {}
  if (ai_usage && ai_usage.d !== new Date().toISOString().slice(0, 10)) ai_usage = { d: new Date().toISOString().slice(0, 10), assistant: 0, stt: 0, llm: 0, prev: { d: ai_usage.d, assistant: ai_usage.assistant || 0, stt: ai_usage.stt || 0, llm: ai_usage.llm || 0 } };
  return json({ totals, per_user: per.map((u) => ({ ...u, active: !!u.active })), daily, cities, pipeline, ai_usage });
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
  const head = ["Code", "Nom", "Type", "Société", "Secteur / activité", "Contact", "GSM", "Téléphone fixe", "E-mail", "Site web", "Ville", "Adresse", "ICE", "Commercial", "Latitude", "Longitude", "Google Maps", "Nb activités", "Dernière activité", "Nb documents", "Créé le", "Remarques"];
  const rows = results.map((c) => [c.code, c.name, c.kind === "client" ? "Client" : "Prospect", c.company, c.sector, c.contact, c.phone, c.phone2, c.email, c.website, c.city, c.address, c.ice, c.owner_name,
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
  const K = { visite: "Visite", rdv: "Rendez-vous", appel: "Appel", note: "Note", vocal: "Note vocale", reunion: "Réunion" }, S = { planned: "Prévu", done: "Fait", cancelled: "Annulé" };
  const head = ["Date", "Type", "Statut", "Code client", "Client", "Ville", "Commercial", "Résumé / note", "Ce qui a été convenu", "Ce qui n'a pas été fait", "Demandes du client", "Prochaine étape", "Prochaine date", "Transcription", "Position"];
  const rows = results.map((v) => [fmtDate(v.date), K[v.kind] || v.kind, S[v.status] || v.status, v.code, v.client_name, v.city, v.user_name, v.summary, v.agreed, v.not_done, v.demands, v.next_step, fmtDate(v.next_date), v.transcript ? String(v.transcript).slice(0, 32000) : "", v.lat != null ? `${v.lat},${v.lng}` : ""]);
  await log("export.visits", "export", null, `${rows.length} ligne(s)`);
  return xlsxResponse("activites", [{ name: "Activités", head, rows }]);
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
  await env.DB.batch(["users", "sessions", "login_attempts", "settings", "clients", "visits", "files", "uploads_mp", "audit", "deals"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await seedDemo(env);
}

function demoRand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

async function seedDemo(env) {
  const t = now(), D = 86400000, H = 3600000;
  const R = demoRand(20261126);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const jitter = (v, amp) => Math.round((v + (R() - 0.5) * amp) * 1e5) / 1e5;
  // empreinte précalculée de « demo2026 » (évite un calcul coûteux à chaque remise à zéro)
  const hash = "vH4SaaGQRufhJLoDiY+iFlClhnNBMeK4bBaEbpkJUDI=", salt = "EBFwUH5l3Y5vOvZLDhQPjg==";
  const other = { hash: toB64(crypto.getRandomValues(new Uint8Array(32))), salt: toB64(crypto.getRandomValues(new Uint8Array(16))) };   // comptes fictifs : connexion impossible
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
    const slug = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "").slice(0, 18);
    const company = name + (i % 3 === 0 ? " SARL" : i % 3 === 1 ? " SARL AU" : "");
    st.push(env.DB.prepare(`INSERT INTO clients (id,code,name,kind,company,website,phone2,contact,phone,email,city,address,sector,ice,notes,lat,lng,geo_acc,geo_at,geo_by,owner_id,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, code, name, kind, company, i % 2 === 0 ? `https://www.${slug}.ma/` : null, `05${22 + (i % 6)} ${String(40 + i).padStart(2, "0")} 10 ${String(20 + i).padStart(2, "0")}`, contact, tel.replace(/^05\d\d/, "06" + (61 + (i % 9))), slug + "@exemple.ma", city, `${10 + i * 3} ${pick(streets)}`, sector,
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
  // exemples IA : une réunion transcrite, une note vocale et une note écrite
  const meetingDay = t - 2 * D - 3 * H;
  st.push(env.DB.prepare(`INSERT INTO visits (id,client_id,user_id,kind,status,date,summary,agreed,not_done,demands,next_step,next_date,transcript,ai_status,lang,duration,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind("demo-v-reunion", "demo-c-001", "demo-u-com", "reunion", "done", meetingDay,
    "Réunion avec M. Tazi pour le renouvellement de l'approvisionnement de la droguerie. Le client est satisfait de la qualité mais trouve les délais de livraison trop longs. Une commande de 40 rouleaux de câble est validée, sous réserve d'une livraison avant jeudi. Il souhaite recevoir le nouveau catalogue avant de commander la peinture.",
    "- Commande de 40 rouleaux de câble 2,5 mm²\n- Livraison avant jeudi\n- Paiement à 30 jours fin de mois",
    "- Pas de décision sur la gamme peinture\n- Remise de 8 % demandée non accordée",
    "- Catalogue peinture 2027\n- Délais de livraison plus courts\n- Facture séparée pour le second magasin",
    "Envoyer le catalogue et le devis peinture", t + 5 * D,
    "Commercial : Bonjour Monsieur Tazi, merci de me recevoir. Je viens faire le point sur vos commandes du trimestre.\nClient : Bonjour. Oui, la qualité est bonne, mais la dernière livraison a pris presque deux semaines.\nCommercial : Je comprends. Pour la prochaine commande, nous pouvons livrer en 48 heures depuis notre dépôt de Mohammedia.\nClient : Dans ce cas je prends 40 rouleaux de câble 2,5, mais il me les faut avant jeudi.\nCommercial : C'est noté, livraison avant jeudi et paiement à 30 jours fin de mois comme d'habitude.\nClient : Pour la peinture j'attends votre nouveau catalogue. Et j'aimerais une facture séparée pour le deuxième magasin.\nCommercial : Je vous envoie le catalogue et un devis peinture cette semaine, et on se revoit mardi prochain.",
    "done", "fr", 612, meetingDay, t - 4000));
  st.push(env.DB.prepare("INSERT INTO visits (id,client_id,user_id,kind,status,date,transcript,ai_status,lang,duration,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("demo-v-vocal", "demo-c-002", "demo-u-com", "vocal", "done", t - D - 5 * H, "Passage à la pharmacie Ennour. Le docteur Bennani veut renouveler le contrat de maintenance mais demande une formation pour sa nouvelle employée. Rappeler lundi pour fixer la date de formation.", "done", "fr", 38, t - D - 5 * H, t - 3000));
  st.push(env.DB.prepare("INSERT INTO visits (id,client_id,user_id,kind,status,date,summary,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("demo-v-note", "demo-c-004", "demo-u-com", "note", "done", t - 3 * D, "Le client compare avec un concurrent : préparer une offre avec remise volume pour 3 postes.", t - 3 * D, t - 2000));
  // affaires (pipeline) et tâches
  const dealRows = [
    ["demo-d-01", "demo-c-001", "demo-u-com", "Câblage 2,5 mm² – commande trimestrielle", 18500, "negociation", 6],
    ["demo-d-02", "demo-c-001", "demo-u-com", "Gamme peinture 2027", 42000, "devis", 20],
    ["demo-d-03", "demo-c-002", "demo-u-com", "Contrat de maintenance annuel", 24000, "gagne", -3],
    ["demo-d-04", "demo-c-004", "demo-u-com", "Équipement 3 postes atelier", 36500, "devis", 12],
    ["demo-d-05", "demo-c-003", "demo-u-com", "Caisse enregistreuse + logiciel", 9800, "nouveau", 30],
    ["demo-d-06", "demo-c-009", "demo-u-you", "Gestion de flotte – 12 véhicules", 64000, "negociation", 9],
    ["demo-d-07", "demo-c-010", "demo-u-you", "Papeterie annuelle", 15200, "perdu", -8],
    ["demo-d-08", "demo-c-015", "demo-u-sal", "Linge hôtelier 120 chambres", 88000, "devis", 25],
    ["demo-d-09", "demo-c-016", "demo-u-sal", "Licences logiciel comptable", 21000, "gagne", -12],
    ["demo-d-10", "demo-c-022", "demo-u-nad", "Présentoirs vitrine", 7400, "nouveau", 40],
  ];
  for (const [id, cid, uid, title, amount, stage, dd] of dealRows)
    st.push(env.DB.prepare("INSERT INTO deals (id,client_id,user_id,title,amount,stage,close_date,closed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, cid, uid, title, amount, stage, t + dd * D, stage === "gagne" || stage === "perdu" ? t + dd * D : null, t - 20 * D, t - Math.abs(dd) * H));
  [["demo-t-1", "demo-c-001", "Envoyer le catalogue peinture et le devis", 1], ["demo-t-2", "demo-c-002", "Fixer la date de formation avec le Dr Bennani", 0], ["demo-t-3", "demo-c-004", "Préparer l'offre remise volume 3 postes", 3]]
    .forEach(([id, cid, txt, dd]) => st.push(env.DB.prepare("INSERT INTO visits (id,client_id,user_id,kind,status,date,summary,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, cid, "demo-u-com", "tache", "planned", t + dd * D + 2 * H, txt, t - D, t - 1000)));
  // journal : quelques lignes pour l'exemple
  st.push(env.DB.prepare("INSERT INTO audit (at,user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?), (?,?,?,?,?,?), (?,?,?,?,?,?)")
    .bind(t - 3 * D, "demo-u-dir", "user.create", "user", "demo-u-nad", "Nadia El Fassi (commercial)", t - 2 * D, "demo-u-dir", "export.clients", "export", null, "24 fiche(s)", t - D, "demo-u-com", "client.geo", "client", "demo-c-004", "CL-00003 Garage Atlas Auto"));
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
}


// ------------------------------------------------------------------ intelligence artificielle (Cloudflare Workers AI)
// 1) Whisper transforme chaque morceau d'audio en texte (français, arabe, ou détection automatique).
// 2) Pour une réunion, un modèle de langage sépare les répliques « Commercial » / « Client »
//    puis rédige le compte-rendu structuré (résumé, accords, points en suspens, demandes, prochaine étape).
const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Magi : modèle léger (≈ 6 fois moins cher, donc bien plus de questions dans la part gratuite) ; Llama 70B en secours
const ASSIST_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
// texte renvoyé par Workers AI, quel que soit le format du modèle
function aiText(r) {
  if (r == null) return "";
  if (typeof r === "string") return r.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (r.response !== undefined) return typeof r.response === "string" ? aiText(r.response) : r.response;
  const c = r.choices && r.choices[0] && r.choices[0].message;
  if (c) return aiText(c.content || "");
  return r;
}
// limite gratuite du jour atteinte → message clair
function aiFailMsg(e) {
  const m = String((e && e.message) || e || "");
  if (/4006|daily free allocation|neurons|quota|429/i.test(m)) return "La limite gratuite d'intelligence artificielle du jour est atteinte. Elle se renouvelle chaque nuit à minuit (GMT).";
  return null;
}
// compteur d'utilisation du jour (pour savoir quand passer à l'offre payante)
async function aiCount(env, kind) {
  try {
    const d = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'ai_usage'").first();
    let u = {}; try { u = JSON.parse(row ? row.v : "{}"); } catch {}
    if (u.d !== d) u = { d, assistant: 0, stt: 0, llm: 0, prev: u.d ? { d: u.d, assistant: u.assistant || 0, stt: u.stt || 0, llm: u.llm || 0 } : null };
    u[kind] = (u[kind] || 0) + 1;
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('ai_usage', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(u)).run();
  } catch (e) {}
}
const AUDIO_AI_MAX = 24 * MB;
const LANG_NAMES = { fr: "français", ar: "arabe", en: "anglais" };

function bytesToB64(u8) {
  if (globalThis.Buffer) return globalThis.Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
async function speechToText(env, u8, lang) {
  const input = { audio: bytesToB64(u8), task: "transcribe", vad_filter: true, condition_on_previous_text: false };
  if (lang === "fr" || lang === "ar") input.language = lang;
  if (lang === "fr") input.initial_prompt = "Échange commercial entre un commercial et un client : devis, commande, livraison, prix.";
  const r = await env.AI.run(STT_MODEL, input);
  await aiCount(env, "stt");
  const segments = (r.segments || []).map((x) => String(x.text || "").trim()).filter(Boolean);
  return { text: String(r.text || "").trim(), segments };
}
function parseJsonLoose(v) {
  v = aiText(v);
  if (v && typeof v === "object") return v;
  const t = String(v || "");
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
async function llmJson(env, system, user, schema, maxTokens = 2048) {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  let r;
  try { r = await env.AI.run(LLM_MODEL, { messages, response_format: { type: "json_schema", json_schema: schema }, max_tokens: maxTokens, temperature: 0.2 }); }
  catch (e) { r = await env.AI.run(LLM_MODEL, { messages: [{ role: "system", content: system + "\nRéponds uniquement avec un objet JSON valide." }, messages[1]], max_tokens: maxTokens, temperature: 0.2 }); }
  await aiCount(env, "llm");
  const out = parseJsonLoose(r && (r.response !== undefined ? r.response : r));
  if (!out) throw new Error("Réponse de l'IA illisible");
  return out;
}
async function splitSpeakers(env, segments, company) {
  const schema = { type: "object", properties: { lines: { type: "array", items: { type: "object", properties: { s: { type: "string", enum: ["Commercial", "Client"] }, t: { type: "string" } }, required: ["s", "t"] } } }, required: ["lines"] };
  const system = `Tu reçois la transcription brute d'un extrait de réunion entre un commercial de la société « ${company} » et un client (ou prospect).
Regroupe le texte en répliques et attribue chaque réplique à "Commercial" ou "Client", d'après le sens (celui qui présente l'offre, les prix, les délais est le commercial ; celui qui exprime ses besoins, ses objections, ses demandes est le client).
Ne résume pas, ne traduis pas, ne corrige pas le sens : recopie les mots dans la langue d'origine. Fusionne les morceaux consécutifs d'une même personne.`;
  const out = await llmJson(env, system, segments.map((x, i) => `${i + 1}. ${x}`).join("\n"), schema, 4000);
  const lines = (out.lines || []).filter((l) => l && l.t).map((l) => ({ s: l.s === "Client" ? "Client" : "Commercial", t: String(l.t).trim().slice(0, 4000) }));
  if (!lines.length) throw new Error("Répliques vides");
  return lines;
}
async function transcribeFile(env, file, mode, lang) {
  if (file.size > AUDIO_AI_MAX) throw new HttpError(413, "Enregistrement trop long pour la transcription (24 Mo par morceau)");
  const obj = await env.MEDIA.get(file.r2_key);
  if (!obj) throw new HttpError(404, "Audio introuvable");
  const u8 = new Uint8Array(await new Response(obj.body).arrayBuffer());
  const stt = await speechToText(env, u8, lang);
  let dialogue = null;
  if (mode === "reunion" && stt.text) {
    const s = await getSettings(env);
    try { dialogue = JSON.stringify(await splitSpeakers(env, stt.segments.length ? stt.segments : [stt.text], s.company)); }
    catch (e) { console.error("répliques", e); }
  }
  const t = now();
  await env.DB.prepare("UPDATE files SET transcript = ?, dialogue = ?, updated_at = ? WHERE id = ?").bind(stt.text || "", dialogue, t, file.id).run();
  return env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(file.id).first();
}
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
async function meetingReport(env, client, transcript, lang, company) {
  const schema = { type: "object", properties: {
    resume: { type: "string" }, convenu: { type: "string" }, non_fait: { type: "string" }, demandes: { type: "string" },
    prochaine_etape: { type: "string" }, prochaine_date: { type: "string" } }, required: ["resume", "convenu", "non_fait", "demandes", "prochaine_etape", "prochaine_date"] };
  const system = `Tu es l'assistant commercial de la société « ${company} ». À partir de la transcription d'une réunion avec le client « ${client.name} »${client.company ? ` (société ${client.company})` : ""}, rédige un compte-rendu clair et fidèle, en ${LANG_NAMES[lang] || "français"}.
Champs attendus :
- resume : résumé de la réunion en 3 à 6 phrases ;
- convenu : ce qui a été convenu ou décidé (liste à tirets, une ligne par point) ;
- non_fait : ce qui n'a pas été fait, reste en suspens ou a été refusé (liste à tirets) ;
- demandes : les demandes et besoins exprimés par le client (liste à tirets) ;
- prochaine_etape : la prochaine action à faire, en une phrase ;
- prochaine_date : la date du prochain rendez-vous ou de la relance au format AAAA-MM-JJ si elle a été fixée, sinon une chaîne vide.
N'invente rien : si un champ n'a pas d'information, mets une chaîne vide. Aujourd'hui nous sommes le ${isoDay(now())}.`;
  return llmJson(env, system, transcript.slice(0, 60000), schema, 2000);
}
async function aiProcess(id, req, env, me, log) {
  const b = await readJson(req);
  const v = await env.DB.prepare("SELECT * FROM visits WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!v) fail(404, "Activité introuvable");
  const c = await loadClient(env, v.client_id, me);
  if (!(me.p.admin || v.user_id === me.id || (me.p.edit_all && canSee(me, c)))) fail(403, "Seul l'auteur peut lancer l'analyse");
  if (!env.AI) fail(503, "Le service d'intelligence artificielle n'est pas activé");
  const lang = ["fr", "ar", "en"].includes(b.lang) ? b.lang : v.lang || "fr";
  const mode = v.kind === "reunion" ? "reunion" : "vocal";
  const t0 = now();
  const done = async (fields) => {
    const keys = Object.keys(fields);
    await env.DB.prepare(`UPDATE visits SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(fields), now(), id).run();
    return json({ visit: await env.DB.prepare("SELECT * FROM visits WHERE id = ?").bind(id).first() });
  };
  try {
    const { results: audios } = await env.DB.prepare("SELECT * FROM files WHERE visit_id = ? AND category = 'audio' AND deleted_at IS NULL ORDER BY COALESCE(seq, 0), created_at").bind(id).all();
    if (!audios.length) fail(400, "Aucun enregistrement à analyser");
    for (let i = 0; i < audios.length; i++) {
      const f = audios[i];
      if (f.transcript == null || (mode === "reunion" && f.transcript && !f.dialogue && b.force)) audios[i] = await transcribeFile(env, f, mode, v.lang || "");
    }
    const plain = audios.map((f) => f.transcript || "").filter(Boolean).join("\n").trim();
    if (!plain) return done({ ai_status: "done", ai_error: "Aucune parole reconnue dans l'enregistrement", transcript: "" });
    if (mode === "vocal") {
      await log("ai.transcribe", "visit", id, `${c.code} ${c.name}`);
      return done({ ai_status: "done", ai_error: null, transcript: plain });
    }
    // réunion : texte avec les intervenants, puis compte-rendu
    const lines = [];
    for (const f of audios) {
      let d = null; try { d = f.dialogue ? JSON.parse(f.dialogue) : null; } catch {}
      if (d && d.length) lines.push(...d); else if (f.transcript) lines.push({ s: "?", t: f.transcript });
    }
    const merged = [];
    for (const l of lines) { const last = merged[merged.length - 1]; if (last && last.s === l.s) last.t += " " + l.t; else merged.push({ ...l }); }
    const transcript = merged.map((l) => `${l.s === "?" ? "—" : l.s} : ${l.t}`).join("\n");
    const s = await getSettings(env);
    const rep = await meetingReport(env, c, transcript, lang, s.company);
    const fields = { ai_status: "done", ai_error: null, transcript, summary: opt(rep.resume, 6000), agreed: opt(rep.convenu, 6000), not_done: opt(rep.non_fait, 6000), demands: opt(rep.demandes, 6000), next_step: opt(rep.prochaine_etape, 600) };
    const nd = /^\d{4}-\d{2}-\d{2}$/.test(rep.prochaine_date || "") ? Date.parse(rep.prochaine_date + "T10:00:00Z") : NaN;
    if (nd > t0) {
      fields.next_date = nd;
      const rid = id.slice(0, 36) + "-r";
      if (!(await env.DB.prepare("SELECT 1 FROM visits WHERE id = ?").bind(rid).first())) {
        await env.DB.prepare("INSERT INTO visits (id,client_id,user_id,kind,status,date,next_step,created_at,updated_at) VALUES (?,?,?,'rdv','planned',?,?,?,?)").bind(rid, v.client_id, v.user_id, nd, fields.next_step, now(), now()).run();
      }
    }
    await log("ai.meeting", "visit", id, `${c.code} ${c.name} · ${merged.length} répliques`);
    return done(fields);
  } catch (e) {
    if (e instanceof HttpError && e.status < 500 && e.status !== 413) throw e;
    console.error("ia", e);
    return done({ ai_status: "error", ai_error: (aiFailMsg(e) || String(e.message || e)).slice(0, 300) });
  }
}


// ------------------------------------------------------------------ affaires (pipeline)
async function putDeal(id, req, env, me, log) {
  if (!/^[0-9a-zA-Z-]{8,40}$/.test(id)) fail(400, "Identifiant invalide");
  const b = await readJson(req);
  const old = await env.DB.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
  const t = now();
  const f = {};
  if (b.title !== undefined) { f.title = str(b.title, 160); if (f.title.length < 2) fail(400, "Indiquez l'objet de l'affaire"); }
  if (b.amount !== undefined) f.amount = b.amount === null || b.amount === "" ? null : num(Number(b.amount), 0, 1e12);
  if (b.stage !== undefined) f.stage = DEAL_STAGES.includes(b.stage) ? b.stage : "nouveau";
  if (b.close_date !== undefined) f.close_date = b.close_date ? tstamp(b.close_date) : null;
  if (b.notes !== undefined) f.notes = opt(b.notes, 4000);
  if (!old) {
    const c = await loadClient(env, str(b.client_id, 40), me);
    if (!f.title) fail(400, "Indiquez l'objet de l'affaire");
    f.stage = f.stage || "nouveau";
    if (f.stage === "gagne" || f.stage === "perdu") f.closed_at = t;
    const cols = ["id", "client_id", "user_id", "created_at", "updated_at", ...Object.keys(f)];
    await env.DB.prepare(`INSERT INTO deals (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, c.id, me.id, tstamp(b.created_at) && b.created_at < t ? b.created_at : t, t, ...Object.values(f)).run();
    // une affaire gagnée transforme le prospect en client
    if (f.stage === "gagne" && c.kind === "prospect") await env.DB.prepare("UPDATE clients SET kind = 'client', updated_at = ? WHERE id = ?").bind(t, c.id).run();
    await log("deal.create", "deal", id, `${c.code} ${c.name} · ${f.title}`);
  } else {
    if (old.deleted_at) fail(410, "Cette affaire a été supprimée");
    const c = await loadClient(env, old.client_id, me);
    if (!(me.p.admin || old.user_id === me.id || canEdit(me, c))) fail(403, "Cette affaire est suivie par un autre commercial");
    if (f.stage && f.stage !== old.stage) {
      f.closed_at = f.stage === "gagne" || f.stage === "perdu" ? t : null;
      if (f.stage === "gagne" && c.kind === "prospect") await env.DB.prepare("UPDATE clients SET kind = 'client', updated_at = ? WHERE id = ?").bind(t, c.id).run();
    }
    const keys = Object.keys(f);
    if (keys.length) await env.DB.prepare(`UPDATE deals SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(f), t, id).run();
    await log(f.stage && f.stage !== old.stage ? "deal.stage" : "deal.update", "deal", id, `${c.code} ${c.name} · ${f.title || old.title}${f.stage && f.stage !== old.stage ? " → " + f.stage : ""}`);
  }
  return json({ deal: await env.DB.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first() }, old ? 200 : 201);
}
async function deleteDeal(id, env, me, log) {
  const d = await env.DB.prepare("SELECT * FROM deals WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!d) fail(404, "Affaire introuvable");
  if (!(me.p.admin || d.user_id === me.id)) fail(403, "Seul l'auteur ou la direction peut supprimer cette affaire");
  const t = now();
  await env.DB.prepare("UPDATE deals SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(t, t, id).run();
  await log("deal.delete", "deal", id, d.title);
  return json({ ok: true });
}
async function exportDeals(url, env, me, log) {
  if (!me.p.export) fail(403, "Vous n'avez pas le droit d'exporter");
  const sc = scopeSql(me);
  const { results } = await env.DB.prepare(`SELECT d.*, c.code, c.name AS client_name, c.city, u.name AS user_name FROM deals d JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.user_id
    WHERE ${sc.sql} AND d.deleted_at IS NULL ORDER BY d.stage, d.close_date`).bind(...sc.args).all();
  const L = { nouveau: "Nouveau", devis: "Devis envoyé", negociation: "Négociation", gagne: "Gagné", perdu: "Perdu" };
  const head = ["Affaire", "Étape", "Montant (MAD)", "Signature prévue", "Code client", "Client", "Ville", "Commercial", "Créée le", "Clôturée le", "Notes"];
  const rows = results.map((d) => [d.title, L[d.stage] || d.stage, d.amount, fmtDate(d.close_date), d.code, d.client_name, d.city, d.user_name, fmtDate(d.created_at), fmtDate(d.closed_at), d.notes]);
  await log("export.deals", "export", null, `${rows.length} ligne(s)`);
  return xlsxResponse("affaires", [{ name: "Affaires", head, rows }]);
}

// ------------------------------------------------------------------ import de clients (Excel / CSV exporté de Sage, EBP…)
async function importClients(req, env, me, log) {
  // la direction et les commerciaux importent ; un commercial importe toujours dans son propre portefeuille
  const b = await readJson(req, 2 * MB);
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
  if (!rows.length) fail(400, "Aucune ligne à importer");
  const owner = me.p.admin && b.owner_id ? await activeUserId(env, b.owner_id) : null;
  const t = now();
  let created = 0, updated = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      const f = {};
      for (const [k, max] of Object.entries(CLIENT_FIELDS)) if (r[k] != null && String(r[k]).trim()) f[k] = k === "name" ? str(r[k], max) : opt(String(r[k]), max);
      if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) delete f.email;
      if (f.website) { let w = f.website.replace(/\s+/g, ""); if (!/^https?:\/\//i.test(w)) w = "https://" + w; try { f.website = new URL(w).href.slice(0, 300); } catch { delete f.website; } }
      const kind = r.kind === "client" || r.kind === "prospect" ? r.kind : b.kind === "client" ? "client" : "prospect";
      let code = r.code ? String(r.code).trim().toUpperCase().replace(/\s+/g, "").slice(0, 30) : null;
      if (code && !/^[A-Z0-9][A-Z0-9_.\-\/]{0,29}$/.test(code)) code = null;
      const ex = code ? await env.DB.prepare("SELECT id, owner_id, created_by FROM clients WHERE code = ? AND deleted_at IS NULL").bind(code).first() : null;
      if (ex) {
        const canEdit = me.p.admin || ex.owner_id === me.id || (!ex.owner_id && ex.created_by === me.id) || (me.p.edit_all && me.p.all);
        if (!canEdit) { errors.push({ line: i + 1, error: `Code ${code} déjà utilisé par une fiche que vous ne pouvez pas modifier` }); continue; }
        const keys = Object.keys(f);
        if (keys.length) await env.DB.prepare(`UPDATE clients SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(f), t, ex.id).run();
        updated++;
        continue;
      }
      if (!f.name || f.name.length < 2) { errors.push({ line: i + 1, error: "Nom manquant" }); continue; }
      if (!code || (await env.DB.prepare("SELECT 1 FROM clients WHERE code = ?").bind(code).first())) code = await nextCode(env, kind);
      const id = crypto.randomUUID();
      const cols = ["id", "code", "kind", "owner_id", "created_by", "created_at", "updated_at", ...Object.keys(f)];
      await env.DB.prepare(`INSERT INTO clients (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, code, kind, owner || me.id, me.id, t, t, ...Object.values(f)).run();
      created++;
    } catch (e) { errors.push({ line: i + 1, error: e.message || "Erreur" }); }
  }
  await log("client.import", "client", null, `${created} créé(s), ${updated} mis à jour`);
  return json({ created, updated, errors: errors.slice(0, 50) });
}

// ------------------------------------------------------------------ IA : préparer une visite, rédiger un message de suivi
function activityDigest(visits, max = 9000) {
  const K = { visite: "Visite", rdv: "Rendez-vous", appel: "Appel", note: "Note", vocal: "Note vocale", reunion: "Réunion", tache: "Tâche" };
  let out = "";
  for (const v of visits) {
    const parts = [v.summary, v.agreed && "Convenu : " + v.agreed, v.not_done && "Non fait : " + v.not_done, v.demands && "Demandes : " + v.demands, v.next_step && "Prochaine étape : " + v.next_step,
      !v.summary && v.transcript ? "Transcription : " + String(v.transcript).slice(0, 1200) : null].filter(Boolean).join("\n");
    const line = `## ${fmtDate(v.date)} · ${K[v.kind] || v.kind}${v.status === "planned" ? " (prévu)" : ""}\n${parts || "(sans détail)"}\n`;
    if (out.length + line.length > max) break;
    out += line;
  }
  return out;
}
async function aiBrief(clientId, req, env, me) {
  if (!env.AI) fail(503, "Le service d'intelligence artificielle n'est pas activé");
  const b = await readJson(req);
  const lang = ["fr", "ar", "en"].includes(b.lang) ? b.lang : "fr";
  const c = await loadClient(env, clientId, me);
  const { results: visits } = await env.DB.prepare("SELECT * FROM visits WHERE client_id = ? AND deleted_at IS NULL ORDER BY date DESC LIMIT 25").bind(c.id).all();
  const { results: deals } = await env.DB.prepare("SELECT * FROM deals WHERE client_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10").bind(c.id).all();
  const s = await getSettings(env);
  const fiche = [`Client : ${c.name}`, c.company && `Société : ${c.company}`, c.sector && `Activité : ${c.sector}`, c.city && `Ville : ${c.city}`, `Type : ${c.kind}`, c.notes && `Remarques : ${c.notes}`].filter(Boolean).join("\n");
  const aff = deals.map((d) => `- ${d.title} · ${d.stage}${d.amount ? " · " + d.amount + " MAD" : ""}${d.close_date ? " · signature prévue " + fmtDate(d.close_date).slice(0, 10) : ""}`).join("\n");
  const schema = { type: "object", properties: { resume: { type: "string" }, a_savoir: { type: "array", items: { type: "string" } }, en_attente: { type: "array", items: { type: "string" } }, a_proposer: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } } }, required: ["resume", "a_savoir", "en_attente", "a_proposer", "questions"] };
  const system = `Tu es l'assistant d'un commercial de la société « ${s.company} ». Il va rencontrer ce client. À partir de la fiche, des affaires en cours et de l'historique des échanges, prépare une fiche de visite courte et concrète, en ${LANG_NAMES[lang]}.
- resume : la situation du client en 2 à 4 phrases ;
- a_savoir : les faits importants à garder en tête (préférences, problèmes passés, contacts) ;
- en_attente : les demandes du client et les promesses faites qui ne sont pas encore réglées ;
- a_proposer : ce que le commercial peut proposer ou faire avancer pendant la visite ;
- questions : 2 à 4 questions utiles à poser.
N'invente rien : appuie-toi uniquement sur les informations fournies. Listes de 0 à 5 éléments, phrases courtes. Aujourd'hui : ${isoDay(now())}.`;
  const user = `${fiche}\n\nAffaires :\n${aff || "(aucune)"}\n\nHistorique (du plus récent au plus ancien) :\n${activityDigest(visits) || "(aucun échange enregistré)"}`;
  try { return json({ brief: await llmJson(env, system, user, schema, 1500) }); }
  catch (e) { console.error("brief", e); if (aiFailMsg(e)) fail(429, aiFailMsg(e)); fail(502, "L'assistant n'a pas pu préparer la visite, réessayez"); }
}
async function aiFollowup(visitId, req, env, me) {
  if (!env.AI) fail(503, "Le service d'intelligence artificielle n'est pas activé");
  const b = await readJson(req);
  const lang = ["fr", "ar", "en"].includes(b.lang) ? b.lang : "fr";
  const channel = b.channel === "email" ? "email" : "whatsapp";
  const v = await env.DB.prepare("SELECT * FROM visits WHERE id = ? AND deleted_at IS NULL").bind(visitId).first();
  if (!v) fail(404, "Activité introuvable");
  const c = await loadClient(env, v.client_id, me);
  const s = await getSettings(env);
  const schema = { type: "object", properties: { objet: { type: "string" }, message: { type: "string" } }, required: ["objet", "message"] };
  const system = `Tu rédiges, pour un commercial de la société « ${s.company} », le message de suivi à envoyer au client « ${c.contact || c.name} »${c.company ? ` (${c.company})` : ""} après l'échange décrit ci-dessous.
Canal : ${channel === "email" ? "e-mail professionnel (objet + corps, formule de politesse, signature « " + me.name + " – " + s.company + " »)" : "message WhatsApp : court, cordial, 3 à 6 lignes, sans objet, signé « " + me.name + " »"}.
Langue : ${LANG_NAMES[lang]}. Remercie, récapitule ce qui a été convenu, rappelle la prochaine étape et la date si elles existent. N'invente ni prix ni engagement absent du compte-rendu.`;
  const user = activityDigest([v], 12000);
  try { const out = await llmJson(env, system, user, schema, 900); return json({ subject: String(out.objet || "").slice(0, 200), message: String(out.message || "").slice(0, 4000), channel, phone: c.phone || c.phone2 || "", email: c.email || "" }); }
  catch (e) { console.error("suivi", e); if (aiFailMsg(e)) fail(429, aiFailMsg(e)); fail(502, "L'assistant n'a pas pu rédiger le message, réessayez"); }
}

// ------------------------------------------------------------------ assistant « Magi » : on écrit ou on parle, il agit
const ASSIST_PAGES = ["clients", "pipeline", "agenda", "map", "me", "new_client", "dashboard", "team", "export", "journal", "settings"];
const ASSIST_ACTIONS = ["none", "guide", "open_page", "search", "show_clients", "open_client", "open_activity", "create_activity", "complete_activity", "reschedule", "update_client", "create_client", "create_deal", "deal_stage", "voice_note", "meeting", "brief", "followup", "call", "whatsapp", "email", "directions"];
const ASSIST_EDIT = ["contact", "phone", "phone2", "email", "website", "city", "address", "company", "sector", "notes"];
// mode d'emploi de l'application, pour que Magi sache expliquer et guider
const APP_GUIDE = `MODE D'EMPLOI DE MAGISCOM CRM (pour expliquer et guider ; page = écran à proposer) :
- Clients (page clients) : liste, recherche, filtres client/prospect et ville. « + Nouveau » (page new_client) crée une fiche ; doublon signalé. Bouton « Importer » (icône Excel, à côté de la recherche) : tout le monde peut importer ses clients depuis un fichier Excel (.xlsx) ou CSV, des milliers de lignes ; un commercial importe dans son propre portefeuille, la direction choisit le commercial.
- Fiche client : code auto, nom, société, secteur, GSM, fixe, e-mail, site web, adresse, remarques ; boutons Appeler, WhatsApp, Itinéraire, Modifier ; « Mettre à jour la position » enregistre le GPS ; onglets Infos, Activité, Affaires, Documents.
- Documents (onglet de la fiche) : Photo, Vidéo (jusqu'à 4 Go), Fichier (PDF, Excel, Word…) ; plusieurs fichiers à la fois ; marche hors ligne.
- Bouton « Enregistrer » (micro au centre en bas) : Note vocale (10 min, l'IA écrit le texte) ou Réunion IA (2 h, accord du client obligatoire ; l'IA sépare commercial/client et fait le compte-rendu : résumé, convenu, non fait, demandes, prochaine étape → RDV ajouté à l'agenda).
- « Préparer la visite » (fiche) : résumé IA avant un RDV. « Message de suivi » (après une réunion) : WhatsApp ou e-mail prêt.
- Affaires : onglet Affaires de la fiche ou page pipeline ; étapes nouveau → devis → négociation → gagné / perdu ; gagné = le prospect devient client.
- Agenda (page agenda) : tâches à cocher, RDV du jour et à venir, « Faire le compte-rendu » après un RDV.
- Carte (page map) : clients localisés.
- Moi (page me) : thème de couleurs, langue, mot de passe, synchronisation, déconnexion (attention : la déconnexion efface les données du téléphone).
- Hors ligne : tout s'enregistre sur le téléphone et part au retour du réseau (point vert « À jour »). L'IA (Magi, transcription, rapports) a besoin d'internet.
- Direction seulement : tableau de bord (dashboard), commerciaux et droits (team : ajouter, mot de passe provisoire, transférer le portefeuille, désactiver), export Excel (export) et import en choisissant le commercial, journal (journal), réglages (settings : société, préfixes des codes, thème).
- Première connexion : identifiant donné par la direction, puis choisir son mot de passe. Mot de passe oublié : la direction en génère un nouveau.`;
const ASSIST_KINDS = ["rdv", "appel", "tache", "note", "visite"];
const normTxt = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9؀-ۿ ]/g, " ");
const dayStr = (ms, tz) => new Date(ms - tz * 60000).toISOString().slice(0, 16).replace("T", " ");

async function aiListen(req, env, me) {
  if (!env.AI) fail(503, "Le service d'intelligence artificielle n'est pas activé");
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > 8 * MB) fail(413, "Message vocal trop long");
  const u8 = new Uint8Array(await req.arrayBuffer());
  if (!u8.length) fail(400, "Audio vide");
  if (u8.length > 8 * MB) fail(413, "Message vocal trop long");
  const l = req.headers.get("X-Lang");
  try { const r = await speechToText(env, u8, l === "ar" || l === "fr" ? l : ""); return json({ text: r.text }); }
  catch (e) { console.error("écoute", e); if (aiFailMsg(e)) fail(429, aiFailMsg(e)); fail(502, "Je n'ai pas pu comprendre l'audio, réessayez"); }
}

async function assistantContext(env, me, query, tz, focusId) {
  const t = now();
  const sc = scopeSql(me);
  const clients = (await env.DB.prepare(`SELECT c.id, c.code, c.name, c.company, c.contact, c.city, c.address, c.kind, c.sector, c.phone, c.phone2, c.email, c.website, c.notes, c.lat, c.owner_id, c.updated_at,
      (SELECT MAX(v.date) FROM visits v WHERE v.client_id = c.id AND v.deleted_at IS NULL AND v.status = 'done') AS last_done,
      (SELECT MIN(v.date) FROM visits v WHERE v.client_id = c.id AND v.deleted_at IS NULL AND v.status = 'planned' AND v.date >= ?) AS next_planned
    FROM clients c WHERE c.deleted_at IS NULL AND ${sc.sql} ORDER BY c.updated_at DESC LIMIT 3000`).bind(t - 86400000, ...sc.args).all()).results;
  // si le portefeuille est grand, on garde d'abord les fiches qui ressemblent à la demande
  const words = normTxt(query).split(/\s+/).filter((w) => w.length > 2);
  const score = (c) => { const hay = normTxt([c.name, c.company, c.city, c.code, c.sector, c.phone].join(" ")); return words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0); };
  let shown = clients;
  if (clients.length > 140) {
    const ranked = clients.map((c, i) => ({ c, s: score(c) + (c.id === focusId ? 99 : 0), i })).sort((a, b) => b.s - a.s || a.i - b.i);
    shown = ranked.slice(0, 140).map((x) => x.c);
  }
  const focus = focusId ? clients.find((c) => c.id === focusId) : null;
  const users = (await env.DB.prepare("SELECT id, name, role FROM users WHERE active = 1").all()).results;
  const uname = new Map(users.map((u) => [u.id, u.name]));
  const fmtD = (ms) => (ms ? dayStr(ms, tz).slice(0, 10) : "-");
  const refs = new Map();   // références courtes « C12 » / « D3 » : bien plus fiables à recopier pour le modèle qu'un identifiant long
  shown.forEach((c, i) => refs.set("C" + (i + 1), c.id));
  const refOf = new Map(shown.map((c, i) => [c.id, "C" + (i + 1)]));
  const cl = shown.map((c, i) => ["C" + (i + 1), c.code, c.name, c.company && c.company !== c.name ? c.company : "", c.contact ? "contact " + c.contact : "", c.city || "", c.kind, c.sector || "", c.phone || c.phone2 ? "tél" : "", c.email ? "mail" : "", c.lat != null ? "gps" : "", "dernier:" + fmtD(c.last_done), "prochain:" + fmtD(c.next_planned), me.p.all ? "suivi:" + (uname.get(c.owner_id) || "-") : ""].filter((x) => x !== "").join(" | ")).join("\n");
  const byCity = {}; let nClients = 0, nProspects = 0, sleeping = 0;
  for (const c of clients) { byCity[c.city || "?"] = (byCity[c.city || "?"] || 0) + 1; if (c.kind === "prospect") nProspects++; else nClients++; if (!c.last_done || c.last_done < t - 30 * 86400000) sleeping++; }
  // activités : à venir / en retard (avec références A1, A2…) et dernières faites
  const snip = (v, n) => String(v.summary || v.agreed || v.next_step || v.transcript || v.demands || "").replace(/\s+/g, " ").slice(0, n);
  const planned = (await env.DB.prepare(`SELECT v.id, v.client_id, v.kind, v.date, v.summary, v.next_step, v.agreed, v.transcript, v.demands, v.status, c.name AS cname, v.user_id FROM visits v JOIN clients c ON c.id = v.client_id
    WHERE v.deleted_at IS NULL AND c.deleted_at IS NULL AND ${sc.sql} AND v.status = 'planned' AND v.date BETWEEN ? AND ? ORDER BY v.date LIMIT 50`).bind(...sc.args, t - 60 * 86400000, t + 30 * 86400000).all()).results;
  const recent = (await env.DB.prepare(`SELECT v.id, v.client_id, v.kind, v.date, v.summary, v.next_step, v.agreed, v.transcript, v.demands, v.status, c.name AS cname, v.user_id FROM visits v JOIN clients c ON c.id = v.client_id
    WHERE v.deleted_at IS NULL AND c.deleted_at IS NULL AND ${sc.sql} AND v.status = 'done' ORDER BY v.date DESC LIMIT 30`).bind(...sc.args).all()).results;
  const acts = new Map(); let an = 0;
  const actLine = (v) => { const r = "A" + (++an); refs.set(r, v.id); acts.set(v.id, v); return `${r} | ${dayStr(v.date, tz)} | ${v.kind}${v.status === "planned" && v.date < t ? " (EN RETARD)" : ""} | ${v.cname}${refOf.has(v.client_id) ? " (" + refOf.get(v.client_id) + ")" : ""}${snip(v, 90) ? " | " + snip(v, 90) : ""}${me.p.all ? " | " + (uname.get(v.user_id) || "") : ""}`; };
  const ag = planned.map(actLine).join("\n");
  const done = recent.map(actLine).join("\n");
  const deals = (await env.DB.prepare(`SELECT d.id, d.title, d.amount, d.stage, d.close_date, c.name AS cname FROM deals d JOIN clients c ON c.id = d.client_id
    WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL AND ${sc.sql} ORDER BY (d.stage IN ('gagne','perdu')), d.updated_at DESC LIMIT 60`).bind(...sc.args).all()).results;
  deals.forEach((d, i) => refs.set("D" + (i + 1), d.id));
  const dl = deals.map((d, i) => `D${i + 1} | ${d.title} | ${d.cname} | ${d.stage}${d.amount ? " | " + d.amount + " MAD" : ""}${d.close_date ? " | signature " + fmtD(d.close_date) : ""}`).join("\n");
  const team = me.p.admin ? (await env.DB.prepare(`SELECT u.name, u.role, u.last_seen,
      (SELECT COUNT(*) FROM clients c WHERE c.owner_id = u.id AND c.deleted_at IS NULL) AS nc,
      (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.deleted_at IS NULL AND v.status = 'done' AND v.date > ?) AS n7,
      (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.deleted_at IS NULL AND v.status = 'done' AND v.date > ?) AS n30,
      (SELECT COUNT(*) FROM deals d WHERE d.user_id = u.id AND d.deleted_at IS NULL AND d.stage = 'gagne' AND d.closed_at > ?) AS won30
    FROM users u WHERE u.active = 1`).bind(t - 7 * 86400000, t - 30 * 86400000, t - 30 * 86400000).all()).results.map((u) => `${u.name} (${u.role === "admin" ? "direction" : "commercial"}) : ${u.nc} fiches, ${u.n7} activités faites sur 7 jours, ${u.n30} sur 30 jours, ${u.won30} affaires gagnées sur 30 jours, vu ${u.last_seen ? dayStr(u.last_seen, tz).slice(0, 10) : "jamais"}`).join("\n") : "";
  // fiche ouverte à l'écran : tous les détails
  let focusTxt = "";
  if (focus) {
    const fa = (await env.DB.prepare("SELECT kind, date, status, summary, agreed, not_done, demands, next_step, transcript FROM visits WHERE client_id = ? AND deleted_at IS NULL ORDER BY date DESC LIMIT 10").bind(focus.id).all()).results;
    const nf = await env.DB.prepare("SELECT COUNT(*) n FROM files WHERE client_id = ? AND deleted_at IS NULL").bind(focus.id).first();
    focusTxt = `FICHE OUVERTE À L'ÉCRAN (« ce client », « lui », « هاد الزبون ») : ${refOf.get(focus.id) || ""} ${focus.code} ${focus.name} (${focus.kind})
Société : ${focus.company || "-"} · Contact : ${focus.contact || "-"} · Secteur : ${focus.sector || "-"} · GSM : ${focus.phone || "-"} · Fixe : ${focus.phone2 || "-"} · E-mail : ${focus.email || "-"} · Site : ${focus.website || "-"}
Ville : ${focus.city || "-"} · Adresse : ${focus.address || "-"} · GPS : ${focus.lat != null ? "oui" : "non"} · Documents : ${nf ? nf.n : 0}
Remarques : ${String(focus.notes || "-").slice(0, 600)}
Historique (récent d'abord) :
${fa.map((v) => `- ${dayStr(v.date, tz).slice(0, 10)} ${v.kind}${v.status === "planned" ? " (prévu)" : ""} : ${[v.summary, v.agreed && "convenu: " + v.agreed, v.not_done && "non fait: " + v.not_done, v.demands && "demandes: " + v.demands, v.next_step && "suite: " + v.next_step, !v.summary && v.transcript ? v.transcript : ""].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 400)}`).join("\n") || "(aucune activité)"}
`;
  }
  const text = `PORTEFEUILLE (${clients.length} fiches : ${nClients} clients, ${nProspects} prospects ; ${sleeping} sans activité faite depuis 30 jours ou plus)
Par ville : ${Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + " " + v).join(", ")}
${clients.length > shown.length ? `(seules ${shown.length} fiches sont listées, les plus proches de la demande)\n` : ""}Fiches (réf | code | nom | société | ville | type | secteur | contacts | dates) :
${cl || "(aucune fiche)"}

AGENDA — prévu, du plus proche au plus lointain (réf | date | type | client | objet) :
${ag || "(rien de prévu)"}

DERNIÈRES ACTIVITÉS FAITES (réf | date | type | client | contenu) :
${done || "(aucune)"}

AFFAIRES (réf | titre | client | étape | montant | signature) :
${dl || "(aucune affaire)"}
${team ? "\nÉQUIPE :\n" + team : ""}`;
  return { text: (focusTxt ? focusTxt + "\n" : "") + text.slice(0, 40000), clients, deals, refs, acts };
}

async function aiAssistant(req, env, me) {
  if (!env.AI) fail(503, "Le service d'intelligence artificielle n'est pas activé");
  const b = await readJson(req, 30000);
  const msg = str(b.text, 1500);
  if (!msg) fail(400, "Écrivez ou dites ce que vous voulez faire");
  const tz = num(b.tz, -840, 840) ?? 0;   // getTimezoneOffset() du téléphone
  const history = (Array.isArray(b.history) ? b.history : []).slice(-6).filter((x) => x && (x.role === "user" || x.role === "assistant")).map((x) => ({ role: x.role, content: str(x.content, 600) })).filter((x) => x.content);
  const s = await getSettings(env);
  const focusId = str(b.client_id, 40) || null;
  const ctx = await assistantContext(env, me, [msg, ...history.map((x) => x.content)].join(" "), tz, focusId);
  const today = new Date(now() - tz * 60000);
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const schema = { type: "object", properties: {
    reply: { type: "string" }, action: { type: "string", enum: ASSIST_ACTIONS },
    page: { type: "string" }, query: { type: "string" }, client_id: { type: "string" }, deal_id: { type: "string" },
    kind: { type: "string" }, date: { type: "string" }, time: { type: "string" }, text: { type: "string" },
    title: { type: "string" }, amount: { type: "string" }, stage: { type: "string" },
    name: { type: "string" }, company: { type: "string" }, contact: { type: "string" }, phone: { type: "string" }, phone2: { type: "string" }, email: { type: "string" }, website: { type: "string" }, city: { type: "string" }, address: { type: "string" }, sector: { type: "string" }, notes: { type: "string" }, client_kind: { type: "string" },
    activity_id: { type: "string" }, client_ids: { type: "array", items: { type: "string" } }, suggestions: { type: "array", items: { type: "string" } },
  }, required: ["reply", "action"] };
  const system = `Tu es « Magi », le robot assistant de Magiscom CRM, l'outil des commerciaux de la société « ${s.company} ».
Tu parles à ${me.name} (${me.p.admin ? "directeur / administrateur : voit toute l'équipe" : "commercial : voit son portefeuille"}).
Aujourd'hui : ${JOURS[today.getUTCDay()]} ${today.toISOString().slice(0, 10)}, il est ${today.toISOString().slice(11, 16)}.

Ton rôle : un vrai bras droit commercial. Comprends la demande (écrite ou dictée, en français, en arabe ou en darija marocaine) et :
- réponds à partir des données ci-dessous (chiffres, listes, historique, conseils de relance, priorités du jour) ;
- explique comment utiliser l'application (mode d'emploi ci-dessous) et propose l'écran utile ;
- ou déclenche UNE action dans l'application.
Réponds dans la langue de l'utilisateur (darija → arabe simple ou darija ; français → français). Sois concret et bref : 1 à 4 phrases ou une petite liste à puces.
Ajoute dans "suggestions" 2 ou 3 demandes de suivi utiles et courtes (dans la langue de l'utilisateur), que l'utilisateur pourra toucher.

Actions possibles (champ "action") :
- none : simple réponse (question sur les données, conseil, salutation).
- guide : explication du fonctionnement de l'application ; page = écran à proposer (facultatif).
- show_clients : afficher une liste de fiches cliquables ; client_ids = liste de références (ex. ["C1","C4"]). À utiliser pour toute réponse qui cite plusieurs clients.
- open_page : ouvrir un écran ; page ∈ ${ASSIST_PAGES.filter((x) => me.p.admin || !["dashboard", "team", "journal", "settings"].includes(x)).join(", ")}.
- search : chercher des fiches ; query = mots à chercher (nom, ville, secteur…).
- open_client : ouvrir la fiche ; client_id.
- open_activity : ouvrir une activité ; activity_id (réf « A3 »).
- complete_activity : marquer comme faite une tâche / un RDV / un appel prévu ; activity_id.
- reschedule : déplacer une activité prévue ; activity_id, date, time.
- update_client : modifier une fiche ; client_id + seulement les champs à changer parmi contact, phone, phone2, email, website, city, address, company, sector, notes (notes = texte à AJOUTER aux remarques).
- create_activity : planifier ou noter quelque chose pour un client ; client_id, kind ∈ rdv | appel | tache | note | visite, date (AAAA-MM-JJ), time (HH:MM, vide si inconnue), text (objet / contenu).
- create_client : nouvelle fiche ; name, company, phone, email, city, sector, client_kind ∈ client | prospect.
- create_deal : nouvelle affaire ; client_id, title, amount (nombre en MAD, vide si inconnu), stage ∈ nouveau | devis | negociation | gagne | perdu, date (signature prévue).
- deal_stage : changer l'étape d'une affaire existante ; deal_id, stage.
- voice_note : enregistrer une note vocale pour client_id.
- meeting : lancer l'enregistrement d'une réunion avec client_id.
- brief : préparer la visite de client_id (résumé IA).
- followup : rédiger le message de suivi de la dernière réunion / visite de client_id.
- call / whatsapp / email / directions : appeler, écrire sur WhatsApp, envoyer un e-mail ou aller chez client_id.

Règles :
- client_id = la référence de la fiche (ex. « C3 »), deal_id = celle de l'affaire (« D2 »), activity_id = celle de l'activité (« A5 »), copiées depuis les listes ci-dessous. « ce client » = la fiche ouverte à l'écran si elle est indiquée. Si le client est ambigu ou introuvable, action = none et demande des précisions (ou propose search).
- Dates relatives (« demain », « jeudi », « غدا », « الاثنين الجاي ») : calcule-les à partir d'aujourd'hui.
- N'invente jamais un client, un chiffre, une date ou une information absente des données.
- Les créations seront confirmées par l'utilisateur avant d'être enregistrées : décris dans reply ce que tu vas créer.

${APP_GUIDE}

DONNÉES :
${ctx.text}`;
  let out = null, lastErr = null;
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: msg }];
  const valid = (o) => o && typeof o === "object" && typeof o.reply === "string" && o.reply.trim();
  // 1) modèle léger, 2) Llama 70B si la réponse est absente ou illisible
  for (const model of [ASSIST_MODEL, LLM_MODEL]) {
    try {
      let r;
      try { r = await env.AI.run(model, { messages, response_format: { type: "json_schema", json_schema: schema }, max_tokens: 1100, temperature: 0.1 }); }
      catch (e) { if (aiFailMsg(e)) throw e; r = await env.AI.run(model, { messages: [{ role: "system", content: system + "\nRéponds uniquement avec un objet JSON {reply, action, suggestions, …}, sans texte autour. /no_think" }, ...messages.slice(1)], max_tokens: 1100, temperature: 0.1 }); }
      const o = parseJsonLoose(r);
      if (valid(o)) { out = o; break; }
    } catch (e) { lastErr = e; console.error("assistant", model, e); if (aiFailMsg(e)) break; }
  }
  await aiCount(env, "assistant");
  if (!out) {
    if (lastErr && aiFailMsg(lastErr)) fail(429, aiFailMsg(lastErr));
    if (lastErr) fail(502, "L'assistant ne répond pas pour le moment, réessayez");
    fail(502, "L'assistant n'a pas compris, reformulez");
  }
  return json(cleanAssistant(out, ctx, me));
}

function cleanAssistant(out, ctx, me) {
  const res = cleanAction(out, ctx, me);
  res.suggestions = (Array.isArray(out.suggestions) ? out.suggestions : []).map((x) => str(x, 90)).filter(Boolean).slice(0, 3);
  return res;
}
function cleanAction(out, ctx, me) {
  const reply = str(out.reply, 2500) || "…";
  let action = ASSIST_ACTIONS.includes(out.action) ? out.action : "none";
  const a = { type: action };
  const ids = new Set(ctx.clients.map((c) => c.id));
  const ref = (v) => { const k = str(v, 60).toUpperCase().replace(/\s/g, ""); return ctx.refs.get(k) || str(v, 60); };
  const cid = ref(out.client_id);
  const needClient = ["open_client", "create_activity", "create_deal", "voice_note", "meeting", "brief", "followup", "update_client", "call", "whatsapp", "email", "directions"];
  if (needClient.includes(action)) {
    if (!ids.has(cid)) return { reply, action: { type: "none" } };
    a.client_id = cid;
    const c = ctx.clients.find((x) => x.id === cid);
    a.client = { id: c.id, name: c.name, code: c.code, city: c.city };
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(str(out.date, 10)) ? str(out.date, 10) : "";
  const time = /^\d{1,2}:\d{2}$/.test(str(out.time, 5)) ? str(out.time, 5).padStart(5, "0") : "";
  const actOf = () => { const id = ref(out.activity_id); return ctx.acts.get(id) || null; };
  switch (action) {
    case "guide": { const pg = str(out.page, 30); if (ASSIST_PAGES.includes(pg) && (me.p.admin || !["dashboard", "team", "journal", "settings"].includes(pg))) a.page = pg; break; }
    case "show_clients": {
      const list = (Array.isArray(out.client_ids) ? out.client_ids : []).map(ref).filter((id, i, arr) => ids.has(id) && arr.indexOf(id) === i).slice(0, 40);
      if (!list.length) return { reply, action: { type: "none" } };
      a.clients = list.map((id) => { const c = ctx.clients.find((x) => x.id === id); return { id, name: c.name, code: c.code, city: c.city || "", kind: c.kind }; });
      break;
    }
    case "open_activity": case "complete_activity": case "reschedule": {
      const v = actOf();
      if (!v || (action !== "open_activity" && v.status !== "planned")) return { reply, action: { type: "none" } };
      a.activity_id = v.id; a.activity = { id: v.id, kind: v.kind, date: v.date, client: v.cname, client_id: v.client_id, text: String(v.summary || v.next_step || "").slice(0, 200) };
      if (action === "reschedule") { if (!day) return { reply, action: { type: "none" } }; a.date = day; a.time = time; }
      break;
    }
    case "update_client": {
      const ch = {};
      for (const k of ASSIST_EDIT) { const v = str(out[k], k === "notes" ? 2000 : 300); if (v) ch[k] = v; }
      if (!Object.keys(ch).length) return { reply, action: { type: "none" } };
      const c = ctx.clients.find((x) => x.id === cid);
      a.changes = ch; a.current = Object.fromEntries(Object.keys(ch).map((k) => [k, c[k] || ""]));
      break;
    }
    case "open_page": {
      const pg = str(out.page, 30);
      if (!ASSIST_PAGES.includes(pg) || (!me.p.admin && ["dashboard", "team", "journal", "settings"].includes(pg))) return { reply, action: { type: "none" } };
      a.page = pg; break;
    }
    case "search": a.query = str(out.query, 120); if (!a.query) a.type = "none"; break;
    case "create_activity":
      a.kind = ASSIST_KINDS.includes(out.kind) ? out.kind : "rdv";
      a.date = day; a.time = time; a.text = str(out.text, 1000); break;
    case "create_client":
      a.name = str(out.name, 160); if (!a.name) return { reply, action: { type: "none" } };
      for (const k of ["company", "phone", "email", "city", "sector"]) a[k] = str(out[k], 160);
      a.client_kind = out.client_kind === "client" ? "client" : "prospect";
      a.similar = ctx.clients.filter((c) => normTxt(c.name).trim() === normTxt(a.name).trim()).slice(0, 3).map((c) => ({ id: c.id, name: c.name, code: c.code, city: c.city }));
      break;
    case "create_deal": {
      a.title = str(out.title, 160) || "Affaire";
      const n = Number(String(out.amount || "").replace(/[^\d.,]/g, "").replace(",", "."));
      a.amount = Number.isFinite(n) && n > 0 ? n : null;
      a.stage = DEAL_STAGES.includes(out.stage) ? out.stage : "nouveau";
      a.date = day; break;
    }
    case "deal_stage": {
      const did = ref(out.deal_id); const d = ctx.deals.find((x) => x.id === did);
      if (!d || !DEAL_STAGES.includes(out.stage)) return { reply, action: { type: "none" } };
      a.deal_id = d.id; a.stage = out.stage; a.deal = { id: d.id, title: d.title, client: d.cname, stage: d.stage }; break;
    }
  }
  return { reply, action: a };
}
