#!/usr/bin/env bash
#
# One-shot Fly.io setup for This'n'that. Run it from a machine that has
# flyctl installed and is logged in (`fly auth login`), from the repo root:
#
#   bash scripts/fly-setup.sh                # uses app name from fly.toml
#   APP=my-app REGION=lhr bash scripts/fly-setup.sh
#
# What it does, idempotently (safe to re-run):
#   1. Creates the Fly app named in fly.toml if it doesn't exist.
#   2. Creates a Fly Postgres cluster "<app>-db" and attaches it, which sets
#      the DATABASE_URL secret on the app (skipped if DATABASE_URL is already a
#      secret — e.g. you brought your own Neon/Supabase URL).
#   3. Sets DIRECT_URL = DATABASE_URL (Prisma needs both; Fly Postgres has no
#      pooler hostname to strip).
#   4. Generates AUTH_SECRET if the app has none.
#   5. Sets every other secret from a local `.env.fly` file (gitignored — copy
#      .env.example, fill in the live values). Blank lines and comments are
#      ignored; only KEY=VALUE lines are sent.
#   6. Deploys (`fly deploy --ha=false`): the release command runs the Prisma
#      migrations and seeds the categories + admin account.
#
# Afterwards:
#   - Point Stripe's webhook at https://<app>.fly.dev/api/stripe/webhook
#     (events: payment_intent.amount_capturable_updated, payment_intent.succeeded,
#     payment_intent.canceled, charge.dispute.created) and set the signing
#     secret with `fly secrets set STRIPE_WEBHOOK_SECRET=whsec_...`.
#   - Point EasyPost's webhook at https://<app>.fly.dev/api/easypost/webhook.
#   - Add a custom domain with `fly certs add yourdomain.com`, then set
#     SITE_URL and NEXT_PUBLIC_APP_URL (fly.toml [build.args]) to it.
#   - For CI deploys, create a deploy token (`fly tokens create deploy -x 999999h`)
#     and store it as the FLY_API_TOKEN repository secret on GitHub.
set -euo pipefail

cd "$(dirname "$0")/.."

APP="${APP:-$(sed -n "s/^app = '\(.*\)'/\1/p" fly.toml)}"
REGION="${REGION:-$(sed -n "s/^primary_region = '\(.*\)'/\1/p" fly.toml)}"
DB_APP="${DB_APP:-${APP}-db}"
ENV_FILE="${ENV_FILE:-.env.fly}"

if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl is not installed. Install it: https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi
FLY="$(command -v fly || command -v flyctl)"

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: $FLY auth login" >&2
  exit 1
fi

echo "==> App: $APP (region $REGION)"

# 1. App
if "$FLY" apps list --json | grep -q "\"Name\": *\"$APP\""; then
  echo "    app exists"
else
  "$FLY" apps create "$APP"
fi

secret_names() {
  "$FLY" secrets list --app "$APP" --json 2>/dev/null | sed -n 's/.*"Name": *"\([^"]*\)".*/\1/p'
}
has_secret() { secret_names | grep -qx "$1"; }

# 2. Database
if has_secret DATABASE_URL; then
  echo "==> DATABASE_URL already set — keeping your database"
else
  echo "==> Creating Fly Postgres $DB_APP"
  if "$FLY" apps list --json | grep -q "\"Name\": *\"$DB_APP\""; then
    echo "    $DB_APP exists"
  else
    "$FLY" postgres create --name "$DB_APP" --region "$REGION" \
      --vm-size shared-cpu-1x --volume-size 3 --initial-cluster-size 1
  fi
  # Attaching creates a database + role for the app and sets DATABASE_URL. The
  # connection string is printed exactly once, so capture it for DIRECT_URL
  # (Prisma reads both; Fly Postgres has no separate pooler host).
  ATTACH_OUT="$("$FLY" postgres attach "$DB_APP" --app "$APP" --database-name "$APP" 2>&1 || true)"
  echo "$ATTACH_OUT"
  ATTACHED_URL="$(printf '%s\n' "$ATTACH_OUT" | sed -n 's/.*DATABASE_URL=\(postgres[^[:space:]]*\).*/\1/p' | head -1)"
  if [ -n "$ATTACHED_URL" ]; then
    "$FLY" secrets set --app "$APP" --stage "DIRECT_URL=$ATTACHED_URL"
  fi
fi

# 3. DIRECT_URL mirrors DATABASE_URL unless you set it yourself.
if ! has_secret DIRECT_URL; then
  # `fly secrets` never prints values, so if it could not be captured above
  # the app derives DIRECT_URL from DATABASE_URL at boot (docker-entrypoint.js).
  # For Neon, set DIRECT_URL (the non-pooler host) explicitly in .env.fly.
  echo "==> DIRECT_URL not set; the entrypoint derives it from DATABASE_URL"
fi

# 4. AUTH_SECRET
if ! has_secret AUTH_SECRET; then
  echo "==> Generating AUTH_SECRET"
  "$FLY" secrets set --app "$APP" --stage "AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
fi

# 5. Everything else from .env.fly
if [ -f "$ENV_FILE" ]; then
  echo "==> Setting secrets from $ENV_FILE"
  # Only KEY=VALUE lines; strip surrounding quotes; skip empty values.
  ARGS=()
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"
    [ -z "$val" ] && continue
    ARGS+=("$key=$val")
  done < "$ENV_FILE"
  if [ "${#ARGS[@]}" -gt 0 ]; then
    "$FLY" secrets set --app "$APP" --stage "${ARGS[@]}"
  fi
else
  cat <<EOF
==> No $ENV_FILE found. Create it from .env.example with LIVE values for at least:
      STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
      SENDGRID_API_KEY, SENDGRID_FROM, SITE_URL, SUPERADMIN_EMAIL,
      R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
    then re-run this script. Deploying anyway so the app boots (checkout will
    say payments are not configured until the Stripe keys are set).
EOF
fi

# 6. Deploy — staged secrets are released with the deploy.
echo "==> Deploying"
"$FLY" deploy --app "$APP" --ha=false

echo
echo "Done. App: https://$APP.fly.dev"
echo "Health (admin detail after sign-in): https://$APP.fly.dev/api/health"
echo "Next: Stripe + EasyPost webhooks, custom domain, FLY_API_TOKEN on GitHub — see the comment at the top of this script."
