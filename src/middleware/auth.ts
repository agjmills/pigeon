import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) return c.redirect('/auth/login')

  const session = await c.env.DB
    .prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > unixepoch()')
    .bind(token)
    .first<{ user_email: string; user_name: string }>()

  if (!session) return c.redirect('/auth/login')

  c.set('user', { email: session.user_email, name: session.user_name ?? session.user_email })
  await next()
})
