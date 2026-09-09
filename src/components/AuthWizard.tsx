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
import { BX_BASIC_FEE_CENTS, computeBatchAuthFees, formatCents } from "@/lib/fees";
import { US_STATES, normalizeUsState } from "@/lib/usStates";
import { PhotoUploader } from "@/components/PhotoUploader";

// In-app checkout for BX in-house authentication (single tier): $5/beanie +
// EasyPost inbound shipping calculated from the submitter's address (return
// shipping is included in the price). The
// beanie comes back authenticated, heat-sealed, with a "BX Authentic" token
// attached and a Certificate of Authenticity + a permanent BX Registry number.
const PROVIDER = "BX_AUTHENTICATION" as const;
const TIER = "BASIC" as const;

type Beanie = {
  key: string;
  beanieName: string;
  condition: string;
  description: string;
  photos: string[];
};

let keySeq = 0;
const emptyBeanie = (): Beanie => ({
  key: `b${keySeq++}`,
  beanieName: "",
  condition: "",
  description: "",
  photos: [],
});

/** Return address prefilled from the submitter's profile (all optional). */
export type AuthShipPrefill = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

// The state field is a <select> of two-letter codes; a profile can hold
// anything ("Washington", "wa"), so map it to a code or leave it unselected.
function stateCodeOrEmpty(raw: string | null | undefined): string {
  const code = normalizeUsState(raw ?? "");
  return US_STATES.some((s) => s.code === code) ? code : "";
}

const ZIP_PATTERN = "\\d{5}(-\\d{4})?";

