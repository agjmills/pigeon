import type { Conversation } from '../types'
import { escapeHtml, formatDate } from './layout'

export function inboxView(
  conversations: Conversation[],
  opts: { mailbox?: string; status?: string }
): string {
  const status = opts.status ?? 'open'
  const mp = opts.mailbox ? `&mailbox=${encodeURIComponent(opts.mailbox)}` : ''

  const tabs = `
    <div class="tabs">
      <a href="/?status=open${mp}"  hx-boost="true" class="tab${status === 'open'   ? ' active' : ''}">Open</a>
      <a href="/?status=closed${mp}" hx-boost="true" class="tab${status === 'closed' ? ' active' : ''}">Closed</a>
    </div>`

  if (conversations.length === 0) {
    return `${tabs}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--t3)">
        <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" style="margin-bottom:10px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
        </svg>
        <p style="font-size:13px">No ${status} conversations</p>
      </div>`
  }

  const rows = conversations.map(conv => {
    const unread = conv.unread === 1
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
      </div>
      ${conv.message_count && conv.message_count > 1
        ? `<span style="font-size:11.5px;color:var(--t3);flex-shrink:0;margin-top:2px">${conv.message_count}</span>`
        : ''}
    </a>`
  }).join('')

  return `${tabs}<div>${rows}</div>`
}
