CREATE TABLE users (
  email TEXT PRIMARY KEY,
  name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_users_is_admin ON users(is_admin);

CREATE TABLE user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_email, resource_type, resource_id)
);

CREATE INDEX idx_user_permissions_user_email ON user_permissions(user_email);
CREATE INDEX idx_user_permissions_resource ON user_permissions(resource_type, resource_id);

DROP TABLE mailbox_permissions;
