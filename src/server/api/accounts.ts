/** Accounts, transactions (filter/sort/page/search), CSV export and monthly PDF statements. */
import { z, doc, page, PageQuery, DateStr, Money, IdParam } from "../openapi/registry";
import { route, ok, created } from "../http/handler";
import { query, tx, one, type Db } from "../db/pool";
import { intParam, pageResult, parseSort } from "../http/params";
import { fieldError, notFound, rule, validation } from "../errors";
import { AccountSchema, TransactionSchema, accountView, transactionView } from "./views";
import { customerId, audit, notifyCustomer } from "../services/common";
import { createAccount } from "../services/provision";
import { parseAmount, money } from "@/lib/money";
import { isValidIsoDate, startOfDay, endOfDay, ZONE } from "@/lib/dates";
import { renderStatementPdf } from "../services/statement-pdf";
import { DateTime } from "luxon";

export const MAX_SAVINGS = 3;

// ---- schemas ----------------------------------------------------------------------------------

const OpenAccountBody = z.object({
  type: z.literal("SAVINGS", { error: "must be SAVINGS (other account types are opened in a branch)" }),
  nickname: z.string().trim().min(1, "must be 1 to 30 characters").max(30, "must be 1 to 30 characters").optional().openapi({ example: "Vacation" }),
});

const TX_TYPES = ["TRANSFER", "ETRANSFER", "BILL_PAYMENT", "CHEQUE_DEPOSIT", "INTEREST", "FEE", "PURCHASE", "PAYROLL", "LOAN_DISBURSEMENT",
  "LOAN_PAYMENT", "REVERSAL", "ATM", "CARD_PAYMENT", "PREAUTHORIZED_DEBIT", "ADJUSTMENT"] as const;

const TxFilter = z.object({
  from: DateStr.optional().openapi({ description: "First day, inclusive (Toronto date)" }),
  to: DateStr.optional().openapi({ description: "Last day, inclusive (Toronto date)" }),
  type: z.enum(TX_TYPES, { error: `must be one of ${TX_TYPES.join(", ")}` }).optional(),
  direction: z.enum(["DEBIT", "CREDIT"], { error: "must be DEBIT or CREDIT" }).optional(),
  status: z.enum(["PENDING", "POSTED", "REVERSED"], { error: "must be PENDING, POSTED or REVERSED" }).optional(),
  minAmount: z.string().optional().openapi({ example: "10.00" }),
  maxAmount: z.string().optional().openapi({ example: "500.00" }),
  q: z.string().max(100, "must be at most 100 characters").optional().openapi({ example: "coffee", description: "Case-insensitive text search in the description" }),
});
const TxQuery = PageQuery.extend(TxFilter.shape);

const StatementSchema = z.object({
  month: z.string().openapi({ example: "2026-10" }),
  periodStart: DateStr, periodEnd: DateStr,
  openingBalance: Money, closingBalance: Money,
  transactionCount: z.number().int(),
  url: z.string().openapi({ example: "/api/v1/accounts/1/statements/2026-10.pdf" }),
});

// ---- docs -------------------------------------------------------------------------------------

doc({ method: "get", path: "/accounts", tag: "Accounts", summary: "List my accounts", auth: "bearer",
  responses: { 200: { schema: z.array(AccountSchema), description: "Accounts" } } });
doc({ method: "post", path: "/accounts", tag: "Accounts", summary: "Open a savings account", auth: "bearer",
  description: "Only SAVINGS can be opened online. At most 3 savings accounts per customer (422 SAVINGS_LIMIT). Interest 2.25% a year, accrued daily, paid monthly.",
  body: OpenAccountBody, bodyExample: { type: "SAVINGS", nickname: "Vacation" },
  responses: { 201: { schema: AccountSchema, description: "Opened", headers: { Location: "/api/v1/accounts/{id}" } } },
  errors: { 422: "You already have 3 savings accounts, the maximum." } });
doc({ method: "get", path: "/accounts/{id}", tag: "Accounts", summary: "Get one account", auth: "bearer", params: IdParam,
  description: "Another customer's account returns 404, exactly like an id that does not exist.",
  responses: { 200: { schema: AccountSchema, description: "Account" } }, errors: { 404: "Account not found." } });
doc({ method: "get", path: "/accounts/{id}/transactions", tag: "Accounts", summary: "Search an account's transactions", auth: "bearer", params: IdParam,
  description: "Newest first by default. Date range is inclusive at both ends (Toronto dates). Page size 1 to 100, default 20. " +
    "Sort fields: createdAt, amount, description, type.",
  query: TxQuery, responses: { 200: { schema: page(TransactionSchema), description: "Transactions" } }, errors: { 404: "Account not found." } });
doc({ method: "get", path: "/accounts/{id}/transactions.csv", tag: "Accounts", summary: "Export transactions as CSV", auth: "bearer", params: IdParam,
  description: "Same filters as the JSON endpoint, no paging (newest first, at most 10,000 rows). Columns, in order: " +
    "id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId",
  query: TxFilter, responses: { 200: { schema: z.string(), contentType: "text/csv", description: "CSV file (attachment)" } }, errors: { 404: "Account not found." } });
