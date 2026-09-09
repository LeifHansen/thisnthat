"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BeanieEntry } from "@/lib/beanie-types";

// Searchable dropdown over the BX Beanie catalogue. Ranking + resolution run on
// the server (GET /api/beanies/suggest) so the ~2,700-entry catalogue never
// ships to the browser. As the seller types we recommend the closest catalogue
// entries and auto-link the listing to the confidently-resolved entry; sellers
// can pick a different suggestion, and free text is still allowed.

export function BeanieCombobox({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  /** Fired on every edit; `linked` is the catalogue entry the text resolves to. */
  onChange: (name: string, linked: BeanieEntry | null) => void;
  placeholder?: string;
  /** Accessible name — required when the combobox isn't wrapped in a <label>. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Flips true on first focus and stays true. The typeahead effect is gated
  // on this rather than `open` so that (a) mounting never fires a
  // full-catalogue request per combobox — LotWizard renders one per row and
  // the suggest endpoint is rate-limited — but (b) closing the dropdown
  // mid-debounce still delivers the in-flight `linked` resolution (blurring
  // to the next field must not lose the catalogue link).
  const [engaged, setEngaged] = useState(false);
  const [hi, setHi] = useState(0);
  const [matches, setMatches] = useState<BeanieEntry[]>([]);
  const [linked, setLinked] = useState<BeanieEntry | null>(null);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Keep the latest onChange without making it a fetch-effect dependency.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const hasQuery = value.trim().length > 0;

  // Debounced server typeahead. On resolution we propagate `linked` to the
  // parent (the text is already synced by the input's onChange). Skipped
  // until the seller first focuses the field (see `engaged` above).
  useEffect(() => {
    if (!engaged) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/beanies/suggest?q=${encodeURIComponent(value.trim())}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const m: BeanieEntry[] = Array.isArray(data.matches) ? data.matches : [];
        const l: BeanieEntry | null = data.linked ?? null;
        setMatches(m);
        setLinked(l);
        onChangeRef.current(value, l);
      } catch {
        // network hiccup — leave the last matches in place
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, engaged]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[hi] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function pick(b: BeanieEntry) {
    setLinked(b);
    onChangeRef.current(b.name, b);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        className="bx-input"
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setEngaged(true);
          setHi(0);
        }}
        onChange={(e) => {
          // Sync the text immediately; the debounced fetch resolves the link.
          onChangeRef.current(e.target.value, null);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && matches[hi]) {
              e.preventDefault();
              pick(matches[hi]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[var(--bx-line-strong)] bg-[var(--bx-card)] shadow-lg">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {hasQuery
              ? linked
                ? `✓ Linked to “${linked.name}” — or pick another`
                : "Recommended matches — pick one to link"
              : "Start typing to search the catalogue"}
          </p>
          {matches.length > 0 ? (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="max-h-64 overflow-y-auto py-1"
            >
              {matches.map((b, i) => (
                <li
                  key={`${b.name}-${b.styleNumber ?? i}`}
                  role="option"
                  aria-selected={i === hi}
                  className={`px-3 py-2 cursor-pointer text-sm flex items-baseline justify-between gap-2 ${
                    i === hi ? "bg-[var(--bx-surface)]" : ""
                  }`}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => {
                    // mousedown (not click) so the input's blur can't close
                    // the list before the selection lands.
                    e.preventDefault();
                    pick(b);
                  }}
                >
                  <span className="font-medium">
                    {linked?.name === b.name && (
                      <span className="text-[var(--bx-green)] mr-1" aria-hidden>
                        ✓
                      </span>
                    )}
                    {b.name}
                  </span>
                  <span className="text-muted text-xs whitespace-nowrap">
                    {b.animal}
                    {b.year ? ` · ${b.year}` : ""}
                    {b.styleNumber ? ` · #${b.styleNumber}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            hasQuery && (
              <p className="px-3 py-2 text-sm text-muted">
                No catalogue match — you can still list &ldquo;{value.trim()}
                &rdquo; as a custom name.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
