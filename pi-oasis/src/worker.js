// Pi Oasis – Cloudflare Worker (server)
// Pi sign-in (via App Studio), server-side game (anti-cheat), VIP payments, 10% referrals, weekly leaderboard.
// Static files in /public are served by Workers Static Assets (see wrangler.toml).
import "../public/logic.js";
import { processPayouts } from "./payouts.js";
import { publicKeyOf } from "./stellar.js";

const L = globalThis.OasisLogic;
const PI_API = "https://api.minepi.com/v2";
// Pi sign-in: the access token is exchanged with App Studio, which checks it with
// the Pi Platform. Only the identity it returns is trusted.
const APP_STUDIO_LOGIN = "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login";
const VIP_PRICE = 0.25;
const VIP_DAYS = 30;
// On Mainnet Pi keeps 30% of App Studio item sales, so the app receives 70%.
// Referral and prize shares are taken from what the app actually receives.
const APP_SHARE = 0.7;
const net = (amount) => amount * APP_SHARE; // e.g. 0.175 Pi of a 0.25 Pi payment
const REFERRAL_RATE = 0.1; // 10% of NET on every monthly renewal
const PRIZE_RATE = 0.15; // 15% of NET goes to the weekly prize pool
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
      Authorization: `Key ${env.PI_NETWORK_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Pi API", path, r.status, JSON.stringify(data));
    await logError(env, `Pi API ${method} ${path}`, r.status, data.error_message || data.error || data.message || "");
    // A Pi API failure is a server-side problem (e.g. wrong API key), never the player's session
    throw new HttpError(502, "server");
  }
  return data;
}

// Recent server errors, kept so problems can be diagnosed without dashboard access.
// Never stores secrets: only the route, HTTP status and Pi's error message.
async function logError(env, where, status, message) {
  try {
    await ensureSchema(env);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO errlog (at, place, status, message) VALUES (?, ?, ?, ?)").bind(Date.now(), String(where).slice(0, 200), status || 0, String(message).slice(0, 300)),
      env.DB.prepare("DELETE FROM errlog WHERE at < ?").bind(Date.now() - 7 * DAY),
    ]);
  } catch {}
}

// Verifies a Pi access token on the server and returns the trusted identity.
// 1) App Studio exchange (for the App Studio app).
// 2) Otherwise the Pi Platform /v2/me check, which is the documented method for apps
//    registered in the Pi Developer Portal (App Studio doesn't know those apps).
async function verifyPiUser(accessToken) {
  try {
    const r = await fetch(APP_STUDIO_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.user && data.user.uid && data.user.username) {
      return { uid: String(data.user.uid), username: String(data.user.username), via: "appstudio" };
    }
    console.log("App Studio login not accepted", r.status);
  } catch (e) {
    console.log("App Studio login unreachable", e && e.message);
  }
  const r = await fetch(`${PI_API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const me = await r.json().catch(() => ({}));
  if (!r.ok || !me.uid || !me.username) {
    console.error("Pi /me", r.status);
    throw new HttpError(r.status >= 500 ? 502 : 401, r.status >= 500 ? "server" : "session");
  }
  return { uid: String(me.uid), username: String(me.username), via: "portal" };
}

async function moveAccount(env, from, to) {
  const q = (sql) => env.DB.prepare(sql).bind(to, from);
  await env.DB.batch([
    q("UPDATE users SET uid = ? WHERE uid = ?"),
    q("UPDATE users SET referrer = ? WHERE referrer = ?"),
    q("UPDATE sessions SET uid = ? WHERE uid = ?"),
    q("UPDATE state SET uid = ? WHERE uid = ?"),
    q("UPDATE payments SET uid = ? WHERE uid = ?"),
    q("UPDATE payments SET referrer_uid = ? WHERE referrer_uid = ?"),
    q("UPDATE withdrawals SET uid = ? WHERE uid = ?"),
    q("UPDATE ads SET uid = ? WHERE uid = ?"),
    q("UPDATE week_scores SET uid = ? WHERE uid = ?"),
    q("UPDATE payouts SET uid = ? WHERE uid = ?"),
  ]);
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
  "CREATE TABLE IF NOT EXISTS errlog ( at INTEGER NOT NULL, place TEXT NOT NULL, status INTEGER, message TEXT )",
  "CREATE TABLE IF NOT EXISTS partners ( username TEXT PRIMARY KEY COLLATE NOCASE, granted_by TEXT, granted_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS week_rewards ( week_id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS week_scores ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, score INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE INDEX IF NOT EXISTS week_scores_rank ON week_scores(week_id, score DESC)",
  "CREATE TABLE IF NOT EXISTS payouts ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, uid TEXT NOT NULL, amount REAL NOT NULL, memo TEXT, pi_payment_id TEXT, txid TEXT, status TEXT NOT NULL, error TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (kind, ref, uid) )",
];
let schemaReady = null;
const ensureSchema = (env) =>
  (schemaReady ||= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)))
    // Column added after launch; fails harmlessly once it exists
    .then(() => env.DB.prepare("ALTER TABLE users ADD COLUMN vip_tier TEXT").run().catch(() => {}))
    .catch((e) => { schemaReady = null; throw e; }));

