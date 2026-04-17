import type { Domain, Mailbox, SessionUser } from '../types'

// ─── Global design tokens ────────────────────────────────────────────────────
// All colours live here as CSS custom properties.
// To retheme: update the values below. Light = :root, dark = .dark.
const DESIGN_SYSTEM = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,450;14..32,500;14..32,550;14..32,600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:           #f5f2ee;
    --bg-alt:       #ede9e3;
    --surface:      #ffffff;
    --sidebar:      #eae6df;
    --border:       #dbd5cd;
    --border-strong:#c4bdb4;
    --t1:           #1c1814;
    --t2:           #6b6560;
    --t3:           #a09890;
    --accent:       #c04a1e;
    --accent-h:     #a63d18;
    --accent-s:     #fce8dc;
    --accent-t:     #943214;
    --danger:       #d03030;
    --danger-s:     #fef2f2;
    --success:      #1a9e6e;
    --success-s:    #ecfdf5;
    --warn-s:       #fffbeb;
    --warn-t:       #92400e;
    --shadow-sm:    0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05);
    --shadow-md:    0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.05);
    --radius:       8px;
    --radius-sm:    6px;
    --radius-lg:    12px;
  }
  .dark {
    --bg:           #131009;
    --bg-alt:       #1b1813;
    --surface:      #211e18;
    --sidebar:      #181510;
    --border:       #2d2a24;
    --border-strong:#3d3a33;
    --t1:           #ede7df;
    --t2:           #998f86;
    --t3:           #5e5950;
    --accent:       #e0602c;
    --accent-h:     #cc5224;
    --accent-s:     #2a1408;
    --accent-t:     #f09070;
    --danger:       #f87171;
    --danger-s:     #2b0f0f;
    --success:      #34d399;
    --success-s:    #0a2a1e;
    --warn-s:       #2a2008;
    --warn-t:       #fbbf24;
    --shadow-sm:    0 1px 3px rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.15);
    --shadow-md:    0 4px 12px rgba(0,0,0,.3), 0 2px 4px rgba(0,0,0,.2);
  }

  *, *::before, *::after { box-sizing: border-box; }

  html, body { height: 100%; margin: 0; }

  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--t1);
    font-size: 13.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  a { color: inherit; text-decoration: none; }

  /* ── Scrollbars ── */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--t3); }

  /* ── Topbar ── */
  .topbar {
    height: 52px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
    z-index: 10;
  }
  .topbar-brand {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
    font-size: 14px;
    color: var(--t1);
  }
  .topbar-brand svg { color: var(--accent); }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .topbar-user {
    font-size: 12.5px;
    color: var(--t2);
  }
  .topbar-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    border-radius: var(--radius-sm);
    color: var(--t3);
    display: flex;
    align-items: center;
    transition: color 120ms, background 120ms;
  }
  .topbar-btn:hover { color: var(--t1); background: var(--bg-alt); }
  .topbar-link {
    font-size: 12px;
    color: var(--t3);
    transition: color 120ms;
  }
  .topbar-link:hover { color: var(--t1); }

  /* ── Sidebar ── */
  .sidebar {
    width: 220px;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .sidebar-scroll { flex: 1; overflow-y: auto; padding: 10px 8px; }
  .sidebar-bottom {
    border-top: 1px solid var(--border);
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--t2);
    cursor: pointer;
    transition: background 100ms, color 100ms;
    text-decoration: none;
    gap: 6px;
  }
  .nav-item:hover { background: rgba(0,0,0,.05); color: var(--t1); }
  .dark .nav-item:hover { background: rgba(255,255,255,.06); }
  .nav-item.active {
    background: var(--accent-s);
    color: var(--accent-t);
    font-weight: 500;
  }
  .nav-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .nav-section {
    margin-top: 14px;
  }
  .nav-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 10px 4px;
  }
  .nav-section-title {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--t3);
  }
  .nav-section-gear {
    color: var(--t3);
    opacity: 0;
    transition: opacity 120ms, color 120ms;
    padding: 2px;
    border-radius: 4px;
  }
  .nav-section-head:hover .nav-section-gear { opacity: 1; }
  .nav-section-gear:hover { color: var(--t1); }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 100ms, border-color 100ms, color 100ms;
    border: 1px solid transparent;
    text-decoration: none;
    line-height: 1.4;
    white-space: nowrap;
  }
  .btn-primary  { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-primary:hover { background: var(--accent-h); border-color: var(--accent-h); }
  .btn-secondary {
    background: var(--surface);
    color: var(--t1);
    border-color: var(--border-strong);
  }
  .btn-secondary:hover { background: var(--bg-alt); }
  .btn-ghost { background: transparent; color: var(--t2); }
  .btn-ghost:hover { background: var(--bg-alt); color: var(--t1); }
  .btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
  .btn-danger:hover { opacity: .88; }
  .btn-sm  { padding: 4px 10px; font-size: 12px; }
  .btn-xs  { padding: 2px 8px; font-size: 11.5px; border-radius: 5px; }
  .btn-compose {
    background: var(--accent);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: 7px 12px;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: background 100ms;
    text-decoration: none;
    border: none;
  }
  .btn-compose:hover { background: var(--accent-h); }
  .btn-text {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    transition: opacity 100ms;
  }
  .btn-text:hover { opacity: .75; }
  .btn-text-muted {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 12px;
    color: var(--t3);
    cursor: pointer;
    padding: 0;
    transition: color 100ms;
  }
  .btn-text-muted:hover { color: var(--t1); }

  /* ── Badge ── */
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 10.5px;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    flex-shrink: 0;
    line-height: 1;
  }
  .badge-muted {
    background: var(--border-strong);
    color: var(--surface);
  }

  /* ── Inputs ── */
  .field {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 7px 11px;
    font-size: 13.5px;
    color: var(--t1);
    font-family: inherit;
    transition: border-color 120ms, box-shadow 120ms;
    outline: none;
    line-height: 1.5;
  }
  .field:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(192,74,30,.13);
  }
  .dark .field:focus { box-shadow: 0 0 0 3px rgba(224,96,44,.18); }
  .field::placeholder { color: var(--t3); }
  select.field { cursor: pointer; }
  textarea.field { resize: vertical; }

  .field-label {
    display: block;
    font-size: 11.5px;
    font-weight: 550;
    color: var(--t2);
    margin-bottom: 5px;
    letter-spacing: .02em;
  }
  .field-hint { font-size: 11.5px; color: var(--t3); margin-top: 4px; }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .card-raised {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }

  /* ── Alerts ── */
  .alert {
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-size: 13px;
    border: 1px solid transparent;
  }
  .alert-error   { background: var(--danger-s); color: var(--danger); border-color: rgba(208,48,48,.25); }
  .alert-success { background: var(--success-s); color: var(--success); }
  .alert-warn    { background: var(--warn-s); color: var(--warn-t); }

  /* ── Rich text editor ── */
  .editor-wrap {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .editor-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(192,74,30,.13);
  }
  .dark .editor-wrap:focus-within { box-shadow: 0 0 0 3px rgba(224,96,44,.18); }
  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    background: var(--bg-alt);
    border-bottom: 1px solid var(--border);
  }
  .editor-divider {
    width: 1px;
    height: 16px;
    background: var(--border-strong);
    margin: 0 4px;
    flex-shrink: 0;
  }
  .toolbar-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    font-size: 12.5px;
    font-family: inherit;
    transition: background 100ms, color 100ms;
  }
  .toolbar-btn:hover { background: var(--border); color: var(--t1); }
  .editor-body {
    min-height: 120px;
    padding: 10px 14px;
    background: var(--surface);
    color: var(--t1);
    font-family: inherit;
    font-size: 13.5px;
    line-height: 1.6;
    outline: none;
  }
  .editor-body:empty::before {
    content: attr(data-placeholder);
    color: var(--t3);
    pointer-events: none;
    display: block;
  }

  /* ── Inbox rows ── */
  .inbox-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border);
    transition: background 80ms;
    text-decoration: none;
    color: inherit;
  }
  .inbox-row:hover { background: var(--surface); }
  .inbox-row:last-child { border-bottom: none; }

  /* ── Avatars ── */
  .avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .avatar-warm  { background: var(--accent-s); color: var(--accent-t); }
  .avatar-dark  { background: var(--accent); color: #fff; }

  /* ── Message bubbles ── */
  .bubble {
    border-radius: var(--radius);
    padding: 11px 15px;
    font-size: 13.5px;
    line-height: 1.6;
  }
  .bubble-in  {
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .bubble-out {
    background: var(--accent-s);
    border: 1px solid rgba(192,74,30,.18);
  }
  .dark .bubble-out { border-color: rgba(224,96,44,.22); }
  .bubble-note {
    background: var(--warn-s);
    border: 1px solid rgba(146,64,14,.18);
  }
  .dark .bubble-note { border-color: rgba(251,191,36,.18); }
  .note-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--warn-t);
    margin-bottom: 4px;
  }

  /* ── Unread indicator ── */
  .unread-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    margin-top: 5px;
  }

  /* ── Customer bar ── */
  .customer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 14px;
    font-size: 12.5px;
  }

  /* ── AI summary ── */
  .ai-summary {
    background: linear-gradient(135deg, var(--accent-s) 0%, var(--surface) 100%);
    border: 1px solid rgba(192,74,30,.2);
    border-radius: var(--radius);
    padding: 14px 16px;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--t1);
  }
  .ai-summary-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  /* ── Page layout helpers ── */
  .page-wrap  { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
  .page-title { font-size: 18px; font-weight: 600; color: var(--t1); margin: 0 0 20px; }
  .page-back  { font-size: 12px; color: var(--t3); transition: color 100ms; margin-bottom: 6px; display: inline-block; }
  .page-back:hover { color: var(--t1); }

  .row-list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .row-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .row-item:last-child { border-bottom: none; }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--t3);
    margin-bottom: 8px;
  }

  .danger-zone {
    border: 1px solid rgba(208,48,48,.25);
    border-radius: var(--radius);
    padding: 16px;
    background: var(--danger-s);
  }

  /* ── Tabs ── */
  .tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 16px; }
  .tab {
    padding: 12px 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--t3);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 100ms, border-color 100ms;
    text-decoration: none;
  }
  .tab:hover { color: var(--t1); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* ── Inline status ── */
  .pill-open   { font-size: 11px; font-weight: 500; color: var(--success); }
  .pill-closed { font-size: 11px; color: var(--t3); }

  /* ── HTMX ── */
  [hx-boost], [hx-get], [hx-post] { cursor: pointer; }
  .htmx-indicator { display: none; opacity: .6; }
  .htmx-request .htmx-indicator { display: inline; }

  /* ── Compose header fields ── */
  .compose-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
  }
  .compose-label { font-size: 12.5px; color: var(--t3); text-align: right; font-weight: 500; }
  .compose-input {
    background: transparent;
    border: none;
    outline: none;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--t1);
    width: 100%;
  }
  .compose-input::placeholder { color: var(--t3); }
  select.compose-input { cursor: pointer; }
  .compose-input option { background: var(--surface); }

  /* ── Tag badges (dark mode) ── */
  .dark .tag-badge {
    background: attr(data-dark-bg) !important;
    color: attr(data-dark-text) !important;
  }
