/**
 * Standalone EasyPost connectivity + rating check.
 *
 * Run it with your key (use the TEST key first — test labels are free):
 *   EASYPOST_API_KEY=EZTK... npx tsx scripts/check-easypost.ts
 *   EASYPOST_API_KEY=EZTK... npx tsx scripts/check-easypost.ts --buy   # also buys a return label
 *
 * What "working" looks like:
 *   - "rated: LIVE" with real-looking inbound/return amounts (not a clean
 *     $8.00 / $16.00) → live rating is reaching EasyPost.
 *   - With --buy, a carrier, tracking number, and a label URL print → the
 *     buy path works too.
 * A thrown error or "rated: FALLBACK" means the app would silently use the
 * flat fallback instead of real EasyPost rates — fix the key/address first.
 *
 * This script talks to EasyPost directly (no app imports) so it runs anywhere.
 */

const key = process.env.EASYPOST_API_KEY;
if (!key) {
  console.error("Set EASYPOST_API_KEY (test key recommended for a first run).");
  process.exit(1);
}
const buyLabel = process.argv.includes("--buy");

// Mirrors src/lib/guards.ts HQ_ADDRESS and src/lib/shipping.ts parcel/auth.
const HQ = {
  name: "Beanie Xchange HQ",
  street1: process.env.HQ_LINE1 ?? "9221 32nd Ave SW",
  city: process.env.HQ_CITY ?? "Seattle",
  state: process.env.HQ_STATE ?? "WA",
  zip: process.env.HQ_POSTAL ?? "98126",
  country: "US",
};
const CUSTOMER = {
  name: "Test Customer",
  street1: "1600 Amphitheatre Pkwy",
  city: "Mountain View",
  state: "CA",
  zip: "94043",
  country: "US",
};
const PARCEL = { weight: 16, length: 9, width: 6, height: 3 }; // ~1 beanie boxed

type Rate = { id: string; rate: string; carrier?: string; service?: string };

async function ep(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.easypost.com/v2${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EasyPost ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

function cheapest(rates: Rate[]): Rate | null {
  let best: Rate | null = null;
  for (const r of rates) {
    if (!best || parseFloat(r.rate) < parseFloat(best.rate)) best = r;
  }
  return best;
}

async function createShipment(to: typeof HQ, from: typeof HQ) {
  return ep("/shipments", {
    shipment: { to_address: to, from_address: from, parcel: PARCEL },
  });
}

async function main() {
  console.log(`Key prefix: ${key!.slice(0, 7)}…  (mode: ${key!.startsWith("EZTK") ? "TEST" : "LIVE/unknown"})`);
  console.log(`HQ origin:  ${HQ.street1}, ${HQ.city}, ${HQ.state} ${HQ.zip}\n`);

  // Inbound: customer -> HQ.  Return: HQ -> customer.
  const [inbound, ret] = await Promise.all([
    createShipment(HQ, CUSTOMER),
    createShipment(CUSTOMER, HQ),
  ]);
  const inRate = cheapest((inbound.rates as Rate[]) ?? []);
  const retRate = cheapest((ret.rates as Rate[]) ?? []);

  if (!inRate || !retRate) {
    console.log("rated: FALLBACK — EasyPost returned no rates (check carrier accounts / address).");
    console.log("inbound rates:", JSON.stringify(inbound.rates));
    process.exit(2);
  }

  console.log("rated: LIVE");
  console.log(`  inbound  (customer -> HQ): $${inRate.rate}  via ${inRate.carrier} ${inRate.service}`);
  console.log(`  return   (HQ -> customer): $${retRate.rate}  via ${retRate.carrier} ${retRate.service}`);
  console.log(`  round trip total: $${(parseFloat(inRate.rate) + parseFloat(retRate.rate)).toFixed(2)}`);

  if (buyLabel) {
    console.log("\nBuying return label (HQ -> customer)…");
    const bought = await ep(`/shipments/${ret.id as string}/buy`, { rate: { id: retRate.id } });
    const sel = bought.selected_rate as { carrier?: string } | undefined;
    const label = bought.postage_label as { label_url?: string } | undefined;
    console.log(`  carrier:  ${sel?.carrier ?? ""}`);
    console.log(`  tracking: ${bought.tracking_code ?? ""}`);
    console.log(`  label:    ${label?.label_url ?? "(none)"}`);
  }
  console.log("\n✓ EasyPost is reachable and rating works.");
}

main().catch((e) => {
  console.error("\n✗ EasyPost check FAILED:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
