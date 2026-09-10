# Beanie Scanner — implementation plan

Point the phone at a Beanie Baby (or pick a photo from the library), get back
**what it is** and **what it's worth**, then publish it to BeanieXchange in one
tap. This is the mobile app's headline feature and the natural completion of
roadmap item 4 ("Native sell wizard") in [`README.md`](README.md).

Status: **plan only — nothing here is built yet.**

---

## 1. What the scanner is (and what it deliberately is not)

**Is:** a fast identification + price-estimate tool that ends with a
pre-filled listing.

**Is not:** authentication. BX sells authentication as a paid service
(`BX_BASIC_FEE_CENTS` = $5/beanie, True Blue $18 — see `src/lib/fees.ts`). A
scanner that implies "this one is real" would both mislead collectors and
undercut the product. Every screen and every string must say *identified* and
*estimated*, never *verified* or *authentic*. The scan result screen carries a
one-line footer: "Identification and pricing are estimates. For a certificate,
submit for BX Authentication." — linking into the existing `/authenticate`
flow, which is a genuine upsell rather than a disclaimer.

Two audiences, one screen:

| Audience | Wants | Payoff |
| --- | --- | --- |
| Seller | list this thing quickly | **List it on BX** CTA, everything pre-filled |
| Collector ("what's in my attic worth?") | a number | price card with real sold comps |

The result screen serves the collector first and offers the listing CTA
second. Making listing *optional* is what makes the scanner worth opening.

---

## 2. What already exists (and why this is mostly wiring)

The hard parts are built. The scanner is a composition of things the web app
already does, exposed to a bearer-token client.

| Capability | Where | Reusable as-is? |
| --- | --- | --- |
| Vision identify + condition + draft copy + price | `src/app/api/listing-assist/route.ts` | Logic yes, route no (cookie auth) |
| Catalogue ranking + confident text resolution | `src/lib/beanie-id.ts` (`rankCatalogueMatches`, `resolveBeanie`) | **Yes** |
| Catalogue typeahead endpoint | `GET /api/beanies/suggest` | **Yes — already public, no auth** |
| Stored eBay sold history | `SoldItem` model + `src/lib/sold-stats.ts` | **Yes** |
| Live eBay sold comps | `src/lib/ebay-sold.ts` (`fetchCompletedItems`) | **Yes** |
| Curated value bands | `BEANIES[].valueLow/valueHigh` | **Yes** |
| Catalogue photo resolution | `src/lib/beanie-search.ts` (listing photo > `BeanieImage` > `CATALOGUE_IMAGES`) | Pattern to copy |
| Photo upload → R2, auto-level, watermark | `POST /api/upload` | Logic yes, route no (cookie auth) |
| Condition vocabulary + AI-text canonicalisation | `src/lib/listingOptions.ts` (`canonicalCondition`, `HANG_TAG_OPTIONS`) | **Yes** |
| Listing creation + validation + catalogue submission | `src/app/sell/actions.ts`, `listingSchema`, `recordCatalogueSubmission` | Logic yes, server action no |
| Bearer auth for mobile | `src/lib/mobileAuth.ts` (`getMobileUser`) | **Yes** |

### The one structural gap

Everything the scanner needs — upload, AI, create-listing — is gated on
`auth()`, the Auth.js **cookie** session. The mobile app carries a **bearer
token**. That single mismatch is the backbone of Phase 1.

Fix it once, in one place:

```ts
// src/lib/apiAuth.ts (new)
import { auth } from "@/lib/auth";
import { getMobileUser } from "@/lib/mobileAuth";

export type ApiUser = { id: string; name: string; email: string; role: "USER" | "ADMIN" };

/**
 * The authenticated caller behind an API route, from either credential the
 * app issues: a mobile bearer token or a web cookie session. Bearer first —
 * it's a cheap HMAC check plus one indexed user read, and a native client
 * never sends cookies, so the cookie path is only reached for browsers.
 */
export async function apiUser(req: Request): Promise<ApiUser | null> {
  const mobile = await getMobileUser(req);
  if (mobile) return { id: mobile.id, name: mobile.name, email: mobile.email, role: mobile.role };
  const session = await auth();
  const u = session?.user;
  return u?.id ? { id: u.id, name: u.name ?? "", email: u.email ?? "", role: (u.role ?? "USER") } : null;
}
```