</style>
<script>
  // Apply dark mode colors to tag badges after DOM load
  function applyTagColors() {
    var isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.tag-badge').forEach(function(el) {
      var bg = isDark ? el.getAttribute('data-dark-bg') : el.getAttribute('data-light-bg');
      var text = isDark ? el.getAttribute('data-dark-text') : el.getAttribute('data-light-text');
      if (bg) el.style.background = bg;
      if (text) el.style.color = text;
    });
  }
  // Run on page load and HTMX swaps
  document.addEventListener('DOMContentLoaded', applyTagColors);
  document.addEventListener('htmx:afterSwap', applyTagColors);
</script>`

export function layout(
  content: string,
  opts: {
    user: SessionUser
    mailboxes: Mailbox[]
    domains: Domain[]
    counts: Record<string, number>
    unreadCounts?: Record<string, number>
    activeMailbox?: string
    title?: string
  }
): string {
  const { user, mailboxes, domains, counts, activeMailbox } = opts
  const unreadCounts = opts.unreadCounts ?? {}
  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0)
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  const mailboxesByDomain = new Map<number, Mailbox[]>()
  for (const mb of mailboxes) {
    if (mb.domain_id == null) continue
    const list = mailboxesByDomain.get(mb.domain_id) ?? []
    list.push(mb)
    mailboxesByDomain.set(mb.domain_id, list)
  }

  const domainSections = domains.map(domain => {
    const dMailboxes = mailboxesByDomain.get(domain.id) ?? []
    const rows = dMailboxes.map(mb => {
      const unread = unreadCounts[mb.email] ?? 0
      const open = counts[mb.email] ?? 0
      const active = activeMailbox === mb.email
      return `
        <a href="/?mailbox=${encodeURIComponent(mb.email)}" hx-boost="true"
           class="nav-item${active ? ' active' : ''}">
          <span class="nav-item-label">${escapeHtml(mb.name)}</span>
          ${unread > 0
            ? `<span class="badge">${unread}</span>`
            : open > 0
              ? `<span class="badge badge-muted">${open}</span>`
              : ''}
        </a>`
    }).join('')

    return `
      <div class="nav-section">
        <a href="/domains/${domain.id}" hx-boost="true" class="nav-section-head" style="text-decoration:none;display:flex;align-items:center;justify-content:space-between">
          <span class="nav-section-title">${escapeHtml(domain.domain)}</span>
          <span class="nav-section-gear" title="Domain settings">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
        </a>
        ${rows}
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en" style="height:100%">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title ?? 'Pigeon')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'class', corePlugins: { preflight: false } }</script>
  <script src="https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js"></script>
  <script>
    (function() {
      var s = localStorage.getItem('theme');
      if (s === 'dark' || (!s && matchMedia('(prefers-color-scheme: dark)').matches))
        document.documentElement.classList.add('dark');
    })();
  </script>
  ${DESIGN_SYSTEM}
