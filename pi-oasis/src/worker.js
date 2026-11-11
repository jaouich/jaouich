// Pi Oasis – Cloudflare Worker (server)
// Pi sign-in (via App Studio), server-side game (anti-cheat), VIP payments, 10% referrals, weekly leaderboard.
// Static files in /public are served by Workers Static Assets (see wrangler.toml).
import "../public/logic.js";

const L = globalThis.OasisLogic;
const PI_API = "https://api.minepi.com/v2";
// Pi sign-in: the access token is exchanged with App Studio, which checks it with
// the Pi Platform. Only the identity it returns is trusted.
const APP_STUDIO_LOGIN = "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login";
const VIP_PRICE = 0.25;
const VIP_DAYS = 30;
const REFERRAL_RATE = 0.1; // 10% on every monthly renewal
const PRIZE_RATE = 0.15; // 15% goes to the weekly prize pool
const PRIZE_SPLIT = [0.5, 0.3, 0.2];
const MIN_WITHDRAW = 1;
const SESSION_DAYS = 30;
const DAY = 86400000;

const round = (n) => Math.round(n * 1e7) / 1e7;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const bad = (code) => { throw new HttpError(400, code); };

// ---------- Pi API ----------
async function pi(env, path, { method = "GET", body } = {}) {
  const r = await fetch(PI_API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${env.PI_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Pi API", path, r.status, JSON.stringify(data));
    throw new HttpError(r.status === 401 ? 401 : 502, r.status === 401 ? "session" : "server");
  }
  return data;
}

async function appStudioLogin(accessToken) {
  const r = await fetch(APP_STUDIO_LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.user || !data.user.uid || !data.user.username) {
    console.error("App Studio login", r.status, JSON.stringify(data));
    throw new HttpError(r.status >= 500 ? 502 : 401, r.status >= 500 ? "server" : "session");
  }
  return { uid: String(data.user.uid), username: String(data.user.username) };
}

// ---------- DB helpers ----------
// Tables are created on first use, so a brand-new database works right away.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users ( uid TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, referrer TEXT, vip_until INTEGER NOT NULL DEFAULT 0, ref_balance REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS users_referrer ON users(referrer)",
  "CREATE TABLE IF NOT EXISTS sessions ( token TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS state ( uid TEXT PRIMARY KEY, json TEXT NOT NULL, week_id INTEGER NOT NULL, week_score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS state_week ON state(week_id, week_score DESC)",
  "CREATE TABLE IF NOT EXISTS payments ( id TEXT PRIMARY KEY, uid TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, txid TEXT, referrer_uid TEXT, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS weeks ( id INTEGER PRIMARY KEY, prize_pool REAL NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS withdrawals ( id TEXT PRIMARY KEY, uid TEXT NOT NULL, username TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS ads ( id TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL )",
];
let schemaReady = null;
const ensureSchema = (env) =>
  (schemaReady ||= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q))).catch((e) => { schemaReady = null; throw e; }));

const one = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const all = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
const run = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();

async function account(env, u) {
  const c = await one(env, "SELECT COUNT(*) AS n FROM users WHERE referrer = ?", u.uid);
  return { username: u.username, vipUntil: u.vip_until, referralBalance: u.ref_balance, referralCount: c.n };
}

async function loadState(env, uid, now) {
  const row = await one(env, "SELECT json FROM state WHERE uid = ?", uid);
  return L.normalize(row ? JSON.parse(row.json) : null, now);
}
async function saveState(env, uid, s, now) {
  await run(
    env,
    `INSERT INTO state (uid, json, week_id, week_score, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET json = excluded.json, week_id = excluded.week_id, week_score = excluded.week_score, updated_at = excluded.updated_at`,
    uid, JSON.stringify(s), s.week.id, s.week.score, now
  );
}

async function auth(req, env) {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!tok) throw new HttpError(401, "session");
  const u = await one(
    env,
    "SELECT u.* FROM sessions s JOIN users u ON u.uid = s.uid WHERE s.token = ? AND s.created_at > ?",
    tok, Date.now() - SESSION_DAYS * DAY
  );
  if (!u) throw new HttpError(401, "session");
  return u;
}

