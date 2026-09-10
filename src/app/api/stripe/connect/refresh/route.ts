import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireStripe } from "@/lib/stripe";
import {
  connectBaseUrl,
  createOnboardingLink,
  logStripeError,
  resolveConnectAccount,
} from "@/lib/payout";

// Stripe's `refresh_url`: where a seller lands when their account link expires
// or is reopened. Account links are single-use and live for minutes, so this is
// hit by anyone who pauses mid-form, and it used to be a bare /dashboard —
// dropping them back on the same button with no explanation and no sign that
// anything had gone wrong. Mint a fresh link and put them back where they left
// off instead.
//
// A GET that mutates nothing of the seller's own: it only ever re-issues a link
// (and provisions an account if the stored one turned out unusable).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  // Where to go if we can't produce a fresh onboarding link. Same destination
  // the old bare refresh_url used, but carrying why, so the dashboard can say
  // something instead of looking like the click did nothing.
  let destination = "/dashboard?connected=refresh_failed#payouts";

  try {
    requireStripe();
    const resolved = await resolveConnectAccount(session.user.id);
    if (resolved?.state.status === "enabled") {
      // Nothing left to onboard — they finished on an earlier pass.
      destination = "/dashboard?connected=1#payouts";
    } else if (resolved) {
      destination = await createOnboardingLink(
        resolved.connectId,
        connectBaseUrl(req),
      );
    }
  } catch (e) {
    logStripeError("stripe/connect/refresh", e, { userId: session.user.id });
  }

  // redirect() throws, so it must be called outside the try block.
  redirect(destination);
}
