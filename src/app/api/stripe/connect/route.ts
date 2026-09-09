import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireStripe } from "@/lib/stripe";
import {
  connectBaseUrl,
  createOnboardingLink,
  logStripeError,
  resolveConnectAccount,
} from "@/lib/payout";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    requireStripe();
  } catch {
    return NextResponse.json(
      { error: "Payments not configured." },
      { status: 503 },
    );
  }

  try {
    const resolved = await resolveConnectAccount(session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const { connectId, state, provisioned } = resolved;

    // Starts are logged so they can be compared against completions in
    // `fly logs`. Without this an abandoned onboarding leaves no trace at all:
    // the seller clicks, disappears into Stripe, and nothing here ever knows.
    console.log(
      "[stripe/connect] start:",
      JSON.stringify({
        userId: session.user.id,
        status: state.status,
        provisioned,
        currentlyDue: state.currentlyDue.length,
      }),
    );

    // Already onboarded → the Express Dashboard, where they can change their
    // bank account and see payouts. Login links only work once onboarding is
    // complete; anything else resumes onboarding.
    if (state.status === "enabled") {
      const login = await requireStripe().accounts.createLoginLink(connectId);
      return NextResponse.json({ url: login.url });
    }

    const url = await createOnboardingLink(connectId, connectBaseUrl(req));
    return NextResponse.json({ url });
  } catch (e) {
    // Never let a Stripe/Prisma error escape as a bodyless 500 — the client
    // tries to JSON-parse the response and shows "Unexpected end of JSON
    // input", masking the real cause. Log it (visible in `fly logs`) and return
    // a readable message instead.
    const message =
      e instanceof Error ? e.message : "Could not start payout setup.";
    logStripeError("stripe/connect", e, {
      userId: session.user.id,
      baseUrl: connectBaseUrl(req),
    });
    return NextResponse.json(
      { error: `Payout setup failed: ${message}` },
      { status: 500 },
    );
  }
}
