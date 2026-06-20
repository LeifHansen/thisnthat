#!/bin/bash
# Template for setting ThisNThat's secrets on Fly.io.
#
# Copy to set-fly-secrets.sh (gitignored), fill in real values, and run it.
# Setting them together triggers a single redeploy. Each service stays in its
# demo/seed fallback until its keys are present, so you can add them in stages.
#
#   cp scripts/set-fly-secrets.example.sh scripts/set-fly-secrets.sh
#   # edit values
#   bash scripts/set-fly-secrets.sh
set -euo pipefail

APP=thisnthat

fly secrets set \
  `# --- Neon (production database) ---` \
  DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require" \
  `# --- Auth.js ---` \
  AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_URL="https://thisnthat.fly.dev" \
  AUTH_GOOGLE_ID="REPLACE" \
  AUTH_GOOGLE_SECRET="REPLACE" \
  SUPER_ADMIN_EMAIL="admin@thisnthat.com" \
  `# --- Google Gemini (AI listing assistant) ---` \
  GEMINI_API_KEY="REPLACE" \
  `# --- Stripe Connect (payments) ---` \
  STRIPE_SECRET_KEY="sk_live_or_test_REPLACE" \
  STRIPE_WEBHOOK_SECRET="whsec_REPLACE" \
  PLATFORM_FEE_BPS="800" \
  `# --- Cloudflare R2 (listing images) ---` \
  R2_ACCOUNT_ID="REPLACE" \
  R2_ACCESS_KEY_ID="REPLACE" \
  R2_SECRET_ACCESS_KEY="REPLACE" \
  R2_BUCKET="REPLACE" \
  R2_PUBLIC_HOST="images.thisnthat.com" \
  --app "$APP"

echo "Secrets set on $APP. Trigger a deploy with: fly deploy --app $APP"
