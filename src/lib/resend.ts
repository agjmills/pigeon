type ResendDnsRecord = {
  record: string
  name: string
  type: string
  value: string
  ttl: string
  priority?: number
  status: string
}

export async function setupResendDomain(apiKey: string, domain: string): Promise<{
  id: string
  records: ResendDnsRecord[]
}> {
  // Check if already exists
  const listRes = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (listRes.ok) {
    const list = await listRes.json<{ data: Array<{ id: string; name: string }> }>()
    const existing = list.data?.find(d => d.name === domain)
    if (existing) {
      // Fetch full details to get records
      const detailRes = await fetch(`https://api.resend.com/domains/${existing.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (detailRes.ok) {
        const detail = await detailRes.json<{ id: string; records: ResendDnsRecord[] }>()
        return { id: detail.id, records: detail.records }
      }
    }
  }

  const res = await fetch('https://api.resend.com/domains', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: domain }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend domain setup failed: ${err}`)
  }

  const data = await res.json<{ id: string; records: ResendDnsRecord[] }>()
  return { id: data.id, records: data.records }
}

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
