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

`fly.toml` describes the app (`thisnthat`), `Dockerfile` builds it, and
`scripts/release.sh` runs the Prisma migrations + the idempotent seed on every
release. `scripts/fly-setup.sh` does the first-time provisioning in one go.

### First deploy

1. Install flyctl and sign in: https://fly.io/docs/flyctl/install/ then `fly auth login`.
2. Copy `.env.example` to `.env.fly` (gitignored) and fill in the **live**
   values: Stripe secret + publishable keys, SendGrid, R2, `SITE_URL`,
   `SUPERADMIN_EMAIL`. Leave `STRIPE_WEBHOOK_SECRET` for step 4.
3. From the repo root:

   ```bash
   bash scripts/fly-setup.sh          # or: APP=my-app REGION=lhr bash scripts/fly-setup.sh
   ```

   It creates the app, a Fly Postgres cluster (`thisnthat-db`, attached as
   `DATABASE_URL`), a random `AUTH_SECRET`, every secret from `.env.fly`, then
   deploys. Re-running is safe. Bring your own Postgres instead by setting
   `DATABASE_URL` (and `DIRECT_URL`) in `.env.fly` before the first run.
4. Stripe → Developers → Webhooks: add
   `https://<app>.fly.dev/api/stripe/webhook` for
   `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`,
   `payment_intent.canceled`, `charge.dispute.created`, then
   `fly secrets set STRIPE_WEBHOOK_SECRET=whsec_…`. Enable **Connect**
   (Express) — sellers only need the `transfers` capability.
5. EasyPost → Webhooks: `https://<app>.fly.dev/api/easypost/webhook`, then
   `fly secrets set EASYPOST_WEBHOOK_SECRET=…`.
6. Sign in as `SUPERADMIN_EMAIL` and open `/api/health` — it lists anything
   still missing or in test mode.

### Custom domain

```bash
fly certs add yourdomain.com
fly secrets set SITE_URL=https://yourdomain.com SENDGRID_FROM=notifications@yourdomain.com
```

and change `NEXT_PUBLIC_APP_URL` in `fly.toml` `[build.args]` (it is inlined at
build time), then redeploy.

### Deploys from GitHub

`.github/workflows/fly-deploy.yml` deploys on every push to `main` (and, until
the default branch is renamed, `claude/gallant-hopper-kzsuj4`), or manually
from the Actions tab. It needs two repository secrets:

- `FLY_API_TOKEN` — `fly tokens create deploy -x 999999h`
- `NEXT_PUBLIC_GA_ID` — optional GA4 measurement id (build arg)

Everything except the `NEXT_PUBLIC_*` build args is a runtime secret
(`fly secrets set …`), so keys can be rotated without a rebuild — including
the Stripe publishable key, which is read per request in
`src/lib/stripePublic.ts`. `/api/live` is the liveness check Fly uses; it
never depends on configuration.

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
