import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getMailboxes, getConversations, getMailboxCounts,
  getMailboxById, updateMailboxName, deleteMailbox,
  getDomains, getDomainByName, createDomain,
  updateDomainCf, updateDomainResend,
  createMailbox, updateMailboxCfRuleId, getMailboxesByDomain,
  deleteDomain,
} from '../lib/db'
import {
  getZoneId, createDnsRecord, createRoutingRule, deleteRoutingRule,
} from '../lib/cloudflare'
import { setupResendDomain } from '../lib/resend'
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

// ── Add mailbox ───────────────────────────────────────────────────────────────

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

  const domainName = email.split('@')[1]
  if (!domainName) return c.text('Invalid email', 400)

  const user = c.get('user')
  let cfError: string | null = null

  // Step 1: ensure domain record exists
  const domainId = await createDomain(c.env.DB, domainName)
  let domain = await getDomainByName(c.env.DB, domainName)

  // Step 2: ensure domain has CF zone ID
  if (!domain!.cf_zone_id) {
    try {
      const zoneId = await getZoneId(c.env.CF_EMAIL_TOKEN, domainName)
      await updateDomainCf(c.env.DB, domainId, zoneId)
      domain = await getDomainByName(c.env.DB, domainName)
    } catch (err) {
      cfError = err instanceof Error ? err.message : String(err)
    }
  }

  // Step 3: ensure Resend domain is set up + DNS records added to CF
  if (!cfError && !domain!.resend_domain_id) {
    try {
      const { id: resendDomainId, records } = await setupResendDomain(c.env.RESEND_API_KEY, domainName)
      await updateDomainResend(c.env.DB, domainId, resendDomainId)

      // Add DNS records to Cloudflare automatically
      const zoneId = domain!.cf_zone_id!
      const dnsErrors: string[] = []
      for (const rec of records) {
        if (rec.record === 'DKIM' || rec.record === 'SPF') {
          try {
            await createDnsRecord(c.env.CF_EMAIL_TOKEN, zoneId, {
              type: rec.type,
              name: rec.name,
              content: rec.value,
              ...(rec.priority !== undefined ? { priority: rec.priority } : {}),
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!msg.includes('already exists')) dnsErrors.push(`${rec.name}: ${msg}`)
          }
        }
      }
      if (dnsErrors.length) throw new Error(`DNS record errors: ${dnsErrors.join('; ')}`)
    } catch (err) {
      cfError = err instanceof Error ? err.message : String(err)
    }
  }

  // Step 4: create mailbox in DB
  const mailboxId = await createMailbox(c.env.DB, { email, name, domain_id: domainId })

  // Step 5: create CF routing rule
  if (!cfError && domain!.cf_zone_id) {
    try {
      const ruleId = await createRoutingRule(c.env.CF_EMAIL_TOKEN, domain!.cf_zone_id, email, 'pigeon')
      await updateMailboxCfRuleId(c.env.DB, mailboxId, ruleId)
    } catch (err) {
      cfError = err instanceof Error ? err.message : String(err)
    }
  }

  if (cfError) {
    const [mailboxes, counts] = await Promise.all([
      getMailboxes(c.env.DB),
      getMailboxCounts(c.env.DB),
    ])
    return c.html(layout(
      mailboxForm({ error: `Mailbox saved but setup failed: ${cfError}`, email, name }),
      { user, mailboxes, counts, title: 'Add mailbox' }
    ))
  }

  return c.redirect('/')
})

// ── Edit mailbox ──────────────────────────────────────────────────────────────

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

  // Delete CF routing rule
  if (mailbox.cf_rule_id && mailbox.domain_id) {
    const domains = await getDomains(c.env.DB)
    const domain = domains.find(d => d.id === mailbox.domain_id)
    if (domain?.cf_zone_id) {
      try {
        await deleteRoutingRule(c.env.CF_EMAIL_TOKEN, domain.cf_zone_id, mailbox.cf_rule_id)
      } catch (err) {
        console.error('Failed to delete CF routing rule:', err)
      }
    }
  }

  await deleteMailbox(c.env.DB, id)

  // Clean up domain if no mailboxes remain
  if (mailbox.domain_id) {
    const remaining = await getMailboxesByDomain(c.env.DB, mailbox.domain_id)
    if (remaining.length === 0) {
      await deleteDomain(c.env.DB, mailbox.domain_id)
    }
  }

  return c.redirect('/')
})

// ── Views ─────────────────────────────────────────────────────────────────────

function mailboxForm(opts: { error?: string; email?: string; name?: string } = {}): string {
  return `
    <div class="max-w-md mx-auto mt-12 px-4">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Add mailbox</h2>
      ${opts.error ? `<div class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-400">${escapeHtml(opts.error)}</div>` : ''}
      <form method="POST" action="/mailboxes" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email address</label>
          <input type="email" name="email" required value="${escapeHtml(opts.email ?? '')}"
                 placeholder="support@example.com"
                 class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display name</label>
          <input type="text" name="name" required value="${escapeHtml(opts.name ?? '')}"
                 placeholder="Acme Support"
                 class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <button type="submit"
                class="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
          Add mailbox
        </button>
      </form>
      <p class="mt-3 text-xs text-gray-400 dark:text-gray-500">
        Cloudflare Email Routing and Resend will be configured automatically.
      </p>
    </div>`
}

function editMailboxForm(id: number, name: string, email: string): string {
  return `
    <div class="max-w-md mx-auto mt-12 px-4">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Edit mailbox</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">${escapeHtml(email)}</p>
      <form method="POST" action="/mailboxes/${id}/edit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display name</label>
          <input type="text" name="name" required value="${escapeHtml(name)}"
                 class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div class="flex gap-3">
          <button type="submit"
                  class="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
            Save
          </button>
          <a href="/" class="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </a>
        </div>
      </form>
      <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-medium text-red-700 dark:text-red-400 mb-2">Danger zone</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
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
