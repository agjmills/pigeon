import { accessibleMailboxIds, canReadMailbox, canSendFrom } from '../lib/permissions'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getConversation, getMessages, getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
  createMessage, setConversationStatus, getLastMessageId,
  getCustomerById, getCustomerByEmail, linkConversationToCustomer, createCustomer,
  markConversationRead, saveAiSummary,
  getTagsForConversation, getAllTags, addTagToConversation, removeTagFromConversation,
  createAuditEntry, getMessageAttachmentsBulk, insertMessageAttachment, getDoNotContact,
} from '../lib/db'
import type { EmailAttachment } from '../lib/email-provider'
import { createEmailProvider } from '../lib/email-provider'
import { layout } from '../views/layout'
import { conversationView, convBodyView } from '../views/conversation'

export const conversationRoutes = new Hono<AppEnv>()

conversationRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [conv, messages, tags, allTags, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getTagsForConversation(c.env.DB, id),
    getAllTags(c.env.DB),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])

  if (!conv) return c.notFound()

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canReadMailbox(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.text('Forbidden', 403)
  }

  if (conv.unread) await markConversationRead(c.env.DB, id)

  const [customer, attachments] = await Promise.all([
    conv.customer_id ? getCustomerById(c.env.DB, conv.customer_id) : Promise.resolve(null),
    getMessageAttachmentsBulk(c.env.DB, id),
  ])

  return c.html(layout(conversationView(conv, messages, customer, tags, allTags, attachments), {
    user, mailboxes, accessibleMailboxIds: accessibleMailboxIds(c.get('permissions'), c.get('isAdmin'), mailboxes),
    domains, counts, unreadCounts,
    activeMailbox: conv.mailbox_email,
    title: conv.subject,
  }))
})

conversationRoutes.post('/:id/reply', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()

  const bodyHtml = String(body.body_html ?? '').trim()
  const bodyText = String(body.body_text ?? '').trim()

  if (!bodyText && !bodyHtml) return c.text('Empty reply', 400)

  const [conv, mailboxes] = await Promise.all([
    getConversation(c.env.DB, id),
    getMailboxes(c.env.DB),
  ])

  if (!conv) return c.notFound()
  if (conv.status === 'closed') return c.text('Conversation is closed', 400)

  const user = c.get('user')
  const mailbox = mailboxes.find(mb => mb.email === conv.mailbox_email)
  if (!canSendFrom(c.get('permissions'), c.get('isAdmin'), mailbox?.id ?? -1, mailbox?.domain_id ?? -1)) {
    return c.text('Forbidden: you do not have permission to send from this mailbox', 403)
  }

  const [customer, dnc] = await Promise.all([
    getCustomerByEmail(c.env.DB, conv.customer_email),
    getDoNotContact(c.env.DB, conv.customer_email),
  ])
  if (dnc) return c.text(`This address is on the do-not-contact list: ${dnc.reason}`, 409)
  if (customer?.opted_out_at) return c.text('Customer has opted out of emails', 409)
  if (customer?.bounced_at) return c.text('Email address has previously bounced', 409)

  const inReplyTo = await getLastMessageId(c.env.DB, id)

  // Collect file attachments from multipart form
  const emailAttachments: EmailAttachment[] = []
  const attachmentFiles = body['attachments[]'] ?? body['attachments']
  const rawFiles = Array.isArray(attachmentFiles) ? attachmentFiles : attachmentFiles ? [attachmentFiles] : []
  for (const file of rawFiles) {
    if (file instanceof File && file.size > 0) {
      emailAttachments.push({
        filename: file.name,
        content: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || 'application/octet-stream',
      })
    }
  }

  const trackingToken = crypto.randomUUID()
  const pixelUrl = `${c.env.APP_URL}/t/${trackingToken}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`

  const htmlWithPixel = bodyHtml ? bodyHtml + pixel : null

  const emailProvider = createEmailProvider(c.env)
  const { messageId } = await emailProvider.send({
    from: conv.mailbox_email,
    fromName: mailbox?.sender_name || mailbox?.name || conv.mailbox_email,
    to: conv.customer_email,
    subject: conv.subject,
    text: bodyText || bodyHtml.replace(/<[^>]*>/g, ''),
    html: htmlWithPixel,
    inReplyTo,
    attachments: emailAttachments.length ? emailAttachments : undefined,
  })

  const msgId = await createMessage(c.env.DB, {
    conversation_id: id,
    direction: 'outbound',
    from_email: conv.mailbox_email,
    from_name: user.name,
    to_email: conv.customer_email,
    subject: conv.subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    message_id: messageId,
    in_reply_to: inReplyTo,
    tracking_token: trackingToken,
  })

  // Store outbound attachments
  if (emailAttachments.length) {
    c.executionCtx.waitUntil((async () => {
      for (const att of emailAttachments) {
        const r2Key = `attachments/${msgId}/${crypto.randomUUID()}-${att.filename}`
        await c.env.ATTACHMENTS.put(r2Key, att.content)
        await insertMessageAttachment(c.env.DB, {
          message_id: msgId,
          filename: att.filename,
          mime_type: att.contentType,
          size: att.content.byteLength,
          r2_key: r2Key,
        })
      }
    })())
  }

  c.executionCtx.waitUntil(createAuditEntry(c.env.DB, {
    user_email: user.email,
    user_name: user.name,
    action: 'reply_sent',
    conversation_id: id,
    mailbox_email: conv.mailbox_email,
    metadata: { to: conv.customer_email, subject: conv.subject },
  }))

  const [updatedConv, updatedMessages, updatedAttachments] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMessageAttachmentsBulk(c.env.DB, id),
  ])

  const updatedCustomer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  return c.html(convBodyView(updatedConv!, updatedMessages, updatedCustomer, updatedAttachments))
})

