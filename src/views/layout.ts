import type { Mailbox, SessionUser } from '../types'

export function layout(
  content: string,
  opts: {
    user: SessionUser
    mailboxes: Mailbox[]
    counts: Record<string, number>
    activeMailbox?: string
    title?: string
  }
): string {
  const { user, mailboxes, counts, activeMailbox } = opts
  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0)

  const navItems = [
    `<a href="/"
        hx-boost="true"
        class="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium ${!activeMailbox ? 'bg-indigo-100 text-indigo-800' : 'text-gray-700 hover:bg-gray-100'}">
      <span>All inboxes</span>
      ${totalOpen > 0 ? `<span class="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">${totalOpen}</span>` : ''}
    </a>`,
    ...mailboxes.map(mb => {
      const count = counts[mb.email] ?? 0
      const active = activeMailbox === mb.email
      return `<a href="/?mailbox=${encodeURIComponent(mb.email)}"
          hx-boost="true"
          class="flex items-center justify-between px-3 py-2 rounded-md text-sm ${active ? 'bg-indigo-100 text-indigo-800 font-medium' : 'text-gray-600 hover:bg-gray-100'}">
        <span class="truncate">${escapeHtml(mb.name)}</span>
        ${count > 0 ? `<span class="ml-2 shrink-0 bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">${count}</span>` : ''}
      </a>`
    }),
  ].join('\n')

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title ?? 'Pigeon')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js"></script>
  <style>
    [hx-boost="true"] { cursor: pointer; }
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline; }
  </style>
</head>
<body class="h-full bg-gray-50 flex flex-col">

  <!-- Top bar -->
  <header class="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shrink-0 z-10">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
      <span class="font-semibold text-gray-900 text-sm">Pigeon</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm text-gray-500">${escapeHtml(user.name)}</span>
      <a href="/auth/logout" class="text-xs text-gray-400 hover:text-gray-600">Sign out</a>
    </div>
  </header>

  <!-- Body -->
  <div class="flex flex-1 overflow-hidden">

    <!-- Sidebar -->
    <nav class="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div class="p-3 space-y-0.5 flex-1 overflow-y-auto">
        ${navItems}
      </div>
      <div class="border-t border-gray-100 p-3">
        <a href="/mailboxes/new"
           class="block w-full text-center text-xs text-indigo-600 hover:text-indigo-800 py-1">
          + Add mailbox
        </a>
      </div>
    </nav>

    <!-- Main -->
    <main class="flex-1 overflow-y-auto" id="main">
      ${content}
    </main>

  </div>
</body>
</html>`
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' })
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
