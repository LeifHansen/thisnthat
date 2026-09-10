import "server-only";
import { auth } from "@/lib/auth";
import { getMobileUser } from "@/lib/mobileAuth";

/**
 * The caller of an API route, however they authenticated.
 *
 * The web signs in with an Auth.js cookie session; the mobile app carries a
 * bearer token (src/lib/mobileAuth.ts). Routes that both clients need — the
 * ones behind buying, selling and uploading — should ask for the caller here
 * rather than `auth()` directly, so a native client isn't silently treated as
 * a guest on a route that only knows how to read cookies.
 *
 * Both paths re-read the database, so a suspended account is rejected either
 * way: the web through the session callback that strips the user, the app
 * through getMobileUser's own check.
 */
export type RequestUser = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
};

export async function currentUser(req: Request): Promise<RequestUser | null> {
  // Cookie first: it's memoized per request by the cache() around auth(), and
  // trying it first keeps every existing web caller on exactly its old path.
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      email: session.user.email ?? "",
      role: session.user.role,
    };
  }

  const mobile = await getMobileUser(req);
  if (!mobile) return null;
  return { id: mobile.id, email: mobile.email, role: mobile.role };
}
