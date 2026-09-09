import crypto from "crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { releaseEscrow } from "@/lib/payout";

// EasyPost webhook receiver. EasyPost auto-creates a Tracker for every label
// we buy, and sellerMarkShipped registers one for hand-entered tracking
// numbers (see lib/shipping.ts). It POSTs tracker.created / tracker.updated
// events here as the parcel moves. We append each new carrier status to the
// order's ShipmentEvent trail and act on delivery: a delivered parcel releases
// the buyer's held payment to the seller.
//
// Signature scheme (matches EasyPost's client libraries): the X-Hmac-Signature
// header carries "hmac-sha256-hex=" + HMAC-SHA256(raw body) keyed with the
// NFKD-normalized webhook secret.

type Tracker = {
  object?: string;
  tracking_code?: string;
  status?: string;
  carrier?: string;
};

type EasyPostEvent = {
  description?: string;
  result?: Tracker;
};

function validSignature(raw: string, header: string, secret: string): boolean {
  const digest = crypto
    .createHmac("sha256", Buffer.from(secret.normalize("NFKD"), "utf8"))
    .update(raw, "utf8")
    .digest("hex");
  const expected = Buffer.from(`hmac-sha256-hex=${digest}`);
  const received = Buffer.from(header);
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

export async function POST(req: Request) {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured (EASYPOST_WEBHOOK_SECRET missing)" },
      { status: 503 },
    );
  }
  const sig = req.headers.get("x-hmac-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing X-Hmac-Signature header" },
      { status: 400 },
    );
  }
  const raw = await req.text();
  if (!validSignature(raw, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: EasyPostEvent;
  try {
    event = JSON.parse(raw) as EasyPostEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only tracker events are actionable; ack everything else (batch, refund,
  // payment events) with a 200 so EasyPost doesn't retry or disable us.
  if (!event.description?.startsWith("tracker.")) {
    return NextResponse.json({ received: true });
  }

  const trackingCode = event.result?.tracking_code;
  const trackerStatus = event.result?.status;
  if (!trackingCode || !trackerStatus) {
    return NextResponse.json({ received: true });
  }

  // Trackers can exist for labels bought outside the platform; only act on
  // tracking numbers we know. The latest event carries the order linkage.
  const prior = await prisma.shipmentEvent.findFirst({
    where: { trackingNumber: trackingCode },
    orderBy: { createdAt: "desc" },
  });
  if (!prior) {
    return NextResponse.json({ received: true });
  }
  const { orderId } = prior;

  // Append one trail entry per status change (tracker.updated fires on every
  // carrier scan; repeats of the same status are noise).
  const status = trackerStatus.toUpperCase();
  if (prior.status !== status) {
    await prisma.shipmentEvent.create({
      data: {
        orderId,
        carrier: event.result?.carrier ?? prior.carrier,
        trackingNumber: trackingCode,
        // The label belongs to the parcel, not the scan; carry it along so
        // the newest event still links to it.
        labelUrl: prior.labelUrl,
        status,
      },
    });
  }

  // Parcel delivered: pay the seller. This is the primary release path —
  // waiting on the buyer to press "confirm receipt" stranded sellers, because
  // a manual-capture authorization dies after ~7 days and the payout is then
  // correctly refused. releaseEscrow claims the status transition first, so
  // this and a buyer's click can race safely and exactly one of them pays out.
  //
  // The buyer's button deliberately stays: it is the fallback for parcels
  // that never get a delivery scan, and an early release the buyer may choose.
  if (trackerStatus === "delivered") {
    try {
      await releaseEscrow(orderId);
    } catch (e) {
      // Capture failed (most likely an expired authorization). The order stays
      // SHIPPED_TO_BUYER and retryable; log loudly so it can be chased, and
      // still 200 so EasyPost doesn't retry-storm a problem retries can't fix.
      console.error(
        `easypost webhook: delivery release failed for order ${orderId}`,
        e,
      );
    }
    revalidatePath("/dashboard");
  }

  revalidatePath(`/orders/${orderId}`);

  return NextResponse.json({ received: true });
}
