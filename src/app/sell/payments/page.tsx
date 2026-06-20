import { SellerNav } from "@/components/SellerNav";
import { getStripeStatus, connectStripe } from "@/lib/actions";

export default async function PaymentsPage() {
  const status = await getStripeStatus();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SellerNav />
      <h1 className="text-2xl font-bold tracking-tight">Payments &amp; payouts</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Connect Stripe so buyers can pay and your earnings land in your bank — the platform fee is
        deducted automatically.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        {!status.configured ? (
          <Notice tone="amber">
            Stripe isn&apos;t configured on the server yet. Add <code>STRIPE_SECRET_KEY</code> (and
            a webhook secret) to enable real payments. Until then, checkout runs in demo mode.
          </Notice>
        ) : status.chargesEnabled ? (
          <Notice tone="emerald">
            ✅ Payouts are enabled. You&apos;re all set to get paid — buyers check out via Stripe and
            your share is transferred to your connected account.
          </Notice>
        ) : status.connected ? (
          <>
            <Notice tone="amber">
              Your Stripe account exists but onboarding isn&apos;t finished. Complete it to start
              receiving payouts.
            </Notice>
            <ConnectButton label="Finish Stripe onboarding →" />
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You&apos;ll be redirected to Stripe to verify your details and link a bank account.
              Takes a couple of minutes.
            </p>
            <ConnectButton label="Connect with Stripe →" />
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Powered by Stripe Connect. Funds settle to your own Stripe account; ThisNThat only takes its
        platform fee per sale.
      </p>
    </main>
  );
}

function ConnectButton({ label }: { label: string }) {
  return (
    <form action={connectStripe} className="mt-4">
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        {label}
      </button>
    </form>
  );
}

function Notice({ tone, children }: { tone: "amber" | "emerald"; children: React.ReactNode }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return <p className={`rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</p>;
}
