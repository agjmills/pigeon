import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getAllCustomers, getCustomerById, getCustomerByEmail, getConversationsByCustomer,
  getConversation, getMessages, getMailboxes, getConversationsPaginated,
  createMessage, createConversation, getLastMessageId, createAuditEntry,
  upsertCustomer, setCustomerOptedOut, setConversationStatus,
  insertMessageAttachment, getDoNotContact,
} from '../lib/db'
import { canReadMailbox, canSendFrom, anyContactsLevel } from '../lib/permissions'
import { createEmailProvider } from '../lib/email-provider'
import type { EmailAttachment } from '../lib/email-provider'

export const apiRoutes = new Hono<AppEnv>()

// ── Rate limiting ─────────────────────────────────────────────────────────────

apiRoutes.use('/*', async (c, next) => {
  if (c.env.RATE_LIMITER) {
    const key = c.req.header('authorization') ?? c.req.header('x-forwarded-for') ?? 'anon'
    const { success } = await c.env.RATE_LIMITER.limit({ key })
    if (!success) {
      return c.json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '60' })
    }
  }
  return next()
})

// ── Mailboxes ─────────────────────────────────────────────────────────────────

apiRoutes.get('/mailboxes', async (c) => {
  const mailboxes = await getMailboxes(c.env.DB)
  const accessible = mailboxes.filter(mb =>
    mb.domain_id !== null &&
    canSendFrom(c.get('permissions'), c.get('isAdmin'), mb.id, mb.domain_id)
  )
  return c.json(accessible.map(mb => ({
    id: mb.id,
    email: mb.email,
    sender_name: mb.sender_name,
    domain_id: mb.domain_id,
  })))
})

// ── Customers ─────────────────────────────────────────────────────────────────

apiRoutes.get('/customers', async (c) => {
  if (!anyContactsLevel(c.get('permissions'), c.get('isAdmin'))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const email = c.req.query('email')
  if (email) {
    const customer = await getCustomerByEmail(c.env.DB, email)
    if (!customer) return c.json({ error: 'Not found' }, 404)
    return c.json(customer)
  }

  const customers = await getAllCustomers(c.env.DB)
  return c.json(customers)
})

apiRoutes.post('/customers', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = await c.req.json<{ email?: string; name?: string; notes?: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: 'email is required' }, 400)

  const { id, created } = await upsertCustomer(c.env.DB, {
    email: body.email,
    name: body.name ?? null,
    notes: body.notes ?? null,
  })
  const customer = await getCustomerById(c.env.DB, id)
  return c.json({ id, email: customer!.email, created }, created ? 201 : 200)
})

apiRoutes.get('/customers/:id', async (c) => {
  if (!anyContactsLevel(c.get('permissions'), c.get('isAdmin'))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const id = parseInt(c.req.param('id'))
  const status = c.req.query('status') ?? 'open'
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const perPage = 50

  const [customer, { conversations, total }] = await Promise.all([
    getCustomerById(c.env.DB, id),
    getConversationsByCustomer(c.env.DB, id, { status, limit: perPage, offset: (page - 1) * perPage }),
  ])
  if (!customer) return c.json({ error: 'Not found' }, 404)

  return c.json({ customer, conversations, total, page, status })
})

// ── Customer opt-out / opt-in ──────────────────────────────────────────────────

apiRoutes.post('/customers/:id/opt-out', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const id = parseInt(c.req.param('id'))
  const customer = await getCustomerById(c.env.DB, id)
  if (!customer) return c.json({ error: 'Not found' }, 404)
  await setCustomerOptedOut(c.env.DB, id, true)
  return c.json({ ok: true })
})

apiRoutes.post('/customers/:id/opt-in', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const id = parseInt(c.req.param('id'))
  const customer = await getCustomerById(c.env.DB, id)
  if (!customer) return c.json({ error: 'Not found' }, 404)
  await setCustomerOptedOut(c.env.DB, id, false)
  return c.json({ ok: true })
})

// ── Conversations ─────────────────────────────────────────────────────────────

apiRoutes.get('/conversations', async (c) => {
  const mailboxes = await getMailboxes(c.env.DB)
  const status = c.req.query('status') ?? 'open'
  const mailboxEmail = c.req.query('mailbox')
  const since = c.req.query('since') ? parseInt(c.req.query('since')!) : undefined
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const perPage = Math.min(200, parseInt(c.req.query('per_page') ?? '50') || 50)

  const accessible = mailboxes.filter(mb =>
    mb.domain_id !== null &&
    canReadMailbox(c.get('permissions'), c.get('isAdmin'), mb.id, mb.domain_id)
  )
  if (!accessible.length) return c.json({ conversations: [], total: 0, page })

  const filterMailbox = mailboxEmail
    ? accessible.find(mb => mb.email === mailboxEmail)
    : null
  if (mailboxEmail && !filterMailbox) return c.json({ error: 'Forbidden or not found' }, 403)

  const { conversations, total } = await getConversationsPaginated(c.env.DB, {
    mailbox: filterMailbox?.email,
    status,
    since,
    limit: perPage,
    offset: (page - 1) * perPage,
  })
  return c.json({ conversations, total, page })
})

