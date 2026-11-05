/** Billers directory, saved payees and bill payments (pay now, scheduled, recurring). */
import { z, doc, page, PageQuery, Money, DateStr, DateTimeStr, Id, IdParam, moneyInput, registry } from "../openapi/registry";
import { route, ok, created, noContent } from "../http/handler";
import { query, tx, one } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { conflict, notFound, rule, validation, type FieldError } from "../errors";
import { customerId, audit, notifyCustomer, today as todayOf } from "../services/common";
import { formatCents, money, toCents } from "@/lib/money";
import { referenceId } from "@/lib/crypto";
import { isoOffset, isValidIsoDate, nextBusinessDay, onOrNextBusinessDay, addDays, holidayName } from "@/lib/dates";
import { topUpSeries, SERIES_WINDOW } from "../services/due-work";
import { ownedAccount } from "./accounts";

export const MAX_BILL_PAYMENT = 2500000n; // $25,000.00

// ---- schemas ----------------------------------------------------------------------------------

const BillerSchema = registry.register("Biller", z.object({
  id: Id, name: z.string().openapi({ example: "Niagara Power Co" }), category: z.string().openapi({ example: "Utilities" }),
  accountNumberHint: z.string().openapi({ example: "10 digits, e.g. 4410028731" }),
  accountNumberPattern: z.string().openapi({ example: "^\\d{10}$", description: "Regular expression the account number must match" }),
}));
const PayeeSchema = registry.register("Payee", z.object({
  id: Id, billerId: Id, billerName: z.string(), category: z.string(), nickname: z.string().nullable(),
  accountNumber: z.string().openapi({ example: "4410028731" }), createdAt: DateTimeStr,
}));
const PayeeBody = z.object({
  billerId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  accountNumber: z.string({ error: "is required" }).trim().min(1, "is required").max(30).openapi({ example: "4410028731" }),
  nickname: z.string().trim().min(1, "must be 1 to 30 characters").max(30, "must be 1 to 30 characters").optional().openapi({ example: "Hydro" }),
});
const PayeeUpdate = z.object({
  accountNumber: z.string().trim().min(1, "is required").max(30).optional(),
  nickname: z.string().trim().max(30, "must be at most 30 characters").nullable().optional(),
}).openapi({ example: { nickname: "Cottage hydro" } });

const PaymentBody = z.object({
  payeeId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  fromAccountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  amount: moneyInput({ min: 1n, max: MAX_BILL_PAYMENT, example: "85.40", description: "$0.01 to $25,000.00" }),
  paymentDate: DateStr.optional().openapi({ description: "Today (default) or a future date up to 1 year ahead" }),
  recurrence: z.enum(["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"], { error: "must be NONE, WEEKLY, BIWEEKLY or MONTHLY" }).default("NONE"),
  endDate: DateStr.optional().openapi({ description: "Recurring only: last date an occurrence may fall on" }),
});
const PaymentSchema = registry.register("BillPayment", z.object({
  id: Id, payeeId: Id, billerName: z.string(), payeeNickname: z.string().nullable(), payeeAccountNumber: z.string(), fromAccountId: Id,
  amount: Money, paymentDate: DateStr.openapi({ description: "The date you asked for" }),
  postingDate: DateStr.openapi({ description: "When the money actually moves (business days only)" }),
  recurrence: z.enum(["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"]), seriesId: z.string().nullable(), occurrence: z.number().int(), endDate: DateStr.nullable(),
  status: z.enum(["SCHEDULED", "PENDING", "POSTED", "CANCELLED", "FAILED"]), failureReason: z.string().nullable(), transactionId: Id.nullable(),
  referenceId: z.string(), createdAt: DateTimeStr, postedAt: DateTimeStr.nullable(), cancelledAt: DateTimeStr.nullable(),
}));
const PaymentsQuery = PageQuery.extend({
  status: z.enum(["SCHEDULED", "PENDING", "POSTED", "CANCELLED", "FAILED"]).optional(),
  payeeId: z.coerce.number().int().positive().optional(),
});
const CancelQuery = z.object({ scope: z.enum(["occurrence", "series"], { error: "must be occurrence or series" }).default("occurrence") });

// ---- docs -------------------------------------------------------------------------------------

doc({ method: "get", path: "/billers", tag: "Bill payments", summary: "Search the billers directory", auth: "bearer",
  query: z.object({ q: z.string().optional().openapi({ example: "power", description: "Case-insensitive search in the name" }) }),
  responses: { 200: { schema: z.array(BillerSchema), description: "Billers (alphabetical)" } } });
