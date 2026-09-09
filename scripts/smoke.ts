/**
 * End-to-end smoke test (test mode).
 * Exercises: NextAuth login, direct sale checkout + escrow + webhook, and the
 * authentication-service request + payment + webhook.
 *
 *   SMOKE_BASE=http://localhost:3000 npx tsx --env-file=.env scripts/smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const REMOTE = !BASE.includes("localhost");
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function parseCookies(res: Response, jar: Record<string, string>) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
}
const cookieHeader = (j: Record<string, string>) =>
  Object.entries(j)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

async function login(email: string) {
  const jar: Record<string, string> = {};
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  parseCookies(csrfRes, jar);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "password123",
      callbackUrl: BASE,
      json: "true",
    }),
    redirect: "manual",
  });
  parseCookies(res, jar);
  return jar;
}

async function pollStatus(
  table: "order" | "auth",
  id: string,
  from: string,
) {
  for (let i = 0; i < 30; i++) {
    const row =
      table === "order"
        ? await prisma.order.findUnique({ where: { id } })
        : await prisma.authenticationRequest.findUnique({ where: { id } });
    if (row && row.status !== from) return row.status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return from;
}

async function fire(body: object) {
  return fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  // --- Direct sale flow ---
  const buyer = await login("buyer@beaniex.com");
  check(
    "buyer logged in",
    Object.keys(buyer).some((k) => k.includes("session-token")),
  );

  const listing = await prisma.listing.findFirst({
    where: { status: "ACTIVE", authType: "TRUE_BLUE" },
  });
  check("active listing found", Boolean(listing));

  const coRes = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(buyer) },
    body: JSON.stringify({
      listingId: listing!.id,
      ship: {
        name: "Bonnie Buyer",
        line1: "7 Collector Ct",
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
      },
    }),
  });
  const co = (await coRes.json()) as {
    orderId?: string;
    clientSecret?: string;
    error?: string;
  };
  check("checkout created order", Boolean(co.orderId && co.clientSecret), co.error ?? "");

  const piId = co.clientSecret!.split("_secret_")[0];
  const confirmed = await stripe.paymentIntents.confirm(piId, {
    payment_method: "pm_card_visa",
    return_url: BASE,
  });
  check("sale PI authorized", confirmed.status === "requires_capture", confirmed.status);

  if (REMOTE) {
    const s = await pollStatus("order", co.orderId!, "PENDING_PAYMENT");
    check("order -> AWAITING_SHIP_TO_BUYER", s === "AWAITING_SHIP_TO_BUYER", String(s));
  } else {
    await fire({
      type: "payment_intent.amount_capturable_updated",
      data: { object: { id: piId, metadata: { orderId: co.orderId, kind: "sale" } } },
    });
    const o = await prisma.order.findUnique({ where: { id: co.orderId! } });
    check("order -> AWAITING_SHIP_TO_BUYER", o?.status === "AWAITING_SHIP_TO_BUYER", o?.status ?? "");
    check("listing SOLD", (await prisma.listing.findUnique({ where: { id: listing!.id } }))?.status === "SOLD");
  }

  const cap = await stripe.paymentIntents.capture(piId);
  check("escrow capture on receipt", cap.status === "succeeded", cap.status);

  // --- Authentication service flow ---
  const seller = await login("seller@beaniex.com");
  const aRes = await fetch(`${BASE}/api/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(seller) },
    body: JSON.stringify({
      provider: "BX_AUTHENTICATION",
      tier: "FULL_GRADING",
      ship: {
        name: "Smoke Tester",
        line1: "1 Test St",
        city: "Portland",
        state: "OR",
        postalCode: "97201",
      },
      beanies: [{ beanieName: "Smoke Test Bear", condition: "Mint" }],
    }),
  });
  type AuthStart = {
    requestId?: string;
    batchId?: string;
    clientSecret?: string;
    shipCents?: number;
    error?: string;
  };
  const first = (await aRes.json()) as AuthStart;
  check(
    "auth request created",
    Boolean(first.requestId && first.clientSecret && first.batchId),
    first.error ?? "",
  );
  check(
    "inbound shipping charged",
    typeof first.shipCents === "number" && first.shipCents > 0,
    String(first.shipCents),
  );

  // The wizard's "edit details" path: re-submitting with replaceBatchId must
  // cancel the first attempt's PaymentIntent and remove its rows, so nothing
  // lingers on the dashboard as "payment not completed".
  const bRes = await fetch(`${BASE}/api/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(seller) },
    body: JSON.stringify({
      provider: "BX_AUTHENTICATION",
      tier: "FULL_GRADING",
      replaceBatchId: first.batchId,
      ship: {
        name: "Smoke Tester",
        line1: "1 Test St",
        city: "Portland",
        state: "or", // lower-case on purpose: the server normalises it
        postalCode: "97201",
      },
      beanies: [{ beanieName: "Smoke Test Bear", condition: "Mint" }],
    }),
  });
  const a = (await bRes.json()) as AuthStart;
  check("auth request re-created", Boolean(a.requestId && a.clientSecret), a.error ?? "");
  check(
    "superseded request removed",
    (await prisma.authenticationRequest.findUnique({ where: { id: first.requestId! } })) === null,
  );
  const firstPi = await stripe.paymentIntents.retrieve(first.clientSecret!.split("_secret_")[0]);
  check("superseded PaymentIntent canceled", firstPi.status === "canceled", firstPi.status);
  const rows = await prisma.authenticationRequest.findUnique({ where: { id: a.requestId! } });
  check("state normalised to a code", rows?.shipState === "OR", String(rows?.shipState));

  const aPi = a.clientSecret!.split("_secret_")[0];
  const aConf = await stripe.paymentIntents.confirm(aPi, {
    payment_method: "pm_card_visa",
    return_url: BASE,
  });
  check("auth PI paid", aConf.status === "succeeded", aConf.status);

  if (REMOTE) {
    const s = await pollStatus("auth", a.requestId!, "REQUESTED");
    check("auth -> AWAITING_INBOUND", s === "AWAITING_INBOUND", String(s));
  } else {
    await fire({
      type: "payment_intent.succeeded",
      data: { object: { id: aPi, metadata: { batchId: a.batchId, kind: "auth" } } },
    });
    const r = await prisma.authenticationRequest.findUnique({ where: { id: a.requestId! } });
    check("auth -> AWAITING_INBOUND", r?.status === "AWAITING_INBOUND", r?.status ?? "");
    // BX Full + Grading service fee is $20; shipping is rated on top at checkout.
    check("auth full service fee = $20.00", r?.serviceFeeCents === 2000, String(r?.serviceFeeCents));
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
