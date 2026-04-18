import type { Conversation, Message, Mailbox, Domain, Customer, Organization, Tag, AuditAction, AuditEntry, User, UserPermission, PermissionLevel, ResourceType } from '../types'

// ── Domains ───────────────────────────────────────────────────────────────────

export async function getDomains(db: D1Database): Promise<Domain[]> {
  const { results } = await db.prepare('SELECT * FROM domains ORDER BY domain').all<Domain>()
  return results
}

export async function getDomainByName(db: D1Database, domain: string): Promise<Domain | null> {
  return db.prepare('SELECT * FROM domains WHERE domain = ?').bind(domain).first<Domain>()
}

export async function createDomain(db: D1Database, domain: string): Promise<number> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO domains (domain) VALUES (?)')
    .bind(domain)
    .run()
  if (result.meta.last_row_id) return result.meta.last_row_id as number
  const existing = await getDomainByName(db, domain)
  return existing!.id
}

export async function updateDomainCf(db: D1Database, id: number, zoneId: string): Promise<void> {
  await db.prepare('UPDATE domains SET cf_zone_id = ? WHERE id = ?').bind(zoneId, id).run()
}

export async function updateDomainProvider(db: D1Database, id: number, providerDomainId: string): Promise<void> {
  await db.prepare('UPDATE domains SET provider_domain_id = ? WHERE id = ?').bind(providerDomainId, id).run()
}

export async function updateDomainDnsRecordIds(db: D1Database, id: number, recordIds: string[]): Promise<void> {
  await db.prepare('UPDATE domains SET cf_dns_record_ids = ? WHERE id = ?').bind(JSON.stringify(recordIds), id).run()
}

export async function updateDomainProviderVerified(db: D1Database, id: number, verified: boolean): Promise<void> {
  await db.prepare('UPDATE domains SET provider_verified = ? WHERE id = ?').bind(verified ? 1 : 0, id).run()
}

export async function updateDomainCatchallMailbox(db: D1Database, id: number, email: string | null): Promise<void> {
  await db.prepare('UPDATE domains SET catchall_mailbox_email = ? WHERE id = ?').bind(email, id).run()
}

export async function updateDomainCatchallRule(db: D1Database, id: number, ruleId: string | null): Promise<void> {
  await db.prepare('UPDATE domains SET cf_catchall_rule_id = ? WHERE id = ?').bind(ruleId, id).run()
}

export async function getDomainById(db: D1Database, id: number): Promise<Domain | null> {
  return db.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Domain>()
}

export async function deleteDomain(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM domains WHERE id = ?').bind(id).run()
}

// ── Mailboxes ─────────────────────────────────────────────────────────────────

export async function getMailboxes(db: D1Database): Promise<Mailbox[]> {
  const { results } = await db.prepare('SELECT * FROM mailboxes ORDER BY name').all<Mailbox>()
  return results
}

export async function getMailbox(db: D1Database, email: string): Promise<Mailbox | null> {
  return db.prepare('SELECT * FROM mailboxes WHERE email = ?').bind(email).first<Mailbox>()
}

export async function getMailboxById(db: D1Database, id: number): Promise<Mailbox | null> {
  return db.prepare('SELECT * FROM mailboxes WHERE id = ?').bind(id).first<Mailbox>()
}

export async function getMailboxesByDomain(db: D1Database, domainId: number): Promise<Mailbox[]> {
  const { results } = await db
    .prepare('SELECT * FROM mailboxes WHERE domain_id = ? ORDER BY email')
    .bind(domainId)
    .all<Mailbox>()
  return results
}

export async function createMailbox(
  db: D1Database,
  data: { email: string; name: string; domain_id: number }
): Promise<number> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO mailboxes (email, name, domain_id) VALUES (?, ?, ?)')
    .bind(data.email, data.name, data.domain_id)
    .run()
  return result.meta.last_row_id as number
}

