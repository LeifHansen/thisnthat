// Go-live preflight — reports which integrations are configured and, where
// possible, probes them for real. Run with: npm run preflight
//
// Prints a table: each service is Configured (env present) and, if so, Live
// (a lightweight request succeeded). OAuth can't be probed headlessly, so it
// reports config only. Exits non-zero if a configured service fails its probe,
// so this can gate a deploy.

import "dotenv/config";

type Status = "ok" | "warn" | "fail" | "skip";
interface Row {
  service: string;
  configured: boolean;
  status: Status;
  detail: string;
}

const rows: Row[] = [];
function add(service: string, configured: boolean, status: Status, detail: string) {
  rows.push({ service, configured, status, detail });
}

// Race a probe against a timeout so a blocked host can't hang the run.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return add("Database (Neon)", false, "skip", "DATABASE_URL not set");
  try {
    const { db, schema } = await import("./db/index");
    if (!db) throw new Error("client not initialized");
    const stores = await withTimeout(db.select().from(schema.stores), 12000);
    add("Database (Neon)", true, "ok", `reachable — ${stores.length} stores`);
  } catch (e) {
    add("Database (Neon)", true, "fail", msg(e));
  }
}

function checkAuth() {
  const hasSecret = Boolean(process.env.AUTH_SECRET);
  const google = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const dev = process.env.ALLOW_DEV_LOGIN === "true";
  const providers = [google && "google", dev && "dev"].filter(Boolean).join(", ") || "none";
  if (!hasSecret) return add("Auth (Auth.js)", false, "skip", "AUTH_SECRET not set");
  if (providers === "none")
    return add("Auth (Auth.js)", false, "warn", "AUTH_SECRET set but no providers");
  if (dev && process.env.NODE_ENV === "production")
    return add("Auth (Auth.js)", true, "warn", `providers: ${providers} — DISABLE dev login in prod`);
  add("Auth (Auth.js)", true, "ok", `providers: ${providers}` + (google ? "" : " (add Google for prod)"));
}

async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return add("Payments (Stripe)", false, "skip", "STRIPE_SECRET_KEY not set");
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const acct = await withTimeout(stripe.accounts.list({ limit: 1 }), 12000);
    const mode = key.startsWith("sk_live") ? "live" : "test";
    const webhook = process.env.STRIPE_WEBHOOK_SECRET ? "" : " — no STRIPE_WEBHOOK_SECRET";
    add("Payments (Stripe)", true, webhook ? "warn" : "ok", `key valid (${mode}), ${acct.data.length} connected acct(s)${webhook}`);
  } catch (e) {
    add("Payments (Stripe)", true, "fail", msg(e));
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) return add("AI (Gemini)", false, "skip", "GEMINI_API_KEY not set");
  try {
    const res = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`),
      12000,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    add("AI (Gemini)", true, "ok", "key valid — models list reachable");
  } catch (e) {
    add("AI (Gemini)", true, "fail", msg(e));
  }
}

async function checkImages() {
  const keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_HOST"];
  const present = keys.filter((k) => process.env[k]);
  if (present.length === 0)
    return add("Images (R2)", false, "skip", "not configured — using local /public/uploads");
  if (present.length < keys.length)
    return add("Images (R2)", false, "warn", `missing: ${keys.filter((k) => !process.env[k]).join(", ")}`);
  try {
    const { r2Reachable } = await import("./lib/r2");
    await withTimeout(r2Reachable(), 12000);
    add("Images (R2)", true, "ok", "bucket reachable");
  } catch (e) {
    add("Images (R2)", true, "fail", msg(e));
  }
}

function msg(e: unknown): string {
  return String(e instanceof Error ? e.message : e).slice(0, 90);
}

const ICON: Record<Status, string> = { ok: "✅", warn: "⚠️ ", fail: "❌", skip: "•" };

async function main() {
  await checkDatabase();
  checkAuth();
  await checkStripe();
  await checkGemini();
  await checkImages();

  console.log("\n  ThisNThat — go-live preflight\n");
  for (const r of rows) {
    console.log(`  ${ICON[r.status]}  ${r.service.padEnd(20)} ${r.detail}`);
  }
  const failed = rows.filter((r) => r.status === "fail");
  const live = rows.filter((r) => r.status === "ok").length;
  console.log(`\n  ${live} live · ${rows.filter((r) => r.status === "skip").length} not configured · ${failed.length} failing\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
