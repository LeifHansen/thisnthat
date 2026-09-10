import "server-only";

// The Stripe publishable key, read on the SERVER at request time and handed to
// the checkout components as a prop.
//
// The variable is deliberately NOT called NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
// Next inlines every `NEXT_PUBLIC_*` reference at BUILD time (see
// next/dist/lib/static-env.js — the same define is applied to the client *and*
// server bundles), so a prefixed name would be frozen into the image by CI and
// could not be corrected on a running machine. We ship a single image built in
// CI, so that made checkout hostage to the GitHub secret -> `flyctl deploy
// --build-arg` -> Dockerfile ARG/ENV -> `next build` chain: one empty link and
// an empty string is baked into every bundle, no customer can pay, and nothing
// fails anywhere to reveal it. Next's own guide says as much: "If you need
// access to runtime environment values, you'll have to setup your own API to
// provide them to the client."
//
// Without the prefix nothing is inlined, this is an ordinary runtime read, and
// the key can be set or rotated with `fly secrets set` — no rebuild.

type Mode = "live" | "test" | "unknown";

/** live/test as declared by a Stripe key's own prefix. */
function modeOf(key: string): Mode {
  if (/^(?:sk|rk|pk)_live_/.test(key)) return "live";
  if (/^(?:sk|rk|pk)_test_/.test(key)) return "test";
  return "unknown";
}

const logged = new Set<string>();

function logOnce(id: string, message: string) {
  if (logged.has(id)) return;
  logged.add(id);
  console.error(message);
}

/**
 * The publishable key to hand to Stripe.js, or "" when none is configured.
 *
 * The value is sent to the browser, so it must be a `pk_` key — a secret key
 * pasted into this variable is refused rather than served to every visitor. A
 * live/test disagreement with STRIPE_SECRET_KEY is reported but still served:
 * Stripe's own error at confirmation says more than a blank payment panel.
 */
export function stripePublishableKey(): string {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!key) {
    logOnce(
      "missing",
      "[stripe] STRIPE_PUBLISHABLE_KEY is not set — card payments cannot load and no customer can check out. Fix with `fly secrets set STRIPE_PUBLISHABLE_KEY=pk_live_…` (takes effect on the next request, no rebuild).",
    );
    return "";
  }

  if (!key.startsWith("pk_")) {
    logOnce(
      "notpk",
      "[stripe] STRIPE_PUBLISHABLE_KEY is not a publishable key (expected a pk_… value) — refusing to send it to the browser.",
    );
    return "";
  }

  const secretMode = modeOf(process.env.STRIPE_SECRET_KEY?.trim() ?? "");
  if (secretMode !== "unknown" && modeOf(key) !== secretMode) {
    logOnce(
      "mismatch",
      `[stripe] STRIPE_SECRET_KEY is a ${secretMode} key but STRIPE_PUBLISHABLE_KEY is ${modeOf(key)} — Stripe will reject payments until the pair matches.`,
    );
  }

  return key;
}
