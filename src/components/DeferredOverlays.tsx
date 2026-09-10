"use client";

import dynamic from "next/dynamic";

/**
 * The three widgets that sit at the bottom of the root layout, split out of the
 * initial bundle.
 *
 * All three are client components in the root layout, so before this they were
 * server-rendered and hydrated on EVERY route — while none of them is needed
 * for first paint:
 *
 *   - ChatDock is a `position: fixed` pill (the largest of the three at ~420
 *     lines) that does nothing until it is clicked.
 *   - SignupPrompt deliberately waits 6 seconds before it appears at all.
 *   - WebVitalsReporter renders no UI whatsoever; it already defers its own
 *     `web-vitals/attribution` import into an effect.
 *
 * `ssr: false` keeps them out of the server HTML and out of the first
 * hydration pass, which is what the main thread is busy with when Lighthouse
 * measures Total Blocking Time. Nothing here participates in layout flow — the
 * dock and the prompt are both fixed-position — so loading them late cannot
 * shift the page.
 *
 * This wrapper exists because `ssr: false` is only honoured inside a Client
 * Component (see next/dist/docs/01-app/02-guides/lazy-loading.md); the root
 * layout is a Server Component, so the option is silently useless there.
 */

const ChatDock = dynamic(
  () => import("@/components/ChatDock").then((m) => m.ChatDock),
  { ssr: false },
);

const SignupPrompt = dynamic(
  () => import("@/components/SignupPrompt").then((m) => m.SignupPrompt),
  { ssr: false },
);

const WebVitalsReporter = dynamic(
  () => import("@/components/WebVitalsReporter").then((m) => m.WebVitalsReporter),
  { ssr: false },
);

export function DeferredOverlays({
  loggedIn,
  initialUnread,
}: {
  loggedIn: boolean;
  initialUnread: number;
}) {
  return (
    <>
      <SignupPrompt loggedIn={loggedIn} />
      <WebVitalsReporter />
      <ChatDock loggedIn={loggedIn} initialUnread={initialUnread} />
    </>
  );
}
