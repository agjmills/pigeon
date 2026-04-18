import { accessibleMailboxIds } from '../lib/permissions'
import { Hono } from 'hono'
import type { AppEnv, AuditEntry } from '../types'
import { getAuditLog, getMailboxes, getMailboxCounts, getUnreadCounts, getDomains } from '../lib/db'
import { layout, escapeHtml, formatDate } from '../views/layout'

export const auditRoutes = new Hono<AppEnv>()

const ACTION_LABELS: Record<string, string> = {
  reply_sent:   'Replied',
  compose_sent: 'Composed',
  note_added:   'Added note',
}

auditRoutes.get('/', async (c) => {
  const user = c.get('user')
  const userFilter = c.req.query('user')?.trim() || undefined
  const mailboxFilter = c.req.query('mailbox')?.trim() || undefined
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)

  const [entries, mailboxes, counts, unreadCounts, domains] = await Promise.all([
    getAuditLog(c.env.DB, { user_email: userFilter, mailbox_email: mailboxFilter, limit }),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
    getDomains(c.env.DB),
  ])

  return c.html(layout(auditView(entries, { userFilter, mailboxFilter, mailboxes }), {
    user,
    mailboxes,
    accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes),
    counts,
    unreadCounts,
    domains,
    title: 'Audit log',
  }))
})

function auditView(
  entries: AuditEntry[],
  opts: {
    userFilter?: string
    mailboxFilter?: string
    mailboxes: import('../types').Mailbox[]
  }
): string {
  const rows = entries.length ? entries.map(e => {
    const meta = e.metadata ? (() => { try { return JSON.parse(e.metadata!) } catch { return {} } })() : {}
    const convLink = e.conversation_id
      ? `<a href="/c/${e.conversation_id}" hx-boost="true" style="color:var(--accent);font-size:12px">#${e.conversation_id}</a>`
      : '—'
    const detail = [meta.to ? `to ${escapeHtml(meta.to)}` : '', meta.subject ? escapeHtml(meta.subject) : ''].filter(Boolean).join(' · ')

    return `
      <tr>
        <td style="padding:10px 12px;font-size:12px;color:var(--t3);white-space:nowrap">${formatDate(e.created_at)}</td>
        <td style="padding:10px 12px;font-size:13px;color:var(--t1)">${escapeHtml(e.user_name || e.user_email)}<br><span style="font-size:11px;color:var(--t3)">${escapeHtml(e.user_email)}</span></td>
        <td style="padding:10px 12px;font-size:13px;color:var(--t1)">${escapeHtml(ACTION_LABELS[e.action] ?? e.action)}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--t2)">${escapeHtml(e.mailbox_email ?? '—')}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--t2)">${convLink}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--t3)">${detail}</td>
      </tr>`
  }).join('') : `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--t3);font-size:13px">No entries found.</td></tr>`

  const mailboxOptions = opts.mailboxes.map(mb =>
    `<option value="${escapeHtml(mb.email)}" ${opts.mailboxFilter === mb.email ? 'selected' : ''}>${escapeHtml(mb.name)} &lt;${escapeHtml(mb.email)}&gt;</option>`
  ).join('')

  return `
    <div class="page-wrap" style="max-width:none;padding:24px">
      <h2 class="page-title">Audit log</h2>

      <form method="GET" action="/audit" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        <input type="text" name="user" placeholder="Filter by user email" value="${escapeHtml(opts.userFilter ?? '')}"
               class="field" style="width:220px">
        <select name="mailbox" class="field" style="width:auto">
          <option value="">All mailboxes</option>
          ${mailboxOptions}
        </select>
        <button type="submit" class="btn btn-secondary btn-sm">Filter</button>
        ${opts.userFilter || opts.mailboxFilter ? `<a href="/audit" class="btn btn-ghost btn-sm">Clear</a>` : ''}
      </form>

      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Time</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">User</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">Action</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">Mailbox</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">Conv.</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>`
}
