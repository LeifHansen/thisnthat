import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteAccount } from "@/lib/deleteAccount";
import { getMobileUser } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/rateLimit";

// Current user for the mobile app. The client calls this on launch to
// re-hydrate the session from a stored token (and to detect a revoked/
// suspended account, which getMobileUser rejects).
//
// It also returns the saved shipping address, so native checkout can prefill
// the form instead of making someone type their address on a phone keyboard
// for an account that already has one on file. Null when nothing is saved.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const saved = await prisma.user
    .findUnique({
      where: { id: user.id },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
      },
    })
    .catch(() => null);

  // Only offer it when it's complete enough to actually ship to — a half-filled
  // address prefilled into the form is worse than an empty one.
  const shipping =
    saved?.addressLine1 && saved.city && saved.state && saved.postalCode
      ? {
          name: saved.name,
          line1: saved.addressLine1,
          line2: saved.addressLine2,
          city: saved.city,
          state: saved.state,
          postalCode: saved.postalCode,
        }
      : null;

  return NextResponse.json({ user, shipping });
}

/**
 * Delete the signed-in account (App Store Review Guideline 5.1.1(v)).
 *
 * Scrubs the row rather than removing it — see src/lib/deleteAccount.ts for
 * why, and for what survives. Refuses with 409 while the account has an order
 * mid-escrow or in transit; the message names the count and a way through.
 *
 * The bearer token isn't revoked, because it can't be — it's stateless. It
 * stops working anyway: getMobileUser re-reads the row on every request and
 * the tombstone is suspended.
 */
export async function DELETE(req: Request) {
  const limited = rateLimit(req, "mobile-delete-account", 5, 60_000);
  if (limited) return limited;

  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

