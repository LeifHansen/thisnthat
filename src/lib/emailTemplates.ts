import { SITE_URL, SITE_NAME, absoluteUrl } from "@/lib/site";
import { formatCents, PLATFORM_FEE_LABEL } from "@/lib/fees";

// Brand tokens mirrored from globals.css (email clients need inline colors).
const PINK = "#e8479a";
const INK = "#201c2b";
const INK_SOFT = "#494357";
const LINE = "#ece5d9";
const SURFACE = "#ffffff";
const PAGE_BG = "#faf6f0";

export type BuiltEmail = { subject: string; html: string };

type LayoutOpts = {
  preheader?: string; // hidden inbox-preview snippet
  cta?: { label: string; url: string };
  unsubscribeUrl?: string;
  unsubscribeLabel?: string; // e.g. "offer notifications"
};

/**
 * Wrap body HTML in the branded shell: logo header, white card, optional CTA
 * button, and a footer with address + one-click unsubscribe. All styling is
 * inline; layout uses tables for Outlook/Gmail compatibility.
 */
export function layout(bodyHtml: string, opts: LayoutOpts = {}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        opts.preheader,
      )}</div>`
    : "";

  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr><td style="border-radius:9999px;background:${PINK};">
           <a href="${opts.cta.url}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:9999px;">${escapeHtml(
             opts.cta.label,
           )}</a>
         </td></tr>
       </table>`
    : "";

  const unsub = opts.unsubscribeUrl
    ? `<br/>You're receiving ${
        opts.unsubscribeLabel ?? "notifications"
      } from ${SITE_NAME}. <a href="${opts.unsubscribeUrl}" style="color:${INK_SOFT};text-decoration:underline;">Manage or unsubscribe</a>.`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td align="center" style="padding:8px 0 20px;">
        <a href="${SITE_URL}" style="text-decoration:none;">
          <img src="${absoluteUrl(
            "/bx-logo.png",
          )}" width="56" height="56" alt="${SITE_NAME}" style="display:block;border:0;"/>
        </a>
      </td></tr>
      <tr><td style="background:${SURFACE};border:1px solid ${LINE};border-radius:16px;padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:15px;line-height:1.55;">
        ${bodyHtml}
        ${cta}
      </td></tr>
      <tr><td style="padding:18px 8px 4px;font-family:Arial,Helvetica,sans-serif;color:${INK_SOFT};font-size:12px;line-height:1.5;text-align:center;">
        ${SITE_NAME} — buy, sell &amp; authenticate Beanie Babies.${unsub}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${INK};">${escapeHtml(
    text,
  )}</h1>`;
}
function p(text: string): string {
  return `<p style="margin:0 0 12px;color:${INK};">${text}</p>`;
}
function muted(text: string): string {
  return `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px;">${text}</p>`;
}

/** A small labeled line item (e.g. "Item: Princess" / "Price: $18.00"). */
function detail(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:${INK_SOFT};font-size:13px;white-space:nowrap;">${escapeHtml(
      label,
    )}</td>
    <td style="padding:4px 0;color:${INK};font-size:14px;font-weight:bold;">${escapeHtml(
      value,
    )}</td>
  </tr>`;
}
function detailBlock(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">${rows
    .map(([l, v]) => detail(l, v))
    .join("")}</table>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Builders — each returns { subject, html } and takes plain data so they're
// trivially unit-testable and previewable. `notify.ts` supplies the data.
// ─────────────────────────────────────────────────────────────────────────

export function orderPaidBuyer(d: {
  buyerName?: string | null;
  itemTitle: string;
  priceCents: number;
  orderId: string;
}): BuiltEmail {
  const body =
    h1("Order confirmed — you're covered by escrow") +
    p(`Hi${d.buyerName ? " " + escapeHtml(d.buyerName.split(" ")[0]) : ""}, your payment is authorized and held safely in escrow. Funds only release to the seller after you confirm the item arrived and is authentic.`) +
    detailBlock([
      ["Item", d.itemTitle],
      ["Total", formatCents(d.priceCents)],
    ]);
  return {
    subject: `Order confirmed: ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Your payment is held in escrow until you confirm delivery.",
      cta: { label: "View your order", url: absoluteUrl(`/orders/${d.orderId}`) },
    }),
  };
}

