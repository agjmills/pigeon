export type Bindings = {
  DB: D1Database
  ATTACHMENTS: R2Bucket
  AUTHENTIK_URL: string
  AUTHENTIK_CLIENT_ID: string
  AUTHENTIK_CLIENT_SECRET: string
  APP_URL: string
  RESEND_API_KEY: string
  PIPE_SECRET: string
  SESSION_SECRET: string
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

export type Mailbox = {
  id: number
  email: string
  name: string
}

export type Conversation = {
  id: number
  mailbox_email: string
  subject: string
  customer_email: string
  customer_name: string | null
  status: 'open' | 'closed'
  created_at: number
  updated_at: number
  last_message_at: number
  message_count?: number
}

export type Message = {
  id: number
  conversation_id: number
  direction: 'inbound' | 'outbound'
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
