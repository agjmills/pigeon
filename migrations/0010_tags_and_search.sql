-- Tags
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'gray',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE conversation_tags (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX idx_conversation_tags_tag ON conversation_tags(tag_id);
CREATE INDEX idx_conversation_tags_conv ON conversation_tags(conversation_id);

-- Full-text search
CREATE VIRTUAL TABLE conversations_fts USING fts5(
  subject,
  customer_email,
  customer_name,
  content='conversations',
  content_rowid='id'
);

CREATE VIRTUAL TABLE messages_fts USING fts5(
  body_text,
  from_email,
  from_name,
  content='messages',
  content_rowid='id'
);

-- Populate FTS with existing data
INSERT INTO conversations_fts(rowid, subject, customer_email, customer_name)
  SELECT id, subject, customer_email, COALESCE(customer_name, '') FROM conversations;

INSERT INTO messages_fts(rowid, body_text, from_email, from_name)
  SELECT id, COALESCE(body_text, ''), from_email, COALESCE(from_name, '') FROM messages;

-- Triggers to keep FTS in sync
CREATE TRIGGER conversations_ai AFTER INSERT ON conversations BEGIN
  INSERT INTO conversations_fts(rowid, subject, customer_email, customer_name)
    VALUES (new.id, new.subject, new.customer_email, COALESCE(new.customer_name, ''));
END;

CREATE TRIGGER conversations_ad AFTER DELETE ON conversations BEGIN
  INSERT INTO conversations_fts(conversations_fts, rowid, subject, customer_email, customer_name)
    VALUES ('delete', old.id, old.subject, old.customer_email, COALESCE(old.customer_name, ''));
END;

CREATE TRIGGER conversations_au AFTER UPDATE ON conversations BEGIN
  INSERT INTO conversations_fts(conversations_fts, rowid, subject, customer_email, customer_name)
    VALUES ('delete', old.id, old.subject, old.customer_email, COALESCE(old.customer_name, ''));
  INSERT INTO conversations_fts(rowid, subject, customer_email, customer_name)
    VALUES (new.id, new.subject, new.customer_email, COALESCE(new.customer_name, ''));
END;

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, body_text, from_email, from_name)
    VALUES (new.id, COALESCE(new.body_text, ''), new.from_email, COALESCE(new.from_name, ''));
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body_text, from_email, from_name)
    VALUES ('delete', old.id, COALESCE(old.body_text, ''), old.from_email, COALESCE(old.from_name, ''));
END;
