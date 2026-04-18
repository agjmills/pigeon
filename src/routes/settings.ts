import { Hono } from 'hono'
import type { AppEnv, User, UserPermission, Domain, Mailbox, PermissionLevel, ResourceType } from '../types'
import {
  getAllUsers, setUserAdmin, getUserPermissions, getUserByEmail,
  addUserPermission, removeUserPermissionByResource,
  getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
} from '../lib/db'
import { accessibleMailboxIds } from '../lib/permissions'
import { layout, escapeHtml } from '../views/layout'

export const settingsRoutes = new Hono<AppEnv>()

settingsRoutes.use('/*', async (c, next) => {
  if (!c.get('isAdmin')) return c.text('Forbidden', 403)
  await next()
})

// User list
settingsRoutes.get('/users', async (c) => {
  const user = c.get('user')
  const [users, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getAllUsers(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  return c.html(layout(usersView(users, user.email), {
    user, mailboxes, domains, counts, unreadCounts,
    accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), true, mailboxes),
    title: 'Users',
  }))
})

// Permission editor
settingsRoutes.get('/users/:email', async (c) => {
  const user = c.get('user')
  const targetEmail = decodeURIComponent(c.req.param('email'))
  const [targetUser, userPerms, allDomains, allMailboxes, counts, unreadCounts] = await Promise.all([
    getUserByEmail(c.env.DB, targetEmail),
    getUserPermissions(c.env.DB, targetEmail),
    getDomains(c.env.DB),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  if (!targetUser) return c.notFound()
  return c.html(layout(permissionEditorView(targetUser, userPerms, allDomains, allMailboxes), {
    user, mailboxes: allMailboxes, domains: allDomains, counts, unreadCounts,
    accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), true, allMailboxes),
    title: `Permissions — ${targetUser.name || targetUser.email}`,
  }))
})

// Toggle admin
settingsRoutes.post('/users/:email/admin', async (c) => {
  const email = decodeURIComponent(c.req.param('email'))
  const body = await c.req.parseBody()
  const isAdmin = body.is_admin === '1'
  await setUserAdmin(c.env.DB, email, isAdmin)
  return c.redirect('/settings/users')
})

// Set / remove a permission
settingsRoutes.post('/users/:email/permissions', async (c) => {
  const targetEmail = decodeURIComponent(c.req.param('email'))
  const body = await c.req.parseBody()
  const resourceType = String(body.resource_type) as ResourceType
  const resourceId = parseInt(String(body.resource_id))
  const level = String(body.level)

  if (level === 'none') {
    await removeUserPermissionByResource(c.env.DB, targetEmail, resourceType, resourceId)
  } else {
    await addUserPermission(c.env.DB, targetEmail, resourceType, resourceId, level as PermissionLevel)
  }
  return c.redirect(`/settings/users/${encodeURIComponent(targetEmail)}`)
})

// ── Views ────────────────────────────────────────────────────────────────────

function usersView(users: User[], currentEmail: string): string {
  const rows = users.map(u => {
    const isSelf = u.email === currentEmail
    return `
      <div class="row-item" style="gap:16px">
        <div class="avatar avatar-warm" style="width:32px;height:32px;font-size:12px;flex-shrink:0">
          ${escapeHtml((u.name || u.email).charAt(0).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <p style="font-size:13px;font-weight:500;color:var(--t1)" class="truncate">${escapeHtml(u.name || u.email)}</p>
          <p style="font-size:11.5px;color:var(--t3)" class="truncate">${escapeHtml(u.email)}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          ${u.is_admin
            ? `<span style="font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-s);padding:2px 8px;border-radius:4px">Admin</span>`
            : `<span style="font-size:11px;color:var(--t3)">Member</span>`}
          <a href="/settings/users/${encodeURIComponent(u.email)}" hx-boost="true" class="btn btn-secondary btn-sm">Permissions</a>
          ${!isSelf ? `
            <form method="POST" action="/settings/users/${encodeURIComponent(u.email)}/admin">
              <input type="hidden" name="is_admin" value="${u.is_admin ? '0' : '1'}">
              <button type="submit" class="btn btn-ghost btn-sm">${u.is_admin ? 'Revoke admin' : 'Make admin'}</button>
            </form>` : `<span style="font-size:11.5px;color:var(--t3)">(you)</span>`}
        </div>
      </div>`
  }).join('')

  return `
    <div class="page-wrap" style="max-width:720px">
      <h2 class="page-title">Users</h2>
      <div class="row-list">
        ${users.length ? rows : '<p style="font-size:13px;color:var(--t3);padding:32px 16px;text-align:center">No users yet.</p>'}
      </div>
      <p style="font-size:12px;color:var(--t3);margin-top:12px">Users are added automatically when they sign in for the first time.</p>
    </div>`
}

