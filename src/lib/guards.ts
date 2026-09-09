import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/nextRedirect";

/**
 * The signed-in user, or a redirect to sign-in. Pass `next` (a same-site path)
 * from pages that are a step in a flow — checkout, an order page reached from
 * an email — so signing in lands the user back there instead of on the
 * dashboard. The sign-in page only honours paths
 * that pass safeInternalPath, so this can never become an open redirect.
 */
export async function requireUser(next?: string) {
  const session = await auth();
  if (!session?.user) {
    const dest = safeInternalPath(next);
    redirect(
      dest ? `/auth/signin?next=${encodeURIComponent(dest)}` : "/auth/signin",
    );
  }
  return session.user;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN") redirect("/");
  return session.user;
}

// The single superadmin account. Regular ADMINs can work the queues; only the
// superadmin can manage user accounts (roles, suspension, deletion).
const SUPERADMIN_EMAIL = (
  process.env.SUPERADMIN_EMAIL ?? "admin@thisnthat.com"
).toLowerCase();

export function isSuperadmin(user?: { email?: string | null } | null) {
  return user?.email?.toLowerCase() === SUPERADMIN_EMAIL;
}

export async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN" || !isSuperadmin(session.user)) redirect("/");
  return session.user;
}
