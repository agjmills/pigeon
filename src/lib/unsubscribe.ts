async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function generateUnsubscribeToken(email: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email))
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${btoa(email)}.${sigHex}`
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const emailB64 = token.slice(0, dot)
  const sigHex = token.slice(dot + 1)
  let email: string
  try { email = atob(emailB64) } catch { return null }

  const key = await importHmacKey(secret)
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email))
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('')
  if (expectedHex !== sigHex) return null
  return email
}

export function unsubscribeLink(email: string, appUrl: string, token: string): string {
  return `${appUrl}/unsubscribe/${encodeURIComponent(token)}`
}
