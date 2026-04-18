import { env } from 'cloudflare:test'
import { inject } from 'vitest'

let migrated = false

/**
 * Apply all D1 migrations. Idempotent within a test run.
 * Statements are pre-split in Node (vitest.config.mts) and injected here.
 */
export async function applyMigrations() {
  if (migrated) return
  const statements = inject('migrationStatements')
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run()
  }
  migrated = true
}

/**
 * Create an admin user and return an unscoped API token for them.
 */
export async function createTestAdmin(
  email = 'admin@test.example',
  name = 'Test Admin'
): Promise<string> {
  const db = env.DB
  await db
    .prepare('INSERT OR IGNORE INTO users (email, name, is_admin) VALUES (?, ?, 1)')
    .bind(email, name)
    .run()
  const rawToken = 'pgn_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const hash = await hashToken(rawToken)
  await db
    .prepare('INSERT INTO api_tokens (token_hash, name, user_email, scoped) VALUES (?, ?, ?, 0)')
    .bind(hash, 'test-token', email)
    .run()
  return rawToken
}

/**
 * Seed a domain + mailbox for testing. Returns { domainId, mailboxId }.
 */
export async function seedMailbox(
  domain = 'test.example',
  email = 'support@test.example',
  name = 'Support'
): Promise<{ domainId: number; mailboxId: number }> {
  const db = env.DB
  const domainResult = await db
    .prepare('INSERT OR IGNORE INTO domains (domain, provider_verified) VALUES (?, 1)')
    .bind(domain)
    .run()
  let domainId = domainResult.meta.last_row_id as number
  if (!domainId) {
    const row = await db.prepare('SELECT id FROM domains WHERE domain = ?').bind(domain).first<{ id: number }>()
    domainId = row!.id
  }
  const mbResult = await db
    .prepare('INSERT OR IGNORE INTO mailboxes (email, name, domain_id) VALUES (?, ?, ?)')
    .bind(email, name, domainId)
    .run()
  let mailboxId = mbResult.meta.last_row_id as number
  if (!mailboxId) {
    const row = await db.prepare('SELECT id FROM mailboxes WHERE email = ?').bind(email).first<{ id: number }>()
    mailboxId = row!.id
  }
  return { domainId, mailboxId }
}

/**
 * Make an authenticated API request using a Bearer token.
 */
export function apiRequest(
  path: string,
  token: string,
  options: RequestInit = {}
): Request {
  const url = `http://localhost/api/v1${path}`
  return new Request(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Create a scoped API token for a user with specific permissions.
 * The user must already exist. Returns the raw token string.
 */
export async function createScopedToken(
  userEmail: string,
  permissions: Array<{ resource_type: string; resource_id: number; level: string }>,
  name = 'scoped-test-token'
): Promise<string> {
  const db = env.DB
  const rawToken = 'pgn_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const hash = await hashToken(rawToken)
  const result = await db
    .prepare('INSERT INTO api_tokens (token_hash, name, user_email, scoped) VALUES (?, ?, ?, 1)')
    .bind(hash, name, userEmail)
    .run()
  const tokenId = result.meta.last_row_id as number
  for (const p of permissions) {
    await db
      .prepare('INSERT INTO api_token_permissions (token_id, resource_type, resource_id, level) VALUES (?, ?, ?, ?)')
      .bind(tokenId, p.resource_type, p.resource_id, p.level)
      .run()
  }
  return rawToken
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
