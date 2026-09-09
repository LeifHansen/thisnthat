import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto text-center space-y-4 py-16">
      <p className="tnt-badge mx-auto">404</p>
      <h1 className="text-3xl sm:text-4xl">Page not found</h1>
      <p className="text-muted">
        We couldn&apos;t find that page. It may have moved, or the listing may
        have sold.
      </p>
      <div className="pt-2">
        <Link className="tnt-btn" href="/">
          Back to the marketplace
        </Link>
      </div>
    </div>
  );
}
