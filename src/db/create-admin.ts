// Provisions the platform super admin in Neon.
// Run once after the database is connected:  npm run db:create-admin
//
// Idempotent: creates admin@thisnthat.com if missing, and ensures the
// super_admin role either way. The email can be overridden with
// SUPER_ADMIN_EMAIL.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";

const email = process.env.SUPER_ADMIN_EMAIL ?? "admin@thisnthat.com";

async function main() {
  if (!db) throw new Error("DATABASE_URL is not set — cannot create admin.");

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  if (existing) {
    await db.update(schema.users).set({ role: "super_admin" }).where(eq(schema.users.id, existing.id));
    console.log(`Updated ${email} to super_admin.`);
  } else {
    await db
      .insert(schema.users)
      .values({ email, name: "Platform Admin", username: "admin", role: "super_admin" });
    console.log(`Created super admin ${email}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
