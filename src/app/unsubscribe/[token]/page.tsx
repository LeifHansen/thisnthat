import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { saveNotifyPrefsByToken } from "@/lib/notifyPrefs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email notification settings",
  robots: { index: false, follow: false },
};

const CATEGORIES: {
  key: "notifyOrders" | "notifyOffers" | "notifyMessages" | "notifySocial" | "notifyTips";
  label: string;
  blurb: string;
}[] = [
  { key: "notifyOrders", label: "Orders", blurb: "Sales, shipping, and payout updates" },
  { key: "notifyOffers", label: "Offers", blurb: "New offers and accept/decline decisions" },
  { key: "notifyMessages", label: "Messages", blurb: "When someone sends you a direct message" },
  { key: "notifySocial", label: "Followers", blurb: "When a collector follows your store" },
  { key: "notifyTips", label: "Tips & nudges", blurb: "Occasional pointers to get more from your store" },
];

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { token } = await params;
  const { saved } = await searchParams;

  const user =
    token === "invalid"
      ? null
      : await prisma.user
          .findUnique({
            where: { unsubscribeToken: token },
            select: {
              notifyOrders: true,
              notifyOffers: true,
              notifyMessages: true,
              notifySocial: true,
              notifyTips: true,
            },
          })
          .catch(() => null);

  if (!user) {
    return (
      <div className="max-w-md mx-auto bx-panel p-8 text-center space-y-3">
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-muted text-sm">
          The unsubscribe link is no longer valid. You can manage notifications
          from your account settings instead.
        </p>
        <Link href="/dashboard/profile" className="bx-btn inline-block">
          Go to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl">Email notifications</h1>
        <p className="text-muted text-sm">
          Choose which emails you&apos;d like to receive from BeanieXchange.
          Purchase receipts always send.
        </p>
      </div>

      {saved && (
        <div className="bx-panel p-3 text-sm text-green border-l-4 border-[var(--bx-green)]">
          Your preferences were saved.
        </div>
      )}

      <form action={saveNotifyPrefsByToken} className="bx-panel p-5 space-y-4">
        <input type="hidden" name="token" value={token} />
        {CATEGORIES.map((c) => (
          <label key={c.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name={c.key}
              defaultChecked={user[c.key]}
              className="mt-1 h-4 w-4 accent-[var(--bx-red)]"
            />
            <span>
              <span className="font-semibold text-ink block">{c.label}</span>
              <span className="text-muted text-sm">{c.blurb}</span>
            </span>
          </label>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" name="intent" value="save" className="bx-btn">
            Save preferences
          </button>
          <button
            type="submit"
            name="intent"
            value="all-off"
            className="bx-btn bx-btn--ghost"
          >
            Unsubscribe from all
          </button>
        </div>
      </form>
    </div>
  );
}
