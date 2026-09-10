import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import {
  HANDOFF_TTL_SECONDS,
  getMobileUser,
  signHandoffToken,
} from "@/lib/mobileAuth";

// Mints a single-use token the app can spend at /auth/handoff to open a web
// page already signed in.
//
// The app authenticates with a bearer token, but every screen it hands off to
// the website (dashboard, messages, and checkout until that ships natively)
// opens in a SFSafariViewController with its own cookie jar. It has never seen
// that bearer token, so the user arrived signed out and was asked for the
// password they had just typed into the app.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Each token is one tap on a link row. Generous for a person, tight enough
  // that a stolen bearer token can't be milked for a stream of them.
  const limited = rateLimit(req, "mobile-handoff", 20, 60_000);
  if (limited) return limited;

  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    token: signHandoffToken({ sub: user.id, email: user.email }),
    expiresInSeconds: HANDOFF_TTL_SECONDS,
  });
}
