/** Transfers between my own accounts. Instant, atomic (post_transfer), idempotent. */
import { z, doc, page, PageQuery, Money, DateTimeStr, Id, IdParam, moneyInput, registry } from "../openapi/registry";
import { route, ok, created } from "../http/handler";
import { query, tx, one } from "../db/pool";
import { intParam, pageResult, parseSort } from "../http/params";
import { notFound } from "../errors";
import { customerId, notifyCustomer } from "../services/common";
import { formatCents, money } from "@/lib/money";
import { referenceId } from "@/lib/crypto";
import { isoOffset } from "@/lib/dates";
import { ownedAccount } from "./accounts";

const TransferBody = z.object({
  fromAccountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  toAccountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 2 }),
  amount: moneyInput({ min: 1n, max: 99999999n, example: "250.00", description: "$0.01 to $999,999.99, at most 2 decimals" }),
  memo: z.string().trim().max(100, "must be at most 100 characters").optional().openapi({ example: "Rent savings" }),
});

const TransferSchema = registry.register("Transfer", z.object({
  id: Id, fromAccountId: Id, toAccountId: Id, amount: Money, memo: z.string().nullable(),
  status: z.literal("COMPLETED"), referenceId: z.string().openapi({ example: "TRF-1A2B3C4D5E6F" }),
  debitTransactionId: Id.nullable(), creditTransactionId: Id.nullable(), createdAt: DateTimeStr,
}));

doc({
  method: "post", path: "/transfers", tag: "Transfers", summary: "Transfer between my own accounts", auth: "bearer", idempotent: true,
  description: "Instant. $0.01 to $999,999.99 with at most 2 decimals (more decimals are rejected, never rounded). " +
    "Rules (422): INSUFFICIENT_FUNDS (amount > available balance; a credit card can use its available credit), SAME_ACCOUNT, ACCOUNT_FROZEN, " +
    "INVALID_SOURCE (loan accounts cannot send money), OVERPAYMENT (more than a loan owes). Accounts you do not own return 404.",
  body: TransferBody, bodyExample: { fromAccountId: 1, toAccountId: 2, amount: "250.00", memo: "Rent savings" },
  responses: { 201: { schema: TransferSchema, description: "Transfer completed", headers: { Location: "/api/v1/transfers/{id}" } } },
  errors: { 404: "Account not found.", 409: "This Idempotency-Key was already used with a different request.", 422: "Insufficient funds: available balance is 120.00." },
});
doc({ method: "get", path: "/transfers", tag: "Transfers", summary: "List my transfers (newest first)", auth: "bearer",
  query: PageQuery, responses: { 200: { schema: page(TransferSchema), description: "Transfers" } } });
doc({ method: "get", path: "/transfers/{id}", tag: "Transfers", summary: "Get a transfer", auth: "bearer", params: IdParam,
  responses: { 200: { schema: TransferSchema, description: "Transfer" } }, errors: { 404: "Transfer not found." } });

const SELECT = `SELECT tr.*,
  (SELECT id FROM transactions t WHERE t.sandbox_id = tr.sandbox_id AND t.reference_id = tr.reference_id AND t.direction = 'DEBIT' LIMIT 1) AS debit_id,
  (SELECT id FROM transactions t WHERE t.sandbox_id = tr.sandbox_id AND t.reference_id = tr.reference_id AND t.direction = 'CREDIT' LIMIT 1) AS credit_id
  FROM transfers tr`;

function view(r: Record<string, unknown>) {
  return {
    id: Number(r.id), fromAccountId: Number(r.from_account_id), toAccountId: Number(r.to_account_id), amount: money(String(r.amount)),
    memo: (r.memo as string | null) ?? null, status: "COMPLETED" as const, referenceId: String(r.reference_id),
    debitTransactionId: r.debit_id === null ? null : Number(r.debit_id), creditTransactionId: r.credit_id === null ? null : Number(r.credit_id),
    createdAt: isoOffset(r.created_at as Date)!,
  };
}

export const createTransfer = route({ auth: "customer", body: TransferBody, idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const b = ctx.body;
  return tx(async (db) => {
    await ownedAccount(db, sb, cid, b.fromAccountId);
    await ownedAccount(db, sb, cid, b.toAccountId);
    const ref = referenceId("TRF");
    const amount = formatCents(b.amount);
    await db.query("SELECT post_transfer($1, $2, $3::numeric, $4, $5)", [b.fromAccountId, b.toAccountId, amount, ref, sb]);
    const t = (await one<{ id: number }>(db,
      `INSERT INTO transfers (sandbox_id, customer_id, from_account_id, to_account_id, amount, memo, status, reference_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, app_now($1)) RETURNING id`,
      [sb, cid, b.fromAccountId, b.toAccountId, amount, b.memo || null, ref]))!;
    await notifyCustomer(db, sb, cid, "MONEY_MOVEMENT", "Transfer completed", `You moved $${amount} between your accounts.`);
    const row = (await one(db, `${SELECT} WHERE tr.sandbox_id = $1 AND tr.id = $2`, [sb, t.id]))!;
    return created(view(row), `/api/v1/transfers/${t.id}`);
  }, { actorUserId: u.userId });
});

export const listTransfers = route({ auth: "customer", query: PageQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const { page: p, size, sort } = ctx.query;
  const order = parseSort(sort, { createdAt: "tr.created_at", amount: "tr.amount" }, "tr.created_at DESC");
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM transfers WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]);
  const rows = await query(`${SELECT} WHERE tr.sandbox_id = $1 AND tr.customer_id = $2 ORDER BY ${order}, tr.id DESC LIMIT $3 OFFSET $4`, [sb, cid, size, p * size]);
  return ok(pageResult(rows.map(view), p, size, n));
});

export const getTransfer = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${SELECT} WHERE tr.sandbox_id = $1 AND tr.id = $2 AND tr.customer_id = $3`,
    [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Transfer");
  return ok(view(rows[0]));
});
