ALTER TABLE domains ADD COLUMN cf_catchall_rule_id TEXT;
ALTER TABLE domains ADD COLUMN cf_dns_record_ids TEXT; -- JSON array of CF record IDs added for Resend
