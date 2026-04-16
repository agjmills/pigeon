-- Add cached AI summary and unread flag to conversations
ALTER TABLE conversations ADD COLUMN ai_summary TEXT;
ALTER TABLE conversations ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;

-- Recreate messages table to allow 'note' direction
CREATE TABLE messages_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  direction       TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound', 'note')),
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

INSERT INTO messages_new SELECT * FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_message_id ON messages(message_id);

-- Index for unread count queries
CREATE INDEX idx_conversations_unread ON conversations(unread, mailbox_email);
