ALTER TABLE messages ADD COLUMN tracking_token TEXT;
ALTER TABLE messages ADD COLUMN opened_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tracking_token ON messages(tracking_token);
