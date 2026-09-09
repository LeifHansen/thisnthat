import { z } from "zod";
import { normalizeUsState } from "@/lib/usStates";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { CONDITION_VALUES } from "@/lib/listingOptions";

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

// A photo/image reference: an http(s) URL (R2 uploads, imported images) or a
// root-relative asset path (e.g. the seeded placeholder). Rejects dangerous
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
// the total /api/checkout will compute.
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

// Attribute values arrive as a flat string map; per-category validation
// (options, numeric ranges, unknown keys) happens in validateAttributes()
// once the category is known.
const attributesSchema = z
  .record(z.string().max(40), z.string().trim().max(200))
  .optional()
  .default({});

export const listingSchema = z.object({
  title: z.string().trim().min(1, "Give the listing a title.").max(160),
  categorySlug: z.enum(CATEGORY_SLUGS, { message: "Pick a category." }),
  brand: z.string().trim().max(80).optional().default(""),
  itemName: z.string().trim().max(160).optional().default(""),
  description: z.string().trim().max(4000).optional().default(""),
  condition: z.enum(CONDITION_VALUES, { message: "Pick a condition." }),
  attributes: attributesSchema,
  price: z.coerce.number().positive("Set a price greater than $0.").max(1_000_000),
  // Units available (optional; sellers with multiples list once).
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
  photos: z.array(imageRef).max(12).optional().default([]),
});

// One item inside a lot: free-text name and how many copies the lot includes.
const lotItemSchema = z.object({
  name: z.string().trim().min(1, "Name each item in the lot.").max(160),
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
});

// A lot listing: one title + price + photos for a bundle of several items.
export const lotSchema = z
  .object({
    title: z.string().trim().min(1, "Give the lot a title.").max(160),
    categorySlug: z.enum(CATEGORY_SLUGS, { message: "Pick a category." }),
    description: z.string().trim().max(4000).optional().default(""),
    condition: z.enum(CONDITION_VALUES, { message: "Pick a condition." }),
    price: z.coerce.number().positive("Set a price greater than $0.").max(1_000_000),
    photos: z.array(imageRef).max(12).optional().default([]),
    items: z
      .array(lotItemSchema)
      .min(1, "Add at least one item to the lot.")
      .max(80, "Up to 80 line items per lot."),
  })
  .refine((v) => v.items.reduce((n, it) => n + it.quantity, 0) >= 2, {
    message: "A lot needs at least 2 items in total.",
    path: ["items"],
  });

/** First human-readable error message from a ZodError. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}
