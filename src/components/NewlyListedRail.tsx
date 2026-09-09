"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ListingCardData } from "@/components/ListingCard";
import { ConditionBadge } from "@/components/ConditionBadge";
import { canOptimizeImage, firstRealPhoto, PLACEHOLDER_PHOTO } from "@/lib/photos";
import { listingImageAlt } from "@/lib/image-seo";
import { formatCents } from "@/lib/fees";

export type RailItem = Pick<
  ListingCardData,
  "id" | "title" | "priceCents" | "photos" | "condition"
>;

/**
 * Horizontal "Newly listed" rail. The scrollbar is hidden (tnt-noscrollbar)
 * and navigation is via arrow buttons that scroll ~80% of the viewport width.
 * The arrows dim + disable at each end; on touch (mobile) they're hidden and
 * users swipe instead.
 */
export function NewlyListedRail({ items }: { items: RailItem[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  useEffect(() => {
    updateEdges();
    const el = railRef.current;
    if (!el) return;
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);

  function nudge(dir: -1 | 1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(240, el.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  const arrowBase =
    "hidden sm:grid place-items-center absolute top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-[var(--tnt-line-strong)] bg-white !text-ink shadow-[var(--tnt-shadow)] transition disabled:opacity-0 disabled:pointer-events-none hover:bg-[var(--tnt-surface)]";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={atStart}
        aria-label="Scroll to previous listings"
        className={`${arrowBase} -left-2`}
      >
        <Chevron dir="left" />
      </button>

      <div
        ref={railRef}
        onScroll={updateEdges}
        className="flex gap-3 overflow-x-auto tnt-noscrollbar pb-1 -mx-1 px-1 snap-x"
      >
        {items.map((l) => {
          const photo = firstRealPhoto(l.photos) ?? PLACEHOLDER_PHOTO;
          return (
            <Link
              key={l.id}
              href={`/listings/${l.id}`}
              className="snap-start shrink-0 w-40 sm:w-48 tnt-card p-2.5 space-y-2 !text-ink"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--tnt-surface)]">
                <Image
                  src={photo}
                  alt={listingImageAlt(l.title)}
                  fill
                  sizes="(max-width: 640px) 160px, 192px"
                  className="object-cover"
                  unoptimized={!canOptimizeImage(photo)}
                />
                <span className="absolute left-2 top-2 rounded-full bg-[var(--tnt-ink)]/85 text-white text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">
                  Just listed
                </span>
              </div>
              <p className="text-sm font-semibold leading-tight line-clamp-2">
                {l.title}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold text-[var(--tnt-red)] leading-none">
                  {formatCents(l.priceCents)}
                </p>
                <ConditionBadge condition={l.condition} />
              </div>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={atEnd}
        aria-label="Scroll to more listings"
        className={`${arrowBase} -right-2`}
      >
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir === "left" ? (
        <path d="M10 3.5 5.5 8 10 12.5" />
      ) : (
        <path d="M6 3.5 10.5 8 6 12.5" />
      )}
    </svg>
  );
}
