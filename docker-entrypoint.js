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
  for (let i = 1; i <= attempts; i++) {
    try {
      // The local binary rather than `npx`, which re-resolves the package (and
      // may reach for the network) on every boot. Resolved from this file's
      // own directory so it doesn't depend on the working directory.
      await exec(`${__dirname}/node_modules/.bin/prisma migrate deploy`);
      return;
    } catch (e) {
      console.error(
        `[entrypoint] prisma migrate deploy failed (attempt ${i}/${attempts}): ${e.message}`,
      );
      if (i < attempts) await sleep(2000 * i);
    }
  }
  // Don't hard-block startup on a migration failure (a transient DB blip
  // shouldn't take the whole site down, and public reads degrade gracefully)
  // — but make it LOUD so it surfaces in `fly logs`.
  console.error(
    "[entrypoint] WARNING: migrations not applied after retries; the app is serving on whatever schema the database currently has. Check `fly logs` and run `prisma migrate deploy`.",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnChild(command) {
  const child = spawn(command, { shell: true, stdio: "inherit", env });
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

function exec(command) {
  return spawnChild(command).done;
}
