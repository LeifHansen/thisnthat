"use client";

import { cancelAndRefundOrder } from "@/lib/actions";

/**
 * Admin cancel-and-refund for one order. The action itself decides what
 * "refund" means for the order's status (release the authorization hold on a
 * PENDING_PAYMENT order, refund a captured one), verifies the caller is an
 * admin or the seller, and redirects to the order page with a toast.
 */
export function CancelOrderButton({
  orderId,
  shipped,
}: {
  orderId: string;
  /** Already on its way — the buyer will need to send it back. */
  shipped: boolean;
}) {
  return (
    <form
      action={cancelAndRefundOrder}
      onSubmit={(e) => {
        const msg = shipped
          ? "This order has already shipped. Cancel it and refund the buyer anyway? The seller will need to arrange the return."
          : "Cancel this order and refund the buyer? The unit goes back on sale. This can't be undone.";
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <button
        className="tnt-btn !py-1 !px-2.5 !text-xs !bg-[var(--tnt-red)] !text-white whitespace-nowrap"
        type="submit"
      >
        Cancel &amp; refund
      </button>
    </form>
  );
}
