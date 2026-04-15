# Courier

Self-hosted multi-domain email inbox built on Cloudflare Workers, D1, R2, and HTMX. Receive email via Cloudflare Email Routing, manage conversations in a clean web UI, reply via Resend.

## Stack

- **Runtime**: Cloudflare Workers (TypeScript + Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Attachments**: Cloudflare R2
- **Frontend**: HTMX + Tailwind CDN (no build step)
- **Auth**: OIDC (tested with Authentik)
- **Outbound email**: Resend

## Setup

### 1. Configure wrangler

```bash
cp wrangler.toml wrangler.local.toml
```

Edit `wrangler.local.toml` with your values:
- `AUTHENTIK_URL` — your OIDC provider base URL
- `AUTHENTIK_CLIENT_ID` — OAuth2 client ID
- `APP_URL` — where Courier is deployed

### 2. Create Cloudflare resources

```bash
npm install
npm run db:create           # creates D1 database, copy the ID into wrangler.local.toml
wrangler r2 bucket create courier-attachments
```

### 3. Run migrations

```bash
npm run db:migrate:local    # local dev
npm run db:migrate:remote   # production
```

### 4. Set secrets

```bash
wrangler secret put AUTHENTIK_CLIENT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put SESSION_SECRET   # openssl rand -hex 32
```

### 5. OIDC provider setup

Create an OAuth2/OIDC application in your provider:
- **Redirect URI**: `https://<APP_URL>/auth/callback`
- **Grant type**: Authorization Code + PKCE
- **Scopes**: `openid profile email`

### 6. Deploy

```bash
npm run deploy
```

### 7. Add mailboxes

Once logged in, use **+ Add mailbox** in the sidebar to register each email address (e.g. `support@example.com`).

### 8. Cloudflare Email Routing

For each domain, add routing rules in the Cloudflare dashboard:
- **Email Routing → Rules** → address or catch-all → **Send to Worker** → `courier`

### Sending replies

Replies are sent via [Resend](https://resend.com). Add and verify each sending domain in the Resend dashboard and add the provided DKIM/SPF records in Cloudflare DNS.

## Development

```bash
npm run dev
```

Uses Wrangler's local D1/R2 emulation. Set local secrets in `.dev.vars`:

```ini
AUTHENTIK_CLIENT_SECRET=...
RESEND_API_KEY=...
SESSION_SECRET=...
```
