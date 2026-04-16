CREATE TABLE domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  cf_zone_id TEXT,
  resend_domain_id TEXT,
  resend_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Migrate existing unique domains from mailboxes
INSERT OR IGNORE INTO domains (domain, cf_zone_id)
SELECT DISTINCT
  SUBSTR(email, INSTR(email, '@') + 1) AS domain,
  cf_zone_id
FROM mailboxes;

-- Add domain_id to mailboxes
ALTER TABLE mailboxes ADD COLUMN domain_id INTEGER REFERENCES domains(id);

-- Populate domain_id from the domains we just created
UPDATE mailboxes SET domain_id = (
  SELECT d.id FROM domains d
  WHERE d.domain = SUBSTR(mailboxes.email, INSTR(mailboxes.email, '@') + 1)
);
