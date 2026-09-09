"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PLACEHOLDER_PHOTO, isPlaceholder } from "@/lib/photos";
import { listingImageAlt } from "@/lib/image-seo";

/**
 * Swipeable photo gallery. Native horizontal scroll-snap (swipe on touch, drag/
 * scroll on desktop) with dot indicators; the larger variant adds prev/next
 * arrows. Falls back to the BX logo when there are no real photos.
 *
 * Safe to place inside a parent <Link>: the dot/arrow controls stop the click
 * from bubbling, and swiping scrolls rather than navigates.
 */
export function PhotoCarousel({
  photos,
  alt,
  compact = false,
  sizes,
  fit = "cover",
}: {
  photos: string[];
  alt: string;
  compact?: boolean;
  sizes?: string;
  /**
   * How photos fill the square frame. "cover" crops to fill (tidy grids);
   * "contain" shows the whole photo letterboxed (detail views, so nothing
   * gets cut off).
   */
  fit?: "cover" | "contain";
}) {
  const imgs = photos.filter((p) => p && !isPlaceholder(p));
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  const frame =
    "relative aspect-square overflow-hidden rounded-xl border border-[var(--bx-line)] bg-[var(--bx-surface)]";

  if (imgs.length === 0) {
    return (
      <div className={frame}>
        <Image
          src={PLACEHOLDER_PHOTO}
          alt={`${listingImageAlt(alt)} — photo coming soon`}
          fill
          sizes={sizes ?? "(max-width:768px) 50vw, 25vw"}
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  if (imgs.length === 1) {
    return (
      <div className={frame}>
        <Image
          src={imgs[0]}
          alt={listingImageAlt(alt)}
          fill
          sizes={sizes ?? "(max-width:768px) 100vw, 33vw"}
          className={fitClass}
        />
      </div>
    );
  }

  const goTo = (i: number, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={`${frame} group`}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory bx-noscrollbar"
      >
        {imgs.map((p, i) => (
          <div key={i} className="relative shrink-0 w-full h-full snap-center">
            <Image
              src={p}
              alt={listingImageAlt(alt, { index: i, total: imgs.length })}
              fill
              sizes={sizes ?? "(max-width:768px) 100vw, 33vw"}
              className={fitClass}
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
        {imgs.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to photo ${i + 1}`}
            onClick={(e) => {
              stop(e);
              goTo(i);
            }}
            className="h-6 w-6 grid place-items-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all shadow-[0_0_0_1px_rgba(0,0,0,0.15)] ${
                i === idx ? "w-4 bg-white" : "w-1.5 bg-white/70"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Counter (decorative — hidden from a11y tree so it doesn't pollute the
          accessible name of an ancestor listing link) */}
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 rounded-full bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5"
      >
        {idx + 1}/{imgs.length}
      </span>

      {/* Prev / next (larger variant) */}
      {!compact && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              stop(e);
              goTo(Math.max(0, idx - 1));
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 hover:bg-white text-[var(--bx-ink)] grid place-items-center shadow-[var(--bx-shadow-sm)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:!opacity-0"
            disabled={idx === 0}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              stop(e);
              goTo(Math.min(imgs.length - 1, idx + 1));
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 hover:bg-white text-[var(--bx-ink)] grid place-items-center shadow-[var(--bx-shadow-sm)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:!opacity-0"
            disabled={idx === imgs.length - 1}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
