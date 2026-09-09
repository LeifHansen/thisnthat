import { BEANIES, type BeanieCategory } from "@/lib/beanie-database";
import { beaniePhotoKey } from "@/lib/photos";

/**
 * Curated "Shop Collections" — the tile rail on the homepage and the
 * ?collection= filter on /browse. Each collection resolves to a set of
 * catalogue beanie names (by category, value, or a fixed list), and listings
 * are matched by normalised beanieName so seller spelling quirks still land.
 */
export type ShopCollection = {
  /** URL key: /browse?collection=<key> */
  key: string;
  label: string;
  /** One-liner on the homepage tile. */
  tagline: string;
  /** Longer sentence for the /browse collection header + meta description. */
  blurb: string;
  /** Tile artwork (public path). */
  image: string;
  /** Alt text for the tile artwork. */
  imageAlt: string;
  /** Accent border color (sticker palette, mirrors the header nav). */
  tint: string;
};

const ORIGINAL_9 = [
  "Brownie",
  "Cubbie",
  "Patti",
  "Chocolate",
  "Pinchers",
  "Splash",
  "Flash",
  "Spot",
  "Legs",
  "Squealer",
];

export const SHOP_COLLECTIONS: ShopCollection[] = [
  {
    key: "bears",
    tint: "var(--bx-blue-bright)",
    label: "Bears",
    tagline: "Princess, Peace, Valentino & more",
    blurb:
      "Every Ty Beanie Baby bear — Princess the Diana bear, Peace, Valentino, Curly, Erin, Glory, and the rest of the most collected category in the hobby.",
    image: "/Bears-product-category.png",
    imageAlt: "Bears collection — Princess, Peace, Valentino & more",
  },
  {
    key: "original-9",
    tint: "var(--bx-green-bright)",
    label: "The Original 9",
    tagline: "The 1993 beanies that started it all",
    blurb:
      "The nine 1993 originals — Cubbie, Patti, Chocolate, Pinchers, Splash, Flash, Spot, Legs, and Squealer — the Beanie Babies that launched the craze.",
    image: "/the-original-9.png",
    imageAlt: "The Original 9 collection — the 1993 beanies that started it all",
  },
  {
    key: "rare",
    tint: "var(--bx-yellow)",
    label: "Rare & Valuable",
    tagline: "High-value grails & retired treasures",
    blurb:
      "The grails: rare and retired Beanie Babies with real collector value — royal blue Peanut, first-generation tags, errors, and other high-value pieces.",
    image: "/rare-and-valuable.png",
    imageAlt: "Rare & Valuable collection — high-value grails and retired treasures",
  },
  {
    key: "cats-and-dogs",
    tint: "var(--bx-pink)",
    label: "Cats, Dogs & Friends",
    tagline: "Furry favorites from farm & home",
    blurb:
      "Cats, dogs, pigs, bunnies, and every furry friend — the classic animal Beanie Babies collectors grew up with.",
    image: "/cats-dogs-and-friends.png",
    imageAlt: "Cats, Dogs & Friends collection — furry favorites from farm and home",
  },
  {
    key: "under-the-sea",
    tint: "var(--bx-purple-bright)",
    label: "Under the Sea",
    tagline: "Whales, dolphins, lobsters & pals",
    blurb:
      "Aquatic Beanie Babies — Splash the whale, Flash the dolphin, Pinchers the lobster, Crunch the shark, and the rest of the ocean crew.",
    image: "/under-the-sea.png",
    imageAlt: "Under the Sea collection — whales, dolphins, lobsters and pals",
  },
  {
    key: "all",
    tint: "var(--bx-red)",
    label: "Shop All Beanies",
    tagline: "Browse the entire marketplace",
    blurb:
      "Every authenticated Beanie Baby for sale on BeanieXchange — escrow-protected, from collectors who know the hobby.",
    image: "/shop-all-beanies.png",
    imageAlt: "Shop All Beanies — browse the entire marketplace",
  },
];

export function collectionHref(c: ShopCollection): string {
  return c.key === "all" ? "/browse" : `/browse?collection=${c.key}`;
}

export function getCollection(key: string | undefined): ShopCollection | null {
  if (!key || key === "all") return null;
  return SHOP_COLLECTIONS.find((c) => c.key === key) ?? null;
}

/**
 * Normalised-name lookup built once from the catalogue. Every entry is
 * indexed under its full name, and alias names ("Brownie / Cubbie",
 * "Echo / Waves") additionally under each alias. Only space-delimited
 * " / " marks an alias — bare slashes are variant descriptors
 * ("Derby (no star/coarse mane)") and splitting on them would index
 * garbage keys against the wrong beanie's facts.
 */
type CatalogueFacts = { category: BeanieCategory; valueHigh?: number };
const FACTS_BY_KEY: Map<string, CatalogueFacts> = (() => {
  const map = new Map<string, CatalogueFacts>();
  for (const b of BEANIES) {
    const facts = { category: b.category, valueHigh: b.valueHigh };
    for (const alias of [b.name, ...b.name.split(" / ")]) {
      const key = beaniePhotoKey(alias);
      if (key && !map.has(key)) map.set(key, facts);
    }
  }
  return map;
})();

const ORIGINAL_9_KEYS = new Set(ORIGINAL_9.map((n) => beaniePhotoKey(n)));

/** Threshold for the "Rare & Valuable" collection (catalogue high estimate). */
const RARE_VALUE_HIGH = 100;

/**
 * Does a listing's beanieName belong to the given collection?
 * Unknown names (not in the catalogue) match nothing except "all".
 */
export function inCollection(beanieName: string, key: string): boolean {
  if (key === "all") return true;
  const nameKey = beaniePhotoKey(beanieName);
  if (key === "original-9") {
    // A listing may be stored under the compound catalogue name
    // ("Brownie / Cubbie"), so check its alias parts too.
    return [beanieName, ...beanieName.split(" / ")].some((n) =>
      ORIGINAL_9_KEYS.has(beaniePhotoKey(n)),
    );
  }
  const facts = FACTS_BY_KEY.get(nameKey);
  if (!facts) return false;
  switch (key) {
    case "bears":
      return facts.category === "Bears";
    case "rare":
      return (facts.valueHigh ?? 0) >= RARE_VALUE_HIGH;
    case "cats-and-dogs":
      return facts.category === "Animals" || facts.category === "Rodent";
    case "under-the-sea":
      return facts.category === "Aquatic";
    default:
      return false;
  }
}
