import PostalMime from 'postal-mime'
import type { Bindings, MailboxWebhook } from './types'
import {
  getMailbox, getDomainByName, findConversationByMessageId, findOpenConversationBySubject,
  createConversation, createMessage, markConversationUnread,
  setCustomerBounced, insertMessageAttachment, getWebhooksForMailbox,
} from './lib/db'

export async function emailHandler(
  message: ForwardableEmailMessage,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const rawEmail = await streamToBuffer(message.raw)

  // Store raw email in R2 for archival
  const r2Key = `emails/${Date.now()}-${crypto.randomUUID()}.eml`
  await env.ATTACHMENTS.put(r2Key, rawEmail)

  // Parse the MIME message
  const parsed = await new PostalMime().parse(rawEmail)

  const toEmail = message.to.toLowerCase().trim()
  const fromEmail = (parsed.from?.address ?? '').toLowerCase()
  const fromName = parsed.from?.name ?? null
  const subject = parsed.subject ?? '(no subject)'
  const messageId = parsed.messageId ?? null
  const inReplyTo = parsed.inReplyTo ?? null

  // Detect DSN/bounce emails (mailer-daemon, postmaster, delivery-status)
  if (isBounceMessage(parsed, fromEmail)) {
    await handleBounce(env, parsed)
    return
  }

  // Check if this mailbox is configured; fall back to domain catch-all mailbox
  let mailbox = await getMailbox(env.DB, toEmail)
  let effectiveMailboxEmail = toEmail

  if (!mailbox) {
    const domainPart = toEmail.split('@')[1]
    if (domainPart) {
      const domain = await getDomainByName(env.DB, domainPart)
      if (domain?.catchall_mailbox_email) {
        mailbox = await getMailbox(env.DB, domain.catchall_mailbox_email)
        if (mailbox) effectiveMailboxEmail = domain.catchall_mailbox_email
      }
    }
  }

  if (!mailbox) {
    console.warn(`No mailbox configured for ${toEmail} and no catch-all set, discarding`)
    return
  }

  // Thread: look for an existing conversation via In-Reply-To header
  let conversationId: number | null = null
  if (inReplyTo) {
    const existing = await findConversationByMessageId(env.DB, inReplyTo)
    if (existing) conversationId = existing.id
  }

  // Also check References header as fallback
  if (!conversationId && parsed.references) {
    const refs = parsed.references.trim().split(/\s+/)
    for (const ref of refs.reverse()) {
      const existing = await findConversationByMessageId(env.DB, ref)
      if (existing) { conversationId = existing.id; break }
    }
  }

  // Subject-based threading fallback: Re: subject from same customer to same mailbox
  if (!conversationId && subject.toLowerCase().startsWith('re:')) {
    const baseSubject = subject.replace(/^(re:\s*)+/i, '').trim()
    const existing = await findOpenConversationBySubject(env.DB, effectiveMailboxEmail, fromEmail, baseSubject)
    if (existing) conversationId = existing.id
  }

  // New conversation
  if (!conversationId) {
    const displaySubject = effectiveMailboxEmail !== toEmail
      ? `[→ ${toEmail}] ${subject}`
      : subject
    conversationId = await createConversation(env.DB, {
      mailbox_email: effectiveMailboxEmail,
      subject: displaySubject,
      customer_email: fromEmail,
      customer_name: fromName,
    })
  }

  const msgId = await createMessage(env.DB, {
    conversation_id: conversationId,
    direction: 'inbound',
    from_email: fromEmail,
    from_name: fromName,
    to_email: toEmail,
    subject,
    body_text: parsed.text ?? null,
    body_html: parsed.html ?? null,
    message_id: messageId,
    in_reply_to: inReplyTo,
    raw_r2_key: r2Key,
  })

  await markConversationUnread(env.DB, conversationId)

  // Store inbound attachments in R2
  if (parsed.attachments?.length) {
    const attsForSave = parsed.attachments.map(a => ({
      filename: a.filename ?? null,
      mimeType: a.mimeType,
      content: typeof a.content === 'string' ? new TextEncoder().encode(a.content) : a.content,
    }))
    ctx.waitUntil(saveAttachments(env, msgId, attsForSave))
  }

  // Fire registered webhooks for this mailbox
  const webhooks = await getWebhooksForMailbox(env.DB, effectiveMailboxEmail)
  if (webhooks.length) {
    const payload = JSON.stringify({
      event: 'message.received',
      conversation_id: conversationId,
      message_id: msgId,
      mailbox_email: effectiveMailboxEmail,
      from_email: fromEmail,
      subject,
    })
    ctx.waitUntil(fireWebhooks(webhooks, payload))
  }
}

async function saveAttachments(
  env: Bindings,
  msgId: number,
  attachments: Array<{ filename?: string | null; mimeType?: string; content?: ArrayBuffer | Uint8Array }>
): Promise<void> {
  for (const att of attachments) {
    if (!att.content) continue
    const filename = att.filename || 'attachment'
    const mimeType = att.mimeType || 'application/octet-stream'
    const bytes = att.content instanceof Uint8Array ? att.content : new Uint8Array(att.content)
    const size = bytes.byteLength
    const r2Key = `attachments/${msgId}/${crypto.randomUUID()}-${filename}`
    await env.ATTACHMENTS.put(r2Key, bytes)
    await insertMessageAttachment(env.DB, { message_id: msgId, filename, mime_type: mimeType, size, r2_key: r2Key })
  }
}

async function fireWebhooks(webhooks: MailboxWebhook[], payload: string): Promise<void> {
  for (const hook of webhooks) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
      try {
        const sig = await hmacSign(payload, hook.secret)
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pigeon-Signature': `sha256=${sig}` },
          body: payload,
        })
        if (res.ok) break
      } catch {
        // retry on next iteration
      }
    }
  }
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function isBounceMessage(parsed: Awaited<ReturnType<PostalMime['parse']>>, fromEmail: string): boolean {
  if (fromEmail.startsWith('mailer-daemon@') || fromEmail.startsWith('postmaster@')) return true
  if (fromEmail === 'mailer-daemon') return true
  const contentType = (parsed as Record<string, unknown>).contentType as string | undefined
  if (contentType?.includes('multipart/report') || contentType?.includes('message/delivery-status')) return true
  return false
}

async function handleBounce(
  env: Bindings,
  parsed: Awaited<ReturnType<PostalMime['parse']>>
): Promise<void> {
  const parts = parsed.attachments as Array<{ mimeType?: string; content?: ArrayBuffer }> | undefined
  if (!parts) return

  for (const part of parts) {
    if (part.mimeType !== 'message/delivery-status' && part.mimeType !== 'text/rfc822-headers') continue
    if (!part.content) continue

    const text = new TextDecoder().decode(part.content)
    const statusMatch = text.match(/^Status:\s*([\d.]+)/im)
    const recipientMatch = text.match(/^Final-Recipient:\s*(?:rfc822;\s*)?(\S+)/im)

    if (!statusMatch || !recipientMatch) continue

    const statusCode = statusMatch[1]
    const recipientEmail = recipientMatch[1].toLowerCase().replace(/[<>]/g, '')

    if (statusCode.startsWith('5')) {
      await setCustomerBounced(env.DB, recipientEmail, Math.floor(Date.now() / 1000))
    }
    return
  }
}

async function streamToBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer
}