function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- Routes ----------
const routes = {
  // Sign in: exchange the Pi access token with App Studio (one exchange per sign-in).
  // Any uid/username sent by the browser is ignored.
  "POST /api/auth": async (req, env, body) => {
    if (!body.accessToken || typeof body.accessToken !== "string") bad("session");
    const me = await appStudioLogin(body.accessToken);
    const now = Date.now();
    let u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    if (!u) {
      // Referral: only for new accounts, never yourself, one level only
      let referrer = null;
      if (body.ref && body.ref !== me.username) {
        const r = await one(env, "SELECT uid FROM users WHERE username = ?", String(body.ref));
        if (r) referrer = r.uid;
      }
      await run(env, "INSERT INTO users (uid, username, referrer, vip_until, ref_balance, created_at) VALUES (?, ?, ?, 0, 0, ?)", me.uid, me.username, referrer, now);
    } else if (u.username !== me.username) {
      await run(env, "UPDATE users SET username = ? WHERE uid = ?", me.username, me.uid);
    }
    u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    const session = randomToken();
    await run(env, "INSERT INTO sessions (token, uid, created_at) VALUES (?, ?, ?)", session, me.uid, now);
    return { session, user: { username: u.username }, account: await account(env, u), state: await loadState(env, u.uid, now), now };
  },

  "GET /api/me": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    return { account: await account(env, u), state: await loadState(env, u.uid, now), now };
  },

  // Every game action runs here with the server's clock
  "POST /api/action": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const a = body.action || {};
    let adVerified = false;
    if (a.type === "speedup") adVerified = await verifyAd(env, u.uid, a.adId, now);
    const state = await loadState(env, u.uid, now);
    let res;
    try {
      res = L.apply(state, a, { now, vip: u.vip_until > now, adVerified });
    } catch (e) {
      if (e instanceof L.GameError) return json({ error: e.code, vars: e.vars, state, now }, 400);
      throw e;
    }
    await saveState(env, u.uid, res.s, now);
    return { state: res.s, msg: res.msg, now };
  },

  // ---------- Payments (User → App) ----------
  "POST /api/payments/approve": async (req, env, body) => {
    const u = await auth(req, env);
    const id = String(body.paymentId || "");
    const p = await pi(env, `/payments/${encodeURIComponent(id)}`);
    if (p.user_uid !== u.uid) bad("notYours");
    if (Number(p.amount) !== VIP_PRICE || p.metadata?.type !== "vip_month") bad("badPayment");
    await pi(env, `/payments/${encodeURIComponent(id)}/approve`, { method: "POST" });
    await run(env, "INSERT OR IGNORE INTO payments (id, uid, amount, status, created_at) VALUES (?, ?, ?, 'approved', ?)", id, u.uid, VIP_PRICE, Date.now());
    return { ok: true };
  },

  "POST /api/payments/complete": async (req, env, body) => {
    const u = await auth(req, env);
    if (!body.paymentId || !body.txid) bad("badPayment");
    await completePayment(env, String(body.paymentId), String(body.txid));
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    return { ok: true, account: await account(env, fresh) };
  },

  // A payment that didn't finish earlier (e.g. connection lost)
  "POST /api/payments/incomplete": async (req, env, body) => {
    const p = body.payment;
    const txid = p?.transaction?.txid;
    if (!p?.identifier || !txid) return { ok: false };
    await completePayment(env, String(p.identifier), String(txid));
    return { ok: true };
  },

  // ---------- Leaderboard ----------
  "GET /api/leaderboard": async (req, env) => {
    const wid = L.weekId(Date.now());
    const w = await one(env, "SELECT prize_pool FROM weeks WHERE id = ?", wid);
    const top = await all(
      env,
      "SELECT u.username, s.week_score AS score FROM state s JOIN users u ON u.uid = s.uid WHERE s.week_id = ? AND s.week_score > 0 ORDER BY s.week_score DESC, s.updated_at ASC LIMIT 20",
      wid
    );
    return { prizePool: w ? w.prize_pool : 0, top };
  },

  // ---------- Referrals ----------
  "POST /api/referral/redeem-vip": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    const r = await run(
      env,
      "UPDATE users SET ref_balance = ROUND(ref_balance - ?, 7), vip_until = MAX(vip_until, ?) + ? WHERE uid = ? AND ref_balance >= ?",
      VIP_PRICE, now, VIP_DAYS * DAY, u.uid, VIP_PRICE
    );
    if (!r.meta.changes) bad("needVipBalance");
    return { account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)) };
  },

  "POST /api/referral/withdraw": async (req, env) => {
    const u = await auth(req, env);
    if (u.ref_balance < MIN_WITHDRAW) bad("minWithdraw");
    if (await one(env, "SELECT id FROM withdrawals WHERE uid = ? AND status = 'pending'", u.uid)) bad("pendingWithdraw");
    const amount = round(u.ref_balance);
    const r = await run(env, "UPDATE users SET ref_balance = 0 WHERE uid = ? AND ref_balance = ?", u.uid, u.ref_balance);
    if (!r.meta.changes) bad("server");
    await run(env, "INSERT INTO withdrawals (id, uid, username, amount, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", crypto.randomUUID(), u.uid, u.username, amount, Date.now());
    return { account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)), amount };
  },

  // ---------- Admin: who needs to be paid ----------
  "GET /api/admin/payouts": async (req, env) => {
    if (!env.ADMIN_TOKEN || req.headers.get("x-admin-token") !== env.ADMIN_TOKEN) throw new HttpError(403, "forbidden");
    const lastWeek = L.weekId(Date.now() - 7 * DAY);
    const w = await one(env, "SELECT * FROM weeks WHERE id = ?", lastWeek);
    const top = await all(
      env,
      "SELECT u.uid, u.username, s.week_score AS score FROM state s JOIN users u ON u.uid = s.uid WHERE s.week_id = ? AND s.week_score > 0 ORDER BY s.week_score DESC, s.updated_at ASC LIMIT 3",
      lastWeek
    );
    // Note: a player's row moves to the new week once they play again, so check this early in the week.
    const pool = w ? w.prize_pool : 0;
    return {
      withdrawals: await all(env, "SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY created_at"),
      lastWeek: { id: lastWeek, prizePool: pool, paid: !!(w && w.paid), winners: top.map((r, i) => ({ ...r, prize: round(pool * PRIZE_SPLIT[i]) })) },
    };
  },
};

