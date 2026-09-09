import "server-only";
import { prisma } from "@/lib/db";
import { buyInboundLabel, isEasyPostConfigured } from "@/lib/shipping";
import * as notify from "@/lib/notify";

/**
 * Prepaid inbound label for a paid authentication batch.
 *
 * Checkout bills the submitter for the inbound leg (`inboundShipCents`), so we
 * owe them the postage. Before this existed they paid us for shipping and then
 * bought their own on top.
 *
 * One label per batch — a batch is one physical box, so buying per beanie
 * would waste real money. The purchase is claimed batch-wide in a single
 * atomic statement first, so a retried Stripe webhook can never buy postage
 * twice; a failed purchase releases the claim so a later attempt can retry.
 */

/**
 * A claim older than this with no label behind it is treated as abandoned: the
 * process died between claiming and recording the label (deploy, OOM). Without
 * this the batch would be stuck forever with the submitter's postage paid and
 * no label ever bought, since every later attempt sees "already claimed". A
 * real purchase is a couple of seconds, so ten minutes is a wide margin.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

let warnedUnconfigured = false;

export async function ensureInboundLabel(batchId: string): Promise<boolean> {
  const requests = await prisma.authenticationRequest.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
  });
  if (requests.length === 0) return false;

  const first = requests[0];
  // True Blue submissions egress off-platform and are never billed for an
  // inbound leg, so there is nothing owed.
  const owedInbound = requests.some((r) => r.inboundShipCents > 0);
  if (!owedInbound) return false;

  // Need a complete origin address to buy from.
  if (
    !first.shipName ||
    !first.shipLine1 ||
    !first.shipCity ||
    !first.shipState ||
    !first.shipPostalCode
  ) {
    return false;
  }

  // Already bought (the claim below can be re-taken once it goes stale, so
  // the claim flag alone no longer proves there is no label). Matched on the
  // purchase record itself, not on a label URL being present: a purchase
  // that came back without a URL still cost real postage and must never be
  // bought again.
  const existing = await prisma.shipmentEvent.findFirst({
    where: {
      authRequestId: { in: requests.map((r) => r.id) },
      leg: "SUBMITTER_TO_CENTER",
      status: "LABEL_CREATED",
    },
    select: { id: true },
  });
  if (existing) return false;

  // Nothing can be bought without a key. Say so once rather than claiming,
  // failing and logging a purchase error on every page view that retries.
  if (!isEasyPostConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[authLabels] EASYPOST_API_KEY is not set — submitters are billed for inbound postage but no prepaid label can be bought; set the key or send labels by hand.",
      );
    }
    return false;
  }

  // Atomic claim: exactly one caller sees count > 0. A claim that has sat
  // for STALE_CLAIM_MS with no label recorded (checked just above) is
  // re-takeable; the update stamps updatedAt, so a second concurrent taker
  // sees a fresh claim and backs off.
  const claim = await prisma.authenticationRequest.updateMany({
    where: {
      batchId,
      OR: [
        { inboundLabelClaimed: false },
        {
          inboundLabelClaimed: true,
          updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
        },
      ],
    },
    data: { inboundLabelClaimed: true },
  });
  if (claim.count === 0) return false; // being bought right now

  try {
    const bought = await buyInboundLabel(
      {
        name: first.shipName,
        line1: first.shipLine1,
        line2: first.shipLine2,
        city: first.shipCity,
        state: first.shipState,
        postalCode: first.shipPostalCode,
      },
      requests.length,
    );
    if (!bought) throw new Error("EasyPost returned no label");

    await prisma.shipmentEvent.create({
      data: {
        authRequestId: first.id,
        leg: "SUBMITTER_TO_CENTER",
        carrier: bought.carrier,
        trackingNumber: bought.tracking,
        // Null rather than "" when EasyPost sent none, so the submission page
        // doesn't render a "print" button that goes nowhere; the tracking
        // number above still lets an operator find the label in EasyPost.
        labelUrl: bought.labelUrl || null,
        status: "LABEL_CREATED",
      },
    });
    void notify.authInboundLabel(first.id);
    return Boolean(bought.labelUrl);
  } catch (e) {
    // Release the claim so a retry (or an admin) can still get the submitter
    // their label — they have already paid for it.
    await prisma.authenticationRequest.updateMany({
      where: { batchId },
      data: { inboundLabelClaimed: false },
    });
    console.error(
      `authLabels: inbound label purchase failed for batch ${batchId} — submitter was charged and has no label`,
      e,
    );
    return false;
  }
}

/**
 * The prepaid inbound label for a request, resolved across its batch (only the
 * first sibling carries the row). Null when none was bought.
 */
export async function inboundLabelFor(request: {
  id: string;
  batchId: string | null;
}) {
  const ids = request.batchId
    ? (
        await prisma.authenticationRequest.findMany({
          where: { batchId: request.batchId },
          select: { id: true },
        })
      ).map((r) => r.id)
    : [request.id];

  return prisma.shipmentEvent.findFirst({
    where: {
      authRequestId: { in: ids },
      leg: "SUBMITTER_TO_CENTER",
      labelUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
}
