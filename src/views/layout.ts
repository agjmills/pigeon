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
        class="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium ${!activeMailbox ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}">
      <span>All inboxes</span>
      ${totalOpen > 0 ? `<span class="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">${totalOpen}</span>` : ''}
    </a>`,
    ...mailboxes.map(mb => {
      const count = counts[mb.email] ?? 0
      const active = activeMailbox === mb.email
      return `<div class="group flex items-center gap-1 rounded-md ${active ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}">
        <a href="/?mailbox=${encodeURIComponent(mb.email)}"
           hx-boost="true"
           class="flex flex-1 items-center justify-between px-3 py-2 text-sm min-w-0 ${active ? 'text-indigo-800 dark:text-indigo-200 font-medium' : 'text-gray-600 dark:text-gray-400'}">
          <span class="truncate">${escapeHtml(mb.name)}</span>
          ${count > 0 ? `<span class="ml-2 shrink-0 bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">${count}</span>` : ''}
        </a>
        <a href="/mailboxes/${mb.id}/edit"
           hx-boost="true"
           title="Edit mailbox"
           class="shrink-0 pr-2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
        </a>
      </div>`
    }),
  ].join('\n')

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title ?? 'Pigeon')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'class' }</script>
  <script>
    (function() {
      var saved = localStorage.getItem('theme');
      if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    })();
  </script>
  <script src="https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js"></script>
  <style>
    [hx-boost="true"] { cursor: pointer; }
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline; }
  </style>
</head>
<body class="h-full bg-gray-50 dark:bg-gray-900 flex flex-col">

  <!-- Top bar -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 h-14 flex items-center justify-between shrink-0 z-10">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
      <span class="font-semibold text-gray-900 dark:text-gray-100 text-sm">Pigeon</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(user.name)}</span>
      <button onclick="(function(){var d=document.documentElement;var dark=d.classList.toggle('dark');localStorage.setItem('theme',dark?'dark':'light');})()"
              class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded"
              title="Toggle dark mode">
        <svg class="w-4 h-4 dark:hidden" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6 9.718 9.718 0 019 2.248A9.75 9.75 0 1021.752 15.002z" />
        </svg>
        <svg class="w-4 h-4 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      </button>
      <a href="/auth/logout" class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Sign out</a>
    </div>
  </header>

  <!-- Body -->
  <div class="flex flex-1 overflow-hidden">

    <!-- Sidebar -->
    <nav class="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
      <div class="p-3 space-y-0.5 flex-1 overflow-y-auto">
        ${navItems}
      </div>
      <div class="border-t border-gray-100 dark:border-gray-700 p-3">
        <a href="/mailboxes/new"
           class="block w-full text-center text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 py-1">
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
