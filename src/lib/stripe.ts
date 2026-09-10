import Stripe from "stripe";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const key = process.env.STRIPE_SECRET_KEY;

// Lazily constructed so the app can boot (build, non-payment pages) without keys.
const stripe = key
  ? new Stripe(key, {
      // Pinned deliberately, even though it currently equals the version this
      // SDK ships with. stripe-node sends its OWN generated version in the
      // Stripe-Version header when we don't pass one, so `npm update stripe`
      // would silently move every API call — and the shape of every webhook
      // payload we parse — to a new API version as a side effect of a
      // dependency bump. Pinning turns that into a reviewed change: the type is
      // `LatestApiVersion`, so bumping the SDK without revisiting this line
      // fails the build instead of shifting behaviour in production.
      apiVersion: "2026-04-22.dahlia",
      // Names this integration in Stripe's request logs and support tooling.
      appInfo: { name: SITE_NAME, url: SITE_URL },
    })
  : (null as unknown as Stripe);

export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  return stripe;
}