export function orderPaidSeller(d: {
  sellerName?: string | null;
  itemTitle: string;
  priceCents: number;
  /** Net proceeds after the platform fee — what actually lands in payout. */
  payoutCents: number;
  orderId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("You sold a Beanie! 🎉") +
    p(`${escapeHtml(d.itemTitle)} just sold. The buyer's payment is in escrow — ship it and you'll be paid once they confirm receipt.`) +
    detailBlock([
      ["Item", d.itemTitle],
      ["Sale price", formatCents(d.priceCents)],
      [`Your payout (after ${PLATFORM_FEE_LABEL} fee)`, formatCents(d.payoutCents)],
    ]);
  return {
    subject: `You sold: ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Ship it to get paid — funds are waiting in escrow.",
      cta: { label: "Ship this order", url: absoluteUrl(`/orders/${d.orderId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "order notifications",
    }),
  };
}

export function orderShippedBuyer(d: {
  itemTitle: string;
  orderId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("Your Beanie is on its way 📦") +
    p(`The seller has shipped <strong>${escapeHtml(d.itemTitle)}</strong>. When it arrives, confirm receipt from your order page so the seller gets paid — and so escrow protection stays on your side until then.`);
  return {
    subject: `Shipped: ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Track it and confirm receipt when it lands.",
      cta: { label: "View your order", url: absoluteUrl(`/orders/${d.orderId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "order notifications",
    }),
  };
}

export function orderCompletedSeller(d: {
  itemTitle: string;
  payoutCents: number;
  orderId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("You've been paid 💸") +
    p(`The buyer confirmed receipt of <strong>${escapeHtml(d.itemTitle)}</strong>. Your payout is on its way to your connected account.`) +
    detailBlock([["Payout", formatCents(d.payoutCents)]]);
  return {
    subject: `Paid out: ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Escrow released — your payout is processing.",
      cta: { label: "View order", url: absoluteUrl(`/orders/${d.orderId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "order notifications",
    }),
  };
}

export function offerReceivedSeller(d: {
  itemTitle: string;
  offerCents: number;
  listingPriceCents: number;
  listingId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("New offer on your listing") +
    p(`Someone offered on <strong>${escapeHtml(d.itemTitle)}</strong>. Accept it to turn it into a sale, or let it expire.`) +
    detailBlock([
      ["Their offer", formatCents(d.offerCents)],
      ["Your price", formatCents(d.listingPriceCents)],
    ]);
  return {
    subject: `New offer: ${formatCents(d.offerCents)} for ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Review and accept the offer before it expires.",
      cta: { label: "Review the offer", url: absoluteUrl(`/listings/${d.listingId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "offer notifications",
    }),
  };
}

export function offerAcceptedBuyer(d: {
  itemTitle: string;
  offerCents: number;
  listingId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("Your offer was accepted 🎉") +
    p(`The seller accepted your ${formatCents(d.offerCents)} offer on <strong>${escapeHtml(d.itemTitle)}</strong>. Complete checkout to lock it in — offers can expire, so don't wait too long.`);
  return {
    subject: `Accepted: your offer on ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Check out now to secure your Beanie.",
      cta: { label: "Complete checkout", url: absoluteUrl(`/listings/${d.listingId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "offer notifications",
    }),
  };
}

