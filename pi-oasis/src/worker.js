// Pi Oasis – Cloudflare Worker (server)
// Pi sign-in (via App Studio), server-side game (anti-cheat), VIP payments, 10% referrals, weekly leaderboard.
// Static files in /public are served by Workers Static Assets (see wrangler.toml).
import "../public/kombat-logic.js";
import "../public/logic.js";
import "../public/catalog-logic.js";
import "../public/castle-logic.js";
import "../public/vip-logic.js";
import "../public/derby-logic.js";
import "../public/arena-logic.js";
import { processPayouts } from "./payouts.js";
import { publicKeyOf, decodeStrKey, assetXdr, opChangeTrust, opPayment, opSetHomeDomain, opCreateAccount, newSeed, submitOp, toStroops, HORIZON } from "./stellar.js";

const KL = globalThis.KombatLogic;
const L = globalThis.OasisLogic;
const DL = globalThis.DerbyLogic;
const AR = globalThis.ArenaLogic;
const CAT = globalThis.CatalogLogic;
const CASTLE = globalThis.CastleLogic;
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
const DAILY_CODE_USES = 100; // the code of the day: the first 100 players (one use each), 24 h
const PRIZE_RATE = 0.15; // 15% of NET goes to the weekly prize pool
const MIN_WITHDRAW = 1;
const SESSION_DAYS = 30;
const DAY = 86400000;
// Jerry Castle rewards: first clear per map (stars add 25% each), more stars later pay the difference, replays are small and capped per day
const CASTLE_REWARD = { MAPS: [{ coins: 20000, dates: 300, replay: 3000 }, { coins: 40000, dates: 600, replay: 6000 }, { coins: 80000, dates: 1200, replay: 10000 }, { coins: 120000, dates: 2000, replay: 14000 }, { coins: 160000, dates: 3000, replay: 18000 }, { coins: 200000, dates: 4500, replay: 24000 }], REPLAYS: 3, ENDLESS_RUNS: 3, ENDLESS_COINS: 300 };

const round = (n) => Math.round(n * 1e7) / 1e7;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
class HttpError extends Error {
  constructor(status, code, vars) { super(code); this.status = status; this.code = code; this.vars = vars; }
}
const bad = (code, vars) => { throw new HttpError(400, code, vars); };
// Words never allowed in texts players publish or send (business listings, service requests)
const RULES_RE = /(casino|bet|gambl|poker|porn|xxx|forex|double your|guaranteed profit|قمار|رهان|كازينو)/i;

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
    const err = new HttpError(502, "server");
    err.detail = `Pi API ${r.status}: ${data.error_message || data.error || data.message || "error"}`; // shown to the owner in payout lists
    throw err;
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
  "CREATE TABLE IF NOT EXISTS polls ( id INTEGER PRIMARY KEY AUTOINCREMENT, q TEXT NOT NULL, options TEXT NOT NULL, created_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS poll_votes ( poll_id INTEGER NOT NULL, uid TEXT NOT NULL, opt INTEGER NOT NULL, weight INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (poll_id, uid) )",
  "CREATE TABLE IF NOT EXISTS partner_requests ( uid TEXT PRIMARY KEY, username TEXT NOT NULL, note TEXT, status TEXT NOT NULL, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS tribes ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, emoji TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS tribe_members ( uid TEXT PRIMARY KEY, tribe_id INTEGER NOT NULL, joined_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS tribe_members_t ON tribe_members(tribe_id)",
  "CREATE TABLE IF NOT EXISTS tribe_claims ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, place INTEGER NOT NULL, prize INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS tribe_left ( uid TEXT PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS nft_items ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, edition INTEGER NOT NULL, owner TEXT NOT NULL, price INTEGER, minted_at INTEGER NOT NULL, UNIQUE (kind, edition) )",
  "CREATE INDEX IF NOT EXISTS nft_owner ON nft_items(owner)",
  "CREATE TABLE IF NOT EXISTS castle_runs ( uid TEXT NOT NULL, map INTEGER NOT NULL, stars INTEGER NOT NULL DEFAULT 0, best_wave INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (uid, map) )",
  "CREATE TABLE IF NOT EXISTS level_claims ( uid TEXT NOT NULL, lvl INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, lvl) )",
  "CREATE TABLE IF NOT EXISTS merge_weeks ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, pts INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS merge_week_paid ( week_id INTEGER PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS merge_claims ( uid TEXT NOT NULL, lvl INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, lvl) )",
  "CREATE TABLE IF NOT EXISTS login_streak ( uid TEXT PRIMARY KEY, last INTEGER NOT NULL, n INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS ach ( uid TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, id) )",
  "CREATE TABLE IF NOT EXISTS season_claims ( season INTEGER NOT NULL, uid TEXT NOT NULL, tier INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (season, uid, tier) )",
  "CREATE TABLE IF NOT EXISTS league_div ( uid TEXT PRIMARY KEY, div INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS league_results ( season INTEGER NOT NULL, uid TEXT NOT NULL, div_from INTEGER, div_to INTEGER, sp INTEGER, rank INTEGER, size INTEGER, outcome TEXT, dates INTEGER, jry INTEGER, PRIMARY KEY (season, uid) )",
  "CREATE TABLE IF NOT EXISTS season_paid ( season INTEGER PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS castle_weeks ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, pts INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS castle_week_paid ( week_id INTEGER PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS bbox_counter ( tier INTEGER PRIMARY KEY, n INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS bbox_opens ( pay_id TEXT PRIMARY KEY, uid TEXT NOT NULL, tier INTEGER NOT NULL, edition INTEGER NOT NULL, item_id INTEGER, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS bbox_burns ( item_id INTEGER PRIMARY KEY, uid TEXT NOT NULL, tier INTEGER NOT NULL, edition INTEGER NOT NULL, dates INTEGER NOT NULL, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS activity ( uid TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (uid, day) )",
  "CREATE TABLE IF NOT EXISTS usage_events ( uid TEXT NOT NULL, name TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (uid, name, day) )",
  "CREATE TABLE IF NOT EXISTS ref_rewards ( invitee TEXT PRIMARY KEY, inviter TEXT NOT NULL, at INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS castle_day ( uid TEXT NOT NULL, day INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, day) )",
  "CREATE TABLE IF NOT EXISTS chat_msgs ( id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, uid TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0 )",
  "CREATE INDEX IF NOT EXISTS chat_room ON chat_msgs(room, id)",
  "CREATE TABLE IF NOT EXISTS chat_members ( uid TEXT NOT NULL, room TEXT NOT NULL, PRIMARY KEY (uid, room) )",
  "CREATE INDEX IF NOT EXISTS chat_msgs_uid ON chat_msgs(uid, at)",
  "CREATE TABLE IF NOT EXISTS chat_reads ( uid TEXT NOT NULL, room TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, room) )",
  "CREATE TABLE IF NOT EXISTS chat_blocks ( uid TEXT NOT NULL, other TEXT NOT NULL, PRIMARY KEY (uid, other) )",
  "CREATE TABLE IF NOT EXISTS chat_reports ( id INTEGER PRIMARY KEY AUTOINCREMENT, msg_id INTEGER NOT NULL, reporter TEXT NOT NULL, at INTEGER NOT NULL, UNIQUE (msg_id, reporter) )",
  "CREATE TABLE IF NOT EXISTS chat_mutes ( uid TEXT PRIMARY KEY, until INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS transfers ( id INTEGER PRIMARY KEY AUTOINCREMENT, from_uid TEXT NOT NULL, to_uid TEXT NOT NULL, what TEXT NOT NULL, n INTEGER NOT NULL, fee INTEGER NOT NULL DEFAULT 0, item_id INTEGER, at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS transfers_from ON transfers(from_uid, at)",
  "CREATE TABLE IF NOT EXISTS jry_ledger ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, delta INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS jry_ledger_uid ON jry_ledger(uid, at)",
  "CREATE INDEX IF NOT EXISTS nft_kind ON nft_items(kind)",
  "CREATE TABLE IF NOT EXISTS nft_moves ( item_id INTEGER NOT NULL, from_uid TEXT, to_uid TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS nft_credits ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL )",
  // Players' testJRY market. kind 'sell': a lot offered for Pi; kind 'redeem': testJRY swapped
  // for dates / Kombat coins. status: deposit (waiting for the tokens) → open → reserved → sold,
  // or → returning → cancelled; redeem: deposit → done.
  "CREATE TABLE IF NOT EXISTS p2p_offers ( id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, uid TEXT NOT NULL, wallet TEXT NOT NULL, jry TEXT NOT NULL, pi REAL NOT NULL, reward TEXT, got INTEGER, status TEXT NOT NULL, deposit_tx TEXT UNIQUE, buyer TEXT, pay_id TEXT, reserved_at INTEGER, return_tx TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS p2p_open ON p2p_offers(status, kind)",
  // Points market (dates / Kombat coins for Pi). status: open → reserved → sold, or cancelled
  "CREATE TABLE IF NOT EXISTS mk_offers ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, pi REAL NOT NULL, status TEXT NOT NULL, buyer TEXT, pay_id TEXT, reserved_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS mk_open ON mk_offers(status, kind)",
  // Gift codes made by the owner: one reward per player per code, limited uses, optional expiry
  "CREATE TABLE IF NOT EXISTS codes ( code TEXT PRIMARY KEY COLLATE NOCASE, kind TEXT NOT NULL, amount INTEGER NOT NULL, max_uses INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, note TEXT, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS code_uses ( code TEXT NOT NULL COLLATE NOCASE, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, uid) )",
  // Tasks center: tasks made by the owner. period: daily | weekly | once.
  // kind: checkin | link | secret | ads | arcade | invite | spin
  "CREATE TABLE IF NOT EXISTS quests ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, descr TEXT, emoji TEXT NOT NULL, kind TEXT NOT NULL, period TEXT NOT NULL, link TEXT, secret TEXT, goal INTEGER NOT NULL DEFAULT 1, reward_kind TEXT NOT NULL, reward INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, ends_at INTEGER, done_n INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS quest_done ( quest_id INTEGER NOT NULL, uid TEXT NOT NULL, pkey INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (quest_id, uid, pkey) )",
  "CREATE TABLE IF NOT EXISTS quest_open ( quest_id INTEGER NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (quest_id, uid) )",
  // Camel Derby: one row per player (racing camels), weekly trophies, weekly prizes given once
  "CREATE TABLE IF NOT EXISTS derby ( uid TEXT PRIMARY KEY, json TEXT NOT NULL, trophies INTEGER NOT NULL DEFAULT 0, power INTEGER NOT NULL DEFAULT 0, ver INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS derby_tr ON derby(trophies)",
  "CREATE TABLE IF NOT EXISTS derby_weeks ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, pts INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS derby_week_paid ( week_id INTEGER PRIMARY KEY, at INTEGER NOT NULL )",
  // Pi Notification Center: one notification per (player, kind, ref), never twice
  // JRY handed out by the owner (one row per distribution)
  "CREATE TABLE IF NOT EXISTS jry_drops ( id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER NOT NULL, target TEXT NOT NULL, players INTEGER NOT NULL, note TEXT, at INTEGER NOT NULL )",
  // Every JRY a player spends in the game (usage figures for the owner)
  "CREATE TABLE IF NOT EXISTS jry_spent ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, n INTEGER NOT NULL, dest TEXT NOT NULL, at INTEGER NOT NULL )",
  // Royal cards: one row per sold copy (tier + number are unique); daily gifts; monthly contest paid once
  "CREATE TABLE IF NOT EXISTS royal_cards ( id INTEGER PRIMARY KEY AUTOINCREMENT, tier TEXT NOT NULL, ed INTEGER NOT NULL, uid TEXT NOT NULL, pay_id TEXT, at INTEGER NOT NULL, UNIQUE (tier, ed) )",
  "CREATE INDEX IF NOT EXISTS royal_owner ON royal_cards(uid)",
  "CREATE TABLE IF NOT EXISTS royal_gifts ( card_id INTEGER NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (card_id, day) )",
  "CREATE TABLE IF NOT EXISTS vipc_game ( uid TEXT PRIMARY KEY, gold INTEGER NOT NULL, profit INTEGER NOT NULL DEFAULT 0, day INTEGER NOT NULL DEFAULT -1, used INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS vipc_month ( uid TEXT NOT NULL, month INTEGER NOT NULL, profit INTEGER NOT NULL, PRIMARY KEY (uid, month) )",
  "CREATE TABLE IF NOT EXISTS houses ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, emoji TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS house_members ( uid TEXT PRIMARY KEY, house_id INTEGER NOT NULL, joined_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS house_members_h ON house_members(house_id)",
  "CREATE TABLE IF NOT EXISTS house_left ( uid TEXT PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS decrees ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, kind TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, created_at INTEGER NOT NULL, closes_at INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0, winner INTEGER )",
  "CREATE TABLE IF NOT EXISTS decree_votes ( poll_id INTEGER NOT NULL, uid TEXT NOT NULL, opt INTEGER NOT NULL, w REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (poll_id, uid) )",
  "CREATE TABLE IF NOT EXISTS elections ( id INTEGER PRIMARY KEY, done INTEGER NOT NULL DEFAULT 0, closed_at INTEGER )",
  "CREATE TABLE IF NOT EXISTS candidates ( election INTEGER NOT NULL, uid TEXT NOT NULL, speech TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (election, uid) )",
  "CREATE TABLE IF NOT EXISTS election_votes ( election INTEGER NOT NULL, voter TEXT NOT NULL, cand TEXT NOT NULL, w REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (election, voter) )",
  "CREATE TABLE IF NOT EXISTS mps ( election INTEGER NOT NULL, uid TEXT NOT NULL, seat INTEGER NOT NULL, votes REAL NOT NULL, PRIMARY KEY (election, uid) )",
  "CREATE TABLE IF NOT EXISTS court_state ( rank INTEGER PRIMARY KEY, uid TEXT NOT NULL, since INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS court_gifts ( uid TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (uid, day) )",
  "CREATE TABLE IF NOT EXISTS royal_final ( id INTEGER PRIMARY KEY, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0 )",
  // Monthly surprise for free supporters: once per player per month
  "CREATE TABLE IF NOT EXISTS sup_surprise ( uid TEXT NOT NULL, month INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, month) )",
  // Requests for Jerry Development services (app building). status: new | talking | done | closed
  "CREATE TABLE IF NOT EXISTS svc_requests ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, username TEXT NOT NULL, pkg TEXT NOT NULL, name TEXT NOT NULL, idea TEXT NOT NULL, budget TEXT, contact TEXT, status TEXT NOT NULL, note TEXT, at INTEGER NOT NULL, updated_at INTEGER NOT NULL )",
  // Jerry Arena: matches (status waiting | live | done), their players, secret moves of the current round,
  // trophies, the matchmaking queue, weekly points and the daily reward cap
  "CREATE TABLE IF NOT EXISTS arena_matches ( id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, mode TEXT NOT NULL, host TEXT, status TEXT NOT NULL, ranked INTEGER NOT NULL DEFAULT 1, state TEXT, ver INTEGER NOT NULL DEFAULT 0, round_at INTEGER NOT NULL DEFAULT 0, result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS arena_m_status ON arena_matches(status, id)",
  "CREATE TABLE IF NOT EXISTS arena_players ( match_id INTEGER NOT NULL, slot INTEGER NOT NULL, uid TEXT, name TEXT NOT NULL, bot INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (match_id, slot) )",
  "CREATE INDEX IF NOT EXISTS arena_p_uid ON arena_players(uid)",
  "CREATE TABLE IF NOT EXISTS arena_moves ( match_id INTEGER NOT NULL, round INTEGER NOT NULL, slot INTEGER NOT NULL, act TEXT NOT NULL, target INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (match_id, round, slot) )",
  "CREATE TABLE IF NOT EXISTS arena_stats ( uid TEXT PRIMARY KEY, trophies INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS arena_queue ( uid TEXT PRIMARY KEY, mode TEXT NOT NULL, trophies INTEGER NOT NULL, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS arena_week ( week_id INTEGER NOT NULL, uid TEXT NOT NULL, pts INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week_id, uid) )",
  "CREATE TABLE IF NOT EXISTS arena_week_paid ( week_id INTEGER PRIMARY KEY, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS arena_daily ( uid TEXT NOT NULL, day INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, day) )",
  // Personal catalog: goals already claimed (each once per player)
  "CREATE TABLE IF NOT EXISTS catalog_claims ( uid TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, key) )",
  "CREATE TABLE IF NOT EXISTS notif_log ( uid TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, kind, ref) )",
  // Jerry Arcade: rewarded plays per day and best scores
  "CREATE TABLE IF NOT EXISTS arcade ( uid TEXT NOT NULL, day INTEGER NOT NULL, game TEXT NOT NULL, plays INTEGER NOT NULL DEFAULT 0, best INTEGER, PRIMARY KEY (uid, day, game) )",
  // Business showcase. status: paying → review → live (until ends_at) | rejected (refunded)
  "CREATE TABLE IF NOT EXISTS sponsors ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT NOT NULL, descr TEXT NOT NULL, link TEXT, cat TEXT NOT NULL, emoji TEXT NOT NULL, plan TEXT NOT NULL, days INTEGER NOT NULL, pi REAL NOT NULL, status TEXT NOT NULL, pay_id TEXT, created_at INTEGER NOT NULL, starts_at INTEGER, ends_at INTEGER, views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, note TEXT )",
  "CREATE TABLE IF NOT EXISTS jry_buys ( id TEXT PRIMARY KEY, uid TEXT NOT NULL, address TEXT NOT NULL, pi REAL NOT NULL, jry TEXT NOT NULL, status TEXT NOT NULL, txid TEXT, error TEXT, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS jry_keys ( id INTEGER PRIMARY KEY, seed TEXT NOT NULL, created_at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS jry_sends ( uid TEXT PRIMARY KEY, address TEXT NOT NULL, amount TEXT NOT NULL, txid TEXT, status TEXT NOT NULL, error TEXT, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS airdrop_block ( username TEXT PRIMARY KEY COLLATE NOCASE, at INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS boss ( id INTEGER PRIMARY KEY AUTOINCREMENT, lvl INTEGER NOT NULL, hp INTEGER NOT NULL, max_hp INTEGER NOT NULL, started_at INTEGER NOT NULL, killed_at INTEGER, killer TEXT )",
  "CREATE TABLE IF NOT EXISTS boss_hits ( boss_id INTEGER NOT NULL, uid TEXT NOT NULL, dmg INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (boss_id, uid) )",
  "CREATE TABLE IF NOT EXISTS payouts ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, uid TEXT NOT NULL, amount REAL NOT NULL, memo TEXT, pi_payment_id TEXT, txid TEXT, status TEXT NOT NULL, error TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (kind, ref, uid) )",
  "CREATE INDEX IF NOT EXISTS nft_credits_uid ON nft_credits(uid)",
  "CREATE INDEX IF NOT EXISTS nft_moves_at ON nft_moves(at)",
  "CREATE INDEX IF NOT EXISTS nft_moves_item ON nft_moves(item_id)",
  "CREATE INDEX IF NOT EXISTS users_name_nc ON users(username COLLATE NOCASE)",
  "CREATE INDEX IF NOT EXISTS chat_msgs_at ON chat_msgs(at)",
  "CREATE INDEX IF NOT EXISTS ads_uid ON ads(uid, created_at)",
];
let schemaReady = null;
// Columns added after launch (each fails harmlessly once it exists)
const ALTERS = [
  "ALTER TABLE state ADD COLUMN ver INTEGER NOT NULL DEFAULT 0",
  "INSERT OR IGNORE INTO chat_members (uid, room) SELECT DISTINCT substr(room, 4, instr(substr(room, 4), ':') - 1), room FROM chat_msgs WHERE room LIKE 'dm:%'",
  "INSERT OR IGNORE INTO chat_members (uid, room) SELECT DISTINCT substr(room, 4 + instr(substr(room, 4), ':')), room FROM chat_msgs WHERE room LIKE 'dm:%'",
  "ALTER TABLE users ADD COLUMN vip_tier TEXT",
  "ALTER TABLE users ADD COLUMN mult_id TEXT",
  "ALTER TABLE codes ADD COLUMN kind2 TEXT",
  "ALTER TABLE codes ADD COLUMN amount2 INTEGER",
  "ALTER TABLE users ADD COLUMN vipc_until INTEGER",
  "ALTER TABLE users ADD COLUMN mult_until INTEGER",
  "ALTER TABLE users ADD COLUMN net TEXT",
  "ALTER TABLE users ADD COLUMN jry_wallet TEXT",
  "ALTER TABLE users ADD COLUMN jry_bal REAL",
  "ALTER TABLE users ADD COLUMN jry_at INTEGER",
  "ALTER TABLE nft_credits ADD COLUMN src TEXT",
  "ALTER TABLE nft_items ADD COLUMN cur TEXT NOT NULL DEFAULT 'coins'",
  "ALTER TABLE nft_items ADD COLUMN swap_want TEXT",
  "ALTER TABLE users ADD COLUMN jry_bought INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN jry_pts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN mk_balance REAL NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN wheel_day INTEGER NOT NULL DEFAULT -1",
  "ALTER TABLE users ADD COLUMN wheel_spins INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE withdrawals ADD COLUMN src TEXT",
  "ALTER TABLE users ADD COLUMN earn_day INTEGER NOT NULL DEFAULT -1",
  "ALTER TABLE users ADD COLUMN earn_n INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN earn_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN earn_total INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN earn_ads INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN earn_streak INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN earn_sday INTEGER NOT NULL DEFAULT -1",
  "ALTER TABLE users ADD COLUMN lang TEXT",
  "ALTER TABLE users ADD COLUMN cat_master INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN sup_lvl INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN sup_pi REAL NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN sup_at INTEGER",
];
// A short fingerprint of the whole schema. When the database already holds it, nothing is re-run:
// one cheap read per Worker start instead of ~110 statements (D1 bills the rows each statement reads).
const SCHEMA_V = (() => { let h = 5381; for (const c of SCHEMA.join("|") + ALTERS.join("|")) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return String(h); })();
const ensureSchema = (env) =>
  (schemaReady ||= (async () => {
    try { const r = await env.DB.prepare("SELECT v FROM schema_meta LIMIT 1").first(); if (r && r.v === SCHEMA_V) return; } catch (e) { /* first run: the table does not exist yet */ }
    await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
    for (const q of ALTERS) await env.DB.prepare(q).run().catch(() => {});
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_meta ( v TEXT NOT NULL )"),
      env.DB.prepare("DELETE FROM schema_meta"),
      env.DB.prepare("INSERT INTO schema_meta (v) VALUES (?)").bind(SCHEMA_V),
    ]);
  })().catch((e) => { schemaReady = null; throw e; }));

const one = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const all = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
const run = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();

const REF = { WELCOME_DATES: 2000, WELCOME_SPINS: 1, INVITER_DATES: 3000, INVITER_JRY: 5, DAILY_MAX: 5 }; // in-game rewards for invited players and for who invited them (once the friend has played on 2 different days)
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

// VIP Club: members have vipc_until in the future
const VC = globalThis.VipLogic;
const isVipc = (u, now) => !!(u && u.vipc_until && u.vipc_until > now);
async function addVipcDays(env, uid, days, now) {
  const u = await one(env, "SELECT vipc_until FROM users WHERE uid = ?", uid);
  const from = Math.max(now, (u && u.vipc_until) || 0);
  return run(env, "UPDATE users SET vipc_until = ? WHERE uid = ?", from + days * DAY, uid);
}
async function vipcState(env, uid, now) {
  let r = await one(env, "SELECT * FROM vipc_game WHERE uid = ?", uid);
  if (!r) { const f = VC.fresh(); await run(env, "INSERT OR IGNORE INTO vipc_game (uid, gold, profit, day, used) VALUES (?, ?, 0, -1, 0)", uid, f.gold); r = await one(env, "SELECT * FROM vipc_game WHERE uid = ?", uid); }
  const st = { gold: r.gold, profit: r.profit, day: r.day, used: r.used };
  if (st.day !== VC.dayId(now)) { // a new day: voyages reset and the stipend tops the gold up
    st.day = VC.dayId(now); st.used = 0; st.gold = Math.max(st.gold, VC.GAME.STIPEND);
    await run(env, "UPDATE vipc_game SET gold = ?, day = ?, used = 0 WHERE uid = ?", st.gold, st.day, uid);
  }
  return st;
}
// ---------- Houses (alliances of supporters) ----------
const paidOf = async (env, uid) => (await one(env, "SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS n FROM payments WHERE uid = ? AND status = 'completed'", uid)).n;
async function houseGuard(env, u, h) {
  if (await one(env, "SELECT 1 AS x FROM house_members WHERE uid = ?", u.uid)) bad("house.already");
  if (await one(env, "SELECT 1 AS x FROM houses WHERE name = ? COLLATE NOCASE", h.name)) bad("house.taken");
  if (h.fee === L.COURT.HOUSE.FEE_SUPPORTER && (await paidOf(env, u.uid)) < L.COURT.HOUSE.SUPPORTER_MIN) bad("house.fee");
}
async function houseCreate(env, u, h, payId, now, price) {
  const refund = () => run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis house refund', 'new', ?, ?)", crypto.randomUUID(), payId, u.uid, price, now, now);
  if (await one(env, "SELECT 1 AS x FROM house_members WHERE uid = ?", u.uid)) return refund();
  const ins = await run(env, "INSERT OR IGNORE INTO houses (name, emoji, owner, created_at) VALUES (?, ?, ?, ?)", h.name, h.emoji, u.uid, now);
  if (!ins.meta.changes) return refund();
  const r = await one(env, "SELECT id FROM houses WHERE name = ? COLLATE NOCASE", h.name);
  await run(env, "INSERT OR IGNORE INTO house_members (uid, house_id, joined_at) VALUES (?, ?, ?)", u.uid, r.id, now);
}
// Houses ranked by the total of real Pi paid by their members
async function houseBoard(env, limit) {
  return all(env, `SELECT h.id, h.name, h.emoji, h.owner, ow.username AS owner_name, COUNT(DISTINCT m.uid) AS members, ROUND(COALESCE(SUM(p.amount), 0), 2) AS score
    FROM houses h JOIN users ow ON ow.uid = h.owner LEFT JOIN house_members m ON m.house_id = h.id
    LEFT JOIN payments p ON p.uid = m.uid AND p.status = 'completed' GROUP BY h.id ORDER BY score DESC, h.created_at ASC LIMIT ?`, limit);
}
async function myHouse(env, uid) {
  return one(env, "SELECT h.id, h.name, h.emoji, h.owner, m.joined_at FROM house_members m JOIN houses h ON h.id = m.house_id WHERE m.uid = ?", uid);
}
// ---------- Votes (decrees) and Parliament elections ----------
const COURT = L.COURT;
const courtNow = (env) => (env.COURT_NOW ? Number(env.COURT_NOW) : Date.now()); // tests can fix the date of the elections
const KINDS = ["event", "topic", "name", "rule", "feature"];
const voteWeightOf = async (env, uid) => COURT.voteWeight(await paidOf(env, uid));
async function pollsClose(env, now) {
  const due = await all(env, "SELECT * FROM decrees WHERE closed = 0 AND closes_at <= ?", now);
  for (const p of due) {
    const n = JSON.parse(p.options).length, tally = Array(n).fill(0);
    for (const v of await all(env, "SELECT opt, SUM(w) AS s FROM decree_votes WHERE poll_id = ? GROUP BY opt", p.id)) if (v.opt >= 0 && v.opt < n) tally[v.opt] = v.s;
    const best = tally.reduce((bi, x, i) => (x > tally[bi] ? i : bi), 0);
    await run(env, "UPDATE decrees SET closed = 1, winner = ? WHERE id = ? AND closed = 0", tally[best] > 0 ? best : null, p.id);
  }
}
async function pollView(env, p, uid) {
  const opts = JSON.parse(p.options), tally = Array(opts.length).fill(0);
  const rows = await all(env, "SELECT opt, SUM(w) AS s, COUNT(*) AS c FROM decree_votes WHERE poll_id = ? GROUP BY opt", p.id);
  let voters = 0;
  for (const r of rows) { if (r.opt >= 0 && r.opt < opts.length) tally[r.opt] = Math.round(r.s * 100) / 100; voters += r.c; }
  const mine = uid ? await one(env, "SELECT opt FROM decree_votes WHERE poll_id = ? AND uid = ?", p.id, uid) : null;
  return { id: p.id, kind: p.kind, question: p.question, options: opts, tally, voters, closesAt: p.closes_at, closed: !!p.closed, winner: p.winner, mine: mine ? mine.opt : null };
}
// The election of a month: 1-7 candidacy, 8-14 voting, from the 15th the 15 best become Members of Parliament
const electionId = (t) => L.monthId ? L.monthId(t) : new Date(t).getUTCFullYear() * 100 + new Date(t).getUTCMonth() + 1;
const parliamentElection = (t) => { const d = new Date(t); const cur = electionId(t); if (d.getUTCDate() >= COURT.PARLIAMENT.RESULTS_FROM) return cur; const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); return p.getUTCFullYear() * 100 + p.getUTCMonth() + 1; };
async function electionClose(env, id, now) {
  const row = await one(env, "SELECT done FROM elections WHERE id = ?", id);
  if (row && row.done) return;
  const ins = await run(env, "INSERT INTO elections (id, done, closed_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET done = 1, closed_at = excluded.closed_at WHERE elections.done = 0", id, now);
  if (!ins.meta.changes) return;
  const rows = await all(env, `SELECT c.uid, COALESCE(SUM(v.w), 0) AS votes FROM candidates c LEFT JOIN election_votes v ON v.election = c.election AND v.cand = c.uid
    WHERE c.election = ? GROUP BY c.uid ORDER BY votes DESC, MIN(c.at) ASC LIMIT ?`, id, COURT.PARLIAMENT.SEATS);
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    await run(env, "INSERT OR IGNORE INTO mps (election, uid, seat, votes) VALUES (?, ?, ?, ?)", id, rows[i].uid, i + 1, rows[i].votes);
    items.push({ uid: rows[i].uid, kind: "elected", ref: "el" + id, vars: { seat: i + 1 } });
  }
  await notify(env, items).catch(() => {});
}
async function courtCron(env, now) {
  await pollsClose(env, now);
  if (new Date(now).getUTCDate() >= COURT.PARLIAMENT.RESULTS_FROM) await electionClose(env, electionId(now), now);
}
async function mpSeat(env, uid, now) {
  const el = parliamentElection(now);
  if (el === electionId(now) && new Date(now).getUTCDate() >= COURT.PARLIAMENT.RESULTS_FROM) await electionClose(env, el, now);
  const r = await one(env, "SELECT seat FROM mps WHERE election = ? AND uid = ?", el, uid);
  return r ? r.seat : 0;
}
// What a player gets as the daily court gift: his title, the leading House, the Parliament
async function courtGiftOf(env, uid, now) {
  await courtRefresh(env);
  const c = courtOf(uid), t = c ? L.COURT.titleOf(c.rank, c.paid) : null, parts = {};
  if (t && t.coins) parts.title = t.coins;
  const mh = await myHouse(env, uid);
  if (mh) { const lead = (await houseBoard(env, 1))[0]; if (lead && lead.id === mh.id && lead.score > 0) parts.house = L.COURT.HOUSE.DAILY_COINS; }
  const seat = await mpSeat(env, uid, courtNow(env));
  if (seat) parts.parliament = seat === 1 ? COURT.PARLIAMENT.SPEAKER_COINS : COURT.PARLIAMENT.COINS;
  const done = await one(env, "SELECT 1 AS x FROM court_gifts WHERE uid = ? AND day = ?", uid, L.dayId(now));
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0), claimed: !!done };
}
// The Court: the 10 players with the most real Pi paid in total (completed Pi payments; spending the waiting box
// does not count) hold the titles Emperor, Crown Prince, Grand Vizier and Emir. Cached for 60 s in memory.
let courtCache = { at: 0, list: [], by: new Map() };
async function courtRefresh(env, force) {
  const now = Date.now();
  if (!force && now - courtCache.at < (env.KING_TTL_MS != null ? Number(env.KING_TTL_MS) : 60000)) return courtCache;
  const rows = await all(env, `SELECT p.uid, u.username, ROUND(SUM(p.amount), 2) AS paid FROM payments p JOIN users u ON u.uid = p.uid
    WHERE p.status = 'completed' GROUP BY p.uid HAVING paid > 0 ORDER BY paid DESC, MAX(p.created_at) ASC LIMIT ?`, L.COURT.SEATS);
  const list = rows.map((r, i) => ({ rank: i + 1, uid: r.uid, username: r.username, paid: r.paid, title: L.COURT.titleOf(i + 1, r.paid).id }));
  courtCache = { at: now, list, by: new Map(list.map((x) => [x.uid, x])) };
  // a new holder of Emperor / Crown Prince / Grand Vizier / Emir: remember it once and tell the players
  const stored = await all(env, "SELECT rank, uid FROM court_state");
  const old = new Map(stored.map((r) => [r.rank, r.uid]));
  const moves = [];
  for (const x of list) {
    if (old.get(x.rank) === x.uid) continue;
    await run(env, "INSERT INTO court_state (rank, uid, since) VALUES (?, ?, ?) ON CONFLICT(rank) DO UPDATE SET uid = excluded.uid, since = excluded.since WHERE court_state.uid != excluded.uid", x.rank, x.uid, now);
    moves.push(x);
    const prev = old.get(x.rank);
    if (prev && x.rank <= 3) moves.push({ lost: prev, rank: x.rank, by: x.username });
  }
  if (moves.length) await courtAnnounce(env, moves, now).catch((e) => logError(env, "court announce", 0, e.message));
  return courtCache;
}
const TITLE_NAMES = { emperor: ["Emperor", "الإمبراطور", "Empereur"], prince: ["Crown Prince", "ولي العهد", "Prince héritier"], vizier: ["Grand Vizier", "الوزير الأول", "Grand Vizir"], emir: ["Emir", "أمير", "Émir"] };
async function courtAnnounce(env, moves, now) {
  const items = [];
  for (const m of moves) {
    if (m.lost) { const n = TITLE_NAMES[L.COURT.titleOf(m.rank, 1).id]; items.push({ uid: m.lost, kind: "courtlost", ref: "r" + m.rank + "-" + m.by + "-" + Math.floor(now / DAY), vars: { u: m.by, t_en: n[0], t_ar: n[1], t_fr: n[2] } }); continue; }
    const n = TITLE_NAMES[m.title]; if (!n) continue;
    items.push({ uid: m.uid, kind: "courtnew", ref: "r" + m.rank + "-" + Math.floor(now / DAY), vars: { t_en: n[0], t_ar: n[1], t_fr: n[2] } });
    if (m.rank === 1) {
      const rows = await all(env, "SELECT uid FROM users ORDER BY rowid DESC LIMIT 200");
      for (const r of rows) if (r.uid !== m.uid) items.push({ uid: r.uid, kind: "courtemp", ref: "emp" + m.uid.slice(0, 12) + "-" + Math.floor(now / DAY), vars: { u: m.username } });
    }
  }
  await notify(env, items);
}
const courtOf = (uid) => courtCache.by.get(uid) || null;
const isKing = (uid) => { const c = courtOf(uid); return !!c && c.rank === 1; };
// Active yield multiplier of a player: { id, f, until } or null (the best of the bought one and the throne's)
function multOf(u, now) {
  const m = u && u.mult_id && u.mult_until > now ? L.multById(u.mult_id) : null;
  const bought = m ? { id: m.id, f: m.f, until: u.mult_until } : null;
  const c = u && courtOf(u.uid), t = c && L.COURT.titleOf(c.rank, c.paid);
  if (t && t.mult > 1 && (!bought || bought.f < t.mult)) return { id: t.id, f: t.mult, until: now + DAY };
  return bought;
}
// Buying a multiplier: same one extends it; a bigger one replaces it (a smaller one is refused while one runs)
async function applyMult(env, u, m, now) {
  const cur = multOf(u, now);
  const until = cur && cur.id === m.id ? cur.until + m.days * DAY : now + m.days * DAY;
  return env.DB.prepare("UPDATE users SET mult_id = ?, mult_until = ? WHERE uid = ?").bind(m.id, until, u.uid);
}

