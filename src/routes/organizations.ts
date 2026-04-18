import { accessibleMailboxIds, anyContactsLevel } from '../lib/permissions'
import { Hono } from 'hono'
import type { AppEnv, Organization, Customer, Conversation } from '../types'
import {
  getOrganizationById, getAllOrganizations, createOrganization, updateOrganization, deleteOrganization,
  getOrganizationMembers, getConversationsByOrganization,
  addCustomerToOrganization, removeCustomerFromOrganization,
  getAllCustomers, getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
} from '../lib/db'
import { layout, escapeHtml, formatDate } from '../views/layout'

export const organizationRoutes = new Hono<AppEnv>()

// List all organizations
organizationRoutes.get('/', async (c) => {
  if (!anyContactsLevel(c.get('permissions'), c.get('isAdmin'))) return c.text('Forbidden', 403)
  const user = c.get('user')
  const [organizations, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getAllOrganizations(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  return c.html(layout(organizationsListView(organizations), { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), domains, counts, unreadCounts, title: 'Organizations' }))
})

// New organization form
organizationRoutes.get('/new', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const user = c.get('user')
  const [mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  return c.html(layout(organizationFormView(), { user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes), domains, counts, unreadCounts, title: 'New Organization' }))
})

// Create organization
organizationRoutes.post('/', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const body = await c.req.parseBody()
  const name = String(body.name ?? '').trim()
  if (!name) return c.redirect('/organizations/new')

  const id = await createOrganization(c.env.DB, {
    name,
    domain: String(body.domain ?? '').trim() || null,
    notes: String(body.notes ?? '').trim() || null,
  })
  return c.redirect(`/organizations/${id}`)
})

// View organization
organizationRoutes.get('/:id', async (c) => {
  if (!anyContactsLevel(c.get('permissions'), c.get('isAdmin'))) return c.text('Forbidden', 403)
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const status = c.req.query('status') ?? 'open'
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const perPage = 20

  const [org, members, { conversations, total }, allCustomers, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getOrganizationById(c.env.DB, id),
    getOrganizationMembers(c.env.DB, id),
    getConversationsByOrganization(c.env.DB, id, { status, limit: perPage, offset: (page - 1) * perPage }),
    getAllCustomers(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])

  if (!org) return c.notFound()

  const totalPages = Math.ceil(total / perPage)
  const memberIds = new Set(members.map(m => m.id))
  const nonMembers = allCustomers.filter(cust => !memberIds.has(cust.id))

  return c.html(layout(organizationView(org, members, nonMembers, conversations, { status, page, totalPages, total }), {
    user, mailboxes, domains, counts, unreadCounts,
    title: org.name,
  }))
})

// Update organization
organizationRoutes.post('/:id', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()

  await updateOrganization(c.env.DB, id, {
    name: String(body.name ?? '').trim() || undefined,
    domain: body.domain !== undefined ? String(body.domain).trim() : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
  })

  return c.redirect(`/organizations/${id}`)
})

// Delete organization
organizationRoutes.post('/:id/delete', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const id = parseInt(c.req.param('id'))
  await deleteOrganization(c.env.DB, id)
  return c.redirect('/organizations')
})

// Add member
organizationRoutes.post('/:id/members', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const customerId = parseInt(String(body.customer_id))
  if (customerId) {
    await addCustomerToOrganization(c.env.DB, customerId, id)
  }
  return c.redirect(`/organizations/${id}`)
})

// Remove member
organizationRoutes.post('/:id/members/:customerId/remove', async (c) => {
  if (anyContactsLevel(c.get('permissions'), c.get('isAdmin')) !== 'edit') return c.text('Forbidden', 403)
  const id = parseInt(c.req.param('id'))
  const customerId = parseInt(c.req.param('customerId'))
  await removeCustomerFromOrganization(c.env.DB, customerId, id)
  return c.redirect(`/organizations/${id}`)
})

// ── Views ────────────────────────────────────────────────────────────────────

