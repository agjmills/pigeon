import { env, SELF } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyMigrations, createTestAdmin, seedMailbox, apiRequest } from './helpers'

let token: string
let domainId: number
let mailboxId: number

beforeAll(async () => {
  await applyMigrations()
  token = await createTestAdmin()
  ;({ domainId, mailboxId } = await seedMailbox())
})

// ── Mailboxes ────────────────────────────────────────────────────────────────

describe('GET /api/v1/mailboxes', () => {
  it('returns accessible mailboxes', async () => {
    const res = await SELF.fetch(apiRequest('/mailboxes', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any[]
    expect(data).toBeInstanceOf(Array)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].email).toBe('support@test.example')
  })

  it('rejects unauthenticated requests', async () => {
    const res = await SELF.fetch('http://localhost/api/v1/mailboxes')
    // Without auth, the middleware redirects to login (which fails in test due to no OIDC)
    // Key assertion: we don't get a 200 with data
    expect(res.status).not.toBe(200)
  })

  it('rejects invalid token', async () => {
    const res = await SELF.fetch(apiRequest('/mailboxes', 'pgn_invalid'))
    expect(res.status).toBe(401)
  })
})

// ── Customers ────────────────────────────────────────────────────────────────

describe('POST /api/v1/customers', () => {
  it('creates a new customer', async () => {
    const res = await SELF.fetch(apiRequest('/customers', token, {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.com', name: 'Alice' }),
    }))
    expect(res.status).toBe(201)
    const data = await res.json() as any
    expect(data.created).toBe(true)
    expect(data.email).toBe('alice@example.com')
  })

  it('upserts existing customer', async () => {
    const res = await SELF.fetch(apiRequest('/customers', token, {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.com', name: 'Alice Updated' }),
    }))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.created).toBe(false)
  })

  it('requires email field', async () => {
    const res = await SELF.fetch(apiRequest('/customers', token, {
      method: 'POST',
      body: JSON.stringify({ name: 'No Email' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/customers', () => {
  it('lists all customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any[]
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('looks up by email', async () => {
    const res = await SELF.fetch(apiRequest('/customers?email=alice@example.com', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.email).toBe('alice@example.com')
  })

  it('returns 404 for unknown email', async () => {
    const res = await SELF.fetch(apiRequest('/customers?email=nobody@example.com', token))
    expect(res.status).toBe(404)
  })
})

// ── Customer opt-out / opt-in ────────────────────────────────────────────────

describe('customer opt-out flow', () => {
  let customerId: number

  beforeAll(async () => {
    const res = await SELF.fetch(apiRequest('/customers', token, {
      method: 'POST',
      body: JSON.stringify({ email: 'optout@example.com' }),
    }))
    const data = await res.json() as any
    customerId = data.id
  })

  it('opts out a customer', async () => {
    const res = await SELF.fetch(apiRequest(`/customers/${customerId}/opt-out`, token, { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('opted-out customer has opted_out_at set', async () => {
    const res = await SELF.fetch(apiRequest(`/customers/${customerId}`, token))
    const data = await res.json() as any
    expect(data.customer.opted_out_at).not.toBeNull()
  })

  it('opts customer back in', async () => {
    const res = await SELF.fetch(apiRequest(`/customers/${customerId}/opt-in`, token, { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('opted-in customer has opted_out_at cleared', async () => {
    const res = await SELF.fetch(apiRequest(`/customers/${customerId}`, token))
    const data = await res.json() as any
    expect(data.customer.opted_out_at).toBeNull()
  })
})

// ── Compose ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/compose', () => {
  it('sends a new outbound email and creates a conversation', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@test.example',
        to: 'bob@example.com',
        subject: 'Welcome to Pigeon',
        text: 'Hello Bob!',
      }),
    }))
    expect(res.status).toBe(201)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.conversation_id).toBeGreaterThan(0)
    expect(data.message_id).toBeGreaterThan(0)
  })

  it('rejects missing fields', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({ from: 'support@test.example' }),
    }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown mailbox', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'nobody@test.example',
        to: 'bob@example.com',
        subject: 'Test',
        text: 'Test',
      }),
    }))
    expect(res.status).toBe(404)
  })

  it('rejects sending to opted-out customer', async () => {
    // Create and opt out
    const createRes = await SELF.fetch(apiRequest('/customers', token, {
      method: 'POST',
      body: JSON.stringify({ email: 'optout-compose@example.com' }),
    }))
    const { id } = await createRes.json() as any
    await SELF.fetch(apiRequest(`/customers/${id}/opt-out`, token, { method: 'POST' }))

    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@test.example',
        to: 'optout-compose@example.com',
        subject: 'Should fail',
        text: 'This should be rejected',
      }),
    }))
    expect(res.status).toBe(409)
  })
})

// ── Conversations ────────────────────────────────────────────────────────────

describe('conversations API', () => {
  let conversationId: number

  beforeAll(async () => {
    // Create a conversation via compose
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@test.example',
        to: 'convo-test@example.com',
        subject: 'Conversation test',
        text: 'Hello!',
      }),
    }))
    const data = await res.json() as any
    conversationId = data.conversation_id
  })

  it('lists conversations', async () => {
    const res = await SELF.fetch(apiRequest('/conversations', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.conversations).toBeInstanceOf(Array)
    expect(data.total).toBeGreaterThanOrEqual(1)
  })

  it('filters by mailbox', async () => {
    const res = await SELF.fetch(apiRequest('/conversations?mailbox=support@test.example', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.conversations.length).toBeGreaterThanOrEqual(1)
  })

  it('gets a single conversation with messages', async () => {
    const res = await SELF.fetch(apiRequest(`/conversations/${conversationId}`, token))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.conversation.id).toBe(conversationId)
    expect(data.messages.length).toBeGreaterThanOrEqual(1)
    expect(data.messages[0].direction).toBe('outbound')
  })

  it('closes a conversation', async () => {
    const res = await SELF.fetch(apiRequest(`/conversations/${conversationId}/close`, token, { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('closed conversation shows in closed list', async () => {
    const res = await SELF.fetch(apiRequest('/conversations?status=closed', token))
    const data = await res.json() as any
    expect(data.conversations.some((c: any) => c.id === conversationId)).toBe(true)
  })

  it('reopens a conversation', async () => {
    const res = await SELF.fetch(apiRequest(`/conversations/${conversationId}/open`, token, { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('replies to a conversation', async () => {
    const res = await SELF.fetch(apiRequest(`/conversations/${conversationId}/reply`, token, {
      method: 'POST',
      body: JSON.stringify({ text: 'Follow up message' }),
    }))
    expect(res.status).toBe(201)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.message_id).toBeGreaterThan(0)
  })

  it('rejects reply to closed conversation', async () => {
    // Close it first
    await SELF.fetch(apiRequest(`/conversations/${conversationId}/close`, token, { method: 'POST' }))
    const res = await SELF.fetch(apiRequest(`/conversations/${conversationId}/reply`, token, {
      method: 'POST',
      body: JSON.stringify({ text: 'Should fail' }),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent conversation', async () => {
    const res = await SELF.fetch(apiRequest('/conversations/99999', token))
    expect(res.status).toBe(404)
  })
})
