CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE customer_organizations (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (customer_id, organization_id)
);

CREATE INDEX idx_customer_organizations_org ON customer_organizations(organization_id);
CREATE INDEX idx_customer_organizations_cust ON customer_organizations(customer_id);
