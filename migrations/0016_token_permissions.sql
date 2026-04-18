ALTER TABLE api_tokens ADD COLUMN scoped INTEGER NOT NULL DEFAULT 0;

CREATE TABLE api_token_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  UNIQUE(token_id, resource_type, resource_id)
);