doc({ method: "get", path: "/payees", tag: "Bill payments", summary: "List my saved payees", auth: "bearer",
  responses: { 200: { schema: z.array(PayeeSchema), description: "Payees" } } });
doc({ method: "post", path: "/payees", tag: "Bill payments", summary: "Add a payee", auth: "bearer", body: PayeeBody,
  description: "The account number must match the biller's format (see accountNumberPattern). The same biller + account number can be saved once (409 PAYEE_EXISTS).",
  responses: { 201: { schema: PayeeSchema, description: "Added", headers: { Location: "/api/v1/payees/{id}" } } },
  errors: { 400: "One or more fields are invalid.", 409: "You already have this payee." } });
doc({ method: "get", path: "/payees/{id}", tag: "Bill payments", summary: "Get one payee", auth: "bearer", params: IdParam,
  responses: { 200: { schema: PayeeSchema, description: "Payee" } }, errors: { 404: "Payee not found." } });
doc({ method: "put", path: "/payees/{id}", tag: "Bill payments", summary: "Update a payee's nickname or account number", auth: "bearer",
  params: IdParam, body: PayeeUpdate, responses: { 200: { schema: PayeeSchema, description: "Updated" } }, errors: { 404: "Payee not found." } });
doc({ method: "delete", path: "/payees/{id}", tag: "Bill payments", summary: "Delete a payee", auth: "bearer", params: IdParam,
  description: "Not allowed while the payee has scheduled or pending payments (409 PAYEE_HAS_SCHEDULED_PAYMENTS). Past payments keep their history.",
  responses: { 204: { description: "Deleted" } }, errors: { 404: "Payee not found.", 409: "Cancel this payee's scheduled payments first." } });
doc({
  method: "post", path: "/bill-payments", tag: "Bill payments", summary: "Pay a bill now or schedule it", auth: "bearer", idempotent: true,
  description: "Pay now (paymentDate = today): the money is held at once (PENDING) and posts on the NEXT business day. " +
    "Scheduled (future paymentDate): posts on that date, or the next business day if it falls on a weekend or holiday; funds are checked on the posting date " +
    "(FAILED if short). Recurring (WEEKLY, BIWEEKLY, MONTHLY) must start on a future date; a monthly payment on the 29th to 31st falls on the last " +
    "day of shorter months. Holidays: New Year's, Family Day, Good Friday, Victoria Day, Canada Day, Civic Holiday, Labour Day, Truth and Reconciliation, " +
    "Thanksgiving, Remembrance Day, Christmas, Boxing Day (observed on the next weekday when they fall on a weekend).",
  body: PaymentBody, bodyExample: { payeeId: 1, fromAccountId: 1, amount: "85.40", paymentDate: "2026-11-30", recurrence: "MONTHLY" },
  responses: { 201: { schema: PaymentSchema.extend({ upcoming: z.array(PaymentSchema) }), description: "Created (upcoming lists the next occurrences of a series)", headers: { Location: "/api/v1/bill-payments/{id}" } } },
  errors: { 404: "Payee not found.", 422: "Available balance is 40.00." },
});
doc({ method: "get", path: "/bill-payments", tag: "Bill payments", summary: "List my bill payments", auth: "bearer", query: PaymentsQuery,
  description: "Sorted by posting date, latest first.", responses: { 200: { schema: page(PaymentSchema), description: "Payments" } } });
doc({ method: "get", path: "/bill-payments/{id}", tag: "Bill payments", summary: "Get one bill payment", auth: "bearer", params: IdParam,
  responses: { 200: { schema: PaymentSchema, description: "Payment" } }, errors: { 404: "Bill payment not found." } });
doc({ method: "delete", path: "/bill-payments/{id}", tag: "Bill payments", summary: "Cancel a scheduled payment", auth: "bearer", params: IdParam, query: CancelQuery,
  description: "Cancels a SCHEDULED or PENDING payment (a pending hold is released). scope=series also cancels every later occurrence and stops the series. " +
    "Posted, failed or cancelled payments return 409.",
  responses: { 204: { description: "Cancelled" } }, errors: { 404: "Bill payment not found.", 409: "Only a scheduled or pending payment can be cancelled." } });

// ---- helpers ----------------------------------------------------------------------------------

const billerView = (b: Record<string, unknown>) => ({
  id: Number(b.id), name: String(b.name), category: String(b.category), accountNumberHint: String(b.account_number_hint), accountNumberPattern: String(b.account_number_pattern),
});
const PAYEE_SELECT = `SELECT p.*, b.name AS biller_name, b.category, b.account_number_pattern, b.account_number_hint FROM payees p
  JOIN billers b ON b.sandbox_id = p.sandbox_id AND b.id = p.biller_id`;
