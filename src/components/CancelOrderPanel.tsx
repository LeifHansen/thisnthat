"use client";

import { cancelAndRefundOrder } from "@/lib/actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";

/**
 * Seller-side (and admin) cancel + refund on the order page. The action
 * decides what "refund" means for the order's state — release the hold on a
 * never-captured payment, refund a captured one — and re-checks who may cancel
 * (a seller only before shipping; an admin at any point before completion).
 * The confirm dialog is the only client-side bit.
 */
export function CancelOrderPanel({
  orderId,
  shipped,
  role,
}: {
  orderId: string;
  /** Already on its way — the buyer will need to send it back. */
  shipped: boolean;
  role: "seller" | "admin";
}) {
  const explain = shipped
    ? "This order has already shipped — only cancel once you've sorted out where the item is. The buyer gets their money back either way: the payment hold is released, or the charge is refunded if it has already been taken."
    : role === "seller"
      ? "Can't fulfil this one? Cancelling releases the buyer's payment hold (they are never charged), tells them by email, and puts the item back on sale. Cancelling a lot of orders hurts your rating with buyers, so use it sparingly."
      : "Cancelling releases the buyer's payment hold — they are never charged — and puts the item back on the market. The buyer is emailed either way.";
  const confirmMsg = shipped
    ? "This order has already shipped. Cancel it and refund the buyer anyway? The seller will need to arrange the return."
    : "Cancel this order and give the buyer their money back? The item goes back on sale. This can't be undone.";

  return (
    <details className="tnt-panel p-5">
      <summary className="cursor-pointer font-display font-bold text-ink">
        Need to cancel this order?
      </summary>
      <p className="text-muted text-sm mt-2">{explain}</p>
      <form
        action={cancelAndRefundOrder}
        className="pt-3"
        onSubmit={(e) => {
          if (!confirm(confirmMsg)) e.preventDefault();
        }}
      >
        <input type="hidden" name="orderId" value={orderId} />
        <FormSubmitButton
          className="tnt-btn tnt-btn--ghost w-full"
          pendingLabel="Cancelling…"
        >
          {shipped
            ? "Cancel & refund the buyer"
            : "Cancel order & release the buyer's payment"}
        </FormSubmitButton>
      </form>
    </details>
  );
}
