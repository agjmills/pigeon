import { accessibleMailboxIds, canReadMailbox, canSendFrom } from '../lib/permissions'
import { Hono } from 'hono'
import type { AppEnv, Domain } from '../types'
import {
  getMailboxes, getConversations, getMailboxCounts, getUnreadCounts,
  getMailboxById, getMailboxByEmail, updateMailboxName, deleteMailbox,
  getDomains, getDomainByName, getDomainById, createDomain,
  updateDomainCf, updateDomainProvider, updateDomainDnsRecordIds, updateDomainCatchallRule,
  updateDomainProviderVerified, updateDomainCatchallMailbox,
  createMailbox, updateMailboxCfRuleId, updateMailboxSenderName, getMailboxesByDomain, deleteDomain,
  createConversation, createMessage,
  searchConversations, getConversationsByTag, getTagsForConversations, getTagById,
  createAuditEntry,
} from '../lib/db'
import {
  getZoneId, createDnsRecord, deleteDnsRecord,
  createRoutingRule, deleteRoutingRule, createCatchallRule,
} from '../lib/cloudflare'
import { createEmailProvider, supportsDomainManagement } from '../lib/email-provider'
import { layout, escapeHtml } from '../views/layout'
import { inboxView } from '../views/inbox'

export const inboxRoutes = new Hono<AppEnv>()

inboxRoutes.get('/', async (c) => {
  const user = c.get('user')
  const mailbox = c.req.query('mailbox')
  const status = c.req.query('status') ?? 'open'
  const search = c.req.query('q')?.trim() || undefined
  const tagFilter = c.req.query('tag') ? parseInt(c.req.query('tag')!) : undefined

  const [mailboxes, counts, unreadCounts, domains] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])

  const permissions = c.get('permissions')
  const isAdmin = c.get('isAdmin')
  const allowedIds = accessibleMailboxIds(permissions, isAdmin, mailboxes)
  // If filtering to a specific mailbox, verify access first
  if (mailbox) {
    const mb = mailboxes.find(m => m.email === mailbox)
    if (!canReadMailbox(permissions, isAdmin, mb?.id ?? -1, mb?.domain_id ?? -1)) {
      return c.text('Forbidden', 403)
    }
  }

  let conversations
  let tagName: string | undefined
  if (search) {
    conversations = await searchConversations(c.env.DB, search, { mailbox, status })
  } else if (tagFilter) {
    const tag = await getTagById(c.env.DB, tagFilter)
    tagName = tag?.name
    conversations = tag ? await getConversationsByTag(c.env.DB, tagFilter, { mailbox, status }) : []
  } else {
    conversations = await getConversations(c.env.DB, { mailbox, status })
  }

  // Filter conversations to only those in accessible mailboxes
  if (!isAdmin) {
    conversations = conversations.filter(conv => {
      const mb = mailboxes.find(m => m.email === conv.mailbox_email)
      return mb && allowedIds.includes(mb.id)
    })
  }

  const convIds = conversations.map(c => c.id)
  const tagsByConv = await getTagsForConversations(c.env.DB, convIds)

  const content = inboxView(conversations, { mailbox, status, search, tag: tagFilter?.toString(), tagName }, tagsByConv)
  return c.html(layout(content, { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, activeMailbox: mailbox }))
})

// ── Add mailbox ───────────────────────────────────────────────────────────────

inboxRoutes.get('/mailboxes/new', async (c) => {
  const user = c.get('user')
  const domainId = c.req.query('domain') ? parseInt(c.req.query('domain')!) : undefined
  const [mailboxes, counts, unreadCounts, domains] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])
  return c.html(layout(mailboxForm({ domains, selectedDomainId: domainId }), { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'Add mailbox' }))
})

