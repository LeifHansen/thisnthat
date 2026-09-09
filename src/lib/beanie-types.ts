// Lightweight catalogue types + the category list, split out from
// beanie-database.ts (which holds the ~2,700-entry BEANIES array). Client
// components import these instead of beanie-database so the whole catalogue
// never lands in the browser bundle.

export type BeanieCategory =
  | "Bears"
  | "Animals"
  | "Aquatic"
  | "Birds"
  | "Dinosaurs"
  | "Insect"
  | "Mythical"
  | "Reptile"
  | "Rodent"
  | "Non-Animal"
  | "Licensed";

// Which catalogue an entry belongs to:
//   "original" — the curated original-era (1993–1999) catalogue with vetted
//                value estimates and collector notes. Default when omitted.
//   "expanded" — the full Ty Beanie Baby roster (facts only).
export type BeanieCollection = "original" | "expanded";

export type BeanieEntry = {
  name: string;
  animal: string;
  category: BeanieCategory;
  year: number | null; // introduction year
  valueLow?: number; // USD, authentic + excellent condition (curated entries only)
  valueHigh?: number;
  styleNumber?: string; // Ty style/model number, e.g. "4020"
  birthday?: string; // Ty "birthday" tag date, human-readable
  note?: string;
  collection?: BeanieCollection; // omitted = "original"
};

// A catalogue row as served to the /database table: the effective (override-
// merged) entry plus its resolved photo and recent-sold stats. Defined here (a
// dependency-free module) so both the server search and the client table can
// import the type without either pulling in the catalogue or the DB.
export type CatalogueRow = {
  /** Stable identity — the base catalogue name (for the editor + photo keys). */
  originalName: string;
  name: string;
  animal: string;
  category: string;
  year: number | null;
  styleNumber: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  note: string | null;
  birthday: string | null;
  collection: BeanieCollection;
  photoUrl: string | null;
  soldMedianCents: number | null;
  soldCount: number;
};

export const CATEGORIES: BeanieCategory[] = [
  "Bears",
  "Animals",
  "Aquatic",
  "Birds",
  "Dinosaurs",
  "Insect",
  "Mythical",
  "Reptile",
  "Rodent",
  "Non-Animal",
  "Licensed",
];
