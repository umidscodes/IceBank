import type pg from "pg";
import { seedSandbox, type SeedSummary } from "./seed";
import { LOCAL_SANDBOX_KEY } from "./data";

export interface SandboxSpec { id: number; name: string; key: string; emailSuffix?: string }

export const LOCAL_SANDBOX: SandboxSpec = { id: 1, name: "Local", key: LOCAL_SANDBOX_KEY };

/** Wipes one sandbox and re-seeds it, in a single transaction. */
export async function resetSandbox(db: pg.ClientBase, spec: SandboxSpec): Promise<SeedSummary> {
  await db.query("BEGIN");
  try {
    const exists = await db.query("SELECT 1 FROM sandboxes WHERE id = $1", [spec.id]);
    if (exists.rowCount) await db.query("SELECT reset_sandbox($1)", [spec.id]);
    const summary = await seedSandbox(db, {
      sandboxId: spec.id, sandboxName: spec.name, sandboxKey: spec.key, emailSuffix: spec.emailSuffix,
    });
    await db.query("COMMIT");
    return summary;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
