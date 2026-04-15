import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv } from '../types'

export const authRoutes = new Hono<AppEnv>()

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { verifier, challenge }
}

async function generateToken(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

authRoutes.get('/login', async (c) => {
  const { verifier, challenge } = await generatePKCE()
  const state = await generateToken()

  // Store verifier + state temporarily in a short-lived cookie
  setCookie(c, 'pkce_verifier', verifier, {
    httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 300, path: '/',
  })
  setCookie(c, 'oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 300, path: '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.AUTHENTIK_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/auth/callback`,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return c.redirect(`${c.env.AUTHENTIK_URL}/application/o/authorize/?${params}`)
})

authRoutes.get('/callback', async (c) => {
  const { code, state, error } = c.req.query()

  if (error) return c.text(`Auth error: ${error}`, 400)
  if (!code || !state) return c.text('Missing code or state', 400)

  const { getCookie: gc } = await import('hono/cookie')
  const storedState = gc(c, 'oauth_state')
  const verifier = gc(c, 'pkce_verifier')

  if (!storedState || state !== storedState || !verifier) {
    return c.text('Invalid state — possible CSRF', 400)
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${c.env.AUTHENTIK_URL}/application/o/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${c.env.APP_URL}/auth/callback`,
      client_id: c.env.AUTHENTIK_CLIENT_ID,
      client_secret: c.env.AUTHENTIK_CLIENT_SECRET,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return c.text(`Token exchange failed: ${err}`, 500)
  }

  const tokens = await tokenRes.json<{ access_token: string }>()

  // Fetch user info
  const userRes = await fetch(`${c.env.AUTHENTIK_URL}/application/o/userinfo/`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) return c.text('Failed to fetch user info', 500)

  const userInfo = await userRes.json<{ email: string; name: string }>()

  // Create session (7-day expiry)
  const sessionToken = await generateToken()
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7

  await c.env.DB
    .prepare('INSERT INTO sessions (token, user_email, user_name, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionToken, userInfo.email, userInfo.name, expiresAt)
    .run()

  deleteCookie(c, 'pkce_verifier', { path: '/' })
  deleteCookie(c, 'oauth_state', { path: '/' })

  setCookie(c, 'session', sessionToken, {
    httpOnly: true, secure: true, sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 7, path: '/',
  })

  return c.redirect('/')
})

authRoutes.get('/logout', async (c) => {
  const { getCookie: gc } = await import('hono/cookie')
  const token = gc(c, 'session')
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.redirect('/auth/login')
})
