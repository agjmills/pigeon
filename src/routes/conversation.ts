import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getConversation, getMessages, getMailboxes, getMailboxCounts,
  createMessage, setConversationStatus, getLastMessageId,
} from '../lib/db'
import { sendReply } from '../lib/resend'
import { layout } from '../views/layout'
import { conversationView } from '../views/conversation'

export const conversationRoutes = new Hono<AppEnv>()

conversationRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const [conv, messages, mailboxes, counts] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
  ])

  if (!conv) return c.notFound()

  const content = conversationView(conv, messages)
  return c.html(layout(content, {
    user, mailboxes, counts,
    activeMailbox: conv.mailbox_email,
    title: conv.subject,
  }))
})

conversationRoutes.post('/:id/reply', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const body = await c.req.parseBody()
  const replyText = String(body.body ?? '').trim()

  if (!replyText) return c.text('Empty reply', 400)

  const [conv, messages, mailboxes, counts] = await Promise.all([
    getConversation(c.env.DB, id),
    getMessages(c.env.DB, id),
    getMailboxes(c.env.DB),
    getMailboxCounts(c.env.DB),
  ])

  if (!conv) return c.notFound()
  if (conv.status === 'closed') return c.text('Conversation is closed', 400)

  const inReplyTo = await getLastMessageId(c.env.DB, id)

  const { messageId } = await sendReply({
    apiKey: c.env.RESEND_API_KEY,
    from: conv.mailbox_email,
    fromName: mailboxes.find(mb => mb.email === conv.mailbox_email)?.name ?? conv.mailbox_email,
    to: conv.customer_email,
    subject: conv.subject,
    text: replyText,
    inReplyTo,
  })

  await createMessage(c.env.DB, {
    conversation_id: id,
    direction: 'outbound',
    from_email: conv.mailbox_email,
    from_name: user.name,
    to_email: conv.customer_email,
    subject: conv.subject,
    body_text: replyText,
    message_id: messageId,
    in_reply_to: inReplyTo,
  })

  // Re-fetch updated messages and return the refreshed conversation fragment
  const updatedMessages = await getMessages(c.env.DB, id)
  return c.html(conversationView(conv, updatedMessages))
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

  return c.html(conversationView(updatedConv!, messages))
})
