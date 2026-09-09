"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SITE_NAME } from "@/lib/site";

type Form = {
  name: string;
  email: string;
  password: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  goal: "buy" | "sell" | "both";
  agreedToTerms: boolean;
};

const STEPS = ["Account", "Profile", "Confirm", "Start"];
// Form steps are 0..LAST_FORM_STEP; the final "Start" step is only reached by
// actually creating the account, never by Continue.
const LAST_FORM_STEP = STEPS.length - 2;

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // On the final step the account exists and the session is live — the wizard
  // is spent, and it shows a "list your first item" prompt instead of a form.
  const created = step === STEPS.length - 1;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState<Form>({
    name: "",
    email: "",
    password: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    goal: "both",
    agreedToTerms: false,
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  function next() {
    setErr("");
    if (step === 0) {
      if (f.name.trim().length < 2) return setErr("Enter your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
        return setErr("Enter a valid email.");
      if (f.password.length < 8)
        return setErr("Password must be at least 8 characters.");
    }
    setStep((s) => Math.min(s + 1, LAST_FORM_STEP));
  }
  const back = () => {
    setErr("");
    setStep((s) => Math.max(s - 1, 0));
  };

  async function submit() {
    if (!f.agreedToTerms) {
      setErr(
        "You must agree to the Terms of Service and Privacy Policy.",
      );
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      // Guarded parse: a 429/5xx serves HTML, and an unguarded res.json()
      // would surface a raw parse error instead of a readable message.
      const data = await res.json().catch(() => ({}) as { error?: string; signedIn?: boolean });
      if (!res.ok) throw new Error(data.error ?? "Registration failed — please try again in a minute.");
      // /api/register signs the new account in and sets the session cookie on
      // that response. Only when it couldn't (`signedIn: false`) does the user
      // still need the sign-in form.
      if (!data.signedIn) {
        router.push("/auth/signin?registered=1");
        return;
      }
      // Signed in — land on the final step: a nudge to list a first item.
      setStep(STEPS.length - 1);
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Registration failed");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-ink text-3xl">
          {created ? `Welcome to ${SITE_NAME}!` : "Create your account"}
        </h1>
        <p className="text-muted text-sm">
          {created
            ? "Your account is ready and you're signed in."
            : `Join ${SITE_NAME} to buy and sell almost anything.`}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`tnt-step ${
                  i === step
                    ? "tnt-step--active"
                    : i < step
                      ? "tnt-step--done"
                      : ""
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs ${
                  i === step ? "text-ink" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-[var(--tnt-line)]" />
            )}
          </div>
        ))}
      </div>

      <div className="tnt-panel p-6 space-y-4">
        {step === 0 && (
          <>
            <Field label="Full name">
              <input
                className="tnt-input"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Email">
              <input
                className="tnt-input"
                type="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                className="tnt-input"
                type="password"
                value={f.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-muted text-sm">
              Used for shipping and faster checkout. You can skip and add this
              later.
            </p>
            <Field label="Address line 1">
              <input
                className="tnt-input"
                value={f.addressLine1}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </Field>
            <Field label="Address line 2 (optional)">
              <input
                className="tnt-input"
                value={f.addressLine2}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="City" className="col-span-2 sm:col-span-1">
                <input
                  className="tnt-input"
                  value={f.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label="State">
                <input
                  className="tnt-input"
                  value={f.state}
                  onChange={(e) => set("state", e.target.value)}
                />
              </Field>
              <Field label="ZIP">
                <input
                  className="tnt-input"
                  value={f.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="What brings you here?">
              <div className="grid grid-cols-3 gap-2">
                {(["buy", "sell", "both"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set("goal", g)}
                    className={`tnt-badge justify-center py-2 capitalize ${
                      f.goal === g ? "tnt-badge--on !text-white" : ""
                    }`}
                  >
                    {g === "both" ? "Buy & sell" : g}
                  </button>
                ))}
              </div>
            </Field>
            <div className="text-sm text-muted space-y-1 border-t border-[var(--tnt-line)] pt-4">
              <p>
                <span className="text-ink">{f.name || "—"}</span> ·{" "}
                {f.email || "—"}
              </p>
              <p>
                {f.city || f.state
                  ? `${f.city}${f.city && f.state ? ", " : ""}${f.state} ${f.postalCode}`
                  : "No address added"}
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm cursor-pointer pt-3 border-t border-[var(--tnt-line)]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--tnt-red)] cursor-pointer"
                checked={f.agreedToTerms}
                onChange={(e) => set("agreedToTerms", e.target.checked)}
                required
              />
              <span className="text-muted">
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="!text-[var(--tnt-red)] font-semibold"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="!text-[var(--tnt-red)] font-semibold"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </>
        )}

        {created && (
          <div className="text-center space-y-4 py-2">
            <p className="text-4xl" aria-hidden="true">
              🏷️
            </p>
            <div className="space-y-1">
              <p className="text-ink font-semibold text-lg">
                Ready to make your first sale?
              </p>
              <p className="text-muted text-sm">
                Listing an item takes a couple of minutes — add photos,
                describe it, set your price. You can also do this any time
                from your dashboard.
              </p>
            </div>
            {/* replace: the wizard is spent, so Back should leave signup
                behind instead of resurrecting the form for a signed-in user. */}
            <div className="flex flex-col gap-2">
              <Link href="/sell" replace className="tnt-btn w-full">
                List your first item →
              </Link>
              <Link
                href={`/dashboard?toast=${encodeURIComponent(
                  `Welcome to ${SITE_NAME} — you're signed in.`,
                )}`}
                replace
                className="tnt-btn tnt-btn--ghost w-full"
              >
                Maybe later — go to my dashboard
              </Link>
            </div>
          </div>
        )}

        {err && <p className="text-red-600 text-sm">{err}</p>}

        {!created && (
          <div className="flex justify-between gap-3 pt-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={back}
                className="tnt-btn tnt-btn--ghost"
                disabled={busy}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {step < LAST_FORM_STEP ? (
              <button type="button" onClick={next} className="tnt-btn">
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                className="tnt-btn"
                disabled={busy || !f.agreedToTerms}
                title={
                  !f.agreedToTerms
                    ? "Please agree to the Terms of Service first"
                    : undefined
                }
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            )}
          </div>
        )}
      </div>

      {!created && (
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/auth/signin"
            className="!text-[var(--tnt-green)] font-semibold"
          >
            Sign in
          </Link>
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm text-ink">{label}</span>
      {children}
    </label>
  );
}
