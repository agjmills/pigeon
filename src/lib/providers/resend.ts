import type { EmailProvider, EmailDomainProvider, DnsRecord, DnsRecordPurpose, SendEmailOptions } from '../email-provider'

type ResendDnsRecord = {
  record: string
  name: string
  type: string
  value: string
  ttl: string
  priority?: number
  status: string
}

function mapPurpose(record: string): DnsRecordPurpose {
  switch (record.toLowerCase()) {
    case 'dkim': return 'dkim'
    case 'spf': return 'spf'
    case 'dmarc': return 'dmarc'
    case 'return-path': return 'return-path'
    default: return 'other'
  }
}

function mapRecords(records: ResendDnsRecord[]): DnsRecord[] {
  return records.map(r => ({
    purpose: mapPurpose(r.record),
    type: r.type,
    name: r.name,
    value: r.value,
    ttl: r.ttl ? parseInt(r.ttl, 10) || undefined : undefined,
    priority: r.priority,
  }))
}

export type ResendConfig = {
  apiKey: string
}

export function createResendProvider(config: ResendConfig): EmailProvider & EmailDomainProvider {
  const auth = { Authorization: `Bearer ${config.apiKey}` }

  return {
    async setupDomain(domain: string) {
      // Check if already exists
      const listRes = await fetch('https://api.resend.com/domains', { headers: auth })
      if (listRes.ok) {
        const list = await listRes.json<{ data: Array<{ id: string; name: string }> }>()
        const existing = list.data?.find(d => d.name === domain)
        if (existing) {
          const detailRes = await fetch(`https://api.resend.com/domains/${existing.id}`, { headers: auth })
          if (detailRes.ok) {
            const detail = await detailRes.json<{ id: string; records: ResendDnsRecord[] }>()
            return { domainId: detail.id, records: mapRecords(detail.records) }
          }
        }
      }

      const res = await fetch('https://api.resend.com/domains', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: domain }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Resend domain setup failed: ${err}`)
      }

      const data = await res.json<{ id: string; records: ResendDnsRecord[] }>()
      return { domainId: data.id, records: mapRecords(data.records) }
    },

    async verifyDomain(domainId: string) {
      const res = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
        method: 'POST',
        headers: auth,
      })
      if (!res.ok) return false

      const detailRes = await fetch(`https://api.resend.com/domains/${domainId}`, { headers: auth })
      if (!detailRes.ok) return false

      const detail = await detailRes.json<{ status: string }>()
      return detail.status === 'verified'
    },

    async deleteDomain(domainId: string) {
      await fetch(`https://api.resend.com/domains/${domainId}`, {
        method: 'DELETE',
        headers: auth,
      })
    },

    async send(opts: SendEmailOptions) {
      const isReply = !!opts.inReplyTo
      const emailHeaders: Record<string, string> = {}
      if (opts.inReplyTo) emailHeaders['In-Reply-To'] = opts.inReplyTo
      if (opts.references) emailHeaders['References'] = opts.references

      const payload: Record<string, unknown> = {
        from: `${opts.fromName} <${opts.from}>`,
        to: [opts.to],
        subject: isReply ? (opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`) : opts.subject,
        text: opts.text,
        headers: emailHeaders,
      }
      if (opts.html) payload.html = opts.html

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Resend API error ${res.status}: ${err}`)
      }

      const data = await res.json<{ id: string }>()
      return { messageId: `<${data.id}@resend.dev>` }
    },
  }
}
