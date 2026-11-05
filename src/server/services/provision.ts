/** Creating accounts and cards. */
import crypto from "node:crypto";
import type { Db } from "../db/pool";
import { one } from "../db/pool";
import { accountNumberFor } from "@/lib/accounts";
import { withLuhnDigit } from "@/lib/validation";
import { encryptCardNumber } from "@/lib/crypto";

export async function createAccount(
  db: Db, sb: number, customerId: number, type: "CHEQUING" | "SAVINGS" | "CREDIT" | "LOAN",
  opts: { nickname?: string | null; creditLimit?: string } = {},
): Promise<number> {
  const { id } = (await one<{ id: number }>(db, "SELECT nextval('global_id_seq') AS id"))!;
  const rate = type === "SAVINGS" ? "0.0225" : type === "CREDIT" ? "0.2099" : type === "LOAN" ? "0.0899" : null;
  await db.query(
    `INSERT INTO accounts (sandbox_id, id, customer_id, account_number, type, nickname, balance, available_balance,
       credit_limit, interest_rate, status, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, 'OPEN', app_now($1))`,
    [sb, id, customerId, accountNumberFor(id), type, opts.nickname ?? null,
      type === "CREDIT" ? (opts.creditLimit ?? "5000.00") : null, rate],
  );
  return id;
}

export function newCardNumber(type: "DEBIT" | "CREDIT"): string {
  const prefix = type === "DEBIT" ? "602199" : "452099";
  let body = "";
  for (let i = 0; i < 9; i++) body += crypto.randomInt(0, 10);
  return withLuhnDigit(prefix + body);
}

export async function createCard(db: Db, sb: number, customerId: number, accountId: number, type: "DEBIT" | "CREDIT", dailyLimit: string | null = null): Promise<number> {
  const number = newCardNumber(type);
  const r = await one<{ id: number }>(db,
    `INSERT INTO cards (sandbox_id, customer_id, account_id, type, number_encrypted, last4, expiry_month, expiry_year, status,
       daily_pos_limit, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, extract(month FROM app_now($1))::int, extract(year FROM app_now($1))::int + 4, 'ACTIVE',
       $7, app_now($1), app_now($1)) RETURNING id`,
    [sb, customerId, accountId, type, encryptCardNumber(number), number.slice(-4), type === "DEBIT" ? (dailyLimit ?? "1000.00") : null]);
  return r!.id;
}
