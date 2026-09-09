# This'n'that

**Sell what you have. Find what you need.**

This'n'that is a general resale marketplace. Anyone can open an account, list
what they have — apparel, shoes, accessories, collectibles, trading cards, art,
home decor, pottery and glass, electronics, books and media, toys and games, or
anything else — and sell it to the public. Buyers can buy at the listed price
or make an offer; sellers ship direct.

**How the money moves.** The buyer's card is authorized at checkout for the
item price plus shipping. Nothing is captured until the item is delivered —
when the buyer confirms receipt, or when the carrier reports delivery. At that
moment the payment is captured, the seller's proceeds are transferred to their
connected Stripe account, and the platform keeps a 10% fee of the item price
(`PLATFORM_FEE_PCT` in `src/lib/fees.ts`) plus the shipping it collected.
Listing is free. There is no inspection, grading, or verification service:
sellers are responsible for accurate descriptions, and buyers have a 3-day
return window for items not as described (`/returns`).

## Stack

- Next.js 16 (App Router) + TypeScript + React 19
- Tailwind CSS v4 (`tnt-*` component classes in `src/app/globals.css`)
- Prisma + Postgres (Neon in production)
- Auth.js v5 (credentials)
- Stripe — PaymentIntents with manual capture, Connect Express payouts
- EasyPost — live shipping rates, label purchase, delivery tracking webhook
- SendGrid — transactional email
- Cloudflare R2 — photo uploads (S3-compatible)
- OpenAI (optional) — listing assistant and the admin blog generator
- iOS app (Expo / React Native) in [`mobile/`](mobile/README.md), a thin
  native client over this app's API
- Deploy: Fly.io (`fly.toml`)

## Domain model

- **Category** rows are seeded from `src/lib/categories.ts`, which is the
  source of truth for the category list and each category's attribute schema
  (size, era, grade, working state, …). Nothing should branch on a category
  slug; add a field there and the sell form, listing page and browse facets
  all pick it up.
- **Listing** — one item (or a **lot** of several, with `lotItems`) with a
  condition from the shared `Condition` enum (`src/lib/listingOptions.ts`),
  a price, photos (`PLACEHOLDER_PHOTO` until the seller uploads one), and
  per-category `attributes` validated against the schema on write.
- **Offer** — a buyer's bid; sellers accept or reject, or set a
  `minAutoAcceptCents` floor on the listing.
- **Order** — lifecycle `PENDING_PAYMENT → AWAITING_SHIP_TO_BUYER →
  SHIPPED_TO_BUYER → COMPLETED` (or `CANCELLED` / `REFUNDED`). Capture and
  the seller transfer happen together in `captureAndPay()`
  (`src/lib/payout.ts`) on buyer confirmation or the EasyPost delivery event.
- **Conversation / Message** — 1:1 DMs between members; **ProductReview** —
  a verified-buyer review per completed order; **ListingLike** / **Follow**.
- **BlogPost** — the editorial blog (`/blog`), written by admins by hand or
  with the AI generator at `/admin/blog`.

## Local setup

```bash
cp .env.example .env.local   # fill in DATABASE_URL/DIRECT_URL, AUTH_SECRET, Stripe test keys
npm install                  # postinstall runs prisma generate
npm run db:deploy            # apply committed migrations (prisma migrate deploy)
npm run db:seed              # categories + demo accounts + demo listings (dev only)
npm run dev
```

No Postgres to hand? `npm run db:dev:setup` starts a local cluster, writes
`.env.local`, applies migrations and seeds it.

Demo logins (password `password123` outside production, or
`SEED_DEMO_PASSWORD` if set):

| Account                 | Role  | Notes                                            |
| ----------------------- | ----- | ------------------------------------------------ |
| `admin@thisnthat.com`   | ADMIN | Superadmin (`SUPERADMIN_EMAIL`); two listings    |
| `seller@thisnthat.com`  | USER  | Owns the demo listings; ship-from ZIP set        |
| `buyer@thisnthat.com`   | USER  | Empty account for checkout / offer flows         |

`npm run db:seed` is idempotent and safe to re-run: it upserts the categories,
the demo accounts and (when `NODE_ENV !== "production"`) 17 demo listings with
stable ids, and resets any orders, offers, messages, likes and follows the
demo accounts were party to. It never touches other users' data. To remove
the demo accounts entirely, use `npx tsx scripts/purge-dummy-users.ts`
(dry run) then `--yes`.

Other scripts: `npm run typecheck`, `npm run lint`,
`npx tsx scripts/set-admin.ts <email>` (grant ADMIN),
`STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/check-stripe.ts` (verifies the
authorize/capture flow against a test key).

### Stripe

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# put the printed whsec_... in STRIPE_WEBHOOK_SECRET
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

1. Add a webhook endpoint for `payment_intent.amount_capturable_updated`,
   `payment_intent.succeeded`, `payment_intent.canceled` and
   `charge.dispute.created`. (The handler deliberately ignores
   `payment_intent.payment_failed` — it fires on recoverable declines while
   the intent is still usable.) Copy the signing secret to
   `STRIPE_WEBHOOK_SECRET`.