Then swap `const session = await auth()` for `const user = await apiUser(req)`
in `/api/upload`, `/api/listing-assist`, `/api/photo-import`, and
`/api/listing-image-optimize`. Web behaviour is unchanged (no bearer header →
straight to the cookie path); mobile gains four endpoints for ~30 lines.

---

## 3. Architecture

```
 ┌──────────────── mobile ────────────────┐   ┌──────────── Next.js API ────────────┐
 │ (tabs)/scan.tsx      scan home         │   │                                     │
 │        │                                │   │                                     │
 │        ▼                                │   │                                     │
 │ scan/camera.tsx      guided capture     │   │                                     │
 │        │  downscale to 1600px (local)   │   │                                     │
 │        ▼                                │   │  POST /api/upload  (bearer)         │
 │        ├───────── photos ───────────────┼──▶│    auto-level → watermark → R2      │
 │        │                                │   │    ← R2 urls                        │
 │        ▼                                │   │  POST /api/scan    (bearer)         │
 │        ├───────── r2 urls ──────────────┼──▶│    vision identify                  │
 │        │                                │   │    → rankCatalogueMatches           │
 │        │                                │   │    → price ladder                   │
 │        │                                │   │    → live-on-BX                     │
 │        ▼                                │   │                                     │
 │ scan/result.tsx      identity + price   │   │  GET  /api/price?key=&condition=    │
 │        │  correct me / change condition ┼──▶│    re-price WITHOUT re-running AI   │
 │        ▼                                │   │                                     │
 │ scan/list.tsx        pre-filled listing │   │  POST /api/mobile/listings (bearer) │
 │                      (same R2 urls)     ├──▶│    createListingFor() ── shared ──┐ │
 └────────────────────────────────────────┘   │                                   │ │
                                               │  /sell server action ─────────────┘ │
                                               └─────────────────────────────────────┘
```

Two properties worth defending:

1. **Photos are uploaded exactly once**, at scan time. Their R2 URLs ride
   straight into the listing. "List it" is genuinely one tap because there is
   no second upload to wait through.
2. **Re-pricing never re-runs the vision model.** Correcting the identity or
   changing the condition hits the cheap `GET /api/price`. Only a new photo
   costs an OpenAI call.

---

## 4. Backend work

### 4.1 `src/lib/listing-assist.ts` (new) — extract the vision pass

Move `SYSTEM_PROMPT` and the OpenAI call out of the route into
`visionIdentify(photos, hint)`. `/api/listing-assist` keeps its exact current
contract (the web sell wizard depends on it); `/api/scan` calls the same
function. One prompt, two consumers, no drift.

**One addition to the prompt contract**, needed by the scanner and harmless to
the web flow: `"isBeanieBaby": boolean`. Today a photo of a coffee mug comes
back confidently named as some bear. The scanner must be able to say "that
doesn't look like a Beanie Baby — try again" instead of pricing a mug.

### 4.2 `src/lib/pricing.ts` (new) — the price ladder

The single most important piece of substance in this feature. Four sources,
ordered most→least trustworthy, and **the source is always shown to the user**:

| Rank | `basis` | Source | Used when |
| --- | --- | --- | --- |
| 1 | `bx_sold` | our `SoldItem` rows for that `normalizedKey`, last 365d | ≥ 3 rows |
| 2 | `ebay_sold` | live `fetchCompletedItems()` | RAPIDAPI_KEY set and (1) is thin |
| 3 | `catalogue` | `BEANIES[].valueLow/valueHigh` | curated entry with a value band |
| 4 | `ai_estimate` | the model's own guess | nothing else available |

```ts
export type PriceQuote = {
  recommendedCents: number;
  lowCents: number;
  highCents: number;
  basis: "bx_sold" | "ebay_sold" | "catalogue" | "ai_estimate";
  sampleCount: number;          // 0 for catalogue/ai — drives "based on N sales"
  medianCents: number | null;   // the un-adjusted market median
  lastSoldAt: string | null;    // ISO; "last sold 6 days ago" is a trust signal
  conditionFactor: number;      // what we multiplied by, shown in the breakdown
  conditionLabel: string;
};

export async function quotePrice(args: {
  key: string;                  // beaniePhotoKey(confirmed name)
  condition: string;            // canonical LISTING_CONDITIONS value
  hangTag?: HangTagOption;
  aiFallbackCents?: number | null;
}): Promise<PriceQuote>;
```

