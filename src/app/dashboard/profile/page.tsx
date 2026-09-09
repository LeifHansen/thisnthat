import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { deleteOwnAccount, updateProfile } from "@/lib/profileActions";
import { accountDeletionBlocker } from "@/lib/deleteAccount";
import { AvatarUploader } from "@/components/AvatarUploader";
import { displayNameOf } from "@/lib/users";
import { HANDLE_MAX, HANDLE_MIN, sellerPath } from "@/lib/handles";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Profile",
  robots: { index: false },
};

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleteError?: string }>;
}) {
  const { deleteError } = await searchParams;
  const user = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      shipFromPostalCode: true,
      handle: true,
    },
  });
  if (!me) return null;

  // Checked here rather than after they confirm: someone with an order still
  // in flight should be told before they type their email in, not after.
  const deletionBlocker = await accountDeletionBlocker(user.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Edit Profile</h1>
          <p className="text-muted text-sm">
            How you appear to buyers and sellers across the marketplace and in
            messages.
          </p>
        </div>
        <Link
          href={sellerPath(me)}
          className="text-sm font-semibold !text-[var(--tnt-red)] shrink-0"
        >
          View public profile →
        </Link>
      </div>

      <form action={updateProfile} className="tnt-panel p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="font-semibold text-sm">Profile photo</p>
          <AvatarUploader
            initialUrl={me.avatarUrl}
            fallbackName={displayNameOf(me)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="displayName" className="font-semibold text-sm block">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            defaultValue={me.displayName ?? ""}
            placeholder={me.name}
            maxLength={40}
            className="tnt-input"
          />
          <p className="text-xs text-muted">
            Shown on your listings, messages, and profile. Leave blank to use
            your account name ({me.name}).
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="handle" className="font-semibold text-sm block">
            Handle
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted shrink-0">{SITE_URL.replace(/^https?:\/\//, "")}/u/</span>
            <input
              id="handle"
              name="handle"
              defaultValue={me.handle ?? ""}
              placeholder="your-shop-name"
              minLength={HANDLE_MIN}
              maxLength={HANDLE_MAX}
              pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="tnt-input max-w-[16rem]"
            />
          </div>
          <p className="text-xs text-muted">
            Your public profile address. {HANDLE_MIN}–{HANDLE_MAX} lowercase
            letters, numbers and hyphens. Leave blank to keep the default link.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bio" className="font-semibold text-sm block">
            About you
          </label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={me.bio ?? ""}
            rows={4}
            maxLength={500}
            placeholder="Tell buyers about yourself — what you sell, how you pack and ship, what you're looking for…"
            className="tnt-input"
          />
          <p className="text-xs text-muted">Up to 500 characters.</p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="shipFromPostalCode"
            className="font-semibold text-sm block"
          >
            Ship-from ZIP code
          </label>
          <input
            id="shipFromPostalCode"
            name="shipFromPostalCode"
            defaultValue={me.shipFromPostalCode ?? ""}
            placeholder="e.g. 98126"
            maxLength={10}
            inputMode="numeric"
            className="tnt-input max-w-[12rem]"
          />
          <p className="text-xs text-muted">
            Where you ship your listings from. Buyers see live-calculated
            shipping instead of the flat ${"8"} estimate. Never shown publicly.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="tnt-btn">
            Save profile
          </button>
          <Link href="/dashboard" className="tnt-btn tnt-btn--ghost">
            Back to dashboard
          </Link>
        </div>
      </form>

      <section className="tnt-panel p-5 space-y-3 border-[var(--tnt-red)]/40">
        <h2 className="text-xl">Delete your account</h2>
        <p className="text-sm text-muted">
          This removes your profile, listings, messages, offers and reviews,
          and cannot be undone. Completed orders are kept — they
          are the other party&rsquo;s record of a real sale, and their receipts
          and tax records depend on them — but nothing on them identifies you
          any more.
        </p>

        {deletionBlocker ? (
          <p className="text-sm font-semibold text-[var(--tnt-red)]">
            {deletionBlocker.message}
          </p>
        ) : (
          <form action={deleteOwnAccount} className="space-y-3">
            {deleteError && (
              <p className="text-sm font-semibold text-[var(--tnt-red)]">
                {deleteError}
              </p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="confirmEmail" className="font-semibold text-sm block">
                Type <span className="font-mono">{me.email}</span> to confirm
              </label>
              <input
                id="confirmEmail"
                name="confirmEmail"
                autoComplete="off"
                placeholder="your email address"
                className="tnt-input max-w-sm"
              />
            </div>
            <button type="submit" className="tnt-btn tnt-btn--ghost">
              Delete my account permanently
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
