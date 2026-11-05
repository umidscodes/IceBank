/** Mobile cheque deposit: front + back image and an amount. First $100 available now, the rest after an admin approves. */
import { z, doc, page, PageQuery, Money, DateTimeStr, Id, IdParam, registry } from "../openapi/registry";
import { route, ok, created } from "../http/handler";
import { query, tx, one, type Db } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { conflict, notFound, rule, validation, type FieldError } from "../errors";
import { customerId, audit, notifyCustomer } from "../services/common";
import { parseAmount, formatCents, formatDisplay, money, toCents, minCents } from "@/lib/money";
import { referenceId } from "@/lib/crypto";
import { isoOffset, torontoDate, startOfDay } from "@/lib/dates";
import { ownedAccount } from "./accounts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DAILY_DEPOSIT_MAX = 500000n;
export const IMMEDIATE_MAX = 10000n;

export const DepositSchema = registry.register("ChequeDeposit", z.object({
  id: Id, accountId: Id, amount: Money,
  immediateAmount: Money.openapi({ description: "Available right away: the first $100.00" }),
  heldAmount: Money.openapi({ description: "On hold until an admin approves" }),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]), rejectReason: z.string().nullable(),
  frontImage: z.object({ contentType: z.string(), bytes: z.number().int() }), backImage: z.object({ contentType: z.string(), bytes: z.number().int() }),
  transactionId: Id.nullable(), referenceId: z.string(), createdAt: DateTimeStr, decidedAt: DateTimeStr.nullable(),
}));

const UploadForm = z.object({
  accountId: z.string().openapi({ example: "1" }),
  amount: z.string().openapi({ example: "250.00" }),
  frontImage: z.string().openapi({ type: "string", format: "binary", description: "JPG or PNG, max 5 MB" }),
  backImage: z.string().openapi({ type: "string", format: "binary", description: "JPG or PNG, max 5 MB" }),
});

doc({
  method: "post", path: "/deposits/cheque", tag: "Deposits", summary: "Deposit a cheque (multipart/form-data)", auth: "bearer", idempotent: true,
  description: "Form fields: accountId, amount, frontImage, backImage. Images must be JPG or PNG (checked by content, not just the name), max 5 MB each. " +
    "Daily limit $5,000.00 across deposits made today (422 DAILY_DEPOSIT_LIMIT). The first $100.00 is available immediately; the rest is held " +
    "until an admin approves. Only chequing and savings accounts can receive deposits.",
  multipart: UploadForm,
  responses: { 201: { schema: DepositSchema, description: "Deposit received", headers: { Location: "/api/v1/deposits/{id}" } } },
  errors: { 400: "One or more fields are invalid.", 404: "Account not found.", 413: "The request is larger than 11 MB.", 415: "Send this request as multipart/form-data.", 422: "This deposit would exceed your daily cheque deposit limit of $5,000.00." },
});
doc({ method: "get", path: "/deposits", tag: "Deposits", summary: "List my cheque deposits", auth: "bearer", query: PageQuery,
  responses: { 200: { schema: page(DepositSchema), description: "Deposits (newest first)" } } });
doc({ method: "get", path: "/deposits/{id}", tag: "Deposits", summary: "Get a cheque deposit", auth: "bearer", params: IdParam,
  responses: { 200: { schema: DepositSchema, description: "Deposit" } }, errors: { 404: "Deposit not found." } });

export const SELECT = `SELECT d.id, d.customer_id, d.account_id, d.amount, d.immediate_amount, d.held_amount, d.status, d.reject_reason, d.front_mime,
  d.back_mime, octet_length(d.front_image) AS front_bytes, octet_length(d.back_image) AS back_bytes, d.transaction_id, d.reference_id,
  d.created_at, d.decided_at, d.decided_by FROM cheque_deposits d`;

