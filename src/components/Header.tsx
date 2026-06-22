import Link from "next/link";
import { getCurrentUser, isAuthConfigured } from "@/auth";
import { signOutAction } from "@/lib/actions";

export async function Header() {
  const user = await getCurrentUser();
  const admin = user?.role === "super_admin" || !isAuthConfigured;
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            T
          </span>
          <span className="text-lg font-semibold tracking-tight">ThisNThat</span>
        </Link>

        <div className="mx-auto hidden w-full max-w-md sm:block">
          <input
            disabled
            placeholder="Search vintage, sneakers, memorabilia…"
            className="w-full rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <nav className="ml-auto flex items-center gap-2 sm:ml-0">
          {admin && (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950"
            >
              Admin
            </Link>
          )}
          {user ? (
            <>
              <span className="hidden text-sm text-zinc-500 sm:inline" title={user.email}>
                {user.name || user.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign in
            </Link>
          )}
          <Link
            href="/sell"
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Sell
          </Link>
        </nav>
      </div>
    </header>
  );
}
