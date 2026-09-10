#!/bin/sh
# Fly release_command. Kept in a script file (not inline in fly.toml) because
# docker-entrypoint.js reconstructs the command via argv.join(" "), which strips
# the quoting off an inline `sh -c '...'` and mangles any parens/quotes in it —
# that broke every deploy after the "deploy hardening" change.
#
# Non-fatal by design: the entrypoint also runs `prisma migrate deploy` with
# retries on boot, so a hiccup here must not wedge the deploy. Always exit 0.

# Reports whether checkout can actually take a card on this release — a missing
# publishable key breaks every payment while failing nowhere else. Never prints
# a key, never fails the deploy.
node scripts/check-stripe-key.mjs || echo "stripe key check errored (non-fatal)"

npx prisma migrate deploy || echo "release migrate failed; entrypoint will retry on boot"
# Idempotent: syncs the category table from src/lib/categories.ts and (re)creates
# the demo accounts. With NODE_ENV=production it seeds no demo listings.
npx prisma db seed || echo "seed failed (non-fatal)"
exit 0
