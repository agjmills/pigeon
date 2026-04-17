import PostalMime from 'postal-mime'
import type { Bindings } from './types'
import { getMailbox, getDomainByName, findConversationByMessageId, findOpenConversationBySubject, createConversation, createMessage, markConversationUnread } from './lib/db'

export async function emailHandler(
  message: ForwardableEmailMessage,
  env: Bindings,
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
    // For catch-all: include original address in subject so it's visible
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

  await createMessage(env.DB, {
    conversation_id: conversationId,
    direction: 'inbound',
    from_email: fromEmail,
    from_name: fromName,
    to_email: toEmail,        // preserve original recipient
    subject,
    body_text: parsed.text ?? null,
    body_html: parsed.html ?? null,
    message_id: messageId,
    in_reply_to: inReplyTo,
    raw_r2_key: r2Key,
  })

  await markConversationUnread(env.DB, conversationId)
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