</head>
<body style="display:flex;flex-direction:column;height:100%">

  <header class="topbar">
    <div class="topbar-brand">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
      Pigeon
    </div>
    <div class="topbar-right">
      <span class="topbar-user">${escapeHtml(user.name)}</span>
      <button class="topbar-btn"
              onclick="(function(){var d=document.documentElement;var dk=d.classList.toggle('dark');localStorage.setItem('theme',dk?'dark':'light')})()"
              title="Toggle theme">
        <svg width="15" height="15" class="dark:hidden" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6 9.718 9.718 0 019 2.248 9.75 9.75 0 1021.752 15.002z" />
        </svg>
        <svg width="15" height="15" class="hidden dark:block" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      </button>
      <a href="/auth/logout" class="topbar-link">Sign out</a>
    </div>
  </header>

  <div style="flex:1;display:flex;overflow:hidden">
    <nav class="sidebar">
      <div class="sidebar-scroll">
        <a href="/" hx-boost="true" class="nav-item${!activeMailbox ? ' active' : ''}">
          <span class="nav-item-label">All inboxes</span>
          ${totalUnread > 0
            ? `<span class="badge">${totalUnread}</span>`
            : totalOpen > 0
              ? `<span class="badge badge-muted">${totalOpen}</span>`
              : ''}
        </a>
        ${domainSections}
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          <a href="/customers" hx-boost="true" class="nav-item" style="gap:8px">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="flex-shrink:0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span class="nav-item-label">Contacts</span>
          </a>
          <a href="/organizations" hx-boost="true" class="nav-item" style="gap:8px">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="flex-shrink:0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            <span class="nav-item-label">Organizations</span>
          </a>
          <a href="/tags" hx-boost="true" class="nav-item" style="gap:8px">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="flex-shrink:0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            <span class="nav-item-label">Tags</span>
          </a>
        </div>
      </div>
      <div class="sidebar-bottom">
        <a href="/compose" hx-boost="true" class="btn-compose">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Compose
        </a>
        <a href="/mailboxes/new" hx-boost="true"
           style="text-align:center;font-size:12px;color:var(--t3);padding:4px 0;transition:color 100ms"
           onmouseover="this.style.color='var(--t1)'" onmouseout="this.style.color='var(--t3)'">
          + Add mailbox
        </a>
      </div>
    </nav>

    <main style="flex:1;overflow-y:auto" id="main">
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

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  gray:   { bg: 'var(--bg-alt)',    text: 'var(--t2)' },
  red:    { bg: '#fef2f2',         text: '#b91c1c' },
  orange: { bg: '#fff7ed',         text: '#c2410c' },
  yellow: { bg: '#fffbeb',         text: '#a16207' },
  green:  { bg: '#ecfdf5',         text: '#15803d' },
  blue:   { bg: '#eff6ff',         text: '#1d4ed8' },
  purple: { bg: '#faf5ff',         text: '#7e22ce' },
  pink:   { bg: '#fdf2f8',         text: '#be185d' },
}

