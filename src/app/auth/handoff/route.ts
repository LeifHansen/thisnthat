import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { safeInternalPath } from "@/lib/nextRedirect";

// Redeems a hand-off token from the mobile app (see
// /api/mobile/handoff) for a normal web cookie session, then drops the user
// where they were heading.
//
// A failure here is never fatal and never loud: the user still gets the page
// they asked for, just signed out, which is exactly what happened before any
// of this existed. So every bad-token path redirects to `next` rather than
// rendering an error the user can do nothing about.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const next = safeInternalPath(url.searchParams.get("next")) ?? "/dashboard";
  const destination = new URL(next, url.origin);

  if (!token) return NextResponse.redirect(destination);

  try {
    // next-auth writes the session cookie through next/headers, which a route
    // handler may do — it rides out on the redirect below. `redirect: false`
    // because we own the navigation (and the token is spent either way).
    await signIn("mobile-handoff", { token, redirect: false });
  } catch (e) {
    // An expired, replayed or tampered token, or a suspended account. Nothing
    // the visitor can act on, so send them on signed out.
    console.error("handoff: sign-in failed", e);
  }

  return NextResponse.redirect(destination);
}
