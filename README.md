# Beanie Xchange

A retro-90s, StockX-style marketplace prototype for Beanie Babies. Every item is
**True Blue verified**, **COA-backed**, or **Express Authenticated ($10)** before
it reaches the buyer. Payments are held in **escrow** until authenticity is
confirmed.

## Stack

- Next.js 16 (App Router) + TypeScript
- iOS app (Expo / React Native) in [`mobile/`](mobile/README.md) — a thin
  native client over this app's API
- Tailwind CSS v4 (custom retro theme)
- Prisma + Neon Postgres
- Auth.js v5 (credentials)
- Stripe (PaymentIntents w/ manual-capture escrow + Connect payouts)
- Cloudflare R2 (image upload)
- Deploy: Fly.io (`fly.toml`), behind Cloudflare

## Authentication & fulfillment model

| Listing type      | Path          | Verification             | BX auth fee                  |
| ----------------- | ------------- | ------------------------ | ---------------------------- |
| `TRUE_BLUE`       | Direct s→b    | None (trusted)           | —                            |
| `UNAUTHENTICATED` | Direct s→b    | None (sold as-is, no COA)| —                            |
| `COA`             | Via HQ s→HQ→b | Third-party COA check    | —                            |
| `BX_EXPRESS`      | Via HQ s→HQ→b | Authenticate + COA       | $9.99 flat                   |
| `BX_COMPLETE`     | Via HQ s→HQ→b | Auth + grade + COA + box | $19.99/$14.00/$9.00 by grade |

`UNAUTHENTICATED` items are sold as-is with no COA, prominently flagged, and
buyers can hide them via a Browse filter. `BX_EXPRESS` is roughly half the
`BX_COMPLETE` headline price; the Complete top tier is authorized at checkout
and the true grade-tier amount captured when HQ grades the item.

Order lifecycle (HQ paths): `PENDING_PAYMENT → PAID_ESCROW → (ship) → AT_HQ →
VERIFIED → SHIPPED_TO_BUYER → COMPLETED` (or `FAILED_AUTH` → buyer refunded).
Direct paths (True Blue, Unauthenticated) skip HQ: `… →
AWAITING_SHIP_TO_BUYER → SHIPPED_TO_BUYER →` buyer confirms receipt →
`COMPLETED`.

The single source of truth for fees/paths is `src/lib/fees.ts`.

## Local setup

```bash
cp .env.example .env        # fill in Neon, Stripe, AUTH_SECRET
npm install
npm run db:push             # create schema in Neon
npm run db:seed             # demo users + listings
npm run dev
```

Demo logins (password `password123`): `admin@beaniex.com` (ADMIN),
`seller@beaniex.com`, `buyer@beaniex.com`.

### Stripe locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# put the printed whsec_... in STRIPE_WEBHOOK_SECRET
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

## Deploy (Fly.io)

Pushing to `main` deploys: `.github/workflows/fly-deploy.yml` runs
`flyctl deploy`. Migrations are applied by the release command, and again by
`docker-entrypoint.js` as a backstop for a failed release step.

### Nothing may sit in front of the port

`min_machines_running` pins only the primary region, so every other region
autostops to zero and cold-starts on the next request. Fly's proxy waits about
8.4s for `:8080` and then answers the visitor with *"instance refused
connection. is your app listening on 0.0.0.0:8080?"* — the whole cold start has
to fit in that budget, and the machine itself takes ~1.2s of it.

So the container execs the `next` binary directly rather than `npm run start`,
and the entrypoint's migration backstop does not run until the port is already
accepting connections. Anything added to the boot path has to hold that line;
the read-only `prod-diagnostics` workflow prints the boot logs (`machine
became reachable in …`) to check it.

Everything except the `NEXT_PUBLIC_*` build args is a runtime secret
(`fly secrets set …`), so keys can be rotated without a rebuild — including
the Stripe publishable key, which is read per request in
`src/lib/stripePublic.ts` and passed to the checkout components as a prop.
That is why it is spelled `STRIPE_PUBLISHABLE_KEY` and **not**
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Next inlines every `NEXT_PUBLIC_*`
reference at build time, so a prefixed name would freeze whatever value CI
happened to have into the image. Every release prints a verdict from
`scripts/check-stripe-key.mjs` into the deploy log; `/api/health` reports the
same thing at runtime (admin-only detail).

Stripe setup:

1. Add a webhook endpoint for `payment_intent.amount_capturable_updated`,
   `payment_intent.succeeded` and `payment_intent.canceled`. (The handler
   deliberately ignores `payment_intent.payment_failed` — it fires on
   recoverable declines while the intent is still usable.) Copy the signing
   secret to `STRIPE_WEBHOOK_SECRET`.
2. Enable **Connect** (Express) — sellers only need the `transfers`
   capability; see `src/app/api/stripe/connect/route.ts`.

### The edge has to let Stripe through

`beaniexchange.com` sits behind Cloudflare, which currently answers
server-to-server callers with a `403` managed challenge — including Stripe's
`POST /api/stripe/webhook`. The origin itself is fine: the same request to
`beanie-xchange.fly.dev` returns the expected `400 Missing stripe-signature
header`. Verify with the read-only `prod-diagnostics` workflow, whose
endpoint-probe step posts to both hostnames and prints the status of each.

Until a WAF skip rule exists for `/api/*/webhook`, no `payment_intent` event
ever reaches the app. Nothing fails loudly when that happens — the money is
authorized at Stripe either way — so the read paths reconcile against Stripe
directly and are what keep the site correct meanwhile:

- `sweepAbandonedReservations()` (`src/lib/listings.ts`), called from `/`,
  `/browse` and `/api/checkout`, releases genuinely abandoned reservations and
  advances every pending order Stripe says is authorized, sending the buyer
  receipt and seller "you sold an item" emails the webhook would have sent.
- `advancePaidAuthBatch()` / `reconcileStuckAuthRequests()`
  (`src/lib/authPayment.ts`), called from the submission page, the dashboard
  and the admin queue, advance paid authentication batches and buy the prepaid
  inbound label the submitter was billed for. The submission page
  (`/authenticate/[id]`) waits for that purchase before rendering, so the
  first thing a submitter sees after paying is their label, and it retries a
  missing label on later views (`ensureInboundLabel` in
  `src/lib/authLabels.ts` is claim-guarded, so no path ever buys postage
  twice).

These are backstops, not a substitute: they only run when someone loads a
page, so escrow release and shipping notices still lag until the webhook is
reachable. Fix the edge.