// Loads the game and gives a new partner their welcome gift (a legendary camel, once)
// The inviter is rewarded once, when the invited player has opened the game on 2 different days (a real player, not a fake sign-up).
// At most REF.DAILY_MAX paid rewards per inviter per day, and none when both accounts share the same network hash.
async function refMilestone(env, u, now) {
  if (!u.referrer) return;
  if (await one(env, "SELECT 1 AS x FROM ref_rewards WHERE invitee = ?", u.uid)) return;
  if ((await one(env, "SELECT COUNT(*) AS n FROM activity WHERE uid = ?", u.uid)).n < 2) return;
  const inv = await one(env, "SELECT uid, net FROM users WHERE uid = ?", u.referrer);
  if (!inv) return;
  const today = (await one(env, "SELECT COUNT(*) AS n FROM ref_rewards WHERE inviter = ? AND paid = 1 AND at > ?", inv.uid, now - DAY)).n;
  const ok = today < REF.DAILY_MAX && !(u.net && inv.net && u.net === inv.net);
  const ins = await run(env, "INSERT OR IGNORE INTO ref_rewards (invitee, inviter, at, paid) VALUES (?, ?, ?, ?)", u.uid, inv.uid, now, ok ? 1 : 0);
  if (!ins.meta.changes || !ok) return;
  await giveReward(env, inv.uid, "dates", REF.INVITER_DATES, now, "invite");
  await giveReward(env, inv.uid, "jry", REF.INVITER_JRY, now, "invite");
  await notify(env, [{ uid: inv.uid, kind: "refplay", ref: u.uid, vars: { u: u.username, d: REF.INVITER_DATES.toLocaleString("en-US"), j: REF.INVITER_JRY } }]).catch(() => {});
}
async function stateFor(env, u, now, tier) {
  const st = await loadState(env, u.uid, now);
  let changed = L.tickCity(st, now, secureRandom); // new city orders appear on their own
  // Kombat coins from collectibles sold while away (taken once, then added)
  const credits = await all(env, "DELETE FROM nft_credits WHERE uid = ? RETURNING amount, src", u.uid);
  if (credits.length) {
    st.kombat = KL.norm(st.kombat, now);
    for (const c of credits) {
      const src = c.src || "trade";
      st.kombat.coins += c.amount; st.kombat.earn[src] = (st.kombat.earn[src] || 0) + c.amount;
    }
    changed = true;
  }
  if (tier === PARTNER && !st.partnerGift) {
    L.addAnimal(st, 3, now, "partner");
    st.partnerGift = 1;
    changed = true;
  }
  if (changed) {
    try { await saveState(env, u.uid, st, now); }
    catch (e) {
      // someone saved first: give back the credits we took (they are taken again on the retry)
      if (e instanceof StateConflict) for (const c of credits) await run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, ?)", u.uid, c.amount, now, c.src || null);
      throw e;
    }
  }
  return st;
}

// testJRY held in the player's saved wallet, read from the Pi network (refreshed every 15 min)
// JRY held for perks: the in-game JRY balance, plus (Testnet) testJRY in the saved wallet
async function jryHeld(env, u, force) {
  const pts = Number(u.jry_pts) || 0;
  return pts + (await testJryHeld(env, u, force));
}
async function testJryHeld(env, u, force) {
  if (!u.jry_wallet || !isTestnet(env)) return 0;
  const now = Date.now();
  if (!force && u.jry_at && now - u.jry_at < 15 * 60e3) return u.jry_bal || 0;
  let bal = u.jry_bal || 0;
  try { bal = Number((await jryStatusOf(env, u.jry_wallet)).balance) || 0; } catch {}
  await run(env, "UPDATE users SET jry_bal = ?, jry_at = ? WHERE uid = ?", bal, now, u.uid);
  u.jry_bal = bal; u.jry_at = now;
  return bal;
}
const holdBoost = (bal) => { const i = KL.holdTier(bal); return i >= 0 ? KL.HOLD_TIERS[i].boost : 0; };

async function account(env, u) {
  const now = Date.now();
  const held = await jryHeld(env, u);
  const tier = tierOf(u, now, await isPartner(env, u.username));
  const c = await one(env, "SELECT COUNT(*) AS n FROM users WHERE referrer = ?", u.uid);
  const inviter = u.referrer ? await one(env, "SELECT username FROM users WHERE uid = ?", u.referrer) : null;
  return {
    username: u.username,
    tier,
    tierId: L.TIERS[tier].id,
    isAdmin: isAdmin(env, u),
    // Mainnet purchases open once the app wallet is approved by Pi (PAYMENTS_LIVE = "1")
    payOpen: isTestnet(env) || env.PAYMENTS_LIVE === "1",
    testGifts: isAdmin(env, u) && isTestnet(env),
    vipUntil: u.vip_until,
    mult: multOf(u, now),
    vipcUntil: isVipc(u, now) ? u.vipc_until : 0,
    piWaiting: Math.round(((await one(env, "SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE uid = ? AND status = 'new' AND kind IN ('prize', 'refund')", u.uid)).n || 0) * 1e7) / 1e7,
    referralBalance: u.ref_balance,
    referralCount: c.n,
    activeRefs: await activeRefs(env, u.uid),
    jryWallet: u.jry_wallet || null,
    partnerReq: tier === PARTNER ? "approved" : ((await one(env, "SELECT status FROM partner_requests WHERE uid = ?", u.uid)) || {}).status || null,
    jryHeld: held,
    jryPts: Number(u.jry_pts) || 0,
    jryBought: Number(u.jry_bought) || 0,
    supLvl: Number(u.sup_lvl) || 0,
    supPi: Number(u.sup_pi) || 0,
    catMaster: !!u.cat_master,
    catBoost: await catalogBoost(env, u.uid),
    mkBalance: Number(u.mk_balance) || 0,
    wheelFree: (u.wheel_day ?? -1) !== L.dayId(now),
    wheelSpins: Number(u.wheel_spins) || 0,
    earnN: (u.earn_day ?? -1) === L.dayId(now) ? Number(u.earn_n) || 0 : 0,
    earnAt: Number(u.earn_at) || 0,
    earnTotal: Number(u.earn_total) || 0,
    earnAds: Number(u.earn_ads) || 0,
    // the streak is alive if it was extended today or yesterday
    earnStreak: (u.earn_sday ?? -1) >= L.dayId(now) - 1 ? Number(u.earn_streak) || 0 : 0,
    earnStreakToday: (u.earn_sday ?? -1) === L.dayId(now),
    // the same sum the server applies to Kombat profit (JRY held, collectibles, royal cards, catalog)
    holdBoost: holdBoost(held) + ((multOf(u, now) || { f: 1 }).f - 1) + (await nftBoost(env, u.uid)) + (await royalPerks(env, u.uid)).boost + (await catalogBoost(env, u.uid)),
    nftBoost: await nftBoost(env, u.uid),
    jryOn: !!env.JRY_ISSUER_SEED || isTestnet(env),
    invitedBy: inviter ? inviter.username : null,
    canSetInviter: !u.referrer && Date.now() - u.created_at < INVITER_DAYS * DAY,
  };
}

// Mainnet only: a player's first sign-in brings their game progress over from the Testnet
// game (matched by verified Pi username), so nobody starts from zero. Only the game itself is
// copied: farm, camels, city, dates and Jerry Kombat. Nothing paid with Test-Pi comes along
// (memberships, referral Test-Pi, testJRY, collectibles), and this week's ranking starts at 0
// so real-Pi prizes stay fair. Partner status granted by the owner on Testnet is kept.
// `mine` = the player's current Mainnet game (existing account): it is replaced only when the
// Testnet one is further along, and either way it is checked only once.
const progressOf = (s) => (s.dates || 0) + ((s.kombat && s.kombat.total) || 0) + ((s.animals || []).length + ((s.city && s.city.xp) || 0)) * 1000;
async function carryFromTestnet(env, me, now, mine) {
  if (!env.TESTNET_DB || isTestnet(env)) return false;
  try {
    // The furthest-along Testnet game among the Testnet databases
    let st = null;
    for (const db of [env.TESTNET_DB, env.TESTNET_DB_OLD]) {
      if (!db) continue;
      const row = await db.prepare(
        "SELECT s.json FROM users u JOIN state s ON s.uid = u.uid WHERE u.username = ? COLLATE NOCASE"
      ).bind(me.username).first().catch(() => null);
      if (!row) continue;
      const cand = L.normalize(JSON.parse(row.json), now);
      if (!st || progressOf(cand) > progressOf(st)) st = cand;
    }
    if (st && mine && progressOf(mine) >= progressOf(st)) st = null;
    if (st) {
      st.week = { id: L.weekId(now), score: 0 };
      if (st.kombat) delete st.kombat.wk;
      st.fromTestnet = now;
      st.carryChecked = 1;
      await saveState(env, me.uid, st, now);
    } else if (mine) {
      mine.carryChecked = 1;
      await saveState(env, me.uid, mine, now);
    }
    let p = null;
    for (const db of [env.TESTNET_DB, env.TESTNET_DB_OLD]) {
      if (!p && db) p = await db.prepare("SELECT granted_by FROM partners WHERE username = ? COLLATE NOCASE").bind(me.username).first().catch(() => null);
    }
    if (p) await run(env, "INSERT OR IGNORE INTO partners (username, granted_by, granted_at) VALUES (?, ?, ?)", me.username, p.granted_by || "testnet", now);
    return !!st;
  } catch (e) {
    await logError(env, "carry", 0, String(e && e.message || e));
    return false;
  }
}

