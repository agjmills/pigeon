import { Hono } from 'hono'
import type { AppEnv, Tag } from '../types'
import {
  getAllTags, createTag, updateTag, deleteTag,
  getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
} from '../lib/db'
import { layout, escapeHtml, tagBadge, TAG_COLOR_OPTIONS } from '../views/layout'

export const tagRoutes = new Hono<AppEnv>()

// List & create tags
tagRoutes.get('/', async (c) => {
  const user = c.get('user')
  const [tags, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getAllTags(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])
  return c.html(layout(tagsView(tags), { user, mailboxes, domains, counts, unreadCounts, title: 'Tags' }))
})

// Create tag
tagRoutes.post('/', async (c) => {
  const body = await c.req.parseBody()
  const name = String(body.name ?? '').trim()
  const color = String(body.color ?? 'gray')
  if (name) {
    await createTag(c.env.DB, { name, color })
  }
  return c.redirect('/tags')
})

// Update tag
tagRoutes.post('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  await updateTag(c.env.DB, id, {
    name: body.name ? String(body.name).trim() : undefined,
    color: body.color ? String(body.color) : undefined,
  })
  return c.redirect('/tags')
})

// Delete tag
tagRoutes.post('/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'))
  await deleteTag(c.env.DB, id)
  return c.redirect('/tags')
})

function tagsView(tags: Tag[]): string {
  const colorOptions = TAG_COLOR_OPTIONS.map(color =>
    `<option value="${color}">${color}</option>`
  ).join('')

  const tagRows = tags.map(tag => `
    <div class="row-item" style="gap:12px">
      <div style="flex:1;display:flex;align-items:center;gap:10px;min-width:0">
        ${tagBadge(tag)}
        <a href="/?tag=${tag.id}" hx-boost="true" style="font-size:11.5px;color:var(--t3)">View conversations →</a>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <form method="POST" action="/tags/${tag.id}" style="display:flex;align-items:center;gap:4px">
          <select name="color" class="field" style="font-size:11px;padding:2px 6px;width:auto" onchange="this.form.submit()">
            ${TAG_COLOR_OPTIONS.map(color =>
              `<option value="${color}"${color === tag.color ? ' selected' : ''}>${color}</option>`
            ).join('')}
          </select>
        </form>
        <form method="POST" action="/tags/${tag.id}/delete" onsubmit="return confirm('Delete this tag?')">
          <button type="submit" class="btn-text-muted" title="Delete tag">✕</button>
        </form>
      </div>
    </div>`).join('')

  return `
    <div class="page-wrap" style="max-width:520px">
      <h2 class="page-title">Tags</h2>

      <form method="POST" action="/tags" style="display:flex;gap:8px;margin-bottom:20px">
        <input type="text" name="name" class="field" placeholder="New tag name…" required style="flex:1">
        <select name="color" class="field" style="width:auto">
          ${colorOptions}
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Create</button>
      </form>

      <div class="row-list">
        ${tags.length ? tagRows : '<p style="font-size:13px;color:var(--t3);padding:32px 16px;text-align:center">No tags yet. Create one above.</p>'}
      </div>
    </div>`
}