export async function updateMailboxName(db: D1Database, id: number, name: string): Promise<void> {
  await db.prepare('UPDATE mailboxes SET name = ? WHERE id = ?').bind(name, id).run()
}

export async function updateMailboxSenderName(db: D1Database, id: number, senderName: string | null): Promise<void> {
  await db.prepare('UPDATE mailboxes SET sender_name = ? WHERE id = ?').bind(senderName, id).run()
}

export async function updateMailboxCfRuleId(db: D1Database, id: number, ruleId: string): Promise<void> {
  await db.prepare('UPDATE mailboxes SET cf_rule_id = ? WHERE id = ?').bind(ruleId, id).run()
}

export async function deleteMailbox(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM mailboxes WHERE id = ?').bind(id).run()
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversations(
  db: D1Database,
  opts: { mailbox?: string; status?: string } = {}
): Promise<Conversation[]> {
  let query = `
    SELECT c.*, COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE 1=1
  `
  const bindings: string[] = []

  if (opts.mailbox) {
    query += ' AND c.mailbox_email = ?'
    bindings.push(opts.mailbox)
  }
  if (opts.status) {
    query += ' AND c.status = ?'
    bindings.push(opts.status)
  }

  query += ' GROUP BY c.id ORDER BY c.last_message_at DESC LIMIT 100'

  const stmt = db.prepare(query)
  const { results } = await stmt.bind(...bindings).all<Conversation>()
  return results
}

export async function getConversation(db: D1Database, id: number): Promise<Conversation | null> {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first<Conversation>()
}

export async function getMessages(db: D1Database, conversationId: number): Promise<Message[]> {
  const { results } = await db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .bind(conversationId)
    .all<Message>()
  return results
}

export async function getLastMessageId(db: D1Database, conversationId: number): Promise<string | null> {
  const msg = await db
    .prepare('SELECT message_id FROM messages WHERE conversation_id = ? AND message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1')
    .bind(conversationId)
    .first<{ message_id: string }>()
  return msg?.message_id ?? null
}

export async function findOpenConversationBySubject(
  db: D1Database,
  mailboxEmail: string,
  customerEmail: string,
  baseSubject: string
): Promise<Conversation | null> {
  return db
    .prepare(`
      SELECT * FROM conversations
      WHERE mailbox_email = ?
        AND customer_email = ?
        AND status = 'open'
        AND (subject = ? OR subject = ? OR subject LIKE ?)
      ORDER BY last_message_at DESC
      LIMIT 1
    `)
    .bind(
      mailboxEmail,
      customerEmail,
      baseSubject,
      `Re: ${baseSubject}`,
      `Re:%${baseSubject}`
    )
    .first<Conversation>()
}

export async function findConversationByMessageId(
  db: D1Database,
  messageId: string
): Promise<Conversation | null> {
  return db
    .prepare('SELECT c.* FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.message_id = ?')
    .bind(messageId)
    .first<Conversation>()
}

export async function createConversation(
  db: D1Database,
  data: {
    mailbox_email: string
    subject: string
    customer_email: string
    customer_name?: string | null
  }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO conversations (mailbox_email, subject, customer_email, customer_name)
      VALUES (?, ?, ?, ?)
    `)
    .bind(data.mailbox_email, data.subject, data.customer_email, data.customer_name ?? null)
    .run()
  return result.meta.last_row_id as number
}

export async function createMessage(
  db: D1Database,
  data: {
    conversation_id: number
    direction: 'inbound' | 'outbound' | 'note'
    from_email: string
    from_name?: string | null
    to_email: string
    subject: string
    body_text?: string | null
    body_html?: string | null
    message_id?: string | null
    in_reply_to?: string | null
    raw_r2_key?: string | null
    tracking_token?: string | null
  }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO messages
        (conversation_id, direction, from_email, from_name, to_email, subject,
         body_text, body_html, message_id, in_reply_to, raw_r2_key, tracking_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      data.conversation_id,
      data.direction,
      data.from_email,
      data.from_name ?? null,
      data.to_email,
      data.subject,
      data.body_text ?? null,
      data.body_html ?? null,
      data.message_id ?? null,
      data.in_reply_to ?? null,
      data.raw_r2_key ?? null,
      data.tracking_token ?? null
    )
    .run()

  await db
    .prepare('UPDATE conversations SET last_message_at = unixepoch(), updated_at = unixepoch(), ai_summary = NULL WHERE id = ?')
    .bind(data.conversation_id)
    .run()

  return result.meta.last_row_id as number
}

export async function linkConversationToCustomer(db: D1Database, conversationId: number, customerId: number): Promise<void> {
  await db.prepare('UPDATE conversations SET customer_id = ? WHERE id = ?').bind(customerId, conversationId).run()
}

export async function setConversationStatus(
  db: D1Database,
  id: number,
  status: 'open' | 'closed'
): Promise<void> {
  await db
    .prepare('UPDATE conversations SET status = ?, updated_at = unixepoch() WHERE id = ?')
    .bind(status, id)
    .run()
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function getAllCustomers(db: D1Database): Promise<Customer[]> {
  const { results } = await db
    .prepare('SELECT * FROM customers ORDER BY name ASC, email ASC')
    .all<Customer>()
  return results
}

export async function getCustomerByEmail(db: D1Database, email: string): Promise<Customer | null> {
  return db.prepare('SELECT * FROM customers WHERE email = ?').bind(email).first<Customer>()
}

export async function getCustomerById(db: D1Database, id: number): Promise<Customer | null> {
  return db.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first<Customer>()
}

export async function createCustomer(db: D1Database, data: { email: string; name?: string | null }): Promise<number> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO customers (email, name) VALUES (?, ?)')
    .bind(data.email, data.name ?? null)
    .run()
  if (result.meta.last_row_id) return result.meta.last_row_id as number
  const existing = await getCustomerByEmail(db, data.email)
  return existing!.id
}

export async function updateCustomer(db: D1Database, id: number, data: { name?: string; notes?: string }): Promise<void> {
  const fields: string[] = []
  const values: (string | number)[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }
  if (!fields.length) return
  fields.push('updated_at = unixepoch()')
  await db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run()
}

export async function getConversationsByCustomer(
  db: D1Database,
  customerId: number,
  opts: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ conversations: Conversation[]; total: number }> {
  const status = opts.status ?? 'open'
  const limit = opts.limit ?? 20
  const offset = opts.offset ?? 0

  const [{ results }, countRow] = await Promise.all([
    db.prepare('SELECT * FROM conversations WHERE customer_id = ? AND status = ? ORDER BY last_message_at DESC LIMIT ? OFFSET ?')
      .bind(customerId, status, limit, offset)
      .all<Conversation>(),
    db.prepare('SELECT COUNT(*) as count FROM conversations WHERE customer_id = ? AND status = ?')
      .bind(customerId, status)
      .first<{ count: number }>(),
  ])
  return { conversations: results, total: countRow?.count ?? 0 }
}

export async function getMailboxCounts(
  db: D1Database
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`
      SELECT mailbox_email, COUNT(*) as count
      FROM conversations
      WHERE status = 'open'
      GROUP BY mailbox_email
    `)
    .all<{ mailbox_email: string; count: number }>()

  return Object.fromEntries(results.map(r => [r.mailbox_email, r.count]))
}

export async function getUnreadCounts(
  db: D1Database
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`
      SELECT mailbox_email, COUNT(*) as count
      FROM conversations
      WHERE unread = 1
      GROUP BY mailbox_email
    `)
    .all<{ mailbox_email: string; count: number }>()

  return Object.fromEntries(results.map(r => [r.mailbox_email, r.count]))
}

export async function markMessageOpened(db: D1Database, trackingToken: string): Promise<void> {
  await db
    .prepare('UPDATE messages SET opened_at = unixepoch() WHERE tracking_token = ? AND opened_at IS NULL')
    .bind(trackingToken)
    .run()
}

export async function markConversationRead(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').bind(id).run()
}

export async function markConversationUnread(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE conversations SET unread = 1 WHERE id = ?').bind(id).run()
}

export async function saveAiSummary(db: D1Database, id: number, summary: string): Promise<void> {
  await db.prepare('UPDATE conversations SET ai_summary = ? WHERE id = ?').bind(summary, id).run()
}

// ── Organizations ────────────────────────────────────────────────────────────

export async function getAllOrganizations(db: D1Database): Promise<Organization[]> {
  const { results } = await db.prepare('SELECT * FROM organizations ORDER BY name ASC').all<Organization>()
  return results
}

export async function getOrganizationById(db: D1Database, id: number): Promise<Organization | null> {
  return db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first<Organization>()
}

export async function createOrganization(db: D1Database, data: { name: string; domain?: string | null; notes?: string | null }): Promise<number> {
  const result = await db
    .prepare('INSERT INTO organizations (name, domain, notes) VALUES (?, ?, ?)')
    .bind(data.name, data.domain ?? null, data.notes ?? null)
    .run()
  return result.meta.last_row_id as number
}

export async function updateOrganization(db: D1Database, id: number, data: { name?: string; domain?: string; notes?: string }): Promise<void> {
  const fields: string[] = []
  const values: (string | number)[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.domain !== undefined) { fields.push('domain = ?'); values.push(data.domain) }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }
  if (!fields.length) return
  fields.push('updated_at = unixepoch()')
  await db.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run()
}

export async function deleteOrganization(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM organizations WHERE id = ?').bind(id).run()
}

export async function getOrganizationMembers(db: D1Database, organizationId: number): Promise<Customer[]> {
  const { results } = await db
    .prepare('SELECT c.* FROM customers c JOIN customer_organizations co ON co.customer_id = c.id WHERE co.organization_id = ? ORDER BY c.name ASC, c.email ASC')
    .bind(organizationId)
    .all<Customer>()
  return results
}

export async function getOrganizationsForCustomer(db: D1Database, customerId: number): Promise<Organization[]> {
  const { results } = await db
    .prepare('SELECT o.* FROM organizations o JOIN customer_organizations co ON co.organization_id = o.id WHERE co.customer_id = ? ORDER BY o.name ASC')
    .bind(customerId)
    .all<Organization>()
  return results
}

export async function addCustomerToOrganization(db: D1Database, customerId: number, organizationId: number): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO customer_organizations (customer_id, organization_id) VALUES (?, ?)').bind(customerId, organizationId).run()
}

export async function removeCustomerFromOrganization(db: D1Database, customerId: number, organizationId: number): Promise<void> {
  await db.prepare('DELETE FROM customer_organizations WHERE customer_id = ? AND organization_id = ?').bind(customerId, organizationId).run()
}

export async function getConversationsByOrganization(
  db: D1Database,
  organizationId: number,
  opts: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ conversations: Conversation[]; total: number }> {
  const status = opts.status ?? 'open'
  const limit = opts.limit ?? 20
  const offset = opts.offset ?? 0

  const [{ results }, countRow] = await Promise.all([
    db.prepare('SELECT * FROM conversations WHERE customer_id IN (SELECT customer_id FROM customer_organizations WHERE organization_id = ?) AND status = ? ORDER BY last_message_at DESC LIMIT ? OFFSET ?')
      .bind(organizationId, status, limit, offset)
      .all<Conversation>(),
    db.prepare('SELECT COUNT(*) as count FROM conversations WHERE customer_id IN (SELECT customer_id FROM customer_organizations WHERE organization_id = ?) AND status = ?')
      .bind(organizationId, status)
      .first<{ count: number }>(),
  ])
  return { conversations: results, total: countRow?.count ?? 0 }
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function getAllTags(db: D1Database): Promise<Tag[]> {
  const { results } = await db.prepare('SELECT * FROM tags ORDER BY name ASC').all<Tag>()
  return results
}

export async function getTagById(db: D1Database, id: number): Promise<Tag | null> {
  return db.prepare('SELECT * FROM tags WHERE id = ?').bind(id).first<Tag>()
}

export async function getTagByName(db: D1Database, name: string): Promise<Tag | null> {
  return db.prepare('SELECT * FROM tags WHERE name = ?').bind(name).first<Tag>()
}

export async function createTag(db: D1Database, data: { name: string; color?: string }): Promise<number> {
  const result = await db
    .prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
    .bind(data.name.toLowerCase().trim(), data.color ?? 'gray')
    .run()
  return result.meta.last_row_id as number
}

export async function updateTag(db: D1Database, id: number, data: { name?: string; color?: string }): Promise<void> {
  const fields: string[] = []
  const values: (string | number)[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.toLowerCase().trim()) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  if (!fields.length) return
  await db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run()
}

export async function deleteTag(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM tags WHERE id = ?').bind(id).run()
}

export async function getTagsForConversation(db: D1Database, conversationId: number): Promise<Tag[]> {
  const { results } = await db
    .prepare('SELECT t.* FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id WHERE ct.conversation_id = ? ORDER BY t.name ASC')
    .bind(conversationId)
    .all<Tag>()
  return results
}

export async function getTagsForConversations(db: D1Database, conversationIds: number[]): Promise<Record<number, Tag[]>> {
  if (!conversationIds.length) return {}
  const placeholders = conversationIds.map(() => '?').join(',')
  const { results } = await db
    .prepare(`SELECT ct.conversation_id, t.* FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id WHERE ct.conversation_id IN (${placeholders}) ORDER BY t.name ASC`)
    .bind(...conversationIds)
    .all<Tag & { conversation_id: number }>()
  const map: Record<number, Tag[]> = {}
  for (const row of results) {
    const cid = row.conversation_id
    if (!map[cid]) map[cid] = []
    map[cid].push({ id: row.id, name: row.name, color: row.color, created_at: row.created_at })
  }
  return map
}

export async function addTagToConversation(db: D1Database, conversationId: number, tagId: number): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').bind(conversationId, tagId).run()
}

export async function removeTagFromConversation(db: D1Database, conversationId: number, tagId: number): Promise<void> {
  await db.prepare('DELETE FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?').bind(conversationId, tagId).run()
}

export async function getConversationsByTag(
  db: D1Database,
  tagId: number,
  opts: { status?: string; mailbox?: string } = {}
): Promise<Conversation[]> {
  let query = `
    SELECT c.*, COUNT(m.id) as message_count
    FROM conversations c
    JOIN conversation_tags ct ON ct.conversation_id = c.id
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE ct.tag_id = ?
  `
  const bindings: (string | number)[] = [tagId]

  if (opts.status) {
    query += ' AND c.status = ?'
    bindings.push(opts.status)
  }
  if (opts.mailbox) {
    query += ' AND c.mailbox_email = ?'
    bindings.push(opts.mailbox)
  }

  query += ' GROUP BY c.id ORDER BY c.last_message_at DESC LIMIT 100'

  const { results } = await db.prepare(query).bind(...bindings).all<Conversation>()
  return results
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function searchConversations(
  db: D1Database,
  query: string,
  opts: { mailbox?: string; status?: string } = {}
): Promise<Conversation[]> {
  const ftsQuery = query.split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(' ')
  if (!ftsQuery) return []

  let sql = `
    SELECT DISTINCT c.*, COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE (
      c.id IN (SELECT rowid FROM conversations_fts WHERE conversations_fts MATCH ?)
      OR c.id IN (SELECT conversation_id FROM messages WHERE id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?))
    )
  `
  const bindings: (string | number)[] = [ftsQuery, ftsQuery]

  if (opts.status) {
    sql += ' AND c.status = ?'
    bindings.push(opts.status)
  }
  if (opts.mailbox) {
    sql += ' AND c.mailbox_email = ?'
    bindings.push(opts.mailbox)
  }

  sql += ' GROUP BY c.id ORDER BY c.last_message_at DESC LIMIT 50'

  const { results } = await db.prepare(sql).bind(...bindings).all<Conversation>()
  return results
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function createAuditEntry(
  db: D1Database,
  data: {
    user_email: string
    user_name?: string | null
    action: AuditAction
    conversation_id?: number | null
    mailbox_email?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO audit_log (user_email, user_name, action, conversation_id, mailbox_email, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      data.user_email,
      data.user_name ?? null,
      data.action,
      data.conversation_id ?? null,
      data.mailbox_email ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null
    )
    .run()
}

export async function getAuditLog(
  db: D1Database,
  opts: { user_email?: string; mailbox_email?: string; limit?: number; offset?: number } = {}
): Promise<AuditEntry[]> {
  let sql = 'SELECT * FROM audit_log WHERE 1=1'
  const bindings: (string | number)[] = []

  if (opts.user_email) {
    sql += ' AND user_email = ?'
    bindings.push(opts.user_email)
  }
  if (opts.mailbox_email) {
    sql += ' AND mailbox_email = ?'
    bindings.push(opts.mailbox_email)
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  bindings.push(opts.limit ?? 100, opts.offset ?? 0)

  const { results } = await db.prepare(sql).bind(...bindings).all<AuditEntry>()
  return results
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function upsertUser(db: D1Database, email: string, name: string): Promise<void> {
  await db
    .prepare('INSERT INTO users (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name')
    .bind(email, name)
    .run()
}

export async function hasAnyAdmin(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1').first()
  return !!row
}

export async function setUserAdmin(db: D1Database, email: string, isAdmin: boolean): Promise<void> {
  await db.prepare('UPDATE users SET is_admin = ? WHERE email = ?').bind(isAdmin ? 1 : 0, email).run()
}

export async function getAllUsers(db: D1Database): Promise<User[]> {
  const { results } = await db.prepare('SELECT * FROM users ORDER BY created_at ASC').all<User>()
  return results
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>()
}

// ── User permissions ──────────────────────────────────────────────────────────

export async function getUserPermissions(db: D1Database, userEmail: string): Promise<UserPermission[]> {
  const { results } = await db
    .prepare('SELECT * FROM user_permissions WHERE user_email = ? ORDER BY resource_type, resource_id')
    .bind(userEmail)
    .all<UserPermission>()
  return results
}

export async function getPermissionsForResource(
  db: D1Database,
  resourceType: ResourceType,
  resourceId: number
): Promise<UserPermission[]> {
  const { results } = await db
    .prepare('SELECT * FROM user_permissions WHERE resource_type = ? AND resource_id = ? ORDER BY user_email')
    .bind(resourceType, resourceId)
    .all<UserPermission>()
  return results
}

export async function addUserPermission(
  db: D1Database,
  userEmail: string,
  resourceType: ResourceType,
  resourceId: number,
  level: PermissionLevel
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO user_permissions (user_email, resource_type, resource_id, level)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_email, resource_type, resource_id) DO UPDATE SET level = excluded.level
    `)
    .bind(userEmail, resourceType, resourceId, level)
    .run()
}

export async function removeUserPermission(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM user_permissions WHERE id = ?').bind(id).run()
}

export async function removeUserPermissionByResource(
  db: D1Database,
  userEmail: string,
  resourceType: ResourceType,
  resourceId: number
): Promise<void> {
  await db
    .prepare('DELETE FROM user_permissions WHERE user_email = ? AND resource_type = ? AND resource_id = ?')
    .bind(userEmail, resourceType, resourceId)
    .run()
}