// A game state remembers the version it was read at (not saved in the JSON): saveState only writes if nobody saved in between
// Heavy public rankings are computed at most once a minute per Worker instance (BOARD_TTL_MS=0 in tests)
const USAGE_EVENTS = ["share_click", "open_kombat", "open_derby", "open_merge", "open_earn", "open_quests", "open_wheel", "open_arcade", "open_court", "open_season", "open_vipc", "open_castle", "open_magazine", "open_catalog", "open_market", "open_box", "open_chat", "open_services", "open_jry", "open_biz", "open_levels", "open_streak", "palm_tap", "tab_camels", "tab_city", "tab_granary", "tab_rank", "tab_club"];
const MEMO = new Map();
async function memo(env, key, fn) {
  const ttl = env.BOARD_TTL_MS != null ? Number(env.BOARD_TTL_MS) : 60000, hit = MEMO.get(key);
  if (ttl > 0 && hit && Date.now() - hit.at < ttl) return hit.v;
  const v = await fn();
  if (ttl > 0) { if (MEMO.size > 50) MEMO.clear(); MEMO.set(key, { at: Date.now(), v }); }
  return v;
}
// Simple per-IP limit (per Worker instance) on sign-in and payment calls: they trigger calls to Pi. RATE_LIMIT_PER_MIN overrides (0 = off, used by tests).
const HITS = new Map();
function rateLimited(env, req, bucket, perMin) {
  const lim = env.RATE_LIMIT_PER_MIN != null ? Number(env.RATE_LIMIT_PER_MIN) : perMin;
  if (!(lim > 0)) return false;
  const k = bucket + (req.headers.get("CF-Connecting-IP") || ""), m = Math.floor(Date.now() / 60000), h = HITS.get(k);
  if (!h || h.m !== m) { if (HITS.size > 5000) HITS.clear(); HITS.set(k, { m, n: 1 }); return false; }
  return ++h.n > lim;
}
class StateConflict extends Error { constructor() { super("busy"); } }
async function loadState(env, uid, now) {
  const row = await one(env, "SELECT json, ver FROM state WHERE uid = ?", uid);
  const st = L.normalize(row ? JSON.parse(row.json) : null, now);
  Object.defineProperty(st, "_ver", { value: row ? row.ver || 0 : null, writable: true, enumerable: false });
  return st;
}
async function saveState(env, uid, s, now) {
  // Kombat weekly tournament row: at most once a minute (fewer database writes)
  const wk = s.kombat && s.kombat.wk;
  const saveWeek = wk && wk.n > 0 && now - (wk.at || 0) >= 60000;
  if (saveWeek) wk.at = now;
  if (s._ver != null) {
    // compare-and-set: a parallel request that saved first wins, this one must be redone (never a double credit)
    const r = await run(env, "UPDATE state SET json = ?, week_id = ?, week_score = ?, updated_at = ?, ver = ver + 1 WHERE uid = ? AND ver = ?", JSON.stringify(s), s.week.id, s.week.score, now, uid, s._ver);
    if (!r.meta.changes) { if (saveWeek) wk.at = 0; throw new StateConflict(); }
    s._ver += 1;
  } else {
    await run(
      env,
      `INSERT INTO state (uid, json, week_id, week_score, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET json = excluded.json, week_id = excluded.week_id, week_score = excluded.week_score, updated_at = excluded.updated_at, ver = state.ver + 1`,
      uid, JSON.stringify(s), s.week.id, s.week.score, now
    );
  }
  // Kombat weekly tournament: coins earned this week, kept per week for the prizes
  if (saveWeek) {
    await run(
      env,
      `INSERT INTO kombat_weeks (week_id, uid, earned, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(week_id, uid) DO UPDATE SET earned = excluded.earned, updated_at = excluded.updated_at`,
      wk.id, uid, Math.floor(wk.n), now
    );
  }
  if (s.merge && s.merge.wk && s.merge.wk.n > 0) {
    await run(env, `INSERT INTO merge_weeks (week_id, uid, pts, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(week_id, uid) DO UPDATE SET pts = excluded.pts, updated_at = excluded.updated_at`, s.merge.wk.id, uid, s.merge.wk.n, now);
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
  await courtRefresh(env).catch(() => {});
  return u;
}

// Server-side luck (breeding, stake bonus): not predictable by players
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Weekly ranking rewards (given once per week): #1 legendary camel, #2 epic, #3 rare,
// and dates for the top 100 (they don't count in the new week's ranking)
async function grantWeeklyCamels(env) {
  await ensureSchema(env);
  const now = Date.now();
  const lastWeek = L.weekId(now - 7 * DAY);
  const claim = await run(env, "INSERT OR IGNORE INTO week_rewards (week_id, created_at) VALUES (?, ?)", lastWeek, now);
  if (!claim.meta.changes) return 0; // already given
  const top = await all(env, "SELECT uid FROM week_scores WHERE week_id = ? AND score > 0 ORDER BY score DESC, updated_at ASC LIMIT 100", lastWeek);
  const rarity = [3, 2, 1];
  for (let i = 0; i < top.length; i++) {
    await creditPoints(env, top[i].uid, "dates", L.WEEK100.dates(i + 1), now, "week");
    await giveReward(env, top[i].uid, "jry", L.WEEK100.jry(i + 1), now, "week");
  }
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "week", ref: lastWeek, vars: { p: i + 1, d: L.WEEK100.dates(i + 1).toLocaleString("en-US"), j: L.WEEK100.jry(i + 1) } })));
  for (let i = 0; i < Math.min(3, top.length); i++) {
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
let marketCache = null;
// Testnet server? The TESTNET_GIFTS setting, or the Testnet address the request came to
// (pi-oasis.… / oasisgame6033.…). The Mainnet server (jaouich.…) never matches.
let testnetHost = false;
// Testnet app settings (not secret). Secrets (API key, wallet) still come from Cloudflare.
const TESTNET_VARS = {
  A2U_LIVE: "1",
  VALIDATION_KEY: "7c51468ad7937a22873ad4adf0fd7d80b1be68a1f78733624eb98d53c35fe3985aacf7642e50d4d5ee31e85304b4542b08ff9c6322821708bf153f78d54cad8d",
  PUBLIC_URL: "https://oasisgame6033.pinet.com",
  TESTNET_GIFTS: "1",
  JRY_CODE: "testJRY",
  JRY_HOME: "pi-oasis.jaouich.workers.dev",
};
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
      await carryFromTestnet(env, me, now, null);
      if (referrer) { // welcome gift for a player who came through an invitation
        await giveReward(env, me.uid, "dates", REF.WELCOME_DATES, now, "welcome");
        await giveReward(env, me.uid, "spins", REF.WELCOME_SPINS, now, "welcome");
      }
    } else if (u.username !== me.username) {
      // Username changed on Pi: free the name if a stale row still holds it
      await run(env, "UPDATE users SET username = username || '#' || uid WHERE username = ? AND uid != ?", me.username, me.uid);
      await run(env, "UPDATE users SET username = ? WHERE uid = ?", me.username, me.uid);
    }
    else if (env.TESTNET_DB && !isTestnet(env)) {
      // Opened the Mainnet game before the carry-over existed: check once
      const mine = await loadState(env, me.uid, now);
      if (!mine.carryChecked) await carryFromTestnet(env, me, now, mine);
    }
    const net = await netHash(req, env);
    if (net) await run(env, "UPDATE users SET net = ? WHERE uid = ?", net, me.uid);
    if (["ar", "en", "fr"].includes(body.lang)) await run(env, "UPDATE users SET lang = ? WHERE uid = ?", body.lang, me.uid);
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
    await run(env, "INSERT OR IGNORE INTO activity (uid, day) VALUES (?, ?)", u.uid, Math.floor(now / DAY)).catch(() => {}); // one row per player per day: retention
    await refMilestone(env, u, now).catch((e) => logError(env, "refMilestone", 0, e.message));
    const acc = await account(env, u);
    return { account: acc, state: await stateFor(env, u, now, acc.tier), now };
  },

  // Every game action runs here with the server's clock
  "POST /api/action": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const a = body.action || {};
    let adVerified = false;
    if (a.type === "speedup" || a.type === "kAdRefill" || a.type === "kAdDaily") adVerified = await verifyAd(env, u.uid, a.adId, now);
    const tier = tierOf(u, now, await isPartner(env, u.username));
    for (let attempt = 0; ; attempt++) {
    try {
    const state = await stateFor(env, u, now, tier);
    let res;
    try {
      const refs = a.type === "kTask" ? await activeRefs(env, u.uid) : 0;
      res = L.apply(state, a, { now, tier, adVerified, rand: secureRandom, refs, mult: (multOf(u, now) || { f: 1 }).f, hold: holdBoost(await jryHeld(env, u)) + ((multOf(u, now) || { f: 1 }).f - 1) + (await nftBoost(env, u.uid)) + (await royalPerks(env, u.uid)).boost + (await catalogBoost(env, u.uid)) });
    } catch (e) {
      if (e instanceof L.GameError) return json({ error: e.code, vars: e.vars, state, now }, 400);
      throw e;
    }
    await saveState(env, u.uid, res.s, now);
    if (a.type === "kTap" && res.dmg > 0) await bossHit(env, u.uid, res.dmg, now).catch((e) => logError(env, "boss hit", 0, e.message));
    return { state: res.s, msg: res.msg, palm: res.palm, now };
    } catch (e) { if (e instanceof StateConflict && attempt < 3) continue; throw e; }
    }
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
    if (item.mult) { const cur = multOf(u, nowT); if (cur && item.mult.f < cur.f) bad("multLower"); }
    if (item.house) await houseGuard(env, u, item.house);
    if (item.tier && u.vip_until > nowT && item.price < L.TIERS[paidTier(u, nowT)].price) bad("lowerTier");
    if (item.jry) {
      if (!isTestnet(env)) bad("badPayment");
      if (!u.jry_wallet) bad("k.needWallet");
      if (!(await jryStatusOf(env, u.jry_wallet)).trust) bad("k.noTrust");
    }
    if (!isTestnet(env) && env.PAYMENTS_LIVE !== "1") bad("payClosed");
    if (item.p2p) await reserveOffer(env, u, item, id, nowT);
    if (item.mk) await mkReserve(env, u, item, id, nowT);
    if (item.royal && (await one(env, "SELECT 1 AS x FROM royal_cards WHERE tier = ? AND ed = ?", item.royal.tier, item.royal.ed))) bad("rc.taken");
    if (item.sponsor) {
      const ad = await one(env, "SELECT * FROM sponsors WHERE id = ? AND uid = ?", item.sponsor, u.uid);
      if (!ad || (ad.status !== "paying" && ad.pay_id !== id) || ad.plan !== item.plan.id) bad("sp.gone");
    }
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
    // public: only whether things are configured. Wallet address, payouts and errors need the admin token.
    const isAdmin = !!env.ADMIN_TOKEN && req.headers.get("x-admin-token") === env.ADMIN_TOKEN;
    if (!isAdmin) return { piApiKeyConfigured: !!env.PI_NETWORK_API_KEY, studioKeyConfigured: !!env.PI_STUDIO_API_KEY, payoutsConfigured: !!env.PI_WALLET_SEED };
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

  // What the signed-in player won last week (null when outside the top 100)
  "GET /api/week/mine": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), wk = L.weekId(now - 7 * DAY);
    const me = await one(env, "SELECT score, updated_at FROM week_scores WHERE week_id = ? AND uid = ?", wk, u.uid);
    if (!me || !(me.score > 0)) return { week: wk, won: null };
    const ahead = await one(env, "SELECT COUNT(*) AS n FROM week_scores WHERE week_id = ? AND score > 0 AND (score > ? OR (score = ? AND updated_at < ?))", wk, me.score, me.score, me.updated_at);
    const place = ahead.n + 1;
    if (place > L.WEEK100.N) return { week: wk, won: null };
    const po = await one(env, "SELECT amount, status FROM payouts WHERE kind = 'prize' AND ref = ? AND uid = ?", String(wk), u.uid);
    return { week: wk, won: { place, score: me.score, pi: po ? Number(po.amount) : 0, piStatus: po ? (po.status === "completed" ? "sent" : "waiting") : null, dates: L.WEEK100.dates(place), jry: L.WEEK100.jry(place), camel: place <= 3 } };
  },

  "GET /api/leaderboard": async (req, env) => {
    const wid = L.weekId(Date.now());
    const w = await one(env, "SELECT prize_pool FROM weeks WHERE id = ?", wid);
    const top = await all(
      env,
      `SELECT u.username, s.score, u.vip_until, u.vip_tier, u.sup_lvl, u.sup_pi, u.cat_master,
              EXISTS (SELECT 1 FROM partners p WHERE p.username = u.username) AS partner
       FROM week_scores s JOIN users u ON u.uid = s.uid
       WHERE s.week_id = ? AND s.score > 0 ORDER BY s.score DESC, s.updated_at ASC LIMIT 100`,
      wid
    );
    const now = Date.now();
    const c = await courtRefresh(env), emp = c.list[0] || null;
    return {
      king: { username: emp ? emp.username : null, paid: emp ? emp.paid : 0, need: emp ? Math.round((emp.paid + 0.01) * 100) / 100 : 0.01, mult: L.COURT.TITLES[0].mult, coins: L.COURT.TITLES[0].coins },
      court: c.list.slice(0, 3).map((x) => ({ rank: x.rank, username: x.username, paid: x.paid, title: x.title })),
      last: await lastWeekWinners(env, now),
      prizePool: w ? w.prize_pool : 0,
      bands: L.WEEK100.BANDS,
      top: top.map((r) => ({ username: r.username, score: r.score, tier: L.TIERS[tierOf(r, now, !!r.partner)].id, sup: r.sup_lvl || (r.sup_pi > 0 ? 4 : 0), cm: r.cat_master ? 1 : 0 })),
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
  // ---------- Seasons ----------
  "GET /api/season": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), id = L.SEASON.id(now);
    const rows = await seasonBoard(env, id), me = rows.find((r) => r.uid === u.uid);
    const dv = (await one(env, "SELECT div FROM league_div WHERE uid = ?", u.uid)) || { div: 0 };
    const arr = rows.filter((r) => r.div === dv.div), k = leagueZone(arr.length), n = arr.length, sp = me ? me.sp : 0;
    const rank = me ? arr.findIndex((r) => r.uid === u.uid) + 1 : 0;
    const got = new Set((await all(env, "SELECT tier FROM season_claims WHERE season = ? AND uid = ?", id, u.uid)).map((r) => r.tier));
    const lr = await one(env, "SELECT * FROM league_results WHERE season = ? AND uid = ?", id - 1, u.uid);
    return { season: id, ends: L.SEASON.start(id) + L.SEASON.DAYS * DAY, div: dv.div, sp, rank, size: n, zone: k,
      tiers: L.SEASON.TIERS.map((t, i) => ({ ...t, claimed: got.has(i), open: sp >= t.sp })), prizes: L.SEASON.PRIZES,
      top: arr.slice(0, 20).map((r, i) => ({ rank: i + 1, username: r.username, sp: r.sp, zone: i < k ? "up" : i >= n - k && k > 0 ? "down" : "" })),
      general: [...rows].sort((x, y) => y.div - x.div || y.sp - x.sp).slice(0, 10).map((r, i) => ({ rank: i + 1, username: r.username, sp: r.sp, div: r.div })),
      last: lr ? { season: lr.season, from: lr.div_from, to: lr.div_to, sp: lr.sp, rank: lr.rank, size: lr.size, outcome: lr.outcome, dates: lr.dates, jry: lr.jry } : null, now };
  },
  "POST /api/season/claim": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), id = L.SEASON.id(now);
    const mine = ((await seasonBoard(env, id)).find((r) => r.uid === u.uid) || { sp: 0 }).sp, sum = { dates: 0, jry: 0, spins: 0, tiers: 0 };
    for (let i = 0; i < L.SEASON.TIERS.length; i++) {
      const t = L.SEASON.TIERS[i]; if (mine < t.sp) continue;
      const r = await run(env, "INSERT OR IGNORE INTO season_claims (season, uid, tier, at) VALUES (?, ?, ?, ?)", id, u.uid, i, now);
      if (!r.meta.changes) continue;
      sum.tiers++;
      for (const k of ["dates", "jry", "spins"]) if (t[k]) { await giveReward(env, u.uid, k, t[k], now, "season"); sum[k] += t[k]; }
    }
    if (!sum.tiers) bad("se.none");
    return { ok: true, ...sum };
  },

  // ---------- Daily login streak and achievements ----------
  "GET /api/streak": async (req, env) => {
    const u = await auth(req, env), today = Math.floor(Date.now() / DAY);
    const r = await one(env, "SELECT last, n FROM login_streak WHERE uid = ?", u.uid);
    const alive = r && r.last >= today - 1, n = alive ? r.n : 0;
    const claimed = !!(r && r.last === today), next = claimed ? r.n : n + 1;
    return { n, claimed, day: ((next - 1) % 7) + 1, rewards: L.STREAK7 };
  },
  "POST /api/streak/claim": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), today = Math.floor(now / DAY);
    const r = await one(env, "SELECT last, n FROM login_streak WHERE uid = ?", u.uid);
    if (r && r.last === today) bad("st.done");
    const n = r && r.last === today - 1 ? r.n + 1 : 1;
    const g = r ? await run(env, "UPDATE login_streak SET last = ?, n = ? WHERE uid = ? AND last < ?", today, n, u.uid, today) : await run(env, "INSERT OR IGNORE INTO login_streak (uid, last, n) VALUES (?, ?, ?)", u.uid, today, n);
    if (!g.meta.changes) bad("st.done");
    const d = ((n - 1) % 7) + 1, out = { ok: true, n, day: d, dates: L.STREAK7.DATES[d - 1], jry: 0, spins: 0 };
    await giveReward(env, u.uid, "dates", out.dates, now, "streak");
    if (d === 7) { out.jry = L.STREAK7.JRY7; out.spins = L.STREAK7.SPINS7; await giveReward(env, u.uid, "jry", out.jry, now, "streak"); await giveReward(env, u.uid, "spins", out.spins, now, "streak"); }
    return out;
  },
  "GET /api/ach": async (req, env) => achView(env, await auth(req, env)),
  "POST /api/ach/claim": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), v = await achView(env, u);
    let got = 0, jry = 0;
    for (const a of v.list) {
      if (!a.done || a.claimed) continue;
      const r = await run(env, "INSERT OR IGNORE INTO ach (uid, id, at) VALUES (?, ?, ?)", u.uid, a.id, now);
      if (r.meta.changes) { got++; jry += a.jry; await giveReward(env, u.uid, "jry", a.jry, now, "ach"); }
    }
    if (!got) bad("ach.none");
    return { ok: true, got, jry };
  },

  // ---------- Horse Merge: the game itself runs in the main state (actions mg*); this is ranking and milestone rewards ----------
  "GET /api/merge": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), wid = L.weekId(now);
    const st = await one(env, "SELECT json_extract(json, '$.merge.best') AS best FROM state WHERE uid = ?", u.uid);
    const best = (st && st.best) || 1;
    const done = new Set((await all(env, "SELECT lvl FROM merge_claims WHERE uid = ?", u.uid)).map((r) => r.lvl));
    const pending = []; for (let l = 5; l <= Math.min(best, 400); l += 5) if (!done.has(l)) pending.push({ lv: l, ...L.MG.reward(l) });
    const top = await all(env, "SELECT u.username, w.pts FROM merge_weeks w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? ORDER BY w.pts DESC, w.updated_at ASC LIMIT 100", wid);
    const mine = await one(env, "SELECT pts FROM merge_weeks WHERE week_id = ? AND uid = ?", wid, u.uid);
    const rank = mine ? 1 + (await one(env, "SELECT COUNT(*) AS n FROM merge_weeks WHERE week_id = ? AND (pts > ? OR (pts = ? AND updated_at < (SELECT updated_at FROM merge_weeks WHERE week_id = ? AND uid = ?)))", wid, mine.pts, mine.pts, wid, u.uid)).n : 0;
    return { pending, top: top.map((r, i) => ({ rank: i + 1, username: r.username, pts: r.pts, prize: L.MG.weekPrize(i + 1) })), me: { rank, pts: mine ? mine.pts : 0 }, ends: wid + 7 * DAY, now };
  },
  "POST /api/merge/claim": async (req, env) => {
    const u = await auth(req, env), now = Date.now();
    const st = await one(env, "SELECT json_extract(json, '$.merge.best') AS best FROM state WHERE uid = ?", u.uid);
    const best = (st && st.best) || 1, sum = { jry: 0, spins: 0, levels: 0 };
    for (let l = 5; l <= Math.min(best, 400); l += 5) {
      const r = await run(env, "INSERT OR IGNORE INTO merge_claims (uid, lvl, at) VALUES (?, ?, ?)", u.uid, l, now);
      if (!r.meta.changes) continue;
      const w = L.MG.reward(l); sum.levels++;
      for (const k of ["jry", "spins"]) if (w[k]) { await giveReward(env, u.uid, k, w[k], now, "merge"); sum[k] += w[k]; }
    }
    if (!sum.levels) bad("mg.none");
    return { ok: true, ...sum };
  },

  // ---------- Black Boxes: my openings and burning a card ----------
  "GET /api/bbox": async (req, env) => {
    const u = await auth(req, env);
    const opens = await all(env, "SELECT tier, edition, at FROM bbox_opens WHERE uid = ? AND edition > 0 ORDER BY at DESC LIMIT 10", u.uid);
    const minted = await all(env, "SELECT tier, n FROM bbox_counter");
    return { opens, minted: Object.fromEntries(minted.map((x) => [x.tier, x.n])), now: Date.now() };
  },
  "POST /api/bbox/burn": async (req, env, body) => {
    const u = await auth(req, env), now = Date.now();
    const it = await one(env, "SELECT * FROM nft_items WHERE id = ? AND owner = ?", Number(body.id) || 0, u.uid);
    if (!it || !/^box\d+$/.test(it.kind)) bad("k.nftNotYours");
    const tier = Number(it.kind.slice(3)), B = L.BBOX.of(tier);
    const r = await run(env, "DELETE FROM nft_items WHERE id = ? AND owner = ?", it.id, u.uid);
    if (!r.meta.changes) bad("k.nftGone");
    const dates = Math.floor(B.dates * L.BBOX.BURN);
    await run(env, "INSERT OR IGNORE INTO bbox_burns (item_id, uid, tier, edition, dates, at) VALUES (?, ?, ?, ?, ?, ?)", it.id, u.uid, tier, it.edition, dates, now);
    await creditPoints(env, u.uid, "dates", dates, now, "burn");
    return { ok: true, dates, now };
  },

  // ---------- Usage measurement: which systems players open (one row per player, system and day) ----------
  "POST /api/event": async (req, env, body) => {
    const u = await auth(req, env), name = String(body.name || "");
    if (!USAGE_EVENTS.includes(name)) bad("badAction");
    await run(env, "INSERT OR IGNORE INTO usage_events (uid, name, day) VALUES (?, ?, ?)", u.uid, name, Math.floor(Date.now() / DAY));
    return { ok: true };
  },
  // Owner only (x-admin-token): daily actives, D1/D7 return of recent sign-up cohorts, share of last week's actives who used each system, payers
  "GET /api/admin/metrics": async (req, env) => {
    admin(req, env);
    const today = Math.floor(Date.now() / DAY);
    const dau = await all(env, "SELECT day, COUNT(*) AS n FROM activity WHERE day > ? GROUP BY day ORDER BY day", today - 15);
    const cohorts = [];
    for (let d = today - 14; d <= today - 1; d++) {
      const c = await one(env, `SELECT COUNT(*) AS n,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM activity a WHERE a.uid = u.uid AND a.day = ? + 1) THEN 1 ELSE 0 END) AS d1,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM activity a WHERE a.uid = u.uid AND a.day = ? + 7) THEN 1 ELSE 0 END) AS d7
        FROM users u WHERE CAST(u.created_at / 86400000 AS INTEGER) = ?`, d, d, d);
      if (c && c.n) cohorts.push({ day: d, signups: c.n, d1: c.d1 || 0, d7: d + 7 <= today ? c.d7 || 0 : null });
    }
    const actives = (await one(env, "SELECT COUNT(DISTINCT uid) AS n FROM activity WHERE day > ?", today - 7)).n;
    const usage = await all(env, "SELECT name, COUNT(DISTINCT uid) AS players FROM usage_events WHERE day > ? GROUP BY name ORDER BY players DESC", today - 7);
    const payers = await one(env, "SELECT COUNT(DISTINCT uid) AS n, ROUND(COALESCE(SUM(amount), 0), 2) AS pi FROM payments WHERE status = 'completed' AND created_at > ?", Date.now() - 7 * DAY);
    const owed = await one(env, "SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(amount), 0), 3) AS pi, MIN(created_at) AS oldest FROM payouts WHERE status IN ('new', 'created', 'sending')");
    const failed = (await one(env, "SELECT COUNT(*) AS n FROM payments WHERE status = 'grant_failed'")).n;
    // referrals: invited sign-ups, how many came back the next day, how many made the inviter earn, and the share clicks
    const refs = await one(env, `SELECT COUNT(*) AS signups,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM activity a WHERE a.uid = u.uid AND a.day = CAST(u.created_at / 86400000 AS INTEGER) + 1) THEN 1 ELSE 0 END) AS d1,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM ref_rewards r WHERE r.invitee = u.uid AND r.paid = 1) THEN 1 ELSE 0 END) AS rewarded
      FROM users u WHERE u.referrer IS NOT NULL AND u.created_at > ?`, Date.now() - 30 * DAY);
    const shares = await one(env, "SELECT COUNT(DISTINCT uid) AS players FROM usage_events WHERE name = 'share_click' AND day > ?", today - 7);
    return { referrals30d: { ...refs, sharersLast7d: shares.players }, today, dau, cohorts, weeklyActives: actives, usage: usage.map((x) => ({ ...x, share: actives ? Math.round((100 * x.players) / actives) : 0 })), payers, owed: { ...owed, oldestDays: owed.oldest ? Math.floor((Date.now() - owed.oldest) / DAY) : 0 }, grantFailed: failed };
  },

  // ---------- Harvest levels: XP = dates earned honestly; each level pays once ----------
  "GET /api/level": async (req, env) => {
    const u = await auth(req, env);
    const st = await one(env, "SELECT json_extract(json, '$.xp') AS xp FROM state WHERE uid = ?", u.uid);
    const view = L.LV.view((st && st.xp) || 0);
    const done = new Set((await all(env, "SELECT lvl FROM level_claims WHERE uid = ?", u.uid)).map((r) => r.lvl));
    const pending = []; for (let l = 2; l <= Math.min(view.lv, 400); l++) if (!done.has(l)) pending.push({ lv: l, ...L.LV.reward(l) });
    return { ...view, pending, now: Date.now() };
  },
  "POST /api/level/claim": async (req, env) => {
    const u = await auth(req, env), now = Date.now();
    const st = await one(env, "SELECT json_extract(json, '$.xp') AS xp FROM state WHERE uid = ?", u.uid);
    const lv = L.LV.level((st && st.xp) || 0), sum = { dates: 0, jry: 0, spins: 0, levels: 0 };
    for (let l = 2; l <= Math.min(lv, 400); l++) {
      const r = await run(env, "INSERT OR IGNORE INTO level_claims (uid, lvl, at) VALUES (?, ?, ?)", u.uid, l, now);
      if (!r.meta.changes) continue;
      const w = L.LV.reward(l); sum.levels++;
      for (const k of ["dates", "jry", "spins"]) if (w[k]) { await giveReward(env, u.uid, k, w[k], now, "level"); sum[k] += w[k]; }
    }
    if (!sum.levels) bad("lv.none");
    return { ok: true, ...sum };
  },
  "GET /api/level/top": async (req, env) => {
    const top = await memo(env, "ltop", () => all(env, "SELECT u.username, CAST(json_extract(s.json, '$.xp') AS INTEGER) AS xp FROM state s JOIN users u ON u.uid = s.uid WHERE json_extract(s.json, '$.xp') > 0 ORDER BY xp DESC LIMIT 50"));
    return { top: top.map((r) => ({ username: r.username, xp: r.xp, lv: L.LV.level(r.xp) })) };
  },

  "GET /api/kombat/top": async (req, env) => {
    const now = Date.now();
    if (new URL(req.url).searchParams.get("week")) {
      const wid = KL.weekId(now), last = KL.weekId(now - 7 * DAY);
      const top = await all(env, "SELECT u.username, w.earned AS total FROM kombat_weeks w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? ORDER BY w.earned DESC, w.updated_at ASC LIMIT 100", wid);
      let prize = null;
      try {
        const me = await auth(req, env);
        prize = await weekPrize(env, me.uid, last);
      } catch {}
      return { top, ends: wid + 7 * DAY, prize, prizes: KL.WEEK_PRIZES };
    }
    const rows = await memo(env, "ktop", () => all(
      env,
      `SELECT u.username, CAST(json_extract(s.json, '$.kombat.coins') AS INTEGER) AS total
       FROM state s JOIN users u ON u.uid = s.uid
       WHERE json_extract(s.json, '$.kombat.coins') > 0 ORDER BY total DESC LIMIT 50`
    ));
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
    if (p.place <= 3) await addVipcDays(env, u.uid, VC.VIPC.WEEK_DAYS, now); // a month in the VIP Club for the podium
    return { state: st, n: p.prize, place: p.place, vipc: p.place <= 3, now };
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
    await run(env, "UPDATE users SET jry_wallet = ?, jry_at = NULL WHERE uid = ?", a, u.uid);
    const status = await jryStatusOf(env, a);
    await run(env, "UPDATE users SET jry_bal = ?, jry_at = ? WHERE uid = ?", Number(status.balance) || 0, Date.now(), u.uid);
    return { account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)), trust: status.trust, balance: status.balance };
  },

  // ---------- Partner membership requests (Jerry Development community) ----------
  "POST /api/partner/request": async (req, env, body) => {
    const u = await auth(req, env);
    if (await isPartner(env, u.username)) bad("k.alreadyPartner");
    const note = String(body.note || "").trim().slice(0, 140);
    const prev = await one(env, "SELECT status FROM partner_requests WHERE uid = ?", u.uid);
    if (prev && prev.status === "pending") bad("k.reqPending");
    await run(env, "INSERT OR REPLACE INTO partner_requests (uid, username, note, status, at) VALUES (?, ?, ?, 'pending', ?)", u.uid, u.username, note, Date.now());
    return { account: await account(env, u) };
  },

  // Owner: see requests, approve (grants Partner) or reject
  "POST /api/admin/partner-requests": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const target = String(body.uid || "");
    if (body.action === "approve" || body.action === "reject") {
      const r = await one(env, "SELECT * FROM partner_requests WHERE uid = ?", target);
      if (!r) bad("badAction");
      await run(env, "UPDATE partner_requests SET status = ? WHERE uid = ?", body.action === "approve" ? "approved" : "rejected", target);
      if (body.action === "approve") {
        const name = (await one(env, "SELECT username FROM users WHERE uid = ?", target) || r).username;
        await run(env, "INSERT OR IGNORE INTO partners (username, granted_by, granted_at) VALUES (?, ?, ?)", name, u.username, Date.now());
      }
    }
    const list = await all(env, `SELECT r.uid, COALESCE(u.username, r.username) AS username, r.note, r.at, u.jry_wallet IS NOT NULL AS wallet
      FROM partner_requests r LEFT JOIN users u ON u.uid = r.uid WHERE r.status = 'pending' ORDER BY r.at LIMIT 100`);
    return { requests: list };
  },

  // ---------- Tribes ----------
  "GET /api/tribes": async (req, env) => {
    let me = null;
    try { me = await auth(req, env); } catch {}
    const now = Date.now(), wk = KL.weekId(now), last = KL.weekId(now - 7 * DAY);
    const top = await tribeRanking(env, wk, 30);
    let mine = null, members = [], prize = null;
    if (me) {
      const m = await one(env, "SELECT t.*, tm.joined_at FROM tribe_members tm JOIN tribes t ON t.id = tm.tribe_id WHERE tm.uid = ?", me.uid);
      if (m) {
        const rankRow = top.findIndex((x) => x.id === m.id);
        const count = (await one(env, "SELECT COUNT(*) AS n FROM tribe_members WHERE tribe_id = ?", m.id)).n;
        mine = { id: m.id, name: m.name, emoji: m.emoji, owner: m.owner === me.uid, members: count, rank: rankRow >= 0 ? rankRow + 1 : null, week: rankRow >= 0 ? top[rankRow].score : 0 };
        members = await all(env, `SELECT u.username, COALESCE(w.earned, 0) AS week FROM tribe_members tm JOIN users u ON u.uid = tm.uid
          LEFT JOIN kombat_weeks w ON w.uid = tm.uid AND w.week_id = ? WHERE tm.tribe_id = ? ORDER BY week DESC LIMIT 30`, wk, m.id);
      }
      prize = await tribePrize(env, me.uid, last);
    }
    return { top, mine, members, prize, ends: wk + 7 * DAY, cost: KL.TRIBE.COST, max: KL.TRIBE.MAX, prizes: KL.TRIBE.PRIZES };
  },

  "POST /api/tribes/create": async (req, env, body) => {
    const u = await auth(req, env);
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const emoji = String(body.emoji || "");
    if (!KL.tribeNameOk(name)) bad("k.tribeName");
    if (!KL.TRIBE.EMOJIS.includes(emoji)) bad("badAction");
    if (await one(env, "SELECT 1 AS x FROM tribe_members WHERE uid = ?", u.uid)) bad("k.tribeAlready");
    const now = Date.now();
    const st = await stateFor(env, u, now, tierOf(u, now, await isPartner(env, u.username)));
    st.kombat = KL.norm(st.kombat, now);
    if (st.kombat.coins < KL.TRIBE.COST) bad("k.noCoins", { n: KL.TRIBE.COST - Math.floor(st.kombat.coins) });
    const ins = await run(env, "INSERT OR IGNORE INTO tribes (name, emoji, owner, created_at) VALUES (?, ?, ?, ?)", name, emoji, u.uid, now);
    if (!ins.meta.changes) bad("k.tribeTaken");
    const t = await one(env, "SELECT id FROM tribes WHERE name = ?", name);
    await run(env, "INSERT INTO tribe_members (uid, tribe_id, joined_at) VALUES (?, ?, ?)", u.uid, t.id, now);
    st.kombat.coins -= KL.TRIBE.COST;
    await saveState(env, u.uid, st, now);
    return { state: st, id: t.id, now };
  },

  "POST /api/tribes/join": async (req, env, body) => {
    const u = await auth(req, env);
    const id = Number(body.id) || 0, now = Date.now();
    if (!(await one(env, "SELECT 1 AS x FROM tribes WHERE id = ?", id))) bad("k.tribeGone");
    if (await one(env, "SELECT 1 AS x FROM tribe_members WHERE uid = ?", u.uid)) bad("k.tribeAlready");
    const left = await one(env, "SELECT at FROM tribe_left WHERE uid = ?", u.uid);
    if (left && now - left.at < KL.TRIBE.LEAVE_WAIT) bad("k.tribeWait", { h: Math.ceil((KL.TRIBE.LEAVE_WAIT - (now - left.at)) / 3600e3) });
    // join only while there is room (checked in the same statement)
    const r = await run(env, "INSERT INTO tribe_members (uid, tribe_id, joined_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM tribe_members WHERE tribe_id = ?) < ?", u.uid, id, now, id, KL.TRIBE.MAX);
    if (!r.meta.changes) bad("k.tribeFull");
    return { ok: true };
  },

  "POST /api/tribes/leave": async (req, env) => {
    const u = await auth(req, env);
    const m = await one(env, "SELECT tribe_id FROM tribe_members WHERE uid = ?", u.uid);
    if (!m) bad("k.tribeNone");
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM tribe_members WHERE uid = ?").bind(u.uid),
      env.DB.prepare("INSERT OR REPLACE INTO tribe_left (uid, at) VALUES (?, ?)").bind(u.uid, now),
    ]);
    // the founder leaves: the longest member takes over; an empty tribe is removed
    const t = await one(env, "SELECT owner FROM tribes WHERE id = ?", m.tribe_id);
    if (t && t.owner === u.uid) {
      const next = await one(env, "SELECT uid FROM tribe_members WHERE tribe_id = ? ORDER BY joined_at LIMIT 1", m.tribe_id);
      if (next) await run(env, "UPDATE tribes SET owner = ? WHERE id = ?", next.uid, m.tribe_id);
      else await run(env, "DELETE FROM tribes WHERE id = ?", m.tribe_id);
    }
    return { ok: true };
  },

  // Members of last week's top 3 tribes (who joined before that week) collect once
  "POST /api/tribes/claim": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), last = KL.weekId(now - 7 * DAY);
    const p = await tribePrize(env, u.uid, last);
    if (!p || p.claimed) bad("k.noTribePrize");
    const r = await run(env, "INSERT OR IGNORE INTO tribe_claims (week_id, uid, place, prize, at) VALUES (?, ?, ?, ?, ?)", last, u.uid, p.place, p.prize, now);
    if (!r.meta.changes) bad("k.noTribePrize");
    const st = await stateFor(env, u, now, tierOf(u, now, await isPartner(env, u.username)));
    st.kombat = KL.norm(st.kombat, now);
    st.kombat.coins += p.prize; st.kombat.total += p.prize;
    st.kombat.earn.tribe = (st.kombat.earn.tribe || 0) + p.prize;
    await saveState(env, u.uid, st, now);
    return { state: st, n: p.prize, place: p.place, now };
  },

  // Owner: remove a tribe (e.g. an offensive name)
  "POST /api/admin/tribes": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const id = Number(body.id) || 0;
    await env.DB.batch([env.DB.prepare("DELETE FROM tribe_members WHERE tribe_id = ?").bind(id), env.DB.prepare("DELETE FROM tribes WHERE id = ?").bind(id)]);
    return { ok: true };
  },

  // ---------- Jerry Collectibles (NFT-style, Kombat coins) ----------
  "GET /api/nft": async (req, env) => {
    let me = null;
    try { me = await auth(req, env); } catch {}
    const minted = await all(env, "SELECT kind, COUNT(*) AS n FROM nft_items GROUP BY kind");
    const market = await all(env, "SELECT i.id, i.kind, i.edition, i.price, i.cur, i.swap_want, u.username AS seller FROM nft_items i JOIN users u ON u.uid = i.owner WHERE i.price IS NOT NULL OR i.swap_want IS NOT NULL ORDER BY i.kind, CASE WHEN i.cur = 'jry' THEN i.price * 220 ELSE COALESCE(i.price, 0) END ASC LIMIT 300");
    const mine = me ? await all(env, "SELECT id, kind, edition, price, cur, swap_want FROM nft_items WHERE owner = ? ORDER BY kind, edition", me.uid) : [];
    const recent = await all(env, "SELECT m.price, m.at, i.kind, i.edition, f.username AS seller, t.username AS buyer FROM nft_moves m JOIN nft_items i ON i.id = m.item_id LEFT JOIN users f ON f.uid = m.from_uid JOIN users t ON t.uid = m.to_uid WHERE m.from_uid IS NOT NULL ORDER BY m.at DESC LIMIT 10");
    return { minted: Object.fromEntries(minted.map((x) => [x.kind, x.n])), market, mine, recent, boost: me ? await nftBoost(env, me.uid) : 0 };
  },

  // Mint a new copy (numbered) while editions are left
  "POST /api/nft/mint": async (req, env, body) => {
    const u = await auth(req, env);
    const c = KL.nftById(String(body.kind || ""));
    if (!c) bad("badAction");
    if (c.pi) bad("k.nftPaid"); // Black Boxes are sold for Pi only
    const now = Date.now();
    const st = await stateFor(env, u, now, tierOf(u, now, await isPartner(env, u.username)));
    st.kombat = KL.norm(st.kombat, now);
    const n = (await one(env, "SELECT COUNT(*) AS n FROM nft_items WHERE kind = ?", c.id)).n;
    if (n >= c.max) bad("k.nftSoldOut");
    const cost = KL.mintPrice(c, n);
    if (st.kombat.coins < cost) bad("k.noCoins", { n: cost - Math.floor(st.kombat.coins) });
    st.kombat.coins -= cost;
    await saveState(env, u.uid, st, now); // pay first: a parallel request fails here instead of minting for free
    const ins = await run(env, "INSERT OR IGNORE INTO nft_items (kind, edition, owner, minted_at) VALUES (?, ?, ?, ?)", c.id, n + 1, u.uid, now);
    if (!ins.meta.changes) { await run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'refund')", u.uid, cost, now); bad("k.nftBusy"); } // same number minted a moment ago: refunded, try again
    const item = await one(env, "SELECT id, edition FROM nft_items WHERE kind = ? AND edition = ?", c.id, n + 1);
    await run(env, "INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, NULL, ?, ?, ?)", item.id, u.uid, cost, now);
    return { state: st, item: { id: item.id, kind: c.id, edition: item.edition }, now };
  },

  // List my copy for sale (Kombat coins or JRY), offer it for a swap, or take it off the market.
  // body: { id, price: null } = unlist; { id, price, cur: "coins"|"jry" } = sell; { id, want: "<kind>" } = swap for that card.
  "POST /api/nft/list": async (req, env, body) => {
    const u = await auth(req, env);
    const id = Number(body.id) || 0;
    if (body.want) {
      if (!KL.nftById(String(body.want))) bad("badAction");
      const r = await run(env, "UPDATE nft_items SET price = NULL, cur = 'coins', swap_want = ? WHERE id = ? AND owner = ? AND kind != ?", String(body.want), id, u.uid, String(body.want));
      if (!r.meta.changes) bad("k.nftNotYours");
      return { ok: true };
    }
    const price = body.price == null ? null : Math.floor(Number(body.price));
    const cur = body.cur === "jry" ? "jry" : "coins";
    if (price != null && !(price >= 1 && price <= (cur === "jry" ? 1e8 : 1e12))) bad("k.nftPrice");
    const r = await run(env, "UPDATE nft_items SET price = ?, cur = ?, swap_want = NULL WHERE id = ? AND owner = ?", price, cur, id, u.uid);
    if (!r.meta.changes) bad("k.nftNotYours");
    return { ok: true };
  },

  // Buy a listed copy: the item is reserved first, then the price moves (5% burned)
  "POST /api/nft/buy": async (req, env, body) => {
    const u = await auth(req, env);
    const id = Number(body.id) || 0, price = Math.floor(Number(body.price));
    const item = await one(env, "SELECT * FROM nft_items WHERE id = ?", id);
    if (!item || item.price == null || item.price !== price || (body.cur && body.cur !== item.cur)) bad("k.nftGone");
    if (item.owner === u.uid) bad("k.nftOwn");
    const now = Date.now();
    const st = await stateFor(env, u, now, tierOf(u, now, await isPartner(env, u.username)));
    st.kombat = KL.norm(st.kombat, now);
    if (item.cur === "jry") {
      const me = await one(env, "SELECT jry_pts FROM users WHERE uid = ?", u.uid);
      if (((me && me.jry_pts) || 0) < price) bad("k.noJry", { n: price - ((me && me.jry_pts) || 0) });
    } else if (st.kombat.coins < price) bad("k.noCoins", { n: price - Math.floor(st.kombat.coins) });
    // the buyer pays FIRST (checked), then the card moves; if the card is gone the buyer is refunded
    if (item.cur === "jry") {
      const d = await run(env, "UPDATE users SET jry_pts = jry_pts - ? WHERE uid = ? AND jry_pts >= ?", price, u.uid, price);
      if (!d.meta.changes) bad("k.noJry", { n: price });
    } else {
      st.kombat.coins -= price;
      await saveState(env, u.uid, st, now);
    }
    const r = await run(env, "UPDATE nft_items SET owner = ?, price = NULL, swap_want = NULL, cur = 'coins' WHERE id = ? AND owner = ? AND price = ? AND cur = ?", u.uid, id, item.owner, price, item.cur);
    if (!r.meta.changes) {
      if (item.cur === "jry") await giveReward(env, u.uid, "jry", price, now, "refund");
      else await run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'refund')", u.uid, price, now);
      bad("k.nftGone");
    }
    const net = Math.floor(price * (1 - KL.NFT_FEE));
    if (item.cur === "jry") await giveReward(env, item.owner, "jry", net, now, "nft");
    else await run(env, "INSERT INTO nft_credits (uid, amount, at) VALUES (?, ?, ?)", item.owner, net, now);
    await run(env, "INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, ?, ?, ?, ?)", id, item.owner, u.uid, item.cur === "jry" ? price * 220 : price, now);
    return { state: st, now };
  },

  // Swap: give one of my copies for a listed copy whose owner asked for my card (1 for 1, no fee, no coins)
  "POST /api/nft/swap": async (req, env, body) => {
    const u = await auth(req, env);
    const targetId = Number(body.id) || 0, giveId = Number(body.give) || 0;
    const target = await one(env, "SELECT * FROM nft_items WHERE id = ?", targetId);
    const mine = await one(env, "SELECT * FROM nft_items WHERE id = ?", giveId);
    if (!target || !target.swap_want) bad("k.nftGone");
    if (!mine || mine.owner !== u.uid || mine.kind !== target.swap_want) bad("k.swapWrong");
    if (target.owner === u.uid) bad("k.nftOwn");
    const now = Date.now(), other = target.owner;
    // both copies change hands only if neither moved in the meantime
    const a = await run(env, "UPDATE nft_items SET owner = ?, price = NULL, swap_want = NULL, cur = 'coins' WHERE id = ? AND owner = ? AND swap_want = ?", u.uid, targetId, other, target.swap_want);
    if (!a.meta.changes) bad("k.nftGone");
    const b = await run(env, "UPDATE nft_items SET owner = ?, price = NULL, swap_want = NULL, cur = 'coins' WHERE id = ? AND owner = ?", other, giveId, u.uid);
    if (!b.meta.changes) { await run(env, "UPDATE nft_items SET owner = ? WHERE id = ?", other, targetId); bad("k.nftGone"); }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, ?, ?, 0, ?)").bind(targetId, other, u.uid, now),
      env.DB.prepare("INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, ?, ?, 0, ?)").bind(giveId, u.uid, other, now),
    ]);
    const kind = target.kind;
    notify(env, [{ uid: other, kind: "nftswap", ref: String(targetId), vars: {} }]).catch(() => {});
    return { ok: true, got: { id: targetId, kind, edition: target.edition }, now };
  },

  // ---------- JRY box and gifts between members ----------
  "GET /api/box": async (req, env) => {
    const u = await auth(req, env);
    const history = await all(env, "SELECT delta, kind, ref, at FROM jry_ledger WHERE uid = ? ORDER BY id DESC LIMIT 30", u.uid);
    const sent = await all(env, "SELECT t.what, t.n, t.fee, t.at, t.item_id, x.username AS other, 'out' AS dir FROM transfers t JOIN users x ON x.uid = t.to_uid WHERE t.from_uid = ? ORDER BY t.id DESC LIMIT 15", u.uid);
    const got = await all(env, "SELECT t.what, t.n, t.fee, t.at, t.item_id, x.username AS other, 'in' AS dir FROM transfers t JOIN users x ON x.uid = t.from_uid WHERE t.to_uid = ? ORDER BY t.id DESC LIMIT 15", u.uid);
    const day = Date.now() - DAY, used = await all(env, "SELECT what, SUM(n) AS n, COUNT(*) AS c FROM transfers WHERE from_uid = ? AND at > ? GROUP BY what", u.uid, day);
    // Pi prizes and payouts: kept safe in the box until the app's outgoing wallet is approved, then sent automatically
    const pays = await all(env, "SELECT kind, amount, memo, status, created_at, updated_at FROM payouts WHERE uid = ? ORDER BY created_at DESC LIMIT 30", u.uid);
    const waitingPi = pays.filter((p) => p.status !== "completed" && p.status !== "spent").reduce((a, p) => a + Number(p.amount), 0);
    const paidPi = pays.filter((p) => p.status === "completed").reduce((a, p) => a + Number(p.amount), 0);
    return { piBox: { waiting: Math.round(waitingPi * 1e7) / 1e7, paid: Math.round(paidPi * 1e7) / 1e7, held: env.A2U_LIVE === "0", items: pays.filter((p) => p.status !== "spent").map((p) => ({ kind: p.kind, amount: Number(p.amount), done: p.status === "completed", at: p.created_at })) },
      jry: Number(u.jry_pts) || 0, bought: Number(u.jry_bought) || 0, wallet: u.jry_wallet || "", history, transfers: [...sent, ...got].sort((a, b) => b.at - a.at).slice(0, 20), used, now: Date.now() };
  },

  // Gift to another member. body: { to, what: "coins"|"dates"|"jry"|"item", n, id }
  "POST /api/gift": async (req, env, body) => {
    const u = await auth(req, env);
    const G = KL.GIFT, now = Date.now(), what = String(body.what || "");
    const to = await one(env, "SELECT uid, username FROM users WHERE username = ? COLLATE NOCASE", String(body.to || "").trim().replace(/^@/, ""));
    if (!to) bad("gift.noUser");
    if (to.uid === u.uid) bad("gift.self");
    if (now - Number(u.created_at) < G.MIN_AGE_MS) bad("gift.young");
    const day = now - DAY;
    const done = await one(env, "SELECT COUNT(*) AS c FROM transfers WHERE from_uid = ? AND at > ?", u.uid, day);
    if (done.c >= G.MAX_PER_DAY) bad("gift.daily");
    const usedN = async () => Number((await one(env, "SELECT COALESCE(SUM(n), 0) AS n FROM transfers WHERE from_uid = ? AND what = ? AND at > ?", u.uid, what, day)).n);
    let fee = 0, n = 0, itemId = null;
    if (what === "item") {
      itemId = Number(body.id) || 0;
      const it = await one(env, "SELECT * FROM nft_items WHERE id = ? AND owner = ?", itemId, u.uid);
      if (!it) bad("k.nftNotYours");
      const r = await run(env, "UPDATE nft_items SET owner = ?, price = NULL, swap_want = NULL, cur = 'coins' WHERE id = ? AND owner = ?", to.uid, itemId, u.uid);
      if (!r.meta.changes) bad("k.nftGone");
      await run(env, "INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, ?, ?, 0, ?)", itemId, u.uid, to.uid, now);
      n = 1;
    } else if (what === "coins" || what === "dates" || what === "jry") {
      n = Math.floor(Number(body.n));
      if (!(n >= G.MIN[what])) bad("gift.min", { n: G.MIN[what] });
      if ((await usedN()) + n > G.DAILY_MAX[what]) bad("gift.limit", { n: G.DAILY_MAX[what] });
      fee = Math.floor(n * G.FEE[what]);
      if (what === "jry") {
        const r = await run(env, "UPDATE users SET jry_pts = jry_pts - ? WHERE uid = ? AND jry_pts >= ?", n, u.uid, n);
        if (!r.meta.changes) bad("k.noJry", { n });
        await giveReward(env, to.uid, "jry", n - fee, now, "gift");
        await env.DB.batch([
          env.DB.prepare("INSERT INTO jry_ledger (uid, delta, kind, ref, at) VALUES (?, ?, 'gift-out', ?, ?)").bind(u.uid, -n, to.username, now),
          env.DB.prepare("INSERT INTO jry_ledger (uid, delta, kind, ref, at) VALUES (?, ?, 'gift-in', ?, ?)").bind(to.uid, n - fee, u.username, now),
        ]);
      } else {
        const st = await stateFor(env, u, now, tierOf(u, now, await isPartner(env, u.username)));
        st.kombat = KL.norm(st.kombat, now);
        if (what === "coins") {
          if (st.kombat.coins < n) bad("k.noCoins", { n: n - Math.floor(st.kombat.coins) });
          if (n > st.kombat.coins * G.COINS_SHARE) bad("gift.share", { p: Math.round(G.COINS_SHARE * 100) });
          st.kombat.coins -= n;
        } else {
          if (st.dates < n) bad("mk.notEnough");
          st.dates -= n;
        }
        await saveState(env, u.uid, st, now);
        await creditPoints(env, to.uid, what, n - fee, now, "gift");
      }
    } else bad("badAction");
    await run(env, "INSERT INTO transfers (from_uid, to_uid, what, n, fee, item_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)", u.uid, to.uid, what, n, fee, itemId, now);
    notify(env, [{ uid: to.uid, kind: "gift", ref: String(now) + ":" + u.uid, vars: { u: u.username } }]).catch(() => {});
    const me = await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid));
    return { ok: true, fee, n, to: to.username, account: me, now };
  },

  // ---------- Chat: one public room ("main") and private chats between two members ----------
  "GET /api/chat/rooms": async (req, env) => {
    const u = await auth(req, env);
    const readOf = async (room) => ((await one(env, "SELECT last_id FROM chat_reads WHERE uid = ? AND room = ?", u.uid, room)) || { last_id: 0 }).last_id;
    const last = async (room) => one(env, "SELECT m.id, m.text, m.at, x.username FROM chat_msgs m JOIN users x ON x.uid = m.uid WHERE m.room = ? AND m.del = 0 ORDER BY m.id DESC LIMIT 1", room);
    const unread = async (room, from) => (await one(env, "SELECT COUNT(*) AS n FROM chat_msgs m WHERE m.room = ? AND m.id > ? AND m.del = 0 AND m.uid != ? AND m.uid NOT IN (SELECT other FROM chat_blocks WHERE uid = ?)", room, from, u.uid, u.uid)).n;
    const rooms = [{ room: "main", last: await last("main"), unread: await unread("main", await readOf("main")) }];
    const dms = await all(env, "SELECT room FROM chat_members WHERE uid = ? AND room LIKE 'dm:%' LIMIT 60", u.uid);
    for (const d of dms) {
      const other = d.room.split(":").filter((x, i) => i > 0 && x !== u.uid)[0];
      const ou = await one(env, "SELECT username FROM users WHERE uid = ?", other);
      if (!ou) continue;
      rooms.push({ room: "dm:" + ou.username, user: ou.username, last: await last(d.room), unread: await unread(d.room, await readOf(d.room)) });
    }
    rooms.sort((a, b) => (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0));
    const total = rooms.reduce((n, r) => n + r.unread, 0);
    const blocked = await all(env, "SELECT x.username FROM chat_blocks b JOIN users x ON x.uid = b.other WHERE b.uid = ?", u.uid);
    return { rooms, unread: total, blocked: blocked.map((x) => x.username), now: Date.now() };
  },

  "GET /api/chat/msgs": async (req, env) => {
    const u = await auth(req, env);
    const q = new URL(req.url).searchParams, since = Number(q.get("since")) || 0;
    const room = await chatRoom(env, u, q.get("room"));
    const rows = since
      ? await all(env, "SELECT m.id, m.text, m.at, m.uid, x.username FROM chat_msgs m JOIN users x ON x.uid = m.uid WHERE m.room = ? AND m.id > ? AND m.del = 0 AND m.uid NOT IN (SELECT other FROM chat_blocks WHERE uid = ?) ORDER BY m.id ASC LIMIT 100", room, since, u.uid)
      : (await all(env, "SELECT m.id, m.text, m.at, m.uid, x.username FROM chat_msgs m JOIN users x ON x.uid = m.uid WHERE m.room = ? AND m.del = 0 AND m.uid NOT IN (SELECT other FROM chat_blocks WHERE uid = ?) ORDER BY m.id DESC LIMIT 50", room, u.uid)).reverse();
    const lastId = rows.length ? rows[rows.length - 1].id : since;
    if (rows.length) await run(env, "INSERT INTO chat_reads (uid, room, last_id) VALUES (?, ?, ?) ON CONFLICT(uid, room) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)", u.uid, room, lastId);
    return { msgs: rows.map((m) => ({ id: m.id, text: m.text, at: m.at, user: m.username, mine: m.uid === u.uid })), last: lastId, now: Date.now() };
  },

  "POST /api/chat/send": async (req, env, body) => {
    const u = await auth(req, env);
    const room = await chatRoom(env, u, body.room);
    const text = String(body.text || "").replace(/\s+/g, " ").trim();
    if (!text) bad("badAction");
    if (text.length > 400) bad("chat.long");
    if (/https?:\/\/|www\.|t\.me\/|wa\.me\//i.test(text)) bad("chat.links");
    const now = Date.now();
    if (now - Number(u.created_at) < 3600000) bad("chat.young");
    const mute = await one(env, "SELECT until FROM chat_mutes WHERE uid = ?", u.uid);
    if (mute && mute.until > now) bad("chat.muted");
    const recent = await one(env, "SELECT COUNT(*) AS n, MAX(at) AS last FROM chat_msgs WHERE uid = ? AND at > ?", u.uid, now - 60000);
    if ((recent.last && now - recent.last < 2000) || recent.n >= 30) bad("chat.fast");
    const dup = await one(env, "SELECT 1 AS x FROM chat_msgs WHERE uid = ? AND room = ? AND text = ? AND at > ?", u.uid, room, text, now - 30000);
    if (dup) bad("chat.fast");
    let target = null;
    if (room !== "main") {
      target = room.split(":").filter((x, i) => i > 0 && x !== u.uid)[0];
      if (await one(env, "SELECT 1 AS x FROM chat_blocks WHERE uid = ? AND other = ?", target, u.uid)) bad("chat.blocked");
    }
    const r = await run(env, "INSERT INTO chat_msgs (room, uid, text, at) VALUES (?, ?, ?, ?)", room, u.uid, text, now);
    if (room !== "main") await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO chat_members (uid, room) VALUES (?, ?)").bind(u.uid, room), env.DB.prepare("INSERT OR IGNORE INTO chat_members (uid, room) VALUES (?, ?)").bind(target, room)]);
    await run(env, "INSERT INTO chat_reads (uid, room, last_id) VALUES (?, ?, ?) ON CONFLICT(uid, room) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)", u.uid, room, r.meta.last_row_id);
    if (target) notify(env, [{ uid: target, kind: "chatdm", ref: room + ":" + Math.floor(now / 3600000), vars: { u: u.username }, q: "with=" + encodeURIComponent(u.username) }]).catch(() => {});
    return { ok: true, id: r.meta.last_row_id, now };
  },

  "POST /api/chat/block": async (req, env, body) => {
    const u = await auth(req, env);
    const o = await one(env, "SELECT uid FROM users WHERE username = ? COLLATE NOCASE", String(body.user || ""));
    if (!o || o.uid === u.uid) bad("chat.noUser");
    if (body.on === false) await run(env, "DELETE FROM chat_blocks WHERE uid = ? AND other = ?", u.uid, o.uid);
    else await run(env, "INSERT OR IGNORE INTO chat_blocks (uid, other) VALUES (?, ?)", u.uid, o.uid);
    return { ok: true };
  },

  "POST /api/chat/report": async (req, env, body) => {
    const u = await auth(req, env);
    const m = await one(env, "SELECT id, uid FROM chat_msgs WHERE id = ?", Number(body.msg) || 0);
    if (!m || m.uid === u.uid) bad("badAction");
    await run(env, "INSERT OR IGNORE INTO chat_reports (msg_id, reporter, at) VALUES (?, ?, ?)", m.id, u.uid, Date.now());
    // three different reporters hide the message until the owner looks at it
    const n = (await one(env, "SELECT COUNT(*) AS n FROM chat_reports WHERE msg_id = ?", m.id)).n;
    if (n >= 3) await run(env, "UPDATE chat_msgs SET del = 1 WHERE id = ?", m.id);
    return { ok: true };
  },

  // Owner: reported messages, delete a message, mute a member
  "POST /api/admin/chat": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    if (body.action === "delete") await run(env, "UPDATE chat_msgs SET del = 1 WHERE id = ?", Number(body.id) || 0);
    if (body.action === "mute") {
      const o = await one(env, "SELECT uid FROM users WHERE username = ? COLLATE NOCASE", String(body.user || ""));
      if (!o) bad("chat.noUser");
      await run(env, "INSERT INTO chat_mutes (uid, until) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET until = excluded.until", o.uid, Date.now() + (Math.min(Number(body.hours) || 24, 24 * 365)) * 3600000);
    }
    const reported = await all(env, "SELECT m.id, m.text, m.at, m.del, x.username, (SELECT COUNT(*) FROM chat_reports r WHERE r.msg_id = m.id) AS n FROM chat_msgs m JOIN users x ON x.uid = m.uid WHERE m.id IN (SELECT msg_id FROM chat_reports) ORDER BY m.id DESC LIMIT 30");
    return { reported };
  },

  // ---------- Magazine feed (manga, posts, lessons) from the Jerry Magazine Worker, cached for 10 minutes ----------
  "GET /api/mag": async (req, env) => {
    const empty = { manga: [], posts: [], courses: [], site: env.MAG_URL || "" };
    try {
      const key = new Request("https://mag-cache.invalid/feed");
      const cache = typeof caches !== "undefined" ? caches.default : null;
      const hit = cache ? await cache.match(key) : null;
      if (hit) return new Response(hit.body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
      const r = env.MAG ? await env.MAG.fetch("https://magazine/feed.json") : env.MAG_URL ? await fetch(env.MAG_URL + "/feed.json") : null;
      if (!r || !r.ok) return json(empty);
      const text = await r.text();
      JSON.parse(text); // refuse anything that is not JSON
      const res = new Response(text, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" } });
      if (cache) await cache.put(key, res.clone());
      return res;
    } catch (e) { return json(empty); }
  },

  // ---------- Jerry Castle (tower defense): the server replays the player's actions and pays the rewards ----------
  "GET /api/castle": async (req, env) => {
    const u = await auth(req, env);
    const rows = await all(env, "SELECT map, stars, best_wave FROM castle_runs WHERE uid = ?", u.uid);
    const day = Math.floor(Date.now() / DAY);
    const d = await one(env, "SELECT n FROM castle_day WHERE uid = ? AND day = ?", u.uid, day);
    const maps = CASTLE.MAPS.map((m, i) => { const r = rows.find((x) => x.map === i); return { stars: r ? r.stars : 0, best: r ? r.best_wave : 0, open: i === 0 || rows.some((x) => x.map === i - 1 && x.stars > 0) }; });
    return { maps, replaysLeft: Math.max(0, CASTLE_REWARD.REPLAYS - ((d && d.n) || 0)), reward: CASTLE_REWARD, now: Date.now() };
  },

  // body: { map, log: [[tick, action], ...] } -> verified result
  "GET /api/castle/top": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), wid = L.weekId(now);
    const top = await all(env, "SELECT u.username, w.pts FROM castle_weeks w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? ORDER BY w.pts DESC, w.updated_at ASC LIMIT 100", wid);
    const mine = await one(env, "SELECT pts, updated_at FROM castle_weeks WHERE week_id = ? AND uid = ?", wid, u.uid);
    const rank = mine ? 1 + (await one(env, "SELECT COUNT(*) AS n FROM castle_weeks WHERE week_id = ? AND (pts > ? OR (pts = ? AND updated_at < ?))", wid, mine.pts, mine.pts, mine.updated_at)).n : 0;
    return { top: top.map((r, i) => ({ rank: i + 1, username: r.username, pts: r.pts, waves: Math.floor(r.pts / 10000), prize: L.MG.weekPrize(i + 1) })), me: { rank, pts: mine ? mine.pts : 0 }, ends: wid + 7 * DAY, now };
  },
  "POST /api/castle/finish": async (req, env, body) => {
    const u = await auth(req, env);
    const map = Number(body.map);
    if (!Number.isInteger(map) || !CASTLE.MAPS[map]) bad("badAction");
    const rows = await all(env, "SELECT map, stars, best_wave FROM castle_runs WHERE uid = ?", u.uid);
    if (map > 0 && !rows.some((x) => x.map === map - 1 && x.stars > 0)) bad("castle.locked");
    const endless = !!body.endless;
    const g = CASTLE.simulate(map, body.log, endless);
    if (g.error) bad("castle.log");
    const now = Date.now(), day = Math.floor(now / DAY), stars = CASTLE.stars(g), prev = rows.find((x) => x.map === map);
    let coins = 0, dates = 0, kind = "none";
    if (endless) {
      // Endless Siege: points for the weekly ranking, a small coin reward for the first runs of the day
      const pts = CASTLE.score(g), wid = L.weekId(now), cl = CASTLE.cleared(g);
      if (pts > 0) await run(env, `INSERT INTO castle_weeks (week_id, uid, pts, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(week_id, uid) DO UPDATE SET pts = MAX(pts, excluded.pts), updated_at = CASE WHEN excluded.pts > pts THEN excluded.updated_at ELSE updated_at END`, wid, u.uid, pts, now);
      const key = u.uid + ":e", d = await one(env, "SELECT n FROM castle_day WHERE uid = ? AND day = ?", key, day);
      if (cl > 0 && ((d && d.n) || 0) < CASTLE_REWARD.ENDLESS_RUNS) { await run(env, "INSERT INTO castle_day (uid, day, n) VALUES (?, ?, 1) ON CONFLICT(uid, day) DO UPDATE SET n = n + 1", key, day); coins = cl * CASTLE_REWARD.ENDLESS_COINS; kind = "endless"; await giveReward(env, u.uid, "coins", coins, now, "castle"); }
      return { endless: true, wave: cl, kills: g.kills, pts, coins, dates: 0, kind, now };
    }
    if (g.won) {
      const R = CASTLE_REWARD.MAPS[Math.min(map, CASTLE_REWARD.MAPS.length - 1)];
      if (!prev || prev.stars === 0) { coins = Math.floor(R.coins * (1 + 0.25 * (stars - 1))); dates = R.dates; kind = "first"; }
      else if (stars > prev.stars) { coins = Math.floor(R.coins * 0.25 * (stars - prev.stars)); kind = "stars"; }
      else {
        const d = await one(env, "SELECT n FROM castle_day WHERE uid = ? AND day = ?", u.uid, day);
        if (((d && d.n) || 0) < CASTLE_REWARD.REPLAYS) { await run(env, "INSERT INTO castle_day (uid, day, n) VALUES (?, ?, 1) ON CONFLICT(uid, day) DO UPDATE SET n = n + 1", u.uid, day); coins = R.replay; kind = "replay"; }
      }
    }
    await run(env, "INSERT INTO castle_runs (uid, map, stars, best_wave, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(uid, map) DO UPDATE SET stars = MAX(stars, excluded.stars), best_wave = MAX(best_wave, excluded.best_wave), at = excluded.at", u.uid, map, stars, g.wave, now);
    if (coins) await giveReward(env, u.uid, "coins", coins, now, "castle");
    if (dates) await giveReward(env, u.uid, "dates", dates, now, "castle");
    return { won: g.won, wave: g.wave, hp: g.hp, stars, kills: g.kills, coins, dates, kind, now };
  },

  // ---------- Jerry community: votes, top holders, chat link ----------
  "GET /api/community": async (req, env) => {
    const now = Date.now();
    let me = null;
    try { me = await auth(req, env); } catch {}
    const polls = await all(env, "SELECT * FROM polls WHERE closed = 0 AND ends_at > ? ORDER BY id DESC LIMIT 3", now);
    const last = await all(env, "SELECT * FROM polls WHERE closed = 1 OR ends_at <= ? ORDER BY id DESC LIMIT 2", now);
    const withTally = async (p) => {
      const opts = JSON.parse(p.options);
      const rows = await all(env, "SELECT opt, SUM(weight) AS w, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY opt", p.id);
      const mine = me ? await one(env, "SELECT opt FROM poll_votes WHERE poll_id = ? AND uid = ?", p.id, me.uid) : null;
      return { id: p.id, q: p.q, ends: p.ends_at, open: !p.closed && p.ends_at > now,
        options: opts.map((o, i) => { const r = rows.find((x) => x.opt === i); return { text: o, weight: r ? r.w : 0, voters: r ? r.n : 0 }; }),
        mine: mine ? mine.opt : null };
    };
    const holders = isTestnet(env)
      ? await all(env, "SELECT username, jry_bal AS bal FROM users WHERE jry_bal >= 1 ORDER BY jry_bal DESC LIMIT 20")
      : [];
    return {
      polls: await Promise.all(polls.map(withTally)),
      past: await Promise.all(last.map(withTally)),
      holders,
      myWeight: me ? KL.voteWeight(await jryHeld(env, me)) : 1,
      chat: env.COMMUNITY_CHAT_URL || "",
    };
  },

  "POST /api/community/vote": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const p = await one(env, "SELECT * FROM polls WHERE id = ?", Number(body.id) || 0);
    if (!p || p.closed || p.ends_at <= now) bad("k.pollClosed");
    const opt = Number(body.opt);
    if (!Number.isInteger(opt) || opt < 0 || opt >= JSON.parse(p.options).length) bad("badAction");
    // Weight from testJRY held now (read on the Pi network). Changing your vote is allowed until it closes.
    const weight = KL.voteWeight(await jryHeld(env, u, true));
    await run(env, "INSERT INTO poll_votes (poll_id, uid, opt, weight, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(poll_id, uid) DO UPDATE SET opt = excluded.opt, weight = excluded.weight, at = excluded.at", p.id, u.uid, opt, weight, now);
    return { ok: true, weight };
  },

  // Owner: create or close a vote
  "POST /api/admin/polls": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    if (body.action === "create") {
      const q = String(body.q || "").trim().slice(0, 200);
      const options = (Array.isArray(body.options) ? body.options : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 6);
      const days = Math.min(30, Math.max(1, Number(body.days) || 3));
      if (!q || options.length < 2) bad("k.pollBad");
      await run(env, "INSERT INTO polls (q, options, created_at, ends_at) VALUES (?, ?, ?, ?)", q, JSON.stringify(options), Date.now(), Date.now() + days * DAY);
    } else if (body.action === "close") {
      await run(env, "UPDATE polls SET closed = 1 WHERE id = ?", Number(body.id) || 0);
    }
    return { ok: true };
  },

  // Community market: testJRY price from the Test-Pi pool, pool size, holders (cached 1 min)
  // ---------- Points market ----------
  "GET /api/mk": async (req, env) => {
    const u = await auth(req, env);
    const open = await all(env, `SELECT o.*, s.username AS seller FROM mk_offers o JOIN users s ON s.uid = o.uid
      WHERE o.status IN ('open', 'reserved') AND o.kind != 'card' ORDER BY o.pi / o.amount ASC, o.id ASC LIMIT 60`);
    const mine = await all(env, "SELECT * FROM mk_offers WHERE uid = ? AND kind != 'card' ORDER BY id DESC LIMIT 15", u.uid);
    const view = (o) => ({ id: o.id, kind: o.kind, amount: o.amount, pi: o.pi, status: o.status, seller: o.seller, mine: o.uid === u.uid });
    const pend = await one(env, "SELECT amount FROM withdrawals WHERE uid = ? AND src = 'mk' AND status IN ('pending', 'processing')", u.uid);
    return { offers: open.map(view), mine: mine.map(view), balance: Number(u.mk_balance) || 0, pending: pend ? pend.amount : 0,
      tax: MK.TAX, minWithdraw: MK.MIN_WITHDRAW };
  },
  // Sell points: they leave the seller's game now and wait in the offer until sold or cancelled
  "POST /api/mk/offer": async (req, env, body) => {
    const u = await auth(req, env);
    const kind = body.kind === "coins" ? "coins" : "dates";
    const amount = Math.floor(Number(body.amount)), pi = round(Number(body.pi));
    if (!(amount >= MK.MIN[kind])) bad(kind === "coins" ? "mk.minCoins" : "mk.minDates");
    if (!(pi >= MK.MIN_PI && pi <= MK.MAX_PI)) bad("mk.price");
    const n = await one(env, "SELECT COUNT(*) AS n FROM mk_offers WHERE uid = ? AND status IN ('open', 'reserved')", u.uid);
    if (n.n >= MK.MAX_OPEN) bad("mk.tooMany");
    const now = Date.now();
    const tier = tierOf(u, now, await isPartner(env, u.username));
    const st = await stateFor(env, u, now, tier);
    if (kind === "coins") {
      st.kombat = KL.norm(st.kombat, now);
      if (st.kombat.coins < amount) bad("mk.notEnough");
      st.kombat.coins -= amount;
    } else {
      if (st.dates < amount) bad("mk.notEnough");
      st.dates -= amount;
    }
    await saveState(env, u.uid, st, now);
    await run(env, "INSERT INTO mk_offers (uid, kind, amount, pi, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", u.uid, kind, amount, pi, now, now);
    return { ok: true, state: st };
  },
  "POST /api/mk/cancel": async (req, env, body) => {
    const u = await auth(req, env);
    const o = await one(env, "SELECT * FROM mk_offers WHERE id = ? AND uid = ?", Number(body.id), u.uid);
    if (!o) bad("mk.gone");
    const now = Date.now();
    if (o.status === "reserved") {
      let stale = now - o.reserved_at > MK.HOLD_MS;
      if (stale) { try { const { p } = await findPayment(env, o.pay_id); stale = !p.transaction; } catch (e) {} }
      if (!stale) bad("mk.busy");
    }
    const r = await run(env, "UPDATE mk_offers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('open', 'reserved') AND COALESCE(pay_id, '') = ?", now, o.id, o.pay_id || "");
    if (!r.meta.changes) bad("mk.busy");
    await creditPoints(env, u.uid, o.kind, o.amount, now, "market");
    const tier = tierOf(u, now, await isPartner(env, u.username));
    return { ok: true, state: await stateFor(env, u, now, tier) };
  },
  // Withdraw the sales balance (from MIN_WITHDRAW Pi): paid to the player's Pi wallet by the hourly run
  "POST /api/mk/withdraw": async (req, env) => {
    const u = await auth(req, env);
    const bal = Number(u.mk_balance) || 0;
    if (bal < MK.MIN_WITHDRAW) bad("mk.minWithdraw");
    if (await one(env, "SELECT id FROM withdrawals WHERE uid = ? AND status = 'pending'", u.uid)) bad("pendingWithdraw");
    const amount = round(bal);
    const r = await run(env, "UPDATE users SET mk_balance = 0 WHERE uid = ? AND mk_balance = ?", u.uid, u.mk_balance);
    if (!r.meta.changes) bad("server");
    await run(env, "INSERT INTO withdrawals (id, uid, username, amount, status, created_at, src) VALUES (?, ?, ?, ?, 'pending', ?, 'mk')", crypto.randomUUID(), u.uid, u.username, amount, Date.now());
    await runPayouts(env).catch((e) => logError(env, "mk withdraw", 0, e.message));
    return { ok: true, amount, account: await account(env, await one(env, "SELECT * FROM users WHERE uid = ?", u.uid)) };
  },

  // ---------- Earn page: a rewarded Pi ad (checked with Pi) gives points ----------
  "POST /api/earn/ad": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), day = L.dayId(now), E = L.EARN;
    const n = (u.earn_day ?? -1) === day ? Number(u.earn_n) || 0 : 0;
    if (now - (Number(u.earn_at) || 0) < E.GAP) bad("earn.wait");
    if (!(await verifyAd(env, u.uid, body.adId, now))) bad("k.adFail");
    const ads = Number(u.earn_ads) || 0, lvl = L.earnLevel(ads);
    let dates = Math.round((n < E.DATES.length ? E.DATES[n] : E.AFTER) * (1 + E.LEVELS[lvl].x));
    const bonus = E.BONUS[n + 1] ? { ...E.BONUS[n + 1] } : n + 1 === E.STREAK_ADS ? {} : null;
    // the 5th ad of the day keeps the daily streak going
    let streak = null;
    if (n + 1 === E.STREAK_ADS) {
      streak = (u.earn_sday ?? -1) === day - 1 ? (Number(u.earn_streak) || 0) + 1 : 1;
      bonus.streak = streak; bonus.streakDates = E.STREAK_DATES * Math.min(streak, E.STREAK_MAX);
      dates += bonus.streakDates;
    }
    // count it once, even if two requests arrive together
    const r = await run(env, "UPDATE users SET earn_day = ?, earn_n = ?, earn_at = ?, earn_total = COALESCE(earn_total, 0) + ?, earn_ads = COALESCE(earn_ads, 0) + 1 WHERE uid = ? AND COALESCE(earn_at, 0) = ?",
      day, n + 1, now, dates, u.uid, Number(u.earn_at) || 0);
    if (!r.meta.changes) bad("earn.wait");
    if (streak) await run(env, "UPDATE users SET earn_streak = ?, earn_sday = ? WHERE uid = ?", streak, day, u.uid);
    await creditPoints(env, u.uid, "dates", dates, now, "ad");
    if (bonus) {
      if (bonus.spins) await run(env, "UPDATE users SET wheel_spins = COALESCE(wheel_spins, 0) + ? WHERE uid = ?", bonus.spins, u.uid);
      if (bonus.coins) await creditPoints(env, u.uid, "coins", bonus.coins, now, "ad");
      if (bonus.jry) await run(env, "UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?", bonus.jry, u.uid);
    }
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, dates, bonus, n: n + 1, levelUp: L.earnLevel(ads + 1) > lvl, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },
  // Top viewers (ads watched, all time)
  "GET /api/earn/top": async (req, env) => {
    const top = await all(env, "SELECT username, earn_ads AS ads, earn_total AS dates FROM users WHERE earn_ads > 0 ORDER BY earn_ads DESC, earn_total DESC LIMIT 10");
    const tot = await one(env, "SELECT COALESCE(SUM(earn_ads), 0) AS ads, COUNT(*) AS viewers FROM users WHERE earn_ads > 0");
    return { top, ads: tot.ads, viewers: tot.viewers };
  },

  // ---------- 🎁 The code of the day: one code a day, 100 players (one use each), valid 24 h (10,000 JRY + 5,000 dates) ----------
  "GET /api/daily-code": async (req, env) => {
    const now = Date.now(), day = Math.floor(now / DAY), note = "daily:" + day;
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=15", "Content-Type": "application/json; charset=utf-8" };
    // the magazine and the app both read this: keep an answer for 15 s so visitors don't hit the database
    const ck = new Request("https://daycode-cache.invalid/" + day), cache = typeof caches !== "undefined" ? caches.default : null;
    const hit = cache ? await cache.match(ck) : null;
    if (hit) return new Response(hit.body, { headers: cors });
    let c = await one(env, "SELECT * FROM codes WHERE note = ? ORDER BY created_at ASC LIMIT 1", note);
    if (!c) {
      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(8));
      const code = "DAY-" + [...b].map((x) => abc[x % abc.length]).join("");
      await run(env, "INSERT OR IGNORE INTO codes (code, kind, amount, kind2, amount2, max_uses, used, expires_at, note, created_at) VALUES (?, 'jry', 10000, 'dates', 5000, ?, 0, ?, ?, ?)", code, DAILY_CODE_USES, now + DAY, note, now);
      c = await one(env, "SELECT * FROM codes WHERE note = ? ORDER BY created_at ASC LIMIT 1", note);
    }
    const taken = c.used >= c.max_uses, expired = c.expires_at && c.expires_at < now;
    const out = JSON.stringify({ code: taken || expired ? null : c.code, taken: !!taken, left: Math.max(0, c.max_uses - c.used), max: c.max_uses, expiresAt: c.expires_at, jry: c.amount, dates: c.amount2, app: env.PUBLIC_URL || "" });
    if (cache) await cache.put(ck, new Response(out, { headers: cors }));
    return new Response(out, { headers: cors });
  },

  // ---------- 🎟️ Gift codes ----------
  "POST /api/code/redeem": async (req, env, body) => {
    const u = await auth(req, env);
    const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
    if (code.length < 4) bad("code.bad");
    const now = Date.now();
    const c = await one(env, "SELECT * FROM codes WHERE code = ?", code);
    if (!c) bad("code.bad");
    if (c.expires_at && c.expires_at < now) bad("code.expired");
    if (await one(env, "SELECT 1 AS x FROM code_uses WHERE code = ? AND uid = ?", code, u.uid)) bad("code.used");
    // take one use (never more than max_uses, even with two players at the same moment)
    const r = await run(env, "UPDATE codes SET used = used + 1 WHERE code = ? AND used < max_uses", code);
    if (!r.meta.changes) bad("code.empty");
    const ins = await run(env, "INSERT OR IGNORE INTO code_uses (code, uid, at) VALUES (?, ?, ?)", code, u.uid, now);
    if (!ins.meta.changes) { await run(env, "UPDATE codes SET used = used - 1 WHERE code = ?", code); bad("code.used"); }
    await giveReward(env, u.uid, c.kind, c.amount, now, "code");
    if (c.kind2 && c.amount2) await giveReward(env, u.uid, c.kind2, c.amount2, now, "code");
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, kind: c.kind, amount: c.amount, kind2: c.kind2 || null, amount2: c.amount2 || 0, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },
  "POST /api/admin/codes": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now(), made = [];
    if (body.action === "create") {
      const kind = ["dates", "coins", "jry", "spins", "vipclub"].includes(body.kind) ? body.kind : "dates";
      const amount = Math.floor(Number(body.amount)), uses = Math.floor(Number(body.uses)) || 1, count = Math.min(200, Math.max(1, Math.floor(Number(body.count)) || 1));
      const lim = { dates: 1e6, coins: 1e8, jry: 1e5, spins: 100, vipclub: 365 }[kind];
      if (!(amount > 0 && amount <= lim) || !(uses >= 1 && uses <= 1e6)) bad("badAction");
      const days = Number(body.days) || 0, exp = days > 0 ? now + days * 86400000 : null;
      const custom = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const rnd = () => { const b = crypto.getRandomValues(new Uint8Array(10)); return "JRY-" + [...b].map((x) => abc[x % abc.length]).join(""); };
      for (let i = 0; i < (custom ? 1 : count); i++) {
        const code = custom || rnd();
        const r = await run(env, "INSERT OR IGNORE INTO codes (code, kind, amount, max_uses, used, expires_at, note, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
          code, kind, amount, uses, exp, String(body.note || "").slice(0, 80), now);
        if (r.meta.changes) made.push(code);
      }
      if (custom && !made.length) bad("code.exists");
    } else if (body.action === "delete") {
      await run(env, "DELETE FROM codes WHERE code = ?", String(body.code || ""));
    }
    const list = await all(env, "SELECT * FROM codes ORDER BY created_at DESC LIMIT 100");
    return { made, list };
  },

  // ---------- 🎯 Tasks center ----------
  "GET /api/quests": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    const list = await all(env, "SELECT * FROM quests WHERE active = 1 AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort, id", now);
    const out = [];
    for (const q of list) out.push(await questView(env, u, q, now));
    return { list: out };
  },
  "POST /api/quests/open": async (req, env, body) => {
    const u = await auth(req, env);
    const q = await one(env, "SELECT * FROM quests WHERE id = ? AND active = 1", Number(body.id));
    if (!q || q.kind !== "link") bad("q.gone");
    await run(env, "INSERT OR IGNORE INTO quest_open (quest_id, uid, at) VALUES (?, ?, ?)", q.id, u.uid, Date.now());
    return { ok: true, wait: Q.LINK_WAIT };
  },
  "POST /api/quests/claim": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const q = await one(env, "SELECT * FROM quests WHERE id = ?", Number(body.id));
    if (!q || !q.active || (q.ends_at && q.ends_at <= now)) bad("q.gone");
    const v = await questView(env, u, q, now);
    if (v.done) bad("q.done");
    if (q.kind === "secret") {
      const norm = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!norm(body.answer) || norm(body.answer) !== norm(q.secret)) bad("q.wrong");
    } else if (q.kind === "link") {
      if (!v.opened) bad("q.openFirst");
      if (v.wait > 0) bad("q.wait", { s: Math.ceil(v.wait / 1000) });
    } else if (v.need && v.progress < v.need) bad("q.notYet");
    // one reward per player per period, even with two taps at the same moment
    const r = await run(env, "INSERT OR IGNORE INTO quest_done (quest_id, uid, pkey, at) VALUES (?, ?, ?, ?)", q.id, u.uid, questKey(q, now), now);
    if (!r.meta.changes) bad("q.done");
    await run(env, "UPDATE quests SET done_n = done_n + 1 WHERE id = ?", q.id);
    if (q.kind === "link") await run(env, "DELETE FROM quest_open WHERE quest_id = ? AND uid = ?", q.id, u.uid);
    await giveReward(env, u.uid, q.reward_kind, q.reward, now, "quest");
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, kind: q.reward_kind, amount: q.reward, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },
  "POST /api/admin/quests": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now(), id = Number(body.id);
    if (body.action === "create") {
      const q = questInput(body, now);
      await run(env, "INSERT INTO quests (title, descr, emoji, kind, period, link, secret, goal, reward_kind, reward, active, sort, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
        q.title, q.descr, q.emoji, q.kind, q.period, q.link, q.secret, q.goal, q.reward_kind, q.reward, q.sort, q.ends_at, now);
    } else if (body.action === "toggle") {
      await run(env, "UPDATE quests SET active = 1 - active WHERE id = ?", id);
    } else if (body.action === "delete") {
      await run(env, "DELETE FROM quests WHERE id = ?", id);
      await run(env, "DELETE FROM quest_done WHERE quest_id = ?", id);
      await run(env, "DELETE FROM quest_open WHERE quest_id = ?", id);
    } else if (body.action === "starter") {
      for (const q of Q.STARTER) {
        if (await one(env, "SELECT 1 AS x FROM quests WHERE title = ?", q.title)) continue;
        await run(env, "INSERT INTO quests (title, descr, emoji, kind, period, link, secret, goal, reward_kind, reward, active, sort, ends_at, created_at) VALUES (?, '', ?, ?, ?, NULL, NULL, ?, ?, ?, 1, ?, NULL, ?)",
          q.title, q.emoji, q.kind, q.period, q.goal, q.reward_kind, q.reward, q.sort, now);
      }
    }
    return { list: await all(env, "SELECT * FROM quests ORDER BY active DESC, sort, id") };
  },

  // ---------- 🏁 Camel Derby ----------
  "GET /api/derby": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), wid = L.weekId(now);
    const { d } = await derbyLoad(env, u.uid, now);
    const top = await all(env, "SELECT u.username, w.pts FROM derby_weeks w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? ORDER BY w.pts DESC, w.updated_at ASC LIMIT 20", wid);
    const mine = await one(env, "SELECT pts FROM derby_weeks WHERE week_id = ? AND uid = ?", wid, u.uid);
    return { ...derbyView(d), top, week: mine ? mine.pts : 0, ends: wid + 7 * DAY };
  },
  "POST /api/derby/train": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const { d, ver } = await derbyLoad(env, u.uid, now);
    const i = Math.floor(Number(body.stat));
    if (!(i >= 0 && i < DL.STATS.length)) bad("badAction");
    const c = d.camels[d.act], v = c.s[i];
    if (v >= DL.MAX_STAT) bad("derby.max");
    let cost = 0;
    if (body.feed) {
      if (!(d.feed > 0)) bad("derby.noFeed");
      d.feed--; c.s[i] = Math.min(DL.MAX_STAT, v + DL.FEED_GAIN);
    } else {
      cost = DL.trainCost(v);
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      const r = await run(env, "UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') - ?) WHERE uid = ? AND json_extract(json, '$.dates') >= ?", cost, u.uid, cost);
      if (!r.meta.changes) bad("notEnough");
      c.s[i] = v + 1;
    }
    try { await derbySave(env, u.uid, d, ver, now); }
    catch (e) { if (cost) await creditPoints(env, u.uid, "dates", cost, now, "refund"); throw e; }
    return { ...derbyView(d), state: await derbyState(env, u, now) };
  },
  "POST /api/derby/race": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const { d, ver } = await derbyLoad(env, u.uid, now);
    const tactic = DL.TACTICS.includes(body.tactic) ? body.tactic : "steady";
    if (d.used < DL.RACES_PER_DAY + (d.bonus || 0)) d.used++;
    else if (body.adId && d.ads < DL.AD_RACES) {
      if (!(await verifyAd(env, u.uid, body.adId, now))) bad("k.adFail");
      d.ads++;
    } else bad("derby.noRaces");
    const c = d.camels[d.act], cup = DL.cupOf(d.trophies), lvl = DL.power(c);
    // Rivals: other players' camels with about the same trophies, then computer camels
    const rows = await all(env, "SELECT d.json, u.username FROM derby d JOIN users u ON u.uid = d.uid WHERE d.uid != ? AND d.trophies BETWEEN ? AND ? ORDER BY RANDOM() LIMIT ?",
      u.uid, d.trophies - 300, d.trophies + 300, DL.RACERS - 1);
    const racers = [{ camel: c, tactic, me: true, name: u.username }];
    for (const r of rows) { const o = DL.norm(JSON.parse(r.json), now); racers.push({ camel: o.camels[o.act], tactic: DL.TACTICS[Math.floor(secureRandom() * 3)], name: r.username }); }
    for (let i = racers.length; i < DL.RACERS; i++) racers.push(DL.bot(lvl, secureRandom, i));
    // shuffle lanes
    for (let i = racers.length - 1; i > 0; i--) { const j = Math.floor(secureRandom() * (i + 1)); [racers[i], racers[j]] = [racers[j], racers[i]]; }
    const res = DL.race(racers, secureRandom);
    const meR = res.find((r) => r.me), place = meR.place;
    const trophies = DL.PLACE_TROPHIES[place - 1], dates = Math.round(DL.PLACE_DATES[place - 1] * DL.CUPS[cup].mult);
    d.trophies += trophies; d.races++; c.r = (c.r || 0) + 1;
    if (place === 1) { d.wins++; c.w = (c.w || 0) + 1; }
    await derbySave(env, u.uid, d, ver, now);
    await creditPoints(env, u.uid, "dates", dates, now, "derby");
    await run(env, "INSERT INTO derby_weeks (week_id, uid, pts, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(week_id, uid) DO UPDATE SET pts = pts + excluded.pts, updated_at = excluded.updated_at",
      L.weekId(now), u.uid, trophies, now);
    return {
      ...derbyView(d), place, trophies, dates, cupUp: DL.cupOf(d.trophies) > cup,
      race: res.map((r) => ({ name: r.name || "", bot: r.bot || "", me: !!r.me, b: r.camel.b, cn: r.camel.n || "", tactic: r.tactic, t: r.t, total: r.total, place: r.place })),
      state: await derbyState(env, u, now),
    };
  },
  "POST /api/derby/select": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const { d, ver } = await derbyLoad(env, u.uid, now);
    const i = Math.floor(Number(body.i));
    if (!(i >= 0 && i < d.camels.length)) bad("badAction");
    d.act = i;
    await derbySave(env, u.uid, d, ver, now);
    return derbyView(d);
  },
  "POST /api/derby/rename": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    const { d, ver } = await derbyLoad(env, u.uid, now);
    const i = Math.floor(Number(body.i)), name = String(body.name || "").trim().replace(/\s+/g, " ");
    if (!(i >= 0 && i < d.camels.length)) bad("badAction");
    if (!KL.tribeNameOk(name)) bad("derby.badName");
    d.camels[i].n = name;
    await derbySave(env, u.uid, d, ver, now);
    return derbyView(d);
  },

  // JRY economy at a glance (owner): supply, holders, usage
  "GET /api/admin/jrystats": async (req, env) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now();
    const s = await one(env, "SELECT COALESCE(SUM(jry_pts), 0) AS supply, COUNT(CASE WHEN jry_pts > 0 THEN 1 END) AS holders, COUNT(*) AS players FROM users");
    const sp = await one(env, "SELECT COALESCE(SUM(n), 0) AS all_n, COALESCE(SUM(CASE WHEN at >= ? THEN n END), 0) AS week_n, COUNT(DISTINCT CASE WHEN at >= ? THEN uid END) AS users30 FROM jry_spent", now - 7 * DAY, now - 30 * DAY);
    const dr = await one(env, "SELECT COALESCE(SUM(amount * players), 0) AS n FROM jry_drops");
    const top = await all(env, "SELECT username, jry_pts AS n FROM users WHERE jry_pts > 0 ORDER BY jry_pts DESC LIMIT 10");
    return { supply: s.supply, holders: s.holders, players: s.players, spentAll: sp.all_n, spentWeek: sp.week_n, users30: sp.users30, dropped: dr.n, top };
  },
  // Honor wall of founding supporters
  "GET /api/supporters": async (req, env) => {
    const list = await all(env, "SELECT username, sup_lvl AS lvl, sup_pi AS pi FROM users WHERE sup_pi > 0 ORDER BY sup_lvl DESC, sup_pi DESC, sup_at ASC LIMIT 200");
    const t = await one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(sup_pi), 0) AS pi FROM users WHERE sup_pi > 0");
    let surprise = null;
    try { const u = await auth(req, env); const r = await one(env, "SELECT kind FROM sup_surprise WHERE uid = ? AND month = ?", u.uid, L.ROYAL.monthId(Date.now())); surprise = r ? r.kind : null; } catch (e) {}
    return { list, count: t.n, total: t.pi, surprise };
  },
  // ---------- 💠 JRY distribution (owner) ----------
  // target: active (played in the last 7 days) | all | top (this week's top N in the Oasis ranking) | names (list of usernames)
  // preview: only counts the players. Blocked accounts (airdrop_block) never receive anything.
  "POST /api/admin/jrydrop": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now(), amount = Math.floor(Number(body.amount));
    const notBlocked = "u.username NOT IN (SELECT username FROM airdrop_block)";
    let rows;
    if (body.target === "all") rows = await all(env, `SELECT u.uid FROM users u WHERE ${notBlocked}`);
    else if (body.target === "cards") rows = await all(env, `SELECT DISTINCT u.uid FROM royal_cards c JOIN users u ON u.uid = c.uid WHERE ${notBlocked}`);
    else if (body.target === "top") rows = await all(env, `SELECT u.uid FROM week_scores w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? AND w.score > 0 AND ${notBlocked} ORDER BY w.score DESC LIMIT ?`, L.weekId(now), Math.min(1000, Math.max(1, Math.floor(Number(body.n)) || 10)));
    else if (body.target === "names") {
      const names = [...new Set(String(body.names || "").split(/[\s,;@]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 500);
      rows = [];
      for (const n of names) { const r = await one(env, `SELECT u.uid FROM users u WHERE u.username = ? COLLATE NOCASE AND ${notBlocked}`, n); if (r) rows.push(r); }
    } else rows = await all(env, `SELECT u.uid FROM state s JOIN users u ON u.uid = s.uid WHERE s.updated_at >= ? AND ${notBlocked}`, now - 7 * DAY);
    const list = await all(env, "SELECT * FROM jry_drops ORDER BY id DESC LIMIT 10");
    if (body.preview) return { players: rows.length, list };
    if (!(amount > 0 && amount <= 100000)) bad("badAction");
    if (!rows.length) bad("jd.nobody");
    const note = String(body.note || "").trim().slice(0, 120);
    const r = await run(env, "INSERT INTO jry_drops (amount, target, players, note, at) VALUES (?, ?, ?, ?, ?)", amount, String(body.target || "active"), rows.length, note, now);
    const id = r.meta.last_row_id || now;
    const stmts = rows.map((x) => env.DB.prepare("UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?").bind(amount, x.uid));
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    await notify(env, rows.map((x) => ({ uid: x.uid, kind: "jry", ref: "d" + id, vars: { n: amount, note: note || "🦊" } })));
    return { ok: true, players: rows.length, total: rows.length * amount, list: await all(env, "SELECT * FROM jry_drops ORDER BY id DESC LIMIT 10") };
  },

  // ---------- 👑 Royal cards ----------
  "GET /api/royal": async (req, env) => {
    const now = Date.now(), R = L.ROYAL;
    const tiers = [];
    for (const t of R.TIERS) {
      const sold = (await one(env, "SELECT COUNT(*) AS n FROM royal_cards WHERE tier = ?", t.id)).n;
      const next = await royalNext(env, t.id);
      tiers.push({ id: t.id, sold, next, sig: next ? R.sigOf(t.id, next).id : null });
    }
    let mine = [], day = L.dayId(now);
    try {
      const u = await auth(req, env);
      mine = (await all(env, "SELECT c.id, c.tier, c.ed, (SELECT 1 FROM royal_gifts g WHERE g.card_id = c.id AND g.day = ?) AS got FROM royal_cards c WHERE c.uid = ? ORDER BY c.id", day, u.uid))
        .map((c) => ({ ...c, sig: R.sigOf(c.tier, c.ed).id, got: !!c.got }));
    } catch (e) {}
    const fin = await one(env, "SELECT * FROM royal_final WHERE id = 1");
    const contest = fin ? (await royalContest(env, fin, 20)).map((r) => ({ username: r.username, earned: r.earned })) : [];
    const sold = tiers.filter((t) => R.FINAL_TIERS.includes(t.id)).reduce((n, t) => n + t.sold, 0);
    const listings = await all(env, `SELECT o.id AS offer, o.pi, o.uid, o.status, c.id AS card, c.tier, c.ed, s.username AS seller FROM mk_offers o
      JOIN royal_cards c ON c.id = o.amount JOIN users s ON s.uid = o.uid WHERE o.kind = 'card' AND o.status IN ('open', 'reserved') ORDER BY o.pi ASC, o.id ASC LIMIT 60`);
    let me = null; try { me = (await auth(req, env)).uid; } catch (e) {}
    const market = listings.map((o) => ({ offer: o.offer, card: o.card, tier: o.tier, ed: o.ed, sig: R.sigOf(o.tier, o.ed).id, pi: o.pi, seller: o.seller, mine: o.uid === me, busy: o.status === "reserved" }));
    const listed = new Map(listings.filter((o) => o.uid === me).map((o) => [o.card, o.offer]));
    for (const c of mine) c.offer = listed.get(c.id) || 0;
    return { tiers, mine, market, tax: R.RESALE_TAX, contest, sold, total: R.MAX * R.FINAL_TIERS.length, final: fin ? { start: fin.start_at, end: fin.end_at, done: !!fin.paid } : null };
  },
  // Pay for something in the app with the Pi waiting in the box (prizes and refunds that are not sent yet)
  "POST /api/box/spend": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), md = body.metadata || {};
    if (!BOX_SPEND_TYPES.includes(md.type || "vip_month")) bad("box.notHere");
    const item = checkPayment({ metadata: md, amount: body.amount, user_uid: u.uid, direction: "user_to_app" }, u.uid);
    if (!(item.price > 0) || item.jry || item.p2p || item.mk || item.sponsor || item.sup || item.supFree) bad("box.notHere");
    // the same guards as when approving a Pi payment
    if (item.mult) { const cur = multOf(u, now); if (cur && item.mult.f < cur.f) bad("multLower"); }
    if (item.house) await houseGuard(env, u, item.house);
    if (item.tier && u.vip_until > now && item.price < L.TIERS[paidTier(u, now)].price) bad("lowerTier");
    if (item.royal && (await one(env, "SELECT 1 AS x FROM royal_cards WHERE tier = ? AND ed = ?", item.royal.tier, item.royal.ed))) bad("rc.taken");
    const taken = await boxTake(env, u.uid, item.price);
    const id = "box-" + crypto.randomUUID();
    try {
      await run(env, "INSERT INTO payments (id, uid, amount, status, created_at) VALUES (?, ?, ?, 'box', ?)", id, u.uid, item.price, now);
      await grantItem(env, u, item, id, now, true);
    } catch (e) {
      await boxGive(env, u.uid, taken, id, now); // nothing was delivered: the balance comes back
      throw e;
    }
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },

  // Daily court gift (once a day): the coins of my title, plus the leading House and Parliament gifts
  "POST /api/court/claim": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), g = await courtGiftOf(env, u.uid, now);
    if (!(g.total > 0)) bad("court.none");
    const r = await run(env, "INSERT OR IGNORE INTO court_gifts (uid, day) VALUES (?, ?)", u.uid, L.dayId(now));
    if (!r.meta.changes) bad("court.done");
    await creditPoints(env, u.uid, "coins", g.total, now, "court");
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, coins: g.total, parts: g.parts, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },

  // ---------- 🏛️ The Court ----------
  "GET /api/court": async (req, env) => {
    const u = await auth(req, env), now = Date.now(), c = await courtRefresh(env);
    const paid = await paidOf(env, u.uid), mineC = courtOf(u.uid);
    let rank = mineC ? mineC.rank : 0;
    if (!rank && paid > 0) rank = (await one(env, "SELECT COUNT(*) AS n FROM (SELECT uid, SUM(amount) AS s FROM payments WHERE status = 'completed' GROUP BY uid HAVING s > ?)", paid)).n + 1;
    const ahead = rank > 1 ? c.list[Math.min(rank - 2, c.list.length - 1)] : null;
    const gift = await courtGiftOf(env, u.uid, now);
    return { top: c.list.map((x) => ({ rank: x.rank, username: x.username, paid: x.paid, title: x.title, me: x.uid === u.uid })),
      me: { rank, paid, title: COURT.titleOf(rank, paid).id, need: ahead ? Math.round((ahead.paid - paid + 0.01) * 100) / 100 : 0, above: ahead ? ahead.username : null },
      gift: { total: gift.total, parts: gift.parts, claimed: gift.claimed },
      titles: COURT.TITLES.map((t) => ({ id: t.id, rank: t.rank, mult: t.mult, coins: t.coins })), seats: COURT.SEATS };
  },

  // ---------- 🏛️ Houses ----------
  "GET /api/houses": async (req, env) => {
    const u = await auth(req, env);
    const board = await houseBoard(env, 20), mine = await myHouse(env, u.uid);
    let members = [];
    if (mine) members = await all(env, `SELECT u.username, ROUND(COALESCE(SUM(p.amount), 0), 2) AS paid FROM house_members m JOIN users u ON u.uid = m.uid LEFT JOIN payments p ON p.uid = m.uid AND p.status = 'completed' WHERE m.house_id = ? GROUP BY m.uid ORDER BY paid DESC LIMIT 50`, mine.id);
    const paid = await paidOf(env, u.uid);
    return { houses: board.map((h, i) => ({ id: h.id, rank: i + 1, name: h.name, emoji: h.emoji, owner: h.owner_name, members: h.members, score: h.score })), mine: mine ? { id: mine.id, name: mine.name, emoji: mine.emoji, owner: mine.owner === u.uid } : null, members,
      fee: paid >= L.COURT.HOUSE.SUPPORTER_MIN ? L.COURT.HOUSE.FEE_SUPPORTER : L.COURT.HOUSE.FEE, paid, daily: L.COURT.HOUSE.DAILY_COINS, emojis: KL.TRIBE.EMOJIS };
  },
  "POST /api/houses/join": async (req, env, body) => {
    const u = await auth(req, env);
    const id = Number(body.id) || 0, now = Date.now();
    const h = await one(env, "SELECT id FROM houses WHERE id = ?", id);
    if (!h) bad("house.gone");
    if (await myHouse(env, u.uid)) bad("house.already");
    const left = await one(env, "SELECT at FROM house_left WHERE uid = ?", u.uid);
    if (left && now - left.at < L.COURT.HOUSE.LEAVE_WAIT) bad("house.wait");
    const n = await one(env, "SELECT COUNT(*) AS n FROM house_members WHERE house_id = ?", id);
    if (n.n >= L.COURT.HOUSE.MAX_MEMBERS) bad("house.full");
    await run(env, "INSERT OR IGNORE INTO house_members (uid, house_id, joined_at) VALUES (?, ?, ?)", u.uid, id, now);
    return { ok: true };
  },
  "POST /api/houses/leave": async (req, env) => {
    const u = await auth(req, env);
    const mine = await myHouse(env, u.uid), now = Date.now();
    if (!mine) bad("house.none");
    await run(env, "DELETE FROM house_members WHERE uid = ?", u.uid);
    await run(env, "INSERT INTO house_left (uid, at) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET at = excluded.at", u.uid, now);
    if (mine.owner === u.uid) {
      // the House goes to its biggest remaining supporter; an empty House closes
      const next = await one(env, `SELECT m.uid FROM house_members m LEFT JOIN payments p ON p.uid = m.uid AND p.status = 'completed' WHERE m.house_id = ? GROUP BY m.uid ORDER BY COALESCE(SUM(p.amount), 0) DESC, m.joined_at ASC LIMIT 1`, mine.id);
      if (next) await run(env, "UPDATE houses SET owner = ? WHERE id = ?", next.uid, mine.id); else await run(env, "DELETE FROM houses WHERE id = ?", mine.id);
    }
    return { ok: true };
  },

  // ---------- 🗳️ Votes (decrees) ----------
  "GET /api/decrees": async (req, env) => {
    const u = await auth(req, env), now = Date.now();
    await pollsClose(env, now);
    const open = await all(env, "SELECT p.*, c.username AS by FROM decrees p JOIN users c ON c.uid = p.uid WHERE p.closed = 0 ORDER BY p.id DESC LIMIT 5");
    const done = await all(env, "SELECT p.*, c.username AS by FROM decrees p JOIN users c ON c.uid = p.uid WHERE p.closed = 1 ORDER BY p.id DESC LIMIT 5");
    const view = async (p) => ({ ...(await pollView(env, p, u.uid)), by: p.by });
    const emp = (courtOf(u.uid) || {}).rank === 1;
    return { open: await Promise.all(open.map(view)), done: await Promise.all(done.map(view)), canCreate: emp || isAdmin(env, u), weight: await voteWeightOf(env, u.uid), kinds: KINDS };
  },
  "POST /api/decrees/create": async (req, env, body) => {
    const u = await auth(req, env), now = Date.now();
    if (!((courtOf(u.uid) || {}).rank === 1 || isAdmin(env, u))) bad("poll.noRight");
    const question = String(body.question || "").trim().slice(0, 140), kind = KINDS.includes(body.kind) ? body.kind : "feature";
    const options = (Array.isArray(body.options) ? body.options : []).map((x) => String(x || "").trim().slice(0, 50)).filter(Boolean);
    if (question.length < 4 || options.length < COURT.VOTE.MIN_OPTS || options.length > COURT.VOTE.MAX_OPTS || new Set(options.map((x) => x.toLowerCase())).size !== options.length) bad("poll.bad");
    if (await one(env, "SELECT 1 AS x FROM decrees WHERE uid = ? AND closed = 0", u.uid)) bad("poll.open");
    const r = await run(env, "INSERT INTO decrees (uid, kind, question, options, created_at, closes_at) VALUES (?, ?, ?, ?, ?, ?)", u.uid, kind, question, JSON.stringify(options), now, now + COURT.VOTE.POLL_DAYS * DAY);
    return { ok: true, id: r.meta.last_row_id };
  },
  "POST /api/decrees/vote": async (req, env, body) => {
    const u = await auth(req, env), now = Date.now();
    await pollsClose(env, now);
    const p = await one(env, "SELECT * FROM decrees WHERE id = ?", Number(body.id) || 0);
    if (!p || p.closed) bad("poll.gone");
    const n = JSON.parse(p.options).length, opt = Number(body.opt);
    if (!Number.isInteger(opt) || opt < 0 || opt >= n) bad("badAction");
    const r = await run(env, "INSERT OR IGNORE INTO decree_votes (poll_id, uid, opt, w, at) VALUES (?, ?, ?, ?, ?)", p.id, u.uid, opt, await voteWeightOf(env, u.uid), now);
    if (!r.meta.changes) bad("poll.voted");
    return { ok: true, poll: await pollView(env, p, u.uid) };
  },
  // Public: the decisions of the votes (the magazine reads the topic votes from here)
  "GET /api/decrees/results": async (req, env) => {
    await pollsClose(env, Date.now());
    const rows = await all(env, "SELECT * FROM decrees WHERE closed = 1 ORDER BY id DESC LIMIT 10");
    const out = [];
    for (const p of rows) { const v = await pollView(env, p, null); out.push({ id: v.id, kind: v.kind, question: v.question, options: v.options, tally: v.tally, winner: v.winner, winnerText: v.winner == null ? null : v.options[v.winner] }); }
    return new Response(JSON.stringify({ results: out }), { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=120" } });
  },

  // ---------- 🏛️ Parliament elections ----------
  "GET /api/election": async (req, env) => {
    const u = await auth(req, env), now = courtNow(env), id = electionId(now), phase = COURT.phase(now);
    if (phase === "results") await electionClose(env, id, now);
    const cands = await all(env, `SELECT c.uid, u.username, c.speech, COALESCE(SUM(v.w), 0) AS votes FROM candidates c JOIN users u ON u.uid = c.uid
      LEFT JOIN election_votes v ON v.election = c.election AND v.cand = c.uid WHERE c.election = ? GROUP BY c.uid ORDER BY votes DESC, c.at ASC LIMIT 60`, id);
    const mine = await one(env, "SELECT cand FROM election_votes WHERE election = ? AND voter = ?", id, u.uid);
    const el = parliamentElection(now);
    if (el === id && phase === "results") await electionClose(env, el, now);
    const mps = await all(env, "SELECT m.seat, m.votes, u.username FROM mps m JOIN users u ON u.uid = m.uid WHERE m.election = ? ORDER BY m.seat ASC", el);
    const paid = await paidOf(env, u.uid);
    return { id, phase, day: new Date(now).getUTCDate(), candidates: cands.map((c) => ({ uid: c.uid, username: c.username, speech: c.speech, votes: Math.round(c.votes * 100) / 100, me: c.uid === u.uid })), runs: cands.some((c) => c.uid === u.uid), votedFor: mine ? mine.cand : null,
      parliament: { election: el, members: mps.map((m) => ({ seat: m.seat, username: m.username, votes: Math.round(m.votes * 100) / 100 })) }, weight: COURT.voteWeight(paid), canRun: paid > 0, seats: COURT.PARLIAMENT.SEATS };
  },
  "POST /api/election/run": async (req, env, body) => {
    const u = await auth(req, env), now = courtNow(env);
    if (COURT.phase(now) !== "candidacy") bad("el.phase");
    if (!((await paidOf(env, u.uid)) > 0)) bad("el.supporters");
    const speech = String(body.speech || "").trim().slice(0, 100);
    await run(env, "INSERT INTO candidates (election, uid, speech, at) VALUES (?, ?, ?, ?) ON CONFLICT(election, uid) DO UPDATE SET speech = excluded.speech", electionId(now), u.uid, speech, now);
    return { ok: true };
  },
  "POST /api/election/vote": async (req, env, body) => {
    const u = await auth(req, env), now = courtNow(env), id = electionId(now);
    if (COURT.phase(now) !== "voting") bad("el.phase");
    const cand = String(body.uid || "");
    if (cand === u.uid) bad("el.self");
    if (!(await one(env, "SELECT 1 AS x FROM candidates WHERE election = ? AND uid = ?", id, cand))) bad("el.nocand");
    const r = await run(env, "INSERT OR IGNORE INTO election_votes (election, voter, cand, w, at) VALUES (?, ?, ?, ?, ?)", id, u.uid, cand, await voteWeightOf(env, u.uid), now);
    if (!r.meta.changes) bad("el.voted");
    return { ok: true };
  },

  // ---------- 👑 VIP Club ----------
  "GET /api/vipc": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), member = isVipc(u, now);
    const hallRows = await all(env, `SELECT u.username, ROUND(SUM(p.amount), 2) AS paid FROM payments p JOIN users u ON u.uid = p.uid
      WHERE p.status = 'completed' GROUP BY p.uid HAVING paid > 0 ORDER BY paid DESC, MIN(p.created_at) ASC LIMIT 50`);
    const out = { price: VC.VIPC.PRICE, days: VC.VIPC.DAYS, member, until: member ? u.vipc_until : 0, hallCount: hallRows.length,
      hall: member ? hallRows : hallRows.slice(0, 3).map((r) => ({ username: r.username, paid: null })) };
    if (member) {
      const st = await vipcState(env, u.uid, now);
      const mon = VC.monthId(now);
      const top = await all(env, "SELECT u.username, m.profit FROM vipc_month m JOIN users u ON u.uid = m.uid WHERE m.month = ? ORDER BY m.profit DESC LIMIT 10", mon);
      const mine = await one(env, "SELECT profit FROM vipc_month WHERE uid = ? AND month = ?", u.uid, mon);
      const lv = VC.levelOf(st.profit);
      out.game = { gold: st.gold, profit: st.profit, level: lv, cap: VC.capOf(lv), left: VC.GAME.DAILY_VOYAGES - st.used, market: VC.market(VC.dayId(now)), top, month: mine ? mine.profit : 0 };
    }
    return out;
  },
  "POST /api/vipc/voyage": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now();
    if (!isVipc(u, now)) bad("vc.locked");
    const st = await vipcState(env, u.uid, now);
    const prevUsed = st.used;
    let r;
    try { r = VC.voyage(st, body, now); } catch (e) { bad(String(e.message || "badAction")); }
    const ok = await run(env, "UPDATE vipc_game SET gold = ?, profit = ?, day = ?, used = ? WHERE uid = ? AND used = ? AND day = ?", st.gold, st.profit, st.day, st.used, u.uid, prevUsed, st.day);
    if (!ok.meta.changes) bad("busy");
    if (r.profit > 0) await run(env, "INSERT INTO vipc_month (uid, month, profit) VALUES (?, ?, ?) ON CONFLICT(uid, month) DO UPDATE SET profit = profit + excluded.profit", u.uid, VC.monthId(now), r.profit);
    if (r.coins) await creditPoints(env, u.uid, "coins", r.coins, now, "vipc");
    return { ok: true, profit: r.profit, income: r.income, cost: r.cost, guardCost: r.guardCost, lossPct: r.lossPct, kept: r.kept, coins: r.coins, gold: st.gold, level: VC.levelOf(st.profit), left: VC.GAME.DAILY_VOYAGES - st.used };
  },
  "POST /api/admin/vipc": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const days = Math.floor(Number(body.days));
    if (!(days >= 1 && days <= 365)) bad("badAction");
    const t = await one(env, "SELECT uid, username FROM users WHERE username = ? COLLATE NOCASE", String(body.username || "").trim());
    if (!t) bad("badAction");
    await addVipcDays(env, t.uid, days, Date.now());
    return { ok: true, username: t.username };
  },
  // Resell a card: fixed price in Pi. The card stays with its owner (locked) until it is sold or unlisted.
  "POST /api/royal/list": async (req, env, body) => {
    const u = await auth(req, env);
    const R = L.ROYAL, pi = round(Number(body.pi)), now = Date.now();
    if (!(pi >= R.RESALE_MIN && pi <= R.RESALE_MAX)) bad("rc.price");
    const card = await one(env, "SELECT id FROM royal_cards WHERE id = ? AND uid = ?", Number(body.card), u.uid);
    if (!card) bad("rc.notYours");
    if (await one(env, "SELECT 1 AS x FROM mk_offers WHERE kind = 'card' AND amount = ? AND status IN ('open', 'reserved')", card.id)) bad("rc.listed");
    await run(env, "INSERT INTO mk_offers (uid, kind, amount, pi, status, created_at, updated_at) VALUES (?, 'card', ?, ?, 'open', ?, ?)", u.uid, card.id, pi, now, now);
    return { ok: true };
  },
  "POST /api/royal/unlist": async (req, env, body) => {
    const u = await auth(req, env);
    const o = await one(env, "SELECT * FROM mk_offers WHERE kind = 'card' AND amount = ? AND uid = ? AND status IN ('open', 'reserved')", Number(body.card), u.uid);
    if (!o) bad("mk.gone");
    const now = Date.now();
    if (o.status === "reserved") {
      let stale = now - o.reserved_at > MK.HOLD_MS;
      if (stale) { try { const { p } = await findPayment(env, o.pay_id); stale = !p.transaction; } catch (e) {} }
      if (!stale) bad("mk.busy");
    }
    const r = await run(env, "UPDATE mk_offers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('open', 'reserved') AND COALESCE(pay_id, '') = ?", now, o.id, o.pay_id || "");
    if (!r.meta.changes) bad("mk.busy");
    return { ok: true };
  },
  "POST /api/royal/claim": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), day = L.dayId(now);
    const cards = await all(env, "SELECT id, tier, ed FROM royal_cards WHERE uid = ? AND id NOT IN (SELECT amount FROM mk_offers WHERE kind = 'card' AND status IN ('open', 'reserved'))", u.uid);
    if (!cards.length) bad("rc.none");
    const total = { dates: 0, coins: 0, jry: 0, spins: 0, feed: 0 };
    for (const c of cards) {
      const r = await run(env, "INSERT OR IGNORE INTO royal_gifts (card_id, day) VALUES (?, ?)", c.id, day);
      if (!r.meta.changes) continue;
      const g = L.ROYAL.giftOf(c.tier, c.ed);
      for (const k in total) total[k] += g[k];
    }
    if (!total.dates && !total.coins) bad("rc.claimed");
    if (total.dates) await creditPoints(env, u.uid, "dates", total.dates, now, "royal");
    if (total.coins) await creditPoints(env, u.uid, "coins", total.coins, now, "royal");
    if (total.jry) await giveReward(env, u.uid, "jry", total.jry, now, "royal");
    if (total.spins) await giveReward(env, u.uid, "spins", total.spins, now, "royal");
    if (total.feed) await derbyGrant(env, u.uid, { feed: total.feed }, now);
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, gift: total, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },

  // ---------- 🛠️ Jerry Development services ----------
  "GET /api/svc": async (req, env) => {
    let mine = [];
    try {
      const u = await auth(req, env);
      mine = await all(env, "SELECT id, pkg, status, note, at FROM svc_requests WHERE uid = ? ORDER BY id DESC LIMIT 20", u.uid);
    } catch (e) {}
    return { packs: L.SERVICES.PACKS, mine };
  },
  "POST /api/svc/request": async (req, env, body) => {
    const u = await auth(req, env);
    const V = L.SERVICES, clean = (x, n) => String(x || "").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, n);
    const pkg = V.PACKS.find((x) => x.id === body.pkg);
    if (!pkg) bad("badAction");
    const name = clean(body.name, V.NAME), idea = clean(body.idea, V.IDEA), budget = clean(body.budget, V.BUDGET), contact = clean(body.contact, V.CONTACT);
    if (name.length < 2 || idea.length < 20) bad("svc.short");
    if (RULES_RE.test(name + " " + idea + " " + budget)) bad("sp.rules");
    const open = await one(env, "SELECT COUNT(*) AS n FROM svc_requests WHERE uid = ? AND status IN ('new', 'talking')", u.uid);
    if (open.n >= V.OPEN) bad("svc.tooMany");
    const now = Date.now();
    const r = await one(env, "INSERT INTO svc_requests (uid, username, pkg, name, idea, budget, contact, status, at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?) RETURNING id",
      u.uid, u.username, pkg.id, name, idea, budget || null, contact || null, now, now);
    // tell the owner(s) in the Pi app
    const admins = String(env.ADMIN_USERNAMES || "").split(",").map((x) => x.trim()).filter(Boolean);
    const rows = [];
    for (const a of admins) { const x = await one(env, "SELECT uid FROM users WHERE username = ? COLLATE NOCASE", a); if (x) rows.push(x); }
    await notify(env, rows.map((x) => ({ uid: x.uid, kind: "svc", ref: r.id, vars: { u: u.username, p: pkg.e } })));
    return { ok: true, id: r.id };
  },
  "POST /api/admin/svc": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    if (body.action === "status") {
      const id = Number(body.id), st = String(body.status || "");
      if (!L.SERVICES.STATUS.includes(st)) bad("badAction");
      const x = await one(env, "SELECT * FROM svc_requests WHERE id = ?", id);
      if (!x) bad("badAction");
      const note = String(body.note || "").replace(/[<>]/g, " ").trim().slice(0, 300);
      await run(env, "UPDATE svc_requests SET status = ?, note = ?, updated_at = ? WHERE id = ?", st, note || x.note, Date.now(), id);
      if (st !== x.status) await notify(env, [{ uid: x.uid, kind: "svcup", ref: id + ":" + st, vars: {} }]);
    }
    return { list: await all(env, "SELECT * FROM svc_requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'talking' THEN 1 ELSE 2 END, id DESC LIMIT 100") };
  },

  // ---------- ⚔️ Jerry Arena ----------
  "GET /api/arena": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now();
    const q = await one(env, "SELECT * FROM arena_queue WHERE uid = ?", u.uid);
    if (q) await arenaMatchmake(env, q.mode, now);
    let act = await arenaActive(env, u.uid, now);
    if (act && act.status === "live") { await arenaTick(env, act.id, now); act = await arenaActive(env, u.uid, now); }
    const day = L.dayId(now), used = await one(env, "SELECT n FROM arena_daily WHERE uid = ? AND day = ?", u.uid, day);
    const wk = await one(env, "SELECT pts FROM arena_week WHERE week_id = ? AND uid = ?", L.weekId(now), u.uid);
    const live = await all(env, `SELECT m.id, m.mode, (SELECT GROUP_CONCAT(name, ' · ') FROM arena_players p WHERE p.match_id = m.id) AS names FROM arena_matches m
      WHERE m.status = 'live' AND m.updated_at > ? AND EXISTS (SELECT 1 FROM arena_players p WHERE p.match_id = m.id AND p.bot = 0) ORDER BY m.id DESC LIMIT 6`, now - 60000);
    return { stats: await arenaStats(env, u.uid), queue: (await one(env, "SELECT mode, at FROM arena_queue WHERE uid = ?", u.uid)) || null, active: act || null,
      week: wk ? wk.pts : 0, rewardsLeft: Math.max(0, ARENA_REWARD.DAILY - (used ? used.n : 0)), live, now };
  },
  "POST /api/arena/queue": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), mode = AR.MODES[body.mode] ? body.mode : "1v1";
    if (body.action === "leave") { await run(env, "DELETE FROM arena_queue WHERE uid = ?", u.uid); return { ok: true }; }
    const act = await arenaActive(env, u.uid, now);
    if (act) return { ok: true, match: act.id };
    if (body.action === "bot") {
      // a friendly fight against bots (2v2: with a bot teammate)
      const M = AR.MODES[mode], me = [{ uid: u.uid, name: u.username }];
      const seats = mode === "2v2" ? [me[0], ...arenaBots(3, [])] : [me[0], ...arenaBots(M.n - 1, [])];
      return { ok: true, match: await arenaCreate(env, mode, seats) };
    }
    const st = await arenaStats(env, u.uid);
    await run(env, "INSERT OR REPLACE INTO arena_queue (uid, mode, trophies, at) VALUES (?, ?, ?, ?)", u.uid, mode, st.trophies, now);
    const id = await arenaMatchmake(env, mode, now);
    const mine = await arenaActive(env, u.uid, now);
    return { ok: true, queued: !mine, match: mine ? mine.id : null };
  },
  // Private rooms: create, join with the code, invite a friend, start (empty seats are filled with bots)
  "POST /api/arena/room": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), A_ = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    if (body.action === "create") {
      const mode = AR.MODES[body.mode] ? body.mode : "1v1";
      if (await arenaActive(env, u.uid, now)) bad("ar.busy");
      await run(env, "DELETE FROM arena_queue WHERE uid = ?", u.uid);
      let code = "";
      for (let i = 0; i < 8; i++) {
        const c = Array.from({ length: 5 }, () => A_[Math.floor(secureRandom() * A_.length)]).join("");
        if (!(await one(env, "SELECT 1 AS x FROM arena_matches WHERE code = ? AND status != 'done'", c))) { code = c; break; }
      }
      if (!code) bad("server");
      const m = await one(env, "INSERT INTO arena_matches (code, mode, host, status, ranked, created_at, updated_at) VALUES (?, ?, ?, 'waiting', 1, ?, ?) RETURNING id", code, mode, u.uid, now, now);
      await run(env, "INSERT INTO arena_players (match_id, slot, uid, name, bot) VALUES (?, 0, ?, ?, 0)", m.id, u.uid, u.username);
      return { ok: true, id: m.id, code };
    }
    const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const m = body.id ? await one(env, "SELECT * FROM arena_matches WHERE id = ?", Number(body.id)) : await one(env, "SELECT * FROM arena_matches WHERE code = ? AND status = 'waiting'", code);
    if (!m) bad("ar.noRoom");
    const rows = await all(env, "SELECT * FROM arena_players WHERE match_id = ? ORDER BY slot", m.id);
    const M = AR.MODES[m.mode];
    if (body.action === "join") {
      if (m.status !== "waiting" || m.created_at < now - 30 * 60000) bad("ar.noRoom");
      if (rows.some((r) => r.uid === u.uid)) return { ok: true, id: m.id };
      if (await arenaActive(env, u.uid, now)) bad("ar.busy");
      const team = body.team === "b" ? 1 : body.team === "a" ? 0 : null;
      const free = M.teams.map((t, s) => ({ t, s })).filter((x) => !rows.some((r) => r.slot === x.s) && (team === null || m.mode !== "2v2" || x.t === team));
      const seat = free[0] || M.teams.map((t, s) => ({ t, s })).find((x) => !rows.some((r) => r.slot === x.s));
      if (!seat) bad("ar.full");
      const r = await run(env, "INSERT OR IGNORE INTO arena_players (match_id, slot, uid, name, bot) VALUES (?, ?, ?, ?, 0)", m.id, seat.s, u.uid, u.username);
      if (!r.meta.changes) bad("ar.full");
      await run(env, "DELETE FROM arena_queue WHERE uid = ?", u.uid);
      return { ok: true, id: m.id };
    }
    const me = rows.find((r) => r.uid === u.uid);
    if (!me) bad("ar.noRoom");
    if (body.action === "leave") {
      if (m.status !== "waiting") return { ok: true };
      if (m.host === u.uid) await run(env, "UPDATE arena_matches SET status = 'done', result = '[]', updated_at = ? WHERE id = ?", now, m.id);
      await run(env, "DELETE FROM arena_players WHERE match_id = ? AND uid = ?", m.id, u.uid);
      return { ok: true };
    }
    if (body.action === "invite") {
      const f = await one(env, "SELECT uid FROM users WHERE username = ? COLLATE NOCASE", String(body.username || "").trim().replace(/^@/, ""));
      if (!f || f.uid === u.uid) bad("ar.noUser");
      await notify(env, [{ uid: f.uid, kind: "ainv", ref: m.code + ":" + f.uid + ":" + Math.floor(now / 60000), vars: { u: u.username }, q: "room=" + m.code }]);
      return { ok: true };
    }
    if (body.action === "start") {
      if (m.host !== u.uid || m.status !== "waiting") bad("ar.noRoom");
      const humans = rows.length;
      if (humans < 2 && !body.fill) bad("ar.alone");
      const seats = M.teams.map((t, s) => { const r = rows.find((x) => x.slot === s); return r ? { uid: r.uid, name: r.name, bot: !!r.bot } : null; });
      const botsFor = arenaBots(seats.filter((x) => !x).length, []);
      const full = seats.map((x) => x || botsFor.shift());
      const st = AR.newState(m.mode, full, Math.floor(secureRandom() * 2147483647));
      const r = await run(env, "UPDATE arena_matches SET status = 'live', state = ?, ranked = ?, ver = 0, round_at = ?, updated_at = ? WHERE id = ? AND status = 'waiting'", JSON.stringify(st), humans >= 2 ? 1 : 0, now, now, m.id);
      if (!r.meta.changes) bad("ar.noRoom");
      await env.DB.batch(full.map((p, i) => env.DB.prepare("INSERT OR REPLACE INTO arena_players (match_id, slot, uid, name, bot) VALUES (?, ?, ?, ?, ?)").bind(m.id, i, p.uid || null, p.name, p.bot ? 1 : 0)));
      return { ok: true, id: m.id };
    }
    bad("badAction");
  },
  "POST /api/arena/move": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), id = Number(body.id);
    let m = await arenaTick(env, id, now);
    if (!m || m.status !== "live") bad("ar.over");
    const me = await one(env, "SELECT slot FROM arena_players WHERE match_id = ? AND uid = ?", id, u.uid);
    if (!me) bad("forbidden");
    const st = JSON.parse(m.state);
    // an answer for a round that is already over: just show the current state
    if (body.round && Number(body.round) !== st.round) return await arenaView(env, m, u.uid, now);
    if (!st.players[me.slot].alive) bad("ar.out");
    const mv = { act: String(body.act || ""), target: Number(body.target) };
    if (!AR.validMove(st, me.slot, mv)) bad("ar.move");
    const r = await run(env, "INSERT OR IGNORE INTO arena_moves (match_id, round, slot, act, target, at) VALUES (?, ?, ?, ?, ?, ?)", id, st.round, me.slot, mv.act, mv.target, now);
    if (!r.meta.changes) bad("ar.moved");
    m = await arenaTick(env, id, now);
    return await arenaView(env, m, u.uid, now);
  },
  // Players (and anybody with the link, to watch) see a match. Secret moves of the round in progress stay hidden.
  "GET /api/arena/match": async (req, env) => {
    const q = new URL(req.url).searchParams, now = Date.now();
    let uid = null;
    try { uid = (await auth(req, env)).uid; } catch (e) {}
    let m = q.get("code") ? await one(env, "SELECT * FROM arena_matches WHERE code = ? ORDER BY id DESC LIMIT 1", String(q.get("code")).toUpperCase()) : await one(env, "SELECT * FROM arena_matches WHERE id = ?", Number(q.get("id")));
    if (!m) bad("ar.noRoom");
    if (m.status === "live") m = await arenaTick(env, m.id, now);
    return await arenaView(env, m, uid, now);
  },
  "GET /api/arena/top": async (req, env) => {
    const u = await auth(req, env), now = Date.now();
    const week = await all(env, "SELECT u.username, w.pts FROM arena_week w JOIN users u ON u.uid = w.uid WHERE w.week_id = ? AND w.pts > 0 ORDER BY w.pts DESC, w.updated_at ASC LIMIT 20", L.weekId(now));
    const all_ = await all(env, "SELECT u.username, s.trophies, s.wins FROM arena_stats s JOIN users u ON u.uid = s.uid WHERE s.trophies > 0 ORDER BY s.trophies DESC LIMIT 20");
    return { week, trophies: all_, me: await arenaStats(env, u.uid), ends: L.weekId(now) + 7 * DAY };
  },

  // ---------- 📖 Personal catalog ----------
  "GET /api/catalog": async (req, env) => {
    const who = new URL(req.url).searchParams.get("u");
    const now = Date.now();
    let uid, name, mine = true;
    if (who) {
      const x = await one(env, "SELECT uid, username FROM users WHERE username = ? COLLATE NOCASE", who);
      if (!x) bad("cat.noUser");
      uid = x.uid; name = x.username; mine = false;
      try { mine = (await auth(req, env)).uid === uid; } catch (e) {}
    } else { const u = await auth(req, env); uid = u.uid; name = u.username; }
    const minted = await all(env, "SELECT kind, COUNT(*) AS n FROM nft_items GROUP BY kind");
    const out = { name, mine, now, owned: await catalogOwned(env, uid), minted: Object.fromEntries(minted.map((x) => [x.kind, x.n])) };
    const u2 = await one(env, "SELECT cat_master FROM users WHERE uid = ?", uid);
    out.master = !!(u2 && u2.cat_master);
    if (mine) { out.claims = await catalogClaims(env, uid); out.boost = CAT.boostOf(out.claims); }
    return out;
  },
  "POST /api/catalog/claim": async (req, env, body) => {
    const u = await auth(req, env);
    const now = Date.now(), key = String(body.key || "");
    const claims = await catalogClaims(env, u.uid);
    const p = CAT.progressOf(await catalogOwned(env, u.uid), now, claims);
    const g = p.goals.find((x) => x.key === key);
    if (!g || !g.reached) bad("cat.notYet");
    if (g.claimed) bad("cat.claimed");
    const r = await run(env, "INSERT OR IGNORE INTO catalog_claims (uid, key, at) VALUES (?, ?, ?)", u.uid, key, now);
    if (!r.meta.changes) bad("cat.claimed");
    const rw = g.reward;
    if (rw.coins) await giveReward(env, u.uid, "coins", rw.coins, now, "catalog");
    if (rw.jry) await giveReward(env, u.uid, "jry", rw.jry, now, "catalog");
    if (key === "master") await run(env, "UPDATE users SET cat_master = 1 WHERE uid = ?", u.uid);
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, key, reward: { coins: rw.coins || 0, jry: rw.jry || 0, boost: rw.boost || 0 }, claims: await catalogClaims(env, u.uid), account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },

  // ---------- 🕹️ Jerry Arcade ----------
  "GET /api/arcade": async (req, env) => {
    const u = await auth(req, env);
    const day = L.dayId(Date.now());
    const mine = await all(env, "SELECT game, plays, best FROM arcade WHERE uid = ? AND day = ?", u.uid, day);
    const top = {};
    for (const g of ["memory", "catcher"]) {
      // memory: fewer moves is better; catcher: higher score is better
      top[g] = await all(env, `SELECT u.username, a.best FROM arcade a JOIN users u ON u.uid = a.uid WHERE a.day = ? AND a.game = ? AND a.best IS NOT NULL ORDER BY a.best ${g === "memory" ? "ASC" : "DESC"} LIMIT 5`, day, g);
    }
    return { plays: Object.fromEntries(mine.map((x) => [x.game, x.plays])), best: Object.fromEntries(mine.map((x) => [x.game, x.best])), top, max: L.ARCADE.PLAYS };
  },
  "POST /api/arcade/claim": async (req, env, body) => {
    const u = await auth(req, env);
    const A = L.ARCADE, game = body.game, ms = Number(body.ms), score = Math.floor(Number(body.score));
    if (game !== "memory" && game !== "catcher") bad("badAction");
    let reward;
    if (game === "memory") {
      if (!(ms >= A.memory.minMs) || !(score >= A.memory.pairs) || score > 200) bad("ar.bad");
      reward = A.memory.reward(score);
    } else {
      if (!(ms >= A.catcher.ms - 1500) || !(score >= 0 && score <= A.catcher.maxScore)) bad("ar.bad");
      reward = A.catcher.reward(score);
    }
    const now = Date.now(), day = L.dayId(now);
    await run(env, "INSERT OR IGNORE INTO arcade (uid, day, game, plays) VALUES (?, ?, ?, 0)", u.uid, day, game);
    const better = game === "memory" ? "MIN" : "MAX";
    const r = await run(env, `UPDATE arcade SET plays = plays + 1, best = CASE WHEN best IS NULL THEN ? ELSE ${better}(best, ?) END WHERE uid = ? AND day = ? AND game = ? AND plays < ?`,
      score, score, u.uid, day, game, A.PLAYS);
    if (!r.meta.changes) bad("ar.limit", { n: A.PLAYS });
    if (reward > 0) await creditPoints(env, u.uid, "dates", reward, now, "arcade");
    const row = await one(env, "SELECT plays, best FROM arcade WHERE uid = ? AND day = ? AND game = ?", u.uid, day, game);
    const tier = tierOf(u, now, await isPartner(env, u.username));
    return { ok: true, reward, plays: row.plays, best: row.best, state: await stateFor(env, u, now, tier) };
  },

  // ---------- 📣 Business showcase (sponsored listings, reviewed by the owner) ----------
  "GET /api/sponsors": async (req, env) => {
    const u = await auth(req, env).catch(() => null);
    const now = Date.now();
    await run(env, "UPDATE sponsors SET status = 'ended' WHERE status = 'live' AND ends_at < ?", now);
    const live = await all(env, "SELECT id, name, descr, link, cat, emoji, ends_at FROM sponsors WHERE status = 'live' AND ends_at >= ? ORDER BY id DESC LIMIT 50", now);
    for (let i = live.length - 1; i > 0; i--) { const j = Math.floor(secureRandom() * (i + 1)); [live[i], live[j]] = [live[j], live[i]]; } // fair rotation
    if (live.length) await run(env, `UPDATE sponsors SET views = views + 1 WHERE id IN (${live.map(() => "?").join(",")})`, ...live.map((x) => x.id));
    const mine = u ? await all(env, "SELECT id, name, descr, link, cat, emoji, plan, days, pi, status, starts_at, ends_at, views, clicks, note FROM sponsors WHERE uid = ? AND status != 'paying' ORDER BY id DESC LIMIT 10", u.uid) : [];
    return { live, mine, plans: L.SPONSOR.PLANS, cats: L.SPONSOR.CATS };
  },
  "POST /api/sponsors/click": async (req, env, body) => {
    await run(env, "UPDATE sponsors SET clicks = clicks + 1 WHERE id = ? AND status = 'live'", Number(body.id));
    return { ok: true };
  },
  // Step 1: the business fills the form (nothing is shown until it is paid and approved)
  "POST /api/sponsors/draft": async (req, env, body) => {
    const u = await auth(req, env);
    const S = L.SPONSOR, clean = (x, n) => String(x || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
    const name = clean(body.name, S.NAME), descr = clean(body.descr, S.DESC), link = clean(body.link, 200);
    const plan = S.PLANS.find((x) => x.id === body.plan), cat = S.CATS.includes(body.cat) ? body.cat : "other";
    const emoji = [...clean(body.emoji, 8)].slice(0, 2).join("") || "🏪";
    if (name.length < 2 || descr.length < 10) bad("sp.short");
    if (link && !/^(https:\/\/|pi:\/\/)[^\s]+$/i.test(link)) bad("sp.link");
    if (!plan) bad("badAction");
    if (RULES_RE.test(name + " " + descr + " " + link)) bad("sp.rules");
    const n = await one(env, "SELECT COUNT(*) AS n FROM sponsors WHERE uid = ? AND status IN ('paying', 'review')", u.uid);
    if (n.n >= 3) bad("sp.tooMany");
    await run(env, "DELETE FROM sponsors WHERE uid = ? AND status = 'paying' AND created_at < ?", u.uid, Date.now() - 3600e3);
    const r = await one(env, "INSERT INTO sponsors (uid, name, descr, link, cat, emoji, plan, days, pi, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paying', ?) RETURNING id",
      u.uid, name, descr, link || null, cat, emoji, plan.id, plan.days, plan.price, Date.now());
    return { ok: true, id: r.id, plan };
  },
  // Owner: review paid listings
  "POST /api/admin/sponsors": async (req, env, body) => {
    const u = await auth(req, env);
    if (!isAdmin(env, u)) throw new HttpError(403, "forbidden");
    const now = Date.now(), id = Number(body.id);
    if (body.action === "approve") {
      const ad = await one(env, "SELECT * FROM sponsors WHERE id = ? AND status = 'review'", id);
      if (ad) await run(env, "UPDATE sponsors SET status = 'live', starts_at = ?, ends_at = ?, note = NULL WHERE id = ? AND status = 'review'", now, now + ad.days * 86400000, id);
    } else if (body.action === "reject") {
      const ad = await one(env, "SELECT * FROM sponsors WHERE id = ? AND status = 'review'", id);
      if (ad) {
        const r = await run(env, "UPDATE sponsors SET status = 'rejected', note = ? WHERE id = ? AND status = 'review'", String(body.note || "").slice(0, 140), id);
        if (r.meta.changes) {
          await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis ad refund', 'new', ?, ?)",
            crypto.randomUUID(), "sp" + id, ad.uid, ad.pi, now, now);
          await runPayouts(env).catch((e) => logError(env, "sponsor refund", 0, e.message));
        }
      }
    } else if (body.action === "stop") {
      await run(env, "UPDATE sponsors SET status = 'ended', ends_at = ? WHERE id = ? AND status = 'live'", now, id);
    }
    const list = await all(env, `SELECT s.*, u.username FROM sponsors s LEFT JOIN users u ON u.uid = s.uid
      WHERE s.status IN ('review', 'live') ORDER BY CASE s.status WHEN 'review' THEN 0 ELSE 1 END, s.id DESC LIMIT 50`);
    return { list };
  },

  // ---------- Lucky wheel ----------
  "POST /api/wheel/spin": async (req, env) => {
    const u = await auth(req, env);
    const now = Date.now(), day = L.dayId(now);
    let free = false;
    let r = await run(env, "UPDATE users SET wheel_day = ? WHERE uid = ? AND COALESCE(wheel_day, -1) != ?", day, u.uid, day);
    if (r.meta.changes) free = true;
    else {
      r = await run(env, "UPDATE users SET wheel_spins = wheel_spins - 1 WHERE uid = ? AND wheel_spins > 0", u.uid);
      if (!r.meta.changes) bad("wh.none");
    }
    const P = L.WHEEL.PRIZES, total = P.reduce((a, x) => a + x.w, 0);
    let x = secureRandom() * total, i = 0;
    while (i < P.length - 1 && x >= P[i].w) { x -= P[i].w; i++; }
    const prize = P[i];
    if (prize.t === "dates" || prize.t === "coins") await creditPoints(env, u.uid, prize.t, prize.n, now, "wheel");
    else if (prize.t === "jry") await run(env, "UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?", prize.n, u.uid);
    else if (prize.t === "vipc") await addVipcDays(env, u.uid, prize.n, now);
    else if (prize.t === "respin") await run(env, "UPDATE users SET wheel_spins = COALESCE(wheel_spins, 0) + 1 WHERE uid = ?", u.uid);
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    const st = await stateFor(env, fresh, now, acc.tier);
    if (prize.t === "energy" || prize.t === "camel") {
      if (prize.t === "camel") L.addAnimal(st, 1, now, "wheel"); // a rare camel
      else { st.kombat = KL.norm(st.kombat, now); st.kombat.energy = KL.maxEnergy(st.kombat); st.kombat.eAt = now; }
      await saveState(env, u.uid, st, now);
    }
    return { ok: true, i, prize, free, account: acc, state: st };
  },

  // ---------- JRY (in-game currency): spend for Kombat coins or dates ----------
  "POST /api/jrypts/swap": async (req, env, body) => {
    const u = await auth(req, env);
    const n = Math.floor(Number(body.n));
    if (!(n >= KL.JRYP.MIN_SWAP)) bad("jp.min", { n: KL.JRYP.MIN_SWAP });
    const to = body.to === "dates" ? "dates" : "coins";
    const now = Date.now();
    const r = await run(env, "UPDATE users SET jry_pts = jry_pts - ? WHERE uid = ? AND jry_pts >= ?", n, u.uid, n);
    if (!r.meta.changes) bad("jp.notEnough");
    await run(env, "INSERT INTO jry_spent (uid, n, dest, at) VALUES (?, ?, ?, ?)", u.uid, n, to, now);
    const got = Math.floor(n * (to === "coins" ? KL.JRYP.COINS : KL.JRYP.DATES));
    if (to === "coins") await run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'jry')", u.uid, got, now);
    else {
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      await run(env, "UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?", got, got, u.uid);
    }
    const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
    const acc = await account(env, fresh);
    return { ok: true, got, to, account: acc, state: await stateFor(env, fresh, now, acc.tier) };
  },

  // ---------- Players' testJRY market ----------
  "GET /api/p2p": async (req, env) => {
    const u = await auth(req, env);
    const m = await jryMarket(env);
    if (!m.on) return { on: false };
    const t = await jryConfig(env);
    const open = await all(env, "SELECT * FROM p2p_offers WHERE kind = 'sell' AND status IN ('open', 'reserved') ORDER BY pi / CAST(jry AS REAL) ASC, id ASC LIMIT 40");
    const mine = await all(env, "SELECT * FROM p2p_offers WHERE uid = ? ORDER BY id DESC LIMIT 20", u.uid);
    const ids = [...new Set(open.map((o) => o.uid))];
    const names = {};
    for (const id of ids) { const x = await one(env, "SELECT username FROM users WHERE uid = ?", id); names[id] = x ? x.username : "?"; }
    const sold = await one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(pi), 0) AS pi FROM p2p_offers WHERE kind = 'sell' AND status = 'sold'");
    return { on: true, app: t.dist, price: m.price, fee: P2P.FEE, bonus: P2P.REDEEM_BONUS, wallet: u.jry_wallet || null, me: u.uid,
      offers: open.map((o) => ({ ...offerView(o, names), mine: o.uid === u.uid })), mine: mine.map((o) => offerView(o)), sold };
  },
  // Create a sell offer (lot of testJRY for a Pi price) or a swap for dates / Kombat coins.
  // Nothing moves yet: the player then sends the exact amount to the app wallet.
  "POST /api/p2p/offer": async (req, env, body) => {
    const u = await auth(req, env);
    await p2pNeedWallet(env, u);
    const jry = jryAmount(body.jry);
    if (!jry) bad("p2p.amount");
    const kind = body.kind === "redeem" ? "redeem" : "sell";
    let pi = 0, reward = null;
    if (kind === "sell") {
      pi = round(Number(body.pi));
      if (!(pi >= P2P.MIN_PI && pi <= P2P.MAX_PI)) bad("p2p.price", { min: P2P.MIN_PI });
    } else {
      reward = body.reward === "coins" ? "coins" : "dates";
      const m = await jryMarket(env);
      if (!(m.price > 0)) bad("p2p.noPrice");
      pi = redeemValue(jry, m.price, reward).pi;
      if (pi < P2P.MIN_REDEEM_PI) bad("p2p.amount");
    }
    const n = await one(env, "SELECT COUNT(*) AS n FROM p2p_offers WHERE uid = ? AND status IN ('deposit', 'open', 'reserved', 'returning')", u.uid);
    if (n.n >= P2P.MAX_OPEN) bad("p2p.tooMany", { n: P2P.MAX_OPEN });
    const now = Date.now();
    const r = await one(env, "INSERT INTO p2p_offers (kind, uid, wallet, jry, pi, reward, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'deposit', ?, ?) RETURNING id",
      kind, u.uid, u.jry_wallet, jry, round(pi), reward, now, now);
    return { ok: true, id: r.id, jry, app: (await jryConfig(env)).dist };
  },
  // "I've sent it": look for the deposit on the Pi Testnet
  "POST /api/p2p/check": async (req, env, body) => {
    const u = await auth(req, env);
    await p2pNeedWallet(env, u);
    const o = await one(env, "SELECT * FROM p2p_offers WHERE id = ? AND uid = ?", Number(body.id), u.uid);
    if (!o) bad("p2p.gone");
    if (o.status !== "deposit") return { ok: true, status: o.status };
    const t = await jryConfig(env);
    const tx = await findJryPayment(env, t, o.wallet, t.dist, o.jry, o.created_at);
    if (!tx) bad("p2p.notYet", { n: o.jry, to: t.dist });
    const now = Date.now();
    if (o.kind === "sell") {
      const r = await run(env, "UPDATE p2p_offers SET status = 'open', deposit_tx = ?, updated_at = ? WHERE id = ? AND status = 'deposit'", tx, now, o.id);
      return { ok: true, status: r.meta.changes ? "open" : "deposit" };
    }
    // Swap: value at today's pool price, credited once
    const m = await jryMarket(env);
    const v = redeemValue(o.jry, m.price, o.reward);
    const r = await run(env, "UPDATE p2p_offers SET status = 'done', deposit_tx = ?, pi = ?, got = ?, updated_at = ? WHERE id = ? AND status = 'deposit'", tx, round(v.pi), v.got, now, o.id);
    if (r.meta.changes) {
      if (o.reward === "coins") await run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'jry')", u.uid, v.got, now);
      else {
        if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
        await run(env, "UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?", v.got, v.got, u.uid);
      }
    }
    const tier = tierOf(u, now, await isPartner(env, u.username));
    return { ok: true, status: "done", got: v.got, reward: o.reward, state: await stateFor(env, u, now, tier) };
  },
  // Take an offer back: before the deposit nothing moves; after, the tokens go back to the seller
  "POST /api/p2p/cancel": async (req, env, body) => {
    const u = await auth(req, env);
    await p2pNeedWallet(env, u);
    const o = await one(env, "SELECT * FROM p2p_offers WHERE id = ? AND uid = ?", Number(body.id), u.uid);
    if (!o) bad("p2p.gone");
    const now = Date.now();
    if (o.status === "deposit") {
      await run(env, "UPDATE p2p_offers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'deposit'", now, o.id);
      return { ok: true, status: "cancelled" };
    }
    if (o.status === "reserved") {
      // A buyer is paying right now; only a hold whose payment never got its Pi can be dropped
      let stale = now - o.reserved_at > P2P.HOLD_MS;
      if (stale) { try { const { p } = await findPayment(env, o.pay_id); stale = !p.transaction; } catch (e) {} }
      if (!stale) bad("p2p.busy");
      const r = await run(env, "UPDATE p2p_offers SET status = 'open', buyer = NULL, pay_id = NULL, updated_at = ? WHERE id = ? AND status = 'reserved' AND pay_id = ?", now, o.id, o.pay_id);
      if (!r.meta.changes) bad("p2p.busy");
      o.status = "open";
    }
    if (o.status !== "open" && o.status !== "returning") return { ok: true, status: o.status };
    if (o.status === "open") {
      const r = await run(env, "UPDATE p2p_offers SET status = 'returning', updated_at = ? WHERE id = ? AND status = 'open'", now, o.id);
      if (!r.meta.changes) bad("p2p.busy");
    }
    const t = await jryConfig(env);
    const cur = await one(env, "SELECT * FROM p2p_offers WHERE id = ?", o.id);
    try {
      // Already sent back on an earlier try whose answer was lost? Then don't send twice.
      let tx = await findJryPayment(env, t, t.dist, cur.wallet, cur.jry, cur.updated_at);
      if (!tx) tx = await jrySend(env, t, cur.wallet, cur.jry);
      await run(env, "UPDATE p2p_offers SET status = 'cancelled', return_tx = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'returning'", tx, Date.now(), o.id);
      return { ok: true, status: "cancelled" };
    } catch (e) {
      await run(env, "UPDATE p2p_offers SET error = ? WHERE id = ?", String(e.code || e.message).slice(0, 200), o.id);
      throw e;
    }
  },

  "GET /api/jry/market": async (req, env) => {
    const m = await jryMarket(env);
    let mine = null;
    try {
      const u = await auth(req, env);
      const r = await one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(CAST(jry AS REAL)), 0) AS j FROM jry_buys WHERE uid = ? AND status != 'sent'", u.uid);
      mine = { owed: r.n, owedJry: r.j };
    } catch {}
    return { ...m, mine };
  },

  // Retry my testJRY orders that weren't delivered (e.g. the wallet hadn't added the token)
  "POST /api/jry/retry": async (req, env) => {
    const u = await auth(req, env);
    const rows = await all(env, "SELECT id FROM jry_buys WHERE uid = ? AND status != 'sent' LIMIT 10", u.uid);
    // the address may have changed since: use the wallet saved now
    if (u.jry_wallet) await run(env, "UPDATE jry_buys SET address = ? WHERE uid = ? AND status != 'sent'", u.jry_wallet, u.uid);
    let sent = 0;
    for (const r of rows) if ((await deliverJry(env, r.id)).status === "sent") sent++;
    return { sent, left: rows.length - sent };
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
      // Failed gifts get another chance (e.g. the player has since allowed wallet access)
      await run(env, "DELETE FROM payouts WHERE kind = 'gift' AND status = 'failed'");
      const users = await all(env, "SELECT uid FROM users WHERE uid NOT IN (SELECT uid FROM payouts WHERE kind = 'gift') ORDER BY created_at DESC LIMIT 20");
      if (users.length) {
        await env.DB.batch(users.map((x) =>
          env.DB.prepare("INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'gift', 'testnet', ?, 0.01, 'Pi Oasis Testnet gift', 'new', ?, ?)")
            .bind(crypto.randomUUID(), x.uid, now, now)));
      }
      // Up to 3 rounds of 5, so one press can reach the 5 players Pi asks for even if some fail
      for (let i = 0; i < 3; i++) {
        await runPayouts(env);
        const left = await one(env, "SELECT COUNT(*) AS n FROM payouts WHERE kind = 'gift' AND status IN ('new', 'created')");
        if (!left.n) break;
      }
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
  ensureSchema(env).then(() => processPayouts(env, { pi, logError, one, all, run, notify, weekId: L.weekId, share: L.WEEK100.share }));

// Checks a Pi payment against what this app sells, at the server's prices. Browser input is never trusted.
// Products: { type: "vip_month", tier } (30 days of a membership) or { type: "dates", pack } (date shop).
function checkPayment(p, uid) {
  try { return checkPaymentInner(p, uid); } catch (e) {
    // remember what was refused so the error log can say why (no player data)
    if (e instanceof HttpError) e.info = `type=${p.metadata && p.metadata.type} amount=${p.amount} dir=${p.direction} cancelled=${!!(p.status && (p.status.cancelled || p.status.user_cancelled))}`;
    if (e instanceof HttpError && p.metadata && p.metadata.type === "house") e.info += ` nameOk=${KL.tribeNameOk(String(p.metadata.name || "").trim().replace(/\s+/g, " "))} emojiOk=${KL.TRIBE.EMOJIS.includes(String(p.metadata.emoji))} fee=${p.metadata.fee}`;
    throw e;
  }
}
function checkPaymentInner(p, uid) {
  if (p.direction && p.direction !== "user_to_app") bad("badPayment");
  if (uid && p.user_uid !== uid) bad("notYours");
  if (p.status?.cancelled || p.status?.user_cancelled) bad("badPayment");
  if (p.metadata?.type === "jry") {
    // testJRY store (Testnet): pay 1 / 5 / 10 Test-Pi, receive testJRY at the pool price
    if (!KL.JRY_PACKS.includes(Number(p.amount)) || Number(p.metadata.pi) !== Number(p.amount)) bad("badPayment");
    return { price: Number(p.amount), jry: true };
  }
  if (p.metadata?.type === "sponsor") {
    const plan = L.SPONSOR.PLANS.find((x) => x.id === p.metadata.plan);
    const id = Number(p.metadata.ad);
    if (!plan || !Number.isInteger(id) || Number(p.amount) !== plan.price) bad("badPayment");
    return { price: plan.price, sponsor: id, plan };
  }
  if (p.metadata?.type === "spins") {
    if (Number(p.amount) !== L.WHEEL.PRICE) bad("badPayment");
    return { price: L.WHEEL.PRICE, spins: L.WHEEL.SPINS };
  }
  if (p.metadata?.type === "mk") {
    // Points market: the price is checked against the offer when approving
    const offer = Number(p.metadata.offer);
    if (!Number.isInteger(offer) || offer <= 0 || !(Number(p.amount) > 0)) bad("badPayment");
    return { price: Number(p.amount), mk: offer };
  }
  if (p.metadata?.type === "house") {
    const m = p.metadata, fee = Number(m.fee), name = String(m.name || "").trim().replace(/\s+/g, " ");
    if (!(fee === L.COURT.HOUSE.FEE || fee === L.COURT.HOUSE.FEE_SUPPORTER) || Number(p.amount) !== fee || !KL.tribeNameOk(name) || !KL.TRIBE.EMOJIS.includes(String(m.emoji))) bad("badPayment");
    return { price: fee, house: { name, emoji: String(m.emoji), fee } };
  }
  if (p.metadata?.type === "bbox") {
    const tier = Number(p.metadata.tier);
    if (!Number.isInteger(tier) || !L.BBOX.of(tier) || Number(p.amount) !== tier) bad("badPayment");
    return { price: tier, bbox: tier };
  }
  if (p.metadata?.type === "vipclub") {
    if (Number(p.amount) !== VC.VIPC.PRICE) bad("badPayment");
    return { price: VC.VIPC.PRICE, vipc: true };
  }
  if (p.metadata?.type === "mult") {
    const m = L.multById(p.metadata.mult);
    if (!m || Number(p.amount) !== m.price) bad("badPayment");
    return { price: m.price, mult: m };
  }
  if (p.metadata?.type === "jrypts") {
    const pack = KL.JRYP.PACKS.find((x) => x.id === p.metadata.pack);
    if (!pack || Number(p.amount) !== pack.price) bad("badPayment");
    return { price: pack.price, jryPts: pack };
  }
  if (p.metadata?.type === "derby") {
    const m = p.metadata;
    const fp = m.kind === "feed" && DL.FEED_PACKS.find((x) => x.id === m.pack);
    const br = m.kind === "breed" && DL.BREEDS.find((x) => x.id === m.breed && x.price > 0);
    const price = fp ? fp.price : br ? br.price : 0;
    if (!price || Number(p.amount) !== price) bad("badPayment");
    return { price, derby: fp ? { feed: fp.feed } : { breed: br.id } };
  }
  if (p.metadata?.type === "royal") {
    const t = L.ROYAL.tierById(p.metadata.tier), ed = Number(p.metadata.ed);
    if (!t || !Number.isInteger(ed) || ed < 1 || ed > L.ROYAL.MAX || Number(p.amount) !== t.price) bad("badPayment");
    return { price: t.price, royal: { tier: t.id, ed } };
  }
  if (p.metadata?.type === "supfree") {
    const F = L.SUPPORT_FREE, amt = Number(p.amount);
    if (!Number.isInteger(amt) || amt < F.MIN || amt > F.MAX || Number(p.metadata.amt) !== amt) bad("badPayment");
    return { price: amt, supFree: amt };
  }
  if (p.metadata?.type === "sup") {
    const s = L.SUPPORTER.find((x) => x.id === p.metadata.pack);
    if (!s || Number(p.amount) !== s.price) bad("badPayment");
    return { price: s.price, sup: s };
  }
  if (p.metadata?.type === "lvl") {
    const pack = L.LEVEL_PACKS.find((x) => x.id === p.metadata.pack);
    if (!pack || Number(p.amount) !== pack.price) bad("badPayment");
    return { price: pack.price, lvl: pack };
  }
  if (p.metadata?.type === "kcoins") {
    const pack = KL.COIN_PACKS.find((x) => x.id === p.metadata.pack);
    if (!pack || Number(p.amount) !== pack.price) bad("badPayment");
    return { price: pack.price, coins: pack };
  }
  if (p.metadata?.type === "p2p") {
    // Players' testJRY market: the price is checked against the offer when approving
    const offer = Number(p.metadata.offer);
    if (!Number.isInteger(offer) || offer <= 0 || !(Number(p.amount) > 0)) bad("badPayment");
    return { price: Number(p.amount), p2p: offer };
  }
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
  if (row.status === "completed" || row.status === "grant_failed") return; // already granted (or failed once: never granted twice, the owner is told)
  // The txid must be the one Pi recorded for this payment
  if (!p.transaction || p.transaction.txid !== txid) bad("badPayment");
  if (!p.status?.developer_completed) {
    await pi(env, `/payments/${encodeURIComponent(id)}/complete`, { method: "POST", body: { txid }, key });
  }
  const now = Date.now();
  // Mark completed once; only the first call grants VIP and credits anything
  const r = await run(env, "UPDATE payments SET status = 'completed', txid = ? WHERE id = ? AND status != 'completed'", txid, id);
  if (!r.meta.changes) return;
  try {
    const u = await one(env, "SELECT * FROM users WHERE uid = ?", p.user_uid);
    if (item.p2p) return await settleOffer(env, item, id, p.user_uid, now);
    if (item.mk) return await mkSettle(env, item, id, p.user_uid, now);
    return await grantItem(env, u, item, id, now, false);
  } catch (e) {
    // the Pi payment is complete but the grant failed: flag it (the daily report shows these) instead of hiding it
    await run(env, "UPDATE payments SET status = 'grant_failed' WHERE id = ?", id).catch(() => {});
    await logError(env, "GRANT FAILED " + id, 500, String((e && e.message) || e)).catch(() => {});
    throw e;
  }
}

// The Pi waiting in a player's box (prizes and refunds not sent yet) can pay for things inside the app.
const BOX_SPEND_TYPES = ["bbox", "house", "vip_month", "dates", "spins", "jrypts", "kcoins", "derby", "royal", "lvl", "mult", "vipclub"];
async function boxTake(env, uid, price) {
  const rows = await all(env, "SELECT id, amount FROM payouts WHERE uid = ? AND status = 'new' AND kind IN ('prize', 'refund') ORDER BY created_at ASC", uid);
  const have = rows.reduce((a, r) => a + Number(r.amount), 0);
  if (have + 1e-9 < price) bad("box.low");
  const taken = []; let left = round(price);
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, Number(r.amount));
    const full = take >= Number(r.amount) - 1e-9;
    const ok = full
      ? await run(env, "UPDATE payouts SET status = 'spent', updated_at = ? WHERE id = ? AND status = 'new' AND amount = ?", Date.now(), r.id, r.amount)
      : await run(env, "UPDATE payouts SET amount = ROUND(amount - ?, 7), updated_at = ? WHERE id = ? AND status = 'new' AND amount = ?", take, Date.now(), r.id, r.amount);
    if (!ok.meta.changes) { await boxGive(env, uid, taken, "undo", Date.now()); bad("busy"); } // someone changed it at the same time
    taken.push({ id: r.id, take, full, amount: Number(r.amount) });
    left = round(left - take);
  }
  return taken;
}
// Give back what boxTake took (when the purchase could not be completed)
async function boxGive(env, uid, taken, ref, now) {
  for (const t of taken) {
    if (t.full) await run(env, "UPDATE payouts SET status = 'new', updated_at = ? WHERE id = ? AND status = 'spent'", now, t.id);
    else await run(env, "UPDATE payouts SET amount = ROUND(amount + ?, 7), updated_at = ? WHERE id = ?", t.take, now, t.id);
  }
}

