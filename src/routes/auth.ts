import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'

export const authRoutes = new Hono<AppEnv>()

type OIDCConfig = {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

async function discoverOIDC(issuer: string): Promise<OIDCConfig> {
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OIDC discovery failed for ${url}: ${res.status}`)
  return res.json<OIDCConfig>()
}

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
  const oidc = await discoverOIDC(c.env.OIDC_ISSUER)
  const { verifier, challenge } = await generatePKCE()
  const state = await generateToken()

  setCookie(c, 'pkce_verifier', verifier, {
    httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 300, path: '/',
  })
  setCookie(c, 'oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 300, path: '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/auth/callback`,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return c.redirect(`${oidc.authorization_endpoint}?${params}`)
})

authRoutes.get('/callback', async (c) => {
  const { code, state, error } = c.req.query()

  if (error) return c.text(`Auth error: ${error}`, 400)
  if (!code || !state) return c.text('Missing code or state', 400)

  const storedState = getCookie(c, 'oauth_state')
  const verifier = getCookie(c, 'pkce_verifier')

  if (!storedState || state !== storedState || !verifier) {
    return c.text('Invalid state — possible CSRF', 400)
  }

  const oidc = await discoverOIDC(c.env.OIDC_ISSUER)

  const tokenRes = await fetch(oidc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${c.env.APP_URL}/auth/callback`,
      client_id: c.env.OIDC_CLIENT_ID,
      client_secret: c.env.OIDC_CLIENT_SECRET,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return c.text(`Token exchange failed: ${err}`, 500)
  }

  const tokens = await tokenRes.json<{ access_token: string }>()

  const userRes = await fetch(oidc.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) return c.text('Failed to fetch user info', 500)

  const userInfo = await userRes.json<{ email: string; name: string }>()

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
  const token = getCookie(c, 'session')
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.redirect('/auth/login')
})
