// Shared domain types for the ThisNThat marketplace.

export type CategorySlug =
  | "clothing"
  | "shoes"
  | "accessories"
  | "memorabilia"
  | "collectables";

export interface Category {
  id: string;
  slug: CategorySlug;
  name: string;
  sort: number;
}

export interface StoreTheme {
  primary: string;
  accent: string;
  banner_url: string | null;
  logo_url: string | null;
  layout: "grid" | "list";
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  theme: StoreTheme;
}

export type ListingStatus = "draft" | "active" | "sold" | "removed";

export interface Listing {
  id: string;
  store: Store;
  category_slug: CategorySlug;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  condition: string | null;
  brand: string | null;
  size: string | null;
  allow_offers: boolean;
  min_offer_cents: number | null;
  status: ListingStatus;
  images: string[];
  created_at: string;
}

export function formatPrice(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
