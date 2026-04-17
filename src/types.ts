export type Bindings = {
  DB: D1Database
  ATTACHMENTS: R2Bucket
  AI: Ai
  OIDC_ISSUER: string
  OIDC_CLIENT_ID: string
  OIDC_CLIENT_SECRET: string
  APP_URL: string
  RESEND_API_KEY: string
  SESSION_SECRET: string
  CF_EMAIL_TOKEN: string
}

export type Variables = {
  user: SessionUser
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}

export type SessionUser = {
  email: string
  name: string
}

export type Domain = {
  id: number
  domain: string
  cf_zone_id: string | null
  cf_catchall_rule_id: string | null
  cf_dns_record_ids: string | null
  resend_domain_id: string | null
  resend_verified: number
  catchall_mailbox_email: string | null
  created_at: number
}

export type Mailbox = {
  id: number
  email: string
  name: string
  sender_name: string | null
  domain_id: number | null
  cf_rule_id: string | null
}

export type Conversation = {
  id: number
  mailbox_email: string
  subject: string
  customer_email: string
  customer_name: string | null
  customer_id: number | null
  status: 'open' | 'closed'
  ai_summary: string | null
  unread: number
  created_at: number
  updated_at: number
  last_message_at: number
  message_count?: number
}

export type Customer = {
  id: number
  email: string
  name: string | null
  notes: string | null
  created_at: number
  updated_at: number
}

export type Organization = {
  id: number
  name: string
  domain: string | null
  notes: string | null
  created_at: number
  updated_at: number
}

export type Tag = {
  id: number
  name: string
  color: string
  created_at: number
}

export type Message = {
  id: number
  conversation_id: number
  direction: 'inbound' | 'outbound' | 'note'
  from_email: string
  from_name: string | null
  to_email: string
  subject: string
  body_text: string | null
  body_html: string | null
  message_id: string | null
  in_reply_to: string | null
  created_at: number
}
