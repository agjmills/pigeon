import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { getUserByEmail, getUserPermissions } from '../lib/db'

const NO_ACCESS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No access — Pigeon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background: #f5f2ee; color: #1c1814; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .card { background: #fff; border: 1px solid #dbd5cd; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.08); padding: 32px 36px; max-width: 420px; text-align: center; }
    h1 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
    p { font-size: 13.5px; color: #6b6560; line-height: 1.55; margin: 0 0 20px; }
    a { display: inline-flex; padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; background: #6b6560; color: #fff; text-decoration: none; }
    a:hover { background: #4a4540; }
  </style>
  <script>(function(){if(localStorage.getItem('theme')==='dark'||(!localStorage.getItem('theme')&&matchMedia('(prefers-color-scheme:dark)').matches)){var s=document.querySelector('style');s.textContent+='body{background:#131009;color:#ede7df}.card{background:#211e18;border-color:#2d2a24}.p{color:#998f86}'}})()</script>
</head>
<body>
  <div class="card">
    <h1>No access</h1>
    <p>You don't have permission to access Pigeon. Contact your administrator to be granted access.</p>
    <a href="/auth/logout">Sign out</a>
  </div>
</body>
</html>`

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) return c.redirect('/auth/login')

  const session = await c.env.DB
    .prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > unixepoch()')
    .bind(token)
    .first<{ user_email: string; user_name: string }>()

  if (!session) return c.redirect('/auth/login')

  const [user, permissions] = await Promise.all([
    getUserByEmail(c.env.DB, session.user_email),
    getUserPermissions(c.env.DB, session.user_email),
  ])

  // Fail closed: user must exist in users table and have either admin or at least one permission
  if (!user || (!user.is_admin && permissions.length === 0)) {
    return c.html(NO_ACCESS_PAGE, 403)
  }

  c.set('user', { email: session.user_email, name: session.user_name ?? session.user_email, isAdmin: user.is_admin === 1 })
  c.set('isAdmin', user.is_admin === 1)
  c.set('permissions', permissions)
  await next()
})