export function AuthWizard({
  listingId,
  publishableKey,
  prefill,
}: {
  listingId?: string;
  /** Resolved on the server per request — see lib/stripePublic.ts. */
  publishableKey: string;
  prefill?: AuthShipPrefill;
}) {
  const stripePromise = stripeFor(publishableKey);
  // Authenticating an existing listing is single-item; the standalone page
  // supports submitting several beanies together in one shipment.
  const single = !!listingId;
  const [beanies, setBeanies] = useState<Beanie[]>([emptyBeanie()]);
  const [ship, setShip] = useState(() => ({
    name: prefill?.name ?? "",
    line1: prefill?.line1 ?? "",
    line2: prefill?.line2 ?? "",
    city: prefill?.city ?? "",
    state: stateCodeOrEmpty(prefill?.state),
    postalCode: prefill?.postalCode ?? "",
  }));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  // The batch behind the current PaymentIntent. Sent back as replaceBatchId
  // when the submitter edits and re-submits, so the server cancels the
  // superseded intent and rows instead of leaving them on their dashboard.
  const [batchId, setBatchId] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    serviceFeeCents: number;
    shipCents: number;
    totalCents: number;
  } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function setShipField(field: keyof typeof ship, value: string) {
    setShip((s) => ({ ...s, [field]: value }));
  }

  const fees = computeBatchAuthFees(PROVIDER, TIER, beanies.length);

  function update(key: string, patch: Partial<Beanie>) {
    setBeanies((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }
  function addBeanie() {
    setBeanies((bs) => [...bs, emptyBeanie()]);
  }
  function removeBeanie(key: string) {
    setBeanies((bs) => (bs.length > 1 ? bs.filter((b) => b.key !== key) : bs));
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/authenticate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: PROVIDER,
          tier: TIER,
          listingId,
          replaceBatchId: batchId ?? undefined,
          ship: {
            name: ship.name,
            line1: ship.line1,
            line2: ship.line2 || undefined,
            city: ship.city,
            state: ship.state,
            postalCode: ship.postalCode,
          },
          beanies: beanies.map((b) => ({
            beanieName: b.beanieName,
            condition: b.condition || undefined,
            description: b.description || undefined,
            photos: b.photos,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error ?? "Could not start");
      setClientSecret(data.clientSecret);
      setRequestId(data.requestId);
      setBatchId(data.batchId ?? null);
      setQuote({
        serviceFeeCents: data.serviceFeeCents ?? fees.serviceFeeCents,
        shipCents: data.shipCents ?? 0,
        totalCents: data.totalCents ?? fees.serviceFeeCents,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  // Back from the payment step to the form. The form state is untouched, so
  // the submitter fixes the one thing (a ZIP typo, a forgotten beanie) and
  // re-submits; the superseded batch is cancelled server-side on that submit.
  function editDetails() {
    setClientSecret(null);
    setRequestId(null);
    setQuote(null);
    setErr("");
  }

  // Said up front: without Stripe.js there is no payment step, and letting
  // the submitter fill in everything (and the server create a batch and a
  // PaymentIntent) before telling them wastes their time and leaves an
  // unpayable "payment not completed" submission on their dashboard.
  if (!stripePromise) {
    return (
      <p className="bx-panel p-6 text-pink">
        Card payments are temporarily unavailable, so submissions can’t be
        started right now. Please try again shortly.
      </p>
    );
  }

  if (!clientSecret) {
    return (
      <form onSubmit={start} className="space-y-5">
        {/* What you get */}
        <div className="bx-panel bx-panel--accent p-6 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-xl">BX Authentication</p>
            <p className="font-bold text-[var(--bx-red)] text-lg whitespace-nowrap">
              {formatCents(BX_BASIC_FEE_CENTS)} / beanie
            </p>
          </div>
          <p className="text-[var(--bx-red)] text-xs font-semibold">
            In-house · return shipping included
          </p>
          <ul className="text-muted text-sm space-y-1 max-w-md">
            <li>· Authenticated in-house by the Beanie Xchange team</li>
            <li>· Numbered “BX Authentic” token attached to the beanie</li>
            <li>· Returned heat-sealed with a Certificate of Authenticity</li>
            <li>· Permanent BX Registry number — list as BX Authenticated</li>
          </ul>
          <p className="text-muted text-xs">
            Shipping to us is calculated from your address on the payment step
            — return shipping back to you is included. Send all beanies
            together in one package.
          </p>
        </div>

        {beanies.map((b, i) => (
          <div key={b.key} className="bx-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">
                {single ? "Beanie details" : `Beanie ${i + 1}`}
              </span>
              {!single && beanies.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBeanie(b.key)}
                  className="text-muted hover:text-[var(--bx-red)] text-sm font-semibold"
                  aria-label={`Remove beanie ${i + 1}`}
                >
                  Remove ✕
                </button>
              )}
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">Beanie name</span>
              <input
                className="bx-input"
                value={b.beanieName}
                onChange={(e) => update(b.key, { beanieName: e.target.value })}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">Condition</span>
              <input
                className="bx-input"
                value={b.condition}
                onChange={(e) => update(b.key, { condition: e.target.value })}
                placeholder="e.g. Mint w/ tag"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">Description / details</span>
              <textarea
                className="bx-input"
                rows={3}
                value={b.description}
                onChange={(e) => update(b.key, { description: e.target.value })}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">Photos</span>
              <PhotoUploader
                value={b.photos}
                onChange={(photos) => update(b.key, { photos })}
              />
            </label>
          </div>
        ))}

        {!single && (
          <button
            type="button"
            onClick={addBeanie}
            className="bx-btn bx-btn--ghost w-full"
          >
            + Add another beanie
          </button>
        )}

        <div className="bx-panel p-6 space-y-3">
          <span className="text-sm font-semibold text-ink">Return address</span>
          <p className="text-muted text-xs -mt-1">
            We use this to calculate shipping and to send your beanies back.
            US addresses only.
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Full name</span>
            <input
              className="bx-input"
              autoComplete="name"
              value={ship.name}
              onChange={(e) => setShipField("name", e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Address line 1</span>
            <input
              className="bx-input"
              autoComplete="address-line1"
              value={ship.line1}
              onChange={(e) => setShipField("line1", e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Address line 2 (optional)</span>
            <input
              className="bx-input"
              autoComplete="address-line2"
              value={ship.line2}
              onChange={(e) => setShipField("line2", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">City</span>
              <input
                className="bx-input"
                autoComplete="address-level2"
                value={ship.city}
                onChange={(e) => setShipField("city", e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">State</span>
              <select
                className="bx-input"
                autoComplete="address-level1"
                value={ship.state}
                onChange={(e) => setShipField("state", e.target.value)}
                required
              >
                <option value="">Select…</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">ZIP</span>
              <input
                className="bx-input"
                autoComplete="postal-code"
                inputMode="numeric"
                pattern={ZIP_PATTERN}
                title="A 5-digit US ZIP code (ZIP+4 is fine too)"
                value={ship.postalCode}
                onChange={(e) => setShipField("postalCode", e.target.value)}
                required
              />
            </label>
          </div>
        </div>

        <div className="bx-panel p-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted">
              Authentication ({beanies.length}{" "}
              {beanies.length === 1 ? "beanie" : "beanies"} ×{" "}
              {formatCents(BX_BASIC_FEE_CENTS)})
            </span>
            <span className="text-ink">{formatCents(fees.serviceFeeCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Shipping (to BX)</span>
            <span className="text-ink">Calculated from your address</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Return shipping</span>
            <span className="text-ink">Included</span>
          </div>
          <div className="border-t border-[var(--bx-line)] pt-2 flex justify-between font-display text-lg">
            <span>Service subtotal</span>
            <span className="text-[var(--bx-red)] font-semibold">
              {formatCents(fees.serviceFeeCents)}
            </span>
          </div>
          <p className="text-muted text-xs">
            Shipping to us is added on the next step. No sales tax is charged.
          </p>
          {err && <p className="text-pink text-sm">{err}</p>}
          <button className="bx-btn w-full" disabled={busy} type="submit">
            {busy ? "Calculating shipping…" : "Continue to payment"}
          </button>
        </div>
      </form>
    );
  }

  return (
    // Keyed on the intent: editing and re-submitting mints a new one, and the
    // Payment Element must be rebuilt for it rather than reused.
    <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
      <PayForm requestId={requestId!} quote={quote} onBack={editDetails} />
    </Elements>
  );
}

function PayForm({
  requestId,
  quote,
  onBack,
}: {
  requestId: string;
  quote: { serviceFeeCents: number; shipCents: number; totalCents: number } | null;
  onBack: () => void;
}) {
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
    router.push(`/authenticate/${requestId}`);
  }

  return (
    <form onSubmit={pay} className="bx-panel p-6 space-y-4 max-w-lg">
      <h2 className="text-ink text-lg">Payment</h2>
      {quote && (
        <dl className="text-sm space-y-1 border-b border-[var(--bx-line)] pb-3">
          <div className="flex justify-between">
            <dt className="text-muted">Authentication</dt>
            <dd className="text-ink">{formatCents(quote.serviceFeeCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping (to BX)</dt>
            <dd className="text-ink">
              {quote.shipCents > 0 ? formatCents(quote.shipCents) : "Included"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Return shipping</dt>
            <dd className="text-ink">Included</dd>
          </div>
          <div className="flex justify-between font-semibold pt-1">
            <dt>Total</dt>
            <dd className="text-[var(--bx-red)]">
              {formatCents(quote.totalCents)}
            </dd>
          </div>
        </dl>
      )}
      <PaymentElement />
      {err && <p className="text-pink text-sm">{err}</p>}
      <button className="bx-btn w-full" disabled={busy || !stripe} type="submit">
        {busy ? "Processing…" : "Pay & get ship-in instructions"}
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="bx-btn bx-btn--ghost w-full"
      >
        ← Edit beanies or address
      </button>
    </form>
  );
}
