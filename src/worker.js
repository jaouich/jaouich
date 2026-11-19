// Magiscom Tech Desk — Support clients
// Cloudflare Worker + D1 (base de données) + R2 (photos et vidéos)

const ASSETS = __ASSETS__;

const SESSION_DAYS = 30;
const PBKDF2_ITER = 100000;               // maximum accepté par Workers
const MB = 1024 * 1024;
const MAX_IMAGE = 15 * MB;
const MAX_VIDEO = 95 * MB;                // limite de corps de requête Workers : 100 Mo (Free/Pro)
const MAX_AUDIO = 25 * MB;
const MAX_FILES = 6;                      // fichiers par message
const MAX_PENDING = 30;                   // fichiers envoyés mais pas encore joints
const PENDING_TTL = 24 * 3600 * 1000;
const MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
  "audio/webm": "weba", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav",
};
const MAX_BIG = 5 * 1024 * MB;             // vidéo longue (enregistrement d'écran, d'appel, fichier du téléphone) : 5 Go
const PART_MAX = 95 * MB;                 // un morceau d'envoi
const RING_MS = 45000;                    // durée de sonnerie avant « appel manqué »
const MAX_SDP = 30000;
const STATUSES = ["open", "in_review", "resolved", "unresolved"];
const CATEGORIES = ["ebp", "sage", "installation", "formation", "facturation", "autre"];

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env, ctx);
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
async function route(req, env, ctx) {
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
  if (p === "/api/uploads/mp" && m === "POST") return mpCreate(req, env, me);
  if (p === "/api/tickets" && m === "GET") return listTickets(url, env, me);
  if (p === "/api/tickets" && m === "POST") return createTicket(req, env, me, ctx);

  let r;
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})$/)) && m === "GET") return getTicket(r[1], env, me);
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/messages$/)) && m === "POST") return addMessage(r[1], req, env, me, ctx);
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/status$/)) && m === "PATCH") return setStatus(r[1], req, env, me, ctx);
  if ((r = p.match(/^\/api\/media\/([0-9a-f-]{36})$/)) && (m === "GET" || m === "HEAD")) return media(r[1], req, url, env, me);

  if ((r = p.match(/^\/api\/uploads\/mp\/([0-9a-f-]{36})\/(\d{1,5})$/)) && m === "PUT") return mpPart(r[1], Number(r[2]), req, env, me);
  if ((r = p.match(/^\/api\/uploads\/mp\/([0-9a-f-]{36})\/complete$/)) && m === "POST") return mpComplete(r[1], req, env, me);
  if ((r = p.match(/^\/api\/uploads\/mp\/([0-9a-f-]{36})\/abort$/)) && m === "POST") return mpAbort(r[1], env, me);

  // Appels audio / vidéo
  if (p === "/api/rtc-config" && m === "GET") return rtcConfig(env);
  if (p === "/api/calls/incoming" && m === "GET") return incomingCalls(env, me);
  if ((r = p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/calls$/)) && m === "POST") return startCall(r[1], req, env, me);
  if ((r = p.match(/^\/api\/calls\/([0-9a-f-]{36})$/)) && m === "GET") return getCall(r[1], env, me);
  if ((r = p.match(/^\/api\/calls\/([0-9a-f-]{36})\/answer$/)) && m === "POST") return answerCall(r[1], req, env, me);
  if ((r = p.match(/^\/api\/calls\/([0-9a-f-]{36})\/end$/)) && m === "POST") return endCall(r[1], req, env, me);
  if ((r = p.match(/^\/api\/calls\/([0-9a-f-]{36})\/recording$/)) && m === "POST") return setRecording(r[1], req, env, me);

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
  "Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(self), camera=(self), display-capture=(self)",
};
function asset(p) {
  const a = ASSETS[p] || ASSETS["/"];               // application monopage
  if (a.b64) return new Response(fromB64(a.b64), { headers: { "Content-Type": a.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
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
  if (!ext) fail(415, "Format non accepté. Photos : JPG, PNG, WEBP, GIF, HEIC. Vidéos : MP4, MOV, WEBM, 3GP. Audio : WEBM, OGG, M4A, MP3.");
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size || !req.body) fail(411, "Fichier vide");
  const max = type.startsWith("video/") ? MAX_VIDEO : type.startsWith("audio/") ? MAX_AUDIO : MAX_IMAGE;
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

// ---------- Longues vidéos : envoi en morceaux (multipart R2) ----------
// Le navigateur envoie la vidéo morceau par morceau PENDANT l'enregistrement : pas de limite
// d'une heure, pas besoin de tout garder en mémoire. Maximum 5 Go par fichier.
async function mpCreate(req, env, me) {
  const b = await readJson(req);
  const type = str(b.type, 60).split(";")[0].toLowerCase();
  const ext = MIME[type];
  if (!ext || !(type.startsWith("video/") || type.startsWith("audio/"))) fail(415, "Format non accepté pour une longue vidéo");
  const pending = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM attachments WHERE owner_id = ? AND message_id IS NULL) + (SELECT COUNT(*) FROM multipart_uploads WHERE owner_id = ?) AS n").bind(me.id, me.id).first();
  if (pending.n >= MAX_PENDING) fail(429, "Trop de fichiers en attente. Envoyez d'abord votre message.");
  const name = (str(b.name, 120).replace(/[\u0000-\u001f\\/]/g, "") || "video." + ext);
  const id = uid(), key = `u/${me.id}/${id}.${ext}`;
  const mpu = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: type } });
  await env.DB.prepare("INSERT INTO multipart_uploads (id, owner_id, r2_key, upload_id, mime, name, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, me.id, key, mpu.uploadId, type, name, now()).run();
  return json({ upload: { id } }, 201);
}
async function loadMp(env, id, me) {
  const u = await env.DB.prepare("SELECT * FROM multipart_uploads WHERE id = ? AND owner_id = ?").bind(id, me.id).first();
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
async function mpComplete(id, req, env, me) {
  const u = await loadMp(env, id, me);
  const b = await readJson(req, 600000);
  if (!Array.isArray(b.parts) || !b.parts.length || b.parts.length > 10000) fail(400, "Envoi incomplet");
  const parts = b.parts.map((p) => ({ partNumber: Number(p.part), etag: String(p.etag || "").slice(0, 200) }));
  let obj;
  try { obj = await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).complete(parts); }
  catch (e) { console.error("mp complete", e); fail(400, "Envoi incomplet, réessayez"); }
  const size = obj.size;
  if (size > MAX_BIG) { await env.MEDIA.delete(u.r2_key); await env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(id).run(); fail(413, "Fichier trop lourd (maximum 5 Go)"); }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO attachments (id,message_id,ticket_id,owner_id,r2_key,mime,size,original_name,created_at) VALUES (?,NULL,NULL,?,?,?,?,?,?)")
      .bind(id, me.id, u.r2_key, u.mime, size, u.name, now()),
    env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(id),
  ]);
  return json({ attachment: { id, mime: u.mime, size, name: u.name } }, 201);
}
async function mpAbort(id, env, me) {
  const u = await loadMp(env, id, me);
  try { await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).abort(); } catch {}
  await env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(id).run();
  return json({ ok: true });
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
  // Envois longs abandonnés (plus de 24 h)
  try {
    const { results: mps } = await env.DB.prepare("SELECT id, r2_key, upload_id FROM multipart_uploads WHERE created_at < ? LIMIT 100").bind(now() - PENDING_TTL).all();
    for (const u of mps) {
      try { await env.MEDIA.resumeMultipartUpload(u.r2_key, u.upload_id).abort(); } catch {}
      await env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(u.id).run();
    }
  } catch (e) { console.error("mp cleanup", e); }
  // Appels oubliés (onglet fermé sans raccrocher)
  await env.DB.prepare("UPDATE calls SET status = CASE WHEN status='ringing' THEN 'missed' ELSE 'ended' END, ended_at=?, offer=NULL, answer=NULL WHERE status IN ('ringing','active') AND created_at < ?")
    .bind(now(), now() - 6 * 3600000).run();
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
async function createTicket(req, env, me, ctx) {
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
  if (me.role !== "admin") later(ctx, notifyAdmins(env, me, {
    subject: `Nouvelle demande : ${subject}`,
    heading: "Nouvelle demande d'un client",
    intro: `${me.name}${me.company ? " (" + me.company + ")" : ""} a envoyé une nouvelle demande.`,
    title: subject, excerpt: body, files: ids.length, path: "/#/t/" + tid,
  }));
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
async function addMessage(id, req, env, me, ctx) {
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
  if (sender === "admin") later(ctx, notifyOwner(env, t, {
    subject: `Réponse à votre demande : ${t.subject}`,
    heading: "Magiscom Tech vous a répondu",
    intro: `${me.name}${me.title ? " · " + me.title : ""} a répondu à votre demande.`,
    title: t.subject, excerpt: body, files: ids.length, path: "/#/t/" + id,
  }));
  else later(ctx, notifyAdmins(env, me, {
    subject: `Nouveau message : ${t.subject}`,
    heading: "Nouveau message d'un client",
    intro: `${me.name}${me.company ? " (" + me.company + ")" : ""} a écrit dans sa demande.`,
    title: t.subject, excerpt: body, files: ids.length, path: "/#/t/" + id,
  }));
  return json({ message: { id: mid } }, 201);
}
async function setStatus(id, req, env, me, ctx) {
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
  later(ctx, notifyOwner(env, t, {
    subject: `Votre demande est maintenant « ${STATUS_FR[b.status]} »`,
    heading: `Statut : ${STATUS_FR[b.status]}`,
    intro: STATUS_MSG[b.status],
    title: t.subject, excerpt: "", files: 0, path: "/#/t/" + id,
  }));
  return json({ ok: true });
}


// ---------- Appels audio / vidéo (WebRTC) ----------
// Les deux navigateurs se parlent directement. Le Worker garde seulement l'offre et la réponse
// (signalisation). Avec un relais TURN Cloudflare (secrets TURN_KEY_ID et TURN_KEY_API_TOKEN),
// les appels passent aussi derrière les réseaux mobiles stricts.
async function rtcConfig(env) {
  const stun = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 7200 }),
      });
      if (r.ok) { const d = await r.json(); if (d.iceServers) return json({ iceServers: [].concat(d.iceServers), turn: true }); }
    } catch (e) { console.error("turn", e); }
  }
  return json({ iceServers: stun, turn: false });
}
const sdp = (v) => (typeof v === "string" && v.length > 20 && v.length <= MAX_SDP && v.startsWith("v=0") ? v : fail(400, "Signal d'appel invalide"));
async function loadCall(env, id, me) {
  const c = await env.DB.prepare("SELECT c.*, t.user_id AS ticket_owner, t.subject FROM calls c JOIN tickets t ON t.id = c.ticket_id WHERE c.id = ?").bind(id).first();
  if (!c) fail(404, "Appel introuvable");
  const callerSide = c.caller_id === me.id;
  // L'autre côté : le client de la demande si un admin appelle, un admin si le client appelle
  const calleeSide = !callerSide && (c.callee_id ? c.callee_id === me.id : c.caller_role === "admin" ? me.id === c.ticket_owner : me.role === "admin");
  if (!callerSide && !calleeSide) fail(404, "Appel introuvable");
  if (c.status === "ringing" && c.created_at < now() - RING_MS) {
    await env.DB.prepare("UPDATE calls SET status='missed', ended_at=? WHERE id=? AND status='ringing'").bind(now(), c.id).run();
    c.status = "missed";
  }
  c.callerSide = callerSide;
  return c;
}
const callPub = (c) => ({ id: c.id, ticket_id: c.ticket_id, video: !!c.video, status: c.status, recording: !!c.recording, answered_at: c.answered_at });
async function startCall(ticketId, req, env, me) {
  const t = await loadTicket(env, ticketId, me);
  const b = await readJson(req, MAX_SDP + 2000);
  const offer = sdp(b.offer), id = uid(), ts = now();
  await env.DB.batch([
    // Un seul appel à la fois par demande
    env.DB.prepare("UPDATE calls SET status = CASE WHEN status='ringing' THEN 'missed' ELSE 'ended' END, ended_at=? WHERE ticket_id=? AND status IN ('ringing','active')").bind(ts, t.id),
    env.DB.prepare("INSERT INTO calls (id,ticket_id,caller_id,caller_role,video,status,offer,created_at) VALUES (?,?,?,?,?,'ringing',?,?)")
      .bind(id, t.id, me.id, me.role === "admin" ? "admin" : "user", b.video ? 1 : 0, offer, ts),
  ]);
  return json({ call: { id } }, 201);
}
async function incomingCalls(env, me) {
  const since = now() - RING_MS;
  const sql = me.role === "admin"
    ? `SELECT c.id, c.ticket_id, c.video, c.created_at, t.subject, u.name AS caller_name, u.company AS caller_company
       FROM calls c JOIN tickets t ON t.id=c.ticket_id JOIN users u ON u.id=c.caller_id
       WHERE c.status='ringing' AND c.created_at > ? AND c.caller_role='user' ORDER BY c.created_at DESC LIMIT 5`
    : `SELECT c.id, c.ticket_id, c.video, c.created_at, t.subject, u.name AS caller_name, u.title AS caller_title
       FROM calls c JOIN tickets t ON t.id=c.ticket_id JOIN users u ON u.id=c.caller_id
       WHERE c.status='ringing' AND c.created_at > ? AND c.caller_role='admin' AND t.user_id = ? ORDER BY c.created_at DESC LIMIT 5`;
  const st = env.DB.prepare(sql);
  const { results } = await (me.role === "admin" ? st.bind(since) : st.bind(since, me.id)).all();
  return json({ calls: results.map((c) => ({ ...c, video: !!c.video })) });
}
async function getCall(id, env, me) {
  const c = await loadCall(env, id, me);
  const out = callPub(c);
  if (c.callerSide) out.answer = c.answer || null;
  else if (c.status === "ringing") out.offer = c.offer;
  return json({ call: out });
}
async function answerCall(id, req, env, me) {
  const c = await loadCall(env, id, me);
  if (c.callerSide) fail(400, "Vous ne pouvez pas répondre à votre propre appel");
  if (c.status !== "ringing") fail(409, c.status === "active" ? "Quelqu'un a déjà répondu" : "L'appel est terminé");
  const b = await readJson(req, MAX_SDP + 2000);
  const r = await env.DB.prepare("UPDATE calls SET status='active', answer=?, callee_id=?, answered_at=? WHERE id=? AND status='ringing'")
    .bind(sdp(b.answer), me.id, now(), id).run();
  if (!r.meta.changes) fail(409, "Quelqu'un a déjà répondu");
  return json({ ok: true });
}
const dur = (ms) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`; };
async function endCall(id, req, env, me) {
  const c = await loadCall(env, id, me);
  if (!["ringing", "active"].includes(c.status)) return json({ ok: true, status: c.status });
  const b = await readJson(req);
  const ts = now();
  const status = c.status === "active" ? "ended" : c.callerSide ? "missed" : b.reason === "declined" ? "declined" : "missed";
  const r = await env.DB.prepare("UPDATE calls SET status=?, ended_at=?, offer=NULL, answer=NULL WHERE id=? AND status IN ('ringing','active')").bind(status, ts, id).run();
  if (r.meta.changes) {
    // Trace dans l'historique de la demande
    const kind = c.video ? "Appel vidéo" : "Appel audio";
    const body = status === "ended" ? `📞 ${kind} · durée ${dur(ts - c.answered_at)}` : status === "declined" ? `📞 ${kind} refusé` : `📞 ${kind} manqué`;
    await env.DB.prepare("INSERT INTO messages (id,ticket_id,sender_id,body,created_at) VALUES (?,?,?,?,?)").bind(uid(), c.ticket_id, c.caller_id, body, ts).run();
  }
  return json({ ok: true, status });
}
async function setRecording(id, req, env, me) {
  const c = await loadCall(env, id, me);
  if (c.status !== "active") fail(409, "L'appel n'est pas en cours");
  const b = await readJson(req);
  await env.DB.prepare("UPDATE calls SET recording=? WHERE id=?").bind(b.on ? 1 : 0, id).run();
  return json({ ok: true });
}

// ---------- Notifications par e-mail ----------
// Fonctionne avec Cloudflare Email Service (binding EMAIL) ou Resend (secret RESEND_API_KEY).
// Sans l'un des deux, l'application marche normalement, sans e-mail.
const STATUS_FR = { open: "Ouvert", in_review: "En cours de traitement", resolved: "Résolu", unresolved: "Non résolu" };
const STATUS_MSG = {
  open: "Votre demande est ouverte. Notre équipe va la prendre en charge.",
  in_review: "Notre équipe travaille sur votre demande.",
  resolved: "Votre demande est résolue. Si le problème revient, répondez simplement dans la demande.",
  unresolved: "Nous n'avons pas pu régler ce problème. Écrivez-nous dans la demande pour en reparler.",
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function later(ctx, promise) {
  const p = promise.catch((e) => console.error("notification", e));
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
}
function mailBody(env, n) {
  const url = (env.APP_URL || "https://support.integrateurebp.com") + n.path;
  const excerpt = n.excerpt ? (n.excerpt.length > 600 ? n.excerpt.slice(0, 600) + "…" : n.excerpt) : "";
  const files = n.files ? `${n.files} fichier${n.files > 1 ? "s" : ""} joint${n.files > 1 ? "s" : ""} (photo ou vidéo).` : "";
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#0e1a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde3f0">
<tr><td style="padding:18px 24px;border-bottom:4px solid #0b4fd6"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px"><img src="${esc((env.APP_URL || "https://support.integrateurebp.com") + "/icon.png")}" width="44" height="42" alt="Magiscom Tech" style="display:block;border:0"></td>
<td><div style="font-size:18px;font-weight:bold;color:#0a2a6b">Magiscom Tech Desk</div><div style="font-size:12px;color:#5a6784;letter-spacing:.06em;text-transform:uppercase">Support clients</div></td></tr></table></td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 10px">${esc(n.heading)}</h1>
<p style="margin:0 0 14px;color:#33415c;line-height:1.5">${esc(n.intro)}</p>
<p style="margin:0 0 6px;font-size:12px;color:#5a6784;text-transform:uppercase;letter-spacing:.05em">Demande</p>
<p style="margin:0 0 14px;font-weight:bold">${esc(n.title)}</p>
${excerpt ? `<div style="background:#f3f5fa;border-left:4px solid #0b4fd6;border-radius:8px;padding:12px 14px;margin:0 0 14px;white-space:pre-wrap;line-height:1.5">${esc(excerpt)}</div>` : ""}
${files ? `<p style="margin:0 0 14px;color:#5a6784">📎 ${esc(files)}</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;background:#0b4fd6;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Ouvrir la demande</a>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #dde3f0;font-size:12px;color:#5a6784">Magiscom Tech · Technopark Casablanca<br>Vous recevez cet e-mail car vous avez un compte sur Magiscom Tech Desk. Ne répondez pas à cet e-mail : utilisez la demande en ligne.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${n.heading}\n\n${n.intro}\n\nDemande : ${n.title}\n${excerpt ? "\n" + excerpt + "\n" : ""}${files ? "\n" + files + "\n" : ""}\nOuvrir la demande : ${url}\n\n— Magiscom Tech Desk`;
  return { html, text };
}
async function sendMail(env, to, n) {
  if (!to) return;
  const from = env.MAIL_FROM || "support@integrateurebp.com";
  const { html, text } = mailBody(env, n);
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({ from: { email: from, name: "Magiscom Tech Desk" }, to, subject: n.subject, html, text });
  } else if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Magiscom Tech Desk <${from}>`, to: [to], subject: n.subject, html, text }),
    });
    if (!r.ok) console.error("resend", r.status, await r.text());
  }
}
async function notifyAdmins(env, actor, n) {
  const { results } = await env.DB.prepare("SELECT email FROM users WHERE role = 'admin' AND id <> ?").bind(actor.id).all();
  for (const a of results) {
    try { await sendMail(env, a.email, n); } catch (e) { console.error("mail admin", e); }
  }
}
async function notifyOwner(env, ticket, n) {
  const o = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(ticket.user_id).first();
  if (o) await sendMail(env, o.email, n);
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
