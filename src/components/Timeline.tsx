import type { ReactNode } from "react";
import type { OrderStatus } from "@prisma/client";
import { SITE_NAME } from "@/lib/site";

export type TimelineViewer = "buyer" | "seller" | "admin";

export type TimelineTracking = {
  carrier: string | null;
  number: string | null;
  url: string | null;
};

export type TimelineProps = {
  status: OrderStatus;
  viewer: TimelineViewer;
  placedAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  /** When a cancelled/refunded order ended (its last update). */
  endedAt: Date | null;
  tracking: TimelineTracking | null;
  /** Whether the seller's transfer actually landed (stripeTransferId set). */
  paidOut: boolean;
};

/** "Sep 10, 2026" — the one date format the order page uses. */
export function formatOrderDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type StepState = "done" | "current" | "todo";

/**
 * The order's story in five steps — placed, paid, shipped, delivered, complete
 * — each with the date it happened and a line saying what happens next, worded
 * for whoever is looking (the buyer is told when to confirm receipt; the seller
 * is told what releases their payout). Cancelled and refunded orders keep the
 * steps they reached and end on a marker saying where the money went.
 */
export function Timeline(p: TimelineProps) {
  const ended = p.status === "CANCELLED" || p.status === "REFUNDED";

  // Index of the step in progress; everything before it is done. -1 = none
  // (the order ended), 5 = every step done.
  let current: number;
  let doneThrough = 0;
  if (ended) {
    current = -1;
    doneThrough = p.shippedAt ? 2 : p.paidAt ? 1 : 0;
  } else if (p.status === "PENDING_PAYMENT") {
    current = 1;
  } else if (p.status === "PAID_ESCROW" || p.status === "AWAITING_SHIP_TO_BUYER") {
    current = 2;
  } else if (p.status === "SHIPPED_TO_BUYER") {
    current = p.deliveredAt ? 4 : 3;
  } else {
    current = 5;
  }
  const stateOf = (i: number): StepState => {
    if (ended) return i <= doneThrough ? "done" : "todo";
    if (i < current) return "done";
    if (i === current) return "current";
    return "todo";
  };

  const buyer = p.viewer === "buyer";
  const seller = p.viewer === "seller";

  const track = p.tracking?.number ? (
    <>
      {p.tracking.carrier ? `${p.tracking.carrier} ` : ""}
      <span className="font-mono text-[0.85em] break-all">{p.tracking.number}</span>
      {p.tracking.url && (
        <>
          {" "}
          ·{" "}
          <a
            href={p.tracking.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold !text-[var(--tnt-blue)] underline"
          >
            Track parcel
          </a>
        </>
      )}
    </>
  ) : null;

  const steps: { label: string; date: Date | null; blurb: ReactNode }[] = [
    { label: "Order placed", date: p.placedAt, blurb: buyer ? "Your item was reserved." : "The item was reserved for the buyer." },
    {
      label: "Paid",
      date: p.paidAt,
      blurb:
        stateOf(1) === "done"
          ? `Payment authorized and held by ${SITE_NAME} until delivery.`
          : buyer
            ? "Complete payment below to lock in your item."
            : "Waiting for the buyer's payment.",
    },
    {
      label: "Shipped",
      date: p.shippedAt,
      blurb:
        stateOf(2) === "done"
          ? (track ?? "The seller marked it shipped.")
          : seller
            ? "Pack it up and enter the tracking number below, or buy a label here."
            : buyer
              ? "The seller is packing your order. Tracking is emailed to you the moment it ships."
              : "Waiting for the seller to ship.",
    },
    {
      label: "Delivered",
      date: p.deliveredAt,
      blurb:
        stateOf(3) === "done"
          ? p.deliveredAt
            ? "The carrier reported delivery."
            : "The buyer confirmed receipt."
          : stateOf(3) === "current"
            ? buyer
              ? "On its way. When it arrives, confirm receipt below — that is what releases the seller's payout."
              : "In transit. A carrier delivery scan, or the buyer confirming receipt, releases the payout."
            : "A carrier delivery scan or the buyer's confirmation.",
    },
    {
      label: "Complete",
      date: p.completedAt,
      blurb:
        stateOf(4) === "done"
          ? p.paidOut
            ? seller
              ? "Payout sent to your connected account."
              : "The seller has been paid."
            : seller
              ? "Payment captured. Your payout goes out as soon as payout setup is finished."
              : "Payment released."
          : stateOf(4) === "current"
            ? buyer
              ? "Delivered — confirm receipt below to release the seller's payout."
              : "Delivered. The payout releases when the buyer confirms receipt."
            : seller
              ? "You're paid once delivery is confirmed."
              : "The seller is paid once delivery is confirmed.",
    },
  ];

  return (
    <ol className="relative space-y-4">
      {/* The rail behind the step circles. */}
      <span
        aria-hidden="true"
        className="absolute left-[calc(1.1rem-1.5px)] top-3 bottom-3 w-[3px] bg-[var(--tnt-ink)] opacity-30"
      />
      {steps.map((s, i) => {
        const state = stateOf(i);
        return (
          <li key={s.label} className="relative flex items-start gap-3">
            <span
              className={`tnt-step shrink-0 ${
                state === "done"
                  ? "tnt-step--done"
                  : state === "current"
                    ? "tnt-step--active"
                    : "opacity-60"
              }`}
              aria-label={state}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <div className="min-w-0 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
                <span
                  className={`font-display font-bold ${
                    state === "todo" ? "text-muted" : "text-ink"
                  }`}
                >
                  {s.label}
                </span>
                {s.date && state !== "todo" && (
                  <span className="text-muted text-xs">{formatOrderDate(s.date)}</span>
                )}
              </p>
              <p className={`text-sm ${state === "current" ? "text-ink" : "text-muted"}`}>
                {s.blurb}
              </p>
            </div>
          </li>
        );
      })}
      {ended && (
        <li className="relative flex items-start gap-3">
          <span className="tnt-step shrink-0 !bg-[var(--tnt-neon-pink)]" aria-label="ended">
            ✗
          </span>
          <div className="min-w-0 pt-1">
            <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
              <span className="font-display font-bold text-ink">
                {p.status === "REFUNDED" ? "Refunded" : "Cancelled"}
              </span>
              {p.endedAt && (
                <span className="text-muted text-xs">{formatOrderDate(p.endedAt)}</span>
              )}
            </p>
            <p className="text-sm text-muted">
              {p.status === "REFUNDED"
                ? "The buyer's payment was refunded to their original payment method."
                : "The order was called off. Any payment hold was released, so the buyer was never charged."}
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}
