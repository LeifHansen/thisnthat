#!/usr/bin/env bash
#
# Spin up a local Postgres dev database for previewing/testing the app inside an
# ephemeral container that has no external database. Idempotent: safe to re-run
# (it won't wipe existing data). After running, start the app with `npm run dev`.
#
#   bash scripts/dev-db-setup.sh
#
# Connection used (matches .env.local, which this script creates if missing):
#   postgresql://user:pass@127.0.0.1:5432/db
#
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
PGDATA="/var/lib/postgresql/devdata"
PGUSER="user"
PGDB="db"
URL="postgresql://user:pass@127.0.0.1:5432/db?sslmode=disable"

if [ -z "${PGBIN:-}" ]; then
  echo "Postgres server binaries not found under /usr/lib/postgresql/*/bin" >&2
  exit 1
fi

# Postgres refuses to run as root — use the unprivileged 'postgres' account.
id postgres >/dev/null 2>&1 || useradd -m -s /bin/bash postgres

# 1) Initialise the cluster (DB superuser is named 'user' so the URL matches).
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"; chown -R postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U $PGUSER -A trust --encoding=UTF8"
fi

# 2) Start it (IPv4 loopback; node resolves 'localhost' to ::1, so use 127.0.0.1).
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log \
    -o \"-c listen_addresses='127.0.0.1' -p 5432 -c unix_socket_directories='/tmp'\" -w start"
fi

# 3) Create the database if it doesn't exist.
if ! psql -h 127.0.0.1 -U "$PGUSER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PGDB'" | grep -q 1; then
  createdb -h 127.0.0.1 -p 5432 -U "$PGUSER" "$PGDB"
fi

# 4) .env.local for the Next dev server (gitignored; placeholders for non-DB env).
if [ ! -f .env.local ]; then
  cat > .env.local <<EOF
DATABASE_URL="$URL"
DIRECT_URL="$URL"
AUTH_SECRET="local-dev-secret-local-dev-secret-pad-32+"
STRIPE_PUBLISHABLE_KEY="pk_test_local"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
EOF
  echo "wrote .env.local"
fi

# 5) Schema + seed data.
export DATABASE_URL="$URL" DIRECT_URL="$URL"
npx prisma db push --skip-generate
npx tsx prisma/seed.ts
npx tsx scripts/seed-dummy-sellers.ts || true   # references prod IDs; best-effort
npx tsx scripts/seed-dev.ts

echo ""
echo "Dev DB ready at $URL"
echo "Start the app:  npm run dev"
echo "Demo logins (password123): admin@beaniex.com / seller@beaniex.com / buyer@beaniex.com"