const TAG_COLORS_DARK: Record<string, { bg: string; text: string }> = {
  gray:   { bg: 'var(--bg-alt)',    text: 'var(--t2)' },
  red:    { bg: '#2b0f0f',         text: '#fca5a5' },
  orange: { bg: '#2a1408',         text: '#fdba74' },
  yellow: { bg: '#2a2008',         text: '#fcd34d' },
  green:  { bg: '#0a2a1e',         text: '#6ee7b7' },
  blue:   { bg: '#0c1a2e',         text: '#93c5fd' },
  purple: { bg: '#1a0a2e',         text: '#c4b5fd' },
  pink:   { bg: '#2a0a1e',         text: '#f9a8d4' },
}

export function tagBadge(tag: { name: string; color: string; id?: number }, opts?: { removable?: boolean; convId?: number }): string {
  const c = TAG_COLORS[tag.color] ?? TAG_COLORS.gray
  const cd = TAG_COLORS_DARK[tag.color] ?? TAG_COLORS_DARK.gray
  const style = `display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:500;white-space:nowrap;background:${c.bg};color:${c.text}`

  if (opts?.removable && tag.id && opts.convId) {
    return `<span class="tag-badge" style="${style}" data-light-bg="${c.bg}" data-light-text="${c.text}" data-dark-bg="${cd.bg}" data-dark-text="${cd.text}">
      ${escapeHtml(tag.name)}
      <form method="POST" action="/c/${opts.convId}/tags/${tag.id}/remove" style="display:inline;margin:0;padding:0">
        <button type="submit" style="background:none;border:none;cursor:pointer;padding:0;margin:0;font-size:10px;color:inherit;opacity:.6;line-height:1" title="Remove tag">✕</button>
      </form>
    </span>`
  }

  return `<span class="tag-badge" style="${style}" data-light-bg="${c.bg}" data-light-text="${c.text}" data-dark-bg="${cd.bg}" data-dark-text="${cd.text}">${escapeHtml(tag.name)}</span>`
}

export const TAG_COLOR_OPTIONS = Object.keys(TAG_COLORS)

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
