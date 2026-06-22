#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs Node deps and brings up a local Postgres dev database that mirrors
# the Neon schema (same Drizzle migrations), so the app runs against a real
# database in the sandbox even though *.neon.tech is blocked by egress.
set -euo pipefail

# Web (remote) environment only — local machines use their own DB/Neon.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR"

# 1. Node dependencies (npm install is cache-friendly for the container image).
npm install

# 2. Local Postgres dev mirror.
DB_NAME=thisnthat
DB_USER=thisnthat
DB_PASS=thisnthat
DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

if command -v pg_ctlcluster >/dev/null 2>&1; then
  # Start the cluster (ignore if already running).
  pg_ctlcluster 16 main start >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    pg_isready -h localhost -q && break
    sleep 0.5
  done

  # Role + database (idempotent).
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

  # Apply migrations, then seed once (only if the DB is empty).
  DATABASE_URL="${DB_URL}" npm run db:migrate
  HAS_DATA=$(sudo -u postgres psql -d "${DB_NAME}" -tAc \
    "SELECT to_regclass('public.stores') IS NOT NULL AND (SELECT count(*) FROM stores) > 0" 2>/dev/null || echo f)
  if [ "${HAS_DATA}" != "t" ]; then
    DATABASE_URL="${DB_URL}" npm run db:seed
    DATABASE_URL="${DB_URL}" npm run db:create-admin
  fi

  # Expose the connection string + sandbox auth config to the whole session.
  # ALLOW_DEV_LOGIN enables passwordless email sign-in for local testing only.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export DATABASE_URL=\"${DB_URL}\"" >> "${CLAUDE_ENV_FILE}"
    echo "export SUPER_ADMIN_EMAIL=admin@thisnthat.com" >> "${CLAUDE_ENV_FILE}"
    echo "export AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> "${CLAUDE_ENV_FILE}"
    echo "export AUTH_URL=\"http://localhost:3000\"" >> "${CLAUDE_ENV_FILE}"
    echo "export ALLOW_DEV_LOGIN=true" >> "${CLAUDE_ENV_FILE}"
  fi
  echo "Local Postgres dev mirror ready at ${DB_URL}"
else
  echo "Postgres not found — app will run on seed data (install postgresql-16 to enable the DB)." >&2
fi