Condition and hang-tag multipliers live next to `canonicalCondition` in
`src/lib/listingOptions.ts`, so the seller-facing vocabulary and its price
effect can't drift apart (that file already exists precisely to stop the two
listing paths drifting):

```ts
// src/lib/listingOptions.ts — additions
export const CONDITION_FACTOR: Record<string, number> = {
  "MWMT-MQ …": 1.15, "MWMT …": 1.00, "MINT …": 0.90, "NM …": 0.80,
  "EX …": 0.65, "VG …": 0.45, "G …": 0.30, "P …": 0.15,
};
export const HANG_TAG_FACTOR: Record<HangTagOption, number> = {
  Mint: 1.0, Good: 0.85, Fair: 0.7, Missing: 0.5,
};
```

These starting numbers are a judgement call, not measured — they should be
back-tested against `SoldItem.condition` once enough rows accumulate, and the
plan should treat them as a tunable constant, not a truth. Note that most
`SoldItem` medians are already a *blend* of conditions, so multiplying a blended
median by 1.0 for MWMT under-prices mint examples; the honest framing on screen
is "typical sold price, adjusted for your condition", with the raw median always
visible next to it.

**Present the range, not just a number.** `lowCents`/`highCents` come from the
sold distribution (25th/75th percentile where we have ≥ 8 samples, else
±30%), because a single confident number on thin data is a lie.

### 4.3 `GET /api/price?key=&condition=&hangTag=` (new, public)

Wraps `quotePrice` plus a **live-on-BX** block. Public and cheap — no AI, no
auth, and it's the endpoint the result screen re-hits whenever the user
corrects the identity or changes the condition dropdown.

```ts
→ { price: PriceQuote,
    liveOnBx: { count: number; minCents: number | null; maxCents: number | null } }
```

`liveOnBx` is one Prisma query against the existing
`@@index([beanieName, status, priceCents])`: how many ACTIVE non-lot listings
of this beanie BX already has, and their range. Pricing against live
competition is the signal a seller actually wants, and it costs nothing.
Caveat to note in the code: `Listing.beanieName` is free text, so this matches
catalogue-linked listings well and hand-typed variants imperfectly.

### 4.4 `POST /api/scan` (new, bearer **or** cookie)

The composite. One round trip from photos to a complete answer.

```jsonc
// request
{ "photos": ["https://…r2.dev/listings/…jpg"],  // 1–4, absolute http(s)
  "hint": "maybe princess?" }                    // optional user text

// response
{
  "isBeanieBaby": true,
  "confidence": "high" | "medium" | "low",
  "identified": {                 // the TOP candidate — a suggestion, not a link
    "name": "Princess", "animal": "Bear", "year": 1997,
    "key": "princess", "styleNumber": "4300",
    "photoUrl": "/beanie-images/princess.webp", "tagGeneration": "4th gen"
  },
  "candidates": [ /* up to 5 more, same shape, from rankCatalogueMatches */ ],
  "condition": { "canonical": "NM — Near Mint", "raw": "Near mint, tag slightly bent",
                 "notes": "Swing tag present with a soft crease…" },
  "price":    { /* PriceQuote */ },
  "liveOnBx": { "count": 3, "minCents": 1800, "maxCents": 4500 },
  "draft":    { "title": "…", "description": "…", "hangTag": "Good" },
  "notes": ""
}
```

**The scan never auto-links the catalogue.** `/api/listing-assist` carries an
explicit comment that image-based catalogue matching "proved unreliable" and
that linking is driven by the seller's typed name. That lesson survives here:
the scan returns *ranked candidates*, the user taps one to confirm, and only
the confirmed key drives pricing and the listing. The UI makes confirming a
single tap so this costs nothing in speed — and it's why the result screen
shows catalogue thumbnails next to each candidate.

