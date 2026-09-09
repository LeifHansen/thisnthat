import { z } from "zod";
import { normalizeUsState } from "@/lib/usStates";

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

// A photo/image reference: an http(s) URL (R2 uploads, imported images) or a
// root-relative asset path (e.g. seeded "/bx-logo.png"). Rejects dangerous
// schemes like javascript:/data: that could become stored XSS when rendered.
const imageRef = z
  .string()
  .trim()
  .max(500)
  .refine(
    (s) => s === "" || /^https?:\/\//i.test(s) || s.startsWith("/"),
    "Photos must be http(s) URLs.",
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  agreedToTerms: z.boolean().refine((v) => v === true, {
    message: "You must agree to the Terms of Service and Privacy Policy.",
  }),
});

const shipSchema = z.object({
  name: z.string().trim().min(1).max(200),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120),
  // Carriers rate against two-letter codes; "wa" or "Washington" used to reach
  // EasyPost verbatim, fail, and silently fall back to the flat estimate.
  state: z.string().trim().min(1).max(60).transform(normalizeUsState),
  postalCode: z.string().trim().min(1).max(20),
});

// Fee quote for the mobile checkout screen: the same listings + address the
// app is about to pay for, priced with live shipping so the total it shows is
// the total /api/checkout will compute. Without it the app could only display
// the flat fallback rate, and every live-rated order would trip the
// expectedTotalCents consent check.
export const checkoutQuoteSchema = z.object({
  listingIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Nothing to price.")
    .max(20, "Too many items in one order."),
  ship: shipSchema,
});

// Multi-item cart checkout. `email` is required for guests (enforced in the
// route once we know whether there's a session); `ship` applies to the whole
// order group.
export const cartCheckoutSchema = z.object({
  listingIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Your cart is empty.")
    .max(20, "Too many items in one order."),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").optional(),
  ship: shipSchema,
  // Stripe PaymentMethod collected client-side (deferred flow). The server
  // authorizes one manual-capture PaymentIntent per order using this method.
  paymentMethodId: z.string().trim().min(1).max(200),
  // Client-minted token for this checkout attempt. A retried/double-clicked
  // POST reuses it, letting the server refuse to charge the same cart twice.
  checkoutId: z.string().trim().min(8).max(64).optional(),
  // The total the buyer saw when they clicked Authorize (integer cents). The
  // server refuses to charge a different amount than was displayed.
  expectedTotalCents: z.coerce.number().int().min(0).optional(),
});

const authBeanieSchema = z.object({
  beanieName: z.string().trim().min(1, "Tell us which beanie this is.").max(160),
  description: z.string().trim().max(4000).optional(),
  condition: z.string().trim().max(200).optional(),
  photos: z.array(z.string().trim().url().max(500)).max(12).optional(),
});

export const authenticateSchema = z.object({
  // True Blue checkout is not processed in-app (submitters egress to
  // truebluebeans.com from /authenticate), so BX in-house is the only
  // provider this endpoint knows about.
  provider: z.enum(["BX_AUTHENTICATION"]).default("BX_AUTHENTICATION"),
  // BX tier. Defaults to Basic.
  tier: z.enum(["BASIC", "FULL_GRADING"]).default("BASIC"),
  // One or more beanies submitted & paid together (bulk pricing applies).
  beanies: z
    .array(authBeanieSchema)
    .min(1, "Add at least one beanie.")
    .max(24, "Submit up to 24 beanies at a time."),
  // Return address — used to rate & buy shipping. Optional so legacy/test
  // callers still work (they fall back to a flat shipping rate).
  ship: shipSchema.optional(),
  // When set, this is authenticating a single existing listing.
  listingId: z.string().trim().min(1).max(64).optional(),
  // The caller's own not-yet-paid batch this submission supersedes: the wizard
  // sends it when the submitter went back from the payment step to edit, so
  // the abandoned attempt (and its PaymentIntent) is cancelled instead of
  // lingering on their dashboard as "payment not completed".
  replaceBatchId: z.string().trim().min(1).max(64).optional(),
});

export const listingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  beanieName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().default(""),
  condition: z.string().trim().min(1).max(200),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  price: z.coerce.number().positive().max(1_000_000),
  // Units available (optional; sellers with multiples list once).
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
  authType: z.enum([
    "TRUE_BLUE",
    "THIRD_PARTY_COA",
    "BX_EXPRESS_COA",
    "BX_FULL_SERVICE",
    "UNAUTHENTICATED",
  ]),
  photos: z.array(imageRef).max(12).optional().default([]),
  coaImageUrl: imageRef.optional().default(""),
  trueBlueCertId: z.string().trim().max(120).optional().default(""),
  // BX Registry number (shown for BX-authenticated listings).
  registrationNumber: z.string().trim().max(120).optional().default(""),
});

// One beanie inside a lot: free-text name (optionally catalogue-linked via
// styleNumber), an optional intro year, and how many copies the lot includes.
const lotItemSchema = z.object({
  beanieName: z.string().trim().min(1, "Name each beanie in the lot.").max(160),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  styleNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
});

// A lot listing: one title + price + photos for a bundle of many beanies. Auth
// is limited to as-is or a third-party COA — per-beanie certs (True Blue / BX)
// don't apply to a mixed bundle.
export const lotSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional().default(""),
    condition: z.string().trim().min(1).max(200),
    price: z.coerce.number().positive().max(1_000_000),
    authType: z
      .enum(["UNAUTHENTICATED", "THIRD_PARTY_COA"])
      .optional()
      .default("UNAUTHENTICATED"),
    coaImageUrl: imageRef.optional().default(""),
    photos: z.array(imageRef).max(12).optional().default([]),
    items: z
      .array(lotItemSchema)
      .min(1, "Add at least one beanie to the lot.")
      .max(80, "Up to 80 line items per lot."),
  })
  .refine((v) => v.items.reduce((n, it) => n + it.quantity, 0) >= 2, {
    message: "A lot needs at least 2 beanies in total.",
    path: ["items"],
  });

/** First human-readable error message from a ZodError. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}