inboxRoutes.post('/mailboxes', async (c) => {
  const body = await c.req.parseBody()
  const rawLocal = String(body.local ?? '').trim().toLowerCase()
  const localPart = rawLocal.includes('@') ? rawLocal.split('@')[0] : rawLocal
  const selectedDomainId = body.domain_id ? parseInt(String(body.domain_id)) : null
  const newDomainName = String(body.new_domain ?? '').trim().toLowerCase()
  const user = c.get('user')
  let cfError: string | null = null

  // Resolve domain name
  let domainName: string
  if (selectedDomainId) {
    const d = await getDomainById(c.env.DB, selectedDomainId)
    if (!d) return c.text('Domain not found', 400)
    domainName = d.domain
  } else if (newDomainName) {
    domainName = newDomainName
  } else {
    return c.text('Missing domain', 400)
  }

  const name = String(body.name ?? '').trim()
  if (!localPart || !name) return c.text('Missing fields', 400)
  const email = `${localPart}@${domainName}`

  // Reject duplicates before touching DB or CF
  const existing = await getMailboxByEmail(c.env.DB, email)
  if (existing) {
    const [mailboxes, counts, unreadCounts, domains] = await Promise.all([
      getMailboxes(c.env.DB), getMailboxCounts(c.env.DB), getUnreadCounts(c.env.DB), getDomains(c.env.DB),
    ])
    return c.html(layout(
      mailboxForm({ error: `${email} is already configured as a mailbox.`, domains, localPart, name }),
      { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'Add mailbox' }
    ))
  }

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

  // Step 3: ensure email provider domain is set up + DNS records added to CF
  const emailProvider = createEmailProvider(c.env)
  if (!cfError && !domain!.provider_domain_id && supportsDomainManagement(emailProvider)) {
    try {
      const { domainId: providerDomainId, records } = await emailProvider.setupDomain(domainName)
      await updateDomainProvider(c.env.DB, domainId, providerDomainId)

      const zoneId = domain!.cf_zone_id!
      const dnsRecordIds: string[] = []
      const dnsErrors: string[] = []
      for (const rec of records) {
        if (rec.purpose === 'dkim' || rec.purpose === 'spf') {
          try {
            const recordId = await createDnsRecord(c.env.CF_EMAIL_TOKEN, zoneId, {
              type: rec.type,
              name: rec.name,
              content: rec.value,
              ...(rec.priority !== undefined ? { priority: rec.priority } : {}),
            })
            dnsRecordIds.push(recordId)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!msg.includes('already exists')) dnsErrors.push(`${rec.name}: ${msg}`)
          }
        }
      }
      if (dnsRecordIds.length) await updateDomainDnsRecordIds(c.env.DB, domainId, dnsRecordIds)
      if (dnsErrors.length) throw new Error(`DNS record errors: ${dnsErrors.join('; ')}`)

      // Trigger domain verification now that DNS records are in place
      const verified = await emailProvider.verifyDomain(providerDomainId)
      if (verified) await updateDomainProviderVerified(c.env.DB, domainId, true)
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

  const [mailboxes, counts, unreadCounts, domains] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])

  if (cfError) {
    return c.html(layout(
      mailboxForm({ error: `Mailbox saved but setup failed: ${cfError}`, domains, localPart, name }),
      { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'Add mailbox' }
    ))
  }

  return c.redirect('/')
})

// ── Edit mailbox ──────────────────────────────────────────────────────────────

inboxRoutes.get('/mailboxes/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [mailbox, mailboxes, counts, unreadCounts, domains] = await Promise.all([
    getMailboxById(c.env.DB, id),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])

  if (!mailbox) return c.notFound()

  return c.html(layout(
    editMailboxForm(mailbox.id, mailbox.name, mailbox.email, mailbox.sender_name),
    { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'Edit mailbox' }
  ))
})

inboxRoutes.post('/mailboxes/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const name = String(body.name ?? '').trim()
  const senderName = String(body.sender_name ?? '').trim() || null

  if (!name) return c.text('Missing name', 400)

  await updateMailboxName(c.env.DB, id, name)
  await updateMailboxSenderName(c.env.DB, id, senderName)
  return c.redirect('/')
})

