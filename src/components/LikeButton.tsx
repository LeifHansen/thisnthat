import { toggleListingLike } from "@/lib/social";

/**
 * Heart toggle for liking a listing. Server-action form with hidden
 * inputs (no client JS); signed-out viewers get a sign-in link that
 * returns them to the listing.
 */
export function LikeButton({
  listingId,
  count,
  likedByMe,
  signedIn,
  size = "md",
}: {
  listingId: string;
  count: number;
  likedByMe: boolean;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "px-2.5 py-1 text-xs gap-1"
      : "px-3.5 py-1.5 text-sm gap-1.5";
  const base = `inline-flex items-center ${btn} rounded-full border-2 border-[var(--bx-ink)] font-bold shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform select-none`;
  const label = (
    <>
      <span aria-hidden className={likedByMe ? "" : "opacity-80"}>
        {likedByMe ? "♥" : "♡"}
      </span>
      <span className="tabular-nums">{count}</span>
    </>
  );

  if (!signedIn) {
    return (
      <a
        href={`/auth/signin?next=${encodeURIComponent(`/listings/${listingId}`)}`}
        className={`${base} bg-white !text-ink`}
        aria-label="Sign in to like this listing"
        title="Sign in to like this listing"
      >
        {label}
      </a>
    );
  }

  return (
    <form action={toggleListingLike} className="inline-flex">
      <input type="hidden" name="listingId" value={listingId} />
      <button
        type="submit"
        className={`${base} ${
          likedByMe
            ? "bg-[var(--bx-red)] !text-white"
            : "bg-white !text-ink"
        }`}
        aria-pressed={likedByMe}
        aria-label={likedByMe ? "Unlike this listing" : "Like this listing"}
        title={likedByMe ? "Unlike" : "Like"}
      >
        {label}
      </button>
    </form>
  );
}
