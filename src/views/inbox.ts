import type { Conversation } from '../types'
import { escapeHtml, formatDate } from './layout'

export function inboxView(
  conversations: Conversation[],
  opts: { mailbox?: string; status?: string }
): string {
  const status = opts.status ?? 'open'
  const mailboxParam = opts.mailbox ? `&mailbox=${encodeURIComponent(opts.mailbox)}` : ''

  const tabs = `
    <div class="flex border-b border-gray-200 px-4 bg-white">
      <a href="/?status=open${mailboxParam}"
         class="px-3 py-3 text-sm font-medium border-b-2 ${status === 'open' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
        Open
      </a>
      <a href="/?status=closed${mailboxParam}"
         class="px-3 py-3 text-sm font-medium border-b-2 ${status === 'closed' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
        Closed
      </a>
    </div>`

  if (conversations.length === 0) {
    return `${tabs}
      <div class="flex flex-col items-center justify-center h-64 text-gray-400">
        <svg class="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
        </svg>
        <p class="text-sm">No ${status} conversations</p>
      </div>`
  }

  const rows = conversations.map(conv => `
    <a href="/c/${conv.id}" hx-boost="true"
       class="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer">
      <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
        ${escapeHtml((conv.customer_name || conv.customer_email).charAt(0).toUpperCase())}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm font-medium text-gray-900 truncate">
            ${escapeHtml(conv.customer_name || conv.customer_email)}
          </span>
          <span class="text-xs text-gray-400 shrink-0">${formatDate(conv.last_message_at)}</span>
        </div>
        <p class="text-sm text-gray-600 truncate">${escapeHtml(conv.subject)}</p>
        <p class="text-xs text-gray-400 mt-0.5">${escapeHtml(conv.mailbox_email)}</p>
      </div>
      ${conv.message_count && conv.message_count > 1
        ? `<span class="shrink-0 text-xs text-gray-400 mt-1">${conv.message_count}</span>`
        : ''}
    </a>`
  ).join('')

  return `${tabs}<div>${rows}</div>`
}
