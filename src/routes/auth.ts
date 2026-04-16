import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { escapeHtml } from '../views/layout'

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

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error — Pigeon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background: #f5f2ee; color: #1c1814; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .card { background: #fff; border: 1px solid #dbd5cd; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.08); padding: 32px 36px; max-width: 420px; text-align: center; }
    h1 { font-size: 16px; font-weight: 600; color: #d03030; margin: 0 0 10px; }
    p { font-size: 13.5px; color: #6b6560; line-height: 1.55; margin: 0 0 20px; }
    a { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; background: #c04a1e; color: #fff; text-decoration: none; transition: background 100ms; }
    a:hover { background: #a63d18; }
  </style>
  <script>(function(){if(localStorage.getItem('theme')==='dark'||(!localStorage.getItem('theme')&&matchMedia('(prefers-color-scheme:dark)').matches)){var s=document.querySelector('style');s.textContent+=
    'body{background:#131009;color:#ede7df} .card{background:#211e18;border-color:#2d2a24;box-shadow:0 4px 12px rgba(0,0,0,.3)} h1{color:#f87171} p{color:#998f86} a{background:#e0602c} a:hover{background:#cc5224}'
  }})()</script>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <a href="/auth/login">Try signing in again</a>
  </div>
</body>
</html>`
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

  if (error) return c.html(errorPage(`Auth error: ${escapeHtml(error)}`), 400)
  if (!code || !state) return c.html(errorPage('Missing code or state'), 400)

  const storedState = getCookie(c, 'oauth_state')
  const verifier = getCookie(c, 'pkce_verifier')

  if (!storedState || state !== storedState || !verifier) {
    return c.html(errorPage('Invalid state — possible CSRF'), 400)
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
    return c.html(errorPage(`Token exchange failed: ${escapeHtml(err)}`), 500)
  }

  const tokens = await tokenRes.json<{ access_token: string }>()

  const userRes = await fetch(oidc.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) return c.html(errorPage('Failed to fetch user info'), 500)

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
