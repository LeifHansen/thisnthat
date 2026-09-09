"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { firstRealPhoto, PLACEHOLDER_PHOTO } from "@/lib/photos";
import { listingImageAlt } from "@/lib/image-seo";
import { formatCents } from "@/lib/fees";

type Item = { id: string; title: string; priceCents: number; photos: string[] };

/**
 * Horizontal "Newly Listed" rail. The scrollbar is hidden (bx-noscrollbar) and
 * navigation is via arrow buttons that scroll ~80% of the viewport width. The
 * arrows dim + disable at each end; on touch (mobile) they're hidden and users
 * swipe instead.
 */
export function NewlyListedRail({ items }: { items: Item[] }) {
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
    "hidden sm:grid place-items-center absolute top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border-2 border-[var(--bx-ink)] bg-white !text-ink shadow-[0_2px_0_var(--bx-ink)] transition disabled:opacity-0 disabled:pointer-events-none hover:bg-[var(--bx-surface)]";

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
        className="flex gap-3 overflow-x-auto bx-noscrollbar pb-1 -mx-1 px-1 snap-x"
      >
        {items.map((l) => (
          <Link
            key={l.id}
            href={`/listings/${l.id}`}
            className="snap-start shrink-0 w-40 sm:w-48 bx-panel p-2.5 space-y-2 !text-ink hover:shadow-[var(--bx-shadow-lg)] transition-shadow"
          >
            {/* Temporary "New Listing" frame (red border + corner ribbon) */}
            <div className="relative aspect-square overflow-hidden rounded-lg border-[3px] border-[var(--bx-red)] bg-[var(--bx-surface)]">
              <Image
                src={firstRealPhoto(l.photos) ?? PLACEHOLDER_PHOTO}
                alt={listingImageAlt(l.title)}
                fill
                sizes="200px"
                className="object-cover"
              />
              <span className="absolute left-[-38px] top-[14px] -rotate-45 bg-[var(--bx-red)] text-white text-[9px] font-bold tracking-widest px-10 py-0.5 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
                NEW LISTING
              </span>
            </div>
            <p className="text-sm font-bold leading-tight line-clamp-2">{l.title}</p>
            <p className="text-base font-extrabold text-[var(--bx-red)] leading-none">
              {formatCents(l.priceCents)}
            </p>
          </Link>
        ))}
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
