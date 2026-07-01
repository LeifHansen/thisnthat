# Go-live runbook

How to take each integration from "code-complete, gated" to live. Every
service falls back to demo/seed behavior until its keys are set, so you can do
these **in any order, in stages** — nothing breaks in between.

After each step, verify with:

```bash
npm run preflight
```

It probes every configured service (real requests where possible) and prints a
pass/fail table. Run it locally with `.env.local`, or against production by
loading the same env the Fly app uses.

All production secrets are set as **Fly secrets** in one command — see
`scripts/set-fly-secrets.example.sh`. Setting them together triggers a single
redeploy.

---

## 1. Neon (database)

1. In the sandbox only: allowlist Neon egress (see README → *Claude Code on the
   web*). Include `*.aws.neon.tech` — the HTTP driver uses a multi-label host.
2. Get the pooled connection string from the Neon dashboard
   (`...-pooler.<region>.aws.neon.tech/neondb?sslmode=require`).
3. Point the app at it and apply the schema + sample data:
   ```bash
   export DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"
   npm run db:migrate       # create tables
   npm run db:seed          # sample stores/listings (optional in prod)
   npm run db:create-admin  # provision SUPER_ADMIN_EMAIL as super_admin
   ```
4. `npm run preflight` → **Database** should be ✅.

> The pasted dev password was shared in chat — rotate it in Neon before
> production and use the new value in Fly secrets.

## 2. Google OAuth (sign-in)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client
   ID** → *Web application*.
2. **Authorized redirect URIs** (Auth.js callback path):
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://thisnthat.fly.dev/api/auth/callback/google` (prod)
3. **Authorized JavaScript origins**: `http://localhost:3000` and
   `https://thisnthat.fly.dev`.
4. Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, a strong `AUTH_SECRET`
   (`openssl rand -base64 32`), and `AUTH_URL` = the deployed URL.
5. **Turn `ALLOW_DEV_LOGIN` OFF in production** — it's passwordless and
   sandbox-only. Preflight warns if it's on with `NODE_ENV=production`.
6. `npm run preflight` → **Auth** should list `google` as a provider.

## 3. Stripe (payments + payouts)

1. Stripe Dashboard → Developers → API keys. Start in **test mode**.
2. Set `STRIPE_SECRET_KEY` (`sk_test_…`) and `PLATFORM_FEE_BPS` (default `800` =
   8%).
3. Create a webhook: Developers → Webhooks → **Add endpoint** →
   `https://thisnthat.fly.dev/api/stripe/webhook`, event
   `checkout.session.completed`. Copy the signing secret to
   `STRIPE_WEBHOOK_SECRET`.
4. End-to-end test:
   - Sign in as a seller → **Seller Hub → Payments → Connect with Stripe** →
     finish Express onboarding.
   - Buy that seller's item → pay with test card `4242 4242 4242 4242`, any
     future expiry/CVC.
   - Confirm the order flips to `paid` (webhook) and the fee/transfer show in
     the Stripe dashboard.
5. Swap to live keys (`sk_live_…`) + a live-mode webhook secret when ready.
6. `npm run preflight` → **Payments** should be ✅ (validates the key + reports
   test/live and connected accounts).

## 4. Gemini (AI photo scanning)

1. Get a key from Google AI Studio.
2. Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, default
   `gemini-2.0-flash`).
3. `npm run preflight` → **AI** should be ✅. In the app, upload a listing
   photo — suggestions now come from Gemini (`source: "ai"`) instead of the
   sample fallback.

## 5. Cloudflare R2 (images) — optional, P3

Not yet wired into upload code (listings currently save to local
`/public/uploads`). When implemented, set `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_HOST`.

---

## Deploy

```bash
bash scripts/set-fly-secrets.sh   # your filled-in copy of the template
fly deploy --app thisnthat
```

Then load the production env and run `npm run preflight` one last time — aim
for **Database, Auth, Payments, AI** all ✅ before announcing.
