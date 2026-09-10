"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { stripeFor } from "@/lib/stripeClient";

/**
 * Pay for a single existing order (e.g. one created by accepting an offer).
 * Fetches a client secret from /api/orders/[id]/pay, then confirms payment via
 * Stripe Elements. On success the webhook moves the order to awaiting
 * shipment, so we refresh the page to pick up the new status.
 */
export function OrderCheckout({
  orderId,
  token,
  totalLabel,
  publishableKey,
}: {
  orderId: string;
  token?: string;
  totalLabel: string;
  /** Resolved on the server per request — see lib/stripePublic.ts. */
  publishableKey: string;
}) {
  const stripePromise = stripeFor(publishableKey);
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Set once the card is authorized. The order's status only changes when the
  // Stripe webhook lands, so a single refresh usually re-renders this same
  // form — poll a few times instead and show a clear "authorized" state.
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!authorized) return;
    router.refresh();
    const timer = setInterval(() => router.refresh(), 2500);
    const stop = setTimeout(() => clearInterval(timer), 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [authorized, router]);

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token ?? "" }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string; clientSecret?: string });
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Could not start payment.");
      }
      setClientSecret(data.clientSecret);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  if (authorized) {
    return (
      <div className="tnt-panel p-5 space-y-2">
        <h2 className="text-ink">Payment authorized ✓</h2>
        <p className="text-muted text-sm">
          Your card is authorized and your payment is held until you confirm
          delivery. Updating your order status…
        </p>
      </div>
    );
  }

  if (clientSecret && stripePromise) {
    return (
      <div className="tnt-panel p-5 space-y-3">
        <h2 className="text-ink">Pay for your order</h2>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PayForm
            total={totalLabel}
            onPaid={() => setAuthorized(true)}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="tnt-panel p-5 space-y-3">
      <h2 className="text-ink">Payment</h2>
      <p className="text-muted text-sm">
        Your offer was accepted at this price. Authorize payment to reserve the
        item — your payment is held until you confirm delivery, and the seller
        is paid only when the item arrives as described.
      </p>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {!stripePromise ? (
        <p className="text-red-600 text-sm">
          Card payments are temporarily unavailable. Please try again shortly.
        </p>
      ) : (
        <button className="tnt-btn w-full" disabled={busy} onClick={start}>
          {busy ? "Preparing…" : `Continue to Payment — ${totalLabel}`}
        </button>
      )}
    </div>
  );
}

function PayForm({ total, onPaid }: { total: string; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr("");
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setErr(error.message ?? "Payment failed");
      setBusy(false);
      return;
    }
    onPaid();
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement />
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <button className="tnt-btn w-full" disabled={busy || !stripe} type="submit">
        {busy ? "Processing…" : `Authorize ${total}`}
      </button>
    </form>
  );
}