// Gives what was bought. internal = paid from the player's own waiting prize balance (box): no Pi came in,
// so nothing goes to the weekly prize pool or to the inviter.
async function grantItem(env, u, item, id, now, internal) {
  const wid = L.weekId(now);
  const stmts = internal ? [] : [
    env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(wid, round(net(item.price) * PRIZE_RATE)),
  ];
  if (u) {
    // Bought Kombat coins: credited on the next load (never lost to a game save running at the same time)
    if (item.sponsor) stmts.push(env.DB.prepare("UPDATE sponsors SET status = 'review', pay_id = ? WHERE id = ? AND uid = ? AND status = 'paying'").bind(id, item.sponsor, u.uid));
    if (item.spins) stmts.push(env.DB.prepare("UPDATE users SET wheel_spins = COALESCE(wheel_spins, 0) + ? WHERE uid = ?").bind(item.spins, u.uid));
    if (item.jryPts) {
      stmts.push(env.DB.prepare("UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ?, jry_bought = COALESCE(jry_bought, 0) + ? WHERE uid = ?").bind(item.jryPts.jry, item.jryPts.jry, u.uid));
      stmts.push(env.DB.prepare("INSERT INTO jry_ledger (uid, delta, kind, ref, at) VALUES (?, ?, 'bought', ?, ?)").bind(u.uid, item.jryPts.jry, id, now));
    }
    if (item.coins) stmts.push(env.DB.prepare("INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'shop')").bind(u.uid, item.coins.coins, now));
    if (item.tier) stmts.push(await applyMembership(env, u, item.tier, now));
    if (item.mult) stmts.push(await applyMult(env, u, item.mult, now));
    if (item.vipc) stmts.push(env.DB.prepare("UPDATE users SET vipc_until = ? WHERE uid = ?").bind(Math.max(now, u.vipc_until || 0) + VC.VIPC.DAYS * DAY, u.uid));
    if (item.supFree) {
      const F = L.SUPPORT_FREE, n = item.supFree;
      stmts.push(env.DB.prepare("UPDATE users SET sup_pi = ROUND(COALESCE(sup_pi, 0) + ?, 7), sup_at = COALESCE(sup_at, ?), jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?").bind(n, now, n * F.JRY, u.uid));
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      stmts.push(env.DB.prepare("UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?").bind(n * F.DATES, n * F.DATES, u.uid));
    }
    if (item.sup) {
      // keeps the highest level reached; the total supported adds up
      stmts.push(env.DB.prepare("UPDATE users SET sup_lvl = MAX(COALESCE(sup_lvl, 0), ?), sup_pi = ROUND(COALESCE(sup_pi, 0) + ?, 7), sup_at = COALESCE(sup_at, ?), jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?")
        .bind(item.sup.lvl, item.sup.price, now, item.sup.jry, u.uid));
    }
    if (item.lvl) {
      const k = item.lvl;
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      stmts.push(env.DB.prepare("UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?").bind(k.dates, k.dates, u.uid));
      stmts.push(env.DB.prepare("INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, 'shop')").bind(u.uid, k.coins, now));
      if (k.spins) stmts.push(env.DB.prepare("UPDATE users SET wheel_spins = COALESCE(wheel_spins, 0) + ? WHERE uid = ?").bind(k.spins, u.uid));
      if (k.jry) stmts.push(env.DB.prepare("UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?").bind(k.jry, u.uid));
    }
    if (item.pack) {
      // Bought dates go to the balance only: they never count toward the weekly ranking
      if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", u.uid))) await saveState(env, u.uid, L.fresh(now), now);
      stmts.push(env.DB.prepare("UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?, '$.bought', COALESCE(json_extract(json, '$.bought'), 0) + ?) WHERE uid = ?").bind(item.pack.dates, item.pack.dates, u.uid));
    }
    if (u.referrer && !internal) {
      stmts.push(env.DB.prepare("UPDATE users SET ref_balance = ROUND(ref_balance + ?, 7) WHERE uid = ?").bind(round(net(item.price) * REFERRAL_RATE), u.referrer));
      stmts.push(env.DB.prepare("UPDATE payments SET referrer_uid = ? WHERE id = ?").bind(u.referrer, id));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (item.derby && u) await derbyGrant(env, u.uid, item.derby, now);
  if (item.supFree && u) await supSurprise(env, u.uid, now);
  if (item.royal && u) await royalGrant(env, u.uid, item.royal, id, now, item.price);
  if (item.house && u) await houseCreate(env, u, item.house, id, now, item.price);
  if (item.bbox && u) await bboxOpen(env, u, item.bbox, id, now);
  const camel = (item.lvl && item.lvl.camel) || (item.sup && item.sup.camel);
  if (camel && u) {
    const st = await loadState(env, u.uid, now);
    L.addAnimal(st, camel, now, item.sup ? "supporter" : "pack");
    await saveState(env, u.uid, st, now);
  }
  if (item.jry && u) {
    // testJRY at the pool price at the moment of payment, sent from the app wallet
    const m = await jryMarket(env).catch(() => null);
    const perPi = m && m.price > 0 ? 1 / m.price : 1000;
    const jry = (Math.floor(item.price * perPi * 1e7) / 1e7).toFixed(7);
    await run(env, "INSERT OR IGNORE INTO jry_buys (id, uid, address, pi, jry, status, at) VALUES (?, ?, ?, ?, ?, 'owed', ?)", id, u.uid, u.jry_wallet || "", item.price, jry, now);
    await deliverJry(env, id);
  }
}

// ---------- Points market (dates / Kombat coins for Pi) ----------
const MK = L.MARKET;
// Adds points to a player without touching a game save that may be running at the same time.
// Bought / returned / won points never count toward weekly rankings.
// ---------- Pi Notification Center ----------
// Messages in the player's language (saved at sign-in). {x} are filled from vars.
const NOTE = {
  mangaNew: { go: "mag", en: ["🎨 New manga chapter", "{s}: {t}. Read it now in Pi Oasis."], ar: ["🎨 فصل مانغا جديد", "{s}: {t}. اقرأه الآن في واحة باي."], fr: ["🎨 Nouveau chapitre de manga", "{s} : {t}. Lis-le maintenant dans Pi Oasis."] },
  refplay: { go: "farm", en: ["🤝 {u} is playing!", "Your friend came back to Pi Oasis: +{d} dates and +{j} JRY points for you."], ar: ["🤝 ‎{u} يلعب الآن!", "عاد صديقك إلى واحة باي: لك +{d} تمرة و+{j} نقطة JRY."], fr: ["🤝 {u} joue !", "Ton ami est revenu sur Pi Oasis : +{d} dattes et +{j} points JRY pour toi."] },
  chatdm: { go: "chat", en: ["💬 {u} sent you a message", "Open the chat to reply."], ar: ["💬 رسالة من ‎{u}", "افتح الدردشة لتردّ."], fr: ["💬 Message de {u}", "Ouvrez le chat pour répondre."] },
  gift: { go: "box", en: ["🎁 You received a gift", "{u} sent you a gift. Open your box to see it."], ar: ["🎁 وصلتك هدية", "أرسل لك ‎{u} هدية. افتح صندوقك لتراها."], fr: ["🎁 Vous avez reçu un cadeau", "{u} vous a envoyé un cadeau. Ouvrez votre boîte."] },
  nftswap: { go: "kombat", en: ["🔁 Your card was swapped", "Someone accepted your swap offer. Open your collection to see the new card."], ar: ["🔁 تمت مبادلة بطاقتك", "قَبِل أحدهم عرض المبادلة. افتح مجموعتك لترى البطاقة الجديدة."], fr: ["🔁 Votre carte a été échangée", "Quelqu'un a accepté votre offre d'échange. Ouvrez votre collection."] },
  daily: { go: "farm", en: ["🌴 Your oasis is waiting", "Your camels made dates and your free Derby races are ready."], ar: ["🌴 واحتك في انتظارك", "جِمالك جمعت التمر، وسباقاتك المجانية جاهزة."], fr: ["🌴 Ton oasis t'attend", "Tes chameaux ont produit des dattes et tes courses gratuites sont prêtes."] },
  week: { go: "rank", en: ["🏆 Weekly ranking: #{p}", "Well done! +{d} dates and +{j} JRY for your place. Your Pi prize is kept safe in your box and sent to your wallet as soon as sending opens."], ar: ["🏆 ترتيب الأسبوع: المركز {p}", "أحسنت! +{d} تمرة و+{j} JRY لمركزك. جائزتك بـ Pi محفوظة في صندوقك وتُرسل إلى محفظتك فور فتح الإرسال."], fr: ["🏆 Classement : {p}e place", "Bravo ! +{d} dattes et +{j} JRY pour ta place. Ton prix en Pi est gardé dans ta boîte et part vers ton portefeuille dès que l'envoi ouvre."] },
  svc: { go: "services", en: ["🛠️ New app request", "{p} from @{u}: open the services page to answer."], ar: ["🛠️ طلب تطبيق جديد", "{p} من ‎@{u}: افتح صفحة الخدمات للرد."], fr: ["🛠️ Nouvelle demande d'app", "{p} de @{u} : ouvre la page des services pour répondre."] },
  svcup: { go: "services", en: ["🛠️ Your app request was updated", "Open the services page to see the new status."], ar: ["🛠️ تم تحديث طلب تطبيقك", "افتح صفحة الخدمات لترى الحالة الجديدة."], fr: ["🛠️ Ta demande d'app a été mise à jour", "Ouvre la page des services pour voir le nouveau statut."] },
  aweek: { go: "arena", en: ["⚔️ Jerry Arena: #{p}", "+{d} dates for your place this week."], ar: ["⚔️ جيري أرينا: المركز {p}", "+{d} تمرة لمركزك هذا الأسبوع."], fr: ["⚔️ Jerry Arena : {p}e", "+{d} dattes pour ta place cette semaine."] },
  ainv: { go: "arena", en: ["⚔️ {u} invites you to a battle", "Tap to join the room."], ar: ["⚔️ ‎{u} يدعوك إلى معركة", "اضغط للانضمام إلى الغرفة."], fr: ["⚔️ {u} t'invite à un combat", "Appuie pour rejoindre le salon."] },
  catgoal: { go: "catalog", en: ["📖 A catalog reward is ready", "You collected enough items: open your catalog and claim it."], ar: ["📖 مكافأة الكاتالوغ جاهزة", "جمعتَ ما يكفي من العناصر: افتح كاتالوغك واستلمها."], fr: ["📖 Une récompense du catalogue est prête", "Tu as collecté assez d'objets : ouvre ton catalogue et récupère-la."] },
  rstart: { go: "vip", en: ["👑 The Grand Royal Final has started!", "All royal cards are sold. {d} days to earn the most Kombat coins: 1 billion for #1."], ar: ["👑 بدأ النهائي الملكي الكبير!", "بيعت كل البطاقات الملكية. {d} يومًا لجمع أكثر عملات كومبات: مليار للأول."], fr: ["👑 La Grande Finale royale commence !", "Toutes les cartes royales sont vendues. {d} jours pour gagner le plus de pièces Kombat : 1 milliard pour le 1er."] },
  rfinal: { go: "vip", en: ["👑 Grand Royal Final: #{p}", "+{n} Kombat coins for your place!"], ar: ["👑 النهائي الملكي الكبير: المركز {p}", "+{n} عملة كومبات لمركزك!"], fr: ["👑 Grande Finale royale : {p}e", "+{n} pièces Kombat pour ta place !"] },
  jry: { go: "kombat", en: ["💠 +{n} JRY from Jerry Development", "{note}"], ar: ["💠 +{n} JRY من Jerry Development", "{note}"], fr: ["💠 +{n} JRY de Jerry Development", "{note}"] },
  piprize: { go: "box", en: ["🎁 Your weekly prize: {pi} Pi", "Place {p}. Your Pi are waiting in your box and will be sent as soon as sending opens."], ar: ["🎁 جائزتك الأسبوعية: {pi} Pi", "المركز {p}. عملاتك في الانتظار داخل صندوقك وستُرسل بمجرد فتح الإرسال."], fr: ["🎁 Ton prix de la semaine : {pi} Pi", "Place {p}. Tes Pi t'attendent dans ton coffre et seront envoyés dès que l'envoi ouvrira."] },
  courtnew: { go: "rank", en: ["{t_en}: your new title", "You rose to {t_en} in the Court. Open the Ranking to see your perks."], ar: ["{t_ar}: لقبك الجديد", "ارتقيت إلى لقب {t_ar} في البلاط. افتح الترتيب لترى امتيازاتك."], fr: ["{t_fr} : ton nouveau titre", "Tu es devenu {t_fr} à la Cour. Ouvre le classement pour voir tes avantages."] },
  courtlost: { go: "rank", en: ["{u} took your place", "{u} is now {t_en}. Support the project with more Pi to win the title back."], ar: ["‎{u} أخذ مكانك", "أصبح ‎{u} الآن {t_ar}. ادعم المشروع بـ Pi أكثر لتستعيد اللقب."], fr: ["{u} a pris ta place", "{u} est maintenant {t_fr}. Soutiens le projet avec plus de Pi pour reprendre le titre."] },
  courtemp: { go: "rank", en: ["👑 A new Emperor of the Game!", "{u} took the throne. Open the Ranking to see the crown."], ar: ["👑 إمبراطور جديد للعبة!", "تربّع ‎{u} على العرش. افتح الترتيب لترى التاج."], fr: ["👑 Un nouvel Empereur du jeu !", "{u} a pris le trône. Ouvre le classement pour voir la couronne."] },
  elected: { go: "rank", en: ["🏛️ You were elected to Parliament", "You hold seat {seat} this month. Open the Court to see the Parliament."], ar: ["🏛️ تم انتخابك في البرلمان", "لديك المقعد رقم {seat} هذا الشهر. افتح البلاط لترى البرلمان."], fr: ["🏛️ Tu as été élu au Parlement", "Tu occupes le siège {seat} ce mois-ci. Ouvre la Cour pour voir le Parlement."] },
  kweek: { go: "kombat", en: ["⚔️ Kombat tournament: #{p}", "Open Jerry Kombat to collect your prize."], ar: ["⚔️ بطولة كومبات: المركز {p}", "افتح جيري كومبات لتستلم جائزتك."], fr: ["⚔️ Tournoi Kombat : {p}e", "Ouvre Jerry Kombat pour récupérer ton prix."] },
  season: { go: "season", en: ["🏆 League season over", "Your result is ready: +{d} dates, +{j} JRY points."], ar: ["🏆 انتهى موسم الدوري", "نتيجتك جاهزة: +{d} تمرة و+{j} نقطة JRY."], fr: ["🏆 Saison de ligue terminée", "Ton résultat est prêt : +{d} dattes, +{j} points JRY."] },
  cweek: { go: "castle", en: ["🏰 Jerry Castle: #{p}", "+{d} dates for your place this week."], ar: ["🏰 قلعة جيري: المركز {p}", "+{d} تمرة لمركزك هذا الأسبوع."], fr: ["🏰 Château de Jerry : {p}e", "+{d} dattes pour ta place cette semaine."] },
  mweek: { go: "merge", en: ["🐎 Horse Merge: #{p}", "+{d} dates for your place this week."], ar: ["🐎 دمج الخيل: المركز {p}", "+{d} تمرة لمركزك هذا الأسبوع."], fr: ["🐎 Fusion de chevaux : {p}e", "+{d} dattes pour ta place cette semaine."] },
  dweek: { go: "derby", en: ["🏁 Camel Derby: #{p}", "+{d} dates for your place this week."], ar: ["🏁 سباق الجمال: المركز {p}", "+{d} تمرة لمركزك هذا الأسبوع."], fr: ["🏁 Course de chameaux : {p}e", "+{d} dattes pour ta place cette semaine."] },
  sold: { go: "market", en: ["💰 Your offer sold", "+{pi} Pi added to your sales balance."], ar: ["💰 تم بيع عرضك", "+{pi} Pi أُضيفت إلى رصيد مبيعاتك."], fr: ["💰 Ton offre est vendue", "+{pi} Pi ajoutés à ton solde de ventes."] },
};
// items: [{ uid, kind, ref, vars }]. Best effort: a failure never breaks the game.
async function notify(env, items) {
  if (!env.PI_NETWORK_API_KEY || !items.length) return 0;
  const send = [];
  for (const it of items) {
    const r = await run(env, "INSERT OR IGNORE INTO notif_log (uid, kind, ref, at) VALUES (?, ?, ?, ?)", it.uid, it.kind, String(it.ref), Date.now());
    if (!r.meta.changes) continue;
    const u = await one(env, "SELECT lang FROM users WHERE uid = ?", it.uid);
    const n = NOTE[it.kind], m = n[(u && n[u.lang]) ? u.lang : "en"];
    const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (it.vars && it.vars[k] != null ? String(it.vars[k]) : ""));
    send.push({ title: fill(m[0]), body: fill(m[1]), user_uid: it.uid, subroute: "/?go=" + n.go + (it.q ? "&" + it.q : "") });
  }
  let sent = 0;
  for (let i = 0; i < send.length; i += 256) {
    try {
      const r = await pi(env, "/in_app_notifications/notify", { method: "POST", body: { notifications: send.slice(i, i + 256) } });
      sent += (r.delivered_notifications || []).length;
    } catch (e) { /* logged by pi(); players without the notifications permission are skipped by Pi */ }
  }
  return sent;
}
// Once a day (18:00 UTC): players who played this week but not yet today
async function dailyReminder(env) {
  const now = Date.now();
  if (new Date(now).getUTCHours() !== 18) return 0;
  const day = L.dayId(now);
  const rows = await all(env, "SELECT uid FROM state WHERE updated_at >= ? AND updated_at < ? ORDER BY updated_at DESC LIMIT 2000", now - 7 * DAY, day * DAY);
  return notify(env, rows.map((r) => ({ uid: r.uid, kind: "daily", ref: day })));
}
// Kombat tournament: tell last week's top 100 to collect their prize
async function kombatWeekNotes(env) {
  const last = KL.weekId(Date.now() - 7 * DAY);
  const top = await all(env, "SELECT uid FROM kombat_weeks WHERE week_id = ? AND earned > 0 ORDER BY earned DESC, updated_at ASC LIMIT 100", last);
  return notify(env, top.map((r, i) => ({ uid: r.uid, kind: "kweek", ref: last, vars: { p: i + 1 } })));
}

// ---------- Camel Derby helpers ----------
async function derbyLoad(env, uid, now) {
  const r = await one(env, "SELECT json, ver FROM derby WHERE uid = ?", uid);
  const d = DL.norm(r ? JSON.parse(r.json) : null, now);
  d.bonus = (await royalPerks(env, uid)).races; // extra free races a day from royal cards
  return { d, ver: r ? r.ver : -1 };
}
// Saves only if nobody else saved in between (two taps at once can't both count)
async function derbySave(env, uid, d, ver, now) {
  const pw = DL.power(d.camels[d.act]);
  const r = ver < 0
    ? await run(env, "INSERT OR IGNORE INTO derby (uid, json, trophies, power, ver, updated_at) VALUES (?, ?, ?, ?, 0, ?)", uid, JSON.stringify(d), d.trophies, pw, now)
    : await run(env, "UPDATE derby SET json = ?, trophies = ?, power = ?, ver = ver + 1, updated_at = ? WHERE uid = ? AND ver = ?", JSON.stringify(d), d.trophies, pw, now, uid, ver);
  if (!r.meta.changes) bad("derby.busy");
}
const derbyView = (d) => ({ derby: d, cup: DL.cupOf(d.trophies), max: DL.RACES_PER_DAY + (d.bonus || 0), left: Math.max(0, DL.RACES_PER_DAY + (d.bonus || 0) - d.used), adLeft: Math.max(0, DL.AD_RACES - d.ads) });
async function derbyState(env, u, now) {
  const fresh = await one(env, "SELECT * FROM users WHERE uid = ?", u.uid);
  return stateFor(env, fresh, now, tierOf(fresh, now, await isPartner(env, fresh.username)));
}
// A Derby purchase: golden feed, or a new camel (if the stable is full, its price in feed instead)
async function derbyGrant(env, uid, item, now) {
  for (let i = 0; i < 4; i++) {
    const { d, ver } = await derbyLoad(env, uid, now);
    if (item.feed) d.feed += item.feed;
    else if (d.camels.length < DL.STABLE) { d.camels.push(DL.newCamel(item.breed, "")); d.act = d.camels.length - 1; }
    else d.feed += Math.round(DL.breedById(item.breed).price * 70);
    try { return await derbySave(env, uid, d, ver, now); } catch (e) { if (i === 3) throw e; }
  }
}
// Last week's Derby: dates for the top 100 by trophies (given once)
// Monthly League: points come from the PLACE a player takes in each game's weekly ranking (1st 100, 2nd 80, 3rd 65, then down to 1 at rank 100),
// summed over the 4 weeks of the season and over Harvest, Kombat, Derby, Horse Merge and Castle. Players compete inside their division.
const leagueRank = (n) => [{ k: "week_scores", c: "score" }, { k: "merge_weeks", c: "pts" }, { k: "derby_weeks", c: "pts" }, { k: "kombat_weeks", c: "earned" }, { k: "castle_weeks", c: "pts" }]
  .map((t) => `SELECT uid, ROW_NUMBER() OVER (PARTITION BY week_id ORDER BY ${t.c} DESC, updated_at ASC) AS rk FROM ${t.k} WHERE week_id BETWEEN ?1 AND ?2 AND ${t.c} > 0`).join(" UNION ALL ");
async function seasonBoard(env, season) {
  return memo(env, "season" + season, () => seasonBoardRaw(env, season));
}
async function seasonBoardRaw(env, season) {
  const a = L.SEASON.start(season), b = a + 21 * DAY;
  return all(env, `WITH r AS (${leagueRank()}), p AS (SELECT uid, CASE rk WHEN 1 THEN 100 WHEN 2 THEN 80 WHEN 3 THEN 65 ELSE MAX(1, 60 - (rk - 4) * 59 / 96) END AS sp FROM r WHERE rk <= 100)
    SELECT p.uid, u.username, SUM(p.sp) AS sp, COALESCE(d.div, 0) AS div FROM p JOIN users u ON u.uid = p.uid LEFT JOIN league_div d ON d.uid = p.uid GROUP BY p.uid ORDER BY sp DESC, p.uid ASC`, a, b);
}
const leagueZone = (n) => (n >= L.SEASON.MIN_ZONE ? Math.max(1, Math.floor(n * L.SEASON.ZONE)) : 0);
async function grantSeasonPrizes(env) {
  await ensureSchema(env);
  const now = Date.now(), last = L.SEASON.id(now) - 1;
  if (last < 0) return 0;
  const g = await run(env, "INSERT OR IGNORE INTO season_paid (season, at) VALUES (?, ?)", last, now);
  if (!g.meta.changes) return 0;
  const rows = await seasonBoard(env, last), out = [];
  for (let d = 0; d < L.SEASON.DIVS.length; d++) {
    const arr = rows.filter((r) => r.div === d), k = leagueZone(arr.length);
    arr.forEach((r, i) => {
      const up = i < k, down = !up && i >= arr.length - k && k > 0;
      const nd = up && d < L.SEASON.DIVS.length - 1 ? d + 1 : down && d > 0 ? d - 1 : d;
      const o = up ? "up" : down ? "down" : "stay", rw = L.SEASON.reward(o, d);
      out.push({ ...r, rank: i + 1, size: arr.length, outcome: o, from: d, to: nd, dates: rw.dates, jry: rw.jry });
    });
  }
  // the general ranking: highest division first, then points; its top 10 also win JRY points
  [...out].sort((x, y) => y.from - x.from || y.sp - x.sp).slice(0, 10).forEach((r, i) => { r.jry += L.SEASON.PRIZES[i]; });
  for (const r of out) {
    await run(env, "INSERT OR REPLACE INTO league_results (season, uid, div_from, div_to, sp, rank, size, outcome, dates, jry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", last, r.uid, r.from, r.to, r.sp, r.rank, r.size, r.outcome, r.dates, r.jry);
    await run(env, "INSERT INTO league_div (uid, div) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET div = excluded.div", r.uid, r.to);
    if (r.dates) await giveReward(env, r.uid, "dates", r.dates, now, "season");
    if (r.jry) await giveReward(env, r.uid, "jry", r.jry, now, "season");
  }
  await notify(env, out.map((r) => ({ uid: r.uid, kind: "season", ref: last, vars: { d: r.dates.toLocaleString("en-US"), j: r.jry } })));
  return out.length;
}
// Black Box paid: a numbered card plus the fixed contents of that box
async function bboxOpen(env, u, tier, payId, now) {
  const first = await run(env, "INSERT OR IGNORE INTO bbox_opens (pay_id, uid, tier, edition, at) VALUES (?, ?, ?, 0, ?)", payId, u.uid, tier, now);
  if (!first.meta.changes) return; // this payment was already opened
  const B = L.BBOX.of(tier), kind = "box" + tier;
  const c = await one(env, "INSERT INTO bbox_counter (tier, n) VALUES (?, 1) ON CONFLICT(tier) DO UPDATE SET n = n + 1 RETURNING n", tier);
  const ed = c.n;
  await run(env, "INSERT INTO nft_items (kind, edition, owner, minted_at) VALUES (?, ?, ?, ?)", kind, ed, u.uid, now);
  const it = await one(env, "SELECT id FROM nft_items WHERE kind = ? AND edition = ?", kind, ed);
  await run(env, "INSERT INTO nft_moves (item_id, from_uid, to_uid, price, at) VALUES (?, NULL, ?, 0, ?)", it.id, u.uid, now);
  await run(env, "UPDATE bbox_opens SET edition = ?, item_id = ? WHERE pay_id = ?", ed, it.id, payId);
  await creditPoints(env, u.uid, "dates", B.dates, now, "bbox");
  await creditPoints(env, u.uid, "coins", B.coins, now, "bbox");
  await giveReward(env, u.uid, "jry", B.jry, now, "bbox");
  await giveReward(env, u.uid, "spins", B.spins, now, "bbox");
  if (B.vipc) await giveReward(env, u.uid, "vipclub", B.vipc, now, "bbox");
  const cur = multOf(u, now);
  if (B.mult && !(cur && cur.f > 2)) await (await applyMult(env, u, { id: L.MULT[0].id, days: B.mult }, now)).run();
  if (B.camel) { const st = await loadState(env, u.uid, now); L.addAnimal(st, B.camel, now, "bbox"); await saveState(env, u.uid, st, now); }
}
async function achView(env, u) {
  const st = await one(env, "SELECT json FROM state WHERE uid = ?", u.uid);
  let s = {}; try { s = JSON.parse((st && st.json) || "{}"); } catch {}
  const today = Math.floor(Date.now() / DAY), sr = await one(env, "SELECT last, n FROM login_streak WHERE uid = ?", u.uid);
  const x = { streak: sr && sr.last >= today - 1 ? sr.n : 0, house: !!(await one(env, "SELECT 1 AS x FROM house_members WHERE uid = ?", u.uid)), supporter: (await paidOf(env, u.uid)) > 0 };
  const f = L.achFacts(s, x), got = new Set((await all(env, "SELECT id FROM ach WHERE uid = ?", u.uid)).map((r) => r.id));
  return { list: L.ACH.map((a) => ({ id: a.id, e: a.e, jry: a.jry, done: !!a.t(f), claimed: got.has(a.id) })) };
}
async function grantCastleWeek(env) {
  await ensureSchema(env);
  const now = Date.now(), last = L.weekId(now - 7 * DAY);
  const g = await run(env, "INSERT OR IGNORE INTO castle_week_paid (week_id, at) VALUES (?, ?)", last, now);
  if (!g.meta.changes) return 0;
  const top = await all(env, "SELECT uid FROM castle_weeks WHERE week_id = ? AND pts > 0 ORDER BY pts DESC, updated_at ASC LIMIT 100", last);
  for (let i = 0; i < top.length; i++) {
    const w = L.MG.weekPrize(i + 1);
    if (w.dates) await creditPoints(env, top[i].uid, "dates", w.dates, now, "castleweek");
    if (w.jry) await giveReward(env, top[i].uid, "jry", w.jry, now, "castleweek");
  }
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "cweek", ref: last, vars: { p: i + 1, d: L.MG.weekPrize(i + 1).dates.toLocaleString("en-US") } })));
  return top.length;
}
async function grantMergeWeek(env) {
  await ensureSchema(env);
  const now = Date.now(), last = L.weekId(now - 7 * DAY);
  const g = await run(env, "INSERT OR IGNORE INTO merge_week_paid (week_id, at) VALUES (?, ?)", last, now);
  if (!g.meta.changes) return 0;
  const top = await all(env, "SELECT uid FROM merge_weeks WHERE week_id = ? AND pts > 0 ORDER BY pts DESC, updated_at ASC LIMIT 100", last);
  for (let i = 0; i < top.length; i++) {
    const w = L.MG.weekPrize(i + 1);
    if (w.dates) await creditPoints(env, top[i].uid, "dates", w.dates, now, "mergeweek");
    if (w.jry) await giveReward(env, top[i].uid, "jry", w.jry, now, "mergeweek");
  }
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "mweek", ref: last, vars: { p: i + 1, d: L.MG.weekPrize(i + 1).dates.toLocaleString("en-US") } })));
  return top.length;
}
async function grantDerbyWeek(env) {
  await ensureSchema(env);
  const now = Date.now(), last = L.weekId(now - 7 * DAY);
  const g = await run(env, "INSERT OR IGNORE INTO derby_week_paid (week_id, at) VALUES (?, ?)", last, now);
  if (!g.meta.changes) return 0;
  const top = await all(env, "SELECT uid FROM derby_weeks WHERE week_id = ? AND pts > 0 ORDER BY pts DESC, updated_at ASC LIMIT 100", last);
  for (let i = 0; i < top.length; i++) await creditPoints(env, top[i].uid, "dates", DL.weekDates(i + 1), now, "derbyweek");
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "dweek", ref: last, vars: { p: i + 1, d: DL.weekDates(i + 1).toLocaleString("en-US") } })));
  return top.length;
}

