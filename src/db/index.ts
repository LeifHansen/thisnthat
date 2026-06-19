// Neon-backed Drizzle client.
//
// `db` is null when DATABASE_URL is not configured, which lets the app run
// against seed data locally (see src/lib/data.ts) before Neon is wired up.

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

export const db = connectionString
  ? drizzle(neon(connectionString), { schema })
  : null;

export const isDbConfigured = Boolean(connectionString);

export { schema };
