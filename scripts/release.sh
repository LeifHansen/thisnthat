#!/bin/sh
# Fly release_command. Kept in a script file (not inline in fly.toml) because
# docker-entrypoint.js reconstructs the command via argv.join(" "), which strips
# the quoting off an inline `sh -c '...'` and mangles any parens/quotes in it —
# that broke every deploy after the "deploy hardening" change.
#
# `prisma migrate deploy` is retried, then FATAL. It used to be non-fatal so a
# transient hiccup could never wedge a deploy — and that is exactly how a
# permanent failure went unnoticed: DATABASE_URL pointed at a database that
# already held another app's tables, Prisma refused it on every release and
# every boot (P3005, "the database schema is not empty"), nothing created the
# User table, and the deploy stayed green while every signup failed with what
# looked like a bug. A release whose migrations did not apply is not a
# working release. Failing it keeps the previous one serving and prints the
# reason into the deploy log, where deploys are actually watched.
#
# The Stripe check only reports and the seed only refreshes demo rows, so
# those stay non-fatal.

# Reports whether checkout can actually take a card on this release — a missing
# publishable key breaks every payment while failing nowhere else. Never prints
# a key, never fails the deploy.
node scripts/check-stripe-key.mjs || echo "stripe key check errored (non-fatal)"

# A serverless Postgres that has scaled to zero can refuse the connection that
# wakes it; three attempts cover that without masking a real failure.
attempt=1
until npx prisma migrate deploy; do
  if [ "$attempt" -ge 3 ]; then
    cat >&2 <<'MSG'

release: prisma migrate deploy failed 3 times — aborting this release.

The database at DATABASE_URL does not have this release's schema, and the app
cannot run without it (every signup, listing and order write would fail).
The Prisma error above says why. The usual ones:

  P1000 "Authentication failed against database server"
      Migrations connect with DIRECT_URL; the app itself connects with
      DATABASE_URL. If the site reads fine but this fails, DIRECT_URL is the
      wrong one: set by hand with stale credentials, or for another Neon
      project or branch. `fly secrets list` shows whether it is set. Either
      `fly secrets unset DIRECT_URL` (the entrypoint then derives it from
      DATABASE_URL by dropping Neon's "-pooler" host suffix) or set it to the
      direct connection string for the same role from the Neon dashboard.
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
  attempt=$((attempt + 1))
  echo "release: prisma migrate deploy failed; retrying ($attempt/3) in 5s..."
  sleep 5
done

# Idempotent: syncs the category table from src/lib/categories.ts and (re)creates
# the demo accounts. With NODE_ENV=production it seeds no demo listings.
npx prisma db seed || echo "seed failed (non-fatal)"
exit 0