apiRoutes.get('/conversations/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const [conv, messages, mailboxes] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMailboxes(c.env.DB),
  ])
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canReadMailbox(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json({ conversation: conv, messages })
})

apiRoutes.post('/conversations/:id/close', async (c) => {
  const id = parseInt(c.req.param('id'))
  const [conv, mailboxes] = await Promise.all([
    getConversation(c.env.DB, id),
    getMailboxes(c.env.DB),
  ])
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await setConversationStatus(c.env.DB, id, 'closed')
  return c.json({ ok: true })
})

apiRoutes.post('/conversations/:id/open', async (c) => {
  const id = parseInt(c.req.param('id'))
  const [conv, mailboxes] = await Promise.all([
    getConversation(c.env.DB, id),
    getMailboxes(c.env.DB),
  ])
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await setConversationStatus(c.env.DB, id, 'open')
  return c.json({ ok: true })
})

// ── Reply ─────────────────────────────────────────────────────────────────────

apiRoutes.post('/conversations/:id/reply', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json<{
    text: string
    html?: string
    attachments?: Array<{ filename: string; content_base64: string; mime_type: string }>
  }>().catch(() => null)
  if (!body?.text) return c.json({ error: 'body.text is required' }, 400)

  const [conv, mailboxes] = await Promise.all([
    getConversation(c.env.DB, id),
    getMailboxes(c.env.DB),
  ])
  if (!conv) return c.json({ error: 'Not found' }, 404)
  if (conv.status === 'closed') return c.json({ error: 'Conversation is closed' }, 400)

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const customer = await getCustomerByEmail(c.env.DB, conv.customer_email)
  if (customer?.opted_out_at) return c.json({ error: 'Customer has opted out' }, 409)
  if (customer?.bounced_at) return c.json({ error: 'Email address has bounced' }, 409)

  const user = c.get('user')
  const inReplyTo = await getLastMessageId(c.env.DB, id)
  const emailAttachments = decodeBase64Attachments(body.attachments)
  const trackingToken = crypto.randomUUID()
  const pixelUrl = `${c.env.APP_URL}/t/${trackingToken}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`
  const htmlBody = body.html ? body.html + pixel : null

  const emailProvider = createEmailProvider(c.env)
  const { messageId } = await emailProvider.send({
    from: conv.mailbox_email,
    fromName: mb?.sender_name || mb?.name || conv.mailbox_email,
    to: conv.customer_email,
    subject: conv.subject,
    text: body.text,
    html: htmlBody,
    inReplyTo,
    attachments: emailAttachments.length ? emailAttachments : undefined,
  })

  const msgId = await createMessage(c.env.DB, {
    conversation_id: id,
    direction: 'outbound',
    from_email: conv.mailbox_email,
    from_name: user.name,
    to_email: conv.customer_email,
    subject: conv.subject,
    body_text: body.text,
    body_html: htmlBody,
    message_id: messageId,
    in_reply_to: inReplyTo,
    tracking_token: trackingToken,
  })

  if (emailAttachments.length) {
    c.executionCtx.waitUntil(storeApiAttachments(c.env, msgId, emailAttachments))
  }

  c.executionCtx.waitUntil(createAuditEntry(c.env.DB, {
    user_email: user.email,
    user_name: user.name,
    action: 'reply_sent',
    conversation_id: id,
    mailbox_email: conv.mailbox_email,
    metadata: { to: conv.customer_email, subject: conv.subject },
  }))

  return c.json({ ok: true, message_id: msgId }, 201)
})

// ── Compose ───────────────────────────────────────────────────────────────────

