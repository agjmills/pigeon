import { SELF } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyMigrations, createTestAdmin, createScopedToken, seedMailbox, apiRequest } from './helpers'

let adminToken: string
let domainA: { domainId: number; mailboxId: number }
let domainB: { domainId: number; mailboxId: number }

beforeAll(async () => {
  await applyMigrations()
  adminToken = await createTestAdmin()
  domainA = await seedMailbox('a.example', 'support@a.example', 'Support A')
  domainB = await seedMailbox('b.example', 'info@b.example', 'Info B')
})

// ── Domain-scoped read token ─────────────────────────────────────────────────

describe('scoped token with domain read', () => {
  let token: string

  beforeAll(async () => {
    token = await createScopedToken('admin@test.example', [
      { resource_type: 'domain', resource_id: domainA.domainId, level: 'read' },
    ])
  })

  it('can list conversations for granted domain', async () => {
    const res = await SELF.fetch(apiRequest('/conversations?mailbox=support@a.example', token))
    expect(res.status).toBe(200)
  })

  it('cannot see any mailboxes (read-only cannot send)', async () => {
    // GET /mailboxes returns mailboxes you can send from — read-only gets none
    const res = await SELF.fetch(apiRequest('/mailboxes', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any[]
    expect(data).toEqual([])
  })

  it('cannot compose (read-only)', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@a.example',
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    }))
    expect(res.status).toBe(403)
  })

  it('is never treated as admin even though user is admin', async () => {
    // Scoped tokens force isAdmin=false — verify by trying to see domain B
    const res = await SELF.fetch(apiRequest('/conversations?mailbox=info@b.example', token))
    expect(res.status).toBe(403)
  })
})

// ── Domain-scoped edit token ─────────────────────────────────────────────────

describe('scoped token with domain edit', () => {
  let token: string

  beforeAll(async () => {
    token = await createScopedToken('admin@test.example', [
      { resource_type: 'domain', resource_id: domainA.domainId, level: 'edit' },
    ])
  })

  it('can compose from granted domain', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@a.example',
        to: 'scoped-test@example.com',
        subject: 'Scoped compose',
        text: 'Sent via scoped token',
      }),
    }))
    expect(res.status).toBe(201)
  })

  it('cannot compose from other domain', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'info@b.example',
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    }))
    expect(res.status).toBe(403)
  })

  it('can close a conversation in granted domain', async () => {
    // First create one
    const composeRes = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@a.example',
        to: 'close-test@example.com',
        subject: 'Close test',
        text: 'Hello',
      }),
    }))
    const { conversation_id } = await composeRes.json() as any

    const res = await SELF.fetch(apiRequest(`/conversations/${conversation_id}/close`, token, { method: 'POST' }))
    expect(res.status).toBe(200)
  })
})

// ── Mailbox-scoped token ─────────────────────────────────────────────────────

describe('scoped token with single mailbox edit', () => {
  let token: string
  let secondMailbox: { domainId: number; mailboxId: number }

  beforeAll(async () => {
    // Add a second mailbox to domain A
    secondMailbox = await seedMailbox('a.example', 'sales@a.example', 'Sales A')
    token = await createScopedToken('admin@test.example', [
      { resource_type: 'mailbox', resource_id: domainA.mailboxId, level: 'edit' },
    ])
  })

  it('can only see the granted mailbox', async () => {
    const res = await SELF.fetch(apiRequest('/mailboxes', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any[]
    const emails = data.map((m: any) => m.email)
    expect(emails).toContain('support@a.example')
    expect(emails).not.toContain('sales@a.example')
    expect(emails).not.toContain('info@b.example')
  })

  it('can compose from granted mailbox', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'support@a.example',
        to: 'mb-test@example.com',
        subject: 'Mailbox scoped',
        text: 'Hello',
      }),
    }))
    expect(res.status).toBe(201)
  })

  it('cannot compose from sibling mailbox in same domain', async () => {
    const res = await SELF.fetch(apiRequest('/compose', token, {
      method: 'POST',
      body: JSON.stringify({
        from: 'sales@a.example',
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    }))
    expect(res.status).toBe(403)
  })
})

// ── Contacts-scoped token ────────────────────────────────────────────────────

describe('scoped token with contacts permission', () => {
  let readToken: string
  let editToken: string
  let noContactsToken: string

  beforeAll(async () => {
    editToken = await createScopedToken('admin@test.example', [
      { resource_type: 'contacts', resource_id: domainA.domainId, level: 'edit' },
    ])
    readToken = await createScopedToken('admin@test.example', [
      { resource_type: 'contacts', resource_id: domainA.domainId, level: 'read' },
    ])
    noContactsToken = await createScopedToken('admin@test.example', [
      { resource_type: 'mailbox', resource_id: domainA.mailboxId, level: 'edit' },
    ])
  })

  it('edit contacts token can create customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', editToken, {
      method: 'POST',
      body: JSON.stringify({ email: 'scoped-customer@example.com', name: 'Scoped' }),
    }))
    expect(res.status).toBe(201)
  })

  it('read contacts token can list customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', readToken))
    expect(res.status).toBe(200)
  })

  it('read contacts token cannot create customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', readToken, {
      method: 'POST',
      body: JSON.stringify({ email: 'nope@example.com' }),
    }))
    expect(res.status).toBe(403)
  })

  it('mailbox-only token cannot access customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', noContactsToken))
    expect(res.status).toBe(403)
  })
})

// ── No permissions token ─────────────────────────────────────────────────────

describe('scoped token with zero permissions', () => {
  let token: string

  beforeAll(async () => {
    token = await createScopedToken('admin@test.example', [])
  })

  it('cannot list mailboxes (returns empty)', async () => {
    const res = await SELF.fetch(apiRequest('/mailboxes', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any[]
    expect(data).toEqual([])
  })

  it('cannot list customers', async () => {
    const res = await SELF.fetch(apiRequest('/customers', token))
    expect(res.status).toBe(403)
  })

  it('cannot list conversations (returns empty)', async () => {
    const res = await SELF.fetch(apiRequest('/conversations', token))
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.conversations).toEqual([])
  })
})
