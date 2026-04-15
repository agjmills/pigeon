export async function sendReply(opts: {
  apiKey: string
  from: string
  fromName: string
  to: string
  subject: string
  text: string
  inReplyTo?: string | null
  references?: string | null
}): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  }

  const payload: Record<string, unknown> = {
    from: `${opts.fromName} <${opts.from}>`,
    to: [opts.to],
    subject: opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`,
    text: opts.text,
    headers: {} as Record<string, string>,
  }

  if (opts.inReplyTo) {
    (payload.headers as Record<string, string>)['In-Reply-To'] = opts.inReplyTo
  }
  if (opts.references) {
    (payload.headers as Record<string, string>)['References'] = opts.references
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error ${res.status}: ${err}`)
  }

  const data = await res.json<{ id: string }>()
  return { messageId: `<${data.id}@resend.dev>` }
}
