import { timingSafeEqual } from "node:crypto";
import type { OrderStatus } from "@prisma/client";

/**
 * Constant-time check of a guest checkout token against the one on the order.
 *
 * This token is the sole credential a guest buyer holds: it authorizes viewing
 * the order, paying it, and confirming receipt (which pays the seller). Compared
 * the same way as the other secrets in this codebase (mobile JWT, EasyPost
 * webhook signature) rather than with `===`.
 */
export function guestTokenMatches(
  provided: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (!provided || !stored) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Every order ships direct, seller -> buyer. The buyer's card is authorized at
// checkout and only captured (and the seller paid) once the parcel is
// delivered or the buyer confirms receipt. These are the short status names
// shown in badges and lists; the order page's Timeline tells the fuller story.
export const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "PENDING_PAYMENT", label: "Awaiting payment" },
  { status: "PAID_ESCROW", label: "Paid" },
  { status: "AWAITING_SHIP_TO_BUYER", label: "To ship" },
  { status: "SHIPPED_TO_BUYER", label: "Shipped" },
  { status: "COMPLETED", label: "Complete" },
  { status: "CANCELLED", label: "Cancelled" },
  { status: "REFUNDED", label: "Refunded" },
];

export function statusLabel(s: OrderStatus): string {
  return ORDER_STEPS.find((x) => x.status === s)?.label ?? s.replace(/_/g, " ");
}

/** Badge tone for a status chip (see .tnt-badge--* in globals.css). */
export function statusTone(s: OrderStatus): string {
  switch (s) {
    case "COMPLETED":
      return "tnt-badge--good";
    case "SHIPPED_TO_BUYER":
      return "tnt-badge--on";
    case "CANCELLED":
    case "REFUNDED":
      return "tnt-badge--error";
    case "PENDING_PAYMENT":
      return "tnt-badge--warn";
    default:
      return "";
  }
}
