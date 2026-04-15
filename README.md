# Pigeon

Self-hosted multi-domain email inbox built on Cloudflare Workers, D1, R2, and HTMX. Receive email via Cloudflare Email Routing, manage conversations in a clean web UI, reply via Resend.

**Everything runs on the Cloudflare free tier** (Workers, D1, R2). Outbound replies use [Resend](https://resend.com) (free up to 3,000/month).

## How it works

```
support@yourdomain.com
        │
        ▼
Cloudflare Email Routing
        │
        ▼
  Pigeon Worker  ──── stores in D1 + R2
        │
        ▼
  pigeon.yourdomain.com  (protected by OIDC)
```

## Prerequisites

- Cloudflare account (free)
- [Resend](https://resend.com) account (free)
- An OIDC provider (Authentik, Auth0, Keycloak, etc.)
- Node.js + [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

## Deploy

### 1. Clone and install

```bash
git clone https://github.com/agjmills/pigeon
cd pigeon
npm install
```

### 2. Create Cloudflare resources

```bash
npx wrangler d1 create pigeon           # note the database_id in the output
npx wrangler r2 bucket create pigeon-attachments
```

### 3. Configure

```bash
cp wrangler.toml wrangler.local.toml
```

Edit `wrangler.local.toml`:

```toml
[vars]
OIDC_ISSUER = "https://auth.example.com/..."   # must expose /.well-known/openid-configuration
OIDC_CLIENT_ID = "pigeon"                      # OAuth2 client ID from your provider
APP_URL = "https://pigeon.example.com"         # where you'll deploy this

[[d1_databases]]
binding = "DB"
database_name = "pigeon"
database_id = "<id from step 2>"

[[r2_buckets]]
binding = "ATTACHMENTS"
bucket_name = "pigeon-attachments"
```

### 4. Set secrets

```bash
npx wrangler secret put OIDC_CLIENT_SECRET   # from your OIDC provider
npx wrangler secret put RESEND_API_KEY       # from resend.com
npx wrangler secret put SESSION_SECRET       # openssl rand -hex 32
```

### 5. Run database migrations

```bash
npm run db:migrate:remote
```

### 6. Deploy

```bash
npm run deploy
```

### 7. OIDC provider

Create an OAuth2 application in your provider with:
- **Redirect URI**: `https://<APP_URL>/auth/callback`
- **Grant type**: Authorization Code + PKCE
- **Scopes**: `openid profile email`

### 8. Cloudflare Email Routing

For each domain you want to receive at (Cloudflare dashboard → your domain → Email → Email Routing):
1. Enable Email Routing and accept the MX records
2. Add a rule: address `support@yourdomain.com` → **Send to Worker** → `pigeon`
3. Or use a catch-all rule to send everything to Pigeon

### 9. Sending domains (Resend)

In the Resend dashboard, add each domain you want to send replies from and add the provided DKIM/SPF DNS records in Cloudflare.

### 10. Add mailboxes

Log in and use **+ Add mailbox** in the sidebar to register each address (e.g. `support@yourdomain.com`). Pigeon will route inbound email to the matching mailbox.

## Local development

```bash
npm run db:migrate:local
npm run dev
```

Set secrets locally in `.dev.vars` (gitignored):

```ini
AUTHENTIK_CLIENT_SECRET=...
RESEND_API_KEY=...
SESSION_SECRET=...
```
