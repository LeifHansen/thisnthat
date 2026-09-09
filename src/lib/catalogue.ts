import { prisma } from "@/lib/db";
import { beaniePhotoKey } from "@/lib/photos";
import { BEANIES } from "@/lib/beanie-database";

// Normalized keys for every catalogue beanie (compound names like
// "Brownie / Cubbie" contribute each part too) so we can tell whether a
// seller-entered beanie already exists in the catalogue.
const CATALOGUE_KEYS: ReadonlySet<string> = (() => {
  const keys = new Set<string>();
  for (const b of BEANIES) {
    keys.add(beaniePhotoKey(b.name));
    for (const part of b.name.split("/")) keys.add(beaniePhotoKey(part));
  }
  return keys;
})();

/**
 * Record a beanie that isn't in the catalogue for admin review. Called when a
 * listing goes live — both when it publishes straight from the sell wizard and
 * when a draft is published later — so the queue sees the same submissions
 * either way. Non-blocking by contract: it never throws and never fails a
 * listing.
 */
export async function recordCatalogueSubmission(args: {
  beanieName: string;
  year: number | null;
  submittedByName: string | null | undefined;
  listingId: string;
}): Promise<void> {
  const key = beaniePhotoKey(args.beanieName);
  if (!key || CATALOGUE_KEYS.has(key)) return;
  try {
    await prisma.beanieSubmission.upsert({
      where: { normalizedKey: key },
      update: {},
      create: {
        name: args.beanieName,
        normalizedKey: key,
        year: args.year,
        submittedByName: args.submittedByName ?? null,
        firstListingId: args.listingId,
      },
    });
  } catch {
    // ignore — never block publishing on the catalogue-submission record
  }
}
