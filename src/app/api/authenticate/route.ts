import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireStripe } from "@/lib/stripe";
import { advancePaidAuthBatch } from "@/lib/authPayment";
import { computeBatchAuthFees, splitEvenly } from "@/lib/fees";
import { rateInboundShipping, type ShipAddress } from "@/lib/shipping";
import { authenticateSchema, firstError } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const limited = rateLimit(req, "authenticate", 10, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let stripe;
  try {
    stripe = requireStripe();
  } catch {
    return NextResponse.json(
      { error: "Payments not configured (STRIPE_SECRET_KEY missing)." },
      { status: 503 },
    );
  }

  const parsed = authenticateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstError(parsed.error) },
      { status: 400 },
    );
  }
  // In-app BX in-house authentication. BASIC ($5/beanie) is the offered tier:
  // authenticate, attach a "BX Authentic" token to the beanie, and return it
  // heat-sealed with a COA + BX Registry #. Only the INBOUND shipping leg
  // (submitter -> HQ) is rated below (EasyPost) and added to the charge —
  // return shipping is included in the service fee. (True Blue is not handled
  // here — submitters egress from /authenticate straight to truebluebeans.com.)
  const provider = parsed.data.provider;
  const tier = parsed.data.tier;
  const serviceLevel = "FULL_SERVICE" as const;
  const listingId = parsed.data.listingId ?? null;

  // The listingId drives deletes/cancels of that listing's pending submission
  // and binds this request to the listing — it must be the caller's own.
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });
    if (!listing || listing.sellerId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only authenticate your own listing." },
        { status: 403 },
      );
    }
  }

  // Authenticating an existing listing is inherently single-item.
  let beanies = parsed.data.beanies;
  if (listingId && beanies.length > 1) beanies = [beanies[0]];
  const qty = beanies.length;

  const fees = computeBatchAuthFees(provider, tier, qty);

  // A return address is required for in-house BX (we must rate + ship it back).
  const shipAddr: ShipAddress | null = parsed.data.ship ?? null;
  if (!shipAddr) {
    return NextResponse.json(
      { error: "A return address is required." },
      { status: 400 },
    );
  }

  // Inbound shipping (submitter -> HQ) is calculated at checkout from the
  // submitter's address (EasyPost) and added to the service fee. The return
  // leg is included in the price and never charged.
  const rate = await rateInboundShipping(shipAddr, qty);
  const inboundTotal = rate.cents;
  // true = live EasyPost rate; false = flat estimate.
  const shipRated: boolean | null = rate.rated;
  const shipTotal = inboundTotal;
  const inboundAlloc = splitEvenly(inboundTotal, qty);

  // Supersede the caller's own not-yet-paid attempts: an earlier submission for
  // the same listing (which would otherwise trip the unique listingId
  // constraint), and the batch the wizard says it is replacing (the submitter
  // went back from the payment step to edit). Before deleting the stale rows,
  // settle their PaymentIntent with Stripe: if it actually succeeded (the
  // webhook was missed, or they paid in another tab), the earlier submission
  // is a real paid sale — advance it and refuse the retry rather than deleting
  // the record the money points at. Otherwise cancel the old intent so a stale
  // checkout tab can't charge for rows that no longer exist.
  const replaceBatchId = parsed.data.replaceBatchId ?? null;
  const staleMatch: Prisma.AuthenticationRequestWhereInput[] = [];
  if (listingId) staleMatch.push({ listingId });
  if (replaceBatchId) {
    staleMatch.push({ batchId: replaceBatchId, userId: session.user.id });
  }
  if (staleMatch.length > 0) {
    const staleWhere: Prisma.AuthenticationRequestWhereInput = {
      status: "REQUESTED",
      OR: staleMatch,
    };
    const stale = await prisma.authenticationRequest.findMany({
      where: staleWhere,
      select: { stripePaymentIntentId: true },
    });
    const staleIntentIds = new Set(
      stale.flatMap((s) =>
        s.stripePaymentIntentId ? [s.stripePaymentIntentId] : [],
      ),
    );
    const what = listingId
      ? "This listing's authentication"
      : "Your earlier submission";
    for (const intentId of staleIntentIds) {
      try {
        const pi = await stripe.paymentIntents.retrieve(intentId);
        if (pi.status === "succeeded") {
          await advancePaidAuthBatch(pi);
          return NextResponse.json(
            {
              error: `${what} is already paid — check your dashboard for ship-in instructions.`,
            },
            { status: 409 },
          );
        }
        if (pi.status === "processing") {
          return NextResponse.json(
            {
              error: `A payment for ${what.toLowerCase()} is still processing. Give it a minute, then check your dashboard.`,
            },
            { status: 409 },
          );
        }
        if (pi.status !== "canceled") {
          await stripe.paymentIntents.cancel(pi.id);
        }
      } catch {
        // Best-effort: if Stripe can't settle the old intent right now, keep
        // the previous behavior and let the retry proceed.
      }
    }
    await prisma.authenticationRequest.deleteMany({ where: staleWhere });
  }

  // Each beanie is its own request (graded/certified individually) but the
  // whole batch shares one batchId and, once created, one PaymentIntent.
  const batchId = randomUUID();
  let created;
  try {
    created = await prisma.$transaction(
      beanies.map((b, i) =>
        prisma.authenticationRequest.create({
          data: {
            userId: session.user.id,
            serviceLevel,
            provider,
            tier,
            status: "REQUESTED",
            beanieName: b.beanieName,
            description: b.description ?? null,
            condition: b.condition ?? null,
            photos: b.photos ?? [],
            shipName: shipAddr?.name ?? null,
            shipLine1: shipAddr?.line1 ?? null,
            shipLine2: shipAddr?.line2 ?? null,
            shipCity: shipAddr?.city ?? null,
            shipState: shipAddr?.state ?? null,
            shipPostalCode: shipAddr?.postalCode ?? null,
            serviceFeeCents: fees.perBeanieServiceCents[i],
            inboundShipCents: inboundAlloc[i],
            // Return shipping is included in the service fee — never charged.
            outboundShipCents: 0,
            shipRated,
            totalCents: fees.perBeanieServiceCents[i] + inboundAlloc[i],
            batchId,
            // Only the first beanie links to the existing listing (if any).
            listingId: i === 0 ? listingId : null,
          },
        }),
      ),
    );
  } catch (e) {
    // Unique listingId collision: a request for this listing advanced past
    // REQUESTED between our stale-row sweep and the create (e.g. its webhook
    // just landed) — it's live, so don't start a second, competing one.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This listing already has an authentication in progress — check your dashboard.",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  const amountCents = fees.serviceFeeCents + shipTotal;

  const tierLabelText =
    tier === "FULL_GRADING" ? "Full + Grading" : "Basic";
  const summary = `BX Authentication — ${tierLabelText} (in-house) ×${beanies.length}`;

  // No sales tax is collected on this charge (see the note in lib/fees.ts):
  // `amountCents` is the whole amount, and the wizard says so. Shipping is
  // rated from the submitter's address (EasyPost) and included in the charge.
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        // See the note in api/orders/[id]/pay: both AuthWizard and
        // ResumeAuthPayment confirm with `redirect: "if_required"` and no
        // `return_url`, so a redirect-based method reaching the Payment Element
        // is a dead payment button. This intent is immediate-capture, so unlike
        // the escrow intents nothing else filters those methods out — the
        // restriction has to be stated here.
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        // Stripe's own receipt for the charge (live mode). The app's follow-up
        // mail is the prepaid label; this is the record of what was paid.
        receipt_email: session.user.email ?? undefined,
        metadata: {
          batchId,
          kind: "auth",
          provider,
          tier,
          count: String(qty),
        },
        description: summary,
      },
      // The batch rows are already committed at this point, so a network-level
      // retry of this call must resolve to the SAME intent — otherwise the batch
      // is left pointing at one intent while an orphan sits in Stripe holding the
      // submitter's authorization. batchId is minted per submission, so a genuine
      // resubmission still gets its own intent.
      { idempotencyKey: `auth_pi_${batchId}` },
    );
  } catch (e) {
    // Nothing can pay for the rows just written. Remove them rather than leave
    // a "payment not completed" submission on the dashboard for an attempt the
    // submitter never got to see, and let them retry.
    console.error(
      `[authenticate] PaymentIntent creation failed for batch ${batchId}`,
      e,
    );
    await prisma.authenticationRequest
      .deleteMany({ where: { batchId, status: "REQUESTED" } })
      .catch(() => {});
    return NextResponse.json(
      { error: "Couldn't start the payment. Please try again in a moment." },
      { status: 502 },
    );
  }

  await prisma.authenticationRequest.updateMany({
    where: { batchId },
    data: { stripePaymentIntentId: intent.id },
  });

  return NextResponse.json({
    requestId: created[0].id,
    batchId,
    clientSecret: intent.client_secret,
    serviceFeeCents: fees.serviceFeeCents,
    shipCents: shipTotal,
    totalCents: amountCents,
  });
}