export function depositView(d: Record<string, unknown>) {
  return {
    id: Number(d.id), accountId: Number(d.account_id), amount: money(String(d.amount)), immediateAmount: money(String(d.immediate_amount)),
    heldAmount: money(String(d.held_amount)), status: String(d.status), rejectReason: (d.reject_reason as string | null) ?? null,
    frontImage: { contentType: String(d.front_mime), bytes: Number(d.front_bytes) }, backImage: { contentType: String(d.back_mime), bytes: Number(d.back_bytes) },
    transactionId: d.transaction_id === null ? null : Number(d.transaction_id), referenceId: String(d.reference_id),
    createdAt: isoOffset(d.created_at as Date)!, decidedAt: isoOffset(d.decided_at as Date | null),
  };
}

/** Detect JPG/PNG from the first bytes, so a renamed .txt is rejected. */
function sniff(buf: Uint8Array): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  return null;
}

async function readImage(form: FormData, field: string, errors: FieldError[]) {
  const v = form.get(field);
  if (v === null || typeof v === "string") { errors.push({ field, message: "is required (attach a JPG or PNG file)" }); return null; }
  const buf = new Uint8Array(await v.arrayBuffer());
  if (buf.byteLength === 0) { errors.push({ field, message: "is empty" }); return null; }
  if (buf.byteLength > MAX_IMAGE_BYTES) { errors.push({ field, message: "must be 5 MB or smaller" }); return null; }
  const type = sniff(buf);
  if (!type) { errors.push({ field, message: "must be a JPG or PNG image" }); return null; }
  return { buf, type };
}

export const uploadCheque = route({ auth: "customer", multipart: true, idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const form = ctx.form!;
  const errors: FieldError[] = [];
  const accountRaw = form.get("accountId");
  const amountRaw = form.get("amount");
  const accountId = typeof accountRaw === "string" && /^\d{1,15}$/.test(accountRaw.trim()) ? Number(accountRaw.trim()) : null;
  if (accountId === null) errors.push({ field: "accountId", message: accountRaw === null ? "is required" : "must be a whole number" });
  let cents: bigint | null = null;
  if (typeof amountRaw !== "string" || amountRaw.trim() === "") errors.push({ field: "amount", message: "is required" });
  else if (/^\d+\.\d{3,}$/.test(amountRaw.trim())) errors.push({ field: "amount", message: "must have at most 2 decimal places" });
  else {
    cents = parseAmount(amountRaw);
    if (cents === null) errors.push({ field: "amount", message: "must be a decimal amount such as \"250.00\"" });
    else if (cents < 1n) errors.push({ field: "amount", message: "must be at least 0.01" });
  }
  const front = await readImage(form, "frontImage", errors);
  const back = await readImage(form, "backImage", errors);
  if (errors.length) throw validation(errors);

  return tx(async (db) => {
    const acct = await ownedAccount(db, sb, cid, accountId!, true);
    if (acct.type !== "CHEQUING" && acct.type !== "SAVINGS") throw rule("INVALID_TARGET", "Cheques can only be deposited into a chequing or savings account.");
    if (acct.status !== "OPEN") throw rule("ACCOUNT_FROZEN", "This account cannot receive deposits right now.");
    const now = (await one<{ now: Date }>(db, "SELECT app_now($1) AS now", [sb]))!.now;
    const used = toCents((await one<{ s: string }>(db,
      `SELECT COALESCE(sum(amount), 0) AS s FROM cheque_deposits WHERE sandbox_id = $1 AND customer_id = $2 AND status <> 'REJECTED' AND created_at >= $3`,
      [sb, cid, startOfDay(torontoDate(now))]))!.s);
    if (used + cents! > DAILY_DEPOSIT_MAX) {
      throw rule("DAILY_DEPOSIT_LIMIT", `This deposit would exceed your daily cheque deposit limit of $5,000.00. Remaining today: ${formatDisplay(DAILY_DEPOSIT_MAX - used)}.`,
        { remaining: formatCents(DAILY_DEPOSIT_MAX - used) });
    }
    const amount = formatCents(cents!);
    const immediate = minCents(cents!, IMMEDIATE_MAX);
    const held = cents! - immediate;
    const ref = referenceId("CHQ");
    const txId = (await one<{ id: number }>(db, "SELECT post_entry($1, $2, 'CREDIT', $3, 'CHEQUE_DEPOSIT', 'Mobile cheque deposit', $4) AS id", [sb, acct.id, amount, ref]))!.id;
    if (held > 0n) await db.query("UPDATE accounts SET available_balance = available_balance - $3 WHERE sandbox_id = $1 AND id = $2", [sb, acct.id, formatCents(held)]);
    const row = (await one<{ id: number }>(db,
      `INSERT INTO cheque_deposits (sandbox_id, customer_id, account_id, amount, immediate_amount, held_amount, front_image, front_mime, back_image, back_mime,
         status, transaction_id, reference_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11, $12, app_now($1)) RETURNING id`,
      [sb, cid, acct.id, amount, formatCents(immediate), formatCents(held), Buffer.from(front!.buf), front!.type, Buffer.from(back!.buf), back!.type, txId, ref]))!;
    await audit(db, sb, u.userId, "CHEQUE_DEPOSIT_SUBMITTED", "cheque_deposit", row.id, null, { amount, status: "PENDING" });
    await notifyCustomer(db, sb, cid, "DEPOSIT", "Cheque received",
      held > 0n ? `We received your $${amount} cheque. $${formatCents(immediate)} is available now; the rest is on hold until it is reviewed.`
        : `We received your $${amount} cheque. It is available now.`);
    const d = (await one(db, `${SELECT} WHERE d.sandbox_id = $1 AND d.id = $2`, [sb, row.id]))!;
    return created(depositView(d), `/api/v1/deposits/${row.id}`);
  }, { actorUserId: u.userId });
});

