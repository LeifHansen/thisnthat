// No imports from lib/reviews here: this renders inside client components
// (LoadMoreGrid), and that module carries server actions.
export type SellerRatingData = { avg: number | null; count: number };

/**
 * "★ 4.8 (12)" — a seller's average verified-buyer rating and review count,
 * or "No reviews yet". One component so cards, the listing page and the
 * profile all read the same; `size` only changes the type scale.
 */
export function SellerRating({
  rating,
  size = "sm",
  className = "",
}: {
  rating: SellerRatingData | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const text = size === "md" ? "text-sm" : "text-xs";
  if (!rating || rating.count === 0 || rating.avg === null) {
    return (
      <p className={`text-muted ${text} ${className}`}>No reviews yet</p>
    );
  }
  const avg = Math.round(rating.avg * 10) / 10; // one decimal, as elsewhere
  return (
    <p
      className={`${text} ${className}`}
      aria-label={`Seller rated ${avg} out of 5 from ${rating.count} review${
        rating.count === 1 ? "" : "s"
      }`}
    >
      <span className="text-[#f5a623]" aria-hidden="true">
        ★
      </span>{" "}
      <span className="font-bold text-ink">{avg}</span>{" "}
      <span className="text-muted">
        ({rating.count}
        {size === "md" ? ` review${rating.count === 1 ? "" : "s"}` : ""})
      </span>
    </p>
  );
}
