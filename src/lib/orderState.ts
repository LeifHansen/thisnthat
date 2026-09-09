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
// delivered or the buyer confirms receipt — which is what the timeline on the
// order page walks through.
export const ORDER_STEPS: { status: OrderStatus; label: string; blurb: string }[] = [
  { status: "PENDING_PAYMENT", label: "Payment", blurb: "Awaiting payment authorization" },
  { status: "PAID_ESCROW", label: "Paid", blurb: "Payment held until delivery" },
  { status: "AWAITING_SHIP_TO_BUYER", label: "Ship", blurb: "Seller ships to the buyer" },
  { status: "SHIPPED_TO_BUYER", label: "Shipped", blurb: "On its way to the buyer" },
  { status: "COMPLETED", label: "Complete", blurb: "Delivered & seller paid" },
];

export function statusLabel(s: OrderStatus): string {
  return ORDER_STEPS.find((x) => x.status === s)?.label ?? s.replace(/_/g, " ");
}