// ---------- Royal cards helpers ----------
// The lowest free copy number of a tier (null when all 500 are sold)
async function royalNext(env, tier) {
  const taken = new Set((await all(env, "SELECT ed FROM royal_cards WHERE tier = ?", tier)).map((r) => r.ed));
  for (let e = 1; e <= L.ROYAL.MAX; e++) if (!taken.has(e)) return e;
  return null;
}
// Last week's best 30 with what each won (kept 60 s in memory: it only changes once a week)
let lastWeekCache = null;
async function lastWeekWinners(env, now) {
  const wk = L.weekId(now - 7 * DAY);
  if (lastWeekCache && lastWeekCache.week === wk && now - lastWeekCache.at < 60000) return lastWeekCache.data;
  const rows = await all(env, `SELECT u.username, s.score, p.amount AS pi, p.status AS pst FROM week_scores s JOIN users u ON u.uid = s.uid
    LEFT JOIN payouts p ON p.kind = 'prize' AND p.ref = ? AND p.uid = s.uid WHERE s.week_id = ? AND s.score > 0 ORDER BY s.score DESC, s.updated_at ASC LIMIT 30`, String(wk), wk);
  const data = { week: wk, winners: rows.map((r, i) => ({ place: i + 1, username: r.username, score: r.score, pi: r.pi == null ? 0 : Number(r.pi), sent: r.pst === "completed", dates: L.WEEK100.dates(i + 1), jry: L.WEEK100.jry(i + 1) })) };
  lastWeekCache = { week: wk, at: now, data };
  return data;
}
// What a player's royal cards add: Kombat profit and Derby races
async function royalPerks(env, uid) {
  const cards = await all(env, "SELECT tier, ed FROM royal_cards WHERE uid = ? AND id NOT IN (SELECT amount FROM mk_offers WHERE kind = 'card' AND status IN ('open', 'reserved'))", uid);
  let boost = 0, races = 0;
  for (const c of cards) {
    const t = L.ROYAL.tierById(c.tier), s = L.ROYAL.sigOf(c.tier, c.ed);
    if (!t) continue;
    boost += t.boost + (s.boost || 0); races += t.races + (s.races || 0);
  }
  return { boost: Math.min(L.ROYAL.BOOST_MAX, boost), races: Math.min(40, races), count: cards.length };
}
// A paid card: the copy shown to the buyer, or the next free one if someone else took it at the same
// moment; if the tier sold out meanwhile, the Pi goes back to the buyer.
async function royalGrant(env, uid, item, payId, now, price) {
  let r = await run(env, "INSERT OR IGNORE INTO royal_cards (tier, ed, uid, pay_id, at) VALUES (?, ?, ?, ?, ?)", item.tier, item.ed, uid, payId, now);
  for (let i = 0; !r.meta.changes && i < 5; i++) {
    if (await one(env, "SELECT 1 AS x FROM royal_cards WHERE pay_id = ?", payId)) return;
    const next = await royalNext(env, item.tier);
    if (!next) break;
    r = await run(env, "INSERT OR IGNORE INTO royal_cards (tier, ed, uid, pay_id, at) VALUES (?, ?, ?, ?, ?)", item.tier, next, uid, payId, now);
  }
  await royalMaybeFinal(env, now);
  if (!r.meta.changes && !(await one(env, "SELECT 1 AS x FROM royal_cards WHERE pay_id = ?", payId))) {
    await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis royal card refund (sold out)', 'new', ?, ?)",
      crypto.randomUUID(), payId, uid, price, now, now);
  }
}
// Everybody who played lately is told that a new King took the throne
async function kingAnnounce(env, uid, paid, now) {
  const u = await one(env, "SELECT username FROM users WHERE uid = ?", uid);
  const rows = await all(env, "SELECT uid FROM users ORDER BY rowid DESC LIMIT 200");
  await notify(env, rows.filter((r) => r.uid !== uid).map((r) => ({ uid: r.uid, kind: "newking", ref: "king" + uid.slice(0, 12) + "-" + Math.floor(now / DAY), vars: { u: u ? u.username : "?" } })));
}
// Grand Royal Final: card holders ranked by Kombat coins earned in the weeks of the final
async function royalContest(env, fin, limit) {
  const from = KL.weekId(fin.start_at), to = fin.end_at;
  return all(env, `SELECT u.uid, u.username, COALESCE(SUM(w.earned), 0) AS earned FROM users u
    JOIN kombat_weeks w ON w.uid = u.uid AND w.week_id >= ? AND w.week_id < ?
    WHERE u.uid IN (SELECT uid FROM royal_cards) GROUP BY u.uid ORDER BY earned DESC LIMIT ?`, from, to, limit)
    .then((rows) => rows.filter((r) => r.earned > 0));
}
// All 2,000 copies sold: the final opens (once) and every holder is told
async function royalMaybeFinal(env, now) {
  const sold = (await one(env, `SELECT COUNT(*) AS n FROM royal_cards WHERE tier IN (${L.ROYAL.FINAL_TIERS.map(() => "?").join(",")})`, ...L.ROYAL.FINAL_TIERS)).n;
  if (sold < L.ROYAL.MAX * L.ROYAL.FINAL_TIERS.length) return;
  const r = await run(env, "INSERT OR IGNORE INTO royal_final (id, start_at, end_at, paid) VALUES (1, ?, ?, 0)", now, now + L.ROYAL.FINAL_DAYS * DAY);
  if (!r.meta.changes) return;
  const holders = await all(env, "SELECT DISTINCT uid FROM royal_cards");
  await notify(env, holders.map((h) => ({ uid: h.uid, kind: "rstart", ref: 1, vars: { d: L.ROYAL.FINAL_DAYS } })));
}
// The final is over: prizes to the top 10 (once)
async function royalFinalPrizes(env) {
  await ensureSchema(env);
  const now = Date.now();
  const fin = await one(env, "SELECT * FROM royal_final WHERE id = 1 AND paid = 0 AND end_at <= ?", now);
  if (!fin) return 0;
  const g = await run(env, "UPDATE royal_final SET paid = 1 WHERE id = 1 AND paid = 0");
  if (!g.meta.changes) return 0;
  const top = await royalContest(env, fin, L.ROYAL.PRIZES.length);
  for (let i = 0; i < top.length; i++) await creditPoints(env, top[i].uid, "coins", L.ROYAL.PRIZES[i], now, "royal-final");
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "rfinal", ref: 1, vars: { p: i + 1, n: L.ROYAL.PRIZES[i].toLocaleString("en-US") } })));
  return top.length;
}