2. Enable **Connect** (Express). Sellers onboard from their dashboard
   (`/api/stripe/connect`); proceeds are sent with a Transfer at capture time.
3. `STRIPE_PUBLISHABLE_KEY` is read per request (`src/lib/stripePublic.ts`)
   — deliberately *not* `NEXT_PUBLIC_`-prefixed, so it can be set or rotated
   with `fly secrets set` without a rebuild. Every release prints a verdict
   from `scripts/check-stripe-key.mjs`, and `/api/health` reports the same.

### EasyPost

Set `EASYPOST_API_KEY` to rate seller → buyer shipping at checkout from the
seller's `shipFromPostalCode` and let sellers buy labels; without it shipping
falls back to a flat rate (`SHIPPING_LEG_CENTS`) and sellers enter tracking by
hand. Add a webhook pointing at `/api/easypost/webhook` and put its HMAC
secret in `EASYPOST_WEBHOOK_SECRET`; delivery scans then capture payment and
pay the seller without waiting for the buyer's confirmation.

### SendGrid

Set `SENDGRID_API_KEY` and a `SENDGRID_FROM` on a domain you have
verified (SPF/DKIM). Unset, every send is a logged no-op. Recipients
get one-click unsubscribe links per category (orders, offers, messages,
social, tips).

### Cloudflare R2

Create a bucket (default name `thisnthat-uploads`), an API token with object
read/write, and either enable the public `r2.dev` URL or attach a custom
domain; put the values in `R2_*` and `R2_PUBLIC_URL`. Until R2 is configured,
uploads are disabled and listings show the placeholder image.

### Optional

- `OPENAI_API_KEY` — the sell page's auto-fill-from-photos / description
  writer and the admin blog generator (plus `OPENAI_IMAGE_MODEL` for hero
  images).
- `RAPIDAPI_KEY` — eBay sold comps for the price suggestion.
- `REMOVE_BG_API_KEY` or `BG_REMOVAL_ENDPOINT` — studio photo optimizer.
- `NEXT_PUBLIC_GA_ID` — Google Analytics 4 (build-time).

## Deploy (Fly.io)

The app is `thisnthat` (`fly.toml`); its public URL is
`https://thisnthat.fly.dev` until a domain is attached (then update
`NEXT_PUBLIC_APP_URL` in `fly.toml` and set `SITE_URL`). Pushing to `main`
deploys via `.github/workflows/fly-deploy.yml`, which passes the GA ID as a
build arg. The release command (`scripts/release.sh`) runs
`prisma migrate deploy` and the seed — both non-fatal — and
`docker-entrypoint.js` re-runs the migration as a backstop once the server
holds the port.

Set every secret with `fly secrets set`: `DATABASE_URL`, `DIRECT_URL`,
`AUTH_SECRET`, `STRIPE_*`, `EASYPOST_*`, `SENDGRID_*`, `R2_*`,
`SUPERADMIN_EMAIL`, `SITE_URL`, `SUPPORT_EMAIL` and the optional keys above.

### Nothing may sit in front of the port

`min_machines_running` pins only the primary region, so every other region
autostops to zero and cold-starts on the next request. Fly's proxy waits about
8.4s for `:8080` and then answers the visitor with *"instance refused
connection. is your app listening on 0.0.0.0:8080?"* — the whole cold start has
to fit in that budget, and the machine itself takes ~1.2s of it.

So the container execs the `next` binary directly rather than `npm run start`,
and the entrypoint's migration backstop does not run until the port is already
accepting connections. Anything added to the boot path has to hold that line;
the read-only `prod-diagnostics` workflow (manual trigger) prints the boot
logs, probes the public endpoints, and runs Lighthouse against the origin.

### If a CDN/WAF is ever put in front of the origin

Stripe and EasyPost call `POST /api/stripe/webhook` and
`POST /api/easypost/webhook` server-to-server. A managed challenge on those
paths silently blocks every webhook — the money is authorized at Stripe
either way, so nothing fails loudly, but capture and payouts stall until the
buyer clicks "confirm receipt". Add a skip rule for `/api/*/webhook` and
verify with the diagnostics workflow's endpoint-probe step (expect
`400 Missing stripe-signature header`, not `403`).

## CI

- `ci.yml` — typecheck, lint and build the web app; typecheck, lint and
  bundle the Expo app. Runs on every PR and on pushes to `main`.
- `db-migrations.yml` — replays the committed migrations into a throwaway
  Postgres and fails if `prisma/schema.prisma` has drifted (run
  `npx prisma migrate dev` and commit the result).
- `fly-deploy.yml` — deploy on push to `main` or by hand.
- `prod-diagnostics.yml` — manual, read-only production introspection.

## History

Forked from beanie-xchange, a single-category collectibles marketplace, and
generalized into a multi-category resale platform: the category tree and
attribute schemas, the direct seller → buyer fulfilment model, and the
capture-on-delivery payout replaced its authenticity-check and grading
pipeline.
