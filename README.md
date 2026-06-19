# ThisNThat

A multi-tenant marketplace for buying and selling **vintage clothing, shoes,
accessories, sports memorabilia, and collectables**. Think eBay — but simpler,
with fully customizable per-seller storefronts (like Shopify) and
make-an-offer pricing (like Depop). **No auctions.**

## Status

Milestone 1 — **Foundations + browse** — is in place:

- Marketplace homepage with category filtering
- Listing detail pages with a Buy / Make-an-Offer panel
- Per-seller store pages with their own theme/branding
- Full data model (Drizzle schema) for stores, listings, offers, and orders

The app runs against **seed data** out of the box, so you can browse the whole
experience locally before any infrastructure is connected.

## Stack

| Concern         | Choice                               |
| --------------- | ------------------------------------ |
| Framework       | Next.js (App Router) + Tailwind CSS  |
| Database        | Neon (serverless Postgres)           |
| ORM             | Drizzle + drizzle-kit                |
| Auth            | Auth.js (NextAuth v5), users in Neon |
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

- Seller dashboard + listing uploader (priority: effortless uploading)
- Offer management (accept / decline / counter)
- Stripe Connect checkout + seller payouts + platform fee
- Cloudflare R2 image uploads
- Store theme editor (colors, banner, logo, layout)
