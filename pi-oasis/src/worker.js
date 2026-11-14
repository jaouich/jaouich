// Pi Oasis – Cloudflare Worker (server)
// Pi sign-in (via App Studio), server-side game (anti-cheat), VIP payments, 10% referrals, weekly leaderboard.
// Static files in /public are served by Workers Static Assets (see wrangler.toml).
import "../public/kombat-logic.js";
import "../public/logic.js";
import { processPayouts } from "./payouts.js";
import { publicKeyOf, decodeStrKey, assetXdr, opChangeTrust, opPayment, opSetHomeDomain, opCreateAccount, newSeed, submitOp, toStroops, HORIZON } from "./stellar.js";

const KL = globalThis.KombatLogic;
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
async function pi(env, path, { method = "GET", body, key } = {}) {
  const r = await fetch(PI_API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${key || env.PI_NETWORK_API_KEY}`,
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

// Pi ties every payment to the app it was made in, and each Pi app has its own API key.
// The game can be opened from two Pi apps (the Developer Portal app and the App Studio app),
// so the payment is looked up with each configured key until Pi knows it. The key that found
// it is the one used to approve and complete it.
async function findPayment(env, id) {
  const path = `/payments/${encodeURIComponent(id)}`;
  const keys = [env.PI_NETWORK_API_KEY, env.PI_STUDIO_API_KEY].filter(Boolean);
  let last = null;
  for (const key of keys) {
    const r = await fetch(PI_API + path, { headers: { "Content-Type": "application/json", Authorization: `Key ${key}` } });
    if (r.ok) return { p: await r.json(), key };
    last = { status: r.status, data: await r.json().catch(() => ({})) };
    if (r.status !== 404) break;
  }
  console.error("Pi API", path, last && last.status, JSON.stringify(last && last.data));
  await logError(env, `Pi API GET ${path}`, last ? last.status : 0, (last && (last.data.error_message || last.data.error || last.data.message)) || "no API key configured");
  throw new HttpError(502, "server");
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
  "CREATE TABLE IF NOT EXISTS kombat_weeks ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, earned INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE INDEX IF NOT EXISTS kombat_weeks_rank ON kombat_weeks(week_id, earned DESC)",
  "CREATE TABLE IF NOT EXISTS kombat_week_claims ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, place INTEGER NOT NULL, prize INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS jry_keys ( id INTEGER PRIMARY KEY, seed TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS jry_sends ( uid TEXT PRIMARY KEY, address TEXT NOT NULL, amount TEXT NOT NULL, txid TEXT, status TEXT NOT NULL, error TEXT, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS airdrop_block ( username TEXT PRIMARY KEY COLLATE NOCASE, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS boss ( id INTEGER PRIMARY KEY AUTOINCREMENT, lvl INTEGER NOT NULL, hp INTEGER NOT NULL, max_hp INTEGER NOT NULL, started_at INTEGER NOT NULL, killed_at INTEGER, killer TEXT )",
  "CREATE TABLE IF NOT EXISTS boss_hits ( boss_id INTEGER NOT NULL, uid TEXT NOT NULL, dmg INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (boss_id, uid) )",
  "CREATE TABLE IF NOT EXISTS payouts ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, uid TEXT NOT NULL, amount REAL NOT NULL, memo TEXT, pi_payment_id TEXT, txid TEXT, status TEXT NOT NULL, error TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (kind, ref, uid) )",
];
let schemaReady = null;
const ensureSchema = (env) =>
  (schemaReady ||= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)))
    // Column added after launch; fails harmlessly once it exists
    .then(() => env.DB.prepare("ALTER TABLE users ADD COLUMN vip_tier TEXT").run().catch(() => {}))
    // Hashed network fingerprint (never the IP itself), to spot many accounts from one place
    .then(() => env.DB.prepare("ALTER TABLE users ADD COLUMN net TEXT").run().catch(() => {}))
    // Player's Pi Testnet wallet address (public G...), to receive test JRY
    .then(() => env.DB.prepare("ALTER TABLE users ADD COLUMN jry_wallet TEXT").run().catch(() => {}))
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
    testGifts: isAdmin(env, u) && isTestnet(env),
    vipUntil: u.vip_until,
    referralBalance: u.ref_balance,
    referralCount: c.n,
    activeRefs: await activeRefs(env, u.uid),
    jryWallet: u.jry_wallet || null,
    jryOn: !!env.JRY_ISSUER_SEED || isTestnet(env),
    invitedBy: inviter ? inviter.username : null,
    canSetInviter: !u.referrer && Date.now() - u.created_at < INVITER_DAYS * DAY,
  };
}

async function loadState(env, uid, now) {
  const row = await one(env, "SELECT json FROM state WHERE uid = ?", uid);
  return L.normalize(row ? JSON.parse(row.json) : null, now);
}
async function saveState(env, uid, s, now) {
  // Kombat weekly tournament row: at most once a minute (fewer database writes)
  const wk = s.kombat && s.kombat.wk;
  const saveWeek = wk && wk.n > 0 && now - (wk.at || 0) >= 60000;
  if (saveWeek) wk.at = now;
  await run(
    env,
    `INSERT INTO state (uid, json, week_id, week_score, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET json = excluded.json, week_id = excluded.week_id, week_score = excluded.week_score, updated_at = excluded.updated_at`,
    uid, JSON.stringify(s), s.week.id, s.week.score, now
  );
  // Kombat weekly tournament: coins earned this week, kept per week for the prizes
  if (saveWeek) {
    await run(
      env,
      `INSERT INTO kombat_weeks (week_id, uid, earned, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(week_id, uid) DO UPDATE SET earned = excluded.earned, updated_at = excluded.updated_at`,
      wk.id, uid, Math.floor(wk.n), now
    );
  }
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
let statsCache = null;
// Testnet server? The TESTNET_GIFTS setting, or the Testnet address the request came to
// (pi-oasis.… / oasisgame6033.…). The Mainnet server (jaouich.…) never matches.
let testnetHost = false;
const isTestnet = (env) => env.TESTNET_GIFTS === "1" || testnetHost;
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
    const net = await netHash(req, env);
    if (net) await run(env, "UPDATE users SET net = ? WHERE uid = ?", net, me.uid);
    u = await one(env, "SELECT * FROM users WHERE uid = ?", me.uid);
    const session = randomToken();
    await run(env, "INSERT INTO sessions (token, uid, created_at) VALUES (?, ?, ?)", session, me.uid, now);
    const acc = await account(env, u);
    return { session, user: { username: u.username }, account: acc, state: await stateFor(env, u, now, acc.tier), now, publicUrl: env.PUBLIC_URL || "", via: me.via,
      // Opened from the App Studio app: payments only work there once its API key is configured
      canBuy: me.via !== "appstudio" || !!env.PI_STUDIO_API_KEY };
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
      const refs = a.type === "kTask" ? await activeRefs(env, u.uid) : 0;
      res = L.apply(state, a, { now, tier, adVerified, rand: secureRandom, refs });
    } catch (e) {
      if (e instanceof L.GameError) return json({ error: e.code, vars: e.vars, state, now }, 400);
      throw e;
    }
    await saveState(env, u.uid, res.s, now);
    if (a.type === "kTap" && res.dmg > 0) await bossHit(env, u.uid, res.dmg, now).catch((e) => logError(env, "boss hit", 0, e.message));
    return { state: res.s, msg: res.msg, now };
  },

  // ---------- Payments (User → App) ----------
  // Products: 30 days of bronze / silver / gold, metadata { type: "vip_month", tier }.
  // Prices are owned by the server (L.TIERS).
  "POST /api/payments/approve": async (req, env, body) => {
    const u = await auth(req, env);
    const id = String(body.paymentId || "");
    if (!id) bad("badPayment");
    const { p, key } = await findPayment(env, id);
    const item = checkPayment(p, u.uid);
    // A lower tier than the active one would be a downgrade: stop before any Pi moves
    const nowT = Date.now();
    if (item.tier && u.vip_until > nowT && item.price < L.TIERS[paidTier(u, nowT)].price) bad("lowerTier");
    // Persist the payment id before approving (irreversible on Pi's side)
    await run(env, "INSERT OR IGNORE INTO payments (id, uid, amount, status, created_at) VALUES (?, ?, ?, 'pending', ?)", id, u.uid, item.price, nowT);
    const row = await one(env, "SELECT uid, status FROM payments WHERE id = ?", id);
    if (row.uid !== u.uid) bad("notYours");
    if (!p.status?.developer_approved) await pi(env, `/payments/${encodeURIComponent(id)}/approve`, { method: "POST", key });
    await run(env, "UPDATE payments SET status = 'approved' WHERE id = ? AND status = 'pending'", id);
    return { ok: true };
  },

  "POST /api/payments/complete": async (req, env, body) => {
    const u = await auth(req, env);
    if (!body.paymentId || !body.txid) bad("badPayment");
    await completePayment(env, String(body.paymentId), String(body.txid), u.uid);
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const nowT = Date.now();
    return { ok: true, account: await account(env, fresh), state: await stateFor(env, fresh, nowT, tierOf(fresh, nowT, await isPartner(env, fresh.username))) };
  },

  // A payment that didn't finish earlier (e.g. connection lost). Called during sign-in,
  // before our session exists, so everything is re-checked with Pi and our own records.
  "POST /api/payments/incomplete": async (req, env, body) => {
    const id = body.payment?.identifier;
    if (!id) return { ok: false };
    const { p } = await findPayment(env, String(id));
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
      studioKeyConfigured: !!env.PI_STUDIO_API_KEY,
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

  // Jerry Kombat ranking. All time: coins held now (the league follows them).
  // ?week=1: this week's tournament (coins earned since Monday) + my prize from last week.
  "GET /api/kombat/top": async (req, env) => {
    const now = Date.now();
    if (new URL(req.url).searchParams.get("week")) {
      const wid = KL.weekId(now), last = KL.weekId(now - 7 * DAY);
      const top = await all(env, "SELECT u.username, w.earned AS total FROM kombat_weeks w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? ORDER BY w.earned DESC, w.updated_at ASC LIMIT 50", wid);
      let prize = null;
      try {
        const me = await auth(req, env);
        prize = await weekPrize(env, me.uid, last);
      } catch {}
      return { top, ends: wid + 7 * DAY, prize, prizes: KL.WEEK_PRIZES };
    }
    const rows = await all(
      env,
      `SELECT u.username, CAST(json_extract(s.json, '$.kombat.coins') AS INTEGER) AS total
       FROM state s JOIN users u ON u.uid = s.uid
       WHERE json_extract(s.json, '$.kombat.coins') > 0 ORDER BY total DESC LIMIT 50`
    );
    return { top: rows };
  },

  // Weekly tournament: the top 10 of last week collect their prize once
  "POST /api/kombat/week/claim": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), last = KL.weekId(now - 7 * DAY);
    const p = await weekPrize(env, u.uid, last);
    if (!p || p.claimed) bad("k.noWeekPrize");
    const r = await run(env, "INSERT OR IGNORE INTO kombat_week_claims (week_id, uid, place, prize, at) VALUES (?, ?, ?, ?, ?)", last, u.uid, p.place, p.prize, now);
    if (!r.meta.changes) bad("k.noWeekPrize");
    const tier = tierOf(u, now, await isPartner(env, u.username));
    const st = await stateFor(env, u, now, tier);
    st.kombat = KL.norm(st.kombat, now);
    st.kombat.coins += p.prize; st.kombat.total += p.prize;
    st.kombat.earn.tourney = (st.kombat.earn.tourney || 0) + p.prize; // not counted in the new week
    await saveState(env, u.uid, st, now);
    return { state: st, n: p.prize, place: p.place, now };
  },

  // Community goal: total players vs the airdrop goal (cached for a minute)
  "GET /api/stats": async (req, env) => {
    const now = Date.now();
    if (!statsCache || now - statsCache.at > 60000) {
      const r = await one(env, "SELECT COUNT(*) AS n FROM users");
      statsCache = { at: now, players: r.n };
    }
    return { players: statsCache.players, goal: KL.AIRDROP_GOAL };
  },

  // Community boss: current boss, best hitters, my damage and rewards waiting
  "GET /api/kombat/boss": async (req, env) => {
    const now = Date.now();
    const b = await currentBoss(env, now);
    let me = null;
    try { me = await auth(req, env); } catch {}
    const top = await all(env, "SELECT u.username, h.dmg FROM boss_hits h JOIN users u ON u.uid = h.uid WHERE h.boss_id = ? ORDER BY h.dmg DESC LIMIT 5", b.id);
    const last = await one(env, "SELECT b.lvl, u.username AS killer FROM boss b LEFT JOIN users u ON u.uid = b.killer WHERE b.killed_at IS NOT NULL ORDER BY b.id DESC LIMIT 1");
    let mine = 0, reward = 0;
    if (me) {
      const h = await one(env, "SELECT dmg FROM boss_hits WHERE boss_id = ? AND uid = ?", b.id, me.uid);
      mine = h ? h.dmg : 0;
      reward = await bossReward(env, me.uid);
    }
    return { boss: { lvl: b.lvl, hp: Math.max(0, b.hp), max: b.max_hp }, top, mine, reward, last };
  },

  "POST /api/kombat/boss/claim": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    // Mark first (only once), then pay what was marked
    const rows = await all(
      env,
      "UPDATE boss_hits SET claimed = 1 WHERE uid = ? AND claimed = 0 AND boss_id IN (SELECT id FROM boss WHERE killed_at IS NOT NULL) RETURNING boss_id, dmg",
      u.uid
    );
    if (!rows.length) bad("k.noBossReward");
    let n = 0;
    for (const r of rows) {
      n += r.dmg;
      const b = await one(env, "SELECT lvl, killer FROM boss WHERE id = ?", r.boss_id);
      if (b && b.killer === u.uid) n += KL.KILL_BONUS(b.lvl);
    }
    const tier = tierOf(u, now, await isPartner(env, u.username));
    const st = await stateFor(env, u, now, tier);
    st.kombat = KL.norm(st.kombat, now);
    st.kombat.coins += n; st.kombat.total += n;
    st.kombat.earn.boss = (st.kombat.earn.boss || 0) + n;
    st.kombat.wk.n += n;
    await saveState(env, u.uid, st, now);
    return { state: st, n, now };
  },

  // Owner: the Airdrop list — who earned what, from where, days played, and warning signs
  "POST /api/admin/airdrop": async (req, env) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now();
    const rows = await all(
      env,
      `SELECT u.username, u.created_at, u.net, json_extract(s.json, '$.kombat') AS k,
         (SELECT COUNT(*) FROM users o WHERE o.net = u.net AND o.uid != u.uid) AS same_net,
         EXISTS (SELECT 1 FROM airdrop_block b WHERE b.username = u.username) AS blocked
       FROM users u JOIN state s ON s.uid = u.uid
       WHERE json_extract(s.json, '$.kombat.total') > 0
       ORDER BY CAST(json_extract(s.json, '$.kombat.coins') AS INTEGER) DESC LIMIT 5000`
    );
    const players = rows.map((r) => {
      const k = KL.norm(JSON.parse(r.k), now);
      const flags = KL.flags(k);
      if (r.net && r.same_net >= 3) flags.push("network"); // 4+ accounts from one network: check by hand
      const days = k.act.days;
      return {
        username: r.username, joined: r.created_at, coins: Math.floor(k.coins), total: Math.floor(k.total), days, earn: k.earn,
        taps: k.stats.taps, sameNet: r.net ? r.same_net : 0, flags, blocked: !!r.blocked,
        eligible: !r.blocked && days >= KL.AIRDROP_DAYS && !flags.length,
      };
    });
    return {
      players,
      minDays: KL.AIRDROP_DAYS,
      count: players.length,
      eligible: players.filter((p) => p.eligible).length,
      flagged: players.filter((p) => p.flags.length).length,
      blocked: players.filter((p) => p.blocked).length,
    };
  },

  // Owner: leave a player out of the Airdrop (or put them back)
  "POST /api/admin/airdrop/block": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const name = String(body.username || "").trim();
    if (!/^[A-Za-z0-9_.#-]{1,80}$/.test(name)) bad("badUsername");
    if (body.on) await run(env, "INSERT OR IGNORE INTO airdrop_block (username, at) VALUES (?, ?)", name, Date.now());
    else await run(env, "DELETE FROM airdrop_block WHERE username = ?", name);
    return { ok: true };
  },

  // ---------- test JRY token (Pi Testnet) ----------
  // A player saves their Pi Testnet wallet address (public key only) to receive test JRY
  "POST /api/kombat/wallet": async (req, env, body) => {
    const u = await auth(req, env);
    const a = String(body.address || "").trim().toUpperCase();
    try { decodeStrKey(a, "G"); } catch { bad("k.badWallet"); }
    await run(env, "UPDATE users SET jry_wallet = ? WHERE uid = ?", a, u.uid);
    const status = await jryStatusOf(env, a);
    return { account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)), trust: status.trust, balance: status.balance };
  },

  // Owner tools: status, one-time setup (trustline + mint + home domain), sending
  "POST /api/admin/token": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const t = await jryConfig(env);
    if (body.action === "setup") {
      const s = await jryState(env, t);
      const done = [];
      // 0) activate the issuer wallet from the app wallet (2 Test-Pi)
      if (!s.issuerActive) { await submitOp({ seed: env.PI_WALLET_SEED, op: opCreateAccount(t.issuer, toStroops("2")), network: t.network }); done.push("issuer wallet"); }
      if (!s.distTrust) { await submitOp({ seed: env.PI_WALLET_SEED, op: opChangeTrust(t.asset), network: t.network }); done.push("trustline"); }
      // mint up to the total supply (also tops up if an earlier, smaller amount was minted)
      const missing = toStroops(t.supply) - toStroops(String(s.supply || "0"));
      if (missing > 0n) {
        const amt = (missing / 10000000n).toString() + "." + (missing % 10000000n).toString().padStart(7, "0");
        await submitOp({ seed: t.seed, op: opPayment(t.dist, t.asset, missing), network: t.network });
        done.push("mint " + amt.replace(/\.0+$/, ""));
      }
      if (s.home !== t.home) { await submitOp({ seed: t.seed, op: opSetHomeDomain(t.home), network: t.network }); done.push("home domain"); }
      return { done, ...(await jryState(env, t)) };
    }
    if (body.action === "send") {
      const to = String(body.to || "").trim().toUpperCase();
      try { decodeStrKey(to, "G"); } catch { bad("k.badWallet"); }
      const txid = await jrySend(env, t, to, String(body.amount || "0"));
      return { txid, ...(await jryState(env, t)) };
    }
    if (body.action === "airdrop") {
      // Trial airdrop: a fixed amount to eligible players who saved a wallet with a trustline (10 per press)
      const amount = String(body.amount || "100");
      toStroops(amount);
      const rows = await all(env, `SELECT u.uid, u.username, u.jry_wallet FROM users u WHERE u.jry_wallet IS NOT NULL
        AND u.uid NOT IN (SELECT uid FROM jry_sends WHERE status = 'sent') AND u.username NOT IN (SELECT username FROM airdrop_block) LIMIT 40`);
      const now = Date.now(), report = [];
      for (const r of rows) {
        if (report.length >= 10) break;
        const st = await one(env, "SELECT json FROM state WHERE uid = ?", r.uid);
        const k = st && KL.norm(JSON.parse(st.json).kombat, now);
        if (!k || k.act.days < KL.AIRDROP_DAYS || KL.flags(k).length) continue; // eligible players only
        try {
          const txid = await jrySend(env, t, r.jry_wallet, amount);
          await run(env, "INSERT OR REPLACE INTO jry_sends (uid, address, amount, txid, status, at) VALUES (?, ?, ?, ?, 'sent', ?)", r.uid, r.jry_wallet, amount, txid, now);
          report.push({ username: r.username, ok: true });
        } catch (e) {
          await run(env, "INSERT OR REPLACE INTO jry_sends (uid, address, amount, status, error, at) VALUES (?, ?, ?, 'failed', ?, ?)", r.uid, r.jry_wallet, amount, String(e.message).slice(0, 200), now);
          report.push({ username: r.username, ok: false, error: e.message });
        }
      }
      return { report, ...(await jryState(env, t)) };
    }
    return await jryState(env, t);
  },

  // Owner: everyone who plays, to know them and reward them
  "POST /api/admin/players": async (req, env) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now(), wk = L.weekId(now);
    const rows = await all(
      env,
      `SELECT u.username, u.created_at, u.vip_until, u.vip_tier,
         s.updated_at AS seen, json_extract(s.json, '$.dates') AS dates, json_extract(s.json, '$.city.xp') AS xp,
         (SELECT score FROM week_scores w WHERE w.week_id = ? AND w.uid = u.uid) AS week,
         (SELECT COUNT(*) FROM users r WHERE r.referrer = u.uid) AS refs,
         (SELECT ROUND(COALESCE(SUM(amount), 0), 7) FROM payments p WHERE p.uid = u.uid AND p.status = 'completed') AS paid,
         EXISTS (SELECT 1 FROM partners pa WHERE pa.username = u.username) AS partner
       FROM users u LEFT JOIN state s ON s.uid = u.uid
       ORDER BY COALESCE(s.updated_at, u.created_at) DESC LIMIT 1000`,
      wk
    );
    const players = rows.map((r) => ({
      username: r.username,
      joined: r.created_at,
      seen: r.seen || r.created_at,
      dates: Math.floor(r.dates || 0),
      level: L.cityLevel(r.xp || 0),
      week: r.week || 0,
      refs: r.refs,
      paid: r.paid || 0,
      tier: r.partner ? "partner" : r.vip_until > now ? r.vip_tier || "silver" : "free",
    }));
    const day = 86400000;
    return {
      players,
      total: (await one(env, "SELECT COUNT(*) AS n FROM users")).n,
      today: players.filter((p) => now - p.seen < day).length,
      week: players.filter((p) => now - p.seen < 7 * day).length,
      members: players.filter((p) => p.tier !== "free").length,
    };
  },

  // Testnet only: small App-to-User gifts so the Pi portal sees A2U payments to 5+ different
  // wallets (needed before it gives a Mainnet app wallet). Never enabled on Mainnet.
  "POST /api/admin/test-gifts": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u) || !isTestnet(env)) throw new HttpError(403, "forbidden");
    if (body.action === "send") {
      const now = Date.now();
      const users = await all(env, "SELECT uid FROM users WHERE uid NOT IN (SELECT uid FROM payouts WHERE kind = 'gift') ORDER BY created_at DESC LIMIT 20");
      if (users.length) {
        await env.DB.batch(users.map((x) =>
          env.DB.prepare("INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'gift', 'testnet', ?, 0.01, 'Pi Oasis Testnet gift', 'new', ?, ?)")
            .bind(crypto.randomUUID(), x.uid, now, now)));
      }
      await runPayouts(env);
    }
    const gifts = await all(env, "SELECT u.username, p.status, p.error FROM payouts p LEFT JOIN users u ON u.uid = p.uid WHERE p.kind = 'gift' ORDER BY p.created_at DESC LIMIT 50");
    const players = await one(env, "SELECT COUNT(*) AS n FROM users");
    return { gifts, paid: gifts.filter((g) => g.status === "completed").length, players: players.n };
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

// Checks a Pi payment against what this app sells, at the server's prices. Browser input is never trusted.
// Products: { type: "vip_month", tier } (30 days of a membership) or { type: "dates", pack } (date shop).
function checkPayment(p, uid) {
  if (p.direction && p.direction !== "user_to_app") bad("badPayment");
  if (uid && p.user_uid !== uid) bad("notYours");
  if (p.status?.cancelled || p.status?.user_cancelled) bad("badPayment");
  if (p.metadata?.type === "dates") {
    const pack = L.PACKS.find((x) => x.id === p.metadata.pack);
    if (!pack || Number(p.amount) !== pack.price) bad("badPayment");
    return { price: pack.price, pack };
  }
  // no tier = bronze, the first product
  const tier = L.TIERS.find((x) => x.price && x.id === (p.metadata?.tier || "bronze"));
  if (!tier || p.metadata?.type !== "vip_month" || Number(p.amount) !== tier.price) bad("badPayment");
  return { price: tier.price, tier };
}

async function completePayment(env, id, txid, uid) {
  const { p, key } = await findPayment(env, id);
  const item = checkPayment(p, uid);
  // Must be a payment this server approved for this same user
  const row = await one(env, "SELECT uid, status FROM payments WHERE id = ?", id);
  if (!row || row.uid !== p.user_uid) bad("badPayment");
  if (row.status === "completed") return; // already granted: idempotent
  // The txid must be the one Pi recorded for this payment
  if (!p.transaction || p.transaction.txid !== txid) bad("badPayment");
  if (!p.status?.developer_completed) {
    await pi(env, `/payments/${encodeURIComponent(id)}/complete`, { method: "POST", body: { txid }, key });
  }
  const now = Date.now();
  // Mark completed once; only the first call grants VIP and credits anything
  const r = await run(env, "UPDATE payments SET status = 'completed', txid = ? WHERE id = ? AND status != 'completed'", txid, id);
  if (!r.meta.changes) return;
  const u = await one(env, "SELECT * FROM users WHERE uid = ?", p.user_uid);
  const wid = L.weekId(now);
  const stmts = [
    env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(wid, round(net(item.price) * PRIZE_RATE)),
  ];
  if (u) {
    if (item.tier) stmts.push(await applyMembership(env, u, item.tier, now));
    if (item.pack) {
      // Bought dates go to the balance only: they never count toward the weekly ranking
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      stmts.push(env.DB.prepare("UPDATE state SET json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?").bind(item.pack.dates, item.pack.dates, u.uid));
    }
    if (u.referrer) {
      stmts.push(env.DB.prepare("UPDATE users SET ref_balance = ROUND(ref_balance + ?, 7) WHERE uid = ?").bind(round(net(item.price) * REFERRAL_RATE), u.referrer));
      stmts.push(env.DB.prepare("UPDATE payments SET referrer_uid = ? WHERE id = ?").bind(u.referrer, id));
    }
  }
  await env.DB.batch(stmts);
}

// ---------- test JRY helpers ----------
// Issuer wallet: the JRY_ISSUER_SEED secret if set; otherwise, on Testnet only, a wallet the
// server creates once and keeps in the database (test tokens have no value; never on Mainnet).
async function jryIssuerSeed(env, create) {
  if (env.JRY_ISSUER_SEED) return env.JRY_ISSUER_SEED;
  if (!isTestnet(env)) return null;
  let row = await one(env, "SELECT seed FROM jry_keys WHERE id = 1");
  if (!row && create) {
    await run(env, "INSERT OR IGNORE INTO jry_keys (id, seed, created_at) VALUES (1, ?, ?)", await newSeed(), Date.now());
    row = await one(env, "SELECT seed FROM jry_keys WHERE id = 1");
  }
  return row ? row.seed : null;
}
async function jryConfig(env) {
  const seed = await jryIssuerSeed(env, true);
  if (!seed || !env.PI_WALLET_SEED) bad("k.tokenOff");
  const code = env.JRY_CODE || "testJRY";
  const issuer = await publicKeyOf(seed);
  return { seed, code, issuer, dist: await publicKeyOf(env.PI_WALLET_SEED), asset: assetXdr(code, issuer), network: "Pi Testnet",
    home: env.JRY_HOME || "pi-oasis.jaouich.workers.dev", supply: env.JRY_SUPPLY || "10000000000" }; // 10 billion test JRY
}
const horizonGet = async (path) => { const r = await fetch(HORIZON["Pi Testnet"] + path); return r.ok ? r.json() : null; };
const jryLine = (acct, t) => (acct && acct.balances || []).find((b) => b.asset_code === t.code && b.asset_issuer === t.issuer);
async function jryState(env, t) {
  const [dist, iss, asset] = await Promise.all([horizonGet(`/accounts/${t.dist}`), horizonGet(`/accounts/${t.issuer}`), horizonGet(`/assets?asset_code=${t.code}&asset_issuer=${t.issuer}`)]);
  const line = jryLine(dist, t), rec = asset && asset._embedded && asset._embedded.records[0];
  // Newer Horizon gives totals in balances.authorized / accounts.authorized (older: amount / num_accounts)
  const supply = rec ? String(rec.amount ?? (rec.balances && rec.balances.authorized) ?? "0") : "0";
  const holders = rec ? Number(rec.num_accounts ?? (rec.accounts && rec.accounts.authorized) ?? 0) : 0;
  const sent = await one(env, "SELECT COUNT(*) AS n FROM jry_sends WHERE status = 'sent'");
  const native = ((dist && dist.balances) || []).find((b) => b.asset_type === "native");
  return {
    appPi: native ? native.balance : "0",
    code: t.code, issuer: t.issuer, distributor: t.dist, home: (iss && iss.home_domain) || "", wantHome: t.home,
    issuerActive: !!(iss && iss.sequence), distTrust: !!line, distBalance: line ? line.balance : "0", minted: Number(supply) > 0,
    supply, target: t.supply, holders, sent: sent.n, toml: `https://${t.home}/.well-known/pi.toml`,
  };
}
async function jryStatusOf(env, address) {
  const seed = await jryIssuerSeed(env, false);
  if (!seed) return { trust: false, balance: "0" };
  const t = { code: env.JRY_CODE || "testJRY", issuer: await publicKeyOf(seed) };
  const line = jryLine(await horizonGet(`/accounts/${address}`), t);
  return { trust: !!line, balance: line ? line.balance : "0" };
}
async function jrySend(env, t, to, amount) {
  const st = await jryStatusOf(env, to);
  if (!st.trust) bad("k.noTrust");
  return submitOp({ seed: env.PI_WALLET_SEED, op: opPayment(to, t.asset, toStroops(amount)), network: t.network });
}

// Salted hash of the visitor's network address. Only used to notice many accounts from
// one place; the address itself is never stored.
async function netHash(req, env) {
  const ip = req.headers.get("CF-Connecting-IP");
  if (!ip) return null;
  const salt = env.PI_NETWORK_API_KEY || env.VALIDATION_KEY || "pi-oasis";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + ip));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// My place and prize in a finished week (null when outside the top 10)
async function weekPrize(env, uid, wid) {
  const me = await one(env, "SELECT earned, updated_at FROM kombat_weeks WHERE week_id = ? AND uid = ?", wid, uid);
  if (!me) return null;
  const ahead = await one(env, "SELECT COUNT(*) AS n FROM kombat_weeks WHERE week_id = ? AND (earned > ? OR (earned = ? AND updated_at < ?))", wid, me.earned, me.earned, me.updated_at);
  const place = ahead.n + 1;
  if (place > KL.WEEK_PRIZES.length) return null;
  const c = await one(env, "SELECT 1 AS x FROM kombat_week_claims WHERE week_id = ? AND uid = ?", wid, uid);
  return { place, prize: KL.WEEK_PRIZES[place - 1], claimed: !!c };
}

// Invited friends who really played Kombat (empty accounts don't count)
async function activeRefs(env, uid) {
  const r = await one(env, "SELECT COUNT(*) AS n FROM users f JOIN state s ON s.uid = f.uid WHERE f.referrer = ? AND json_extract(s.json, '$.kombat.act.days') >= 1", uid);
  return r ? r.n : 0;
}

// ---------- Community boss ----------
async function currentBoss(env, now) {
  let b = await one(env, "SELECT * FROM boss WHERE killed_at IS NULL ORDER BY id DESC LIMIT 1");
  if (b) return b;
  const last = await one(env, "SELECT lvl FROM boss ORDER BY id DESC LIMIT 1");
  const lvl = (last ? last.lvl : 0) + 1, hp = KL.bossHp(lvl);
  // Only one living boss at a time, even if two players arrive together
  await run(env, "INSERT INTO boss (lvl, hp, max_hp, started_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM boss WHERE killed_at IS NULL)", lvl, hp, hp, now);
  return one(env, "SELECT * FROM boss WHERE killed_at IS NULL ORDER BY id DESC LIMIT 1");
}
async function bossHit(env, uid, dmg, now) {
  const b = await currentBoss(env, now);
  await env.DB.batch([
    env.DB.prepare("UPDATE boss SET hp = hp - ? WHERE id = ? AND killed_at IS NULL").bind(dmg, b.id),
    env.DB.prepare("INSERT INTO boss_hits (boss_id, uid, dmg) VALUES (?, ?, ?) ON CONFLICT(boss_id, uid) DO UPDATE SET dmg = dmg + excluded.dmg").bind(b.id, uid, dmg),
  ]);
  // The tap that takes it to 0 is the final blow; the next, stronger boss appears.
  // Most hits leave it alive: skip the check then (one database call less).
  if (b.hp - dmg > 0) return;
  const k = await run(env, "UPDATE boss SET killed_at = ?, killer = ? WHERE id = ? AND killed_at IS NULL AND hp <= 0", now, uid, b.id);
  if (k.meta.changes) await currentBoss(env, now);
}
async function bossReward(env, uid) {
  const rows = await all(env, "SELECT h.dmg, b.lvl, b.killer FROM boss_hits h JOIN boss b ON b.id = h.boss_id WHERE h.uid = ? AND h.claimed = 0 AND b.killed_at IS NOT NULL", uid);
  return rows.reduce((n, r) => n + r.dmg + (r.killer === uid ? KL.KILL_BONUS(r.lvl) : 0), 0);
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
    if (/^pi-oasis\.|^oasisgame6033\./.test(url.hostname)) testnetHost = true;
    // Pi Developer Portal domain check: each Worker (Testnet / Mainnet) has its own key
    if (url.pathname === "/validation-key.txt") {
      return env.VALIDATION_KEY
        ? new Response(env.VALIDATION_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
        : new Response("not found", { status: 404 });
    }
    // Token metadata Pi Wallet reads to list test JRY (see docs: Tokens → pi.toml)
    if (url.pathname === "/.well-known/pi.toml") {
      await ensureSchema(env);
      const seed = await jryIssuerSeed(env, false);
      if (!seed) return new Response("not found", { status: 404 });
      const issuer = await publicKeyOf(seed);
      const host = env.JRY_HOME || url.host;
      const toml = `[[CURRENCIES]]\ncode="${env.JRY_CODE || "testJRY"}"\nissuer="${issuer}"\nname="Jerry Development"\ndesc="test JRY: the Testnet token of Jerry Kombat in Pi Oasis. For testing only, it has no value."\nimage="https://${host}/jry.png"\n`;
      return new Response(toml, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
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
