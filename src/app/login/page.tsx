import Link from "next/link";
import { isAuthConfigured } from "@/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Welcome to ThisNThat</h1>
      <p className="mt-2 text-zinc-500">
        Sign in to buy, make offers, and run your own store.
      </p>

      {isAuthConfigured ? (
        <Link
          href="/api/auth/signin"
          className="mt-6 w-full rounded-lg bg-indigo-600 py-3 font-medium text-white hover:bg-indigo-500"
        >
          Continue with Google
        </Link>
      ) : (
        <div className="mt-6 w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          Authentication isn&apos;t configured yet. Add <code>DATABASE_URL</code>,{" "}
          <code>AUTH_SECRET</code>, and Google OAuth credentials to enable sign-in.
        </div>
      )}

      <Link href="/" className="mt-6 text-sm text-zinc-500 hover:underline">
        ← Keep browsing
      </Link>
    </main>
  );
}
