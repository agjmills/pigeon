export type Bindings = {
  DB: D1Database
  ATTACHMENTS: R2Bucket
  AI: Ai
  OIDC_ISSUER: string
  OIDC_CLIENT_ID: string
  OIDC_CLIENT_SECRET: string
  APP_URL: string
  EMAIL_PROVIDER: string
  EMAIL_PROVIDER_CONFIG: string
  SESSION_SECRET: string
  CF_EMAIL_TOKEN: string
  UNSUBSCRIBE_SECRET?: string
  RATE_LIMITER?: RateLimit
}

export type PermissionGrant = {
  resource_type: ResourceType
  resource_id: number
  level: PermissionLevel
}

export type Variables = {
  user: SessionUser
  isAdmin: boolean
  permissions: PermissionGrant[]
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}

export type SessionUser = {
  email: string
  name: string
  isAdmin: boolean
}

export type Domain = {
  id: number
  domain: string
  cf_zone_id: string | null
  cf_catchall_rule_id: string | null
  cf_dns_record_ids: string | null
  provider_domain_id: string | null
  provider_verified: number
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
  opted_out_at: number | null
  bounced_at: number | null
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

export type PermissionLevel = 'read' | 'edit'
export type ResourceType = 'domain' | 'mailbox' | 'contacts'

export type User = {
  email: string
  name: string | null
  is_admin: number
  created_at: number
}

export type UserPermission = {
  id: number
  user_email: string
  resource_type: ResourceType
  resource_id: number
  level: PermissionLevel
  created_at: number
}

export type AuditAction = 'reply_sent' | 'compose_sent' | 'note_added'

export type AuditEntry = {
  id: number
  user_email: string
  user_name: string | null
  action: AuditAction
  conversation_id: number | null
  mailbox_email: string | null
  metadata: string | null
  created_at: number
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
  tracking_token: string | null
  opened_at: number | null
  created_at: number
}

export type MessageAttachment = {
  id: number
  message_id: number
  filename: string
  mime_type: string
  size: number
  r2_key: string
  created_at: number
}

export type MailboxWebhook = {
  id: number
  mailbox_email: string
  url: string
  secret: string
  created_at: number
}

export type RateLimit = {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export type ApiToken = {
  id: number
  token_hash: string
  name: string
  user_email: string
  scoped: number
  created_at: number
  last_used_at: number | null
}

export type ApiTokenPermission = {
  id: number
  token_id: number
  resource_type: ResourceType
  resource_id: number
  level: PermissionLevel
}
