import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobileAuth";
import { stripePublishableKey } from "@/lib/stripePublic";

// Runtime config the app can't be built with.
//
// The Stripe publishable key is deliberately not a NEXT_PUBLIC_* variable —
// see the long note in src/lib/stripePublic.ts — so it exists only at request
// time on the server. The web app passes it to its checkout components as a
// prop; the app has to ask for it, which is this.
//
// The key is public by definition (it ships to every web visitor), but there
// is no reason to serve it to unauthenticated callers, so this stays behind
// the bearer token like the rest of /api/mobile.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = stripePublishableKey();
  if (!key) {
    // stripePublishableKey() has already logged the specific misconfiguration.
    return NextResponse.json(
      { error: "Payments are not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({ stripePublishableKey: key });
}
