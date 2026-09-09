"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BeanieOptionCard } from "@/components/BeanieOptionCard";
import type { BeanieOption } from "@/lib/listings";

/**
 * Infinite-scroll storefront grid of beanie options. Server-renders the first
 * page, then appends pages from /api/listings as the shopper nears the bottom
 * (with a manual "Load more" fallback).
 */
export function LoadMoreGrid({
  initialItems,
  initialNextOffset,
}: {
  initialItems: BeanieOption[];
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState<BeanieOption[]>(initialItems);
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
        items: BeanieOption[];
        nextOffset: number | null;
      };
      setItems((prev) => [...prev, ...data.items]);
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
        {items.map((o) => (
          <BeanieOptionCard key={o.beanieName} option={o} />
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
            {loading ? "Loading…" : "Load more beanies"}
          </button>
        </div>
      )}
    </>
  );
}