async function completePayment(env, id, txid) {
  const p = await pi(env, `/payments/${encodeURIComponent(id)}`);
  if (Number(p.amount) !== VIP_PRICE || p.metadata?.type !== "vip_month") bad("badPayment");
  if (!p.status?.developer_completed) {
    await pi(env, `/payments/${encodeURIComponent(id)}/complete`, { method: "POST", body: { txid } });
  }
  const now = Date.now();
  await run(env, "INSERT OR IGNORE INTO payments (id, uid, amount, status, created_at) VALUES (?, ?, ?, 'approved', ?)", id, p.user_uid, VIP_PRICE, now);
  // Mark completed once; only the first call credits anything
  const r = await run(env, "UPDATE payments SET status = 'completed', txid = ? WHERE id = ? AND status != 'completed'", txid, id);
  if (!r.meta.changes) return;
  const u = await one(env, "SELECT * FROM users WHERE uid = ?", p.user_uid);
  const wid = L.weekId(now);
  const stmts = [
    env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(wid, round(VIP_PRICE * PRIZE_RATE)),
  ];
  if (u) {
    stmts.push(env.DB.prepare("UPDATE users SET vip_until = MAX(vip_until, ?) + ? WHERE uid = ?").bind(now, VIP_DAYS * DAY, u.uid));
    if (u.referrer) {
      stmts.push(env.DB.prepare("UPDATE users SET ref_balance = ROUND(ref_balance + ?, 7) WHERE uid = ?").bind(round(VIP_PRICE * REFERRAL_RATE), u.referrer));
      stmts.push(env.DB.prepare("UPDATE payments SET referrer_uid = ? WHERE id = ?").bind(u.referrer, id));
    }
  }
  await env.DB.batch(stmts);
}

// Rewarded ad: ask Pi whether the ad was really watched, and allow each ad only once
async function verifyAd(env, uid, adId, now) {
  if (!adId || typeof adId !== "string") return false;
  const used = await run(env, "INSERT OR IGNORE INTO ads (id, uid, created_at) VALUES (?, ?, ?)", adId, uid, now);
  if (!used.meta.changes) return false;
  try {
    const s = await pi(env, `/ads_network/status/${encodeURIComponent(adId)}`);
    return s.mediator_ack_status === "granted";
  } catch {
    return false;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json({ error: "notFound" }, 404);
    try {
      await ensureSchema(env);
      let body = {};
      if (req.method === "POST") {
        const text = await req.text();
        if (text.length > 50000) bad("badAction");
        if (text) body = JSON.parse(text);
      }
      const out = await handler(req, env, body);
      return out instanceof Response ? out : json(out);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      if (e instanceof SyntaxError) return json({ error: "badAction" }, 400);
      console.error(e && e.stack);
      return json({ error: "server" }, 500);
    }
  },
};
