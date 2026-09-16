#!/usr/bin/env node

const { spawn } = require("node:child_process");
const net = require("node:net");

const env = { ...process.env };

// Dev/preview machines can point at a separate Neon branch by setting only
// DEV_DATABASE_URL. Prisma reads DATABASE_URL / DIRECT_URL, so map it here
// (DIRECT_URL is derived by dropping Neon's "-pooler" host suffix) unless
// those are set explicitly.
if (!env.DATABASE_URL && env.DEV_DATABASE_URL) {
  env.DATABASE_URL = env.DEV_DATABASE_URL;
  env.DIRECT_URL ||= env.DEV_DATABASE_URL.replace("-pooler", "");
}
// Fly Postgres (`fly postgres attach`) sets only DATABASE_URL, and the schema
// declares `directUrl = env("DIRECT_URL")`, which Prisma refuses to start
// without. Derive it the same way: identical URL, minus any pooler suffix.
if (env.DATABASE_URL && !env.DIRECT_URL) {
  env.DIRECT_URL = env.DATABASE_URL.replace("-pooler", "");
}

// The port Fly's proxy waits on (fly.toml `internal_port`). Same default Next
// itself uses, so this matches wherever the app ends up listening.
const PORT = Number(env.PORT) || 3000;

// Cap on how long we'll wait for the port before giving up on the wait (not on
// the app): a server that hasn't bound in a minute isn't going to.
const LISTEN_TIMEOUT_MS = 60_000;

(async () => {
  // Start the server FIRST, and let nothing else run until it has the port.
  //
  // Fly's proxy gives up waiting for :8080 after ~8.4s and answers the visitor
  // with "instance refused connection. is your app listening on 0.0.0.0:8080?".
  // Every non-primary region autostops to zero (min_machines_running only pins
  // the primary), so that countdown runs on ordinary traffic, not just deploys.
  //
  // What used to spend it: this file spawned `prisma migrate deploy` and the
  // server at the same time. On a shared-cpu-1x with a cold page cache the
  // Prisma CLI and the server then competed for one vCPU through exactly the
  // window Fly was counting, and the port opened 8.2s in — inside the failure
  // margin. Next itself was never slow; it reported "Ready in 769ms" once it
  // finally got to run.
  const { child, done: app } = spawnChild(process.argv.slice(2).join(" "));

  // Migrations are applied by the Fly release_command before any machine boots
  // the new image, so this run is a backstop for a failed release step — worth
  // doing, but never worth a second of the boot. Waiting for the port keeps the
  // backstop and keeps the Prisma CLI out of the cold start.
  //
  // On the release machine the command is `sh scripts/release.sh`, which never
  // binds a port and runs `prisma migrate deploy` itself; the wait ends when
  // that exits and this backstop correctly stays out of its way.
  const migration = waitUntilListening(child).then((listening) => {
    if (!listening) return;
    return migrateWithRetry();
  });

  // Surface the migration outcome once it lands, but never let it take the
  // process down: an unhandled rejection here would kill a healthy server.
  migration.catch((e) =>
    console.error(`[entrypoint] migration step errored: ${e.message}`),
  );

  await app;
})();

/**
 * Resolve true once something is accepting connections on PORT, false if the
 * app exits or never binds. Polls both loopback families: `next start` leaves
 * the host unset, which binds every interface via IPv6 dual-stack, while a
 * server pinned to 0.0.0.0 answers only on IPv4.
 */
async function waitUntilListening(child) {
  const deadline = Date.now() + LISTEN_TIMEOUT_MS;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  while (!exited && Date.now() < deadline) {
    if (await canConnect("127.0.0.1")) return true;
    if (await canConnect("::1")) return true;
    await sleep(150);
  }
  return false;
}