doc({ method: "get", path: "/accounts/{id}/statements", tag: "Accounts", summary: "List monthly statements", auth: "bearer", params: IdParam,
  description: "One statement per complete calendar month since the account opened, newest first.",
  responses: { 200: { schema: z.array(StatementSchema), description: "Statements" } }, errors: { 404: "Account not found." } });
doc({ method: "get", path: "/accounts/{id}/statements/{month}.pdf", tag: "Accounts", summary: "Download a monthly statement (PDF)", auth: "bearer",
  params: z.object({ id: z.string().openapi({ example: "1" }), month: z.string().openapi({ example: "2026-10", description: "yyyy-mm" }) }),
  responses: { 200: { schema: z.string().openapi({ format: "binary" }), contentType: "application/pdf", description: "PDF (attachment)" } },
  errors: { 404: "Statement not found." } });

// ---- helpers ----------------------------------------------------------------------------------

export async function ownedAccount(db: Db | null, sb: number, custId: number, accountId: number, lock = false) {
  const sql = `SELECT * FROM accounts WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3${lock ? " FOR UPDATE" : ""}`;
  const row = db ? await one(db, sql, [sb, accountId, custId]) : (await query(sql, [sb, accountId, custId]))[0];
  if (!row) throw notFound("Account");
  return row as Record<string, unknown>;
}

function buildFilter(f: z.infer<typeof TxFilter>, sb: number, accountId: number) {
  const where = ["t.sandbox_id = $1", "t.account_id = $2"];
  const params: unknown[] = [sb, accountId];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  const errors = [];
  if (f.from && !isValidIsoDate(f.from)) errors.push({ field: "from", message: "must be a real date" });
  if (f.to && !isValidIsoDate(f.to)) errors.push({ field: "to", message: "must be a real date" });
  if (f.from && f.to && f.from > f.to) errors.push({ field: "from", message: "must be on or before to" });
  const min = f.minAmount !== undefined ? parseAmount(f.minAmount) : null;
  const max = f.maxAmount !== undefined ? parseAmount(f.maxAmount) : null;
  if (f.minAmount !== undefined && min === null) errors.push({ field: "minAmount", message: "must be an amount such as 10.00" });
  if (f.maxAmount !== undefined && max === null) errors.push({ field: "maxAmount", message: "must be an amount such as 500.00" });
  if (min !== null && max !== null && min > max) errors.push({ field: "minAmount", message: "must not be greater than maxAmount" });
  if (errors.length) throw validation(errors);
  if (f.from) add("t.created_at >= ?", startOfDay(f.from));
  if (f.to) add("t.created_at <= ?", endOfDay(f.to));
  if (f.type) add("t.type = ?", f.type);
  if (f.direction) add("t.direction = ?", f.direction);
  if (f.status) add("t.status = ?", f.status);
  if (min !== null) add("t.amount >= ?", money(min));
  if (max !== null) add("t.amount <= ?", money(max));
  if (f.q) add("t.description ILIKE ?", `%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  return { where: where.join(" AND "), params };
}

const SORTS = { createdAt: "t.created_at", amount: "t.amount", description: "t.description", type: "t.type" };

// ---- handlers ---------------------------------------------------------------------------------

export const listAccounts = route({ auth: "customer" }, async (ctx) => {
  const rows = await query("SELECT * FROM accounts WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY id", [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map(accountView));
});

export const openAccount = route({ auth: "customer", body: OpenAccountBody }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  return tx(async (db) => {
    await db.query("SELECT 1 FROM customers WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, cid]);
    const { n } = (await one<{ n: number }>(db,
      "SELECT count(*)::int AS n FROM accounts WHERE sandbox_id = $1 AND customer_id = $2 AND type = 'SAVINGS' AND status <> 'CLOSED'", [sb, cid]))!;
    if (n >= MAX_SAVINGS) throw rule("SAVINGS_LIMIT", `You already have ${MAX_SAVINGS} savings accounts, the maximum.`);
    const id = await createAccount(db, sb, cid, "SAVINGS", { nickname: ctx.body.nickname ?? null });
    const row = (await one(db, "SELECT * FROM accounts WHERE sandbox_id = $1 AND id = $2", [sb, id]))!;
    await audit(db, sb, ctx.user!.userId, "ACCOUNT_OPENED", "account", id, null, { type: "SAVINGS", nickname: ctx.body.nickname ?? null });
    await notifyCustomer(db, sb, cid, "ACCOUNT", "Savings account opened", `Your new savings account ending ${String(row.account_number).slice(-4)} is ready.`);
    return created(accountView(row), `/api/v1/accounts/${id}`);
  }, { actorUserId: ctx.user!.userId });
});

export const getAccount = route({ auth: "customer" }, async (ctx) => {
  const a = await ownedAccount(null, ctx.user!.sandboxId, customerId(ctx.user), intParam(ctx.params.id));
  return ok(accountView(a));
});

export const listTransactions = route({ auth: "customer", query: TxQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const accountId = intParam(ctx.params.id);
  await ownedAccount(null, sb, customerId(ctx.user), accountId);
  const { page: p, size, sort, ...filter } = ctx.query;
  const order = parseSort(sort, SORTS, "t.created_at DESC");
  const { where, params } = buildFilter(filter, sb, accountId);
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM transactions t WHERE ${where}`, params);
  const rows = await query(`SELECT t.* FROM transactions t WHERE ${where} ORDER BY ${order}, t.id ${order.endsWith("ASC") ? "ASC" : "DESC"} LIMIT ${size} OFFSET ${p * size}`, params);
  return ok(pageResult(rows.map(transactionView), p, size, n));
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const CSV_COLUMNS = ["id", "createdAt", "postedAt", "description", "type", "direction", "amount", "balanceAfter", "status", "referenceId"] as const;

export const exportCsv = route({ auth: "customer", query: TxFilter }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const accountId = intParam(ctx.params.id);
  const acct = await ownedAccount(null, sb, customerId(ctx.user), accountId);
  const { where, params } = buildFilter(ctx.query, sb, accountId);
  const rows = await query(`SELECT t.* FROM transactions t WHERE ${where} ORDER BY t.created_at DESC, t.id DESC LIMIT 10000`, params);
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const t = transactionView(r) as Record<string, unknown>;
    lines.push(CSV_COLUMNS.map((c) => csvCell(t[c])).join(","));
  }
  const filename = `icebank-${String(acct.account_number).slice(-4)}-transactions.csv`;
  return {
    status: 200,
    headers: { "Content-Disposition": `attachment; filename="${filename}"` },
    raw: { data: lines.join("\r\n") + "\r\n", contentType: "text/csv; charset=utf-8" },
  };
});