const one = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const all = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
const run = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();

const INVITER_DAYS = 7; // a new player can add who invited them during their first week

// ---------- Memberships ----------
// Paid tiers (bronze/silver/gold) last 30 days per payment. "partner" is granted by an
// admin to Jerry Development partners (by Pi username) and is never sold.
const PARTNER = L.tierIndex("partner");
const isPartner = async (env, username) => !!(await one(env, "SELECT 1 AS x FROM partners WHERE username = ?", username));
const paidTier = (u, now) => (u.vip_until > now ? L.tierIndex(u.vip_tier || "silver") : 0); // early VIPs = silver perks
const tierOf = (u, now, partner) => (partner ? PARTNER : paidTier(u, now));
const isAdmin = (env, u) =>
  String(env.ADMIN_USERNAMES || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean).includes(u.username.toLowerCase());

// Adds 30 days of a paid tier. Remaining time on another tier is converted by price,
// so nobody loses what they paid for.
async function applyMembership(env, u, tier, now) {
  const cur = u.vip_until > now ? L.TIERS[paidTier(u, now)] : null;
  const month = VIP_DAYS * DAY;
  let until, id = tier.id;
  if (!cur) until = now + month;
  else if (cur.id === tier.id) until = u.vip_until + month;
  else if (tier.price > cur.price) until = now + month + Math.floor((u.vip_until - now) * (cur.price / tier.price));
  else { until = u.vip_until + Math.floor(month * (tier.price / cur.price)); id = cur.id; }
  return env.DB.prepare("UPDATE users SET vip_until = ?, vip_tier = ? WHERE uid = ?").bind(until, id, u.uid);
}

// Loads the game and gives a new partner their welcome gift (a legendary camel, once)
async function stateFor(env, u, now, tier) {
  const st = await loadState(env, u.uid, now);
  let changed = L.tickCity(st, now, secureRandom); // new city orders appear on their own
  if (tier === PARTNER && !st.partnerGift) {
    L.addAnimal(st, 3, now, "partner");
    st.partnerGift = 1;
    changed = true;
  }
  if (changed) await saveState(env, u.uid, st, now);
  return st;
}

