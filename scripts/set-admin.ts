// Grant (or revoke) ADMIN on a user by email.
//
//   npx tsx scripts/set-admin.ts <email> [--revoke]
//
// Idempotent. Prints the before/after role. Role ADMIN unlocks /admin; the
// single superadmin (user management) is whichever account SUPERADMIN_EMAIL
// names — default admin@thisnthat.com — and must also hold ADMIN.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const revoke = process.argv.includes("--revoke");
  if (!email) {
    console.error("Usage: npx tsx scripts/set-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `❌ No account found for ${email}. They must sign up first, then re-run this.`,
    );
    process.exit(2);
  }

  const nextRole = revoke ? "USER" : "ADMIN";
  console.log(`Found ${email} — current role: ${user.role}`);
  if (user.role === nextRole) {
    console.log(`✓ Already ${nextRole}. Nothing to do.`);
    return;
  }
  const updated = await prisma.user.update({
    where: { email },
    data: { role: nextRole },
  });
  console.log(`✅ ${email} is now ${updated.role}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
