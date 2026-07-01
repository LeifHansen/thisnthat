# ThisNThat

A multi-tenant marketplace for buying and selling **vintage clothing, shoes,
accessories, sports memorabilia, and collectables**. Think eBay — but simpler,
with fully customizable per-seller storefronts (like Shopify) and
make-an-offer pricing (like Depop). **No auctions.**

## Status

Working today (runs against seed/dev data with **no setup** — Neon, auth,
R2, Stripe, and Gemini all activate when their keys are added):

- **Browse** — marketplace home with a 1990s-inspired hero, category
  filtering, listing pages (Buy / Make-an-Offer), and themed store pages
- **Sell (Seller Hub)** — eBay-style seller portal with its own tabs:
  - **AI-assisted, photo-first listing** — upload a photo and Google
    Gemini scans it to auto-fill title, category, brand, condition, size,
    description, and a suggested price
  - **Store customization** — name, tagline, and brand colors with a live
    banner preview
- **Login (Auth.js)** — Google OAuth for production plus a passwordless
  dev login for local testing; JWT sessions carry the user id and platform
  role; sign-in/out in the header
- **Guest checkout** — buy as a guest while being nudged to create an
  account (pre-checked) and opt into marketing
- **Payments (Stripe Connect)** — seller onboarding (Express accounts),
  destination-charge checkout with the platform fee, success page, and a
  webhook; activates when `STRIPE_SECRET_KEY` is set (demo checkout
  otherwise)
- **Multi-tenant admin** — `super_admin` role + `/admin` dashboard across
  all tenant stores; `admin@thisnthat.com` is auto-provisioned as super
  admin
- Full data model (Drizzle) for users/roles, stores, listings, offers,
  and orders

## Stack

| Concern         | Choice                               |
| --------------- | ------------------------------------ |
| Framework       | Next.js (App Router) + Tailwind CSS  |
| Database        | Neon (serverless Postgres)           |
| ORM             | Drizzle + drizzle-kit                |
| Auth            | Auth.js (NextAuth v5), users in Neon |
| AI assistant    | Google Gemini (vision)               |
| Image storage   | Cloudflare R2                        |
| Payments        | Stripe Connect                       |
| Hosting/secrets | Fly.io (app `thisnthat`)             |

## Local development

```bash
npm install
npm run dev          # http://localhost:3000  (browses seed data)
```

To run against a real database, copy `.env.example` to `.env.local`, set
`DATABASE_URL` (Neon), then:

```bash
npm run db:generate  # generate SQL migrations from src/db/schema.ts
npm run db:migrate   # apply them to Neon
npm run db:seed      # load the sample stores/listings
```

## Configuration

All secrets are documented in `.env.example`. Locally they live in
`.env.local`; in production they are **Fly.io secrets**. Set them all in one
command (one redeploy) — see `scripts/set-fly-secrets.example.sh` for a
ready-to-fill template:

```bash
fly secrets set \
  DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" \
  AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_URL="https://thisnthat.fly.dev" \
  AUTH_GOOGLE_ID="..." AUTH_GOOGLE_SECRET="..." \
  SUPER_ADMIN_EMAIL="admin@thisnthat.com" \
  GEMINI_API_KEY="..." \
  STRIPE_SECRET_KEY="sk_live_..." STRIPE_WEBHOOK_SECRET="whsec_..." \
  PLATFORM_FEE_BPS="800" \
  R2_ACCOUNT_ID="..." R2_ACCESS_KEY_ID="..." R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="..." R2_PUBLIC_HOST="images.thisnthat.com" \
  --app thisnthat
```

Each service activates only when its keys are present; anything left unset
falls back to the built-in demo/seed behavior.

### Claude Code on the web (sandbox)

A `SessionStart` hook (`.claude/hooks/session-start.sh`) provisions a local
Postgres mirror and enables passwordless dev login each web session, so the
app runs against a real database without external services.

To let the sandbox reach live external services, the environment's egress
policy must allow them. This is configured in the web UI (not a CLI): edit the
environment → **Network access → Custom**, enable **"Also include default list
of common package managers"**, and add the hosts you need (one per line):

```
*.neon.tech                          # Neon Postgres
api.stripe.com                       # Stripe payments
generativelanguage.googleapis.com    # Gemini photo scanning
accounts.google.com                  # Google sign-in
oauth2.googleapis.com                # Google sign-in
www.googleapis.com                   # Google sign-in
openidconnect.googleapis.com         # Google sign-in
*.r2.cloudflarestorage.com           # Cloudflare R2 uploads
```

Production on Fly is unaffected by this — it has open outbound access.

## Deployment

Fly.io builds the included `Dockerfile` (Next.js standalone output):

```bash
fly deploy --app thisnthat
```

## Roadmap

Prioritized. Most feature code is already written and gated on env keys, so
"go live" is largely configuration; the remaining build work is grouped below.

### ✅ P0 — Multi-tenancy (done)

Each seller now gets their **own** store scoped to their account, orders are
attributed to the signed-in buyer (guests still allowed), and shipping details
persist on database orders.

- Store resolved by owner (get-or-create), with a unique slug per seller;
  `/sell/*` requires sign-in
- Orders link to the logged-in buyer when present, else a guest keyed by email
- `shipping_name` / `shipping_address` persisted on DB orders

### P1 — Go live (wire keys that already have code)

- **Neon** — allowlist `*.neon.tech`, run migrations against Neon, point
  `DATABASE_URL` at it
- **Google OAuth** — add `AUTH_GOOGLE_ID/SECRET`; redirect URI
  `https://thisnthat.fly.dev/api/auth/callback/google`
- **Stripe** — add test keys + webhook secret, run a real test purchase, then
  switch to live keys
- **Gemini** — add `GEMINI_API_KEY` for live photo scanning

### P2 — Commerce completeness

- **Offer management** — accept / decline / counter, backed by the existing
  `offers` table (schema present, no UI/actions yet)
- **Buyer dashboard** — orders, offers, and saved items, separate from the
  Seller Hub
- **Order lifecycle** — states beyond `paid` (shipped/fulfilled), plus
  refunds/disputes via Stripe
- **Working search** — the header search box is present but disabled

### P3 — Media & polish

- **Cloudflare R2** image uploads to replace local `/public/uploads`
- **Store theme editor extras** — banner, logo, and layout options

### P4 — Hardening & quality

- **Tests** — none yet; start with unit tests for fee math, AI-response
  normalization, and input validation, then integration tests for checkout,
  auth, and the Stripe webhook
- **Query performance** — push category/store filters into SQL and fix the
  per-listing image fetch (N+1) in `hydrateListing` with a join or batch load
- **Server-action hardening** — rate limiting and stricter input validation
- Keep `ALLOW_DEV_LOGIN` **off** in production (passwordless login is
  sandbox-only)
