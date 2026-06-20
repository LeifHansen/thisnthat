import Link from "next/link";
import { getStripe } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/actions";

// Stripe redirects here after a successful Checkout. We confirm the session
// (so it works even without a webhook configured) and show the receipt with
// the usual account-creation nudge.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; session_id?: string }>;
}) {
  const { order, session_id } = await searchParams;

  const stripe = getStripe();
  if (stripe && session_id && order) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === "paid") {
        const pi =
          typeof session.payment_intent === "string" ? session.payment_intent : undefined;
        await markOrderPaid(order, pi);
      }
    } catch {
      // best-effort; the webhook is the source of truth
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Order confirmed 🎉</h1>
      {order && (
        <p className="mt-2 text-sm text-zinc-500">
          Order <span className="font-mono">{order}</span> — a receipt is on its way.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 p-5 text-left dark:border-zinc-800">
        <p className="text-sm font-medium">Create an account for faster checkout</p>
        <p className="mt-1 text-sm text-zinc-500">
          Track your order, save shipping info, and get first dibs on new drops.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create account →
        </Link>
      </div>

      <Link href="/" className="mt-6 inline-block text-sm text-zinc-500 underline">
        Continue shopping
      </Link>
    </main>
  );
}