Rate limit: `rateLimit(req, "scan", 10, 60_000)`. Note that `src/lib/rateLimit.ts`
is per-instance in-memory (documented in the file) — acceptable for the free
endpoints, thinner cover for one that spends OpenAI money on every call. A
per-user daily cap read from the DB is the follow-up if abuse shows up.

### 4.5 `src/lib/createListing.ts` (new) — shared listing creation

Extract the body of `createListing` in `src/app/sell/actions.ts` into
`createListingFor(userId, input)`, returning the created listing rather than
redirecting. The server action keeps its `redirect()` behaviour; the new
mobile route calls the same function. Same reasoning as `listingOptions.ts`:
two listing paths that must never drift.

### 4.6 `POST /api/mobile/listings` (new, bearer)

Named per the existing roadmap in `README.md`.

```jsonc
// request  (Authorization: Bearer …)
{ "beanieName": "Princess", "year": 1997,
  "condition": "NM — Near Mint", "hangTag": "Good",
  "description": "…", "price": 24, "quantity": 1,
  "authType": "UNAUTHENTICATED",
  "photos": ["https://…r2.dev/…"],
  "minAutoAccept": null, "intent": "post" }        // or "draft"

// 201
{ "id": "clx…", "status": "ACTIVE", "url": "https://beaniexchange.com/listings/clx…" }
```

Validated with the **existing** `listingSchema`; `hangTag` folded in with
`withHangTagLine` exactly as the web wizard does, so a mobile listing and a web
listing are byte-identical in shape. `title` defaults to `beanieName` (matching
`SellWizard.submit`, which sends the name for both columns).

---

## 5. Mobile work

### 5.1 Dependencies and native config

```
expo-camera            ~57.x   capture
expo-image-picker      ~57.x   library
expo-image-manipulator ~57.x   downscale/rotate before upload
```

`app.json` gains the plugin entries with permission copy:

```jsonc
["expo-camera",       { "cameraPermission": "Beanie Xchange uses the camera to identify and price your Beanie Babies." }],
["expo-image-picker", { "photosPermission": "Beanie Xchange reads photos you choose so it can identify and price your Beanie Babies." }]
```

> **Gate before any code is written.** `mobile/AGENTS.md` requires reading the
> versioned docs at <https://docs.expo.dev/versions/v57.0.0/> first. Two things
> to confirm there rather than assume: the exact SDK 57 config-plugin option
> names above, and whether `expo-camera` runs under **Expo Go** on SDK 57 or
> needs an EAS **development build**. That answer changes how the feature can
> be demoed (see [`DEPLOYMENT.md`](DEPLOYMENT.md)) and belongs in Phase 0, not
> discovered mid-Phase 2.

**Downscale locally before upload.** A 12MP iPhone HEIC is ~4 MB; `/api/upload`
caps at 10 MB per file and the round trip on cellular is the whole perceived
latency of the scanner. `expo-image-manipulator` to 1600px longest edge / JPEG
q0.8 lands ~300 KB, uploads in a blink, and is still far more resolution than
the vision model consumes. This mirrors what `toUploadable` already does in the
web `PhotoUploader`.

### 5.2 Navigation

Keep three tabs. Rename the middle one **Sell → Scan** and make the scanner its
front door:

- `mobile/src/app/(tabs)/sell.tsx` → `(tabs)/scan.tsx`
- `mobile/src/components/app-tabs.tsx`: `name="sell"` → `name="scan"`, SF Symbol
  `camera.viewfinder` / `camera.fill`, label "Scan"
- `typedRoutes: true` is on, so route types regenerate on the next start

Rationale: Scan and Sell are one funnel. Two tabs that both end in a listing
would split it and leave the current Sell tab (a web hand-off stub) looking
like the real path. The manual "enter details yourself" route stays on the same
screen for anyone who doesn't want to photograph anything, and the existing web
hand-off stays as the escape hatch for lots (`/sell/lot`), which the scanner
does not cover.

Register the pushed screens in `mobile/src/app/_layout.tsx` alongside
`listing/[id]`, with `scan/camera` presented full-screen and header-less.

### 5.3 Screens

