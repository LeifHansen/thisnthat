import { toggleFollow } from "@/lib/social";

/**
 * Follow / unfollow a collector's store. Server-action form (no client
 * JS); signed-out viewers get a sign-in link back to the profile.
 * Never rendered for the profile's owner — callers guard on `isMe`.
 */
export function FollowButton({
  userId,
  isFollowing,
  signedIn,
  size = "md",
  callbackPath,
}: {
  userId: string;
  isFollowing: boolean;
  signedIn: boolean;
  size?: "sm" | "md";
  callbackPath?: string;
}) {
  const btn =
    size === "sm" ? "!py-1 !px-2.5 text-xs" : "!py-2 !px-4 text-sm";

  if (!signedIn) {
    const next = callbackPath ?? `/u/${userId}`;
    return (
      <a
        href={`/auth/signin?next=${encodeURIComponent(next)}`}
        className={`bx-btn bx-btn--ghost ${btn}`}
        aria-label="Sign in to follow this store"
      >
        + Follow
      </a>
    );
  }

  return (
    <form action={toggleFollow} className="inline-flex">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className={`bx-btn ${isFollowing ? "bx-btn--ghost" : ""} ${btn}`}
        aria-pressed={isFollowing}
        title={isFollowing ? "Unfollow" : "Follow this store"}
      >
        {isFollowing ? "✓ Following" : "+ Follow"}
      </button>
    </form>
  );
}
