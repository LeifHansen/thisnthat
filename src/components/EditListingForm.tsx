"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PhotoUploader } from "@/components/PhotoUploader";
import { AuthBadge } from "@/components/AuthBadge";
import { ListingOptimizer } from "@/components/ListingOptimizer";
import { LISTING_CONDITIONS, isCanonicalCondition } from "@/lib/listingOptions";
import type { AuthType } from "@prisma/client";

export type EditListingInitial = {
  quantity: string;
  id: string;
  title: string;
  beanieName: string;
  year: string;
  condition: string;
  description: string;
  price: string;
  photos: string[];
  minAutoAccept: string;
  authType: AuthType;
  status: string;
  registrationNumber: string | null;
  trueBlueCertId: string | null;
  coaImageUrl: string | null;
  grade: string | null;
};

export function EditListingForm({
  initial,
  updateListing,
  saveError = false,
  saveErrorReason,
  isLot = false,
  lotSummary,
}: {
  initial: EditListingInitial;
  updateListing: (formData: FormData) => Promise<void>;
  /** True when the last save was rejected by validation (?error=1). */
  saveError?: boolean;
  /** Specific field-level reason the last save failed, if known. */
  saveErrorReason?: string;
  /** Lot listings hide the single-beanie fields and sync beanieName to title. */
  isLot?: boolean;
  /** Human summary of the lot's contents, shown as a note. */
  lotSummary?: string;
}) {
  const [photos, setPhotos] = useState<string[]>(initial.photos);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [autoAcceptOn, setAutoAcceptOn] = useState<boolean>(
    initial.minAutoAccept !== "",
  );
  const [authType, setAuthType] = useState<AuthType>(initial.authType);
  const [busy, setBusy] = useState(false);
  // Which submit button was clicked, so the in-flight label matches it.
  const [intent, setIntent] = useState<"save" | "publish">("save");
  const formRef = useRef<HTMLFormElement>(null);

  // A draft is saved but invisible: nothing links to it and Browse skips it.
  // It stays that way until the seller publishes, so this form offers the one
  // control that flips it live.
  const isDraft = initial.status === "DRAFT";

  // Older listings, lots ("Mixed — see photos") and imports can hold a
  // condition that isn't in the current vocabulary. The field is `required`,
  // so if the stored value matched no <option> the select would sit empty and
  // the browser would refuse to submit — every save silently doing nothing.
  // Carry the stored value as its own option instead (same escape hatch the
  // authType select uses for legacy BX_EXPRESS_COA).
  const legacyCondition =
    initial.condition && !isCanonicalCondition(initial.condition)
      ? initial.condition
      : null;

  const getOptimizeInput = () => {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    return {
      beanieName: (fd?.get("beanieName") as string) || initial.beanieName,
      title,
      description,
      condition: (fd?.get("condition") as string) || initial.condition,
      year: (fd?.get("year") as string) || initial.year,
      photos,
    };
  };

  // The optimizer only analyses the first few photos, so `order` may cover
  // fewer indices than the seller actually has. Reorder the ones it ranked,
  // then keep any remaining photos (in their original order) so nothing is
  // silently dropped on a listing with more than four photos.
  const applyOrder = (order: number[]) =>
    setPhotos((prev) => {
      const used = new Set(order);
      const picked = order.map((i) => prev[i]).filter(Boolean);
      const rest = prev.filter((_, i) => !used.has(i));
      return [...picked, ...rest];
    });

  return (
    <form
      ref={formRef}
      action={updateListing}
      onSubmit={() => setBusy(true)}
      className="space-y-6"
    >
      {saveError && (
        <div className="bx-panel p-4 border-2 border-red-400 bg-red-50">
          <p className="text-red-700 text-sm font-semibold">
            Your last save didn&apos;t go through — something failed
            validation. Check that the price is set, required fields are
            filled, and photo links are valid image URLs, then save again.
          </p>
          {saveErrorReason && (
            <p className="text-red-700 text-sm mt-1">
              Details: {saveErrorReason}
            </p>
          )}
        </div>
      )}
      {isDraft && (
        <div className="bx-panel p-4 border-2 border-[var(--bx-ink)] space-y-1">
          <p className="text-sm font-semibold text-ink">
            This listing is a draft — buyers can&apos;t see it yet.
          </p>
          <p className="text-sm text-muted">
            Saving keeps it a draft. Use <strong>Publish listing</strong> below
            to put it on Browse.
          </p>
        </div>
      )}

      {/* Photos — PhotoUploader emits the hidden `photos` field itself. */}
      <div className="space-y-2">
        <label className="font-semibold">Photos</label>
        <PhotoUploader value={photos} onChange={setPhotos} />
        <p className="text-xs text-muted">
          The first photo is used as the cover. Listings with no photo show an
          illustration.
        </p>
      </div>

      <ListingOptimizer
        getInput={getOptimizeInput}
        onApplyTitle={setTitle}
        onApplyDescription={setDescription}
        onApplyOrder={applyOrder}
      />

      {isLot && (
        <div
          className="bx-panel p-4 border-2"
          style={{
            background: "var(--bx-purple-soft)",
            borderColor: "var(--bx-purple)",
          }}
        >
          <p className="text-sm font-semibold text-[var(--bx-purple-text)]">
            🎁 This is a lot{lotSummary ? ` — ${lotSummary}` : ""}.
          </p>
          <p className="text-muted text-xs mt-1">
            Edit the title, price, condition, photos, and description here.
            Changing which beanies are in the lot isn&apos;t supported yet —
            relist the lot to change its contents.
          </p>
          {/* A lot's beanieName mirrors its title; keep them in sync on save. */}
          <input type="hidden" name="beanieName" value={title} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="title" className="font-semibold">
            {isLot ? "Lot title" : "Listing title"}
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bx-input"
          />
        </div>
        {!isLot && (
          <div className="space-y-1.5">
            <label htmlFor="beanieName" className="font-semibold">
              Beanie name
            </label>
            <input
              id="beanieName"
              name="beanieName"
              required
              maxLength={160}
              defaultValue={initial.beanieName}
              className="bx-input"
            />
          </div>
        )}
        {!isLot && (
          <div className="space-y-1.5">
            <label htmlFor="year" className="font-semibold">
              Year <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min={1980}
              max={2100}
              defaultValue={initial.year}
              className="bx-input"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="condition" className="font-semibold">
            Condition
          </label>
          <select
            id="condition"
            name="condition"
            required
            defaultValue={initial.condition}
            className="bx-input"
          >
            <option value="">Select…</option>
            {legacyCondition && (
              <option value={legacyCondition}>{legacyCondition}</option>
            )}
            {LISTING_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="price" className="font-semibold">
            Price (USD)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min={0.01}
            step={0.01}
            required
            defaultValue={initial.price}
            className="bx-input"
          />
        </div>
        {!isLot && (
          <div className="space-y-1.5">
            <label htmlFor="quantity" className="font-semibold">
              Quantity available
            </label>
            {/* The baseline the form was rendered with. The server applies the
                seller's change as a DELTA from this, so a unit reserved by a
                concurrent checkout isn't silently restocked by the save. */}
            <input
              type="hidden"
              name="quantityBaseline"
              value={initial.quantity}
            />
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              max={999}
              step={1}
              defaultValue={initial.quantity}
              className="bx-input"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="font-semibold">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bx-input"
        />
      </div>

      {/* Auto-accept floor */}
      <div className="bx-panel p-4 space-y-3">
        <label className="flex items-center gap-2 font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={autoAcceptOn}
            onChange={(e) => setAutoAcceptOn(e.target.checked)}
          />
          Auto-accept offers at or above a floor
        </label>
        {autoAcceptOn && (
          <div className="space-y-1.5">
            <label htmlFor="minAutoAccept" className="text-sm text-muted">
              Any offer at or above this amount is accepted automatically.
            </label>
            <input
              id="minAutoAccept"
              name="minAutoAccept"
              type="number"
              min={0.01}
              step={0.01}
              defaultValue={initial.minAutoAccept}
              className="bx-input max-w-xs"
            />
          </div>
        )}
        {/* When the toggle is off we submit an empty value to clear the floor. */}
        {!autoAcceptOn && (
          <input type="hidden" name="minAutoAccept" value="" />
        )}
      </div>

      {/* Authentication: pick the backing service + cert/registry number.
          Lots stay as-is / third-party COA (per-beanie certs don't apply). */}
      <div className="bx-panel p-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink font-semibold">Authentication</span>
          <AuthBadge
            authType={authType}
            registrationNumber={initial.registrationNumber}
            grade={initial.grade}
          />
        </div>
        <select
          name="authType"
          className="bx-input"
          value={authType}
          onChange={(e) => setAuthType(e.target.value as AuthType)}
        >
          {!isLot && <option value="TRUE_BLUE">True Blue verified</option>}
          {!isLot && (
            <option value="BX_FULL_SERVICE">BX authenticated</option>
          )}
          <option value="THIRD_PARTY_COA">Other (third-party COA)</option>
          <option value="UNAUTHENTICATED">
            Unauthenticated — sold as-is
          </option>
          {initial.authType === "BX_EXPRESS_COA" && (
            <option value="BX_EXPRESS_COA">BX Express COA</option>
          )}
        </select>
        {authType === "TRUE_BLUE" && (
          <label className="block space-y-1.5">
            <span className="text-ink">True Blue cert ID</span>
            <input
              name="trueBlueCertId"
              className="bx-input"
              defaultValue={initial.trueBlueCertId ?? ""}
              placeholder="TBB-…"
              maxLength={120}
            />
          </label>
        )}
        {authType === "BX_FULL_SERVICE" && (
          <label className="block space-y-1.5">
            <span className="text-ink">BX Registry number</span>
            <input
              name="registrationNumber"
              className="bx-input"
              defaultValue={initial.registrationNumber ?? ""}
              placeholder="BX-…"
              maxLength={120}
            />
            <span className="block text-xs text-muted">
              The registry number from your BX authentication.
            </span>
          </label>
        )}
        {authType === "THIRD_PARTY_COA" && (
          <label className="block space-y-1.5">
            <span className="text-ink">COA image URL</span>
            <input
              name="coaImageUrl"
              className="bx-input"
              defaultValue={initial.coaImageUrl ?? ""}
              placeholder="https://…"
              maxLength={2048}
            />
          </label>
        )}
        <p className="text-xs text-muted">
          Buyers see this as the authentication badge on your listing. Don&apos;t
          have a cert yet? Submit the item via Authenticate &amp; Grade.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isDraft && (
          <button
            type="submit"
            name="intent"
            value="publish"
            onClick={() => setIntent("publish")}
            disabled={busy}
            className="bx-btn disabled:opacity-60"
          >
            {busy && intent === "publish" ? "Publishing…" : "Publish listing"}
          </button>
        )}
        <button
          type="submit"
          name="intent"
          value="save"
          onClick={() => setIntent("save")}
          disabled={busy}
          className={`disabled:opacity-60 ${
            isDraft ? "bx-btn bx-btn--ghost" : "bx-btn"
          }`}
        >
          {busy && intent === "save"
            ? "Saving…"
            : isDraft
              ? "Save draft"
              : "Save changes"}
        </button>
        <Link href={`/listings/${initial.id}`} className="bx-btn bx-btn--ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
