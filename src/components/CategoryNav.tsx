import Link from "next/link";
import type { Category, CategorySlug } from "@/lib/types";

export function CategoryNav({
  categories,
  active,
}: {
  categories: Category[];
  active?: CategorySlug;
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      <Pill href="/" label="All" active={!active} />
      {categories.map((c) => (
        <Pill
          key={c.slug}
          href={`/?category=${c.slug}`}
          label={c.name}
          active={active === c.slug}
        />
      ))}
    </nav>
  );
}

function Pill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </Link>
  );
}