// ── Delete mailbox ────────────────────────────────────────────────────────────

inboxRoutes.post('/mailboxes/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'))

  const mailbox = await getMailboxById(c.env.DB, id)
  if (!mailbox) return c.notFound()

  if (mailbox.cf_rule_id && mailbox.domain_id) {
    const domain = await getDomainById(c.env.DB, mailbox.domain_id)
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
      await cleanupDomain(c.env, mailbox.domain_id)
    }
  }

  return c.redirect('/')
})

// ── Domain management ─────────────────────────────────────────────────────────

inboxRoutes.get('/domains/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [domain, mailboxes, counts, unreadCounts, allMailboxes, domains] = await Promise.all([
    getDomainById(c.env.DB, id),
    getMailboxesByDomain(c.env.DB, id),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
  ])

  if (!domain) return c.notFound()

  return c.html(layout(
    domainSettingsView(domain, mailboxes, counts),
    { user, mailboxes: allMailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: `${domain.domain} settings` }
  ))
})

inboxRoutes.post('/domains/:id/catchall', async (c) => {
  const id = parseInt(c.req.param('id'))
  const domain = await getDomainById(c.env.DB, id)
  if (!domain) return c.notFound()

  if (domain.cf_catchall_rule_id) {
    // Disable catch-all
    if (domain.cf_zone_id) {
      try {
        await deleteRoutingRule(c.env.CF_EMAIL_TOKEN, domain.cf_zone_id, domain.cf_catchall_rule_id)
      } catch (err) {
        console.error('Failed to delete catch-all rule:', err)
      }
    }
    await updateDomainCatchallRule(c.env.DB, id, null)
  } else {
    // Enable catch-all
    if (domain.cf_zone_id) {
      try {
        const ruleId = await createCatchallRule(c.env.CF_EMAIL_TOKEN, domain.cf_zone_id, 'pigeon')
        await updateDomainCatchallRule(c.env.DB, id, ruleId)
      } catch (err) {
        console.error('Failed to create catch-all rule:', err)
      }
    }
  }

  return c.redirect(`/domains/${id}`)
})

inboxRoutes.post('/domains/:id/catchall-mailbox', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').trim() || null
  await updateDomainCatchallMailbox(c.env.DB, id, email)
  return c.redirect(`/domains/${id}`)
})

inboxRoutes.post('/domains/:id/verify', async (c) => {
  const id = parseInt(c.req.param('id'))
  const domain = await getDomainById(c.env.DB, id)
  if (!domain || !domain.provider_domain_id) return c.redirect(`/domains/${id}`)

  const emailProvider = createEmailProvider(c.env)
  if (!supportsDomainManagement(emailProvider)) return c.redirect(`/domains/${id}`)

  const verified = await emailProvider.verifyDomain(domain.provider_domain_id)
  await updateDomainProviderVerified(c.env.DB, id, verified)

  return c.redirect(`/domains/${id}`)
})

inboxRoutes.post('/domains/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'))
  const domain = await getDomainById(c.env.DB, id)
  if (!domain) return c.notFound()

  // Delete all mailbox routing rules
  const mailboxes = await getMailboxesByDomain(c.env.DB, id)
  for (const mb of mailboxes) {
    if (mb.cf_rule_id && domain.cf_zone_id) {
      try {
        await deleteRoutingRule(c.env.CF_EMAIL_TOKEN, domain.cf_zone_id, mb.cf_rule_id)
      } catch {}
    }
    await deleteMailbox(c.env.DB, mb.id)
  }

  await cleanupDomain(c.env, id)

  return c.redirect('/')
})

// ── Compose ───────────────────────────────────────────────────────────────────