// The surprise of the month for a free supporter (once a month, the same for everyone that month)
async function supSurprise(env, uid, now) {
  const m = L.ROYAL.monthId(now), s = L.SUPPORT_FREE.surpriseOf(m);
  const r = await run(env, "INSERT OR IGNORE INTO sup_surprise (uid, month, kind, at) VALUES (?, ?, ?, ?)", uid, m, s.id, now);
  if (!r.meta.changes) return null;
  if (s.camel) { const st = await loadState(env, uid, now); L.addAnimal(st, s.camel, now, "supporter"); await saveState(env, uid, st, now); }
  if (s.spins) await giveReward(env, uid, "spins", s.spins, now, "surprise");
  if (s.feed) await derbyGrant(env, uid, { feed: s.feed }, now);
  if (s.coins) await giveReward(env, uid, "coins", s.coins, now, "surprise");
  if (s.jry) await giveReward(env, uid, "jry", s.jry, now, "surprise");
  if (s.dates) await giveReward(env, uid, "dates", s.dates, now, "surprise");
  return s;
}

// ---------- Jerry Arena helpers ----------
const ARENA_REWARD = { WIN: 80, OTHER: 20, DAILY: 10, MIN_ROUNDS: 3, QUEUE_BOT_MS: 15000, STALE_MS: 5 * 60000 };
const arenaStats = async (env, uid) => (await one(env, "SELECT * FROM arena_stats WHERE uid = ?", uid)) || { uid, trophies: 0, wins: 0, losses: 0, draws: 0 };
// The unfinished match a player is in (if any)
const arenaActive = (env, uid, now = Date.now()) => one(env, "SELECT m.id, m.status, m.mode, m.code FROM arena_matches m JOIN arena_players p ON p.match_id = m.id WHERE p.uid = ? AND (m.status = 'live' OR (m.status = 'waiting' AND m.created_at > ?)) ORDER BY m.id DESC LIMIT 1", uid, now - 30 * 60000);
// Cron: abandoned matches and old rooms are closed
async function arenaSweep(env) {
  await ensureSchema(env);
  const now = Date.now();
  await run(env, "UPDATE arena_matches SET status = 'done', result = '[]', updated_at = ? WHERE status = 'live' AND updated_at < ?", now, now - ARENA_REWARD.STALE_MS);
  await run(env, "UPDATE arena_matches SET status = 'done', result = '[]', updated_at = ? WHERE status = 'waiting' AND created_at < ?", now, now - 30 * 60000);
  await run(env, "DELETE FROM arena_queue WHERE at < ?", now - 120000);
}
// Creates a live match from [{ uid, name, bot }] (already in slot order)
async function arenaCreate(env, mode, players, o = {}) {
  const now = Date.now(), seed = Math.floor(secureRandom() * 2147483647);
  const st = AR.newState(mode, players, seed);
  const humans = players.filter((p) => !p.bot).length;
  const m = await one(env, "INSERT INTO arena_matches (code, mode, host, status, ranked, state, ver, round_at, created_at, updated_at) VALUES (?, ?, ?, 'live', ?, ?, 0, ?, ?, ?) RETURNING id",
    o.code || null, mode, o.host || null, humans >= 2 ? 1 : 0, JSON.stringify(st), now, now, now);
  await env.DB.batch(players.map((p, i) => env.DB.prepare("INSERT OR REPLACE INTO arena_players (match_id, slot, uid, name, bot) VALUES (?, ?, ?, ?, ?)").bind(m.id, i, p.uid || null, p.name, p.bot ? 1 : 0)));
  return m.id;
}
const arenaBots = (n, used) => {
  const names = AR.BOT_NAMES.filter((x) => !used.includes(x)), out = [];
  for (let i = 0; i < n; i++) out.push({ uid: null, bot: true, name: "🤖 " + names.splice(Math.floor(secureRandom() * names.length), 1)[0] });
  return out;
};
// Advances a live match: when everybody has played (or the 15 s are over) the round is resolved
async function arenaTick(env, id, now) {
  for (let g = 0; g < 20; g++) {
    const m = await one(env, "SELECT * FROM arena_matches WHERE id = ?", id);
    if (!m || m.status !== "live") return m;
    if (now - m.updated_at > ARENA_REWARD.STALE_MS) {
      // nobody has done anything for 5 minutes: the match is abandoned
      await run(env, "UPDATE arena_matches SET status = 'done', updated_at = ?, result = '[]' WHERE id = ? AND status = 'live'", now, id);
      return { ...m, status: "done" };
    }
    const st = JSON.parse(m.state);
    const by = {};
    for (const x of await all(env, "SELECT slot, act, target FROM arena_moves WHERE match_id = ? AND round = ?", id, st.round)) by[x.slot] = x;
    const living = AR.alive(st), humans = living.filter((p) => !p.bot);
    if (!humans.every((p) => by[p.slot]) && now < m.round_at + AR.ROUND_MS) return m;
    const mv = {};
    for (const p of living) {
      const sp = st.players[p.slot];
      if (by[p.slot]) { mv[p.slot] = { act: by[p.slot].act, target: by[p.slot].target }; sp.afk = 0; }
      else if (p.bot) mv[p.slot] = AR.botMove(st, p.slot);
      else { mv[p.slot] = { act: "guard", target: p.slot }; sp.afk = (sp.afk || 0) + 1; }
    }
    let next = AR.resolveRound(st, mv);
    // away for two rounds in a row: out of the match
    for (const p of next.players) if (p.alive && !p.bot && (st.players[p.slot].afk || 0) >= AR.AFK_LIMIT) next = AR.forfeit(next, p.slot);
    for (const p of next.players) p.afk = st.players[p.slot].afk;
    const r = await run(env, "UPDATE arena_matches SET state = ?, ver = ver + 1, round_at = ?, status = ?, updated_at = ? WHERE id = ? AND ver = ?",
      JSON.stringify(next), now, next.over ? "done" : "live", now, id, m.ver);
    if (!r.meta.changes) continue; // another request resolved it first: look again
    if (next.over) await arenaFinish(env, id, next, now);
  }
  return one(env, "SELECT * FROM arena_matches WHERE id = ?", id);
}
// Trophies, weekly points and the small capped reward (real opponents only, never between linked accounts)
async function arenaFinish(env, id, st, now) {
  const humans = st.players.filter((p) => !p.bot && p.uid);
  const nets = [];
  for (const p of humans) { const u = await one(env, "SELECT net FROM users WHERE uid = ?", p.uid); nets.push(u && u.net); }
  const linked = new Set(nets.filter(Boolean)).size < nets.filter(Boolean).length;
  const day = L.dayId(now), wid = L.weekId(now), out = [];
  for (const p of humans) {
    const d = AR.trophyDelta(st, p.slot, humans.length);
    const win = st.winnerTeam === p.team, draw = st.winnerTeam === null;
    const cur = await arenaStats(env, p.uid), t = Math.max(0, cur.trophies + d);
    await run(env, "INSERT INTO arena_stats (uid, trophies, wins, losses, draws, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET trophies = ?, wins = wins + ?, losses = losses + ?, draws = draws + ?, updated_at = ?",
      p.uid, t, win ? 1 : 0, !win && !draw ? 1 : 0, draw ? 1 : 0, now, t, win ? 1 : 0, !win && !draw ? 1 : 0, draw ? 1 : 0, now);
    let reward = 0;
    if (humans.length >= 2 && !linked && st.round >= ARENA_REWARD.MIN_ROUNDS) {
      await run(env, "INSERT OR IGNORE INTO arena_daily (uid, day, n) VALUES (?, ?, 0)", p.uid, day);
      const g = await run(env, "UPDATE arena_daily SET n = n + 1 WHERE uid = ? AND day = ? AND n < ?", p.uid, day, ARENA_REWARD.DAILY);
      if (g.meta.changes) { reward = win ? ARENA_REWARD.WIN : ARENA_REWARD.OTHER; await creditPoints(env, p.uid, "dates", reward, now, "arena"); }
      if (d > 0) await run(env, "INSERT INTO arena_week (week_id, uid, pts, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(week_id, uid) DO UPDATE SET pts = pts + excluded.pts, updated_at = excluded.updated_at", wid, p.uid, d, now);
    }
    out.push({ slot: p.slot, uid: p.uid, d: t - cur.trophies, reward, trophies: t }); // d = the real change (never below 0 trophies)
  }
  await run(env, "UPDATE arena_matches SET result = ? WHERE id = ?", JSON.stringify(out), id);
}
// Forms matches from the queue: nearest trophies first; after 15 s waiting, bots fill the empty seats
async function arenaMatchmake(env, mode, now) {
  const M = AR.MODES[mode];
  if (!M) return null;
  await run(env, "DELETE FROM arena_queue WHERE at < ?", now - 120000);
  const rows = await all(env, "SELECT * FROM arena_queue WHERE mode = ? ORDER BY at ASC LIMIT 60", mode);
  if (!rows.length) return null;
  const anchor = rows[0];
  const others = rows.slice(1).sort((a, b) => Math.abs(a.trophies - anchor.trophies) - Math.abs(b.trophies - anchor.trophies));
  let pick = [anchor, ...others.slice(0, M.n - 1)];
  if (pick.length < M.n) { if (now - anchor.at < ARENA_REWARD.QUEUE_BOT_MS) return null; pick = [anchor]; }
  // claim the players: if somebody else took one of them first, give up (the next call retries)
  const claimed = [];
  for (const q of pick) { const r = await run(env, "DELETE FROM arena_queue WHERE uid = ?", q.uid); if (r.meta.changes) claimed.push(q); }
  if (claimed.length !== pick.length) { for (const q of claimed) await run(env, "INSERT OR REPLACE INTO arena_queue (uid, mode, trophies, at) VALUES (?, ?, ?, ?)", q.uid, q.mode, q.trophies, q.at); return null; }
  const humans = [];
  for (const q of claimed.sort((a, b) => b.trophies - a.trophies)) { const u = await one(env, "SELECT username FROM users WHERE uid = ?", q.uid); humans.push({ uid: q.uid, name: u ? u.username : "player" }); }
  // 2v2: the strongest and the weakest together against the two in the middle
  let seats = humans;
  if (mode === "2v2" && humans.length === 4) seats = [humans[0], humans[3], humans[1], humans[2]];
  const bots = arenaBots(M.n - humans.length, []);
  return arenaCreate(env, mode, [...seats, ...bots]);
}
// What a player or a spectator sees. Secret moves of the round in progress are never included.
async function arenaView(env, m, uid, now) {
  const st = m.state ? JSON.parse(m.state) : null;
  const rows = await all(env, "SELECT slot, uid, name, bot FROM arena_players WHERE match_id = ? ORDER BY slot", m.id);
  const me = rows.find((r) => uid && r.uid === uid);
  let moved = {}, mine = null;
  if (st && m.status === "live") {
    for (const x of await all(env, "SELECT slot, act, target FROM arena_moves WHERE match_id = ? AND round = ?", m.id, st.round)) { moved[x.slot] = true; if (me && x.slot === me.slot) mine = { act: x.act, target: x.target }; }
  }
  const M = AR.MODES[m.mode];
  const players = st ? st.players.map((p) => ({ slot: p.slot, name: p.name, team: p.team, hp: p.hp, en: p.en, alive: p.alive, bot: p.bot, moved: !!moved[p.slot] || p.bot, forfeit: !!p.forfeit }))
    : M.teams.map((team, slot) => { const r = rows.find((x) => x.slot === slot); return { slot, team, name: r ? r.name : null, bot: r ? !!r.bot : false, hp: AR.HP, en: AR.EN_START, alive: true, moved: false }; });
  return {
    id: m.id, code: m.code, mode: m.mode, status: m.status, isHost: !!(uid && m.host === uid), ranked: !!m.ranked, now,
    round: st ? st.round : 0, max: AR.MAX_ROUNDS, deadline: m.round_at + AR.ROUND_MS, over: st ? st.over : false, winnerTeam: st ? st.winnerTeam : null,
    placements: st && st.over ? AR.placements(st) : null, log: st ? st.log.slice(-8) : [], players,
    me: me ? me.slot : null, mine, result: m.result ? JSON.parse(m.result) : null,
  };
}
// Last week's Arena: dates for the top 100 (half of the Oasis ranking's), once
async function grantArenaWeek(env) {
  await ensureSchema(env);
  const now = Date.now(), last = L.weekId(now - 7 * DAY);
  const g = await run(env, "INSERT OR IGNORE INTO arena_week_paid (week_id, at) VALUES (?, ?)", last, now);
  if (!g.meta.changes) return 0;
  const top = await all(env, "SELECT uid FROM arena_week WHERE week_id = ? AND pts > 0 ORDER BY pts DESC, updated_at ASC LIMIT 100", last);
  for (let i = 0; i < top.length; i++) await creditPoints(env, top[i].uid, "dates", Math.floor(L.WEEK100.dates(i + 1) / 2), now, "arenaweek");
  await notify(env, top.map((r, i) => ({ uid: r.uid, kind: "aweek", ref: last, vars: { p: i + 1, d: Math.floor(L.WEEK100.dates(i + 1) / 2).toLocaleString("en-US") } })));
  return top.length;
}