function organizationsListView(organizations: Organization[]): string {
  const rows = organizations.map(org => `
    <a href="/organizations/${org.id}" hx-boost="true" class="row-item" style="text-decoration:none;gap:12px">
      <div class="avatar avatar-warm" style="width:32px;height:32px;font-size:12px;flex-shrink:0">
        ${escapeHtml(org.name.charAt(0).toUpperCase())}
      </div>
      <div class="flex-1 min-w-0">
        <p style="font-size:13px;font-weight:500;color:var(--t1)" class="truncate">${escapeHtml(org.name)}</p>
        ${org.domain ? `<p style="font-size:11.5px;color:var(--t3)" class="truncate">${escapeHtml(org.domain)}</p>` : ''}
      </div>
      ${org.notes ? `<p style="font-size:11.5px;color:var(--t3)" class="truncate max-w-xs hidden sm:block">${escapeHtml(org.notes.split('\n')[0])}</p>` : ''}
    </a>`).join('')

  return `
    <div class="page-wrap" style="max-width:680px">
      <div class="flex items-center justify-between mb-5">
        <h2 class="page-title" style="margin:0">Organizations</h2>
        <a href="/organizations/new" hx-boost="true" class="btn btn-primary btn-sm">+ New</a>
      </div>
      <div class="row-list">
        ${organizations.length ? rows : '<p style="font-size:13px;color:var(--t3);padding:32px 16px;text-align:center">No organizations yet.</p>'}
      </div>
    </div>`
}

function organizationFormView(): string {
  return `
    <div class="page-wrap" style="max-width:520px">
      <a href="/organizations" hx-boost="true" class="page-back">← Back</a>
      <h2 class="page-title">New Organization</h2>
      <form method="POST" action="/organizations">
        <div class="mb-4">
          <label class="field-label">Name</label>
          <input type="text" name="name" class="field" placeholder="Acme Corp" required>
        </div>
        <div class="mb-4">
          <label class="field-label">Domain</label>
          <input type="text" name="domain" class="field" placeholder="acme.com">
          <p class="field-hint">Optional — helps identify which company contacts belong to.</p>
        </div>
        <div class="mb-4">
          <label class="field-label">Notes</label>
          <textarea name="notes" rows="3" class="field" placeholder="Add notes about this organization…"></textarea>
        </div>
        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary">Create Organization</button>
        </div>
      </form>
    </div>`
}

