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
`.env.local`; in production they are **Fly.io secrets**:

```bash
fly secrets set DATABASE_URL=... AUTH_SECRET=... --app thisnthat
```

## Deployment

Fly.io builds the included `Dockerfile` (Next.js standalone output):

```bash
fly deploy --app thisnthat
```

## Roadmap

- Connect Neon + Auth.js so real users can sign in (multi-tenant login)
- Add live Stripe keys + webhook to flip Stripe Connect from code to live
- Cloudflare R2 uploads (replace local dev image storage)
- Wire the Gemini key for live photo scanning
- Offer management (accept / decline / counter) backed by the offers table
- Buyer dashboard (orders, offers, saved items) separate from the Seller Hub
- Store theme editor extras (banner, logo, layout)
