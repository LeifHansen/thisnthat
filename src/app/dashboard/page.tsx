import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, isSuperadmin } from "@/lib/guards";
import { Dashboard } from "@/components/Dashboard";
import { AdminOverview } from "@/app/admin/AdminOverview";
import { AdminTrends } from "@/app/admin/AdminTrends";
import { loadKpis, loadQueueCounts, loadTrends, type Kpis } from "@/app/admin/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; connected?: string }>;
}) {
  const user = await requireUser();
  const superadmin = isSuperadmin(user);
  const { tab, connected } = await searchParams;
  const adminTab = superadmin && tab === "admin";

  return (
    <div className="space-y-6">
      {/* Admin lives as a sub-tab of the dashboard for the superadmin
          (SUPERADMIN_EMAIL) only. Other admins reach the standalone /admin
          section via the header Admin pill. */}
      {superadmin && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-[var(--tnt-surface)] border border-[var(--tnt-line)] p-1.5">
          <DashTab href="/dashboard" label="My Account" active={!adminTab} />
          <DashTab href="/dashboard?tab=admin" label="Admin" active={adminTab} />
        </div>
      )}

      {adminTab ? (
        <AdminTab />
      ) : (
        // `connected` is the marker Stripe's return_url carries back after
        // onboarding. It was set on the URL but read nowhere, so finishing
        // setup looked exactly like never having started it.
        <Dashboard userId={user.id} connected={connected} />
      )}
    </div>
  );
}

async function AdminTab() {
  let kpis: Kpis | null = null;
  try {
    kpis = await loadKpis();
  } catch (e) {
    console.error("dashboard: failed to load admin KPIs", e);
  }
  const [queue, trends] = await Promise.all([
    loadQueueCounts(),
    loadTrends(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-xl bg-[var(--tnt-dark)] text-white px-4 py-3">
        <span className="rounded-full bg-[var(--tnt-red)] px-2.5 py-1 text-xs font-bold">
          SUPERADMIN
        </span>
        <span className="text-sm font-semibold">Admin Dashboard</span>
      </div>
      <AdminOverview kpis={kpis} queue={queue} superadmin />
      <AdminTrends trends={trends} />
    </div>
  );
}

function DashTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-[var(--tnt-dark)] !text-white" : "!text-ink hover:bg-black/5"
      }`}
    >
      {label}
    </Link>
  );
}
