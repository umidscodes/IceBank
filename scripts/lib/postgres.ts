/**
 * Starts the embedded PostgreSQL 16 server used for local development.
 * Data lives in .icebank/pgdata (git-ignored). Works on Windows, macOS and Linux.
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import pg from "pg";

export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT, ".icebank", "pgdata");
export const DB_PORT = Number(process.env.DB_PORT ?? 5433);
export const SUPERUSER = "postgres";
export const SUPERUSER_PASSWORD = "postgres";
export const DB_NAME = "icebank";

export function adminUrl(db = DB_NAME) {
  return `postgres://${SUPERUSER}:${SUPERUSER_PASSWORD}@localhost:${DB_PORT}/${db}`;
}
export function appUrl() {
  return process.env.DATABASE_URL ?? `postgres://icebank_app:icebank_app@localhost:${DB_PORT}/${DB_NAME}`;
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function canConnectAsAdmin(): Promise<boolean> {
  const c = new pg.Client({ connectionString: adminUrl("postgres") });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}

export interface RunningDb { stop: () => Promise<void>; external: boolean }

/** Start (or reuse) the embedded server. Resolves once it accepts connections. */
export async function startPostgres(opts: { quiet?: boolean } = {}): Promise<RunningDb> {
  if (process.env.DATABASE_URL) {
    return { stop: async () => {}, external: true };
  }
  if (await portInUse(DB_PORT)) {
    if (await canConnectAsAdmin()) {
      if (!opts.quiet) console.log(`[db] Reusing PostgreSQL already running on port ${DB_PORT}`);
      return { stop: async () => {}, external: true };
    }
    throw new Error(
      `Port ${DB_PORT} is in use by something that is not Ice Bank's database.\n` +
      `Stop that program, or set DB_PORT to another port (for example: set DB_PORT=5434).`,
    );
  }

  // Keep the last PostgreSQL log lines so a failed start can explain itself.
  const recent: string[] = [];
  const remember = (m: unknown) => {
    const text = m instanceof Error ? m.message : String(m ?? "");
    for (const line of text.split(/\r?\n/)) if (line.trim()) recent.push(line.trim());
    if (recent.length > 40) recent.splice(0, recent.length - 40);
    if (process.env.ICEBANK_DB_DEBUG) process.stderr.write(`[db] ${text}\n`);
  };
  const explain = (step: string, err: unknown) => new Error(
    `PostgreSQL failed to ${step}${err instanceof Error ? `: ${err.message}` : ""}.\n` +
    (recent.length ? `Last PostgreSQL output:\n  ${recent.join("\n  ")}\n` : "") +
    `Data folder: ${DATA_DIR}. If this keeps happening, see "If the embedded database will not start" in the README.`);

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const server = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: SUPERUSER,
    password: SUPERUSER_PASSWORD,
    port: DB_PORT,
    persistent: true,
    // Postgres refuses to run as root (only relevant in Linux containers/CI).
    createPostgresUser: isRoot,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "timezone=UTC", "-c", "max_connections=60"],
    onLog: (m: unknown) => remember(m),
    onError: (m: unknown) => remember(m),
  });

  const fresh = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (fresh) {
    fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    if (!opts.quiet) console.log("[db] First run: initialising PostgreSQL data folder ...");
    try {
      await server.initialise();
    } catch (err) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true }); // a half-created folder would break the next run
      throw explain("initialise its data folder", err);
    }
  }
  // A crash can leave a stale lock file behind; remove it if no server is running.
  const pidFile = path.join(DATA_DIR, "postmaster.pid");
  if (fs.existsSync(pidFile)) fs.rmSync(pidFile, { force: true });

  try {
    await server.start();
  } catch (err) {
    throw explain("start", err);
  }
  if (!opts.quiet) console.log(`[db] PostgreSQL 16 running on localhost:${DB_PORT} (${os.platform()})`);

  const admin = new pg.Client({ connectionString: adminUrl("postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();

  let stopped = false;
  return {
    external: false,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try { await server.stop(); } catch { /* already stopped */ }
    },
  };
}
