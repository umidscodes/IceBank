/** Row -> API representation mappers, plus their OpenAPI schemas. */
import { z, Money, DateTimeStr, DateStr, Id, registry } from "../openapi/registry";
import { money, toCents, formatCents, maxCents, mulRate } from "@/lib/money";
import { isoOffset, isoDate } from "@/lib/dates";
import { ACCOUNT_LABELS } from "@/lib/accounts";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

export const AccountSchema = registry.register("Account", z.object({
  id: Id,
  accountNumber: z.string().openapi({ example: "999-10045-1007919" }),
  type: z.enum(["CHEQUING", "SAVINGS", "CREDIT", "LOAN"]),
  displayName: z.string().openapi({ example: "Chequing 7919" }),
  nickname: z.string().nullable(),
  currency: z.literal("CAD"),
  balance: Money.openapi({ description: "Negative for credit cards and loans when money is owed" }),
  availableBalance: Money,
  status: z.enum(["OPEN", "FROZEN", "CLOSED"]),
  creditLimit: Money.nullable(),
  availableCredit: Money.nullable(),
  minimumPayment: Money.nullable().openapi({ description: "Credit cards: greater of $10.00 or 3% of the amount owing" }),
  interestRate: z.string().nullable().openapi({ example: "2.25", description: "Annual rate in percent" }),
  openedAt: DateTimeStr,
}));

export function minimumPayment(balance: string): string {
  const owed = -toCents(balance);
  if (owed <= 0n) return "0.00";
  const pct = mulRate(owed, "0.03");
  const min = maxCents(1000n, pct);
  return formatCents(min > owed ? owed : min);
}

export function accountView(a: Row) {
  const type = String(a.type);
  const balance = money(s(a.balance));
  const number = String(a.account_number);
  const rate = a.interest_rate === null || a.interest_rate === undefined ? null : (Number(a.interest_rate) * 100).toFixed(2);
  return {
    id: Number(a.id),
    accountNumber: number,
    type,
    displayName: `${a.nickname ?? ACCOUNT_LABELS[type]} ${number.slice(-4)}`,
    nickname: s(a.nickname),
    currency: "CAD" as const,
    balance,
    availableBalance: money(s(a.available_balance)),
    status: String(a.status),
    creditLimit: type === "CREDIT" ? money(s(a.credit_limit)) : null,
    availableCredit: type === "CREDIT" ? formatCents(toCents(String(a.available_balance)) + toCents(String(a.credit_limit))) : null,
    minimumPayment: type === "CREDIT" ? minimumPayment(balance) : null,
    interestRate: rate,
    openedAt: isoOffset(a.opened_at as Date)!,
  };
}

export const TransactionSchema = registry.register("Transaction", z.object({
  id: Id,
  accountId: Id,
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount: Money.openapi({ description: "Always positive; direction says which way it moved" }),
  balanceAfter: Money.nullable().openapi({ description: "null while PENDING" }),
  status: z.enum(["PENDING", "POSTED", "REVERSED"]),
  type: z.string().openapi({ example: "TRANSFER" }),
  description: z.string().openapi({ example: "Transfer to Savings 5838" }),
  referenceId: z.string().openapi({ example: "TRF-4F1A2B3C4D5E" }),
  createdAt: DateTimeStr,
  postedAt: DateTimeStr.nullable(),
}));

export function transactionView(t: Row) {
  return {
    id: Number(t.id),
    accountId: Number(t.account_id),
    direction: String(t.direction),
    amount: money(s(t.amount)),
    balanceAfter: t.balance_after === null ? null : money(s(t.balance_after)),
    status: String(t.status),
    type: String(t.type),
    description: String(t.description),
    referenceId: String(t.reference_id),
    createdAt: isoOffset(t.created_at as Date)!,
    postedAt: isoOffset(t.posted_at as Date | null),
  };
}

export const iso = isoOffset;
export const date = isoDate;
export { DateStr };
