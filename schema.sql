-- Magiscom CRM : base de données (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,              -- e-mail ou identifiant
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'commercial', -- admin | commercial
  perms TEXT NOT NULL DEFAULT '{}',        -- {"scope":"own|all","export":0|1,"edit_all":0|1}
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_end INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'prospect',   -- client | prospect
  contact TEXT, phone TEXT, phone2 TEXT, email TEXT,
  company TEXT, website TEXT,                -- société, site web
  city TEXT, address TEXT, sector TEXT, ice TEXT, notes TEXT,
  lat REAL, lng REAL, geo_acc REAL, geo_at INTEGER, geo_by TEXT,
  owner_id TEXT,                           -- commercial responsable
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_upd ON clients(updated_at);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'visite',     -- visite | rdv | appel | note | vocal | reunion
  status TEXT NOT NULL DEFAULT 'done',     -- planned | done | cancelled
  date INTEGER NOT NULL,                   -- date de la visite ou du rendez-vous
  agreed TEXT, not_done TEXT, demands TEXT, next_step TEXT,
  next_date INTEGER,
  summary TEXT,                            -- note écrite, ou résumé de la réunion
  transcript TEXT,                         -- texte issu de l'audio (réunion : « Commercial : … / Client : … »)
  ai_status TEXT,                          -- pending | done | error (transcription / rapport IA)
  ai_error TEXT,
  lang TEXT,                               -- langue parlée : fr | ar | (vide = automatique)
  duration INTEGER,                        -- durée de l'enregistrement (secondes)
  lat REAL, lng REAL, geo_acc REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id);
CREATE INDEX IF NOT EXISTS idx_visits_user_date ON visits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_visits_upd ON visits(updated_at);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  visit_id TEXT,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'document', -- photo | video | document | devis | audio
  note TEXT,
  seq INTEGER,                             -- ordre des morceaux d'un enregistrement
  transcript TEXT,                         -- texte reconnu dans ce morceau d'audio
  dialogue TEXT,                           -- JSON [{s:'Commercial'|'Client', t:'…'}] (réunion)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_files_client ON files(client_id);
CREATE INDEX IF NOT EXISTS idx_files_upd ON files(updated_at);

CREATE TABLE IF NOT EXISTS uploads_mp (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, visit_id TEXT,
  r2_key TEXT NOT NULL, upload_id TEXT NOT NULL, mime TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
