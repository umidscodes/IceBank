/** npm run reset -> restores sandbox 1 to its seed state (same as POST /api/v1/test/reset). */
import pg from "pg";
import { startPostgres, adminUrl } from "./lib/postgres";
import { migrate } from "./lib/migrate";
import { resetSandbox, LOCAL_SANDBOX } from "../db/seed/reset";

async function main() {
  const db = await startPostgres({ quiet: true });
  try {
    const url = process.env.DATABASE_URL ?? adminUrl();
    await migrate(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const t0 = Date.now();
    const s = await resetSandbox(client, LOCAL_SANDBOX);
    await client.end();
    console.log(`Sandbox 1 reset in ${Date.now() - t0} ms: ${s.customers} customers, ${s.accounts} accounts, ${s.transactions} transactions.`);
  } finally {
    await db.stop();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
