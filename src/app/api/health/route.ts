import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inspectConfig } from "@/lib/config";
import { inspectDatabase } from "@/lib/dbHealth";

// Health + configuration check. Returns 200 when the app is ready to take real
// payments and rate real shipping; 503 when a blocking misconfiguration is
// present for the current environment (e.g. a TEST Stripe/EasyPost key or a
// missing webhook secret in production), or when the database does not have
// this build's schema. Anonymous callers get { ok, database } — the key
// modes, warnings, and errors describe the site's security posture (test
// keys, unset webhook secret, weak AUTH_SECRET) and are admin-only. The
// database status is deliberately not: it is what an operator needs when
// signing in is itself broken because the User table was never created.
// Route Handlers aren't cached by default in Next 16, but we force-dynamic
// since this reflects live runtime env.
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = inspectConfig();
  const db = await inspectDatabase();
  const ready = cfg.ready && db.status === "ok";
  const status = ready ? 200 : 503;

  // auth() re-reads the user row on every call; with the schema missing that
  // throws, and a health check that 500s on the very fault it exists to
  // report is useless. Treat a failed session read as anonymous.
  const session = await auth().catch(() => null);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ ok: ready, database: db.status }, { status });
  }

  const errors =
    db.status === "ok"
      ? cfg.errors
      : [...cfg.errors, `Database (${db.status}): ${db.detail}`];

  return NextResponse.json(
    {
      ok: ready,
      database: db,
      env: cfg.env,
      stripe: cfg.stripe,
      stripePublishable: cfg.stripePublishable,
      stripeWebhook: cfg.stripeWebhook ? "set" : "unset",
      easypost: cfg.easypost,
      easypostWebhook: cfg.easypostWebhook ? "set" : "unset",
      sendgrid: cfg.sendgrid ? "set" : "unset",
      warnings: cfg.warnings,
      errors,
    },
    { status },
  );
}
