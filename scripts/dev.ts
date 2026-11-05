/**
 * npm run dev   -> embedded PostgreSQL on 5433, migrations, seed (first run), Next.js dev server on 3000.
 * npm start     -> same, but builds and serves the production bundle (faster pages).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import pg from "pg";
import { startPostgres, adminUrl, appUrl, ROOT } from "./lib/postgres";
import { migrate } from "./lib/migrate";
import { resetSandbox, LOCAL_SANDBOX } from "../db/seed/reset";

const prod = process.argv.includes("--prod");
const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const t0 = Date.now();
  const db = await startPostgres();
  const shutdown = async (code = 0) => {
    await db.stop();
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    const url = process.env.DATABASE_URL ?? adminUrl();
    await migrate(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const seeded = await client.query("SELECT 1 FROM sandboxes WHERE id = 1");
    if (seeded.rowCount === 0) {
      console.log("[db] Seeding sandbox 1 (first run) ...");
      const s = await resetSandbox(client, LOCAL_SANDBOX);
      console.log(`[db] Seeded ${s.customers} customers, ${s.accounts} accounts, ${s.transactions} transactions`);
    }
    await client.end();
  } catch (err) {
    console.error(`\n[db] ${(err as Error).message}\n`);
    await shutdown(1);
  }

  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const env = { ...process.env, DATABASE_URL: appUrl(), PORT: String(PORT), ICEBANK_ADMIN_DATABASE_URL: process.env.DATABASE_URL ?? adminUrl() };
  if (prod && !fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.log("[app] Building production bundle (first run only) ...");
    const build = spawn(process.execPath, [nextBin, "build"], { cwd: ROOT, env, stdio: "inherit" });
    const code: number = await new Promise((r) => build.on("exit", (c) => r(c ?? 1)));
    if (code !== 0) await shutdown(code);
  }
  const app = spawn(process.execPath, [nextBin, prod ? "start" : "dev", "-p", String(PORT)], { cwd: ROOT, env, stdio: "inherit" });
  console.log(`[app] Ice Bank starting on http://localhost:${PORT}  (database ready in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`[app] Swagger UI: http://localhost:${PORT}/swagger   Ice Mail: http://localhost:${PORT}/mail`);
  app.on("exit", (code) => void shutdown(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