// ---------- Personal catalog helpers ----------
// Everything a player owns that belongs in the album: { id: { eds: [numbers], since: ms } }
async function catalogOwned(env, uid) {
  const out = {};
  const put = (id, ed, since) => { const o = (out[id] ||= { eds: [], since }); if (ed) o.eds.push(ed); o.since = Math.min(o.since, since); };
  for (const r of await all(env, `SELECT i.kind, i.edition, COALESCE((SELECT MAX(m.at) FROM nft_moves m WHERE m.item_id = i.id AND m.to_uid = i.owner), i.minted_at) AS since FROM nft_items i WHERE i.owner = ?`, uid)) put(r.kind, r.edition, r.since);
  for (const r of await all(env, "SELECT tier, ed, at FROM royal_cards WHERE uid = ?", uid)) put(r.tier, r.ed, r.at);
  const u = await one(env, "SELECT sup_lvl, sup_pi, sup_at FROM users WHERE uid = ?", uid);
  if (u) {
    for (const b of CAT.BADGES) if ((b.lvl && u.sup_lvl >= b.lvl) || (b.free && u.sup_pi > 0)) put(b.id, 0, 0);
    // a Founder (💎) also holds the lower badges; support of any amount holds the 🤍
  }
  for (const o of Object.values(out)) o.eds.sort((a, b) => a - b);
  return out;
}
const catalogClaims = async (env, uid) => (await all(env, "SELECT key FROM catalog_claims WHERE uid = ?", uid)).map((r) => r.key);
// Permanent Kombat profit from the catalog (claimed section goals + Master Collector)
const catalogBoost = async (env, uid) => CAT.boostOf(await catalogClaims(env, uid));
// Hourly: tell players once when a goal becomes claimable (items held long enough)
// A new manga chapter in the magazine feed: one notification per player per chapter (notif_log keeps it from repeating)
async function magNotify(env) {
  if (env.MAG_NOTIFY === "0" || !(env.MAG || env.MAG_URL)) return 0;
  await ensureSchema(env);
  const r = env.MAG ? await env.MAG.fetch("https://magazine/feed.json") : await fetch(env.MAG_URL + "/feed.json");
  if (!r || !r.ok) return 0;
  const feed = await r.json();
  let last = null;
  for (const s of feed.manga || []) for (const c of s.chapters || []) { const k = (c.date || "") + "|" + s.id + "|" + String(c.n).padStart(3, "0"); if (!last || k > last.k) last = { k, s, c }; }
  if (!last || !last.c.date || Date.now() - Date.parse(last.c.date + "T00:00:00Z") > 3 * DAY) return 0; // only fresh chapters (the first run must not announce old ones)
  const users = await all(env, "SELECT uid FROM users LIMIT 5000");
  return notify(env, users.map((u) => ({ uid: u.uid, kind: "mangaNew", ref: last.s.id + "-" + last.c.n, vars: { t: last.c.title, s: last.s.title } })));
}

