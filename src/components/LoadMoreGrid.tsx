"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListingCard, type ListingCardData } from "@/components/ListingCard";

/**
 * Infinite-scroll storefront grid. Server-renders the first page, then
 * appends pages from /api/listings as the shopper nears the bottom (with a
 * manual "Load more" fallback).
 */
export function LoadMoreGrid({
  initialItems,
  initialNextOffset,
}: {
  initialItems: ListingCardData[];
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState<ListingCardData[]>(initialItems);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || nextOffset === null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings?offset=${nextOffset}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: ListingCardData[];
        nextOffset: number | null;
      };
      setItems((prev) => {
        // A page boundary can shift under us (a listing sells or is added
        // between requests), so drop anything already rendered.
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...data.items.filter((l) => !seen.has(l.id))];
      });
      setNextOffset(data.nextOffset);
    } catch {
      // transient network error — the Load more button stays available
    } finally {
      setLoading(false);
    }
  }, [loading, nextOffset]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || nextOffset === null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore, nextOffset]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {nextOffset !== null && (
        <div ref={sentinel} className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="tnt-btn tnt-btn--ghost"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