apiRoutes.post('/compose', async (c) => {
  const body = await c.req.json<{
    from: string
    to: string
    subject: string
    text: string
    html?: string
    attachments?: Array<{ filename: string; content_base64: string; mime_type: string }>
  }>().catch(() => null)

  if (!body?.from || !body?.to || !body?.subject || !body?.text) {
    return c.json({ error: 'from, to, subject, and text are required' }, 400)
  }

  const mailboxes = await getMailboxes(c.env.DB)
  const mb = mailboxes.find(m => m.email === body.from)
  if (!mb) return c.json({ error: `No mailbox found for ${body.from}` }, 404)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), mb.id, mb.domain_id ?? -1)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [customer, dnc] = await Promise.all([
    getCustomerByEmail(c.env.DB, body.to),
    getDoNotContact(c.env.DB, body.to),
  ])
  if (dnc) return c.json({ error: `This address is on the do-not-contact list: ${dnc.reason}` }, 409)
  if (customer?.opted_out_at) return c.json({ error: 'Customer has opted out' }, 409)
  if (customer?.bounced_at) return c.json({ error: 'Email address has bounced' }, 409)

  const user = c.get('user')
  const emailAttachments = decodeBase64Attachments(body.attachments)
  const trackingToken = crypto.randomUUID()
  const pixelUrl = `${c.env.APP_URL}/t/${trackingToken}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`
  const htmlBody = body.html ? body.html + pixel : null

  const emailProvider = createEmailProvider(c.env)
  const { messageId } = await emailProvider.send({
    from: mb.email,
    fromName: mb.sender_name || mb.name || mb.email,
    to: body.to,
    subject: body.subject,
    text: body.text,
    html: htmlBody,
    attachments: emailAttachments.length ? emailAttachments : undefined,
  })

  const convId = await createConversation(c.env.DB, {
    mailbox_email: mb.email,
    customer_email: body.to,
    subject: body.subject,
  })

  const msgId = await createMessage(c.env.DB, {
    conversation_id: convId,
    direction: 'outbound',
    from_email: mb.email,
    from_name: user.name,
    to_email: body.to,
    subject: body.subject,
    body_text: body.text,
    body_html: htmlBody,
    message_id: messageId,
    tracking_token: trackingToken,
  })

  if (emailAttachments.length) {
    c.executionCtx.waitUntil(storeApiAttachments(c.env, msgId, emailAttachments))
  }

  c.executionCtx.waitUntil(createAuditEntry(c.env.DB, {
    user_email: user.email,
    user_name: user.name,
    action: 'compose_sent',
    conversation_id: convId,
    mailbox_email: mb.email,
    metadata: { to: body.to, subject: body.subject },
  }))

  return c.json({ ok: true, conversation_id: convId, message_id: msgId }, 201)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeBase64Attachments(
  raw?: Array<{ filename: string; content_base64: string; mime_type: string }>
): EmailAttachment[] {
  if (!raw?.length) return []
  return raw.map(a => {
    const binary = atob(a.content_base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { filename: a.filename, content: bytes, contentType: a.mime_type }
  })
}

async function storeApiAttachments(
  env: import('../types').Bindings,
  msgId: number,
  attachments: EmailAttachment[]
): Promise<void> {
  for (const att of attachments) {
    const r2Key = `attachments/${msgId}/${crypto.randomUUID()}-${att.filename}`
    await env.ATTACHMENTS.put(r2Key, att.content)
    await insertMessageAttachment(env.DB, {
      message_id: msgId,
      filename: att.filename,
      mime_type: att.contentType,
      size: att.content.byteLength,
      r2_key: r2Key,
    })
  }
}

// ── OpenAPI spec ──────────────────────────────────────────────────────────────

apiRoutes.get('/openapi.yaml', (c) => {
  const spec = `openapi: 3.1.0
info:
  title: Pigeon API
  version: 1.0.0
  description: >
    Programmatic access to Pigeon. Authenticate with an API token created at
    /settings/tokens. All endpoints accept and return JSON.

servers:
  - url: ${c.env.APP_URL}/api/v1

security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: pgn_<token>

  schemas:
    Customer:
      type: object
      properties:
        id: { type: integer }
        email: { type: string }
        name: { type: string, nullable: true }
        notes: { type: string, nullable: true }
        opted_out_at: { type: integer, nullable: true, description: Unix timestamp when customer opted out }
        bounced_at: { type: integer, nullable: true, description: Unix timestamp when a hard bounce was detected }
        created_at: { type: integer, description: Unix timestamp }

    Mailbox:
      type: object
      properties:
        id: { type: integer }
        email: { type: string }
        sender_name: { type: string, nullable: true }
        domain_id: { type: integer, nullable: true }

    Conversation:
      type: object
      properties:
        id: { type: integer }
        mailbox_email: { type: string }
        customer_email: { type: string }
        customer_name: { type: string, nullable: true }
        subject: { type: string }
        status: { type: string, enum: [open, closed] }
        unread: { type: integer }
        last_message_at: { type: integer }

    Message:
      type: object
      properties:
        id: { type: integer }
        conversation_id: { type: integer }
        direction: { type: string, enum: [inbound, outbound, note] }
        from_email: { type: string }
        from_name: { type: string, nullable: true }
        to_email: { type: string }
        subject: { type: string }
        body_text: { type: string, nullable: true }
        body_html: { type: string, nullable: true }
        opened_at: { type: integer, nullable: true, description: Unix timestamp when open pixel fired }
        created_at: { type: integer }

paths:
  /mailboxes:
    get:
      summary: List mailboxes the token can send from
      operationId: listMailboxes
      responses:
        '200':
          description: Array of accessible mailboxes
          content:
            application/json:
              schema:
                type: array
                items: { \$ref: '#/components/schemas/Mailbox' }

  /customers:
    get:
      summary: List all customers, or look up by email
      operationId: listCustomers
      parameters:
        - name: email
          in: query
          description: Exact-match email lookup — returns single customer or 404
          schema: { type: string }
      responses:
        '200':
          description: Array of customers (or single customer when email param provided)
          content:
            application/json:
              schema:
                oneOf:
                  - type: array
                    items: { \$ref: '#/components/schemas/Customer' }
                  - \$ref: '#/components/schemas/Customer'
        '404':
          description: Customer not found (only when email param provided)
    post:
      summary: Create or return existing customer (upsert by email)
      operationId: upsertCustomer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email: { type: string }
                name: { type: string }
                notes: { type: string }
      responses:
        '200':
          description: Existing customer returned
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: integer }
                  email: { type: string }
                  created: { type: boolean, example: false }
        '201':
          description: New customer created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: integer }
                  email: { type: string }
                  created: { type: boolean, example: true }

  /customers/{id}:
    get:
      summary: Get a customer with their conversations
      operationId: getCustomer
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
        - name: status
          in: query
          schema: { type: string, enum: [open, closed], default: open }
        - name: page
          in: query
          schema: { type: integer, default: 1 }
      responses:
        '200':
          description: Customer and their conversations
          content:
            application/json:
              schema:
                type: object
                properties:
                  customer: { \$ref: '#/components/schemas/Customer' }
                  conversations:
                    type: array
                    items: { \$ref: '#/components/schemas/Conversation' }
                  total: { type: integer }
                  page: { type: integer }
                  status: { type: string }

  /customers/{id}/opt-out:
    post:
      summary: Mark customer as opted out
      operationId: optOutCustomer
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }

  /customers/{id}/opt-in:
    post:
      summary: Clear customer opt-out status
      operationId: optInCustomer
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }

  /conversations:
    get:
      summary: List conversations
      operationId: listConversations
      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [open, closed], default: open }
        - name: mailbox
          in: query
          schema: { type: string }
          description: Filter by mailbox email address
        - name: since
          in: query
          schema: { type: integer }
          description: Unix timestamp — only return conversations with last_message_at after this value
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: per_page
          in: query
          schema: { type: integer, default: 50, maximum: 200 }
      responses:
        '200':
          description: Paginated conversations
          content:
            application/json:
              schema:
                type: object
                properties:
                  conversations:
                    type: array
                    items: { \$ref: '#/components/schemas/Conversation' }
                  total: { type: integer }
                  page: { type: integer }

  /conversations/{id}:
    get:
      summary: Get a conversation with all messages
      operationId: getConversation
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Conversation and messages
          content:
            application/json:
              schema:
                type: object
                properties:
                  conversation: { \$ref: '#/components/schemas/Conversation' }
                  messages:
                    type: array
                    items: { \$ref: '#/components/schemas/Message' }

  /conversations/{id}/reply:
    post:
      summary: Reply to a conversation
      operationId: replyToConversation
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [text]
              properties:
                text:
                  type: string
                  description: Plain text body
                html:
                  type: string
                  description: HTML body (optional; open tracking pixel appended automatically)
      responses:
        '201':
          description: Reply sent
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  message_id: { type: integer }
        '409':
          description: Customer has opted out or email has bounced

  /conversations/{id}/close:
    post:
      summary: Close a conversation
      operationId: closeConversation
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }

  /conversations/{id}/open:
    post:
      summary: Reopen a conversation
      operationId: openConversation
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }

  /compose:
    post:
      summary: Compose and send a new outbound email
      operationId: composeEmail
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [from, to, subject, text]
              properties:
                from:
                  type: string
                  description: Mailbox email address to send from
                to:
                  type: string
                  description: Recipient email address
                subject:
                  type: string
                text:
                  type: string
                  description: Plain text body
                html:
                  type: string
                  description: HTML body (optional)
      responses:
        '201':
          description: Email sent and conversation created
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  conversation_id: { type: integer }
                  message_id: { type: integer }
        '409':
          description: Customer has opted out or email has bounced
`
  return c.text(spec, 200, { 'Content-Type': 'application/yaml' })
})
