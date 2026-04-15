import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getMailboxes, getConversations, getMailboxCounts,
  getMailboxById, updateMailboxName, updateMailboxCfIds, deleteMailbox,
} from '../lib/db'
import {
  getZoneId, enableEmailRouting, createRoutingRule, deleteRoutingRule,
} from '../lib/cloudflare'
import { layout, escapeHtml } from '../views/layout'
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

// ── Add mailbox ──────────────────────────────────────────────────────────────

inboxRoutes.get('/mailboxes/new', async (c) => {
  const user = c.get('user')
  const [mailboxes, counts] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
  ])
  return c.html(layout(mailboxForm(), { user, mailboxes, counts, title: 'Add mailbox' }))
})

inboxRoutes.post('/mailboxes', async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()

  if (!email || !name) return c.text('Missing fields', 400)

  const result = await c.env.DB
    .prepare('INSERT OR IGNORE INTO mailboxes (email, name) VALUES (?, ?)')
    .bind(email, name)
    .run()

  const mailboxId = result.meta.last_row_id as number

  // Auto-configure Cloudflare Email Routing
  let cfError: string | null = null
  try {
    const domain = email.split('@')[1]
    const zoneId = await getZoneId(c.env.CLOUDFLARE_API_TOKEN, domain)
    await enableEmailRouting(c.env.CLOUDFLARE_API_TOKEN, zoneId)
    const ruleId = await createRoutingRule(
      c.env.CLOUDFLARE_API_TOKEN, zoneId, email, 'pigeon'
    )
    await updateMailboxCfIds(c.env.DB, mailboxId, zoneId, ruleId)
  } catch (err) {
    cfError = err instanceof Error ? err.message : String(err)
    console.error('CF routing setup failed:', cfError)
  }

  if (cfError) {
    const user = c.get('user')
    const [mailboxes, counts] = await Promise.all([
      getMailboxes(c.env.DB),
      getMailboxCounts(c.env.DB),
    ])
    return c.html(layout(
      mailboxForm({ error: `Mailbox saved but Cloudflare routing setup failed: ${cfError}`, email, name }),
      { user, mailboxes, counts, title: 'Add mailbox' }
    ))
  }

  return c.redirect('/')
})

// ── Edit mailbox ─────────────────────────────────────────────────────────────

inboxRoutes.get('/mailboxes/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [mailbox, mailboxes, counts] = await Promise.all([
    getMailboxById(c.env.DB, id),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
  ])

  if (!mailbox) return c.notFound()

  return c.html(layout(
    editMailboxForm(mailbox.id, mailbox.name, mailbox.email),
    { user, mailboxes, counts, title: 'Edit mailbox' }
  ))
})

inboxRoutes.post('/mailboxes/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const name = String(body.name ?? '').trim()

  if (!name) return c.text('Missing name', 400)

  await updateMailboxName(c.env.DB, id, name)
  return c.redirect('/')
})

// ── Delete mailbox ────────────────────────────────────────────────────────────

inboxRoutes.post('/mailboxes/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'))

  const mailbox = await getMailboxById(c.env.DB, id)
  if (!mailbox) return c.notFound()

  if (mailbox.cf_zone_id && mailbox.cf_rule_id) {
    try {
      await deleteRoutingRule(
        c.env.CLOUDFLARE_API_TOKEN, mailbox.cf_zone_id, mailbox.cf_rule_id
      )
    } catch (err) {
      console.error('Failed to delete CF routing rule:', err)
    }
  }

  await deleteMailbox(c.env.DB, id)
  return c.redirect('/')
})

// ── Views ─────────────────────────────────────────────────────────────────────

function mailboxForm(opts: { error?: string; email?: string; name?: string } = {}): string {
  return `
    <div class="max-w-md mx-auto mt-12 px-4">
      <h2 class="text-lg font-semibold text-gray-900 mb-6">Add mailbox</h2>
      ${opts.error ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">${escapeHtml(opts.error)}</div>` : ''}
      <form method="POST" action="/mailboxes" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input type="email" name="email" required value="${escapeHtml(opts.email ?? '')}"
                 placeholder="support@cleargym.uk"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Display name</label>
          <input type="text" name="name" required value="${escapeHtml(opts.name ?? '')}"
                 placeholder="ClearGym Support"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <button type="submit"
                class="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
          Add mailbox
        </button>
      </form>
      <p class="mt-3 text-xs text-gray-400">
        Cloudflare Email Routing will be configured automatically.
      </p>
    </div>`
}

function editMailboxForm(id: number, name: string, email: string): string {
  return `
    <div class="max-w-md mx-auto mt-12 px-4">
      <h2 class="text-lg font-semibold text-gray-900 mb-1">Edit mailbox</h2>
      <p class="text-sm text-gray-500 mb-6">${escapeHtml(email)}</p>
      <form method="POST" action="/mailboxes/${id}/edit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Display name</label>
          <input type="text" name="name" required value="${escapeHtml(name)}"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div class="flex gap-3">
          <button type="submit"
                  class="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
            Save
          </button>
          <a href="/" class="flex-1 px-4 py-2 text-center border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">
            Cancel
          </a>
        </div>
      </form>
      <div class="mt-8 pt-6 border-t border-gray-200">
        <h3 class="text-sm font-medium text-red-700 mb-2">Danger zone</h3>
        <p class="text-xs text-gray-500 mb-3">
          Deletes the mailbox and removes the Cloudflare Email Routing rule.
          Existing conversations are not deleted.
        </p>
        <form method="POST" action="/mailboxes/${id}/delete"
              onsubmit="return confirm('Delete ${escapeHtml(email)}? This will remove the Cloudflare routing rule.')">
          <button type="submit"
                  class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700">
            Delete mailbox
          </button>
        </form>
      </div>
    </div>`
}
