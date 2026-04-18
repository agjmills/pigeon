import type { Bindings } from '../types'
import { createResendProvider } from './providers/resend'

// ── DNS Records ──────────────────────────────────────────────────────────────

export type DnsRecordPurpose = 'dkim' | 'spf' | 'dmarc' | 'return-path' | 'other'

export type DnsRecord = {
  purpose: DnsRecordPurpose
  type: string   // "TXT", "CNAME", "MX"
  name: string
  value: string
  ttl?: number
  priority?: number
}

// ── Domain Management ────────────────────────────────────────────────────────

export interface EmailDomainProvider {
  setupDomain(domain: string): Promise<{ domainId: string; records: DnsRecord[] }>
  verifyDomain(domainId: string): Promise<boolean>
  deleteDomain(domainId: string): Promise<void>
}

// ── Email Sending ────────────────────────────────────────────────────────────

export type EmailAttachment = {
  filename: string
  content: Uint8Array
  contentType: string
}

export type SendEmailOptions = {
  from: string
  fromName: string
  to: string
  subject: string
  text: string
  html?: string | null
  inReplyTo?: string | null
  references?: string | null
  attachments?: EmailAttachment[]
}

export interface EmailSender {
  send(opts: SendEmailOptions): Promise<{ messageId: string }>
}

// ── Combined provider ────────────────────────────────────────────────────────

export type EmailProvider = EmailSender & Partial<EmailDomainProvider>

export function supportsDomainManagement(
  provider: EmailProvider
): provider is EmailSender & EmailDomainProvider {
  return 'setupDomain' in provider && 'verifyDomain' in provider && 'deleteDomain' in provider
}

// ── Test provider (no-op, for tests only) ───────────────────────────────────

function createTestProvider(): EmailProvider {
  return {
    send: async () => ({ messageId: `<test-${crypto.randomUUID()}@test.local>` }),
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createEmailProvider(env: Bindings): EmailProvider {
  const name = env.EMAIL_PROVIDER ?? 'resend'
  const config = JSON.parse(env.EMAIL_PROVIDER_CONFIG ?? '{}')

  switch (name) {
    case 'resend':
      if (!config.apiKey) throw new Error('EMAIL_PROVIDER_CONFIG missing "apiKey" for Resend')
      return createResendProvider(config)
    case 'test':
      return createTestProvider()
    default:
      throw new Error(`Unknown email provider: ${name}`)
  }
}
