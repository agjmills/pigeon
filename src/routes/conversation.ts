import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getConversation, getMessages, getMailboxes, getMailboxCounts, getUnreadCounts, getDomains,
  createMessage, setConversationStatus, getLastMessageId,
  getCustomerById, linkConversationToCustomer, createCustomer,
  markConversationRead, saveAiSummary,
} from '../lib/db'
import { sendReply } from '../lib/resend'
import { layout } from '../views/layout'
import { conversationView, convBodyView } from '../views/conversation'

export const conversationRoutes = new Hono<AppEnv>()

conversationRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [conv, messages, mailboxes, domains, counts, unreadCounts] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMailboxes(c.env.DB),
    getDomains(c.env.DB),
    getMailboxCounts(c.env.DB),
    getUnreadCounts(c.env.DB),
  ])

  if (!conv) return c.notFound()

  if (conv.unread) await markConversationRead(c.env.DB, id)

  const customer = conv.customer_id ? await getCustomerById(c.env.DB, conv.customer_id) : null

  return c.html(layout(conversationView(conv, messages, customer), {
    user, mailboxes, domains, counts, unreadCounts,
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

  const inReplyTo = await getLastMessageId(c.env.DB, id)

  const mailbox = mailboxes.find(mb => mb.email === conv.mailbox_email)
  const { messageId } = await sendReply({
    apiKey: c.env.RESEND_API_KEY,
    from: conv.mailbox_email,
    fromName: mailbox?.sender_name || mailbox?.name || conv.mailbox_email,
    to: conv.customer_email,
    subject: conv.subject,
    text: bodyText || bodyHtml.replace(/<[^>]*>/g, ''),
    html: bodyHtml || null,
    inReplyTo,
  })

  const user = c.get('user')
  await createMessage(c.env.DB, {
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
  })

  const [updatedConv, updatedMessages] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
  ])

  const customer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  return c.html(convBodyView(updatedConv!, updatedMessages, customer))
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
      console.log('AI result:', JSON.stringify(result))
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

  const [updatedConv, messages] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
  ])

  const customer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  return c.html(conversationView(updatedConv!, messages, customer))
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

  const [updatedConv, messages] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
  ])

  const customer = updatedConv?.customer_id ? await getCustomerById(c.env.DB, updatedConv.customer_id) : null
  return c.html(convBodyView(updatedConv!, messages, customer))
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
