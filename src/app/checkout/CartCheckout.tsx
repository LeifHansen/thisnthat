"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { stripeFor } from "@/lib/stripeClient";
import { useCart } from "@/lib/cart";
import { computeSaleFees, formatCents } from "@/lib/fees";
import { BasketIcon } from "@/components/BrandIcons";

type Prefill = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};
type CreatedOrder = { id: string; guestToken: string | null };

export function CartCheckout({
  loggedIn,
  email,
  prefill,
  publishableKey,
}: {
  loggedIn: boolean;
  email: string;
  prefill: Prefill;
  /** Resolved on the server per request — see lib/stripePublic.ts. */
  publishableKey: string;
}) {
  const stripePromise = stripeFor(publishableKey);
  const { items, clear, ready } = useCart();
  const [paid, setPaid] = useState(false);
  const [orders, setOrders] = useState<CreatedOrder[]>([]);
  // Set when 3-D Secure didn't finish for part of the cart — the orders exist
  // and some items are authorized, so the buyer needs links, not an error.
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  // Live shipping quote (total cents) once the buyer's ZIP is known; null =
  // flat estimate still showing. Server recomputes authoritatively.
  const [quotedShipCents, setQuotedShipCents] = useState<number | null>(null);
  // Ship/email state lives HERE (not in CheckoutForm): a quote changes the
  // total, which re-keys <Elements> and remounts the form — child-held state
  // would be wiped mid-typing.
  const [guestEmail, setGuestEmail] = useState(email);
  const [ship, setShip] = useState<Prefill>(prefill);

  // Only the destination ZIP and state feed the quote (/api/checkout/rate
  // takes exactly those), so only those invalidate it. Clearing on any field
  // edit stranded the buyer: the re-quote effect below keys on ZIP/state, so
  // after a name or street edit it never refired, the summary fell back to the
  // flat estimate, and the server's consent check then rejected every attempt
  // as a changed total. Resolved here, in the event handler, so the state
  // updater stays pure.
  const updateShip: React.Dispatch<React.SetStateAction<Prefill>> = (v) => {
    const next = typeof v === "function" ? v(ship) : v;
    if (next.postalCode !== ship.postalCode || next.state !== ship.state) {
      setQuotedShipCents(null);
    }
    setShip(next);
  };

  // Quote real shipping once a full ZIP is entered (debounced; stale
  // responses discarded). Failures just leave the flat estimate in place.
  const zip = ship.postalCode.trim();
  const zipValid = /^\d{5}(-\d{4})?$/.test(zip);
  const idsKey = items.map((i) => i.listingId).join(",");
  // Idempotency token for this checkout attempt: the server refuses to charge
  // the same token twice while it has live (non-cancelled) orders. A changed
  // cart composition is a different checkout, so a fresh token is minted
  // whenever the item ids change (state-reset-during-render pattern).
  const [checkoutId, setCheckoutId] = useState(() => crypto.randomUUID());
  const [prevIdsKey, setPrevIdsKey] = useState(idsKey);
  if (prevIdsKey !== idsKey) {
    setPrevIdsKey(idsKey);
    setCheckoutId(crypto.randomUUID());
  }
  useEffect(() => {
    if (!zipValid) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/checkout/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingIds: idsKey.split(","),
            state: ship.state,
            postalCode: zip,
          }),
        });
        const data = await res.json();
        if (!stale && res.ok && typeof data.totalShipCents === "number") {
          setQuotedShipCents(data.totalShipCents);
        }
      } catch {
        /* keep the flat estimate */
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [zip, zipValid, ship.state, idsKey]);

  // Totals (display only — the server recomputes authoritatively at checkout).
  const lines = items.map((i) => ({ item: i, fees: computeSaleFees(i.priceCents) }));
  const itemCents = lines.reduce((s, l) => s + l.fees.itemCents, 0);
  const shipCents =
    quotedShipCents ?? lines.reduce((s, l) => s + l.fees.shipToBuyerCents, 0);
  const totalCents = itemCents + shipCents;

  if (!ready) {
    return <div className="tnt-panel p-10 text-center text-muted">Loading…</div>;
  }

  // Payment (at least partly) succeeded — confirmation with per-order links.
  if (paid) {
    return (
      <div className="max-w-xl mx-auto space-y-5 text-center">
        <h1 className="text-2xl sm:text-3xl">
          {partialWarning ? "Almost done" : "Order confirmed 🎉"}
        </h1>
        {partialWarning ? (
          <p className="rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 px-4 py-3 text-sm text-left">
            {partialWarning} Open each order below to finish paying — anything
            left unpaid is released back to the market automatically.
          </p>
        ) : (
          <p className="text-muted">
            Your payment is authorized and held until you confirm delivery.
            We emailed{loggedIn ? " you" : ` ${email}`} your order details.
          </p>
        )}
        <div className="space-y-2">
          {orders.map((o, i) => (
            <Link
              key={o.id}
              href={o.guestToken ? `/orders/${o.id}?t=${o.guestToken}` : `/orders/${o.id}`}
              className="tnt-btn tnt-btn--ghost w-full"
            >
              {partialWarning ? "Open" : "Track"} order {i + 1} →
            </Link>
          ))}
        </div>
        <Link href="/browse" className="block text-sm font-semibold !text-[var(--tnt-red)]">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto space-y-5 text-center">
        <h1 className="text-2xl sm:text-3xl">Your cart is empty</h1>
        <Link href="/browse" className="tnt-btn inline-flex">
          <BasketIcon className="h-5 w-5" />
          Browse items
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl">Checkout</h1>

      {/* Order summary */}
      <div className="tnt-panel p-5 space-y-2">
        {lines.map(({ item }) => (
          <div key={item.listingId} className="flex justify-between gap-3 text-sm">
            <span className="text-muted line-clamp-1">{item.title}</span>
            <span className="text-ink shrink-0">{formatCents(item.priceCents)}</span>
          </div>
        ))}
        <div className="border-t border-[var(--tnt-line)] pt-2 space-y-1 text-sm">
          <Row label="Items" value={formatCents(itemCents)} />
          <Row
            label={quotedShipCents == null ? "Shipping (estimated)" : "Shipping"}
            value={formatCents(shipCents)}
          />
        </div>
        <div className="border-t border-[var(--tnt-line)] pt-2 flex justify-between font-bold text-[var(--tnt-green)]">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </div>
      </div>

      {stripePromise ? (
        <Elements
          // NOT keyed on the amount: a shipping quote landing mid-typing must
          // not remount the form and wipe the card fields. CheckoutForm calls
          // elements.update({ amount }) to keep the deferred intent in sync.
          stripe={stripePromise}
          options={{
            mode: "payment",
            amount: totalCents,
            currency: "usd",
            capture_method: "manual",
            paymentMethodCreation: "manual",
          }}
        >
          <CheckoutForm
            loggedIn={loggedIn}
            listingIds={items.map((i) => i.listingId)}
            totalCents={totalCents}
            totalLabel={formatCents(totalCents)}
            checkoutId={checkoutId}
            ship={ship}
            setShip={updateShip}
            guestEmail={guestEmail}
            setGuestEmail={setGuestEmail}
            onPaid={(created, warning) => {
              clear();
              setOrders(created);
              setPartialWarning(warning ?? null);
              setPaid(true);
            }}
          />
        </Elements>
      ) : (
        <p className="tnt-panel p-6 text-red-600">
          Card payments are temporarily unavailable. Please try again shortly —
          your cart is saved.
        </p>
      )}
    </div>
  );
}