async function account(env, u) {
  const now = Date.now();
  const tier = tierOf(u, now, await isPartner(env, u.username));
  const c = await one(env, "SELECT COUNT(*) AS n FROM users WHERE referrer = ?", u.uid);
  const inviter = u.referrer ? await one(env, "SELECT username FROM users WHERE uid = ?", u.referrer) : null;
  return {
    username: u.username,
    tier,
    tierId: L.TIERS[tier].id,
    isAdmin: isAdmin(env, u),
    vipUntil: u.vip_until,
    referralBalance: u.ref_balance,
    referralCount: c.n,
    invitedBy: inviter ? inviter.username : null,
    canSetInviter: !u.referrer && Date.now() - u.created_at < INVITER_DAYS * DAY,
  };
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
  // Scores are also kept per week, so last week's ranking survives once players move on
  if (s.week.score > 0) {
    await run(
      env,
      `INSERT INTO week_scores (week_id, uid, score, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(week_id, uid) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`,
      s.week.id, uid, s.week.score, now
    );
  }
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

// Server-side luck (breeding, stake bonus): not predictable by players
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Weekly ranking rewards: #1 legendary camel, #2 epic, #3 rare (given once per week)
async function grantWeeklyCamels(env) {
  await ensureSchema(env);
  const now = Date.now();
  const lastWeek = L.weekId(now - 7 * DAY);
  const claim = await run(env, "INSERT OR IGNORE INTO week_rewards (week_id, created_at) VALUES (?, ?)", lastWeek, now);
  if (!claim.meta.changes) return 0; // already given
  const top = await all(env, "SELECT uid FROM week_scores WHERE week_id = ? AND score > 0 ORDER BY score DESC, updated_at ASC LIMIT 3", lastWeek);
  const rarity = [3, 2, 1];
  for (let i = 0; i < top.length; i++) {
    const st = await loadState(env, top[i].uid, now);
    L.addAnimal(st, rarity[i], now, `prize-${lastWeek}`);
    await saveState(env, top[i].uid, st, now);
  }
  return top.length;
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
    const me = await verifyPiUser(body.accessToken);
    const now = Date.now();
    let u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    if (!u) {
      // Pi gives each app its own uid for the same person. If this verified username
      // already has an account under another uid (e.g. the App Studio app), move that
      // account to the new uid so progress, VIP and referrals carry over.
      const prev = await one(env, "SELECT uid FROM users WHERE username = ?", me.username);
      if (prev) await moveAccount(env, prev.uid, me.uid);
      u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    }
    if (!u) {
      // Referral: only for new accounts, never yourself, one level only
      let referrer = null;
      if (body.ref && body.ref !== me.username) {
        const r = await one(env, "SELECT uid FROM users WHERE username = ?", String(body.ref));
        if (r) referrer = r.uid;
      }
      await run(env, "INSERT INTO users (uid, username, referrer, vip_until, ref_balance, created_at) VALUES (?, ?, ?, 0, 0, ?)", me.uid, me.username, referrer, now);
    } else if (u.username !== me.username) {
      // Username changed on Pi: free the name if a stale row still holds it
      await run(env, "UPDATE users SET username = username || '#' || uid WHERE username = ? AND uid != ?", me.username, me.uid);
      await run(env, "UPDATE users SET username = ? WHERE uid = ?", me.username, me.uid);
    }
    u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    const session = randomToken();
    await run(env, "INSERT INTO sessions (token, uid, created_at) VALUES (?, ?, ?)", session, me.uid, now);
    const acc = await account(env, u);
    return { session, user: { username: u.username }, account: acc, state: await stateFor(env, u, now, acc.tier), now, publicUrl: env.PUBLIC_URL || "", via: me.via };
  },

  "GET /api/me": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    const acc = await account(env, u);
    return { account: acc, state: await stateFor(env, u, now, acc.tier), now };
  },

  // Every game action runs here with the server's clock
  "POST /api/action": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const a = body.action || {};
    let adVerified = false;
    if (a.type === "speedup") adVerified = await verifyAd(env, u.uid, a.adId, now);
    const tier = tierOf(u, now, await isPartner(env, u.username));
    const state = await stateFor(env, u, now, tier);
    let res;
    try {
      res = L.apply(state, a, { now, tier, adVerified, rand: secureRandom });
    } catch (e) {
      if (e instanceof L.GameError) return json({ error: e.code, vars: e.vars, state, now }, 400);
      throw e;
    }
    await saveState(env, u.uid, res.s, now);
    return { state: res.s, msg: res.msg, now };
  },

  // ---------- Payments (User → App) ----------
  // Products: 30 days of bronze / silver / gold, metadata { type: "vip_month", tier }.
  // Prices are owned by the server (L.TIERS).
  "POST /api/payments/approve": async (req, env, body) => {
    const u = await auth(req, env);
    const id = String(body.paymentId || "");
    if (!id) bad("badPayment");
    const p = await pi(env, `/payments/${encodeURIComponent(id)}`);
    const tier = checkPayment(p, u.uid);
    // A lower tier than the active one would be a downgrade: stop before any Pi moves
    const nowT = Date.now();
    if (u.vip_until > nowT && tier.price < L.TIERS[paidTier(u, nowT)].price) bad("lowerTier");
    // Persist the payment id before approving (irreversible on Pi's side)
    await run(env, "INSERT OR IGNORE INTO payments (id, uid, amount, status, created_at) VALUES (?, ?, ?, 'pending', ?)", id, u.uid, tier.price, nowT);
    const row = await one(env, "SELECT uid, status FROM payments WHERE id = ?", id);
    if (row.uid !== u.uid) bad("notYours");
    if (!p.status?.developer_approved) await pi(env, `/payments/${encodeURIComponent(id)}/approve`, { method: "POST" });
    await run(env, "UPDATE payments SET status = 'approved' WHERE id = ? AND status = 'pending'", id);
    return { ok: true };
  },

  "POST /api/payments/complete": async (req, env, body) => {
    const u = await auth(req, env);
    if (!body.paymentId || !body.txid) bad("badPayment");
    await completePayment(env, String(body.paymentId), String(body.txid), u.uid);
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    return { ok: true, account: await account(env, fresh) };
  },

  // A payment that didn't finish earlier (e.g. connection lost). Called during sign-in,
  // before our session exists, so everything is re-checked with Pi and our own records.
  "POST /api/payments/incomplete": async (req, env, body) => {
    const id = body.payment?.identifier;
    if (!id) return { ok: false };
    const p = await pi(env, `/payments/${encodeURIComponent(String(id))}`);
    const txid = p.transaction?.txid;
    if (!txid) return { ok: false }; // user never sent the transaction: nothing to complete
    await completePayment(env, String(id), String(txid), null);
    return { ok: true };
  },

  // ---------- Leaderboard ----------
  // Health check: is the server set up, and what failed recently (no secrets shown)
  "GET /api/status": async (req, env) => {
    const errors = await all(env, "SELECT at, place, status, message FROM errlog ORDER BY at DESC LIMIT 10");
    return {
      piApiKeyConfigured: !!env.PI_NETWORK_API_KEY,
      payoutsConfigured: !!env.PI_WALLET_SEED,
      // Public address (G...) of the wallet the secret belongs to: safe to show, lets the
      // owner check it is the app wallet. Never the secret itself.
      payoutWalletAddress: env.PI_WALLET_SEED ? await publicKeyOf(env.PI_WALLET_SEED).catch(() => "invalid PI_WALLET_SEED") : null,
      payouts: await all(env, "SELECT kind, amount, status, error, updated_at FROM payouts ORDER BY created_at DESC LIMIT 10"),
      adminTokenConfigured: !!env.ADMIN_TOKEN,
      recentErrors: errors.map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    };
  },

  "GET /api/leaderboard": async (req, env) => {
    const wid = L.weekId(Date.now());
    const w = await one(env, "SELECT prize_pool FROM weeks WHERE id = ?", wid);
    const top = await all(
      env,
      `SELECT u.username, s.score, u.vip_until, u.vip_tier,
              EXISTS (SELECT 1 FROM partners p WHERE p.username = u.username) AS partner
       FROM week_scores s JOIN users u ON u.uid = s.uid
       WHERE s.week_id = ? AND s.score > 0 ORDER BY s.score DESC, s.updated_at ASC LIMIT 20`,
      wid
    );
    const now = Date.now();
    return {
      prizePool: w ? w.prize_pool : 0,
      top: top.map((r) => ({ username: r.username, score: r.score, tier: L.TIERS[tierOf(r, now, !!r.partner)].id })),
    };
  },

  // ---------- Referrals ----------
  // A new player types the username of who invited them (in case the link lost ?ref=)
  "POST /api/referral/set-inviter": async (req, env, body) => {
    const u = await auth(req, env);
    const name = String(body.username || "").trim().replace(/^@/, "");
    if (u.referrer || Date.now() - u.created_at >= INVITER_DAYS * DAY) bad("inviterNotAllowed");
    const r = await one(env, "SELECT uid, referrer FROM users WHERE username = ? COLLATE NOCASE", name);
    if (!r) bad("inviterNotFound");
    if (r.uid === u.uid || r.referrer === u.uid) bad("inviterNotAllowed"); // no self or two-way referrals
    await run(env, "UPDATE users SET referrer = ? WHERE uid = ? AND referrer IS NULL", r.uid, u.uid);
    return { account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)) };
  },

  "POST /api/referral/redeem-vip": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    // 0.25 Pi of referral balance = 30 days of Bronze (converted if a higher tier is active)
    const r = await run(env, "UPDATE users SET ref_balance = ROUND(ref_balance - ?, 7) WHERE uid = ? AND ref_balance >= ?", VIP_PRICE, u.uid, VIP_PRICE);
    if (!r.meta.changes) bad("needVipBalance");
    await (await applyMembership(env, u, L.TIERS[L.tierIndex("bronze")], now)).run();
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
  // Partner memberships: only the owner (ADMIN_USERNAMES, verified Pi sign-in) can manage them
  "POST /api/admin/partners": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const name = String(body.username || "").trim().replace(/^@/, "");
    if (body.action === "grant" || body.action === "revoke") {
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(name)) bad("badUsername");
      if (body.action === "grant") {
        await run(env, "INSERT OR IGNORE INTO partners (username, granted_by, granted_at) VALUES (?, ?, ?)", name, u.username, Date.now());
      } else {
        await run(env, "DELETE FROM partners WHERE username = ?", name);
      }
    }
    const partners = await all(
      env,
      "SELECT p.username, p.granted_at, EXISTS (SELECT 1 FROM users u WHERE u.username = p.username COLLATE NOCASE) AS joined FROM partners p ORDER BY p.granted_at DESC"
    );
    return { partners: partners.map((x) => ({ username: x.username, joined: !!x.joined })) };
  },

  "GET /api/admin/payouts": async (req, env) => {
    admin(req, env);
    return {
      payouts: await all(env, "SELECT p.*, u.username FROM payouts p LEFT JOIN users u ON u.uid = p.uid ORDER BY p.created_at DESC LIMIT 50"),
      withdrawals: await all(env, "SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 50"),
      weeks: await all(env, "SELECT * FROM weeks ORDER BY id DESC LIMIT 8"),
    };
  },

  // Run the payouts now instead of waiting for the hourly run
  "POST /api/admin/run-payouts": async (req, env) => {
    admin(req, env);
    return await runPayouts(env);
  },
};

