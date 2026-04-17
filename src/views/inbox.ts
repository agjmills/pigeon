import type { Conversation, Tag } from '../types'
import { escapeHtml, formatDate, tagBadge } from './layout'

export function inboxView(
  conversations: Conversation[],
  opts: { mailbox?: string; status?: string; search?: string; tag?: string; tagName?: string },
  tagsByConversation: Record<number, Tag[]> = {}
): string {
  const status = opts.status ?? 'open'
  const mp = opts.mailbox ? `&mailbox=${encodeURIComponent(opts.mailbox)}` : ''
  const tp = opts.tag ? `&tag=${encodeURIComponent(opts.tag)}` : ''

  const searchBar = `
    <form action="/" method="GET" style="padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border)">
      ${opts.mailbox ? `<input type="hidden" name="mailbox" value="${escapeHtml(opts.mailbox)}">` : ''}
      <div style="display:flex;gap:8px">
        <input type="text" name="q" value="${escapeHtml(opts.search ?? '')}"
               placeholder="Search conversations…"
               class="field" style="flex:1;padding:6px 10px;font-size:12.5px">
        ${opts.search ? '<a href="/' + (opts.mailbox ? '?mailbox=' + encodeURIComponent(opts.mailbox) : '') + '" hx-boost="true" class="btn btn-ghost btn-sm" style="flex-shrink:0">Clear</a>' : ''}
      </div>
    </form>`

  const tagFilter = opts.tagName
    ? `<div style="padding:8px 16px;background:var(--accent-s);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:12.5px">
        <span style="color:var(--t2)">Filtered by tag:</span>
        <span style="font-weight:500;color:var(--accent-t)">${escapeHtml(opts.tagName)}</span>
        <a href="/?status=${status}${mp}" hx-boost="true" style="color:var(--t3);margin-left:auto;font-size:11.5px">Clear filter ✕</a>
      </div>`
    : ''

  const searchInfo = opts.search
    ? `<div style="padding:8px 16px;background:var(--accent-s);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:12.5px">
        <span style="color:var(--t2)">Results for:</span>
        <span style="font-weight:500;color:var(--accent-t)">"${escapeHtml(opts.search)}"</span>
        <span style="color:var(--t3)">(${conversations.length})</span>
      </div>`
    : ''

  const tabs = opts.search ? '' : `
    <div class="tabs">
      <a href="/?status=open${mp}${tp}"  hx-boost="true" class="tab${status === 'open'   ? ' active' : ''}">Open</a>
      <a href="/?status=closed${mp}${tp}" hx-boost="true" class="tab${status === 'closed' ? ' active' : ''}">Closed</a>
    </div>`

  if (conversations.length === 0) {
    const emptyMsg = opts.search ? 'No results found' : `No ${status} conversations`
    return `${searchBar}${tagFilter}${searchInfo}${tabs}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--t3)">
        <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" style="margin-bottom:10px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
        </svg>
        <p style="font-size:13px">${emptyMsg}</p>
      </div>`
  }

  const rows = conversations.map(conv => {
    const unread = conv.unread === 1
    const tags = tagsByConversation[conv.id] ?? []
    const tagHtml = tags.length
      ? `<div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">${tags.map(t => tagBadge(t)).join('')}</div>`
      : ''
    return `
    <a href="/c/${conv.id}" hx-boost="true" class="inbox-row">
      ${unread ? '<div class="unread-dot"></div>' : ''}
      <div class="avatar avatar-warm" style="margin-top:1px">
        ${escapeHtml((conv.customer_name || conv.customer_email).charAt(0).toUpperCase())}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:2px">
          <span style="font-size:13.5px;font-weight:${unread ? '600' : '500'};color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(conv.customer_name || conv.customer_email)}
          </span>
          <span style="font-size:11.5px;color:var(--t3);flex-shrink:0">${formatDate(conv.last_message_at)}</span>
        </div>
        <p style="font-size:13px;color:var(--${unread ? 't1' : 't2'});font-weight:${unread ? '500' : '400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">${escapeHtml(conv.subject)}</p>
        <p style="font-size:11.5px;color:var(--t3);margin:2px 0 0">${escapeHtml(conv.mailbox_email)}</p>
        ${tagHtml}
      </div>
      ${conv.message_count && conv.message_count > 1
        ? `<span style="font-size:11.5px;color:var(--t3);flex-shrink:0;margin-top:2px">${conv.message_count}</span>`
        : ''}
    </a>`
  }).join('')

  return `${searchBar}${tagFilter}${searchInfo}${tabs}<div>${rows}</div>`
}