**`(tabs)/scan.tsx` — Scan home**
Big primary "Scan a Beanie" (camera), secondary "Choose from library", tertiary
text link "Enter details manually". Signed-out users see the same screen with
the CTA routing to the Account tab's sign-in — scanning costs us an OpenAI call,
so it requires an account, same policy as `/api/listing-assist` today.

**`scan/camera.tsx` — guided capture**
Full-screen `CameraView` with a soft square guide and a three-step prompt strip:

| Step | Prompt | Why it matters |
| --- | --- | --- |
| 1 | Front of the beanie | identity |
| 2 | The heart-shaped swing tag | tag generation drives most of the value |
| 3 | The tush tag | generation cross-check + fake detection |

Steps 2 and 3 are **skippable** — one photo is enough to get an answer — but
prompting for them is the difference between a generic image classifier and
something that knows Beanie Babies. The existing `SYSTEM_PROMPT` already asks
the model to read "the swing/hang tag and tush tag, tag protector"; today it
rarely gets a photo that shows them. Torch toggle, thumbnail strip, retake.

**`scan/result.tsx` — the payoff**
Top to bottom:

1. Hero photo + `Princess · Bear · 1997` + a confidence chip
   (green/amber/grey on high/medium/low)
2. **"Not right?"** row → candidate sheet (the `candidates[]` from the scan,
   then `GET /api/beanies/suggest?q=` typeahead over the full ~2,700-entry
   catalogue for anything else). Confirming re-hits `GET /api/price` — no AI call.
3. **Price card** — the big number, the range under it, then the honest
   breakdown: `Typical sold: $30 · Your condition (NM ×0.80) · 14 sales, last 6 days ago`
   with a `basis` badge ("BX sold data" / "eBay sold" / "Catalogue estimate" /
   "AI estimate"). A `low` basis or `sampleCount < 3` renders as a **range only**,
   with no headline number — thin data must look thin.
4. **Already on BX**: `3 listed now · $18–$45` (from `liveOnBx`)
5. Condition + hang-tag pickers (pre-filled from the scan, canonical values
   from `LISTING_CONDITIONS` / `HANG_TAG_OPTIONS`), each edit re-pricing
6. Primary **"List it on BeanieXchange"**, secondary "Scan another"
7. The authentication footer from §1

**`scan/list.tsx` — pre-filled listing**
Everything carried over; the seller reviews rather than types. Auth-type picker
(default `UNAUTHENTICATED`) with the short explainer copy from the README table,
quantity, and a collapsed "auto-accept offers above $…". Post →
`POST /api/mobile/listings` → success screen with the live listing URL and a
"View listing" push into the existing native `listing/[id]` screen.

### 5.4 `mobile/src/lib/api.ts` additions

Follow the file's existing convention: hand-mirrored types with a comment
pointing at the server-side source of truth.

```ts
export async function uploadPhotos(files: {uri: string; name: string; type: string}[]): Promise<string[]>
export function scanBeanie(photos: string[], hint?: string): Promise<ScanResult>
export function quotePrice(key: string, condition: string, hangTag?: string): Promise<PriceResponse>
export function suggestBeanies(q: string): Promise<{matches: BeanieEntry[]; linked: BeanieEntry | null}>
export function createListing(input: CreateListingInput): Promise<{id: string; status: string; url: string}>
```

`uploadPhotos` needs multipart, which the existing `postJson` doesn't do — add a
sibling `postForm` that reuses `authHeaders()` and the same `ApiError` /
`handleUnauthorized` behaviour. React Native's `FormData` takes
`{uri, name, type}` objects directly; do **not** set a `content-type` header
and let RN write its own boundary.

---

## 6. Phasing

Each phase is independently shippable and independently reviewable.

