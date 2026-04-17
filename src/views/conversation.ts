import type { Conversation, Customer, Message, Tag } from '../types'
import { escapeHtml, formatDate, tagBadge } from './layout'

export function conversationView(conv: Conversation, messages: Message[], customer: Customer | null, tags: Tag[] = [], allTags: Tag[] = []): string {
  return `
    <div id="conv-${conv.id}" style="display:flex;flex-direction:column;min-height:100%">
      ${convHeader(conv, tags, allTags)}
      ${convBody(conv, messages, customer)}
    </div>`
}

export function convBodyView(conv: Conversation, messages: Message[], customer: Customer | null): string {
  return convBody(conv, messages, customer)
}

function convHeader(conv: Conversation, tags: Tag[] = [], allTags: Tag[] = []): string {
  const isOpen = conv.status === 'open'
  const currentTagIds = new Set(tags.map(t => t.id))
  const availableTags = allTags.filter(t => !currentTagIds.has(t.id))

  const tagsHtml = tags.length || availableTags.length ? `
    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
      ${tags.map(t => tagBadge(t, { removable: true, convId: conv.id })).join('')}
      ${availableTags.length ? `
        <form method="POST" action="/c/${conv.id}/tags" style="display:inline-flex;align-items:center;margin:0">
          <select name="tag_id" onchange="if(this.value)this.form.submit()" style="background:transparent;border:1px dashed var(--border-strong);border-radius:4px;padding:2px 6px;font-size:11px;color:var(--t3);cursor:pointer;font-family:inherit;outline:none">
            <option value="">+ tag</option>
            ${availableTags.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
          </select>
        </form>` : ''}
    </div>` : ''

  return `
    <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;position:sticky;top:0;z-index:10">
      <div style="min-width:0">
        <a href="/" hx-boost="true" class="page-back" style="margin-bottom:4px">← Back</a>
        <h2 style="font-size:15px;font-weight:600;color:var(--t1);margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(conv.subject)}</h2>
        <p style="font-size:12px;color:var(--t2);margin:0">
          ${escapeHtml(conv.customer_name || conv.customer_email)}
          <span style="color:var(--border-strong);margin:0 5px">·</span>
          ${escapeHtml(conv.mailbox_email)}
        </p>
        ${tagsHtml}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <button hx-get="/c/${conv.id}/summary"
                hx-target="#ai-summary"
                hx-swap="outerHTML"
                hx-indicator="#summary-spinner"
                class="btn btn-secondary btn-sm" style="gap:5px">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          Summarise
          <span id="summary-spinner" class="htmx-indicator">…</span>
        </button>
        <form method="POST" action="/c/${conv.id}/status"
              hx-post="/c/${conv.id}/status"
              hx-target="#conv-${conv.id}"
              hx-swap="outerHTML">
          <button type="submit" class="btn btn-sm ${isOpen ? 'btn-secondary' : ''}"
                  ${!isOpen ? 'style="background:var(--success-s);color:var(--success);border-color:rgba(26,158,110,.3)"' : ''}>
            ${isOpen ? 'Close' : 'Reopen'}
          </button>
        </form>
      </div>
    </div>`
}

function convBody(conv: Conversation, messages: Message[], customer: Customer | null): string {
  const isOpen = conv.status === 'open'

  const thread = messages.map(msg => {
    const isOut = msg.direction === 'outbound'
    const isNote = msg.direction === 'note'
    const body = renderBody(msg)

    if (isNote) {
      return `
        <div style="display:flex;gap:10px;max-width:580px;margin:0 auto">
          <div style="flex:1;min-width:0">
            <div class="bubble bubble-note">
              <div class="note-label">Note — ${escapeHtml(msg.from_name || msg.from_email)} · ${formatDate(msg.created_at)}</div>
              ${body}
            </div>
          </div>
        </div>`
    }

    return `
      <div style="display:flex;gap:10px;${isOut ? 'flex-direction:row-reverse' : ''}">
        <div class="avatar ${isOut ? 'avatar-dark' : 'avatar-warm'}" style="margin-top:2px;font-size:12px">
          ${isOut ? 'Me' : escapeHtml((msg.from_name || msg.from_email).charAt(0).toUpperCase())}
        </div>
        <div style="flex:1;min-width:0;max-width:580px">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px;${isOut ? 'flex-direction:row-reverse' : ''}">
            <span style="font-size:12.5px;font-weight:500;color:var(--t1)">
              ${escapeHtml(msg.from_name || msg.from_email)}
            </span>
            <span style="font-size:11.5px;color:var(--t3)">${formatDate(msg.created_at)}</span>
          </div>
          <div class="bubble ${isOut ? 'bubble-out' : 'bubble-in'}">${body}</div>
        </div>
      </div>`
  }).join('\n')

  return `
    <div data-conv="${conv.id}" style="padding:20px;display:flex;flex-direction:column;gap:20px">
      ${conv.ai_summary
        ? `<div id="ai-summary" class="ai-summary">
            <div class="ai-summary-label">
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
              AI Summary
            </div>
            ${escapeHtml(conv.ai_summary).replace(/\n/g, '<br>')}
          </div>`
        : `<div id="ai-summary"></div>`}
      ${customerBar(conv, customer)}
      ${thread}
      ${isOpen ? replyForm(conv) : `
        <div style="text-align:center;padding:24px;color:var(--t3)">
          <p style="font-size:13px;margin:0 0 8px">This conversation is closed.</p>
          <form hx-post="/c/${conv.id}/status" hx-target="#conv-${conv.id}" hx-swap="outerHTML" style="display:inline">
            <button class="btn-text">Reopen to reply</button>
          </form>
        </div>`}
    </div>`
}

function renderBody(msg: Message): string {
  if (msg.body_html) {
    const doc = wrapEmailHtml(msg.body_html)
    const srcdoc = doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const onload = `(function(f){var dark=document.documentElement.classList.contains('dark');var d=f.contentDocument;var b=d&&d.body;if(b){if(dark){b.style.backgroundColor='#211e18';b.style.color='#ede7df';var links=b.querySelectorAll('a');for(var i=0;i<links.length;i++)links[i].style.color='#f09070';var bqs=b.querySelectorAll('blockquote');for(var j=0;j<bqs.length;j++){bqs[j].style.borderLeftColor='#3d3a33';bqs[j].style.color='#998f86';}}f.style.height=Math.min(d.documentElement.scrollHeight+16,600)+'px';}})(this)`
    return `<iframe srcdoc="${srcdoc}" sandbox="allow-same-origin allow-popups" style="width:100%;border:0;border-radius:4px;min-height:40px;display:block" onload="${onload}"></iframe>`
  }
  if (msg.body_text) {
    const cleaned = stripQuoted(msg.body_text)
    return `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13.5px;color:var(--t1);line-height:1.6;margin:0">${escapeHtml(cleaned)}</pre>`
  }
  return `<span style="font-size:13px;color:var(--t3);font-style:italic">No content</span>`
}

function wrapEmailHtml(html: string): string {
  if (html.toLowerCase().includes('<html')) return html
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,system-ui,sans-serif;font-size:14px;color:#1c1814;margin:0;padding:10px;word-break:break-word;line-height:1.55}
    a{color:#c04a1e}img{max-width:100%;height:auto}
    blockquote{border-left:3px solid #dbd5cd;margin:8px 0;padding-left:12px;color:#6b6560}
  </style></head><body>${html}</body></html>`
}

function stripQuoted(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('>')) continue
    if (/^[-_]{3,}\s*$/.test(line)) break
    if (/^On .{10,}wrote:/s.test(line)) break
    if (/^From:\s*.+/.test(line)) {
      const next = lines.slice(i + 1, i + 5).join('\n')
      if (/To:\s*.+/m.test(next) && /Date:\s*.+/m.test(next)) break
    }
    out.push(line)
  }
  return out.join('\n').trim()
}

function customerBar(conv: Conversation, customer: Customer | null): string {
  if (!customer) {
    return `
      <div class="customer-bar">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="flex-shrink:0;color:var(--t3)">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <span style="color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(conv.customer_name ? `${conv.customer_name} <${conv.customer_email}>` : conv.customer_email)}
          </span>
        </div>
        <form method="POST" action="/customers/from-conversation/${conv.id}" style="flex-shrink:0">
          <button type="submit" class="btn-text">Save as contact</button>
        </form>
      </div>`
  }

  return `
    <div class="customer-bar">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="flex-shrink:0;color:var(--accent)">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <a href="/customers/${customer.id}" hx-boost="true" style="color:var(--accent);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escapeHtml(customer.name || customer.email)}
        </a>
        ${customer.notes ? `<span style="color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">— ${escapeHtml(customer.notes.split('\n')[0])}</span>` : ''}
      </div>
      <a href="/customers/${customer.id}" hx-boost="true" class="btn-text" style="flex-shrink:0">View contact →</a>
    </div>`
}

function replyForm(conv: Conversation): string {
  return `
    <div style="border-top:1px solid var(--border);padding-top:20px">
      <div style="display:flex;gap:2px;margin-bottom:10px" id="reply-tabs">
        <button type="button" class="btn btn-sm btn-secondary" data-mode="reply"
                onclick="switchReplyMode('reply', ${conv.id})"
                style="font-size:12px" id="tab-reply">Reply</button>
        <button type="button" class="btn btn-sm btn-ghost" data-mode="note"
                onclick="switchReplyMode('note', ${conv.id})"
                style="font-size:12px" id="tab-note">Note</button>
      </div>
      <form id="reply-form"
            hx-post="/c/${conv.id}/reply"
            hx-target="div[data-conv='${conv.id}']"
            hx-swap="outerHTML"
            hx-indicator="#reply-spinner"
            onsubmit="document.getElementById('reply-body-html').value=document.getElementById('reply-editor').innerHTML;document.getElementById('reply-body-text').value=document.getElementById('reply-editor').innerText.trim()">

        <div class="editor-wrap" style="margin-bottom:12px" id="editor-wrap">
          <div class="editor-toolbar">
            <button type="button" onmousedown="event.preventDefault();document.execCommand('bold')" class="toolbar-btn" title="Bold"><strong>B</strong></button>
            <button type="button" onmousedown="event.preventDefault();document.execCommand('italic')" class="toolbar-btn" title="Italic"><em>I</em></button>
            <button type="button" onmousedown="event.preventDefault();document.execCommand('underline')" class="toolbar-btn" title="Underline" style="text-decoration:underline">U</button>
            <span class="editor-divider"></span>
            <button type="button" onmousedown="event.preventDefault();(function(){var u=prompt('URL:');if(u)document.execCommand('createLink',false,u)})()" class="toolbar-btn" title="Link">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
            </button>
            <button type="button" onmousedown="event.preventDefault();document.execCommand('removeFormat')" class="toolbar-btn" title="Clear formatting">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 17.94 6M3.75 9h11.25M5.25 15h8.25" /></svg>
            </button>
          </div>
          <div contenteditable="true"
               id="reply-editor"
               data-placeholder="Write your reply…"
               class="editor-body">
          </div>
        </div>

        <input type="hidden" name="body_html" id="reply-body-html">
        <input type="hidden" name="body_text" id="reply-body-text">

        <div style="display:flex;align-items:center;justify-content:space-between">
          <span id="reply-meta" style="font-size:12px;color:var(--t3)">
            From <strong style="color:var(--t2)">${escapeHtml(conv.mailbox_email)}</strong>
            to <strong style="color:var(--t2)">${escapeHtml(conv.customer_email)}</strong>
          </span>
          <button type="submit" class="btn btn-primary btn-sm" style="gap:6px" id="reply-submit">
            Send reply
            <span id="reply-spinner" class="htmx-indicator">…</span>
          </button>
        </div>
      </form>
      <script>
        function switchReplyMode(mode, convId) {
          var form = document.getElementById('reply-form');
          var wrap = document.getElementById('editor-wrap');
          var editor = document.getElementById('reply-editor');
          var meta = document.getElementById('reply-meta');
          var submit = document.getElementById('reply-submit');
          var tabReply = document.getElementById('tab-reply');
          var tabNote = document.getElementById('tab-note');
          if (mode === 'note') {
            form.setAttribute('hx-post', '/c/' + convId + '/note');
            editor.setAttribute('data-placeholder', 'Write an internal note…');
            wrap.style.borderColor = 'var(--warn-t)';
            meta.style.display = 'none';
            submit.firstChild.textContent = 'Add note';
            submit.style.background = 'var(--warn-t)';
            submit.style.borderColor = 'var(--warn-t)';
            tabNote.className = 'btn btn-sm btn-secondary';
            tabReply.className = 'btn btn-sm btn-ghost';
          } else {
            form.setAttribute('hx-post', '/c/' + convId + '/reply');
            editor.setAttribute('data-placeholder', 'Write your reply…');
            wrap.style.borderColor = '';
            meta.style.display = '';
            submit.firstChild.textContent = 'Send reply';
            submit.style.background = '';
            submit.style.borderColor = '';
            tabReply.className = 'btn btn-sm btn-secondary';
            tabNote.className = 'btn btn-sm btn-ghost';
          }
          htmx.process(form);
        }
      </script>
    </div>`
}