async function catalogNotify(env) {
  await ensureSchema(env);
  const now = Date.now();
  const owners = await all(env, "SELECT DISTINCT owner AS uid FROM nft_items UNION SELECT DISTINCT uid FROM royal_cards LIMIT 500");
  const items = [];
  for (const o of owners) {
    const p = CAT.progressOf(await catalogOwned(env, o.uid), now, await catalogClaims(env, o.uid));
    for (const g of p.goals) if (g.reached && !g.claimed) items.push({ uid: o.uid, kind: "catgoal", ref: g.key, vars: {} });
  }
  return notify(env, items);
}

// ---------- Tasks center helpers ----------
const Q = {
  KINDS: ["checkin", "link", "secret", "ads", "arcade", "invite", "spin"],
  PERIODS: ["daily", "weekly", "once"],
  REWARDS: { dates: 1e6, coins: 1e8, jry: 1e5, spins: 100 },
  LINK_WAIT: 15000, // a link task can be claimed 15 s after it was opened
  // Ready-made tasks the owner can add with one tap ("@" titles are translated in the app)
  STARTER: [
    { title: "@q.s.checkin", emoji: "🗓️", kind: "checkin", period: "daily", goal: 1, reward_kind: "dates", reward: 50, sort: 1 },
    { title: "@q.s.ads", emoji: "📺", kind: "ads", period: "daily", goal: 3, reward_kind: "dates", reward: 150, sort: 2 },
    { title: "@q.s.arcade", emoji: "🕹️", kind: "arcade", period: "daily", goal: 2, reward_kind: "dates", reward: 80, sort: 3 },
    { title: "@q.s.spin", emoji: "🎡", kind: "spin", period: "daily", goal: 1, reward_kind: "dates", reward: 30, sort: 4 },
    { title: "@q.s.weekAds", emoji: "🎬", kind: "ads", period: "weekly", goal: 25, reward_kind: "spins", reward: 3, sort: 10 },
    { title: "@q.s.weekArcade", emoji: "🏅", kind: "arcade", period: "weekly", goal: 10, reward_kind: "coins", reward: 50000, sort: 11 },
    { title: "@q.s.invite1", emoji: "🤝", kind: "invite", period: "once", goal: 1, reward_kind: "dates", reward: 500, sort: 20 },
    { title: "@q.s.invite5", emoji: "👥", kind: "invite", period: "once", goal: 5, reward_kind: "jry", reward: 500, sort: 21 },
  ],
};
// Which period a reward belongs to: the day, the week (Monday), or forever
const questStart = (q, now) => (q.period === "daily" ? L.dayId(now) * 86400000 : q.period === "weekly" ? L.weekId(now) : q.created_at);
const questKey = (q, now) => (q.period === "daily" ? L.dayId(now) : q.period === "weekly" ? L.weekId(now) : 0);
async function questView(env, u, q, now) {
  const from = questStart(q, now);
  const done = !!(await one(env, "SELECT 1 AS x FROM quest_done WHERE quest_id = ? AND uid = ? AND pkey = ?", q.id, u.uid, questKey(q, now)));
  let progress = null, need = null, opened = false, wait = 0;
  if (q.kind === "ads") { need = q.goal; progress = (await one(env, "SELECT COUNT(*) AS n FROM ads WHERE uid = ? AND created_at >= ?", u.uid, from)).n; }
  else if (q.kind === "arcade") { need = q.goal; progress = (await one(env, "SELECT COALESCE(SUM(plays), 0) AS n FROM arcade WHERE uid = ? AND day >= ?", u.uid, L.dayId(from))).n; }
  else if (q.kind === "invite") {
    // invites count from the start of the period (all time for a one-time task)
    need = q.goal;
    progress = (await one(env, q.period === "once" ? "SELECT COUNT(*) AS n FROM users WHERE referrer = ?" : "SELECT COUNT(*) AS n FROM users WHERE referrer = ? AND created_at >= ?", u.uid, ...(q.period === "once" ? [] : [from]))).n;
  } else if (q.kind === "spin") { need = 1; progress = (u.wheel_day ?? -1) === L.dayId(now) ? 1 : 0; }
  else if (q.kind === "link") {
    const o = await one(env, "SELECT at FROM quest_open WHERE quest_id = ? AND uid = ?", q.id, u.uid);
    if (o) { opened = true; wait = Math.max(0, o.at + Q.LINK_WAIT - now); }
  }
  if (progress != null) progress = Math.min(progress, need);
  return { id: q.id, title: q.title, descr: q.descr || "", emoji: q.emoji, kind: q.kind, period: q.period, link: q.link || "",
    reward_kind: q.reward_kind, reward: q.reward, ends_at: q.ends_at, done, progress, need, opened, wait };
}
function questInput(b, now) {
  const kind = Q.KINDS.includes(b.kind) ? b.kind : bad("badAction");
  const period = Q.PERIODS.includes(b.period) ? b.period : bad("badAction");
  if (kind === "spin" && period !== "daily") bad("q.spinDaily");
  const reward_kind = Q.REWARDS[b.reward_kind] ? b.reward_kind : bad("badAction");
  const reward = Math.floor(Number(b.reward));
  if (!(reward > 0 && reward <= Q.REWARDS[reward_kind])) bad("badAction");
  const title = String(b.title || "").trim().slice(0, 80);
  if (title.length < 2) bad("q.noTitle");
  const link = String(b.link || "").trim().slice(0, 300);
  if (kind === "link" && !/^(https:\/\/|pi:\/\/)\S+$/i.test(link)) bad("q.badLink");
  const secret = String(b.secret || "").trim().slice(0, 40);
  if (kind === "secret" && !secret) bad("q.noSecret");
  const goal = ["ads", "arcade", "invite"].includes(kind) ? Math.min(1000, Math.max(1, Math.floor(Number(b.goal)) || 1)) : 1;
  const days = Number(b.days) || 0;
  return { title, descr: String(b.descr || "").trim().slice(0, 200), emoji: [...String(b.emoji || "🎯").trim()].slice(0, 2).join("") || "🎯",
    kind, period, link: kind === "link" ? link : null, secret: kind === "secret" ? secret : null, goal, reward_kind, reward,
    sort: Math.floor(Number(b.sort)) || 0, ends_at: days > 0 ? now + days * 86400000 : null };
}
// Gives an in-game reward: dates, Kombat coins, JRY or wheel spins

// Chat room name from what the app sends: "main", or "dm:<username>" -> "dm:<uidA>:<uidB>" (sorted ids)
async function chatRoom(env, u, raw) {
  raw = String(raw || "main");
  if (raw === "main") return "main";
  if (!raw.startsWith("dm:")) bad("badAction");
  const o = await one(env, "SELECT uid FROM users WHERE username = ? COLLATE NOCASE", raw.slice(3));
  if (!o || o.uid === u.uid) bad("chat.noUser");
  return "dm:" + [u.uid, o.uid].sort().join(":");
}
async function chatClean(env) {
  const now = Date.now();
  await run(env, "DELETE FROM sessions WHERE created_at < ?", now - 31 * DAY).catch(() => {}); // sessions older than their 30 days are never used again
  await run(env, "DELETE FROM chat_msgs WHERE (room = 'main' AND at < ?) OR (room != 'main' AND at < ?)", now - 7 * DAY, now - 30 * DAY);
}
async function giveReward(env, uid, kind, n, now, src) {
  if (kind === "dates" || kind === "coins") return creditPoints(env, uid, kind, n, now, src);
  if (kind === "jry") return run(env, "UPDATE users SET jry_pts = COALESCE(jry_pts, 0) + ? WHERE uid = ?", n, uid);
  if (kind === "vipclub") return addVipcDays(env, uid, n, now);
  if (kind === "spins") return run(env, "UPDATE users SET wheel_spins = COALESCE(wheel_spins, 0) + ? WHERE uid = ?", n, uid);
}
async function creditPoints(env, uid, kind, n, now, src) {
  if (kind === "coins") return run(env, "INSERT INTO nft_credits (uid, amount, at, src) VALUES (?, ?, ?, ?)", uid, n, now, src);
  if (!(await one(env, "SELECT 1 AS x FROM state WHERE uid = ?", uid))) await saveState(env, uid, L.fresh(now), now);
  return run(env, "UPDATE state SET ver = ver + 1, json = json_set(json, '$.dates', json_extract(json, '$.dates') + ?) WHERE uid = ?", n, uid);
}
async function mkReserve(env, u, item, payId, now) {
  const o = await one(env, "SELECT * FROM mk_offers WHERE id = ?", item.mk);
  if (!o || o.status === "sold" || o.status === "cancelled") bad("mk.gone");
  if (o.uid === u.uid) bad("mk.own");
  if (Math.abs(o.pi - item.price) > 1e-7) bad("badPayment");
  let r = await run(env, "UPDATE mk_offers SET status = 'reserved', buyer = ?, pay_id = ?, reserved_at = ?, updated_at = ? WHERE id = ? AND (status = 'open' OR (status = 'reserved' AND pay_id = ?))",
    u.uid, payId, now, now, o.id, payId);
  if (r.meta.changes) return;
  // Held by a buyer who never sent the Pi: free it after HOLD_MS
  if (o.status === "reserved" && now - o.reserved_at > MK.HOLD_MS) {
    let stale = true;
    try { const { p } = await findPayment(env, o.pay_id); stale = !p.transaction; } catch (e) {}
    if (stale) {
      r = await run(env, "UPDATE mk_offers SET buyer = ?, pay_id = ?, reserved_at = ?, updated_at = ? WHERE id = ? AND status = 'reserved' AND pay_id = ?", u.uid, payId, now, now, o.id, o.pay_id);
      if (r.meta.changes) return;
    }
  }
  bad("mk.taken");
}
// The buyer's Pi arrived in the app wallet: points to the buyer, Pi minus the tax to the seller's
// sales balance. If the offer went to someone else meanwhile, the buyer gets the Pi back.
async function mkSettle(env, item, payId, buyerUid, now) {
  const o = await one(env, "SELECT * FROM mk_offers WHERE id = ?", item.mk);
  const won = o ? await run(env, "UPDATE mk_offers SET status = 'sold', updated_at = ? WHERE id = ? AND status = 'reserved' AND pay_id = ?", now, o.id, payId) : { meta: { changes: 0 } };
  if (!won.meta.changes) {
    await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis market refund', 'new', ?, ?)",
      crypto.randomUUID(), payId, buyerUid, item.price, now, now);
    return runPayouts(env).catch((e) => logError(env, "mk refund", 0, e.message));
  }
  const isCard = o.kind === "card";
  if (isCard) {
    // the card changes hands with its number and signature; it is only given if the seller still owns it
    const mv = await run(env, "UPDATE royal_cards SET uid = ? WHERE id = ? AND uid = ?", buyerUid, o.amount, o.uid);
    if (!mv.meta.changes) {
      await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis card refund', 'new', ?, ?)", crypto.randomUUID(), payId, buyerUid, item.price, now, now);
      return runPayouts(env).catch((e) => logError(env, "card refund", 0, e.message));
    }
  } else await creditPoints(env, buyerUid, o.kind, o.amount, now, "market");
  const tax = round(o.pi * (isCard ? L.ROYAL.RESALE_TAX : MK.TAX));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET mk_balance = ROUND(COALESCE(mk_balance, 0) + ?, 7) WHERE uid = ?").bind(round(o.pi - tax), o.uid),
    // part of the tax feeds the weekly prize pool
    env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(L.weekId(now), round(tax * PRIZE_RATE)),
  ]);
  await notify(env, [{ uid: o.uid, kind: "sold", ref: o.id, vars: { pi: round(o.pi - tax) } }]);
}

// ---------- Players' testJRY market ----------
const P2P = KL.P2P;
const jryAmount = (x) => {
  // testJRY amount as a 7-decimal string, or null
  const n = Number(x);
  if (!Number.isFinite(n) || n < P2P.MIN_JRY || n > P2P.MAX_JRY) return null;
  return (Math.floor(n * 1e7) / 1e7).toFixed(7);
};
async function p2pNeedWallet(env, u) {
  if (!isTestnet(env)) bad("k.tokenOff");
  if (!u.jry_wallet) bad("k.needWallet");
}
// A testJRY payment on the Pi Testnet between `from` and `to` of exactly `jry`, made after `since`
// and not used yet by another offer (the transaction hash is stored once).
async function findJryPayment(env, t, from, to, jry, since) {
  const want = toStroops(jry);
  const page = await horizonGet(`/accounts/${t.dist}/payments?order=desc&limit=200`);
  const recs = (page && page._embedded && page._embedded.records) || [];
  for (const r of recs) {
    if (r.type !== "payment" || r.from !== from || r.to !== to) continue;
    if (r.asset_code !== t.code || r.asset_issuer !== t.issuer) continue;
    if (r.transaction_successful === false) continue;
    if (Date.parse(r.created_at) < since - 5 * 60000) continue;
    try { if (toStroops(r.amount) !== want) continue; } catch (e) { continue; }
    const used = await one(env, "SELECT id FROM p2p_offers WHERE deposit_tx = ? OR return_tx = ?", r.transaction_hash, r.transaction_hash);
    if (used) continue;
    return r.transaction_hash;
  }
  return null;
}
// What testJRY is worth in dates / Kombat coins (paying with testJRY gives REDEEM_BONUS more)
function redeemValue(jry, price, reward) {
  const pi = Number(jry) * price;
  const perPi = reward === "coins" ? KL.COINS_PER_PI : L.PACKS[1].dates / L.PACKS[1].price;
  return { pi, got: Math.floor(pi * perPi * (1 + P2P.REDEEM_BONUS)) };
}
const offerView = (o, names) => ({
  id: o.id, kind: o.kind, jry: o.jry, pi: o.pi, unit: Number(o.jry) > 0 ? o.pi / Number(o.jry) : 0, reward: o.reward, got: o.got,
  status: o.status === "reserved" ? "reserved" : o.status, seller: names ? names[o.uid] : undefined, error: o.error || undefined, at: o.created_at,
});
// Approving a buyer's payment: hold the offer for this payment (one buyer at a time)
async function reserveOffer(env, u, item, payId, now) {
  if (!isTestnet(env)) bad("badPayment");
  if (!u.jry_wallet) bad("k.needWallet");
  if (!(await jryStatusOf(env, u.jry_wallet)).trust) bad("k.noTrust");
  const o = await one(env, "SELECT * FROM p2p_offers WHERE id = ? AND kind = 'sell'", item.p2p);
  if (!o) bad("p2p.gone");
  if (o.uid === u.uid) bad("p2p.own");
  if (Math.abs(o.pi - item.price) > 1e-7) bad("badPayment");
  let r = await run(env, "UPDATE p2p_offers SET status = 'reserved', buyer = ?, pay_id = ?, reserved_at = ?, updated_at = ? WHERE id = ? AND (status = 'open' OR (status = 'reserved' AND pay_id = ?))",
    u.uid, payId, now, now, o.id, payId);
  if (r.meta.changes) return;
  // Held by another buyer who never sent the Pi: free it after HOLD_MS
  if (o.status === "reserved" && now - o.reserved_at > P2P.HOLD_MS) {
    let stale = true;
    try { const { p } = await findPayment(env, o.pay_id); stale = !p.transaction; } catch (e) {}
    if (stale) {
      r = await run(env, "UPDATE p2p_offers SET buyer = ?, pay_id = ?, reserved_at = ?, updated_at = ? WHERE id = ? AND status = 'reserved' AND pay_id = ?", u.uid, payId, now, now, o.id, o.pay_id);
      if (r.meta.changes) return;
    }
  }
  bad("p2p.taken");
}
// The buyer's Pi arrived: tokens to the buyer, Pi (minus the fee) to the seller.
// If the offer went to someone else meanwhile, the buyer gets the Pi back.
async function settleOffer(env, item, payId, buyerUid, now) {
  const o = await one(env, "SELECT * FROM p2p_offers WHERE id = ?", item.p2p);
  const buyer = await one(env, "SELECT * FROM users WHERE uid = ?", buyerUid);
  const won = o && buyer ? await run(env, "UPDATE p2p_offers SET status = 'sold', updated_at = ? WHERE id = ? AND status = 'reserved' AND pay_id = ?", now, o.id, payId) : { meta: { changes: 0 } };
  if (!won.meta.changes) {
    await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'refund', ?, ?, ?, 'Pi Oasis testJRY market refund', 'new', ?, ?)",
      crypto.randomUUID(), payId, buyerUid, item.price, now, now);
  } else {
    await run(env, "INSERT OR IGNORE INTO jry_buys (id, uid, address, pi, jry, status, at) VALUES (?, ?, ?, ?, ?, 'owed', ?)", payId, buyerUid, buyer.jry_wallet || "", item.price, o.jry, now);
    await run(env, "INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'p2p', ?, ?, ?, ?, 'new', ?, ?)",
      crypto.randomUUID(), String(o.id), o.uid, round(o.pi * (1 - P2P.FEE)), `Pi Oasis testJRY sale #${o.id}`, now, now);
    await deliverJry(env, payId);
  }
  await runPayouts(env).catch((e) => logError(env, "p2p payout", 0, e.message));
}

// testJRY market numbers from the Test-Pi pool (cached for a minute)
async function jryMarket(env) {
  const seed = await jryIssuerSeed(env, false);
  if (!seed) return { on: false };
  const now = Date.now();
  if (!marketCache || now - marketCache.at > 60000) {
    const code = env.JRY_CODE || "testJRY", issuer = await publicKeyOf(seed);
    const [pools, asset] = await Promise.all([
      horizonGet(`/liquidity_pools?reserves=native,${code}:${issuer}&limit=10`),
      horizonGet(`/assets?asset_code=${code}&asset_issuer=${issuer}`),
    ]);
    const list = (pools && pools._embedded && pools._embedded.records) || [];
    let pi = 0, jry = 0;
    for (const p of list) {
      const r = p.reserves || [];
      const a = Number((r.find((x) => x.asset === "native") || {}).amount || 0);
      const b = Number((r.find((x) => x.asset !== "native") || {}).amount || 0);
      if (a > pi) { pi = a; jry = b; }
    }
    const rec = asset && asset._embedded && asset._embedded.records[0];
    const holders = rec ? Number(rec.num_accounts ?? (rec.accounts && rec.accounts.authorized) ?? 0) : 0;
    marketCache = { at: now, data: { on: true, code, issuer, poolPi: pi, poolJry: jry, price: jry > 0 ? pi / jry : 0, holders, pools: list.length, packs: KL.JRY_PACKS } };
  }
  return marketCache.data;
}

// Sends a testJRY store order that isn't delivered yet (never twice)
async function deliverJry(env, id) {
  const b = await one(env, "SELECT * FROM jry_buys WHERE id = ?", id);
  if (!b || b.status === "sent") return b;
  try {
    const t = await jryConfig(env);
    const txid = await jrySend(env, t, b.address, b.jry);
    await run(env, "UPDATE jry_buys SET status = 'sent', txid = ?, error = NULL WHERE id = ? AND status != 'sent'", txid, id);
  } catch (e) {
    await run(env, "UPDATE jry_buys SET error = ? WHERE id = ?", String(e.message || e.code).slice(0, 200), id);
    await logError(env, "testJRY delivery", 0, String(e.message || e.code));
  }
  return one(env, "SELECT * FROM jry_buys WHERE id = ?", id);
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

// Tribes ranked by their members' Kombat coins earned in a week
async function tribeRanking(env, wid, limit) {
  return all(env, `SELECT t.id, t.name, t.emoji, COUNT(tm.uid) AS members, COALESCE(SUM(w.earned), 0) AS score
    FROM tribes t JOIN tribe_members tm ON tm.tribe_id = t.id LEFT JOIN kombat_weeks w ON w.uid = tm.uid AND w.week_id = ?
    GROUP BY t.id ORDER BY score DESC, t.id ASC LIMIT ?`, wid, limit);
}
// My tribe's place and prize for a finished week (members who joined before that week only)
async function tribePrize(env, uid, wid) {
  const m = await one(env, "SELECT tribe_id, joined_at FROM tribe_members WHERE uid = ?", uid);
  if (!m || m.joined_at >= wid) return null;
  const top = await tribeRanking(env, wid, KL.TRIBE.PRIZES.length);
  const i = top.findIndex((x) => x.id === m.tribe_id && x.score > 0);
  if (i < 0) return null;
  const c = await one(env, "SELECT 1 AS x FROM tribe_claims WHERE week_id = ? AND uid = ?", wid, uid);
  return { place: i + 1, prize: KL.TRIBE.PRIZES[i], claimed: !!c, name: top[i].name, emoji: top[i].emoji };
}

// Profit bonus from the collectible designs a player owns
async function nftBoost(env, uid) {
  const rows = await all(env, "SELECT DISTINCT kind FROM nft_items WHERE owner = ?", uid);
  return KL.nftBoostOf(rows.map((r) => r.kind));
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
    if (env.TESTNET_CLOSED === "1") return; // the Testnet game is closed: no hourly work on the shared database
    ctx.waitUntil(
      grantWeeklyCamels(env)
        .catch((e) => logError(env, "weekly camels", 0, e.message))
        .then(() => grantDerbyWeek(env))
        .then(() => grantMergeWeek(env))
        .then(() => grantCastleWeek(env))
        .then(() => grantSeasonPrizes(env))
        .then(() => grantArenaWeek(env))
        .then(() => arenaSweep(env))
        .then(() => catalogNotify(env))
        .then(() => chatClean(env))
        .then(() => magNotify(env))
        .catch((e) => logError(env, "derby week", 0, e.message))
        .then(() => royalFinalPrizes(env))
        .then(() => courtCron(env, courtNow(env)))
        .then(() => kombatWeekNotes(env))
        .then(() => dailyReminder(env))
        .catch((e) => logError(env, "notifications", 0, e.message))
        .then(() => runPayouts(env))
        .catch((e) => logError(env, "payouts run", 0, e.message))
    );
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (/^pi-oasis\.|^oasisgame6033\./.test(url.hostname)) {
      testnetHost = true;
      // The Testnet address always runs with the Testnet app's settings, whatever the dashboard
      // variables say (they once held the Mainnet link and key, which sent invites to Mainnet).
      env = Object.assign(Object.create(env), TESTNET_VARS);
    }
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
    // The Testnet game is closed (the real game runs on Mainnet): signing in still works so players see
    // the notice, but nothing can be played, bought or changed. Progress is read by the Mainnet game directly.
    if (/^pi-oasis\.|^oasisgame6033\./.test(url.hostname)) return json({ error: "testnetClosed" }, 403);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json({ error: "notFound" }, 404);
    if ((url.pathname === "/api/auth" && rateLimited(env, req, "auth", 30)) || (url.pathname.startsWith("/api/payments/") && rateLimited(env, req, "pay", 60))) return json({ error: "busy" }, 429);
    try {
      await ensureSchema(env);
      let body = {};
      if (req.method === "POST") {
        const text = await req.text();
        if (text.length > 50000) bad("badAction");
        if (text) body = JSON.parse(text);
      }
      let out;
      for (let attempt = 0; ; attempt++) {
        try { out = await handler(req, env, body); break; }
        catch (e) { if (e instanceof StateConflict && req.method === "GET" && attempt < 3) continue; throw e; } // reading never fails because of a parallel save
      }
      return out instanceof Response ? out : json(out);
    } catch (e) {
      if (e instanceof HttpError) {
        if (url.pathname.startsWith("/api/payments/") || url.pathname === "/api/auth") {
          await logError(env, `refused ${req.method} ${url.pathname}`, e.status, e.info ? `${e.code} ${e.info}` : e.code);
        }
        return json(e.vars ? { error: e.code, vars: e.vars } : { error: e.code }, e.status);
      }
      if (e instanceof StateConflict) return json({ error: "busy" }, 503);
      if (e instanceof SyntaxError) return json({ error: "badAction" }, 400);
      if (/exceeded|row read limit|D1_ERROR.*limit|too many requests/i.test((e && e.message) || "")) return json({ error: "busy" }, 503);
      console.error(e && e.stack);
      await logError(env, `${req.method} ${url.pathname}`, 500, (e && e.message) || "error");
      return json({ error: "server" }, 500);
    }
  },
};