function organizationView(
  org: Organization,
  members: Customer[],
  nonMembers: Customer[],
  conversations: Conversation[],
  pagination: { status: string; page: number; totalPages: number; total: number }
): string {
  const { status, page, totalPages } = pagination
  const base = `/organizations/${org.id}`

  const memberRows = members.map(m => `
    <div class="row-item" style="gap:12px">
      <a href="/customers/${m.id}" hx-boost="true" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-decoration:none">
        <div class="avatar avatar-warm" style="width:28px;height:28px;font-size:11px;flex-shrink:0">
          ${escapeHtml((m.name || m.email).charAt(0).toUpperCase())}
        </div>
        <div class="min-w-0">
          <p style="font-size:13px;font-weight:500;color:var(--t1)" class="truncate">${escapeHtml(m.name || m.email)}</p>
          ${m.name ? `<p style="font-size:11.5px;color:var(--t3)" class="truncate">${escapeHtml(m.email)}</p>` : ''}
        </div>
      </a>
      <form method="POST" action="${base}/members/${m.id}/remove" style="flex-shrink:0">
        <button type="submit" class="btn-text-muted" title="Remove from organization">✕</button>
      </form>
    </div>`).join('')

  const addMemberForm = nonMembers.length ? `
    <form method="POST" action="${base}/members" style="display:flex;gap:8px;padding:10px 16px">
      <select name="customer_id" class="field" style="flex:1;font-size:12px;padding:5px 8px">
        <option value="">Add a contact…</option>
        ${nonMembers.map(c => `<option value="${c.id}">${escapeHtml(c.name ? `${c.name} (${c.email})` : c.email)}</option>`).join('')}
      </select>
      <button type="submit" class="btn btn-secondary btn-sm">Add</button>
    </form>` : ''

  const convRows = conversations.map(conv => `
    <a href="/c/${conv.id}" hx-boost="true" class="row-item" style="text-decoration:none">
      <div class="min-w-0 flex-1">
        <p style="font-size:13px;color:var(--t1)" class="truncate">${escapeHtml(conv.subject)}</p>
        <p style="font-size:11.5px;color:var(--t3)">${escapeHtml(conv.customer_email)} → ${escapeHtml(conv.mailbox_email)}</p>
      </div>
      <div class="flex items-center gap-2 ml-3 shrink-0">
        <span style="font-size:11.5px;color:var(--t3)">${formatDate(conv.last_message_at)}</span>
      </div>
    </a>`).join('')

  const tabs = `
    <div class="tabs" style="margin-bottom:0">
      <a href="${base}?status=open"  hx-boost="true" class="tab${status === 'open'  ? ' active' : ''}">Open</a>
      <a href="${base}?status=closed" hx-boost="true" class="tab${status === 'closed' ? ' active' : ''}">Closed</a>
    </div>`

  let paginationHtml = ''
  if (totalPages > 1) {
    const pageLinks: string[] = []
    if (page > 1) {
      pageLinks.push(`<a href="${base}?status=${status}&page=${page - 1}" hx-boost="true" style="font-size:12px;color:var(--accent);text-decoration:none">← Prev</a>`)
    }
    pageLinks.push(`<span style="font-size:12px;color:var(--t3)">Page ${page} of ${totalPages}</span>`)
    if (page < totalPages) {
      pageLinks.push(`<a href="${base}?status=${status}&page=${page + 1}" hx-boost="true" style="font-size:12px;color:var(--accent);text-decoration:none">Next →</a>`)
    }
    paginationHtml = `<div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 0">${pageLinks.join('')}</div>`
  }

  return `
    <div class="page-wrap">
      <a href="/organizations" hx-boost="true" class="page-back">← Back</a>

      <form method="POST" action="${base}" class="mb-8">
        <div class="flex items-start gap-4">
          <div class="avatar avatar-warm" style="width:44px;height:44px;font-size:17px;flex-shrink:0">
            ${escapeHtml(org.name.charAt(0).toUpperCase())}
          </div>
          <div class="flex-1 min-w-0">
            <input type="text" name="name" value="${escapeHtml(org.name)}"
                   placeholder="Organization name"
                   style="width:100%;font-size:17px;font-weight:600;background:transparent;color:var(--t1);border:0;border-bottom:1px solid transparent;outline:none;padding-bottom:2px;margin-bottom:4px;transition:border-color 120ms"
                   onmouseover="this.style.borderBottomColor='var(--border)'"
                   onmouseout="if(document.activeElement!==this)this.style.borderBottomColor='transparent'"
                   onfocus="this.style.borderBottomColor='var(--accent)'"
                   onblur="this.style.borderBottomColor='transparent'">
            <input type="text" name="domain" value="${escapeHtml(org.domain ?? '')}"
                   placeholder="Domain (e.g. acme.com)"
                   style="width:100%;font-size:13px;background:transparent;color:var(--t2);border:0;border-bottom:1px solid transparent;outline:none;padding-bottom:2px;transition:border-color 120ms"
                   onmouseover="this.style.borderBottomColor='var(--border)'"
                   onmouseout="if(document.activeElement!==this)this.style.borderBottomColor='transparent'"
                   onfocus="this.style.borderBottomColor='var(--accent)'"
                   onblur="this.style.borderBottomColor='transparent'">
          </div>
        </div>

        <div class="mt-6">
          <label class="section-title" style="display:block;margin-bottom:8px">Notes</label>
          <textarea name="notes" rows="4" class="field"
                    placeholder="Add notes about this organization…">${escapeHtml(org.notes ?? '')}</textarea>
        </div>

        <div class="mt-3 flex justify-end">
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>

      <div class="mb-8">
        <p class="section-title">Members</p>
        <div class="row-list">
          ${members.length ? memberRows : '<p style="font-size:13px;color:var(--t3);padding:16px;text-align:center">No members yet.</p>'}
          ${addMemberForm}
        </div>
      </div>

      <div class="mb-8">
        <p class="section-title">Conversations</p>
        ${tabs}
        <div class="row-list">
          ${conversations.length ? convRows : `<p style="font-size:13px;color:var(--t3);padding:16px;text-align:center">No ${status} conversations.</p>`}
        </div>
        ${paginationHtml}
      </div>

      <div class="danger-zone">
        <p style="font-size:13px;font-weight:500;color:var(--danger);margin-bottom:8px">Danger zone</p>
        <p style="font-size:12px;color:var(--t2);margin-bottom:12px">Deleting this organization will remove all member associations. Contacts and conversations will not be deleted.</p>
        <form method="POST" action="${base}/delete" onsubmit="return confirm('Delete this organization?')">
          <button type="submit" class="btn btn-danger btn-sm">Delete Organization</button>
        </form>
      </div>
    </div>`
}
