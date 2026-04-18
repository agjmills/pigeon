import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getCustomerByEmail, setCustomerOptedOut } from '../lib/db'
import { verifyUnsubscribeToken } from '../lib/unsubscribe'

export const unsubscribeRoutes = new Hono<AppEnv>()

unsubscribeRoutes.get('/:token', async (c) => {
  const secret = c.env.UNSUBSCRIBE_SECRET
  if (!secret) return c.text('Unsubscribe not configured', 500)

  const token = decodeURIComponent(c.req.param('token'))
  const email = await verifyUnsubscribeToken(token, secret)

  if (!email) {
    return c.html(page('Invalid or expired unsubscribe link.', false))
  }

  const customer = await getCustomerByEmail(c.env.DB, email)
  if (customer && !customer.opted_out_at) {
    await setCustomerOptedOut(c.env.DB, customer.id, true)
  }

  return c.html(page(`You have been unsubscribed. The address ${escHtml(email)} will no longer receive marketing emails.`, true))
})

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function page(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; color: #333; }
    .icon { font-size: 2rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #555; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="icon">${success ? '✓' : '✗'}</div>
  <h1>${success ? 'Unsubscribed' : 'Invalid link'}</h1>
  <p>${message}</p>
</body>
</html>`
}
