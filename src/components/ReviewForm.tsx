"use client";

import { useState } from "react";
import type { ReviewResult } from "@/lib/reviews";

// Star-rating + comment form shown to the buyer on a COMPLETED order.
// Submits through the submitReview server action; the page revalidates and
// re-renders showing the saved review instead of the form.
export function ReviewForm({
  orderId,
  beanieName,
  submitReview,
}: {
  orderId: string;
  beanieName: string;
  submitReview: (formData: FormData) => Promise<ReviewResult>;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (rating < 1) {
      setErr("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("rating", String(rating));
      fd.append("body", body);
      const res = await submitReview(fd);
      if (!res.ok) setErr(res.error ?? "Couldn't save your review.");
      // On success the server action revalidates the page and the saved
      // review renders in place of this form.
    } catch {
      setErr("Couldn't save your review. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bx-panel p-4 space-y-3">
      <p className="font-display text-sm">How was your {beanieName}?</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl leading-none transition-colors ${
              n <= (hover || rating) ? "text-[#f5a623]" : "text-[var(--bx-line-strong)]"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="bx-input"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Condition as described? Packaging, shipping speed, anything future buyers should know. (Optional)"
      />
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <button type="submit" className="bx-btn !py-2" disabled={busy}>
        {busy ? "Saving…" : "Submit review"}
      </button>
    </form>
  );
}
