/**
 * Render every transactional email to static HTML so the brand and links can
 * be eyeballed (and link-checked) without sending anything.
 *
 *   npm run emails:preview            # writes .email-previews/*.html
 *   SITE_URL=http://localhost:3000 npm run emails:preview
 *
 * Sample data is made up; set PREVIEW_ORDER_ID / PREVIEW_LISTING_ID /
 * PREVIEW_USER_PATH / PREVIEW_UNSUB_TOKEN to point the links at real rows
 * (the link checker in CI-less dev does exactly that against a local server).
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as T from "../src/lib/emailTemplates";
import { absoluteUrl } from "../src/lib/site";

const OUT = path.resolve(process.cwd(), ".email-previews");
const orderId = process.env.PREVIEW_ORDER_ID ?? "clsampleorder000000000001";
const listingId = process.env.PREVIEW_LISTING_ID ?? "clsamplelisting0000000001";
const userPath = process.env.PREVIEW_USER_PATH ?? "/u/sams-closet";
const fromUserId = process.env.PREVIEW_FROM_USER_ID ?? "clsampleuser00000000000001";
const unsubscribeUrl = absoluteUrl(
  `/unsubscribe/${process.env.PREVIEW_UNSUB_TOKEN ?? "sample-token"}`,
);

const samples: Record<string, T.BuiltEmail> = {
  "order-paid-buyer": T.orderPaidBuyer({
    buyerName: "Blake Rivera",
    itemTitle: "Vintage Wrangler denim jacket",
    priceCents: 5300,
    orderId,
  }),
  "order-paid-seller": T.orderPaidSeller({
    sellerName: "Sam",
    itemTitle: "Vintage Wrangler denim jacket",
    priceCents: 4500,
    payoutCents: 4050,
    orderId,
    unsubscribeUrl,
  }),
  "order-shipped-buyer": T.orderShippedBuyer({
    itemTitle: "Vintage Wrangler denim jacket",
    orderId,
    carrier: "USPS",
    trackingNumber: "9400111899223456789012",
    trackingUrl:
      "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
    unsubscribeUrl,
  }),
  "order-completed-seller": T.orderCompletedSeller({
    itemTitle: "Vintage Wrangler denim jacket",
    payoutCents: 4050,
    orderId,
    unsubscribeUrl,
  }),
  "order-refunded-buyer-charged": T.orderRefundedBuyer({
    buyerName: "Blake Rivera",
    itemTitle: "Vintage Wrangler denim jacket",
    amountCents: 5300,
    wasCharged: true,
    orderId,
  }),
  "order-refunded-buyer-hold": T.orderRefundedBuyer({
    buyerName: "Blake Rivera",
    itemTitle: "Vintage Wrangler denim jacket",
    amountCents: 5300,
    wasCharged: false,
    orderId,
  }),
  "offer-received-seller": T.offerReceivedSeller({
    itemTitle: "Vintage Wrangler denim jacket",
    offerCents: 3800,
    listingPriceCents: 4500,
    listingId,
    unsubscribeUrl,
  }),
  "offer-accepted-buyer": T.offerAcceptedBuyer({
    itemTitle: "Vintage Wrangler denim jacket",
    offerCents: 3800,
    listingId,
    unsubscribeUrl,
  }),
  "offer-rejected-buyer": T.offerRejectedBuyer({
    itemTitle: "Vintage Wrangler denim jacket",
    offerCents: 3800,
    listingId,
    unsubscribeUrl,
  }),
  "new-message": T.newMessage({
    fromName: "Sam's Closet",
    preview: "Hi! Yes, it's still available — happy to ship tomorrow if you grab it today.",
    fromUserId,
    unsubscribeUrl,
  }),
  "new-follower": T.newFollower({
    followerName: "Blake & Co.",
    followerPath: userPath,
    unsubscribeUrl,
  }),
  "first-listing-nudge": T.firstListingNudge({ name: "Sam", unsubscribeUrl }),
  welcome: T.welcome({ name: "Sam" }),
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const index: string[] = [];
  for (const [name, built] of Object.entries(samples)) {
    await fs.writeFile(path.join(OUT, `${name}.html`), built.html);
    index.push(
      `<li><a href="./${name}.html">${name}</a> — <code>${built.subject
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</code></li>`,
    );
  }
  await fs.writeFile(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Email previews</title><h1>Email previews</h1><ul>${index.join("")}</ul>`,
  );
  console.log(`Wrote ${Object.keys(samples).length} emails to ${OUT}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
