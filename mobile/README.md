# Beanie Xchange — iOS app

Native mobile frontend for the Beanie Xchange marketplace, built with
[Expo](https://expo.dev) SDK 57 / React Native / TypeScript. iOS-first;
Android is kept buildable but unpolished.

The app is a **thin client over the existing Next.js backend** (repo root) —
there is no separate mobile API. `src/lib/api.ts` is the single integration
point and mirrors the web app's response types by hand (see the roadmap for
splitting a shared types package).

## What works today

- **Browse tab** — the live storefront grid from `/api/listings` (active
  listings grouped by beanie with price ranges), with pull-to-refresh and
  infinite scroll. Tapping a card pushes a **native listing detail screen**.
- **Listing detail** — native screen backed by `GET /api/listings/[id]`:
  swipeable photo pager, auth badge, price, condition, description, seller,
  the full fee breakdown, and an "other options" rail. Purchase/offers still
  hand off to the web flow until native checkout + auth ship.
- **Checkout** — native. Address (prefilled from the account), live-rated
  shipping quote, Stripe `CardField`, and 3-D Secure. The server authorizes a
  manual-capture PaymentIntent, so the money is held, not taken.
- **Sell tab** — native: pick photos from the camera roll, fill in the
  details, publish. Lots, drafts and paid authentication stay on the web.
- **Account tab** — native sign-in / sign-up, and permanent account deletion
  (Apple requires it in-app for anything that creates accounts); dashboard,
  messages and profile open the web signed in.
- Brand theming (`src/constants/theme.ts` mirrors the web `--bx-*` palette),
  native iOS tab bar with SF Symbols, light/dark mode, and the bx heart as the
  app icon and splash mark.

## Run it (iOS)

```bash
cd mobile
npm install
npm run ios        # opens the iOS simulator via Expo (needs macOS + Xcode)
# Expo Go will NOT work: the Stripe SDK is a native module Expo Go doesn't
# carry. Build a dev client instead: eas build --profile development
```

By default the app talks to production. To develop against a local backend:

```bash
# repo root: npm run dev  (Next.js on :3000), then
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run ios
```

## Structure

```
src/app/
  _layout.tsx       root Stack (wraps the tab group + pushes detail)
  (tabs)/           native tab bar group: index (Browse), sell, account
  listing/[id].tsx  native listing detail screen
src/components/   app-tabs (native tab bar) + themed primitives (template)
src/constants/    theme — BX brand palette, spacing, fonts
src/lib/api.ts    typed client for the Next.js API
```

## Roadmap (in rough order)

1. ~~**Native listing detail**~~ ✅ done — `GET /api/listings/[id]` + a native
   detail screen. Purchase still hands off to web pending native checkout.
2. ~~**Auth**~~ ✅ done — bearer-token endpoints (`/api/mobile/auth/login`,
   `/register`, `/me`) + `AuthProvider`/`useAuth`, token in the device
   keychain (`expo-secure-store`), native sign-in/up on the Account tab.
3. ~~**Get it on a device**~~ ✅ set up — `eas.json` build/submit profiles +
   [`DEPLOYMENT.md`](DEPLOYMENT.md) (an EAS development build for a quick
   look — Expo Go can't run this app since checkout pulled in the Stripe
   native module — and EAS Build → TestFlight for the real binary). Running
   the actual `eas build`/`submit` needs an Apple Developer + Expo account
   (see the guide).
4. **Beanie scanner** — point the camera at a beanie (or pick a photo) to
   identify and price it, then publish in one tap. Full design in
   [`SCANNER_PLAN.md`](SCANNER_PLAN.md). The plumbing it needed is now in
   place: ~~a bearer-authed create-listing endpoint~~ ✅
   `POST /api/mobile/listings` (sharing `createListingForSeller` with the web
   Sell form) and ~~mobile upload~~ ✅ camera-roll photos through the web
   app's upload route, with the same auto-levelling and watermark. What is
   left is the identify-and-price step on top. Lots, drafts, AI autofill,
   studio staging and the paid BX authentication tiers still hand off to the
   web.
5. **Push notifications** — offers, sales, messages (needs device-token
   registration tied to the authed user).
6. ~~**Checkout**~~ ✅ done — `@stripe/stripe-react-native` against the
   existing manual-capture PaymentIntent/escrow flow. Offers are still the web
   hand-off. Note this pulled a native module in, so **Expo Go can no longer
   run the app** — use an EAS `development` build (see
   [`DEPLOYMENT.md`](DEPLOYMENT.md)).
7. **Shared types package** — replace the hand-mirrored types in
   `src/lib/api.ts` once a monorepo tool (npm workspaces) is worth it.
8. ~~**App icon / splash art**~~ ✅ done — generated from the web app's brand
   mark by [`scripts/generate-icons.mjs`](scripts/generate-icons.mjs); re-run
   `node mobile/scripts/generate-icons.mjs` from the repo root after a brand
   change. The Android tab-bar icons are still the template's two glyphs.
