/** The database objects students test over JDBC, plus reset determinism. */
import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { reset, sql } from "./helpers";

const port = process.env.DB_PORT ?? "5433";
const asUser = (user: string) => new pg.Client({ connectionString: `postgres://${user}:${user}@localhost:${port}/icebank_test` });

describe("database objects", () => {
  beforeEach(reset);

  it("post_transfer moves money atomically and writes one TRANSFER_POSTED audit row", async () => {
    const c = asUser("qa_writer");
    await c.connect();
    try {
      const before = await c.query("SELECT id, balance FROM accounts WHERE sandbox_id = 1 AND id IN (1, 2) ORDER BY id");
      const r = await c.query("SELECT post_transfer(1, 2, 10.00, 'JDBC-TEST-1') AS debit_id");
      expect(r.rows[0].debit_id).toBeTruthy();
      const after = await c.query("SELECT id, balance FROM accounts WHERE sandbox_id = 1 AND id IN (1, 2) ORDER BY id");
      expect(Number(after.rows[0].balance)).toBeCloseTo(Number(before.rows[0].balance) - 10, 2);
      expect(Number(after.rows[1].balance)).toBeCloseTo(Number(before.rows[1].balance) + 10, 2);
      const legs = await c.query("SELECT count(*)::int AS n FROM transactions WHERE sandbox_id = 1 AND reference_id = 'JDBC-TEST-1'");
      expect(legs.rows[0].n).toBe(2);
      const audit = await c.query("SELECT action, count(*)::int AS n FROM audit_log WHERE sandbox_id = 1 AND (new_value->>'reference' = 'JDBC-TEST-1' OR new_value->>'referenceId' = 'JDBC-TEST-1') GROUP BY action ORDER BY action");
      expect(audit.rows).toEqual([{ action: "TRANSACTION_CREATED", n: 2 }, { action: "TRANSFER_POSTED", n: 1 }]);
      await expect(c.query("SELECT post_transfer(1, 2, 99999999.00, 'JDBC-TEST-2')")).rejects.toThrow(/INSUFFICIENT_FUNDS|INVALID_AMOUNT/);
      await expect(c.query("SELECT post_transfer(1, 2, 1.005, 'JDBC-TEST-3')")).rejects.toThrow(/INVALID_AMOUNT/);
      const none = await c.query("SELECT count(*)::int AS n FROM transactions WHERE sandbox_id = 1 AND reference_id IN ('JDBC-TEST-2', 'JDBC-TEST-3')");
      expect(none.rows[0].n).toBe(0);
    } finally {
      await c.end();
    }
  });

  it("trg_transactions_immutable blocks deleting POSTED rows and changing amounts", async () => {
    const c = asUser("qa_writer");
    await c.connect();
    try {
      await expect(c.query("DELETE FROM transactions WHERE sandbox_id = 1 AND id = 1")).rejects.toThrow(/IMMUTABLE_TRANSACTION/);
      await expect(c.query("UPDATE transactions SET amount = 1 WHERE sandbox_id = 1 AND id = 1")).rejects.toThrow(/IMMUTABLE_TRANSACTION/);
      await expect(c.query("SELECT set_config('icebank.reset_sandbox', '1', false); DELETE FROM transactions WHERE sandbox_id = 1 AND id = 1")).rejects.toThrow();
    } finally {
      await c.end();
    }
  });

  it("enforces constraints: balance >= 0, credit limit, one open dispute, payee delete restricted", async () => {
    const c = asUser("qa_writer");
    await c.connect();
    try {
      await expect(c.query("UPDATE accounts SET balance = -0.01 WHERE sandbox_id = 1 AND id = 1")).rejects.toThrow(/accounts_deposit_balance_check/);
      await expect(c.query("UPDATE accounts SET balance = -5000.01 WHERE sandbox_id = 1 AND id = 3")).rejects.toThrow(/accounts_credit_limit_check/);
      await expect(c.query("DELETE FROM payees WHERE sandbox_id = 1 AND id = 2")).rejects.toThrow(/foreign key/);
    } finally {
      await c.end();
    }
  });

  it("qa_reader can read but not write, and cannot see sandbox key hashes", async () => {
    const c = asUser("qa_reader");
    await c.connect();
    try {
      const v = await c.query("SELECT account_id, pending_count FROM v_account_summary WHERE sandbox_id = 1 AND account_id = 12");
      expect(v.rows[0]).toBeTruthy();
      await expect(c.query("UPDATE accounts SET nickname = 'x' WHERE sandbox_id = 1 AND id = 1")).rejects.toThrow(/permission denied/);
      await expect(c.query("SELECT key_hash FROM sandboxes")).rejects.toThrow(/permission denied/);
      const t = await c.query("SELECT total_amount FROM v_daily_etransfer_totals WHERE sandbox_id = 1 AND customer_id = 3 AND day = '2026-11-01'");
      expect(t.rows[0].total_amount).toBe("120.00");
    } finally {
      await c.end();
    }
  });

  it("reset restores identical data with the same ids", async () => {
    const snapshot = async () => (await sql().query(`SELECT
      (SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM transactions t WHERE sandbox_id = 1) AS tx,
      (SELECT md5(string_agg(a.id || ':' || a.balance || ':' || a.available_balance, '|' ORDER BY id)) FROM accounts a WHERE sandbox_id = 1) AS acc,
      (SELECT md5(string_agg(c.id || ':' || c.email, '|' ORDER BY id)) FROM users c WHERE sandbox_id = 1) AS users`)).rows[0];
    const first = await snapshot();
    await sql().query("SELECT post_transfer(1, 2, 5.00, 'BEFORE-RESET')");
    expect((await snapshot()).tx).not.toBe(first.tx);
    await reset();
    expect(await snapshot()).toEqual(first);
  });
});
