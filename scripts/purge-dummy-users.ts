/**
 * Purge dummy/demo user accounts and everything they own.
 *
 * Dry run (default): prints what WOULD be deleted, changes nothing.
 *   npx tsx scripts/purge-dummy-users.ts
 * Execute:
 *   npx tsx scripts/purge-dummy-users.ts --yes
 *
 * User relations do NOT cascade from User, so we delete dependent rows in
 * FK-safe order inside a transaction, then the users themselves.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUMMY_EMAILS = [
  "admin@beaniex.com",
  "seller@beaniex.com",
  "buyer@beaniex.com",
  "megan.r@beaniex.com",
  "tom.c@beaniex.com",
  "jenny.p@beaniex.com",
  "dale.w@beaniex.com",
  "priya.s@beaniex.com",
];

async function main() {
  const execute = process.argv.includes("--yes");
  const totalUsers = await prisma.user.count();
  const users = await prisma.user.findMany({
    where: { email: { in: DUMMY_EMAILS } },
    select: { id: true, email: true, name: true, role: true, suspended: true },
  });

  console.log(`Total users in DB: ${totalUsers}`);
  console.log(`Matched dummy accounts: ${users.length}\n`);

  if (users.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const ids = users.map((u) => u.id);

  // Listings owned by these users (needed to clean listing-scoped rows).
  const listings = await prisma.listing.findMany({
    where: { sellerId: { in: ids } },
    select: { id: true },
  });
  const listingIds = listings.map((l) => l.id);

  // Report per-account and aggregate exposure to REAL data (rows tied to
  // non-dummy users) so we don't nuke a real buyer's order history.
  const [
    sellerOrders,
    buyerOrders,
    ordersOnDummyListings,
    offersByDummy,
    messagesByDummy,
    convos,
    authReqs,
    registry,
    tradesByDummy,
    tradesOnDummyListings,
  ] = await Promise.all([
    prisma.order.count({ where: { sellerId: { in: ids } } }),
    prisma.order.count({ where: { buyerId: { in: ids } } }),
    prisma.order.count({ where: { listingId: { in: listingIds } } }),
    prisma.offer.count({ where: { buyerId: { in: ids } } }),
    prisma.message.count({ where: { senderId: { in: ids } } }),
    prisma.conversation.count({
      where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
    }),
  ]);

  for (const u of users) {
    console.log(
      `  ${u.email.padEnd(24)} role=${u.role} suspended=${u.suspended} id=${u.id}`,
    );
  }
  console.log("\nOwned/related rows to be removed:");
  console.log(`  listings:            ${listingIds.length}`);
  console.log(`  orders as seller:    ${sellerOrders}`);
  console.log(`  orders as buyer:     ${buyerOrders}`);
  console.log(`  orders on their listings: ${ordersOnDummyListings}`);
  console.log(`  offers by them:      ${offersByDummy}`);
  console.log(`  trades (by/on them): ${tradesByDummy}/${tradesOnDummyListings}`);
  console.log(`  messages:            ${messagesByDummy}`);
  console.log(`  conversations:       ${convos}`);
  console.log(`  auth requests:       ${authReqs}`);
  console.log(`  registry entries:    ${registry}`);

  const notSuspended = users.filter((u) => !u.suspended);
  if (notSuspended.length) {
    console.log(
      `\n⚠️  NOT suspended (double-check before deleting): ${notSuspended
        .map((u) => u.email)
        .join(", ")}`,
    );
  }

  if (!execute) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --yes to execute.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Listing-scoped children first.
    // AuthenticationRequest references orders + listings (no cascade), so it
    // must go before them.
      where: { OR: [{ userId: { in: ids } }, { listingId: { in: listingIds } }] },
    });
    await tx.offer.deleteMany({
      where: { OR: [{ listingId: { in: listingIds } }, { buyerId: { in: ids } }] },
    });
    await tx.order.deleteMany({
      where: {
        OR: [
          { listingId: { in: listingIds } },
          { sellerId: { in: ids } },
          { buyerId: { in: ids } },
        ],
      },
    });
    await tx.message.deleteMany({ where: { senderId: { in: ids } } });
    await tx.conversation.deleteMany({
      where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
    });
    await tx.listing.deleteMany({ where: { id: { in: listingIds } } });
    const del = await tx.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`\n✅ Deleted ${del.count} dummy users and their data.`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
