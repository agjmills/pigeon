import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getMessageAttachment, getConversation, getMailboxes } from '../lib/db'
import { canReadMailbox } from '../lib/permissions'

export const attachmentRoutes = new Hono<AppEnv>()

attachmentRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const attachment = await getMessageAttachment(c.env.DB, id)
  if (!attachment) return c.text('Not found', 404)

  // Verify the user can read the conversation this attachment belongs to
  const [mailboxes] = await Promise.all([getMailboxes(c.env.DB)])
  const conv = await c.env.DB
    .prepare('SELECT c.* FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.id = ?')
    .bind(attachment.message_id)
    .first<{ id: number; mailbox_email: string }>()

  if (!conv) return c.text('Not found', 404)

  const mb = mailboxes.find(m => m.email === conv.mailbox_email)
  if (!canReadMailbox(c.get('permissions'), c.get('isAdmin'), mb?.id ?? -1, mb?.domain_id ?? -1)) {
    return c.text('Forbidden', 403)
  }

  const obj = await c.env.ATTACHMENTS.get(attachment.r2_key)
  if (!obj) return c.text('File not found in storage', 404)

  const encoded = encodeURIComponent(attachment.filename).replace(/'/g, "%27")
  return new Response(obj.body, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Content-Length': String(attachment.size),
      'Cache-Control': 'private, max-age=3600',
    },
  })
})
