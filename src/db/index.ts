// Drizzle client — driver-aware so the same schema/migrations run against
// Neon (production, over HTTP) and a standard local Postgres (dev mirror).
//
// `db` is null when DATABASE_URL is not configured, which lets the app run
// against seed data locally (see src/lib/data.ts) before any DB is wired up.

import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

type DB = NodePgDatabase<typeof schema>;

function createDb(url: string): DB {
  // Neon's serverless HTTP driver for *.neon.tech; node-postgres otherwise.
  if (/neon\.tech/.test(url)) {
    return drizzleNeon(neon(url), { schema }) as unknown as DB;
  }
  return drizzlePg(new Pool({ connectionString: url }), { schema });
}

export const db: DB | null = connectionString ? createDb(connectionString) : null;

export const isDbConfigured = Boolean(connectionString);

export { schema };
