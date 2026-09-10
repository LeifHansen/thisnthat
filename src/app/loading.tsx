/**
 * Root route-loading fallback. Several pages are force-dynamic (home,
 * dashboard, listings…) so soft navigations would otherwise freeze on the old
 * page with zero feedback until the server responded. Routes with their own
 * loading.tsx (e.g. /browse) override this.
 */
export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <span
        className="h-10 w-10 rounded-full border-4 border-[var(--tnt-line)] border-t-[var(--tnt-red)] animate-spin"
        role="status"
        aria-label="Loading"
      />
      <p className="text-muted text-sm font-semibold">Loading…</p>
    </div>
  );
}
