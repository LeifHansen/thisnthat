"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { stripeFor } from "@/lib/stripeClient";

// Lets a submitter finish paying for an authentication request that was created
// but never completed (status stuck at REQUESTED). Reuses the existing
// PaymentIntent's client secret, so it confirms the same charge the wizard
// started rather than creating a new one. On success the webhook advances the
// request to AWAITING_INBOUND; router.refresh() picks up the new state.

function Inner() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
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
    // Webhook flips REQUESTED -> AWAITING_INBOUND; refresh to reflect it.
    router.refresh();
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      <PaymentElement />
      {err && <p className="text-pink text-sm">{err}</p>}
      <button className="bx-btn w-full" disabled={busy || !stripe} type="submit">
        {busy ? "Processing…" : "Complete payment"}
      </button>
    </form>
  );
}

export function ResumeAuthPayment({
  clientSecret,
  publishableKey,
}: {
  clientSecret: string;
  /** Resolved on the server per request — see lib/stripePublic.ts. */
  publishableKey: string;
}) {
  const stripePromise = stripeFor(publishableKey);
  if (!stripePromise) {
    return (
      <p className="text-pink text-sm">
        Card payments are temporarily unavailable, so this submission can’t be
        completed right now. Please try again shortly.
      </p>
    );
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <Inner />
    </Elements>
  );
}
