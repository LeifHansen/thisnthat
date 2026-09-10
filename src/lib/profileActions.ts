"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { publicUrlFor } from "@/lib/r2";
import { deleteAccount } from "@/lib/deleteAccount";
import { signOut } from "@/lib/auth";
import { normalizeHandle, sellerPath, validateHandle } from "@/lib/handles";
import { US_STATES } from "@/lib/usStates";

const MAX_DISPLAY_NAME = 40;
const MAX_BIO = 500;
const MAX_URL = 2048;

/**
 * Save the signed-in user's public profile (display name, bio, avatar).
 * Avatar URLs are only accepted from our own R2 bucket (the /api/upload
 * kind=avatar flow) so the field can't be pointed at arbitrary hosts.
 */
export async function updateProfile(formData: FormData) {
  const user = await requireUser();

  const displayName = String(formData.get("displayName") ?? "")
    .trim()
    .slice(0, MAX_DISPLAY_NAME);
  const bio = String(formData.get("bio") ?? "")
    .trim()
    .slice(0, MAX_BIO);
  const avatarUrl = String(formData.get("avatarUrl") ?? "")
    .trim()
    .slice(0, MAX_URL);
  // Seller ship-from ZIP (origin for live shipping rates). Empty clears it;
  // anything present must be a real 5-digit ZIP.
  const shipFromPostalCode = String(formData.get("shipFromPostalCode") ?? "").trim();
  if (shipFromPostalCode !== "" && !/^\d{5}(-\d{4})?$/.test(shipFromPostalCode)) {
    redirect(
      "/dashboard/profile?toast=Enter+a+valid+5-digit+ship-from+ZIP&toastKind=error",
    );
  }

  // Street address: ship-from for bought labels, default ship-to for accepted
  // offers. Every line is optional on its own (label purchase checks for a
  // complete address at the point of use), but what is present must be sane.
  const field = (k: string, max: number) =>
    String(formData.get(k) ?? "").trim().slice(0, max);
  const addressLine1 = field("addressLine1", 120);
  const addressLine2 = field("addressLine2", 120);
  const city = field("city", 80);
  const state = field("state", 2).toUpperCase();
  const postalCode = field("postalCode", 10);
  if (state !== "" && !US_STATES.some((st) => st.code === state)) {
    redirect("/dashboard/profile?toast=Pick+a+state+from+the+list&toastKind=error");
  }
  if (postalCode !== "" && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    redirect("/dashboard/profile?toast=Enter+a+valid+5-digit+ZIP+for+your+address&toastKind=error");
  }

  const r2Base = publicUrlFor("avatars/");
  const validAvatar =
    avatarUrl === "" || (r2Base.length > "avatars//".length && avatarUrl.startsWith(r2Base));
  if (!validAvatar) {
    redirect("/dashboard/profile?toast=That+avatar+image+URL+isn%27t+allowed&toastKind=error");
  }

  // Public handle (/u/<handle>). Blank clears it; anything present must pass
  // the format + reserved-word rules, and the unique index decides collisions.
  const handleRaw = normalizeHandle(formData.get("handle"));
  let handle: string | null = null;
  if (handleRaw !== "") {
    const checked = validateHandle(handleRaw);
    if (!checked.ok) {
      redirect(
        `/dashboard/profile?toast=${encodeURIComponent(checked.error)}&toastKind=error`,
      );
    }
    handle = checked.handle;
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: displayName || null,
        bio: bio || null,
        avatarUrl: avatarUrl || null,
        shipFromPostalCode: shipFromPostalCode || null,
        handle,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      redirect(
        "/dashboard/profile?toast=That+handle+is+already+taken+%E2%80%94+try+another&toastKind=error",
      );
    }
    throw e;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  revalidatePath(`/u/${user.id}`);
  revalidatePath(sellerPath({ id: user.id, handle }));
  redirect("/dashboard/profile?toast=Profile+saved");
}

/**
 * Delete the signed-in user's own account.
 *
 * The counterpart of the app's DELETE /api/mobile/me — Apple requires
 * deletion to be reachable in-app, and it would be odd for the website not to
 * offer what the app must. Both call the same `deleteAccount`.
 *
 * Requires the account's email typed back, which is the confirmation the
 * button's wording promises and is not recoverable from muscle memory.
 */
export async function deleteOwnAccount(formData: FormData): Promise<void> {
  const user = await requireUser();

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!me) back("Account not found.");

  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (typed !== me.email.toLowerCase()) {
    back("That doesn't match the email on this account.");
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) back(result.message);

  // Drop the cookie session too. Without this the visitor keeps a session for
  // an account that no longer exists — harmless, since the jwt callback fails
  // closed on a suspended user, but it would show them a broken dashboard
  // instead of the goodbye they asked for.
  await signOut({ redirectTo: "/?deleted=1" });
}

/** Bounce back to the profile page with a message the form can't show itself. */
function back(message: string): never {
  redirect(`/dashboard/profile?deleteError=${encodeURIComponent(message)}`);
}
