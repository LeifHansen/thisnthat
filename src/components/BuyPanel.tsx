"use client";

import { useState } from "react";
import { formatPrice, type Listing } from "@/lib/types";

// Buy / Make-Offer panel. The actions are stubbed for now (checkout will move
// to Stripe Connect, offers to the offers table) but the full UX is in place.
export function BuyPanel({ listing }: { listing: Listing }) {
  const [mode, setMode] = useState<"idle" | "offer">("idle");
  const [offer, setOffer] = useState("");
  const [done, setDone] = useState<null | string>(null);

  const minOffer = listing.min_offer_cents;

  function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(offer);
    if (!dollars || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    if (minOffer && cents < minOffer) {
      setDone(`Offers must be at least ${formatPrice(minOffer)}.`);
      return;
    }
    setDone(`Offer of ${formatPrice(cents)} sent! The seller will respond soon. (Demo)`);
    setMode("idle");
    setOffer("");
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-3xl font-bold">{formatPrice(listing.price_cents, listing.currency)}</div>
      {listing.allow_offers && (
        <p className="mt-1 text-sm text-zinc-500">
          or make an offer{minOffer ? ` (min ${formatPrice(minOffer)})` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={() => setDone("Checkout via Stripe coming soon. (Demo)")}
          className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Buy now
        </button>

        {listing.allow_offers && mode === "idle" && (
          <button
            onClick={() => setMode("offer")}
            className="w-full rounded-lg border border-zinc-300 py-3 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Make an offer
          </button>
        )}

        {mode === "offer" && (
          <form onSubmit={submitOffer} className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                $
              </span>
              <input
                autoFocus
                type="number"
                min={1}
                step="1"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="Your offer"
                className="w-full rounded-lg border border-zinc-300 bg-transparent py-3 pl-7 pr-3 outline-none focus:border-indigo-500 dark:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-500"
            >
              Send
            </button>
          </form>
        )}
      </div>

      {done && (
        <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {done}
        </p>
      )}
    </div>
  );
}