function admin(req, env) {
  if (!env.ADMIN_TOKEN || req.headers.get("x-admin-token") !== env.ADMIN_TOKEN) throw new HttpError(403, "forbidden");
}

const runPayouts = (env) =>
  ensureSchema(env).then(() => processPayouts(env, { pi, logError, one, all, run, weekId: L.weekId }));

// Checks a Pi payment against what this app sells. Browser input is never trusted.
function checkPayment(p, uid) {
  if (p.direction && p.direction !== "user_to_app") bad("badPayment");
  if (uid && p.user_uid !== uid) bad("notYours");
  // Which membership is being bought, at the server's price (no tier = bronze, the first product)
  const tier = L.TIERS.find((x) => x.price && x.id === (p.metadata?.tier || "bronze"));
  if (!tier || p.metadata?.type !== "vip_month" || Number(p.amount) !== tier.price) bad("badPayment");
  if (p.status?.cancelled || p.status?.user_cancelled) bad("badPayment");
  return tier;
}

async function completePayment(env, id, txid, uid) {
  const p = await pi(env, `/payments/${encodeURIComponent(id)}`);
  const tier = checkPayment(p, uid);
  // Must be a payment this server approved for this same user
  const row = await one(env, "SELECT uid, status FROM payments WHERE id = ?", id);
  if (!row || row.uid !== p.user_uid) bad("badPayment");
  if (row.status === "completed") return; // already granted: idempotent
  // The txid must be the one Pi recorded for this payment
  if (!p.transaction || p.transaction.txid !== txid) bad("badPayment");
  if (!p.status?.developer_completed) {
    await pi(env, `/payments/${encodeURIComponent(id)}/complete`, { method: "POST", body: { txid } });
  }
  const now = Date.now();
  // Mark completed once; only the first call grants VIP and credits anything
  const r = await run(env, "UPDATE payments SET status = 'completed', txid = ? WHERE id = ? AND status != 'completed'", txid, id);
  if (!r.meta.changes) return;
  const u = await one(env, "SELECT * FROM users WHERE uid = ?", p.user_uid);
  const wid = L.weekId(now);
  const stmts = [
    env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(wid, round(net(tier.price) * PRIZE_RATE)),
  ];
  if (u) {
    stmts.push(await applyMembership(env, u, tier, now));
    if (u.referrer) {
      stmts.push(env.DB.prepare("UPDATE users SET ref_balance = ROUND(ref_balance + ?, 7) WHERE uid = ?").bind(round(net(tier.price) * REFERRAL_RATE), u.referrer));
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
  // Hourly: weekly prizes and referral withdrawals (see wrangler.toml [triggers])
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      grantWeeklyCamels(env)
        .catch((e) => logError(env, "weekly camels", 0, e.message))
        .then(() => runPayouts(env))
        .catch((e) => logError(env, "payouts run", 0, e.message))
    );
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    // Pi Developer Portal domain check: each Worker (Testnet / Mainnet) has its own key
    if (url.pathname === "/validation-key.txt") {
      return env.VALIDATION_KEY
        ? new Response(env.VALIDATION_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
        : new Response("not found", { status: 404 });
    }
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
      if (e instanceof HttpError) {
        if (url.pathname.startsWith("/api/payments/") || url.pathname === "/api/auth") {
          await logError(env, `refused ${req.method} ${url.pathname}`, e.status, e.code);
        }
        return json({ error: e.code }, e.status);
      }
      if (e instanceof SyntaxError) return json({ error: "badAction" }, 400);
      console.error(e && e.stack);
      await logError(env, `${req.method} ${url.pathname}`, 500, (e && e.message) || "error");
      return json({ error: "server" }, 500);
    }
  },
};
