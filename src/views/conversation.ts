import type { Conversation, Message } from '../types'
import { escapeHtml, formatDate } from './layout'

export function conversationView(conv: Conversation, messages: Message[]): string {
  const isOpen = conv.status === 'open'

  const messageThread = messages.map(msg => {
    const isOutbound = msg.direction === 'outbound'
    const body = msg.body_text
      ? `<pre class="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">${escapeHtml(msg.body_text)}</pre>`
      : msg.body_html
        ? `<div class="prose prose-sm max-w-none text-sm">${msg.body_html}</div>`
        : `<p class="text-sm text-gray-400 italic">No body</p>`

    return `
      <div class="flex gap-3 ${isOutbound ? 'flex-row-reverse' : ''}">
        <div class="w-8 h-8 rounded-full ${isOutbound ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'} flex items-center justify-center text-xs font-semibold shrink-0 mt-1">
          ${isOutbound ? 'Me' : escapeHtml((msg.from_name || msg.from_email).charAt(0).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0 max-w-2xl">
          <div class="flex items-baseline gap-2 mb-1 ${isOutbound ? 'flex-row-reverse' : ''}">
            <span class="text-xs font-medium text-gray-700">
              ${isOutbound ? escapeHtml(msg.from_email) : escapeHtml(msg.from_name || msg.from_email)}
            </span>
            <span class="text-xs text-gray-400">${formatDate(msg.created_at)}</span>
          </div>
          <div class="rounded-lg px-4 py-3 ${isOutbound ? 'bg-indigo-50 border border-indigo-100' : 'bg-white border border-gray-200'}">
            ${body}
          </div>
        </div>
      </div>`
  }).join('\n')

  return `
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4 sticky top-0 z-10">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <a href="/" hx-boost="true" class="text-xs text-gray-400 hover:text-gray-600">← Back</a>
        </div>
        <h2 class="text-base font-semibold text-gray-900 truncate">${escapeHtml(conv.subject)}</h2>
        <p class="text-xs text-gray-500 mt-0.5">
          ${escapeHtml(conv.customer_name || conv.customer_email)}
          <span class="text-gray-300 mx-1">·</span>
          ${escapeHtml(conv.mailbox_email)}
        </p>
      </div>
      <form method="POST" action="/c/${conv.id}/status"
            hx-post="/c/${conv.id}/status"
            hx-target="closest div[data-conv]"
            hx-swap="outerHTML">
        <button type="submit"
                class="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border ${isOpen
                  ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'border-green-300 text-green-700 hover:bg-green-50'}">
          ${isOpen ? 'Close' : 'Reopen'}
        </button>
      </form>
    </div>

    <!-- Messages -->
    <div data-conv="${conv.id}" class="px-6 py-6 space-y-6">
      ${messageThread}

      <!-- Reply form -->
      ${isOpen ? replyForm(conv) : `
        <div class="text-center py-6">
          <p class="text-sm text-gray-400">This conversation is closed.</p>
          <form hx-post="/c/${conv.id}/status" hx-target="closest div[data-conv]" hx-swap="outerHTML">
            <button class="mt-2 text-sm text-indigo-600 hover:underline">Reopen to reply</button>
          </form>
        </div>`}
    </div>`
}

function replyForm(conv: Conversation): string {
  return `
    <div class="border-t border-gray-200 pt-6">
      <form hx-post="/c/${conv.id}/reply"
            hx-target="div[data-conv=${conv.id}]"
            hx-swap="outerHTML"
            hx-indicator="#reply-spinner"
            class="space-y-3">
        <textarea name="body"
                  rows="5"
                  required
                  placeholder="Write your reply…"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"></textarea>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">
            Replying from <strong>${escapeHtml(conv.mailbox_email)}</strong>
            to <strong>${escapeHtml(conv.customer_email)}</strong>
          </span>
          <button type="submit"
                  class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <span>Send reply</span>
            <span id="reply-spinner" class="htmx-indicator text-xs opacity-70">sending…</span>
          </button>
        </div>
      </form>
    </div>`
}
