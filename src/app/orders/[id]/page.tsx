import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCents, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { guestTokenMatches, statusLabel, statusTone } from "@/lib/orderState";
import { displayNameOf } from "@/lib/users";
import { sellerPath } from "@/lib/handles";
import { SUPPORT_EMAIL } from "@/lib/site";
import { trackingUrl } from "@/lib/tracking";
import { isEasyPostConfigured, shipFromAddress } from "@/lib/shipping";
import { Timeline, formatOrderDate, type TimelineViewer } from "@/components/Timeline";
import { ConditionBadge } from "@/components/ConditionBadge";
import { CancelOrderPanel } from "@/components/CancelOrderPanel";
import {
  sellerMarkShipped,
  sellerBuyLabel,
  buyerConfirmReceipt,
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
  const isAdmin = user?.role === "ADMIN";
  if (!isBuyer && !isGuestBuyer && !isSeller && !isAdmin) {
    notFound();
  }
  const canConfirm = isBuyer || isGuestBuyer;
  const viewer: TimelineViewer = canConfirm ? "buyer" : isSeller ? "seller" : "admin";

  // The seller nets the sale price minus the platform fee (the fee comes out
  // of their proceeds, not the buyer's total).
  const sellerProceedsCents = order.itemCents - order.platformFeeCents;

  const sellerNeedsToShip =
    isSeller && order.status === "AWAITING_SHIP_TO_BUYER";

  // Cancel + refund. A seller can call off a sale they haven't shipped; after
  // that only an admin can, since a parcel in transit needs adjudicating.
  // (Mirrors SELLER_CANCELLABLE / ADMIN_CANCELLABLE in lib/actions.ts, which
  // enforces this server-side.)
  const TERMINAL: string[] = ["COMPLETED", "REFUNDED", "CANCELLED"];
  const hasShipped = order.status === "SHIPPED_TO_BUYER";
  const canCancel = isSeller
    ? !TERMINAL.includes(order.status) && !hasShipped
    : isAdmin && !TERMINAL.includes(order.status);

  // Whether a buyer's payment is currently held (authorized, not yet captured
  // or undone) — drives the trust line under the totals.
  const paymentHeld =
    order.status === "PAID_ESCROW" ||
    order.status === "AWAITING_SHIP_TO_BUYER" ||
    order.status === "SHIPPED_TO_BUYER";

  // Shipment trail → timeline facts. Events are newest-first; the tracking
  // number on the latest event is the parcel's, and a DELIVERED scan (from the
  // carrier feed) dates the delivered step. Orders shipped before the
  // milestone columns existed fall back to the first event's time.
  const events = order.shipmentEvents;
  const latest = events[0] ?? null;
  const deliveredEvent = events.find((e) => e.status === "DELIVERED") ?? null;
  const labelUrl = events.find((e) => e.labelUrl)?.labelUrl ?? null;
  const tracking = latest?.trackingNumber
    ? {
        carrier: latest.carrier,
        number: latest.trackingNumber,
        url: trackingUrl(latest.carrier, latest.trackingNumber),
      }
    : null;
  const ended = order.status === "CANCELLED" || order.status === "REFUNDED";

  // Label purchase: offered when EasyPost is live and the seller's profile
  // carries a complete ship-from address.
  const labelsAvailable = sellerNeedsToShip && isEasyPostConfigured();
  const shipFrom = labelsAvailable ? shipFromAddress(order.seller) : null;

  const sellerName = displayNameOf(order.seller);
  const buyerName = order.buyer ? displayNameOf(order.buyer) : order.shipName;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-ink text-2xl">Order {order.id.slice(-6)}</h1>
          <span className={`tnt-badge ${statusTone(order.status)}`}>
            {statusLabel(order.status)}
          </span>
        </div>
        <p className="text-muted">
          {order.listing.title} · placed {formatOrderDate(order.createdAt)}
          {isSeller ? ` · sold to ${buyerName}` : ` · sold by ${sellerName}`}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="tnt-panel p-5 space-y-3">
          <h2 className="text-ink">Where it&apos;s at</h2>
          <Timeline
            status={order.status}
            viewer={viewer}
            placedAt={order.createdAt}
            paidAt={order.paidAt}
            shippedAt={order.shippedAt ?? (latest ? events[events.length - 1].createdAt : null)}
            deliveredAt={deliveredEvent?.createdAt ?? null}
            completedAt={order.completedAt ?? (order.status === "COMPLETED" ? order.updatedAt : null)}
            endedAt={ended ? order.updatedAt : null}
            tracking={tracking}
            paidOut={!!order.stripeTransferId}
          />
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
                <div className="border-t-2 border-[var(--tnt-line)] pt-1 flex justify-between font-bold">
                  <span>You receive</span>
                  <span>{formatCents(sellerProceedsCents)}</span>
                </div>
                <p className="text-muted text-xs pt-1">
                  The buyer paid {formatCents(order.shipToBuyerCents)} for
                  shipping, which covers a label bought here.
                  {paymentHeld &&
                    " Their payment is held and released to you once the item is delivered or they confirm receipt."}
                </p>
              </>
            ) : (
              <>
                <Row l="Item" v={formatCents(order.itemCents)} />
                <Row l="Shipping" v={formatCents(order.shipToBuyerCents)} />
                <div className="border-t-2 border-[var(--tnt-line)] pt-1 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCents(order.totalCents)}</span>
                </div>
                {paymentHeld && (
                  <p className="text-muted text-xs pt-1">
                    Your payment is held and only goes to the seller once the
                    item is delivered or you confirm receipt.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="tnt-panel p-5 space-y-1 text-sm">
            <h2 className="text-ink mb-1">
              {isSeller ? "Ship to" : "Delivering to"}
            </h2>
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

      {canConfirm && order.status === "PENDING_PAYMENT" && (
        <OrderCheckout
          orderId={order.id}
          token={isGuestBuyer ? (order.guestToken ?? undefined) : undefined}
          totalLabel={formatCents(order.totalCents)}
          publishableKey={stripePublishableKey()}
        />
      )}

      {sellerNeedsToShip && (
        <div className="tnt-panel p-5 space-y-4">
          <div>
            <h2 className="text-ink">Ship to the buyer</h2>
            <p className="text-muted text-sm">
              Once it&apos;s on its way the buyer gets the tracking number by
              email, and your payout is released when the parcel is delivered or
              they confirm receipt.
            </p>
          </div>

          {labelsAvailable &&
            (shipFrom ? (
              <form
                action={sellerBuyLabel}
                className="rounded-2xl border-[3px] border-[var(--tnt-ink)] bg-[var(--tnt-green-soft)] p-4 space-y-2"
              >
                <input type="hidden" name="orderId" value={order.id} />
                <p className="font-display font-bold">
                  Buy the label here — shipping&apos;s covered
                </p>
                <p className="text-sm">
                  The buyer paid {formatCents(order.shipToBuyerCents)} for
                  shipping, so the cheapest carrier label is bought from that at
                  no cost to you. You get a printable label, and the order is
                  marked shipped with tracking automatically.
                </p>
                <p className="text-xs text-muted">
                  Ships from {shipFrom.line1}, {shipFrom.city}, {shipFrom.state}{" "}
                  {shipFrom.postalCode} ·{" "}
                  <Link href="/dashboard/profile" className="underline !text-ink">
                    change
                  </Link>
                </p>
                <FormSubmitButton
                  className="tnt-btn tnt-btn--green w-full"
                  pendingLabel="Buying label…"
                >
                  Buy label &amp; mark shipped
                </FormSubmitButton>
              </form>
            ) : (
              <p className="rounded-2xl border-[3px] border-dashed border-[var(--tnt-ink)] p-4 text-sm">
                Want the label bought for you, paid from the buyer&apos;s
                shipping?{" "}
                <Link href="/dashboard/profile" className="font-bold underline !text-ink">
                  Add your ship-from address
                </Link>{" "}
                and the button appears here.
              </p>
            ))}

          <form action={sellerMarkShipped} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="font-semibold text-sm">
              {labelsAvailable
                ? "Shipping it yourself? Enter the tracking"
                : "Enter the carrier and tracking number"}
            </p>
            {/* Required: "shipped" unlocks the buyer's confirm-receipt button,
                so it must carry real shipping evidence (enforced server-side too). */}
            <input
              className="tnt-input"
              name="carrier"
              placeholder="Carrier (USPS, UPS, FedEx…)"
              required
            />
            <input
              className="tnt-input"
              name="trackingNumber"
              placeholder="Tracking number"
              required
            />
            <FormSubmitButton
              className={`tnt-btn w-full ${labelsAvailable ? "tnt-btn--ghost" : ""}`}
              pendingLabel="Saving…"
            >
              Mark shipped
            </FormSubmitButton>
          </form>
        </div>
      )}

      {canConfirm && order.status === "SHIPPED_TO_BUYER" && (
        <form
          action={buyerConfirmReceipt}
          className="tnt-panel p-5 space-y-2 !border-[var(--tnt-neon-green)]"
        >
          <h2 className="text-ink">Got it? Confirm receipt</h2>
          <p className="text-muted text-sm">
            {deliveredEvent
              ? `The carrier reported delivery on ${formatOrderDate(deliveredEvent.createdAt)}. `
              : "Your payment stays held until the item arrives. "}
            Confirming releases the seller&apos;s payout, so do it once the item
            is in your hands and as described. Something wrong? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline !text-ink">
              {SUPPORT_EMAIL}
            </a>{" "}
            before confirming.
          </p>
          <input type="hidden" name="orderId" value={order.id} />
          {isGuestBuyer && (
            <input type="hidden" name="token" value={order.guestToken ?? ""} />
          )}
          <FormSubmitButton className="tnt-btn tnt-btn--green w-full" pendingLabel="Releasing payment…">
            Confirm receipt &amp; pay the seller
          </FormSubmitButton>
        </form>
      )}

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
            <>Sold by you to {buyerName}.</>
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

      {events.length > 0 && (
        <div className="tnt-panel p-5 space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-ink">Shipment</h2>
            {labelUrl && (
              <a
                href={labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tnt-btn tnt-btn--ghost !py-1.5 !px-3 !text-xs"
              >
                {isSeller ? "Print label" : "View label"}
              </a>
            )}
          </div>
          {tracking?.url && (
            <p>
              <a
                href={tracking.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold !text-[var(--tnt-blue)] underline"
              >
                Track this parcel
              </a>{" "}
              <span className="text-muted">
                — {tracking.carrier ?? "carrier"}{" "}
                <span className="font-mono text-xs break-all">{tracking.number}</span>
              </span>
            </p>
          )}
          <ul className="space-y-1">
            {events.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <span className="text-muted">
                  <span className="font-semibold text-ink">
                    {s.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                  {s.carrier ? ` · ${s.carrier}` : ""}
                  {s.trackingNumber ? ` · ${s.trackingNumber}` : ""}
                </span>
                <span className="text-muted text-xs">
                  {formatOrderDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canCancel && (
        <CancelOrderPanel
          orderId={order.id}
          shipped={hasShipped}
          role={isSeller ? "seller" : "admin"}
        />
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
              Thanks — your review appears on {sellerName}&apos;s profile and
              listings.
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

      <p className="text-muted text-xs text-center">
        {isGuestBuyer ? (
          <>
            You&apos;re viewing this order as a guest. Bookmark this page —
            it&apos;s your private link to track delivery
            {order.guestEmail ? ` (${order.guestEmail})` : ""}.{" "}
          </>
        ) : null}
        Problem with this order? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline !text-ink">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
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
