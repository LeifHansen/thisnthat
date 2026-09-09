import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { AdminNav } from "./AdminNav";

export function AdminHeader({
  isSuperadmin,
  ordersCount = 0,
}: {
  isSuperadmin: boolean;
  /** Orders needing attention — the badge on the Orders tab. */
  ordersCount?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--tnt-dark)] text-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--tnt-red)] px-2.5 py-1 text-xs font-bold">
            {isSuperadmin ? "SUPERADMIN" : "ADMIN"}
          </span>
          <span className="text-sm font-semibold">{SITE_NAME} Admin</span>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm font-semibold !text-white"
        >
          ← Back to my account
        </Link>
      </div>
      <AdminNav isSuperadmin={isSuperadmin} ordersCount={ordersCount} />
    </div>
  );
}
