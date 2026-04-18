import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyMigrations, createTestAdmin, seedMailbox } from './helpers'

describe('smoke test', () => {
  beforeAll(async () => {
    await applyMigrations()
  })

  it('has all expected tables', async () => {
    const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tables = result.results.map((r: any) => r.name)
    for (const t of ['users', 'conversations', 'mailboxes', 'customers', 'api_tokens', 'domains', 'messages']) {
      expect(tables).toContain(t)
    }
  })

  it('can create admin and seed data', async () => {
    const token = await createTestAdmin()
    expect(token).toMatch(/^pgn_/)
    const { domainId, mailboxId } = await seedMailbox()
    expect(domainId).toBeGreaterThan(0)
    expect(mailboxId).toBeGreaterThan(0)
  })
})