const payeeView = (p: Record<string, unknown>) => ({
  id: Number(p.id), billerId: Number(p.biller_id), billerName: String(p.biller_name), category: String(p.category),
  nickname: (p.nickname as string | null) ?? null, accountNumber: String(p.account_number), createdAt: isoOffset(p.created_at as Date)!,
});
const PAY_SELECT = `SELECT bp.*, b.name AS biller_name, p.nickname AS payee_nickname, p.account_number AS payee_account_number FROM bill_payments bp
  JOIN payees p ON p.sandbox_id = bp.sandbox_id AND p.id = bp.payee_id JOIN billers b ON b.sandbox_id = p.sandbox_id AND b.id = p.biller_id`;
const payView = (r: Record<string, unknown>) => ({
  id: Number(r.id), payeeId: Number(r.payee_id), billerName: String(r.biller_name), payeeNickname: (r.payee_nickname as string | null) ?? null,
  payeeAccountNumber: String(r.payee_account_number), fromAccountId: Number(r.from_account_id), amount: money(String(r.amount)),
  paymentDate: String(r.requested_date), postingDate: String(r.posting_date), recurrence: String(r.recurrence), seriesId: (r.series_id as string | null) ?? null,
  occurrence: Number(r.occurrence), endDate: (r.end_date as string | null) ?? null, status: String(r.status), failureReason: (r.failure_reason as string | null) ?? null,
  transactionId: r.transaction_id === null ? null : Number(r.transaction_id), referenceId: String(r.reference_id), createdAt: isoOffset(r.created_at as Date)!,
  postedAt: isoOffset(r.posted_at as Date | null), cancelledAt: isoOffset(r.cancelled_at as Date | null),
});

function checkAccountNumber(pattern: string, hint: string, value: string): FieldError | null {
  return new RegExp(pattern).test(value) ? null : { field: "accountNumber", message: `does not match this biller's format (${hint})` };
}

// ---- billers and payees ------------------------------------------------------------------------

export const listBillers = route({ auth: "user", query: z.object({ q: z.string().max(60).optional() }) }, async (ctx) => {
  const q = ctx.query.q?.trim();
  const rows = await query(`SELECT * FROM billers WHERE sandbox_id = $1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%') ORDER BY name`,
    [ctx.user!.sandboxId, q ? q.replace(/[\\%_]/g, (c) => "\\" + c) : null]);
  return ok(rows.map(billerView));
});

