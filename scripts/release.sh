#!/bin/sh
# Fly release_command. Kept in a script file (not inline in fly.toml) because
# docker-entrypoint.js reconstructs the command via argv.join(" "), which strips
# the quoting off an inline `sh -c '...'` and mangles any parens/quotes in it —
# that broke every deploy after the "deploy hardening" change.
#
# `prisma migrate deploy` is retried, then FATAL. It used to be non-fatal so a
# transient hiccup could never wedge a deploy — and that is exactly how a
# permanent failure went unnoticed: every release was refused with P1000
# through DIRECT_URL while the app read fine through DATABASE_URL, nothing
# created the User table, and the deploy stayed green while every signup
# failed with what looked like a bug. A release whose migrations did not
# apply is not a working release. Failing it keeps the previous one serving
# and prints the reason into the deploy log, where deploys are actually
# watched.
#
# The Stripe check only reports and the seed only refreshes demo rows, so
# those stay non-fatal.

# Reports whether checkout can actually take a card on this release — a missing
# publishable key breaks every payment while failing nowhere else. Never prints
# a key, never fails the deploy.
node scripts/check-stripe-key.mjs || echo "stripe key check errored (non-fatal)"

# A serverless Postgres that has scaled to zero can refuse the connection that
# wakes it; three attempts per URL cover that without masking a real failure.
migrate_with_retries() {
  attempt=1
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge 3 ]; then
      return 1
    fi
    attempt=$((attempt + 1))
    echo "release: prisma migrate deploy failed; retrying ($attempt/3) in 5s..."
    sleep 5
  done
}

# Migrations need a direct (non-pooled) connection, which is what DIRECT_URL
# is for. It is also the one secret that can drift from DATABASE_URL without
# anything noticing — set by hand once, with credentials since rotated, or
# for another Neon branch. DATABASE_URL is the connection the app actually
# runs on, so its credentials are the ones to trust: try the explicit
# DIRECT_URL first and, if it is rejected, the direct URL derived from
# DATABASE_URL (Neon's "-pooler" host suffix dropped — the same derivation
# docker-entrypoint.js applies when DIRECT_URL is unset).
#
# Then the same URL without `channel_binding=require`. Neon's dashboard puts
# that parameter on every connection string, and Prisma honours it — it then
# insists on SCRAM channel binding, which Neon's pooled endpoint negotiates
# but its direct endpoint does not, so the app runs fine while every
# `migrate deploy` is refused with P1000 (the "(not available)" user in that
# message is the tell: the failure is client-side, not a wrong password).
# Dropping the parameter leaves Prisma's default, `prefer`, with TLS still on.
strip_channel_binding() {
  printf '%s' "$1" | sed -E 's/([?&])channel_binding=[^&]*&/\1/; s/[?&]channel_binding=[^&]*$//'
}

try_fallback() { # $1 = candidate URL, $2 = what it is (for the log)
  echo "release: DIRECT_URL was rejected; retrying migrations with $2..."
  ( export DIRECT_URL="$1"; migrate_with_retries )
}

migrated=""
if migrate_with_retries; then
  migrated=1
elif [ -n "$DATABASE_URL" ]; then
  derived=$(printf '%s' "$DATABASE_URL" | sed 's/-pooler//')
  derived_plain=$(strip_channel_binding "$derived")
  if [ "$derived" != "$DIRECT_URL" ] && try_fallback "$derived" "the direct URL derived from DATABASE_URL"; then
    migrated=1
    cat <<'MSG'

release: WARNING — migrations applied through the URL derived from DATABASE_URL,
because the DIRECT_URL secret was rejected. This release is fine, but that
secret is wrong: run `fly secrets unset DIRECT_URL` (the entrypoint derives it
from DATABASE_URL) or set it to the direct connection string for the same role,
so the next release does not depend on this fallback.

MSG
  elif [ "$derived_plain" != "$derived" ] && [ "$derived_plain" != "$DIRECT_URL" ] \
    && try_fallback "$derived_plain" "that URL without channel_binding=require"; then
    migrated=1
    cat <<'MSG'

release: WARNING — migrations applied only after dropping `channel_binding=require`
from the connection string: Prisma then insists on SCRAM channel binding, which
Neon's direct endpoint does not negotiate. This release is fine, but set
DIRECT_URL to the direct connection string WITHOUT that parameter (keep
sslmode=require), e.g.
  fly secrets set DIRECT_URL='postgresql://ROLE:PASSWORD@ep-....aws.neon.tech/neondb?sslmode=require'
so the next release does not depend on this fallback.

MSG
  fi
fi

if [ -z "$migrated" ]; then
  cat >&2 <<'MSG'

release: prisma migrate deploy failed — aborting this release.

The database at DATABASE_URL does not have this release's schema, and the app
cannot run without it (every signup, listing and order write would fail).
The Prisma error above says why. The usual ones:

  P1000 "Authentication failed against database server"
      Migrations connect with DIRECT_URL; the app itself connects with
      DATABASE_URL. The explicit DIRECT_URL, the one derived from
      DATABASE_URL, and that one without channel_binding=require were all
      rejected, so the credentials in DATABASE_URL itself are not accepted
      by the direct endpoint. Copy both connection strings fresh from the
      Neon dashboard (same role, and drop channel_binding=require from the
      direct one) and set them with
      `fly secrets set DATABASE_URL=... DIRECT_URL=...`.
  P3005 "The database schema is not empty"
      DATABASE_URL points at a database that already holds tables from another
      app (for this Fly app: the prototype that ran here before), and Prisma
      will not lay its schema over them. Point DATABASE_URL (and DIRECT_URL)
      at an empty database, or empty this one — README, "Database
      troubleshooting".
  P3009 "migrate found failed migrations"
      A migration was interrupted part-way. https://pris.ly/d/migrate-resolve
  P1001 / timeouts
      The database was unreachable for the whole release; re-run the deploy.

MSG
  exit 1
fi

# Idempotent: syncs the category table from src/lib/categories.ts and (re)creates
# the demo accounts. With NODE_ENV=production it seeds no demo listings.
npx prisma db seed || echo "seed failed (non-fatal)"
exit 0