export function offerRejectedBuyer(d: {
  itemTitle: string;
  offerCents: number;
  listingId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("Your offer wasn't accepted") +
    p(`The seller passed on your ${formatCents(d.offerCents)} offer for <strong>${escapeHtml(d.itemTitle)}</strong>. You can send a new offer or buy it at the listed price.`);
  return {
    subject: `Update on your offer for ${d.itemTitle}`,
    html: layout(body, {
      preheader: "Try a new offer or buy at the listed price.",
      cta: { label: "View listing", url: absoluteUrl(`/listings/${d.listingId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "offer notifications",
    }),
  };
}

export function newMessage(d: {
  fromName: string;
  preview: string;
  fromUserId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const snippet = d.preview.length > 140 ? d.preview.slice(0, 140) + "…" : d.preview;
  const body =
    h1(`New message from ${d.fromName}`) +
    `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${PINK};background:#faf6f0;color:${INK};font-size:14px;">${escapeHtml(
      snippet,
    )}</blockquote>` +
    muted("Reply from your BeanieXchange inbox.");
  return {
    subject: `${d.fromName} sent you a message`,
    html: layout(body, {
      preheader: snippet,
      cta: { label: "Read & reply", url: absoluteUrl(`/messages/${d.fromUserId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "message notifications",
    }),
  };
}

export function newFollower(d: {
  followerName: string;
  followerId: string;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    // h1() escapes its argument; escaping here too rendered "A & B" as "A &amp; B".
    h1(`${d.followerName} followed your store`) +
    p("They'll see your new listings. Keep your store fresh to turn followers into buyers.");
  return {
    subject: `${d.followerName} is now following your store`,
    html: layout(body, {
      preheader: "A collector is following your BeanieXchange store.",
      cta: { label: "View their profile", url: absoluteUrl(`/u/${d.followerId}`) },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "follower notifications",
    }),
  };
}

export function firstListingNudge(d: {
  name?: string | null;
  unsubscribeUrl?: string;
}): BuiltEmail {
  const body =
    h1("Ready to sell your first beanie?") +
    p(
      `Hi${d.name ? " " + escapeHtml(d.name.split(" ")[0]) : ""}, your BeanieXchange account is set up — but your store is still empty. Our guided wizard walks you through your first listing in about two minutes: add photos, let AI draft the details, set your price.`,
    ) +
    p(
      "Payments are held in escrow until the buyer confirms delivery, so you're protected on every sale. Serious collectors are browsing every day.",
    ) +
    muted(
      "Not selling? No problem — this is the only nudge we'll send about it.",
    );
  return {
    subject: "Your BeanieXchange store is still empty 🧸",
    html: layout(body, {
      preheader: "List your first beanie in about two minutes.",
      cta: { label: "List your first beanie", url: absoluteUrl("/sell/first") },
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeLabel: "tips & nudges",
    }),
  };
}

export function orderRefundedBuyer(d: {
  buyerName?: string | null;
  itemTitle: string;
  amountCents: number;
  /** true when a captured charge was refunded; false when only a hold was released. */
  wasCharged: boolean;
  orderId: string;
}): BuiltEmail {
  const body =
    h1("Your order was cancelled") +
    p(
      `${escapeHtml(d.itemTitle)} couldn't be completed, so the order has been cancelled.`,
    ) +
    p(
      d.wasCharged
        ? `We've refunded ${formatCents(d.amountCents)} to your original payment method. Banks usually show it within 5–10 business days.`
        : `You were never charged — the payment hold on your card has been released, and any pending amount will disappear from your statement shortly.`,
    ) +
    muted("Nothing further is needed from you.");
  return {
    subject: "Your BeanieXchange order was cancelled",
    html: layout(body, {
      preheader: d.wasCharged
        ? "Your refund is on its way."
        : "Your payment hold has been released.",
      cta: { label: "View the order", url: absoluteUrl(`/orders/${d.orderId}`) },
    }),
  };
}

export function authInboundLabelSubmitter(d: {
  beanieName: string;
  beanieCount: number;
  labelUrl: string;
  requestId: string;
}): BuiltEmail {
  const many = d.beanieCount > 1;
  const body =
    h1("Your prepaid shipping label is ready 📦") +
    p(
      `Your authentication payment covered postage to us, so here's your prepaid label — print it, attach it, and drop the parcel off. Nothing more to pay.`,
    ) +
    detailBlock([
      [many ? "Beanies" : "Beanie", many ? `${d.beanieCount} in one parcel` : d.beanieName],
      ["Postage", "Prepaid — included in what you paid"],
    ]) +
    muted(
      many
        ? "Send all the beanies in this submission together in one box — the label is sized for the whole batch."
        : "Pack the beanie snugly; a padded mailer or small box is ideal.",
    );
  return {
    subject: "Your prepaid label for BeanieXchange Authentication",
    html: layout(body, {
      preheader: "Print it, attach it, drop it off — postage already paid.",
      cta: { label: "Print your shipping label", url: d.labelUrl },
    }),
  };
}

export function welcome(d: { name?: string | null }): BuiltEmail {
  const body =
    h1("Welcome to BeanieXchange!") +
    p(`Hi${d.name ? " " + escapeHtml(d.name.split(" ")[0]) : ""}, you're all set. Look up what your Beanies are worth in our free database, shop escrow-protected listings, and connect with fellow collectors.`) +
    muted("Every purchase is escrow-protected, and authenticated Beanies carry a permanent BX Registry number.");
  return {
    subject: "Welcome to BeanieXchange 🧸",
    html: layout(body, {
      preheader: "Your account is ready — start collecting.",
      cta: { label: "Explore the marketplace", url: absoluteUrl("/browse") },
    }),
  };
}
