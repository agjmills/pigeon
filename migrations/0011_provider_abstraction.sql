ALTER TABLE domains RENAME COLUMN resend_domain_id TO provider_domain_id;
ALTER TABLE domains RENAME COLUMN resend_verified TO provider_verified;
