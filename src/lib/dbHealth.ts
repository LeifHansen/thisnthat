import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { isDbUnreachable } from "@/lib/dbErrors";

// Answers the one question behind every "the site is up but X fails" report:
// does the database the app talks to actually have the app's schema?
//
// Nothing else in the app can tell. Every page catches its own database errors
// and renders an empty state, and a route that needs a missing table fails
// with a Prisma error that looks like a bug (P2021 "table does not exist").
// That is precisely how a deploy whose migrations never applied stays
// invisible — the schema was never created, and everything that read it just
// looked empty. /api/health reports this so the state is visible from a
// single anonymous request, before anyone signs in (which needs the User
// table too).

export type DatabaseStatus =
  /** Reachable, and every migration shipped with this build is applied. */
  | "ok"
  /** Connection-level failure: unreachable, refused, timed out, bad URL. */
  | "unreachable"
  /**
   * Reachable, but there is no migration history at all: `prisma migrate
   * deploy` has never succeeded against DATABASE_URL. The app's tables do
   * not exist.
   */
  | "unmigrated"
  /** Some migrations shipped with this build have not been applied. */
  | "pending"
  /** A migration started and never finished; migrate will refuse until resolved. */
  | "failed"
  /** Could not determine (the reason is in `detail`). */
  | "unknown";

export type DatabaseReport = {
  status: DatabaseStatus;
  /** Migrations in prisma/migrations with no completed row in the database. */
  pending: string[];
  /** Migrations recorded as started but neither finished nor rolled back. */
  failed: string[];
  /** Human-readable explanation when status is not "ok". */
  detail?: string;
};

function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Prisma prefixes a multi-line invocation dump; keep the last, human line.
  const lines = m.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "unknown error";
}

/**
 * The migrations this build ships, in order. Read from the working directory,
 * which is where `next start` runs in the image (prisma/ is copied in) and in
 * development. Null when the directory is not there, so the check degrades to
 * "history exists / has no failures" instead of claiming everything is pending.
 */
function committedMigrations(): string[] | null {
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return null;
  }
}

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export async function inspectDatabase(): Promise<DatabaseReport> {
  let historyExists: boolean;
  let rows: MigrationRow[] = [];
  try {
    // `current_schema()` honours the `?schema=` URL parameter Prisma sets on
    // the connection, so this looks where Prisma itself would.
    const found = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = '_prisma_migrations'
    `;
    historyExists = found.length > 0;
    if (historyExists) {
      rows = await prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"
      `;
    }
  } catch (e) {
    if (isDbUnreachable(e)) {
      return {
        status: "unreachable",
        pending: [],
        failed: [],
        detail: `The database could not be reached: ${errorMessage(e)}`,
      };
    }
    return {
      status: "unknown",
      pending: [],
      failed: [],
      detail: `Could not read the migration history: ${errorMessage(e)}`,
    };
  }

  if (!historyExists) {
    return {
      status: "unmigrated",
      pending: committedMigrations() ?? [],
      failed: [],
      detail:
        "No migration history: `prisma migrate deploy` has never succeeded against DATABASE_URL, so the app's tables do not exist. " +
        "If the database already held another app's tables, migrate refuses with P3005 (\"the database schema is not empty\") — " +
        "point DATABASE_URL at an empty database or empty this one, then redeploy.",
    };
  }

  const failed = rows
    .filter((r) => r.finished_at === null && r.rolled_back_at === null)
    .map((r) => r.migration_name)
    .sort();
  const applied = new Set(
    rows
      .filter((r) => r.finished_at !== null && r.rolled_back_at === null)
      .map((r) => r.migration_name),
  );

  const committed = committedMigrations();
  const pending = committed ? committed.filter((m) => !applied.has(m)) : [];

  if (failed.length > 0) {
    return {
      status: "failed",
      pending,
      failed,
      detail: `Migration(s) started but never finished: ${failed.join(", ")}. Resolve with \`prisma migrate resolve\` (https://pris.ly/d/migrate-resolve), then redeploy.`,
    };
  }
  if (pending.length > 0) {
    return {
      status: "pending",
      pending,
      failed,
      detail: `Migration(s) shipped with this build are not applied: ${pending.join(", ")}. Run \`prisma migrate deploy\` against DATABASE_URL (the release command does this; check the deploy log for why it failed).`,
    };
  }
  if (!committed) {
    return {
      status: "unknown",
      pending,
      failed,
      detail:
        "prisma/migrations is not readable from the running app, so pending migrations cannot be checked; the history exists and has no failures.",
    };
  }
  return { status: "ok", pending, failed };
}
