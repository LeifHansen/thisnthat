import Link from "next/link";
import { isAuthConfigured, isGoogleEnabled, isDevLoginEnabled } from "@/auth";
import { devSignIn, googleSignIn } from "@/lib/actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Welcome to ThisNThat</h1>
      <p className="mt-2 text-zinc-500">
        Sign in to buy, make offers, and run your own store.
      </p>

      {!isAuthConfigured ? (
        <div className="mt-6 w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          Authentication isn&apos;t configured yet. Add <code>DATABASE_URL</code>,{" "}
          <code>AUTH_SECRET</code>, and a provider (Google, or{" "}
          <code>ALLOW_DEV_LOGIN=true</code>) to enable sign-in.
        </div>
      ) : (
        <div className="mt-6 w-full space-y-4">
          {isGoogleEnabled && (
            <form action={googleSignIn}>
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white hover:bg-indigo-500"
              >
                Continue with Google
              </button>
            </form>
          )}

          {isGoogleEnabled && isDevLoginEnabled && (
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              or
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          )}

          {isDevLoginEnabled && (
            <form action={devSignIn} className="space-y-2 text-left">
              <label className="block text-sm font-medium">Dev sign-in (email only)</label>
              <div className="flex gap-2">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@email.com"
                  className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Sign in
                </button>
              </div>
              <p className="text-xs text-zinc-400">
                Passwordless dev login (sandbox only). Use{" "}
                <code>admin@thisnthat.com</code> for the super-admin account.
              </p>
            </form>
          )}
        </div>
      )}

      <Link href="/" className="mt-6 text-sm text-zinc-500 hover:underline">
        ← Keep browsing
      </Link>
    </main>
  );
}