conversationRoutes.get('/:id/summary', async (c) => {
  const id = parseInt(c.req.param('id'))
  const conv = await getConversation(c.env.DB, id)
  if (!conv) return c.notFound()

  const refresh = c.req.query('refresh') === '1'
  let summary = refresh ? null : conv.ai_summary
  if (!summary) {
    const messages = await getMessages(c.env.DB, id)
    const transcript = messages
      .filter(msg => msg.direction !== 'note')
      .map(msg => {
        const who = msg.direction === 'outbound' ? 'Agent' : 'Customer'
        const body = msg.body_text || (msg.body_html ?? '').replace(/<[^>]*>/g, '')
        return `${who}: ${body.trim().slice(0, 800)}`
      }).join('\n\n')

    try {
      const result = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'You are a concise email assistant. Summarise this support conversation in 2-3 sentences: the customer\'s issue, any resolution, and current status. Be factual and brief.',
          },
          { role: 'user', content: transcript },
        ],
      }) as { response?: string }
      summary = result.response?.trim() || null
      if (summary) await saveAiSummary(c.env.DB, id, summary)
    } catch (err) {
      console.error('AI summary error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      return c.html(summaryHtml(`Summary failed: ${msg}`))
    }
  }

  return c.html(summaryHtml(summary ?? 'No summary could be generated.'))
})

conversationRoutes.post('/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'))

  const conv = await getConversation(c.env.DB, id)
  if (!conv) return c.notFound()

  const newStatus = conv.status === 'open' ? 'closed' : 'open'
  await setConversationStatus(c.env.DB, id, newStatus)

  const [updatedConv, messages, attachments] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMessageAttachmentsBulk(c.env.DB, id),
  ])

  const customer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  const [tags, allTags] = await Promise.all([
    getTagsForConversation(c.env.DB, id),
    getAllTags(c.env.DB),
  ])
  return c.html(conversationView(updatedConv!, messages, customer, tags, allTags, attachments))
})

// Add tag to conversation
conversationRoutes.post('/:id/tags', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const tagId = parseInt(String(body.tag_id))
  if (tagId) {
    await addTagToConversation(c.env.DB, id, tagId)
  }
  return c.redirect(`/c/${id}`)
})

// Remove tag from conversation
conversationRoutes.post('/:id/tags/:tagId/remove', async (c) => {
  const id = parseInt(c.req.param('id'))
  const tagId = parseInt(c.req.param('tagId'))
  await removeTagFromConversation(c.env.DB, id, tagId)
  return c.redirect(`/c/${id}`)
})

conversationRoutes.post('/:id/note', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const bodyText = String(body.body_text ?? '').trim()
  const bodyHtml = String(body.body_html ?? '').trim()

  if (!bodyText && !bodyHtml) return c.text('Empty note', 400)

  const conv = await getConversation(c.env.DB, id)
  if (!conv) return c.notFound()

  const user = c.get('user')
  c.executionCtx.waitUntil(createAuditEntry(c.env.DB, {
    user_email: user.email,
    user_name: user.name,
    action: 'note_added',
    conversation_id: id,
    mailbox_email: conv.mailbox_email,
  }))

  await createMessage(c.env.DB, {
    conversation_id: id,
    direction: 'note',
    from_email: user.email,
    from_name: user.name,
    to_email: '',
    subject: conv.subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
  })

  const [updatedConv, messages, attachments] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMessageAttachmentsBulk(c.env.DB, id),
  ])

  const customer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  return c.html(convBodyView(updatedConv!, messages, customer, attachments))
})

function summaryHtml(summary: string): string {
  return `
    <div id="ai-summary" class="ai-summary">
      <div class="ai-summary-label">
        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
        AI Summary
      </div>
      ${summary.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
    </div>`
}
