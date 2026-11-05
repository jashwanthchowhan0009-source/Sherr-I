-- Sherr I schema (Cloudflare D1 / SQLite)
-- Timestamps are ISO-8601 UTC strings (Date.toISOString()), so text comparison = time comparison.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,          -- digits only, with country code
  name            TEXT,
  language        TEXT NOT NULL DEFAULT 'hinglish',
  last_inbound_at TEXT,                          -- for WhatsApp 24h service window
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  relation        TEXT,
  phone           TEXT NOT NULL,
  language        TEXT NOT NULL DEFAULT 'english',
  opted_in        INTEGER NOT NULL DEFAULT 0,    -- 1 after they message Sherr I once
  last_inbound_at TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (owner_id, phone)
);
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone);

CREATE TABLE IF NOT EXISTS reminders (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id       TEXT REFERENCES contacts(id) ON DELETE CASCADE, -- NULL = for the owner
  message          TEXT NOT NULL,                -- sent as-is, in the recipient's language
  summary          TEXT NOT NULL,                -- short owner-facing description
  next_run_at      TEXT NOT NULL,
  repeat           TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  last_sent_at     TEXT,
  last_ack_at      TEXT,
  last_ack_text    TEXT,
  followup_sent_at TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (status, next_run_at);
CREATE INDEX IF NOT EXISTS reminders_contact_idx ON reminders (contact_id, last_sent_at);

-- Short chat history (context + webhook de-dup). Deleted after 30 days by the nightly cron.
CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body          TEXT NOT NULL,
  wa_message_id TEXT UNIQUE,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_phone_idx ON messages (phone, created_at);
