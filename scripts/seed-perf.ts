/** npm run seed:perf -> adds the Perf User (50,000 transactions) to sandbox 1. Kept across resets. */
import pg from "pg";
import { startPostgres, adminUrl } from "./lib/postgres";
import { migrate } from "./lib/migrate";
import { seedPerf } from "../db/seed/perf";

async function main() {
  const db = await startPostgres({ quiet: true });
  try {
    const url = process.env.DATABASE_URL ?? adminUrl();
    await migrate(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query("BEGIN");
    const n = await seedPerf(client, 1);
    await client.query("COMMIT");
    await client.end();
    console.log(n ? `Perf User added: perf.user@icebank.test / IceBank#2026 with ${n} transactions (account 900).` : "Perf User already exists.");
  } finally {
    await db.stop();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
