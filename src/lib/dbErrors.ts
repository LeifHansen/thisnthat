import { NextResponse } from "next/server";

// Classify a Prisma failure by what an operator would do about it, and answer
// it the same way from every route that creates an account. The web and
// mobile register routes and the health check all share this, so they cannot
// drift — the mobile route used to let every database fault escape as Next's
// HTML 500 page, which the app cannot parse.

/**
 * Connection-level failures: the database was unreachable, refused, timed
 * out, or the client could not initialise (missing/invalid DATABASE_URL). None
 * of them mean the request was bad, and none of them wrote a row.
 */
export const UNREACHABLE_DB_CODES = new Set([
  "P1000", // authentication against the database server failed
  "P1001", // can't reach database server
  "P1002", // server reached but timed out
  "P1003", // database does not exist
  "P1008", // operation timed out
  "P1010", // user denied access
  "P1011", // TLS error
  "P1013", // invalid database string
  "P1017", // server has closed the connection
]);

/**
 * The database answered, but does not have the table or column the query
 * needs: a deploy whose migrations never applied to the database at
 * DATABASE_URL (or applied somewhere else). It fails every write identically
 * until `prisma migrate deploy` succeeds there; /api/health reports it as
 * `database: "unmigrated"` / `"pending"`.
 */
export const SCHEMA_DB_CODES = new Set([
  "P2021", // the table does not exist in the current database
  "P2022", // the column does not exist in the current database
]);

function codeOf(e: unknown): string | undefined {
  // PrismaClientKnownRequestError carries `code`; the initialisation error
  // (thrown when the URL is missing or unparseable) carries `errorCode`.
  const err = e as { code?: unknown; errorCode?: unknown } | null;
  const code = err?.code ?? err?.errorCode;
  return typeof code === "string" ? code : undefined;
}

export function isDbUnreachable(e: unknown): boolean {
  const code = codeOf(e);
  if (code && UNREACHABLE_DB_CODES.has(code)) return true;
  // "Environment variable not found" and similar carry no code at all.
  return (e as { name?: string } | null)?.name === "PrismaClientInitializationError";
}

export function isDbSchemaMissing(e: unknown): boolean {
  const code = codeOf(e);
  return !!code && SCHEMA_DB_CODES.has(code);
}

/**
 * One retry for connection-level failures. A serverless Postgres (Neon, which
 * is what production points at) suspends when idle, and the query that wakes
 * it can fail while the next one lands fine — which a new visitor would
 * otherwise experience as "registration failed" on a perfectly healthy site.
 *
 * Reads only, deliberately: replaying a write after an ambiguous connection
 * drop risks inserting the account twice, and the second insert would come
 * back as "that email is already registered" — against the account the caller
 * had just created.
 */
export async function retryDbRead<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (!isDbUnreachable(e)) throw e;
    await new Promise((r) => setTimeout(r, 250));
    return op();
  }
}

/**
 * The JSON answer for a registration that failed on the server side, with a
 * greppable log line under `[prefix]`. Always JSON: an exception escaping a
 * route becomes Next's HTML 500 page, which neither the signup wizard nor the
 * mobile app can parse, so every server-side fault used to reach the visitor
 * as one meaningless message.
 */
export function registrationFailureResponse(
  prefix: string,
  e: unknown,
): NextResponse {
  if (isDbUnreachable(e)) {
    console.error(`[${prefix}] database unreachable:`, e);
    return NextResponse.json(
      {
        error:
          "We couldn't reach our database just now — no account was created. Please try again in a minute.",
      },
      { status: 503 },
    );
  }
  if (isDbSchemaMissing(e)) {
    console.error(
      `[${prefix}] database schema missing or out of date — \`prisma migrate deploy\` has not succeeded against DATABASE_URL (GET /api/health reports the migration state):`,
      e,
    );
    return NextResponse.json(
      {
        error:
          "Our database isn't ready to take new accounts right now — no account was created. Please try again later, and contact support if it keeps happening.",
      },
      { status: 503 },
    );
  }
  console.error(`[${prefix}] failed:`, e);
  return NextResponse.json(
    {
      error:
        "Something went wrong on our end and your account wasn't created. Please try again, and contact support if it keeps happening.",
    },
    { status: 500 },
  );
}
