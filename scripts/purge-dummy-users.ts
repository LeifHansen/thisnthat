/**
 * Purge the demo/dummy accounts and everything they own.
 *
 * Dry run (default): prints what WOULD be deleted, changes nothing.
 *   npx tsx scripts/purge-dummy-users.ts
 * Execute:
 *   npx tsx scripts/purge-dummy-users.ts --yes
 * Extra accounts (comma-separated) can be added on top of the built-in list:
 *   npx tsx scripts/purge-dummy-users.ts --emails=a@x.com,b@y.com --yes
 *
 * User relations do NOT cascade from User, so dependent rows are deleted in
 * FK-safe order inside a transaction, then the users themselves:
 *   productReview -> shipmentEvent -> offer -> order -> message ->
 *   conversation -> listingLike -> follow -> listing (lotItem cascades) -> user
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUMMY_EMAILS = [
  "admin@thisnthat.com",
  "seller@thisnthat.com",
  "buyer@thisnthat.com",
];

function extraEmails(): string[] {
  const arg = process.argv.find((a) => a.startsWith("--emails="));
  if (!arg) return [];
  return arg
    .slice("--emails=".length)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const execute = process.argv.includes("--yes");
  const emails = [...new Set([...DUMMY_EMAILS, ...extraEmails()])];

  const totalUsers = await prisma.user.count();
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
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
  const listingIds = (
    await prisma.listing.findMany({
      where: { sellerId: { in: ids } },
      select: { id: true },
    })
  ).map((l) => l.id);

  // The same scopes the transaction below deletes with, so the dry run
  // reports exactly what --yes will remove.
  const reviewScope = {
    OR: [
      { buyerId: { in: ids } },
      { sellerId: { in: ids } },
      { listingId: { in: listingIds } },
    ],
  };
  const orderScope = {
    OR: [
      { sellerId: { in: ids } },
      { buyerId: { in: ids } },
      { listingId: { in: listingIds } },
    ],
  };
  const offerScope = {
    OR: [{ buyerId: { in: ids } }, { listingId: { in: listingIds } }],
  };
  const conversationScope = {
    OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }],
  };
  const messageScope = {
    OR: [{ senderId: { in: ids } }, { conversation: conversationScope }],
  };
  const likeScope = {
    OR: [{ userId: { in: ids } }, { listingId: { in: listingIds } }],
  };
  const followScope = {
    OR: [{ followerId: { in: ids } }, { followedId: { in: ids } }],
  };

  const [
    reviews,
    shipmentEvents,
    offers,
    orders,
    ordersWithRealCounterparty,
    messages,
    conversations,
    likes,
    follows,
  ] = await Promise.all([
    prisma.productReview.count({ where: reviewScope }),
    prisma.shipmentEvent.count({ where: { order: orderScope } }),
    prisma.offer.count({ where: offerScope }),
    prisma.order.count({ where: orderScope }),
    // Orders where the other party is NOT a dummy account: deleting these
    // erases a real member's purchase or sale history.
    prisma.order.count({
      where: {
        AND: [
          orderScope,
          {
            OR: [
              { sellerId: { notIn: ids } },
              { AND: [{ buyerId: { not: null } }, { buyerId: { notIn: ids } }] },
            ],
          },
        ],
      },
    }),
    prisma.message.count({ where: messageScope }),
    prisma.conversation.count({ where: conversationScope }),
    prisma.listingLike.count({ where: likeScope }),
    prisma.follow.count({ where: followScope }),
  ]);

  for (const u of users) {
    console.log(
      `  ${u.email.padEnd(26)} role=${u.role} suspended=${u.suspended} id=${u.id}`,
    );
  }
  console.log("\nOwned/related rows to be removed:");
  console.log(`  listings (lot items cascade): ${listingIds.length}`);
  console.log(`  product reviews:              ${reviews}`);
  console.log(`  shipment events:              ${shipmentEvents}`);
  console.log(`  offers:                       ${offers}`);
  console.log(`  orders:                       ${orders}`);
  console.log(`  messages:                     ${messages}`);
  console.log(`  conversations:                ${conversations}`);
  console.log(`  listing likes:                ${likes}`);
  console.log(`  follows:                      ${follows}`);

  if (ordersWithRealCounterparty > 0) {
    console.log(
      `\n⚠️  ${ordersWithRealCounterparty} order(s) involve a REAL member on the other side. Deleting them removes that member's order history.`,
    );
  }
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
    // Children of orders/listings first, then the rows that reference users.
    await tx.productReview.deleteMany({ where: reviewScope });
    await tx.shipmentEvent.deleteMany({ where: { order: orderScope } });
    // Offer.orderId points at Order (no cascade), so offers go before orders.
    await tx.offer.deleteMany({ where: offerScope });
    await tx.order.deleteMany({ where: orderScope });
    await tx.message.deleteMany({ where: messageScope });
    await tx.conversation.deleteMany({ where: conversationScope });
    await tx.listingLike.deleteMany({ where: likeScope });
    await tx.follow.deleteMany({ where: followScope });
    // LotItem cascades from Listing.
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
