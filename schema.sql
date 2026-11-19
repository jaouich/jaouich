-- MagisDesk : schéma D1 (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  company       TEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  title         TEXT,                          -- fonction affichée pour l'équipe (ex. Consultant)
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS tickets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'autre',
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_review','resolved','unresolved')),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_sender     TEXT NOT NULL DEFAULT 'user' CHECK (last_sender IN ('user','admin'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  message_id    TEXT REFERENCES messages(id) ON DELETE CASCADE,   -- NULL tant que le fichier n'est pas joint à un message
  ticket_id     TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_pending ON attachments(owner_id, created_at) WHERE message_id IS NULL;

CREATE TABLE IF NOT EXISTS status_history (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_ticket ON status_history(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);

-- Appels audio / vidéo en direct (WebRTC). Le serveur ne fait que transmettre l'offre et la réponse.
CREATE TABLE IF NOT EXISTS calls (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  caller_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caller_role TEXT NOT NULL CHECK (caller_role IN ('user','admin')),
  callee_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  video       INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended','missed','declined')),
  offer       TEXT,
  answer      TEXT,
  recording   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  answered_at INTEGER,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status, created_at);
CREATE INDEX IF NOT EXISTS idx_calls_ticket ON calls(ticket_id, created_at);
