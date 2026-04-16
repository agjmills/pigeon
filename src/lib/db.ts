import type { Conversation, Message, Mailbox, Domain, Customer } from '../types'

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

export async function updateDomainResend(db: D1Database, id: number, resendDomainId: string): Promise<void> {
  await db.prepare('UPDATE domains SET resend_domain_id = ? WHERE id = ?').bind(resendDomainId, id).run()
}

export async function updateDomainDnsRecordIds(db: D1Database, id: number, recordIds: string[]): Promise<void> {
  await db.prepare('UPDATE domains SET cf_dns_record_ids = ? WHERE id = ?').bind(JSON.stringify(recordIds), id).run()
}

export async function updateDomainResendVerified(db: D1Database, id: number, verified: boolean): Promise<void> {
  await db.prepare('UPDATE domains SET resend_verified = ? WHERE id = ?').bind(verified ? 1 : 0, id).run()
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
    direction: 'inbound' | 'outbound'
    from_email: string
    from_name?: string | null
    to_email: string
    subject: string
    body_text?: string | null
    body_html?: string | null
    message_id?: string | null
    in_reply_to?: string | null
    raw_r2_key?: string | null
  }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO messages
        (conversation_id, direction, from_email, from_name, to_email, subject,
         body_text, body_html, message_id, in_reply_to, raw_r2_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.raw_r2_key ?? null
    )
    .run()

  await db
    .prepare('UPDATE conversations SET last_message_at = unixepoch(), updated_at = unixepoch() WHERE id = ?')
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

export async function getConversationsByCustomer(db: D1Database, customerId: number): Promise<Conversation[]> {
  const { results } = await db
    .prepare('SELECT * FROM conversations WHERE customer_id = ? ORDER BY last_message_at DESC')
    .bind(customerId)
    .all<Conversation>()
  return results
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