export interface StatementInfo { month: string; periodStart: string; periodEnd: string; openingBalance: string; closingBalance: string; transactionCount: number }

async function statementMonths(sb: number, acct: Record<string, unknown>): Promise<string[]> {
  const [{ now }] = await query<{ now: Date }>("SELECT app_now($1) AS now", [sb]);
  const opened = DateTime.fromJSDate(acct.opened_at as Date).setZone(ZONE).startOf("month");
  const current = DateTime.fromJSDate(now).setZone(ZONE).startOf("month");
  const months: string[] = [];
  for (let m = current.minus({ months: 1 }); m >= opened; m = m.minus({ months: 1 })) months.push(m.toFormat("yyyy-MM"));
  return months;
}

export async function statementFor(sb: number, accountId: number, month: string): Promise<StatementInfo & { rows: Record<string, unknown>[] }> {
  const start = DateTime.fromFormat(month, "yyyy-MM", { zone: ZONE }).startOf("month");
  const end = start.endOf("month");
  const [open] = await query<{ b: string | null }>(
    `SELECT balance_after AS b FROM transactions WHERE sandbox_id = $1 AND account_id = $2 AND status <> 'PENDING' AND balance_after IS NOT NULL
       AND created_at < $3 ORDER BY created_at DESC, id DESC LIMIT 1`, [sb, accountId, start.toJSDate()]);
  const rows = await query(
    `SELECT * FROM transactions WHERE sandbox_id = $1 AND account_id = $2 AND status <> 'PENDING' AND created_at >= $3 AND created_at <= $4
      ORDER BY created_at, id`, [sb, accountId, start.toJSDate(), end.toJSDate()]);
  const opening = money(open?.b ?? "0");
  const closing = rows.length ? money(String(rows[rows.length - 1].balance_after)) : opening;
  return { month, periodStart: start.toISODate()!, periodEnd: end.toISODate()!, openingBalance: opening, closingBalance: closing, transactionCount: rows.length, rows };
}

export const listStatements = route({ auth: "customer" }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const id = intParam(ctx.params.id);
  const acct = await ownedAccount(null, sb, customerId(ctx.user), id);
  const months = (await statementMonths(sb, acct)).slice(0, 24);
  const out = [];
  for (const m of months) {
    const { rows: _rows, ...info } = await statementFor(sb, id, m);
    out.push({ ...info, url: `/api/v1/accounts/${id}/statements/${m}.pdf` });
  }
  return ok(out);
});

export const statementPdf = route({ auth: "customer" }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const id = intParam(ctx.params.id);
  const m = /^(\d{4}-\d{2})\.pdf$/.exec(ctx.params.month ?? "");
  if (!m) throw fieldError("month", "must look like 2026-10.pdf");
  const acct = await ownedAccount(null, sb, customerId(ctx.user), id);
  if (!(await statementMonths(sb, acct)).includes(m[1])) throw notFound("Statement");
  const st = await statementFor(sb, id, m[1]);
  const cust = (await query("SELECT first_name, last_name, address_line1, address_line2, city, province, postal_code FROM customers WHERE sandbox_id = $1 AND id = $2",
    [sb, acct.customer_id]))[0];
  const pdf = await renderStatementPdf({ account: accountView(acct), customer: cust, statement: st, rows: st.rows.map(transactionView) });
  return {
    status: 200,
    headers: { "Content-Disposition": `attachment; filename="icebank-statement-${String(acct.account_number).slice(-4)}-${m[1]}.pdf"` },
    raw: { data: pdf, contentType: "application/pdf" },
  };
});

