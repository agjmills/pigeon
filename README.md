# Pigeon

A lightweight, self-hosted conversational CRM for people who run multiple small projects and don't want to choose between a throwaway inbox per domain and a full-blown CRM they'll never fully understand. Manage customers, conversations, and organizations across all your domains in one place.

Built on Cloudflare Workers, D1, R2, and HTMX. **Everything runs on the Cloudflare free tier.** Outbound sending uses a pluggable provider — [Resend](https://resend.com) ships out of the box (free up to 3,000/month), with an interface ready for SES, Postmark, SMTP, or anything else.

> **Domain email control**: Cloudflare Email Routing — especially when using catch-all rules — routes *all* inbound email for your domain through Pigeon. This gives the Worker (and anyone with access to your Cloudflare account or deployment) full visibility into every message received at that domain. Only deploy Pigeon on domains where you intend it to be the sole email handler, and treat your Cloudflare credentials accordingly.

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
- An email sending provider ([Resend](https://resend.com), SES, Postmark, SMTP, etc.)
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
EMAIL_PROVIDER = "resend"                      # see "Email providers" section

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
npx wrangler secret put OIDC_CLIENT_SECRET      # from your OIDC provider
npx wrangler secret put EMAIL_PROVIDER_CONFIG    # JSON — see "Email providers" below
npx wrangler secret put SESSION_SECRET           # openssl rand -hex 32
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

### 9. Add mailboxes

Log in and use **+ Add mailbox** in the sidebar to register each address (e.g. `support@yourdomain.com`). Pigeon will route inbound email to the matching mailbox.

## Email providers

Pigeon uses a pluggable provider interface for outbound email. Set `EMAIL_PROVIDER` (defaults to `resend`) and `EMAIL_PROVIDER_CONFIG` (a JSON string with provider-specific credentials).

Providers that support domain management will automatically set up DKIM/SPF DNS records in Cloudflare and verify them when you add a mailbox.

### Resend (default)

```toml
# wrangler.local.toml
[vars]
EMAIL_PROVIDER = "resend"
```

```bash
npx wrangler secret put EMAIL_PROVIDER_CONFIG
# paste: {"apiKey":"re_..."}
```

### Adding a new provider

Create a file in `src/lib/providers/` that implements `EmailSender` (required) and optionally `EmailDomainProvider` (for providers that manage domains and DNS records). Add a case to the factory switch in `src/lib/email-provider.ts`. See `src/lib/providers/resend.ts` for a reference implementation.

## Open tracking

Pigeon injects a 1×1 tracking pixel into outgoing HTML emails. When the recipient's mail client loads it, Pigeon records the first open time and displays an **Opened** badge in the conversation thread. No extra configuration is required — the pixel endpoint (`/t/:token`) is public and runs alongside the main Worker.

Note that open tracking is inherently imprecise: Apple Mail Privacy Protection, Gmail image caching, and many corporate proxies load images automatically, which can produce false positives. Use it as a rough signal rather than a definitive read receipt.

## Local development

```bash
npm run db:migrate:local
npm run dev
```

Set secrets locally in `.dev.vars` (gitignored):

```ini
OIDC_CLIENT_SECRET=...
EMAIL_PROVIDER_CONFIG={"apiKey":"re_..."}
SESSION_SECRET=...
```