function permRow(
  label: string,
  resourceType: ResourceType,
  resourceId: number,
  targetEmail: string,
  explicit: PermissionLevel | null,
  inherited: PermissionLevel | null
): string {
  const actionUrl = `/settings/users/${encodeURIComponent(targetEmail)}/permissions`
  const effective = explicit ?? inherited
  const inheritedNote = !explicit && inherited
    ? `<span style="font-size:11px;color:var(--t3);margin-left:4px">(inherited: ${inherited})</span>`
    : ''

  return `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;color:${inherited && !explicit ? 'var(--t2)' : 'var(--t1)'};flex:1;min-width:0" class="truncate">${label}${inheritedNote}</span>
      <form method="POST" action="${actionUrl}" style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input type="hidden" name="resource_type" value="${resourceType}">
        <input type="hidden" name="resource_id" value="${resourceId}">
        <select name="level" class="field" style="font-size:12px;padding:4px 8px;width:auto" onchange="this.form.submit()">
          <option value="none"${!explicit ? ' selected' : ''}>No explicit grant${inherited ? ` (effective: ${inherited})` : ''}</option>
          <option value="read"${explicit === 'read' ? ' selected' : ''}>Read</option>
          <option value="edit"${explicit === 'edit' ? ' selected' : ''}>Edit</option>
        </select>
      </form>
    </div>`
}

function permissionEditorView(
  targetUser: User,
  userPerms: UserPermission[],
  domains: Domain[],
  mailboxes: Mailbox[]
): string {
  const permMap = new Map<string, PermissionLevel>()
  for (const p of userPerms) {
    permMap.set(`${p.resource_type}:${p.resource_id}`, p.level)
  }

  const domainSections = domains.map(domain => {
    const domainLevel = permMap.get(`domain:${domain.id}`) ?? null
    const domainMailboxes = mailboxes.filter(mb => mb.domain_id === domain.id)

    const mailboxRows = domainMailboxes.map(mb => {
      const explicit = permMap.get(`mailbox:${mb.id}`) ?? null
      return permRow(mb.name, 'mailbox', mb.id, targetUser.email, explicit, domainLevel)
    }).join('')

    const contactsExplicit = permMap.get(`contacts:${domain.id}`) ?? null

    return `
      <div class="card" style="margin-bottom:16px;overflow:hidden">
        <div style="padding:10px 16px;background:var(--bg-alt);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color:var(--t3);flex-shrink:0">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
          </svg>
          <span style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--t2)">${escapeHtml(domain.domain)}</span>
        </div>

        <div style="border-bottom:1px solid var(--border)">
          <div style="padding:6px 16px 4px;background:var(--surface)">
            <span style="font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)">Domain-wide</span>
          </div>
          ${permRow(`All mailboxes + contacts in ${escapeHtml(domain.domain)}`, 'domain', domain.id, targetUser.email, domainLevel, null)}
        </div>

        ${domainMailboxes.length ? `
        <div style="border-bottom:1px solid var(--border)">
          <div style="padding:6px 16px 4px;background:var(--surface)">
            <span style="font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)">Mailboxes</span>
          </div>
          ${mailboxRows}
        </div>` : ''}

        <div>
          <div style="padding:6px 16px 4px;background:var(--surface)">
            <span style="font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)">Contacts</span>
          </div>
          ${permRow('Contacts & organizations', 'contacts', domain.id, targetUser.email, contactsExplicit, domainLevel)}
        </div>
      </div>`
  }).join('')

  const adminBanner = targetUser.is_admin ? `
    <div class="alert alert-warn" style="margin-bottom:20px">
      This user is an admin — they have full access to everything regardless of explicit grants below.
    </div>` : ''

  return `
    <div class="page-wrap" style="max-width:680px">
      <a href="/settings/users" hx-boost="true" class="page-back">← Users</a>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
        <div class="avatar avatar-warm" style="width:40px;height:40px;font-size:15px;flex-shrink:0">
          ${escapeHtml((targetUser.name || targetUser.email).charAt(0).toUpperCase())}
        </div>
        <div>
          <p style="font-size:16px;font-weight:600;color:var(--t1)">${escapeHtml(targetUser.name || targetUser.email)}</p>
          <p style="font-size:12.5px;color:var(--t3)">${escapeHtml(targetUser.email)}</p>
        </div>
      </div>

      ${adminBanner}

      <p class="section-title">Permissions</p>
      <p style="font-size:12px;color:var(--t3);margin-bottom:16px">
        Domain-wide grants apply to all mailboxes and contacts within that domain.
        More specific grants are additive — mailbox grants can exceed domain level but not reduce it.
      </p>

      ${domains.length ? domainSections : '<p style="font-size:13px;color:var(--t3)">No domains configured yet.</p>'}
    </div>`
}