inboxRoutes.get('/compose', async (c) => {
  const user = c.get('user')
  const toEmail = c.req.query('to') ?? ''
  const [allMailboxes, counts, unreadCounts, domains] = await Promise.all([
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])
  const permissions = c.get('permissions')
  const isAdmin = c.get('isAdmin')
  const sendableMailboxes = allMailboxes.filter(mb =>
    canSendFrom(permissions, isAdmin, mb.id, mb.domain_id ?? -1)
  )
  return c.html(layout(composeForm({ mailboxes: sendableMailboxes, toEmail }), {
    user, mailboxes: allMailboxes, accessibleMailboxIds: accessibleMailboxIds(permissions, isAdmin, allMailboxes),
    counts, unreadCounts, domains, title: 'New message',
  }))
})

inboxRoutes.post('/compose', async (c) => {
  const user = c.get('user')
  const body = await c.req.parseBody()
  const from = String(body.from ?? '').trim()
  const to = String(body.to ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const bodyHtml = String(body.body_html ?? '').trim()
  const bodyText = String(body.body_text ?? '').trim()

  if (!from || !to || !subject || (!bodyText && !bodyHtml)) {
    const [mailboxes, counts, unreadCounts, domains] = await Promise.all([
      getMailboxes(c.env.DB), getMailboxCounts(c.env.DB), getUnreadCounts(c.env.DB), getDomains(c.env.DB),
    ])
    return c.html(layout(
      composeForm({ mailboxes, toEmail: to, subject, error: 'All fields are required.' }),
      { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'New message' }
    ))
  }

  const mailboxes = await getMailboxes(c.env.DB)
  const fromMailbox = mailboxes.find(mb => mb.email === from)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), fromMailbox?.id ?? -1, fromMailbox?.domain_id ?? -1)) {
    const [counts, unreadCounts, domains] = await Promise.all([
      getMailboxCounts(c.env.DB), getUnreadCounts(c.env.DB), getDomains(c.env.DB),
    ])
    const sendable = mailboxes.filter(mb => canSendFrom(c.get('permissions'), c.get('isAdmin'), mb.id, mb.domain_id ?? -1))
    return c.html(layout(
      composeForm({ mailboxes: sendable, toEmail: to, subject, error: 'You do not have permission to send from that mailbox.' }),
      { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), counts, unreadCounts, domains, title: 'New message' }
    ))
  }
  const mailbox = fromMailbox

  const trackingToken = crypto.randomUUID()
  const pixelUrl = `${c.env.APP_URL}/t/${trackingToken}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`
  const htmlWithPixel = bodyHtml ? bodyHtml + pixel : null

  const emailProvider = createEmailProvider(c.env)
  const { messageId } = await emailProvider.send({
    from,
    fromName: mailbox?.sender_name || mailbox?.name || from,
    to,
    subject,
    text: bodyText || bodyHtml.replace(/<[^>]*>/g, ''),
    html: htmlWithPixel,
  })

  const conversationId = await createConversation(c.env.DB, {
    mailbox_email: from,
    subject,
    customer_email: to,
    customer_name: null,
  })

  await createMessage(c.env.DB, {
    conversation_id: conversationId,
    direction: 'outbound',
    from_email: from,
    from_name: user.name,
    to_email: to,
    subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    message_id: messageId,
    tracking_token: trackingToken,
  })

  c.executionCtx.waitUntil(createAuditEntry(c.env.DB, {
    user_email: user.email,
    user_name: user.name,
    action: 'compose_sent',
    conversation_id: conversationId,
    mailbox_email: from,
    metadata: { to, subject },
  }))

  return c.redirect(`/c/${conversationId}`)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cleanupDomain(
  env: import('../types').Bindings,
  domainId: number
): Promise<void> {
  const domain = await getDomainById(env.DB, domainId)
  if (!domain) return

  // Delete catch-all rule
  if (domain.cf_catchall_rule_id && domain.cf_zone_id) {
    try {
      await deleteRoutingRule(env.CF_EMAIL_TOKEN, domain.cf_zone_id, domain.cf_catchall_rule_id)
    } catch {}
  }

  // Delete DKIM/SPF DNS records
  if (domain.cf_dns_record_ids && domain.cf_zone_id) {
    const ids: string[] = JSON.parse(domain.cf_dns_record_ids)
    for (const recordId of ids) {
      try {
        await deleteDnsRecord(env.CF_EMAIL_TOKEN, domain.cf_zone_id, recordId)
      } catch {}
    }
  }

  // Delete provider domain
  if (domain.provider_domain_id) {
    const emailProvider = createEmailProvider(env)
    if (supportsDomainManagement(emailProvider)) {
      try {
        await emailProvider.deleteDomain(domain.provider_domain_id)
      } catch {}
    }
  }

  await deleteDomain(env.DB, domainId)
}

