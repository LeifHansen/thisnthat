import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  // Demo-account password. In local/dev it's the well-known "password123" for
  // convenience. In production we never ship a guessable password: use
  // SEED_DEMO_PASSWORD if provided, otherwise a throwaway random one (the
  // demo accounts still exist for the listings' FK integrity, but can't be
  // logged into with a known credential).
  const demoPassword =
    process.env.SEED_DEMO_PASSWORD ??
    (process.env.NODE_ENV === "production"
      ? randomBytes(24).toString("hex")
      : "password123");
  const pw = await bcrypt.hash(demoPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@beaniex.com" },
    update: {},
    create: {
      email: "admin@beaniex.com",
      name: "HQ Admin",
      passwordHash: pw,
      role: "ADMIN",
      addressLine1: "1 Beanie HQ Way",
      city: "Vancouver",
      state: "WA",
      postalCode: "98660",
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: "seller@beaniex.com" },
    update: {},
    create: {
      email: "seller@beaniex.com",
      name: "Sammy Seller",
      passwordHash: pw,
      role: "USER",
      addressLine1: "42 Plush Ave",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
    },
  });

  await prisma.user.upsert({
    where: { email: "buyer@beaniex.com" },
    update: {},
    create: {
      email: "buyer@beaniex.com",
      name: "Bonnie Buyer",
      passwordHash: pw,
      role: "USER",
      addressLine1: "7 Collector Ct",
      city: "Seattle",
      state: "WA",
      postalCode: "98101",
    },
  });

  // Reset DEMO data only — scoped to seeded users.
  // Anything created by real users (sellerId / buyerId / userId / ownerId
  // outside the seeded accounts) is left untouched.
  //
  // As of 2026-05-25 we no longer seed any fake product listings — the
  // marketplace shows only real user uploads. This block is kept so that
  // re-running `db:seed` against a previously-seeded database removes any
  // stale demo listings / orders / auth requests left over from earlier runs.
  const demoUserIds = [admin.id, seller.id];
  const demoBuyer = await prisma.user.findUnique({
    where: { email: "buyer@beaniex.com" },
    select: { id: true },
  });
  if (demoBuyer) demoUserIds.push(demoBuyer.id);

  await prisma.shipmentEvent.deleteMany({
    where: {
      OR: [
        { order: { sellerId: { in: demoUserIds } } },
        { order: { buyerId: { in: demoUserIds } } },
        { authRequest: { userId: { in: demoUserIds } } },
      ],
    },
  });
  await prisma.registryEntry.deleteMany({
    where: { ownerId: { in: demoUserIds } },
  });
  await prisma.authenticationRequest.deleteMany({
    where: { userId: { in: demoUserIds } },
  });
  await prisma.order.deleteMany({
    where: {
      OR: [
        { sellerId: { in: demoUserIds } },
        { buyerId: { in: demoUserIds } },
      ],
    },
  });
  await prisma.listing.deleteMany({
    where: { sellerId: { in: demoUserIds } },
  });

  console.log("Seeded users:", { admin: admin.email, seller: seller.email });
  console.log(
    "No demo listings seeded — the marketplace shows only real user uploads.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
