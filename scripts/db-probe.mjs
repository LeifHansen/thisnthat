#!/usr/bin/env node
// Plain-Postgres probe of one connection string, for the release log.
//
// Prisma reports every authentication failure as P1000 and drops the server's
// own message, which is the one thing that distinguishes a wrong password from
// "this IP is not allowed", "endpoint ID not specified", a suspended project,
// or an empty username in the URL. This connects with `pg` instead and prints
// exactly what the server said, plus the non-secret parts of the URL as they
// were parsed. Never prints the password. Exit 0 when the query ran, 1 when
// not — it only reports, the release decides.
//
//   node scripts/db-probe.mjs "$DATABASE_URL" "DATABASE_URL"

import pg from "pg";

const [url, label = "connection string"] = process.argv.slice(2);
const tag = `release: ${label}`;

if (!url) {
  console.log(`${tag}: not set`);
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch (e) {
  console.log(`${tag}: cannot be parsed as a URL (${e.message})`);
  process.exit(1);
}

const params = Object.fromEntries(parsed.searchParams);
const sslmode = params.sslmode ?? "prefer";
console.log(
  `${tag}: user=${JSON.stringify(decodeURIComponent(parsed.username))} host=${parsed.hostname} port=${parsed.port || 5432} db=${parsed.pathname.slice(1)} params=${JSON.stringify(params)} password=${parsed.password ? `${parsed.password.length} chars` : "EMPTY"}`,
);

const client = new pg.Client({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: Number(parsed.port || 5432),
  database: decodeURIComponent(parsed.pathname.slice(1)),
  // A probe: TLS on unless the URL says otherwise, and never let a certificate
  // problem masquerade as an authentication one (Node sends SNI by default).
  ssl: sslmode === "disable" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const { rows } = await client.query(
    "SELECT current_user AS u, current_database() AS d, version() AS v",
  );
  console.log(
    `${tag}: OK — connected as ${rows[0].u} to ${rows[0].d} (${String(rows[0].v).split(",")[0]})`,
  );
  await client.end();
  process.exit(0);
} catch (e) {
  const parts = [e.code ? `SQLSTATE ${e.code}` : null, e.message, e.detail, e.hint]
    .filter(Boolean)
    .join(" | ");
  console.log(`${tag}: REJECTED — ${parts}`);
  try { await client.end(); } catch {}
  process.exit(1);
}