// ── Views ─────────────────────────────────────────────────────────────────────

function mailboxForm(opts: {
  domains: Domain[]
  error?: string
  localPart?: string
  name?: string
  selectedDomainId?: number
} = { domains: [] }): string {
  const domainOptions = opts.domains.map(d =>
    `<option value="${d.id}" ${opts.selectedDomainId === d.id ? 'selected' : ''}>${escapeHtml(d.domain)}</option>`
  ).join('')

  return `
    <div class="page-wrap">
      <h2 class="page-title">Add mailbox</h2>
      ${opts.error ? `<div class="alert alert-error mb-4">${escapeHtml(opts.error)}</div>` : ''}
      <form method="POST" action="/mailboxes" class="space-y-4" id="mailbox-form">
        <div>
          <label class="field-label">Domain</label>
          <select name="domain_id" id="domain-select"
                  onchange="document.getElementById('new-domain-row').style.display=this.value?'none':'block'"
                  class="field">
            ${opts.domains.length ? '' : '<option value="">— add new domain —</option>'}
            ${domainOptions}
            ${opts.domains.length ? '<option value="">+ Add new domain…</option>' : ''}
          </select>
        </div>
        <div id="new-domain-row" style="display:${opts.domains.length ? 'none' : 'block'}">
          <label class="field-label">Domain name</label>
          <input type="text" name="new_domain" placeholder="example.com" class="field">
        </div>
        <div>
          <label class="field-label">Local part <span style="font-weight:400;color:var(--t3)">(the part before the @)</span></label>
          <input type="text" name="local" required value="${escapeHtml(opts.localPart ?? '')}"
                 placeholder="alex" class="field">
          <p class="field-hint">Enter just the local part, e.g. <strong>alex</strong> — or paste a full address like alex@cleargym.uk and it will be extracted.</p>
        </div>
        <div>
          <label class="field-label">Sender name</label>
          <input type="text" name="name" required value="${escapeHtml(opts.name ?? '')}"
                 placeholder="Cleargym Support" class="field">
          <p class="field-hint">Shown to recipients as the "From" name.</p>
        </div>
        <button type="submit" class="btn btn-primary w-full">Add mailbox</button>
      </form>
      <p class="field-hint mt-3">
        Cloudflare Email Routing and email sending will be configured automatically for new domains.
      </p>
    </div>`
}

function editMailboxForm(id: number, name: string, email: string, senderName: string | null = null): string {
  return `
    <div class="page-wrap">
      <h2 class="page-title" style="margin-bottom:4px">Edit mailbox</h2>
      <p style="font-size:13px;color:var(--t2);margin-bottom:24px">${escapeHtml(email)}</p>
      <form method="POST" action="/mailboxes/${id}/edit" class="space-y-4">
        <div>
          <label class="field-label">Sender name</label>
          <input type="text" name="name" required value="${escapeHtml(name)}"
                 placeholder="e.g. Cleargym Support" class="field">
          <p class="field-hint">Shown to recipients as the "From" name.</p>
        </div>
        <div>
          <label class="field-label">Sender name override <span style="color:var(--t3);font-weight:400">(optional)</span></label>
          <input type="text" name="sender_name" value="${escapeHtml(senderName ?? '')}"
                 placeholder="e.g. Alex Mills" class="field">
          <p class="field-hint">If set, overrides the sender name for this mailbox specifically.</p>
        </div>
        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary flex-1">Save</button>
          <a href="/" class="btn btn-secondary flex-1" style="text-align:center">Cancel</a>
        </div>
      </form>

      <div class="danger-zone mt-8">
        <p style="font-size:12px;font-weight:600;color:var(--danger);margin-bottom:6px">Danger zone</p>
        <p class="field-hint mb-3">
          Deletes the mailbox and removes the Cloudflare Email Routing rule.
          Existing conversations are not deleted.
        </p>
        <form method="POST" action="/mailboxes/${id}/delete"
              onsubmit="return confirm('Delete ${escapeHtml(email)}? This will remove the Cloudflare routing rule.')">
          <button type="submit" class="btn btn-danger btn-sm">Delete mailbox</button>
        </form>
      </div>
    </div>`
}

