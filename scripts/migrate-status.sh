#!/bin/sh
# Read-only: prints which committed migrations the database at DATABASE_URL has
# applied, which are still pending, and any that failed. Changes nothing.
#
# Meant to run inside a Fly machine, where only DATABASE_URL is a secret:
#
#     fly ssh console -C "sh /app/scripts/migrate-status.sh"
#
# so it derives DIRECT_URL the way docker-entrypoint.js does (the schema
# declares directUrl and the Prisma CLI refuses to start without it). Exits
# non-zero when migrations are pending — the output says which.
cd "$(dirname "$0")/.." || exit 1

if [ -z "$DATABASE_URL" ] && [ -n "$DEV_DATABASE_URL" ]; then
  DATABASE_URL="$DEV_DATABASE_URL"
fi
if [ -z "$DIRECT_URL" ] && [ -n "$DATABASE_URL" ]; then
  DIRECT_URL=$(printf '%s' "$DATABASE_URL" | sed 's/-pooler//')
fi
export DATABASE_URL DIRECT_URL

exec ./node_modules/.bin/prisma migrate status
