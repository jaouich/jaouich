-- Pi Oasis database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  referrer TEXT,
  vip_until INTEGER NOT NULL DEFAULT 0,
  ref_balance REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_referrer ON users(referrer);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS state (
  uid TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  week_id INTEGER NOT NULL,
  week_score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS state_week ON state(week_id, week_score DESC);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  txid TEXT,
  referrer_uid TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS weeks (
  id INTEGER PRIMARY KEY,
  prize_pool REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  username TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
