/**
 * Instant skeleton for /browse. The page is force-dynamic and hits the DB on
 * every navigation, so without this the hero's "Start Your Collection" click
 * shows no feedback for several seconds and reads as a dead button.
 */
export default function BrowseLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading beanies">
      <h1 className="text-2xl">Browse Beanies</h1>

      <div className="flex gap-2 flex-wrap items-center">
        {[64, 88, 120, 140, 170].map((w) => (
          <span
            key={w}
            className="bx-badge animate-pulse text-transparent select-none"
            style={{ width: w }}
          >
            &nbsp;
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bx-panel p-3 h-full flex flex-col gap-2.5">
            <div className="animate-pulse rounded-lg bg-[var(--bx-line)] aspect-square" />
            <div className="animate-pulse rounded bg-[var(--bx-line)] h-4 w-3/4" />
            <div className="animate-pulse rounded bg-[var(--bx-line)] h-6 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
