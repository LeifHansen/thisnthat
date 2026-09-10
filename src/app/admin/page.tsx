import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin, isSuperadmin } from "@/lib/guards";
import { AdminHeader } from "./AdminHeader";
import { AdminOverview } from "./AdminOverview";
import { AdminTrends } from "./AdminTrends";
import { loadKpis, loadQueueCounts, loadTrends, type Kpis } from "./data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  // The superadmin's overview lives in their dashboard Admin tab — keep a single
  // canonical location and send them there. Other admins (HQ) use this page.
  if (isSuperadmin(admin)) redirect("/dashboard?tab=admin");
  const superadmin = false;

  let kpis: Kpis | null = null;
  try {
    kpis = await loadKpis();
  } catch (e) {
    console.error("admin: failed to load KPIs", e);
  }
  const [queue, trends] = await Promise.all([
    loadQueueCounts(),
    loadTrends(),
  ]);

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin={superadmin} ordersCount={queue.total} />
      <AdminOverview kpis={kpis} queue={queue} superadmin={superadmin} />
      <AdminTrends trends={trends} />
    </div>
  );
}