export const listDeposits = route({ auth: "customer", query: PageQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const { page: p, size } = ctx.query;
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM cheque_deposits WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]);
  const rows = await query(`${SELECT} WHERE d.sandbox_id = $1 AND d.customer_id = $2 ORDER BY d.created_at DESC, d.id DESC LIMIT $3 OFFSET $4`, [sb, cid, size, p * size]);
  return ok(pageResult(rows.map(depositView), p, size, n));
});

export const getDeposit = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${SELECT} WHERE d.sandbox_id = $1 AND d.id = $2 AND d.customer_id = $3`, [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Deposit");
  return ok(depositView(rows[0]));
});

/** Admin decision. Approve releases the hold; reject reverses the whole deposit. */
export async function decideDeposit(db: Db, sb: number, id: number, actor: number, approve: boolean, reason: string | null) {
  const d = await one<{ id: number; customer_id: number; account_id: number; amount: string; held_amount: string; status: string; reference_id: string }>(db,
    "SELECT id, customer_id, account_id, amount, held_amount, status, reference_id FROM cheque_deposits WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, id]);
  if (!d) throw notFound("Deposit");
  if (d.status !== "PENDING") {
    throw conflict("INVALID_STATE", `This deposit was already ${d.status.toLowerCase()}.`);
  }
  if (approve) {
    await db.query("UPDATE accounts SET available_balance = available_balance + $3 WHERE sandbox_id = $1 AND id = $2", [sb, d.account_id, d.held_amount]);
    await db.query("UPDATE cheque_deposits SET status = 'APPROVED', decided_by = $3, decided_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, id, actor]);
    await notifyCustomer(db, sb, d.customer_id, "DEPOSIT", "Cheque approved", `Your $${money(d.amount)} cheque was approved. The full amount is now available.`);
  } else {
    await db.query("SELECT post_entry($1, $2, 'DEBIT', $3, 'REVERSAL', 'Cheque deposit returned', $4)", [sb, d.account_id, d.amount, d.reference_id]);
    await db.query("UPDATE accounts SET available_balance = available_balance + $3 WHERE sandbox_id = $1 AND id = $2", [sb, d.account_id, d.held_amount]);
    await db.query("UPDATE cheque_deposits SET status = 'REJECTED', reject_reason = $4, decided_by = $3, decided_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, id, actor, reason]);
    await notifyCustomer(db, sb, d.customer_id, "DEPOSIT", "Cheque returned", `Your $${money(d.amount)} cheque was rejected: ${reason}. The deposit was reversed.`);
  }
  await audit(db, sb, actor, approve ? "CHEQUE_DEPOSIT_APPROVED" : "CHEQUE_DEPOSIT_REJECTED", "cheque_deposit", id, { status: "PENDING" },
    { status: approve ? "APPROVED" : "REJECTED", reason });
}
