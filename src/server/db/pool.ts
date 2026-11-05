import pg from "pg";

// DATE columns stay "YYYY-MM-DD" strings; BIGINT ids and counts become numbers (all < 2^53).
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __icebankPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__icebankPool) {
    const connectionString = process.env.DATABASE_URL ?? "postgres://icebank_app:icebank_app@localhost:5433/icebank";
    g.__icebankPool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
    g.__icebankPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return g.__icebankPool;
}

export type Db = pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}

/**
 * Runs fn inside a transaction. `actorUserId` is written to icebank.actor_user_id so the audit
 * triggers know who acted.
 */
export async function tx<T>(fn: (db: Db) => Promise<T>, opts: { actorUserId?: number | null } = {}): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    if (opts.actorUserId) await client.query("SELECT set_config('icebank.actor_user_id', $1, true)", [String(opts.actorUserId)]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function one<T extends pg.QueryResultRow>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}

export async function appNow(db: Db | null, sandboxId: number): Promise<Date> {
  const r = db
    ? await db.query<{ now: Date }>("SELECT app_now($1) AS now", [sandboxId])
    : await pool().query<{ now: Date }>("SELECT app_now($1) AS now", [sandboxId]);
  return r.rows[0].now;
}
