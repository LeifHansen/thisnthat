import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCents, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { guestTokenMatches, statusLabel } from "@/lib/orderState";
import { displayNameOf } from "@/lib/users";
import { sellerPath } from "@/lib/handles";
import { Timeline } from "@/components/Timeline";
import { ConditionBadge } from "@/components/ConditionBadge";
import {
  sellerMarkShipped,
  buyerConfirmReceipt,
  cancelAndRefundOrder,
} from "@/lib/actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { submitReview } from "@/lib/reviews";
import { ReviewForm } from "@/components/ReviewForm";
import { OrderCheckout } from "./OrderCheckout";
import { stripePublishableKey } from "@/lib/stripePublic";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;
  const session = await auth();
  const user = session?.user ?? null;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      listing: { include: { category: { select: { name: true } } } },
      seller: true,
      buyer: true,
      shipmentEvents: { orderBy: { createdAt: "desc" } },
      review: true,
    },
  });
  if (!order) notFound();

  // Access: the account buyer/seller, an admin, or a guest holding the
  // order's secret token (the link emailed at checkout).
  const isBuyer = !!user && !!order.buyerId && order.buyerId === user.id;
  const isGuestBuyer = guestTokenMatches(token, order.guestToken);
  const isSeller = !!user && order.sellerId === user.id;
  if (!isBuyer && !isGuestBuyer && !isSeller && user?.role !== "ADMIN") {
    notFound();
  }
  // The seller nets the sale price minus the platform fee (the fee comes out
  // of their proceeds, not the buyer's total).
  const sellerProceedsCents = order.itemCents - order.platformFeeCents;
  const canConfirm = isBuyer || isGuestBuyer;

  const sellerNeedsToShip =
    isSeller && order.status === "AWAITING_SHIP_TO_BUYER";

  // Cancel + refund. A seller can call off a sale they haven't shipped; after
  // that only an admin can, since a parcel in transit needs adjudicating.
  // (Mirrors SELLER_CANCELLABLE / ADMIN_CANCELLABLE in lib/actions.ts, which
  // enforces this server-side.)
  const isAdmin = user?.role === "ADMIN";
  const TERMINAL: string[] = ["COMPLETED", "REFUNDED", "CANCELLED"];
  const canCancel = isSeller
    ? !TERMINAL.includes(order.status) && order.status !== "SHIPPED_TO_BUYER"
    : isAdmin && !TERMINAL.includes(order.status);
  const hasShipped = order.status === "SHIPPED_TO_BUYER";

  // Whether a buyer's payment is currently held (authorized, not yet captured
  // or undone) — drives the trust line under the totals.
  const paymentHeld =
    order.status === "PAID_ESCROW" ||
    order.status === "AWAITING_SHIP_TO_BUYER" ||
    order.status === "SHIPPED_TO_BUYER";

  const sellerName = displayNameOf(order.seller);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl">Order {order.id.slice(-6)}</h1>
        <p className="text-muted">
          {order.listing.title} — {statusLabel(order.status)}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="tnt-panel p-5 space-y-3">
          <h2 className="text-ink">Progress</h2>
          <Timeline status={order.status} />
        </div>

        <div className="space-y-4">
          <div className="tnt-panel p-5 space-y-1">
            <h2 className="text-ink mb-1">
              {isSeller ? "Your payout" : "Totals"}
            </h2>
            {isSeller ? (
              <>
                <Row l="Sale price" v={formatCents(order.itemCents)} />
                <Row
                  l={`Platform fee (${PLATFORM_FEE_LABEL})`}
                  v={`− ${formatCents(order.platformFeeCents)}`}
                />
                <div className="border-t border-[var(--tnt-line)] pt-1 flex justify-between text-yellow">
                  <span>You receive</span>
                  <span>{formatCents(sellerProceedsCents)}</span>
                </div>
                <p className="text-muted text-xs pt-1">
                  The buyer separately paid{" "}
                  {formatCents(order.shipToBuyerCents)} shipping.
                  {paymentHeld &&
                    " Their payment is held and released to you once the item is delivered or they confirm receipt."}
                </p>
              </>
            ) : (
              <>
                <Row l="Item" v={formatCents(order.itemCents)} />
                <Row l="Shipping" v={formatCents(order.shipToBuyerCents)} />
                <div className="border-t border-[var(--tnt-line)] pt-1 flex justify-between text-yellow">
                  <span>Total</span>
                  <span>{formatCents(order.totalCents)}</span>
                </div>
                {paymentHeld && (
                  <p className="text-muted text-xs pt-1">
                    Your payment is held until you confirm delivery.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="tnt-panel p-5 space-y-1 text-sm">
            <h2 className="text-ink mb-1">Ship to buyer</h2>
            <p className="text-muted">{order.shipName}</p>
            <p className="text-muted">{order.shipLine1}</p>
            {order.shipLine2 && (
              <p className="text-muted">{order.shipLine2}</p>
            )}
            <p className="text-muted">
              {order.shipCity}, {order.shipState} {order.shipPostalCode}
            </p>
          </div>
        </div>
      </div>

      <div className="tnt-panel p-5 space-y-2">
        <h2 className="text-ink">Item</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/listings/${order.listing.id}`}
            className="font-semibold !text-ink hover:opacity-80"
          >
            {order.listing.title}
          </Link>
          <ConditionBadge condition={order.listing.condition} />
          <span className="text-muted text-sm">{order.listing.category.name}</span>
        </div>
        <p className="text-muted text-sm">
          {isSeller ? (
            <>Sold by you.</>
          ) : (
            <>
              Sold by{" "}
              <Link href={sellerPath(order.seller)} className="!text-ink font-semibold">
                {sellerName}
              </Link>
              .
            </>
          )}
        </p>
      </div>

      {order.shipmentEvents.length > 0 && (
        <div className="tnt-panel p-5 space-y-2 text-sm">
          <h2 className="text-ink">Shipment</h2>
          <ul className="space-y-1">
            {order.shipmentEvents.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <span className="text-muted">
                  <span className="font-semibold text-ink">
                    {s.status.replace(/_/g, " ")}
                  </span>{" "}
                  · {s.carrier || "carrier not set"} ·{" "}
                  {s.trackingNumber || "no tracking number"}
                  {s.labelUrl && (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={s.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="!text-[var(--tnt-green)] font-semibold"
                      >
                        Label
                      </a>
                    </>
                  )}
                </span>
                <span className="text-muted text-xs">
                  {s.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canConfirm && order.status === "PENDING_PAYMENT" && (
        <OrderCheckout
          orderId={order.id}
          token={isGuestBuyer ? (order.guestToken ?? undefined) : undefined}
          totalLabel={formatCents(order.totalCents)}
          publishableKey={stripePublishableKey()}
        />
      )}

      {sellerNeedsToShip && (
        <div className="tnt-panel p-5 space-y-3">
          <h2 className="text-ink">Ship to the buyer</h2>
          <p className="text-muted text-sm">
            Enter the carrier and tracking number once the parcel is on its
            way. Delivery scans release your payout automatically; the buyer
            can also confirm receipt.
          </p>
          <form action={sellerMarkShipped} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            {/* Required: "shipped" unlocks the buyer's confirm-receipt button,
                so it must carry real shipping evidence (enforced server-side too). */}
            <input
              className="tnt-input"
              name="carrier"
              placeholder="carrier (USPS, UPS…)"
              required
            />
            <input
              className="tnt-input"
              name="trackingNumber"
              placeholder="tracking number"
              required
            />
            <button className="tnt-btn w-full" type="submit">
              Mark Shipped
            </button>
          </form>
        </div>
      )}

      {canConfirm && order.status === "SHIPPED_TO_BUYER" && (
        <form action={buyerConfirmReceipt} className="tnt-panel p-5 space-y-2">
          <h2 className="text-ink">Received your item?</h2>
          <p className="text-muted text-sm">
            Your payment is held until you confirm delivery. Confirming pays
            the seller.
          </p>
          <input type="hidden" name="orderId" value={order.id} />
          {isGuestBuyer && (
            <input type="hidden" name="token" value={order.guestToken ?? ""} />
          )}
          <button className="tnt-btn w-full" type="submit">
            Confirm Receipt &amp; Pay the Seller
          </button>
        </form>
      )}

      {canCancel && (
        <details className="tnt-panel p-5 space-y-2">
          <summary className="cursor-pointer font-semibold text-ink">
            Cancel this order
          </summary>
          <p className="text-muted text-sm mt-2">
            {hasShipped
              ? "This order has already shipped — only cancel once you've sorted out where the item is. The buyer gets their money back either way: we release the payment hold, or refund it if it has already been taken."
              : "The buyer's payment is held but not taken. Cancelling releases that hold — so they're never charged — and puts the item back on the market."}
          </p>
          <form action={cancelAndRefundOrder} className="pt-1">
            <input type="hidden" name="orderId" value={order.id} />
            <FormSubmitButton
              className="tnt-btn tnt-btn--ghost w-full"
              pendingLabel="Cancelling…"
            >
              {hasShipped
                ? "Cancel & return the buyer's money"
                : "Cancel order & release the hold"}
            </FormSubmitButton>
          </form>
        </details>
      )}

      {/* Verified-buyer review: account buyers only (guests have no account
          to attach a review to), once the order is COMPLETED. */}
      {isBuyer && order.status === "COMPLETED" && (
        order.review ? (
          <div className="tnt-panel p-5 space-y-2">
            <h2 className="text-ink">Your review</h2>
            <p aria-label={`${order.review.rating} out of 5 stars`} className="text-[#f5a623] text-lg leading-none">
              {"★".repeat(order.review.rating)}
              <span className="text-[var(--tnt-line-strong)]">
                {"★".repeat(5 - order.review.rating)}
              </span>
            </p>
            {order.review.body && (
              <p className="text-sm whitespace-pre-wrap">{order.review.body}</p>
            )}
            <p className="text-muted text-xs">
              Thanks — your review appears on {sellerName}&apos;s profile.
            </p>
          </div>
        ) : (
          <ReviewForm
            orderId={order.id}
            itemTitle={order.listing.title}
            submitReview={submitReview}
          />
        )
      )}

      {isGuestBuyer && (
        <p className="text-muted text-xs text-center">
          You&apos;re viewing this order as a guest. Bookmark this page — it&apos;s
          your private link to track delivery
          {order.guestEmail ? ` (${order.guestEmail})` : ""}.
        </p>
      )}
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{l}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}