function domainSettingsView(
  domain: Domain,
  mailboxes: import('../types').Mailbox[],
  counts: Record<string, number>
): string {
  const catchallEnabled = !!domain.cf_catchall_rule_id

  const mailboxRows = mailboxes.map(mb => `
    <div class="row-item">
      <div>
        <p style="color:var(--t1);font-size:13px">${escapeHtml(mb.email)}</p>
        <p style="color:var(--t3);font-size:11.5px">${escapeHtml(mb.name)}</p>
      </div>
      <div class="flex items-center gap-3">
        ${counts[mb.email] ? `<span class="badge">${counts[mb.email]}</span>` : ''}
        <a href="/mailboxes/${mb.id}/edit" class="btn-text-muted">Edit</a>
      </div>
    </div>`).join('')

  return `
    <div class="page-wrap">
      <a href="/" class="page-back">← Back</a>
      <h2 class="page-title" style="margin-bottom:6px">${escapeHtml(domain.domain)}</h2>
      <div class="flex items-center gap-3 mb-6">
        ${domain.provider_domain_id
          ? domain.provider_verified
            ? `<span style="font-size:12px;color:var(--success)">✓ Sending verified</span>`
            : `<span style="font-size:12px;color:var(--warn-t)">⚠ Sending not yet verified</span>
               <form method="POST" action="/domains/${domain.id}/verify" class="inline">
                 <button type="submit" class="btn-text">Trigger verification</button>
               </form>`
          : `<span style="font-size:12px;color:var(--t3)">Sending not configured</span>`}
      </div>

      <!-- Mailboxes -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <p class="section-title" style="margin-bottom:0">Mailboxes</p>
          <a href="/mailboxes/new?domain=${domain.id}" class="btn-text">+ Add mailbox</a>
        </div>
        <div class="row-list">
          ${mailboxes.length ? mailboxRows : '<p style="font-size:13px;color:var(--t3);padding:12px 16px">No mailboxes yet.</p>'}
        </div>
      </div>

      <!-- Catch-all CF routing -->
      <div class="mb-8">
        <p class="section-title">Catch-all routing</p>
        <p class="field-hint mb-3">
          Route all emails to <strong>*@${escapeHtml(domain.domain)}</strong> into Pigeon via Cloudflare, not just configured mailbox addresses.
        </p>
        <form method="POST" action="/domains/${domain.id}/catchall" class="flex items-center gap-3">
          <button type="submit" class="btn ${catchallEnabled ? 'btn-secondary' : 'btn-primary'}">
            ${catchallEnabled ? 'Disable catch-all routing' : 'Enable catch-all routing'}
          </button>
          ${catchallEnabled ? `<span style="font-size:12px;color:var(--success)">✓ active</span>` : ''}
        </form>
      </div>

      <!-- Catch-all mailbox -->
      <div class="mb-8">
        <p class="section-title">Catch-all mailbox</p>
        <p class="field-hint mb-3">
          Emails received at undefined addresses on this domain land in this mailbox. Requires catch-all routing to be enabled above.
        </p>
        <form method="POST" action="/domains/${domain.id}/catchall-mailbox"
              style="display:flex;align-items:center;gap:8px">
          <select name="email" class="field" style="width:auto;flex:1">
            <option value="">— disabled —</option>
            ${mailboxes.map(mb => `<option value="${escapeHtml(mb.email)}" ${domain.catchall_mailbox_email === mb.email ? 'selected' : ''}>${escapeHtml(mb.name)} &lt;${escapeHtml(mb.email)}&gt;</option>`).join('')}
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </form>
      </div>

      <!-- Danger zone -->
      <div class="danger-zone">
        <p style="font-size:12px;font-weight:600;color:var(--danger);margin-bottom:6px">Danger zone</p>
        <p class="field-hint mb-3">
          Deletes all mailboxes, routing rules, email provider domain, and DNS records for this domain.
          Existing conversations are not deleted.
        </p>
        <form method="POST" action="/domains/${domain.id}/delete"
              onsubmit="return confirm('Delete ${escapeHtml(domain.domain)} and all its mailboxes?')">
          <button type="submit" class="btn btn-danger btn-sm">Delete domain</button>
        </form>
      </div>
    </div>`
}