| Phase | Scope | Done when |
| --- | --- | --- |
| **0 — Verify** | Read the SDK 57 camera/image-picker docs; confirm plugin options and Expo Go vs dev build; confirm `OPENAI_API_KEY`, `R2_*`, `RAPIDAPI_KEY` are set in prod | Findings written into this doc; no code |
| **1 — Backend** | `apiAuth`, bearer on the 4 routes, `listing-assist.ts`, `pricing.ts`, `GET /api/price`, `POST /api/scan`, `createListing.ts`, `POST /api/mobile/listings` | All five endpoints exercised with `curl` + a real bearer token; web sell flow unchanged |
| **2 — Capture & result** | deps, `app.json`, tab rename, `scan.tsx`, `scan/camera.tsx`, `scan/result.tsx`, api client | Photograph a beanie on a device → name + price on screen |
| **3 — List** | `scan/list.tsx`, create-listing call, success screen | Scan → published listing visible on the web site in under 60s |
| **4 — Polish** | candidate sheet with catalogue thumbnails, sold sparkline (reuse `/api/sold/trends` series), recent-scan history, empty/offline/permission-denied states, Android tab art | Every failure mode in §7 has a designed screen |

Phase 1 is the only phase with a hard dependency; 2–4 are sequential but each
leaves the app in a shippable state.

---

## 7. Failure modes — each one needs a designed screen, not a spinner

| Condition | Behaviour |
| --- | --- |
| `OPENAI_API_KEY` unset (503) | "Scanning is temporarily unavailable" → drop straight into manual catalogue search, which needs no AI |
| `R2_*` unset (503) | Same, surfaced at upload |
| Camera permission denied | Explain why, deep-link to Settings, offer the library path |
| No network | Retry affordance; never lose the captured photos |
| `isBeanieBaby: false` | "That doesn't look like a Beanie Baby" + retake — never price it |
| `confidence: "low"` | Lead with the candidate list, not a name; range instead of a headline price |
| No sold data anywhere | Show the catalogue band labelled "Catalogue estimate", or "Not enough sales data to price this one" — never invent a number |
| 429 from `/api/scan` | "Give it a minute" with the `Retry-After` value |
| Bearer expired mid-scan | Existing `setUnauthorizedHandler` already signs out cleanly; preserve the photos through re-auth |

---

## 8. Risks and open questions

1. **Vision accuracy on plush toys is genuinely mediocre.** The codebase already
   learned this the hard way. Mitigation is structural, not hopeful: candidates
   over auto-linking, tag photos, one-tap correction, and never claiming
   authenticity. The correction rate is also the accuracy metric (§9).
2. **Cost per scan.** One vision call plus possibly one RapidAPI call. Mitigated
   by 1600px uploads, `SoldItem`-first pricing (no RapidAPI on the common path),
   re-pricing without re-scanning, auth requirement, and the rate limit. Worth
   agreeing a per-user daily cap before launch rather than after a bill.
3. **Expo Go vs development build** for `expo-camera` — Phase 0 answers it, and
   the answer determines how the feature can be demoed before TestFlight.
4. **Condition multipliers are guesses.** Ship them as a labelled constant,
   back-test against `SoldItem.condition` later. The screen always shows the raw
   median next to the adjusted number so the user can disagree with our maths.
5. **Orphan photos in R2.** Photos from scans that never become listings sit in
   `listings/<userId>/` forever. At ~300 KB each this is cents per year — an
   accepted cost, not worth a lifecycle rule until volume says otherwise.
6. **`liveOnBx` matches on free-text `beanieName`.** Good for catalogue-linked
   listings, imperfect for hand-typed variants. Acceptable for a "what else is
   listed" hint; not acceptable if it ever drives pricing directly.
7. **Rate limiting is per-instance.** Documented in `src/lib/rateLimit.ts`. It
   now guards an endpoint that spends money — worth revisiting the shared-store
   TODO in that file.

---

## 9. How we know it worked

- **Scan → published listing conversion** (the whole point of §1's second CTA)
- **Time from first tap to published listing** — target under 60 seconds
- **Correction rate**: % of scans where the user picked a different candidate.
  This is the honest accuracy metric and should be logged from day one
- **Share of new listings created on mobile** — currently zero
- **Scans per user per week** for the collector audience, who never list anything

## 10. Verification during development

There is no test framework in either package, so verification is:

```bash
npx tsc --noEmit && npm run lint        # repo root
cd mobile && npx tsc --noEmit && npm run lint
```

plus a manual pass on device against a handful of beanies with known catalogue
entries and known sold history (`Princess`, `Peanut`, `Patti` — all curated
entries with value bands and `SoldItem` rows). `npm run sold:ingest` seeds sold
data locally if the price ladder needs real rows to exercise ranks 1 and 2.
