/** npm run db:start -> runs only the database (for DBeaver/JDBC practice without the app). Ctrl+C to stop. */
import { startPostgres, adminUrl } from "./lib/postgres";
import { migrate } from "./lib/migrate";

async function main() {
  const db = await startPostgres();
  await migrate(process.env.DATABASE_URL ?? adminUrl());
  console.log("[db] Ready. Press Ctrl+C to stop.");
  const stop = async () => { await db.stop(); process.exit(0); };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => { console.error(err); process.exit(1); });
