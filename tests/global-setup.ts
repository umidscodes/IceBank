/**
 * Smoke tests run the real route handlers against a separate database (icebank_test) on the same
 * PostgreSQL server, so they never touch your local data. The server is started if it isn't running.
 */
import pg from "pg";
import { startPostgres, adminUrl, type RunningDb } from "../scripts/lib/postgres";
import { migrate } from "../scripts/lib/migrate";
import { resetSandbox, LOCAL_SANDBOX } from "../db/seed/reset";

export const TEST_DB = "icebank_test";
let db: RunningDb | null = null;

export async function setup() {
  db = await startPostgres({ quiet: true });
  const admin = new pg.Client({ connectionString: adminUrl("postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  await migrate(adminUrl(TEST_DB), () => {});
  const c = new pg.Client({ connectionString: adminUrl(TEST_DB) });
  await c.connect();
  await resetSandbox(c, LOCAL_SANDBOX);
  await c.end();
}

export async function teardown() {
  await db?.stop();
}
