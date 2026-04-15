import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getMailboxes, getConversations, getMailboxCounts } from '../lib/db'
import { layout } from '../views/layout'
import { inboxView } from '../views/inbox'

export const inboxRoutes = new Hono<AppEnv>()

inboxRoutes.get('/', async (c) => {
  const user = c.get('user')
  const mailbox = c.req.query('mailbox')
  const status = c.req.query('status') ?? 'open'

  const [mailboxes, conversations, counts] = await Promise.all([
    getMailboxes(c.env.DB),
    getConversations(c.env.DB, { mailbox, status }),
    getMailboxCounts(c.env.DB),
  ])

  const content = inboxView(conversations, { mailbox, status })
  return c.html(layout(content, { user, mailboxes, counts, activeMailbox: mailbox }))
})

// Simple mailbox creation form
inboxRoutes.get('/mailboxes/new', async (c) => {
  const user = c.get('user')
  const [mailboxes, counts] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
  ])

  const content = `
    <div class="max-w-md mx-auto mt-12 px-4">
      <h2 class="text-lg font-semibold text-gray-900 mb-6">Add mailbox</h2>
      <form method="POST" action="/mailboxes" class="space-y-4"
            hx-post="/mailboxes" hx-target="body" hx-push-url="/">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input type="email" name="email" required placeholder="support@cleargym.uk"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Display name</label>
          <input type="text" name="name" required placeholder="ClearGym Support"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <button type="submit"
                class="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
          Add mailbox
        </button>
      </form>
    </div>`

  return c.html(layout(content, { user, mailboxes, counts, title: 'Add mailbox' }))
})

inboxRoutes.post('/mailboxes', async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()

  if (!email || !name) return c.text('Missing fields', 400)

  await c.env.DB
    .prepare('INSERT OR IGNORE INTO mailboxes (email, name) VALUES (?, ?)')
    .bind(email, name)
    .run()

  return c.redirect('/')
})
