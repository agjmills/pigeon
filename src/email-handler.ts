import PostalMime from 'postal-mime'
import type { Bindings } from './types'
import { getMailbox, findConversationByMessageId, createConversation, createMessage } from './lib/db'

export async function emailHandler(
  message: ForwardableEmailMessage,
  env: Bindings,
): Promise<void> {
  // Validate shared secret when called via HTTP pipe (Email Workers skip this)
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

  // Check if this mailbox is configured
  const mailbox = await getMailbox(env.DB, toEmail)
  if (!mailbox) {
    console.warn(`Courier: no mailbox configured for ${toEmail}, discarding`)
    return
  }

  // Thread: look for an existing conversation via In-Reply-To
  let conversationId: number | null = null
  if (inReplyTo) {
    const existing = await findConversationByMessageId(env.DB, inReplyTo)
    if (existing) conversationId = existing.id
  }

  // New conversation
  if (!conversationId) {
    conversationId = await createConversation(env.DB, {
      mailbox_email: toEmail,
      subject,
      customer_email: fromEmail,
      customer_name: fromName,
    })
  }

  await createMessage(env.DB, {
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
