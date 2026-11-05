/**
 * Perf User: one customer with 50,000 transactions, for search and load tests (JMeter).
 * Not part of the default seed. Run `npm run seed:perf`; a reset keeps it if it was there.
 */
import type pg from "pg";
import { DateTime } from "luxon";
import { bulkInsert } from "./seed";
import { MERCHANTS, SEED_PASSWORD_HASH } from "./data";
import { ZONE, SEED_INSTANT } from "../../src/lib/dates";
import { prng, sha256 } from "../../src/lib/crypto";
import { formatCents } from "../../src/lib/money";
import { accountNumberFor } from "../../src/lib/accounts";

export const PERF_IDS = { user: 900, customer: 900, account: 900, firstTransaction: 500001 } as const;
export const PERF_TRANSACTIONS = 50000;

export async function perfUserExists(db: pg.ClientBase, sb: number): Promise<boolean> {
  return ((await db.query("SELECT 1 FROM users WHERE sandbox_id = $1 AND id = $2", [sb, PERF_IDS.user])).rowCount ?? 0) > 0;
}

export async function seedPerf(db: pg.ClientBase, sb: number, emailSuffix = ""): Promise<number> {
  if (await perfUserExists(db, sb)) return 0;
  const rnd = prng(900900);
  const created = DateTime.fromISO("2024-11-04T09:00:00", { zone: ZONE });
  const iso = (d: DateTime) => d.toUTC().toISO()!;
  await db.query("SELECT set_config('icebank.skip_audit', 'on', true)");
  await bulkInsert(db, "users", ["sandbox_id", "id", "email", "password_hash", "role", "status", "failed_login_count", "classic_view", "created_at", "updated_at"],
    [[sb, PERF_IDS.user, `perf.user${emailSuffix}@icebank.test`, SEED_PASSWORD_HASH, "CUSTOMER", "ACTIVE", 0, false, iso(created), iso(created)]]);
  await bulkInsert(db, "customers", ["sandbox_id", "id", "user_id", "first_name", "last_name", "date_of_birth", "phone", "address_line1", "city", "province",
    "postal_code", "sin_hash", "sin_last3", "created_at", "updated_at"],
    [[sb, PERF_IDS.customer, PERF_IDS.user, "Perf", "User", "1980-01-01", "(416) 555-0900", "900 Load Test Lane", "Toronto", "ON", "M5V 2T6",
      sha256("130692544"), "544", iso(created), iso(created)]]);
  const span = SEED_INSTANT.toMillis() - created.toMillis();
  const rows: unknown[][] = [];
  let balance = 0n; // every cent of the balance is backed by a transaction row
  const times: number[] = [];
  for (let i = 0; i < PERF_TRANSACTIONS; i++) times.push(created.toMillis() + Math.floor(rnd.next() * span));
  times.sort((a, b) => a - b);
  for (let i = 0; i < PERF_TRANSACTIONS; i++) {
    const at = DateTime.fromMillis(times[i], { zone: ZONE });
    const m = rnd.pick(MERCHANTS);
    let credit = i === 0 || rnd.chance(0.3);
    let amount = credit ? BigInt(rnd.int(5000, 300000)) : BigInt(rnd.int(m.min * 100, m.max * 100));
    if (!credit && amount > balance) { credit = true; amount = BigInt(rnd.int(5000, 300000)); }
    balance += credit ? amount : -amount;
    rows.push([sb, PERF_IDS.firstTransaction + i, PERF_IDS.account, credit ? "CREDIT" : "DEBIT", formatCents(amount), formatCents(balance), "POSTED",
      credit ? "PAYROLL" : "PURCHASE", credit ? "Payroll deposit - Load Test Inc" : `POS purchase - ${m.name}`, `PERF-${String(i + 1).padStart(6, "0")}`,
      iso(at), iso(at)]);
  }
  await bulkInsert(db, "accounts", ["sandbox_id", "id", "customer_id", "account_number", "type", "nickname", "balance", "available_balance", "status", "opened_at"],
    [[sb, PERF_IDS.account, PERF_IDS.customer, accountNumberFor(PERF_IDS.account), "CHEQUING", "Perf chequing", formatCents(balance), formatCents(balance), "OPEN", iso(created)]]);
  await bulkInsert(db, "transactions", ["sandbox_id", "id", "account_id", "direction", "amount", "balance_after", "status", "type", "description", "reference_id", "created_at", "posted_at"], rows);
  await db.query("SELECT set_config('icebank.skip_audit', '', true)");
  return rows.length;
}
