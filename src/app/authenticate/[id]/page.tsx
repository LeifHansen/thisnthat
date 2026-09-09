import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, HQ_ADDRESS } from "@/lib/guards";
import { requireStripe } from "@/lib/stripe";
import { advancePaidAuthBatch } from "@/lib/authPayment";
import { formatCents, authServiceLabel } from "@/lib/fees";
import { ResumeAuthPayment } from "@/components/ResumeAuthPayment";
import { RefreshWhilePending } from "@/components/RefreshWhilePending";
import { stripePublishableKey } from "@/lib/stripePublic";
import { ensureInboundLabel, inboundLabelFor } from "@/lib/authLabels";
import { isEasyPostConfigured } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authentication submission",
  robots: { index: false, follow: false },
};

const STEPS: { key: string; label: string; blurb: string }[] = [
  { key: "REQUESTED", label: "Requested", blurb: "Submission created" },
  { key: "AWAITING_INBOUND", label: "Paid", blurb: "Ship your item to the center" },
  { key: "AT_CENTER", label: "Received", blurb: "Item received at the center" },
  { key: "PASSED", label: "Authenticated", blurb: "COA issued" },
  { key: "RETURNED", label: "Returned", blurb: "Item shipped back to you" },
];

function loadRequest(id: string) {
  return prisma.authenticationRequest.findUnique({ where: { id } });
}