function composeForm(opts: {
  mailboxes: import('../types').Mailbox[]
  toEmail?: string
  subject?: string
  error?: string
}): string {
  const mailboxOptions = opts.mailboxes.map(mb =>
    `<option value="${escapeHtml(mb.email)}">${escapeHtml(mb.name)} &lt;${escapeHtml(mb.email)}&gt;</option>`
  ).join('')

  return `
    <div class="page-wrap" style="max-width:680px">
      <h2 class="page-title">New message</h2>
      ${opts.error ? `<div class="alert alert-error mb-4">${escapeHtml(opts.error)}</div>` : ''}
      <form method="POST" action="/compose"
            onsubmit="document.getElementById('compose-body-html').value=document.getElementById('compose-editor').innerHTML; document.getElementById('compose-body-text').value=document.getElementById('compose-editor').innerText.trim()"
            class="space-y-4">
        <div class="compose-row">
          <label class="compose-label">From</label>
          <select name="from" class="compose-input">${mailboxOptions}</select>
        </div>
        <div class="compose-row">
          <label class="compose-label">To</label>
          <input type="email" name="to" value="${escapeHtml(opts.toEmail ?? '')}" required
                 class="compose-input" placeholder="recipient@example.com">
        </div>
        <div class="compose-row">
          <label class="compose-label">Subject</label>
          <input type="text" name="subject" value="${escapeHtml(opts.subject ?? '')}" required
                 class="compose-input" placeholder="Subject">
        </div>

        <div class="editor-wrap">
          <div class="editor-toolbar">
            <button type="button" onmousedown="event.preventDefault();document.execCommand('bold')" class="toolbar-btn" style="font-weight:700" title="Bold">B</button>
            <button type="button" onmousedown="event.preventDefault();document.execCommand('italic')" class="toolbar-btn" style="font-style:italic" title="Italic">I</button>
            <button type="button" onmousedown="event.preventDefault();document.execCommand('underline')" class="toolbar-btn" style="text-decoration:underline" title="Underline">U</button>
            <div class="editor-divider"></div>
            <button type="button" onmousedown="event.preventDefault();(function(){const u=prompt('URL:');if(u)document.execCommand('createLink',false,u)})()" class="toolbar-btn" title="Insert link">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
            </button>
          </div>
          <div contenteditable="true" id="compose-editor" data-placeholder="Write your message…"
               class="editor-body" style="min-height:200px">
          </div>
        </div>

        <input type="hidden" name="body_html" id="compose-body-html">
        <input type="hidden" name="body_text" id="compose-body-text">

        <div class="flex items-center justify-between pt-2">
          <a href="/" class="btn-text-muted">Cancel</a>
          <button type="submit" class="btn btn-primary">Send</button>
        </div>
      </form>
    </div>`
}
