"use client";

import { useState } from "react";
import Link from "next/link";
import { PhotoUploader } from "@/components/PhotoUploader";
import { ListingOptimizer } from "@/components/ListingOptimizer";
import {
  CATEGORIES,
  getCategory,
  type AttributeField,
  type Attributes,
} from "@/lib/categories";
import { CONDITIONS } from "@/lib/listingOptions";
import type { Condition } from "@prisma/client";

export type EditListingInitial = {
  id: string;
  title: string;
  categorySlug: string;
  brand: string;
  itemName: string;
  condition: Condition;
  attributes: Attributes;
  description: string;
  price: string;
  quantity: string;
  photos: string[];
  minAutoAccept: string;
  status: string;
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
  /** Lot listings hide the single-item-only fields (brand, item, attributes, quantity). */
  isLot?: boolean;
  /** Human summary of the lot's contents, shown as a note. */
  lotSummary?: string;
}) {
  const [photos, setPhotos] = useState<string[]>(initial.photos);
  const [title, setTitle] = useState(initial.title);
  const [categorySlug, setCategorySlug] = useState(initial.categorySlug);
  const [brand, setBrand] = useState(initial.brand);
  const [itemName, setItemName] = useState(initial.itemName);
  const [condition, setCondition] = useState<Condition>(initial.condition);
  const [attributes, setAttributes] = useState<Attributes>(initial.attributes);
  const [description, setDescription] = useState(initial.description);
  const [autoAcceptOn, setAutoAcceptOn] = useState<boolean>(
    initial.minAutoAccept !== "",
  );
  const [busy, setBusy] = useState(false);
  // Which submit button was clicked, so the in-flight label matches it.
  const [intent, setIntent] = useState<"save" | "publish">("save");

  const category = getCategory(categorySlug);

  // A draft is saved but invisible: nothing links to it and Browse skips it.
  // It stays that way until the seller publishes, so this form offers the one
  // control that flips it live.
  const isDraft = initial.status === "DRAFT";

  // Switching category swaps the attribute fields. Values whose key exists in
  // both schemas ("colour", "era"…) carry over; the rest are dropped so the
  // hidden JSON never smuggles stale fields onto the listing.
  function changeCategory(slug: string) {
    setCategorySlug(slug);
    const next = getCategory(slug);
    setAttributes((prev) => {
      const keep: Attributes = {};
      for (const field of next?.attributes ?? []) {
        if (prev[field.key]) keep[field.key] = prev[field.key];
      }
      return keep;
    });
  }
  const setAttribute = (key: string, value: string) =>
    setAttributes((prev) => ({ ...prev, [key]: value }));

  const getOptimizeInput = () => ({
    title,
    brand,
    itemName,
    categorySlug,
    condition,
    attributes,
    description,
    photos,
  });

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
      action={updateListing}
      onSubmit={() => setBusy(true)}
      className="space-y-6"
    >
      {saveError && (
        <div className="tnt-panel p-4 border-2 border-red-400 bg-red-50">
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
        <div className="tnt-panel p-4 border-2 border-[var(--tnt-ink)] space-y-1">
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
          className="tnt-panel p-4 border-2"
          style={{
            background: "var(--tnt-purple-soft)",
            borderColor: "var(--tnt-purple)",
          }}
        >
          <p className="text-sm font-semibold text-[var(--tnt-purple-text)]">
            🎁 This is a lot{lotSummary ? ` — ${lotSummary}` : ""}.
          </p>
          <p className="text-muted text-xs mt-1">
            Edit the title, category, price, condition, photos, and
            description here. Changing what&apos;s in the lot isn&apos;t
            supported yet — relist the lot to change its contents.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
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
            className="tnt-input"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="categorySlug" className="font-semibold">
            Category
          </label>
          <select
            id="categorySlug"
            name="categorySlug"
            required
            value={categorySlug}
            onChange={(e) => changeCategory(e.target.value)}
            className="tnt-input"
          >
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="condition" className="font-semibold">
            Condition
          </label>
          <select
            id="condition"
            name="condition"
            required
            value={condition}
            onChange={(e) => setCondition(e.target.value as Condition)}
            className="tnt-input"
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} — {c.hint}
              </option>
            ))}
          </select>
        </div>
        {!isLot && (
          <div className="space-y-1.5">
            <label htmlFor="brand" className="font-semibold">
              Brand <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="brand"
              name="brand"
              maxLength={80}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Levi's, Nintendo, handmade…"
              className="tnt-input"
            />
          </div>
        )}
        {!isLot && (
          <div className="space-y-1.5">
            <label htmlFor="itemName" className="font-semibold">
              Item name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="itemName"
              name="itemName"
              maxLength={160}
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="What is it, in a few words"
              className="tnt-input"
            />
          </div>
        )}
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
            className="tnt-input"
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
              className="tnt-input"
            />
          </div>
        )}
      </div>

      {/* Per-category attributes. Rendered from the category schema — the
          form never branches on a slug. Submitted as one JSON map. */}
      {!isLot && (
        <div className="tnt-panel p-4 space-y-3">
          <input type="hidden" name="attributes" value={JSON.stringify(attributes)} />
          <div>
            <p className="font-semibold text-ink">
              {category ? `${category.emoji} ${category.name} details` : "Details"}
            </p>
            <p className="text-xs text-muted">
              All optional. Shown as a spec table on the listing and used by
              the browse filters.
            </p>
          </div>
          {category && category.attributes.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {category.attributes.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label htmlFor={`attr-${field.key}`} className="text-sm font-semibold">
                    {field.label}
                  </label>
                  <AttributeInput
                    id={`attr-${field.key}`}
                    field={field}
                    value={attributes[field.key] ?? ""}
                    onChange={(v) => setAttribute(field.key, v)}
                  />
                  {field.hint && (
                    <p className="text-xs text-muted">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {category
                ? "Nothing extra needed for this category."
                : "Pick a category to see its details."}
            </p>
          )}
        </div>
      )}

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
          className="tnt-input"
        />
      </div>

      {/* Auto-accept floor */}
      <div className="tnt-panel p-4 space-y-3">
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
              className="tnt-input max-w-xs"
            />
          </div>
        )}
        {/* When the toggle is off we submit an empty value to clear the floor. */}
        {!autoAcceptOn && (
          <input type="hidden" name="minAutoAccept" value="" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isDraft && (
          <button
            type="submit"
            name="intent"
            value="publish"
            onClick={() => setIntent("publish")}
            disabled={busy}
            className="tnt-btn disabled:opacity-60"
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
            isDraft ? "tnt-btn tnt-btn--ghost" : "tnt-btn"
          }`}
        >
          {busy && intent === "save"
            ? "Saving…"
            : isDraft
              ? "Save draft"
              : "Save changes"}
        </button>
        <Link href={`/listings/${initial.id}`} className="tnt-btn tnt-btn--ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** One attribute field from a category schema. */
function AttributeInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AttributeField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <select
        id={id}
        className="tnt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "number") {
    return (
      <input
        id={id}
        className="tnt-input"
        type="number"
        min={field.min}
        max={field.max}
        step={1}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      id={id}
      className="tnt-input"
      value={value}
      maxLength={120}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