function canConnect(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: PORT });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function migrateWithRetry(attempts = 3) {
  if (await tryMigrate(env, attempts)) return;

  // Same fallback as scripts/release.sh: DIRECT_URL is the one secret that can
  // drift from DATABASE_URL unnoticed (set by hand with credentials since
  // rotated, or for another Neon branch), and DATABASE_URL is the connection
  // the app actually runs on — so when the explicit DIRECT_URL is rejected,
  // try the direct URL derived from DATABASE_URL before giving up.
  const derived = env.DATABASE_URL ? env.DATABASE_URL.replace("-pooler", "") : "";
  if (derived && derived !== env.DIRECT_URL) {
    console.error(
      "[entrypoint] DIRECT_URL was rejected; retrying migrations with the direct URL derived from DATABASE_URL",
    );
    if (await tryMigrate({ ...env, DIRECT_URL: derived }, attempts)) {
      console.error(
        "[entrypoint] WARNING: migrations applied through the URL derived from DATABASE_URL because the DIRECT_URL secret is rejected. Run `fly secrets unset DIRECT_URL` or set it to the direct connection string for the same role.",
      );
      return;
    }
  }
  // Then without `channel_binding=require`: Neon puts it on every connection
  // string and Prisma honours it, insisting on SCRAM channel binding, which
  // Neon's direct endpoint does not negotiate (the app's pooled connection
  // does, which is why the site runs while migrations are refused).
  const plain = withoutChannelBinding(derived);
  if (plain && plain !== derived && plain !== env.DIRECT_URL) {
    console.error(
      "[entrypoint] retrying migrations with that URL without channel_binding=require",
    );
    if (await tryMigrate({ ...env, DIRECT_URL: plain }, attempts)) {
      console.error(
        "[entrypoint] WARNING: migrations applied only after dropping channel_binding=require. Set DIRECT_URL to the direct connection string without that parameter (keep sslmode=require).",
      );
      return;
    }
  }
  // Last resort, as in scripts/release.sh: the pooled DATABASE_URL the app
  // itself is serving on, with pgbouncer=true (no prepared statements, as
  // Prisma requires behind PgBouncer). A pooler cannot hold Prisma's
  // migration lock, so this is a way to get a schema in place, not a home.
  if (env.DATABASE_URL) {
    const pooled = /[?&]pgbouncer=/.test(env.DATABASE_URL)
      ? env.DATABASE_URL
      : env.DATABASE_URL + (env.DATABASE_URL.includes("?") ? "&" : "?") + "pgbouncer=true";
    console.error(
      "[entrypoint] retrying migrations through the pooled DATABASE_URL (pgbouncer=true) as a last resort",
    );
    if (await tryMigrate({ ...env, DIRECT_URL: pooled }, attempts)) {
      console.error(
        "[entrypoint] WARNING: migrations applied through the pooled DATABASE_URL because every direct connection was rejected. Set DIRECT_URL to a direct connection string the direct endpoint accepts.",
      );
      return;
    }
  }

  // Don't hard-block startup on a migration failure (a transient DB blip
  // shouldn't take the whole site down, and public reads degrade gracefully)
  // — but make it LOUD so it surfaces in `fly logs`.
  console.error(
    "[entrypoint] WARNING: migrations not applied after retries; the app is serving on whatever schema the database currently has. Check `fly logs` and run `prisma migrate deploy`.",
  );
}

function withoutChannelBinding(url) {
  return url
    .replace(/([?&])channel_binding=[^&]*&/, "$1")
    .replace(/[?&]channel_binding=[^&]*$/, "");
}

async function tryMigrate(environment, attempts) {
  for (let i = 1; i <= attempts; i++) {
    try {
      // The local binary rather than `npx`, which re-resolves the package (and
      // may reach for the network) on every boot. Resolved from this file's
      // own directory so it doesn't depend on the working directory.
      await exec(`${__dirname}/node_modules/.bin/prisma migrate deploy`, environment);
      return true;
    } catch (e) {
      console.error(
        `[entrypoint] prisma migrate deploy failed (attempt ${i}/${attempts}): ${e.message}`,
      );
      if (i < attempts) await sleep(2000 * i);
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnChild(command, environment = env) {
  const child = spawn(command, { shell: true, stdio: "inherit", env: environment });
  const done = new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed rc=${code}`));
      }
    });
  });
  return { child, done };
}

function exec(command, environment = env) {
  return spawnChild(command, environment).done;
}