export const listPayees = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.customer_id = $2 AND p.deleted_at IS NULL ORDER BY b.name, p.id`,
    [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map(payeeView));
});

export const addPayee = route({ auth: "customer", body: PayeeBody }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const b = ctx.body;
  return tx(async (db) => {
    const biller = await one<{ account_number_pattern: string; account_number_hint: string }>(db, "SELECT * FROM billers WHERE sandbox_id = $1 AND id = $2", [sb, b.billerId]);
    if (!biller) throw validation([{ field: "billerId", message: "does not match any biller" }]);
    const err = checkAccountNumber(biller.account_number_pattern, biller.account_number_hint, b.accountNumber);
    if (err) throw validation([err]);
    if (await one(db, "SELECT 1 FROM payees WHERE sandbox_id = $1 AND customer_id = $2 AND biller_id = $3 AND account_number = $4 AND deleted_at IS NULL",
      [sb, cid, b.billerId, b.accountNumber])) throw conflict("PAYEE_EXISTS", "You already have this payee.");
    const row = (await one<{ id: number }>(db,
      "INSERT INTO payees (sandbox_id, customer_id, biller_id, nickname, account_number, created_at) VALUES ($1, $2, $3, $4, $5, app_now($1)) RETURNING id",
      [sb, cid, b.billerId, b.nickname ?? null, b.accountNumber]))!;
    await audit(db, sb, ctx.user!.userId, "PAYEE_ADDED", "payee", row.id, null, { billerId: b.billerId, accountNumber: b.accountNumber });
    const p = (await one(db, `${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.id = $2`, [sb, row.id]))!;
    return created(payeeView(p), `/api/v1/payees/${row.id}`);
  });
});

export const updatePayee = route({ auth: "customer", body: PayeeUpdate }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const id = intParam(ctx.params.id);
  return tx(async (db) => {
    const p = await one<Record<string, string>>(db, `${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.id = $2 AND p.customer_id = $3 AND p.deleted_at IS NULL FOR UPDATE OF p`, [sb, id, cid]);
    if (!p) throw notFound("Payee");
    if (ctx.body.accountNumber !== undefined) {
      const err = checkAccountNumber(p.account_number_pattern, p.account_number_hint, ctx.body.accountNumber);
      if (err) throw validation([err]);
    }
    await db.query("UPDATE payees SET account_number = COALESCE($4, account_number), nickname = CASE WHEN $5 THEN $6 ELSE nickname END WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3",
      [sb, id, cid, ctx.body.accountNumber ?? null, ctx.body.nickname !== undefined, ctx.body.nickname || null]);
    return ok(payeeView((await one(db, `${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.id = $2`, [sb, id]))!));
  });
});

export const getPayee = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.id = $2 AND p.customer_id = $3 AND p.deleted_at IS NULL`,
    [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Payee");
  return ok(payeeView(rows[0]));
});

export const deletePayee = route({ auth: "customer" }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const id = intParam(ctx.params.id);
  await tx(async (db) => {
    const p = await one(db, "SELECT id FROM payees WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3 AND deleted_at IS NULL FOR UPDATE", [sb, id, cid]);
    if (!p) throw notFound("Payee");
    const open = await one(db, "SELECT 1 FROM bill_payments WHERE sandbox_id = $1 AND payee_id = $2 AND status IN ('SCHEDULED', 'PENDING') LIMIT 1", [sb, id]);
    if (open) throw conflict("PAYEE_HAS_SCHEDULED_PAYMENTS", "This payee has scheduled or pending payments. Cancel them first.");
    const used = await one(db, "SELECT 1 FROM bill_payments WHERE sandbox_id = $1 AND payee_id = $2 LIMIT 1", [sb, id]);
    if (used) await db.query("UPDATE payees SET deleted_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, id]);
    else await db.query("DELETE FROM payees WHERE sandbox_id = $1 AND id = $2", [sb, id]);
    await audit(db, sb, ctx.user!.userId, "PAYEE_DELETED", "payee", id, { id }, null);
  });
  return noContent();
});

// ---- bill payments ------------------------------------------------------------------------------

export const createPayment = route({ auth: "customer", body: PaymentBody, idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const b = ctx.body;
  return tx(async (db) => {
    const today = await todayOf(db, sb);
    const date = b.paymentDate ?? today;
    const errors: FieldError[] = [];
    if (!isValidIsoDate(date)) errors.push({ field: "paymentDate", message: "must be a real date" });
    else if (date < today) errors.push({ field: "paymentDate", message: "must be today or a future date" });
    else if (date > addDays(today, 366)) errors.push({ field: "paymentDate", message: "must be within 1 year" });
    if (b.recurrence !== "NONE" && date === today) errors.push({ field: "paymentDate", message: "recurring payments must start on a future date" });
    if (b.endDate !== undefined) {
      if (b.recurrence === "NONE") errors.push({ field: "endDate", message: "is only allowed for recurring payments" });
      else if (!isValidIsoDate(b.endDate)) errors.push({ field: "endDate", message: "must be a real date" });
      else if (b.endDate < date) errors.push({ field: "endDate", message: "must be on or after paymentDate" });
    }
    if (errors.length) throw validation(errors);

    const payee = await one<{ id: number; biller_name: string }>(db, `${PAYEE_SELECT} WHERE p.sandbox_id = $1 AND p.id = $2 AND p.customer_id = $3 AND p.deleted_at IS NULL`, [sb, b.payeeId, cid]);
    if (!payee) throw notFound("Payee");
    const from = await ownedAccount(db, sb, cid, b.fromAccountId, true);
    if (from.type === "LOAN") throw rule("INVALID_SOURCE", "Bills cannot be paid from a loan account.");
    if (from.status === "FROZEN") throw rule("ACCOUNT_FROZEN", "This account is frozen and cannot send money.");
    if (from.status !== "OPEN") throw rule("ACCOUNT_CLOSED", "This account is closed.");
    const amount = formatCents(b.amount);
    const payNow = date === today;
    const posting = payNow ? nextBusinessDay(today) : onOrNextBusinessDay(date);
    const ref = referenceId("BIL");
    let txId: number | null = null;
    if (payNow) {
      const available = toCents(String(from.available_balance)) + (from.type === "CREDIT" ? toCents(String(from.credit_limit)) : 0n);
      if (b.amount > available) throw rule("INSUFFICIENT_FUNDS", `Available balance is ${formatCents(available)}.`);
      txId = (await one<{ id: number }>(db, "SELECT hold_entry($1, $2, $3, 'BILL_PAYMENT', $4, $5) AS id", [sb, from.id, amount, `Bill payment - ${payee.biller_name}`, ref]))!.id;
    }
    const seriesId = b.recurrence === "NONE" ? null : referenceId("SER");
    const row = (await one<{ id: number }>(db,
      `INSERT INTO bill_payments (sandbox_id, customer_id, payee_id, from_account_id, amount, requested_date, posting_date, recurrence, series_id, occurrence,
         end_date, status, transaction_id, reference_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, app_now($1)) RETURNING id`,
      [sb, cid, payee.id, from.id, amount, date, posting, b.recurrence, seriesId, b.endDate ?? null, payNow ? "PENDING" : "SCHEDULED", txId,
        seriesId ? `${seriesId}-001` : ref]))!;
    if (seriesId) await topUpSeries(db, sb, seriesId);
    await audit(db, sb, u.userId, payNow ? "BILL_PAYMENT_CREATED" : "BILL_PAYMENT_SCHEDULED", "bill_payment", row.id, null,
      { amount, payeeId: payee.id, paymentDate: date, postingDate: posting, recurrence: b.recurrence });
    await notifyCustomer(db, sb, cid, "MONEY_MOVEMENT", payNow ? "Bill payment sent" : "Bill payment scheduled",
      `$${amount} to ${payee.biller_name} will post on ${posting}${holidayName(date) ? ` (${date} is ${holidayName(date)})` : ""}.`);
    const first = payView((await one(db, `${PAY_SELECT} WHERE bp.sandbox_id = $1 AND bp.id = $2`, [sb, row.id]))!);
    const upcoming = seriesId
      ? (await db.query(`${PAY_SELECT} WHERE bp.sandbox_id = $1 AND bp.series_id = $2 AND bp.id <> $3 ORDER BY bp.occurrence LIMIT $4`, [sb, seriesId, row.id, SERIES_WINDOW[b.recurrence]])).rows.map(payView)
      : [];
    return created({ ...first, upcoming }, `/api/v1/bill-payments/${row.id}`);
  }, { actorUserId: u.userId });
});

export const listPayments = route({ auth: "customer", query: PaymentsQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const { page: p, size, status, payeeId } = ctx.query;
  const where = "bp.sandbox_id = $1 AND bp.customer_id = $2 AND ($3::text IS NULL OR bp.status = $3) AND ($4::bigint IS NULL OR bp.payee_id = $4)";
  const params = [sb, cid, status ?? null, payeeId ?? null];
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM bill_payments bp WHERE ${where}`, params);
  const rows = await query(`${PAY_SELECT} WHERE ${where} ORDER BY bp.posting_date DESC, bp.id DESC LIMIT ${size} OFFSET ${p * size}`, params);
  return ok(pageResult(rows.map(payView), p, size, n));
});

export const getPayment = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${PAY_SELECT} WHERE bp.sandbox_id = $1 AND bp.id = $2 AND bp.customer_id = $3`, [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Bill payment");
  return ok(payView(rows[0]));
});

export const cancelPayment = route({ auth: "customer", query: CancelQuery }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const id = intParam(ctx.params.id);
  await tx(async (db) => {
    const bp = await one<{ id: number; status: string; transaction_id: number | null; series_id: string | null; requested_date: string; occurrence: number }>(db,
      "SELECT * FROM bill_payments WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3 FOR UPDATE", [sb, id, cid]);
    if (!bp) throw notFound("Bill payment");
    if (bp.status !== "SCHEDULED" && bp.status !== "PENDING") {
      throw conflict("INVALID_STATE", `Only a scheduled or pending payment can be cancelled. This one is ${bp.status.toLowerCase()}.`);
    }
    if (bp.status === "PENDING" && bp.transaction_id) await db.query("SELECT release_entry($1, $2)", [sb, bp.transaction_id]);
    await db.query("UPDATE bill_payments SET status = 'CANCELLED', cancelled_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, id]);
    if (ctx.query.scope === "series" && bp.series_id) {
      await db.query(`UPDATE bill_payments SET status = 'CANCELLED', cancelled_at = app_now($1)
        WHERE sandbox_id = $1 AND series_id = $2 AND occurrence > $3 AND status = 'SCHEDULED'`, [sb, bp.series_id, bp.occurrence]);
      await db.query("UPDATE bill_payments SET end_date = $3 WHERE sandbox_id = $1 AND series_id = $2", [sb, bp.series_id, addDays(bp.requested_date, -1)]);
    }
    await audit(db, sb, u.userId, "BILL_PAYMENT_CANCELLED", "bill_payment", id, { status: bp.status }, { status: "CANCELLED", scope: ctx.query.scope });
  }, { actorUserId: u.userId });
  return noContent();
});
