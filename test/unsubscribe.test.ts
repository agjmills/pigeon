import { describe, it, expect } from 'vitest'
import { generateUnsubscribeToken, verifyUnsubscribeToken, unsubscribeLink } from '../src/lib/unsubscribe'

const SECRET = 'test-secret-key-for-unsubscribe'

describe('unsubscribe tokens', () => {
  it('generates a token with base64 email and HMAC signature', async () => {
    const token = await generateUnsubscribeToken('alice@example.com', SECRET)
    expect(token).toContain('.')
    const [emailB64] = token.split('.')
    expect(atob(emailB64)).toBe('alice@example.com')
  })

  it('verifies a valid token', async () => {
    const token = await generateUnsubscribeToken('bob@example.com', SECRET)
    const email = await verifyUnsubscribeToken(token, SECRET)
    expect(email).toBe('bob@example.com')
  })

  it('rejects token with wrong secret', async () => {
    const token = await generateUnsubscribeToken('carol@example.com', SECRET)
    const email = await verifyUnsubscribeToken(token, 'wrong-secret')
    expect(email).toBeNull()
  })

  it('rejects tampered token', async () => {
    const token = await generateUnsubscribeToken('dave@example.com', SECRET)
    const tampered = token.slice(0, -4) + 'dead'
    const email = await verifyUnsubscribeToken(tampered, SECRET)
    expect(email).toBeNull()
  })

  it('rejects malformed token (no dot)', async () => {
    const email = await verifyUnsubscribeToken('nodot', SECRET)
    expect(email).toBeNull()
  })

  it('rejects token with invalid base64', async () => {
    const email = await verifyUnsubscribeToken('!!!.abc', SECRET)
    expect(email).toBeNull()
  })

  it('generates a correct unsubscribe link', async () => {
    const token = await generateUnsubscribeToken('eve@example.com', SECRET)
    const link = unsubscribeLink('eve@example.com', 'https://pigeon.example.com', token)
    expect(link).toMatch(/^https:\/\/pigeon\.example\.com\/unsubscribe\//)
    expect(link).toContain(encodeURIComponent(token))
  })

  it('handles emails with special characters', async () => {
    const email = 'user+tag@example.com'
    const token = await generateUnsubscribeToken(email, SECRET)
    const verified = await verifyUnsubscribeToken(token, SECRET)
    expect(verified).toBe(email)
  })
})
