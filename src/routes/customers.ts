import { Hono } from 'hono'
import type { AppEnv, Customer, Conversation } from '../types'
import {
  getCustomerById, createCustomer, updateCustomer,
  getConversationsByCustomer, linkConversationToCustomer,
  getConversation, getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
  getAllCustomers,
} from '../lib/db'
import { layout, escapeHtml, formatDate } from '../views/layout'

export const customerRoutes = new Hono<AppEnv>()

// List all customers
customerRoutes.get('/', async (c) => {
  const user = c.get('user')
  const [customers, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getAllCustomers(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  return c.html(layout(customersListView(customers), { user, mailboxes, domains, counts, unreadCounts, title: 'Contacts' }))
})

// Create customer from a conversation and redirect back
customerRoutes.post('/from-conversation/:convId', async (c) => {
  const convId = parseInt(c.req.param('convId'))
  const conv = await getConversation(c.env.DB, convId)
  if (!conv) return c.notFound()

  const customerId = await createCustomer(c.env.DB, {
    email: conv.customer_email,
    name: conv.customer_name,
  })
  await linkConversationToCustomer(c.env.DB, convId, customerId)

  return c.redirect(`/c/${convId}`)
})

// View customer
customerRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const status = c.req.query('status') ?? 'open'
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const perPage = 20

  const [customer, { conversations, total }, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getCustomerById(c.env.DB, id),
    getConversationsByCustomer(c.env.DB, id, { status, limit: perPage, offset: (page - 1) * perPage }),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])

  if (!customer) return c.notFound()

  const totalPages = Math.ceil(total / perPage)

  return c.html(layout(customerView(customer, conversations, { status, page, totalPages, total }), {
    user, mailboxes, domains, counts, unreadCounts,
    title: customer.name || customer.email,
  }))
})

// Update customer
customerRoutes.post('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()

  await updateCustomer(c.env.DB, id, {
    name: String(body.name ?? '').trim() || undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
  })

  return c.redirect(`/customers/${id}`)
})

function customersListView(customers: Customer[]): string {
  const rows = customers.map(c => `
    <a href="/customers/${c.id}" hx-boost="true" class="row-item" style="text-decoration:none;gap:12px">
      <div class="avatar avatar-warm" style="width:32px;height:32px;font-size:12px;flex-shrink:0">
        ${escapeHtml((c.name || c.email).charAt(0).toUpperCase())}
      </div>
      <div class="flex-1 min-w-0">
        <p style="font-size:13px;font-weight:500;color:var(--t1)" class="truncate">${escapeHtml(c.name || c.email)}</p>
        ${c.name ? `<p style="font-size:11.5px;color:var(--t3)" class="truncate">${escapeHtml(c.email)}</p>` : ''}
      </div>
      ${c.notes ? `<p style="font-size:11.5px;color:var(--t3)" class="truncate max-w-xs hidden sm:block">${escapeHtml(c.notes.split('\n')[0])}</p>` : ''}
    </a>`).join('')

  return `
    <div class="page-wrap" style="max-width:680px">
      <h2 class="page-title">Contacts</h2>
      <div class="row-list">
        ${customers.length ? rows : '<p style="font-size:13px;color:var(--t3);padding:32px 16px;text-align:center">No contacts yet. Open a conversation and click "Save as contact".</p>'}
      </div>
    </div>`
}

function customerView(
  customer: Customer,
  conversations: Conversation[],
  pagination: { status: string; page: number; totalPages: number; total: number }
): string {
  const { status, page, totalPages, total } = pagination
  const base = `/customers/${customer.id}`

  const convRows = conversations.map(conv => `
    <a href="/c/${conv.id}" hx-boost="true" class="row-item" style="text-decoration:none">
      <div class="min-w-0 flex-1">
        <p style="font-size:13px;color:var(--t1)" class="truncate">${escapeHtml(conv.subject)}</p>
        <p style="font-size:11.5px;color:var(--t3)">${escapeHtml(conv.mailbox_email)}</p>
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
      <a href="/" hx-boost="true" class="page-back">← Back</a>

      <form method="POST" action="/customers/${customer.id}" class="mb-8">
        <div class="flex items-start gap-4">
          <div class="avatar avatar-warm" style="width:44px;height:44px;font-size:17px;flex-shrink:0">
            ${escapeHtml((customer.name || customer.email).charAt(0).toUpperCase())}
          </div>
          <div class="flex-1 min-w-0">
            <input type="text" name="name" value="${escapeHtml(customer.name ?? '')}"
                   placeholder="Customer name"
                   style="width:100%;font-size:17px;font-weight:600;background:transparent;color:var(--t1);border:0;border-bottom:1px solid transparent;outline:none;padding-bottom:2px;margin-bottom:4px;transition:border-color 120ms"
                   onmouseover="this.style.borderBottomColor='var(--border)'"
                   onmouseout="if(document.activeElement!==this)this.style.borderBottomColor='transparent'"
                   onfocus="this.style.borderBottomColor='var(--accent)'"
                   onblur="this.style.borderBottomColor='transparent'">
            <p style="font-size:13px;color:var(--t2)">${escapeHtml(customer.email)}</p>
          </div>
        </div>

        <div class="mt-6">
          <label class="section-title" style="display:block;margin-bottom:8px">Notes</label>
          <textarea name="notes" rows="4" class="field"
                    placeholder="Add notes about this customer…">${escapeHtml(customer.notes ?? '')}</textarea>
        </div>

        <div class="mt-3 flex justify-end">
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>

      <div>
        <p class="section-title">Conversations</p>
        ${tabs}
        <div class="row-list">
          ${conversations.length ? convRows : `<p style="font-size:13px;color:var(--t3);padding:16px;text-align:center">No ${status} conversations.</p>`}
        </div>
        ${paginationHtml}
      </div>
    </div>`
}