export default async function AuthRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A submitter following the link from their email while signed out comes
  // back here after signing in, not to the dashboard.
  const user = await requireUser(`/authenticate/${id}`);
  let r = await loadRequest(id);
  if (!r) notFound();
  if (r.userId !== user.id && user.role !== "ADMIN") notFound();

  // A REQUESTED request was created but never paid for, so it isn't actually in
  // authentication. Re-fetch the original PaymentIntent's client secret so the
  // submitter can finish paying instead of hitting a dead end. Best-effort:
  // skip silently if Stripe is unconfigured or the intent is gone/already done.
  let resumeSecret: string | null = null;
  let triedLabel = false;
  if (r.status === "REQUESTED" && r.stripePaymentIntentId) {
    try {
      const stripe = requireStripe();
      const pi = await stripe.paymentIntents.retrieve(r.stripePaymentIntentId);
      if (pi.status === "succeeded") {
        // Paid, but the webhook that advances the batch never landed — this
        // is the page the wizard sends the submitter to the moment payment
        // confirms, so it is the normal path while the edge blocks Stripe.
        // Self-heal here so they get their ship-in instructions instead of
        // being told the payment didn't complete (and paying twice). The
        // prepaid label is bought before rendering: they paid for it, and
        // a "ship it yourself" fallback here would have them buy postage
        // twice.
        await advancePaidAuthBatch(pi, { label: "await" });
        triedLabel = true;
        r = (await loadRequest(id)) ?? r;
      } else if (pi.status !== "canceled") {
        resumeSecret = pi.client_secret;
      }
    } catch {
      resumeSecret = null;
    }
  }

  // The whole batch: everything submitted and paid together on one card. The
  // charges shown are what that card was charged, not this beanie's share —
  // a three-beanie submission is one payment, not three.
  const siblings = r.batchId
    ? await prisma.authenticationRequest.findMany({
        where: { batchId: r.batchId },
        select: {
          id: true,
          serviceFeeCents: true,
          inboundShipCents: true,
          outboundShipCents: true,
          totalCents: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [r];
  const batchCount = siblings.length;
  const charged = siblings.reduce(
    (acc, s) => ({
      service: acc.service + s.serviceFeeCents,
      ship: acc.ship + s.inboundShipCents + s.outboundShipCents,
      total: acc.total + s.totalCents,
    }),
    { service: 0, ship: 0, total: 0 },
  );
  const owedInbound = siblings.some((s) => s.inboundShipCents > 0);
  const siblingIds = siblings.map((s) => s.id);

  // The prepaid inbound label the submitter was billed for, resolved across
  // the batch (one box, one label, recorded on the first sibling).
  let inboundLabel = await inboundLabelFor({ id: r.id, batchId: r.batchId });
  // True while the label can still be bought but isn't here yet: the webhook
  // advanced the batch a moment ago and its purchase is in flight, or an
  // earlier purchase failed and released its claim. Try once here (claim-
  // guarded, so this never buys a second label), and let the page check back
  // for a purchase someone else is in the middle of.
  let labelPending = false;
  if (
    r.status === "AWAITING_INBOUND" &&
    owedInbound &&
    !inboundLabel?.labelUrl &&
    isEasyPostConfigured()
  ) {
    if (!triedLabel && r.batchId && (await ensureInboundLabel(r.batchId))) {
      inboundLabel = await inboundLabelFor({ id: r.id, batchId: r.batchId });
    }
    labelPending = !inboundLabel?.labelUrl;
  }

  // Shipments for the whole batch: the inbound label and the return shipment
  // are each recorded once, against one sibling, and every beanie in the box
  // should see them.
  const shipmentEvents = await prisma.shipmentEvent.findMany({
    where: { authRequestId: { in: siblingIds } },
    orderBy: { createdAt: "desc" },
  });

  const order = ["REQUESTED", "AWAITING_INBOUND", "AT_CENTER", "PASSED", "RETURNED"];
  const failed = r.status === "FAILED";
  const idx = order.indexOf(r.status === "IN_REVIEW" ? "AT_CENTER" : r.status);
  const shortId = r.id.slice(-6);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl">Authentication {shortId}</h1>
        <p className="text-muted">
          {r.beanieName} · {authServiceLabel(r.serviceLevel, r.provider, r.tier)}
        </p>
        {batchCount > 1 && (
          <p className="text-xs text-muted">
            Part of a {batchCount}-beanie submission — ship all of them together
            in one package.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="bx-panel p-5 space-y-3">
          <h2 className="text-ink">Progress</h2>
          <ol className="space-y-2">
            {STEPS.map((s, i) => {
              const done = idx >= 0 && i < idx;
              const current = order[idx] === s.key;
              return (
                <li key={s.key} className="flex items-start gap-3">
                  <span
                    className={`bx-badge ${
                      current ? "text-yellow" : done ? "text-green" : "text-muted"
                    }`}
                  >
                    {done ? "✓" : current ? "▶" : "•"}
                  </span>
                  <div>
                    <p
                      className={
                        current ? "text-yellow" : done ? "text-green" : "text-muted"
                      }
                    >
                      {s.label}
                    </p>
                    <p className="text-muted text-sm">{s.blurb}</p>
                  </div>
                </li>
              );
            })}
            {failed && (
              <li className="bx-badge text-pink">
                ✗ Did not pass authentication
              </li>
            )}
          </ol>
        </div>

        <div className="bx-panel p-5 space-y-1 text-sm">
          <h2 className="text-ink mb-1">
            Charges{batchCount > 1 ? ` · ${batchCount} beanies` : ""}
          </h2>
          <Row l="Service fee" v={formatCents(charged.service)} />
          <Row
            l="Shipping to BX"
            v={
              r.provider === "TRUE_BLUE"
                ? "Included"
                : charged.ship > 0
                  ? `${formatCents(charged.ship)}${
                      r.shipRated === false ? " (flat rate)" : ""
                    }`
                  : "—"
            }
          />
          <Row l="Return shipping" v="Included" />
          <div className="border-t border-[var(--bx-line)] pt-1 flex justify-between text-yellow">
            <span>Total</span>
            <span>{formatCents(charged.total)}</span>
          </div>
          {batchCount > 1 && (
            <p className="text-muted text-xs pt-1">
              One payment for the whole submission. This beanie&apos;s share is{" "}
              {formatCents(r.totalCents)}.
            </p>
          )}
        </div>
      </div>

      {r.status === "REQUESTED" && (
        <div className="bx-panel p-5 space-y-3 !border-yellow">
          <h2 className="text-yellow">Payment not completed</h2>
          <p className="text-ink text-sm">
            This submission hasn’t been paid for yet, so it hasn’t entered
            authentication. Total{" "}
            <span className="font-semibold">{formatCents(charged.total)}</span>
            {batchCount > 1 ? ` for all ${batchCount} beanies` : ""}. Complete
            payment to get your ship-in instructions.
          </p>
          {resumeSecret ? (
            <ResumeAuthPayment
              clientSecret={resumeSecret}
              publishableKey={stripePublishableKey()}
            />
          ) : (
            <p className="text-muted text-sm">
              This payment session has expired.{" "}
              <Link href="/authenticate/bx" className="text-cyan">
                Start a new submission →
              </Link>
            </p>
          )}
        </div>
      )}

      {r.status === "AWAITING_INBOUND" && (
        <div className="bx-panel p-5 space-y-3 !border-yellow">
          {inboundLabel?.labelUrl ? (
            <>
              <h2 className="text-yellow">Print your prepaid label</h2>
              <p className="text-ink text-sm">
                Your postage to us is already paid for — print this label,
                attach it to the parcel, and drop it off. Nothing more to pay.
              </p>
              <a
                href={inboundLabel.labelUrl}
                target="_blank"
                rel="noreferrer"
                className="bx-btn inline-block"
              >
                Print shipping label
              </a>
              {inboundLabel.trackingNumber && (
                <p className="text-muted text-xs">
                  Tracking: {inboundLabel.trackingNumber}
                  {inboundLabel.carrier ? ` · ${inboundLabel.carrier}` : ""}
                </p>
              )}
              {batchCount > 1 && (
                <p className="text-muted text-xs">
                  One label covers the whole submission — send all{" "}
                  {batchCount} beanies together in one box.
                </p>
              )}
              <p className="text-muted text-sm">
                Include a note with your authentication ID{" "}
                <span className="text-cyan">{shortId}</span> in the package.
              </p>
            </>
          ) : owedInbound ? (
            <>
              {labelPending && <RefreshWhilePending />}
              <h2 className="text-yellow">
                {labelPending
                  ? "Preparing your prepaid label…"
                  : "Your prepaid label is on its way"}
              </h2>
              <p className="text-ink text-sm">
                Postage to us was included in your payment, so there’s nothing
                more to buy.{" "}
                {labelPending
                  ? "Your label usually appears here within a few seconds — this page checks back on its own — and we’ll email it to you as well."
                  : "We’ll email your prepaid label to you, and it will appear here as soon as it’s ready."}
              </p>
              <p className="text-muted text-sm">
                It ships to {HQ_ADDRESS.name}, {HQ_ADDRESS.line1},{" "}
                {HQ_ADDRESS.city}, {HQ_ADDRESS.state} {HQ_ADDRESS.postalCode}.
                Include a note with your authentication ID{" "}
                <span className="text-cyan">{shortId}</span> in the package.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-yellow">Ship your item to the center</h2>
              <p className="text-ink text-sm">{HQ_ADDRESS.name}</p>
              <p className="text-ink text-sm">{HQ_ADDRESS.line1}</p>
              <p className="text-ink text-sm">
                {HQ_ADDRESS.city}, {HQ_ADDRESS.state} {HQ_ADDRESS.postalCode}
              </p>
              <p className="text-muted text-sm pt-2">
                Include your authentication ID{" "}
                <span className="text-cyan">{shortId}</span> in the
                package.
              </p>
            </>
          )}
        </div>
      )}

      {r.status === "PASSED" || r.status === "RETURNED" ? (
        <div className="bx-panel p-5 space-y-1 !border-yellow">
          <h2 className="text-yellow">
            ✦ Beanie Xchange Certificate of Authenticity
          </h2>
          {r.bxCertId && <p className="text-cyan">Cert #: {r.bxCertId}</p>}
          {r.grade && (
            <p className="text-ink">
              Overall grade: <span className="font-semibold">{r.grade}</span>/10
            </p>
          )}
          <GradeBreakdown scores={r.gradeScores} />
          {r.registrationNumber && (
            <p className="text-ink">
              Registry #:{" "}
              <Link
                href={`/registry?n=${r.registrationNumber}`}
                className="text-cyan"
              >
                {r.registrationNumber}
              </Link>
            </p>
          )}
          {r.reviewNotes && (
            <p className="text-muted text-sm">{r.reviewNotes}</p>
          )}
        </div>
      ) : null}

      {shipmentEvents.length > 0 && (
        <div className="bx-panel p-5 space-y-1 text-sm">
          <h2 className="text-ink">Shipments</h2>
          {shipmentEvents.map((s) => (
            <p key={s.id} className="text-muted">
              {s.leg.replace(/_/g, " ")} · {s.carrier || "carrier?"} ·{" "}
              {s.trackingNumber || "no tracking"}
              {s.labelUrl && (
                <>
                  {" · "}
                  <a
                    href={s.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan"
                  >
                    Print label
                  </a>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      <Link href="/dashboard" className="text-sm">
        ← Back to dashboard
      </Link>
    </div>
  );
}

const GRADE_LABELS: Record<string, string> = {
  swingTag: "Swing tag",
  tushTag: "Tush tag",
  fabric: "Fabric",
  fill: "Fill / shape",
  cleanliness: "Cleanliness",
};

function GradeBreakdown({ scores }: { scores: unknown }) {
  if (!scores || typeof scores !== "object") return null;
  const entries = Object.entries(scores as Record<string, unknown>).filter(
    ([k, v]) => k in GRADE_LABELS && typeof v === "number",
  );
  if (entries.length === 0) return null;
  return (
    <div className="pt-1 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="rounded-lg bg-[var(--bx-surface)] border border-[var(--bx-line)] px-2 py-1"
        >
          <span className="block text-muted">{GRADE_LABELS[k]}</span>
          <span className="text-ink font-semibold">{v as number}/10</span>
        </div>
      ))}
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
