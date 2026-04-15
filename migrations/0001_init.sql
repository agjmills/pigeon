CREATE TABLE IF NOT EXISTS mailboxes (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS conversations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_email  TEXT NOT NULL,
  subject        TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name  TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  last_message_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  direction       TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  from_email      TEXT NOT NULL,
  from_name       TEXT,
  to_email        TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_text       TEXT,
  body_html       TEXT,
  message_id      TEXT,
  in_reply_to     TEXT,
  raw_r2_key      TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_name  TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_conversations_mailbox  ON conversations(mailbox_email);
CREATE INDEX IF NOT EXISTS idx_conversations_status   ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_updated  ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation  ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id    ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires       ON sessions(expires_at);
