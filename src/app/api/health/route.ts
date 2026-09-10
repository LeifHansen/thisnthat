import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inspectConfig } from "@/lib/config";

// Health + configuration check. Returns 200 when the app is ready to take real
// payments and rate real shipping; 503 when a blocking misconfiguration is
// present for the current environment (e.g. a TEST Stripe/EasyPost key or a
// missing webhook secret in production). Anonymous callers get only { ok } —
// the key modes, warnings, and errors describe the site's security posture
// (test keys, unset webhook secret, weak AUTH_SECRET) and are admin-only.
// Route Handlers aren't cached by default in Next 16, but we force-dynamic
// since this reflects live runtime env.
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = inspectConfig();
  const status = cfg.ready ? 200 : 503;

  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ ok: cfg.ready }, { status });
  }

  return NextResponse.json(
    {
      ok: cfg.ready,
      env: cfg.env,
      stripe: cfg.stripe,
      stripePublishable: cfg.stripePublishable,
      stripeWebhook: cfg.stripeWebhook ? "set" : "unset",
      easypost: cfg.easypost,
      easypostWebhook: cfg.easypostWebhook ? "set" : "unset",
      sendgrid: cfg.sendgrid ? "set" : "unset",
      warnings: cfg.warnings,
      errors: cfg.errors,
    },
    { status },
  );
}
