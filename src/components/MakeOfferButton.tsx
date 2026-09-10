"use client";

import { useState } from "react";
import { formatCents } from "@/lib/fees";
import { FormSubmitButton } from "@/components/FormSubmitButton";

/**
 * Buyer-facing "Make Offer" CTA + inline form.
 *
 * Posts to the `makeOffer` server action passed in by the page. The
 * action handles auth, validation, auto-accept, and redirects. Keeping
 * this as a client component just for the open/close toggle.
 */
export function MakeOfferButton({
  listingId,
  listingPriceCents,
  minAutoAcceptCents,
  makeOffer,
}: {
  listingId: string;
  listingPriceCents: number;
  minAutoAcceptCents: number | null;
  makeOffer: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const max = (listingPriceCents - 1) / 100;
  const suggested = Math.max(1, Math.floor((listingPriceCents * 0.85) / 100));

  return (
    <div className="space-y-2">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tnt-btn tnt-btn--ghost w-full"
        >
          Make an Offer
        </button>
      )}

      {open && (
        <form
          action={makeOffer}
          className="tnt-panel p-4 space-y-3 border border-[var(--tnt-line-strong)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-lg">Make an Offer</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted text-xs hover:!text-ink"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
          <input type="hidden" name="listingId" value={listingId} />
          <label className="block space-y-1">
            <span className="text-sm text-ink">Your offer (USD)</span>
            <input
              name="price"
              type="number"
              step="0.01"
              min="1"
              max={max}
              defaultValue={suggested}
              required
              className="tnt-input"
            />
            <span className="text-muted text-xs">
              Listing is {formatCents(listingPriceCents)}. Offer must be below
              that.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-ink">Message (optional)</span>
            <textarea
              name="message"
              rows={2}
              maxLength={500}
              className="tnt-input"
              placeholder="Why this price? Sellers respond better to context."
            />
          </label>
          {minAutoAcceptCents !== null && minAutoAcceptCents > 0 && (
            <p className="text-xs text-[var(--tnt-red)]">
              Seller auto-accepts offers at or above{" "}
              <b>{formatCents(minAutoAcceptCents)}</b>.
            </p>
          )}
          <FormSubmitButton className="tnt-btn w-full" pendingLabel="Sending…">
            Send Offer
          </FormSubmitButton>
          <p className="text-muted text-xs">
            Offers expire after 7 days. Seller can accept, reject, or counter.
          </p>
        </form>
      )}
    </div>
  );
}