function CheckoutForm({
  loggedIn,
  listingIds,
  totalCents,
  totalLabel,
  checkoutId,
  onPaid,
  ship,
  setShip,
  guestEmail,
  setGuestEmail,
}: {
  loggedIn: boolean;
  listingIds: string[];
  totalCents: number;
  totalLabel: string;
  checkoutId: string;
  onPaid: (orders: CreatedOrder[], warning?: string | null) => void;
  ship: Prefill;
  setShip: React.Dispatch<React.SetStateAction<Prefill>>;
  guestEmail: string;
  setGuestEmail: (v: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Keep the deferred intent's amount in sync without remounting <Elements>
  // (a remount would wipe the card fields mid-typing on every quote change).
  useEffect(() => {
    elements?.update({ amount: totalCents });
  }, [elements, totalCents]);

  function set<K extends keyof Prefill>(k: K, v: string) {
    setShip((s) => ({ ...s, [k]: v }));
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr("");
    try {
      // Validate + tokenize the card once; the server reuses it per order.
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message ?? "Check your card details.");

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });
      if (pmError || !paymentMethod) {
        throw new Error(pmError?.message ?? "Could not read your card.");
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingIds,
          email: loggedIn ? undefined : guestEmail,
          ship: {
            name: ship.name,
            line1: ship.line1,
            line2: ship.line2,
            city: ship.city,
            state: ship.state,
            postalCode: ship.postalCode,
          },
          paymentMethodId: paymentMethod.id,
          checkoutId,
          // The exact total displayed on the Authorize button — the server
          // refuses to charge anything else.
          expectedTotalCents: totalCents,
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");

      // Any order whose card needs 3-D Secure comes back for on-page handling.
      // A failed/abandoned challenge must NOT throw the orders away: they
      // exist server-side (some may already be authorized), so hand the buyer
      // their order links with a warning instead of a dead end.
      const actions: { orderId: string; clientSecret: string }[] =
        data.requiresAction ?? [];
      let actionWarning: string | null = null;
      for (const a of actions) {
        const { error: actionError } = await stripe.handleNextAction({
          clientSecret: a.clientSecret,
        });
        if (actionError) {
          actionWarning =
            actionError.message ??
            "Card verification didn't finish for part of your order.";
          break;
        }
      }

      onPaid(data.orders ?? [], actionWarning);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Checkout failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} className="tnt-panel p-6 space-y-3">
      <h2 className="text-lg flex items-center gap-2">
        <BasketIcon className="h-6 w-6" />
        Contact &amp; Shipping
      </h2>
      {!loggedIn && (
        <>
          <input
            className="tnt-input"
            type="email"
            placeholder="email (for your order updates)"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            required
          />
          <p className="text-muted text-xs -mt-1 px-1">
            Checking out as a guest.{" "}
            <Link href="/auth/signup" className="!text-[var(--tnt-red)] font-semibold">
              Create an account
            </Link>{" "}
            to save your orders (optional).
          </p>
        </>
      )}
      <input
        className="tnt-input"
        placeholder="full name"
        value={ship.name}
        onChange={(e) => set("name", e.target.value)}
        required
      />
      <input
        className="tnt-input"
        placeholder="address line 1"
        value={ship.line1}
        onChange={(e) => set("line1", e.target.value)}
        required
      />
      <input
        className="tnt-input"
        placeholder="address line 2 (optional)"
        value={ship.line2}
        onChange={(e) => set("line2", e.target.value)}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input
          className="tnt-input col-span-2 sm:col-span-1"
          placeholder="city"
          value={ship.city}
          onChange={(e) => set("city", e.target.value)}
          required
        />
        <input
          className="tnt-input"
          placeholder="state"
          value={ship.state}
          onChange={(e) => set("state", e.target.value)}
          required
        />
        <input
          className="tnt-input"
          placeholder="zip"
          value={ship.postalCode}
          onChange={(e) => set("postalCode", e.target.value)}
          required
        />
      </div>

      <h2 className="text-lg pt-2">Payment</h2>
      <p className="text-muted text-sm">
        Your payment is held until you confirm delivery — each seller is paid
        only when their item is delivered or you confirm it arrived as
        described.
      </p>
      <PaymentElement />
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <button className="tnt-btn w-full" disabled={busy || !stripe} type="submit">
        {busy ? "Processing…" : `Authorize ${totalLabel}`}
      </button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
