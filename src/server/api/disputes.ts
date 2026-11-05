/** Disputes on posted transactions, and in-app notifications. */
import { z, doc, page, PageQuery, DateTimeStr, Id, IdParam, registry } from "../openapi/registry";
import { route, ok, created } from "../http/handler";
import { query, tx, one } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { conflict, notFound, rule } from "../errors";
import { customerId, audit, notifyCustomer } from "../services/common";
import { isoOffset, torontoDate } from "@/lib/dates";
import { DateTime } from "luxon";
import { TransactionSchema, transactionView } from "./views";

export const DISPUTE_WINDOW_DAYS = 60;
const REASONS = ["UNAUTHORIZED", "DUPLICATE", "INCORRECT_AMOUNT", "NOT_RECEIVED", "CANCELLED_SERVICE", "OTHER"] as const;

const DisputeBody = z.object({
  transactionId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 20001 }),
  reason: z.enum(REASONS, { error: `must be one of ${REASONS.join(", ")}` }).openapi({ example: "DUPLICATE" }),
  description: z.string().trim().max(500, "must be at most 500 characters").optional().openapi({ example: "I was charged twice for the same order." }),
});
const DisputeSchema = registry.register("Dispute", z.object({
  id: Id, transactionId: Id, reason: z.enum(REASONS), description: z.string().nullable(), status: z.enum(["OPEN", "RESOLVED", "REJECTED"]),
  transaction: TransactionSchema, createdAt: DateTimeStr, resolvedAt: DateTimeStr.nullable(),
}));
const NotificationSchema = registry.register("Notification", z.object({
  id: Id, type: z.enum(["MONEY_MOVEMENT", "LOGIN", "SECURITY", "ACCOUNT", "LOAN", "DEPOSIT"]), title: z.string(), body: z.string(),
  createdAt: DateTimeStr, readAt: DateTimeStr.nullable(),
}));
const NotifQuery = PageQuery.extend({ unread: z.enum(["true", "false"]).optional().openapi({ description: "true = only unread" }) });

doc({ method: "post", path: "/disputes", tag: "Disputes", summary: "Dispute a posted transaction", auth: "bearer", body: DisputeBody,
  description: "Rules (422): only POSTED debits (NOT_DISPUTABLE); within 60 days of posting, counted in Toronto calendar days (DISPUTE_WINDOW_CLOSED). " +
    "One open dispute per transaction (409 DISPUTE_EXISTS). Another customer's transaction returns 404.",
  responses: { 201: { schema: DisputeSchema, description: "Opened", headers: { Location: "/api/v1/disputes/{id}" } } },
  errors: { 404: "Transaction not found.", 409: "This transaction already has an open dispute.", 422: "Transactions can only be disputed within 60 days of posting." } });
doc({ method: "get", path: "/disputes", tag: "Disputes", summary: "List my disputes", auth: "bearer", query: PageQuery, responses: { 200: { schema: page(DisputeSchema), description: "Disputes" } } });
doc({ method: "get", path: "/disputes/{id}", tag: "Disputes", summary: "Get a dispute", auth: "bearer", params: IdParam,
  responses: { 200: { schema: DisputeSchema, description: "Dispute" } }, errors: { 404: "Dispute not found." } });
doc({ method: "get", path: "/notifications", tag: "Notifications", summary: "List my notifications (newest first)", auth: "bearer", query: NotifQuery,
  description: "Created on every money movement, every sign-in and every security change. The response adds unreadCount.",
  responses: { 200: { schema: page(NotificationSchema).extend({ unreadCount: z.number().int() }), description: "Notifications" } } });
doc({ method: "post", path: "/notifications/{id}/read", tag: "Notifications", summary: "Mark a notification as read", auth: "bearer", params: IdParam,
  responses: { 200: { schema: NotificationSchema, description: "Marked read (idempotent)" } }, errors: { 404: "Notification not found." } });

const SELECT = `SELECT d.*, row_to_json(t.*) AS tx FROM disputes d JOIN transactions t ON t.sandbox_id = d.sandbox_id AND t.id = d.transaction_id`;
function view(d: Record<string, unknown>) {
  const t = d.tx as Record<string, unknown>;
  t.created_at = new Date(String(t.created_at));
  t.posted_at = t.posted_at ? new Date(String(t.posted_at)) : null;
  return {
    id: Number(d.id), transactionId: Number(d.transaction_id), reason: String(d.reason), description: (d.description as string | null) ?? null,
    status: String(d.status), transaction: transactionView(t), createdAt: isoOffset(d.created_at as Date)!, resolvedAt: isoOffset(d.resolved_at as Date | null),
  };
}

export const openDispute = route({ auth: "customer", body: DisputeBody }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  return tx(async (db) => {
    const t = await one<{ id: number; status: string; direction: string; posted_at: Date | null; now: Date }>(db,
      `SELECT t.id, t.status, t.direction, t.posted_at, app_now($1) AS now FROM transactions t
         JOIN accounts a ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id WHERE t.sandbox_id = $1 AND t.id = $2 AND a.customer_id = $3`,
      [sb, ctx.body.transactionId, cid]);
    if (!t) throw notFound("Transaction");
    if (t.status !== "POSTED" || !t.posted_at) throw rule("NOT_DISPUTABLE", "Only posted transactions can be disputed.");
    if (t.direction !== "DEBIT") throw rule("NOT_DISPUTABLE", "Only money that left your account can be disputed.");
    const days = DateTime.fromISO(torontoDate(t.now)).diff(DateTime.fromISO(torontoDate(t.posted_at)), "days").days;
    if (days > DISPUTE_WINDOW_DAYS) throw rule("DISPUTE_WINDOW_CLOSED", `Transactions can only be disputed within ${DISPUTE_WINDOW_DAYS} days of posting. This one posted ${Math.round(days)} days ago.`);
    if (await one(db, "SELECT 1 FROM disputes WHERE sandbox_id = $1 AND transaction_id = $2 AND status = 'OPEN'", [sb, t.id])) {
      throw conflict("DISPUTE_EXISTS", "This transaction already has an open dispute.");
    }
    const row = (await one<{ id: number }>(db,
      "INSERT INTO disputes (sandbox_id, customer_id, transaction_id, reason, description, status, created_at) VALUES ($1, $2, $3, $4, $5, 'OPEN', app_now($1)) RETURNING id",
      [sb, cid, t.id, ctx.body.reason, ctx.body.description || null]))!;
    await audit(db, sb, u.userId, "DISPUTE_OPENED", "dispute", row.id, null, { transactionId: t.id, reason: ctx.body.reason });
    await notifyCustomer(db, sb, cid, "ACCOUNT", "Dispute opened", `We opened dispute #${row.id}. We will review it within 10 business days.`);
    return created(view((await one(db, `${SELECT} WHERE d.sandbox_id = $1 AND d.id = $2`, [sb, row.id]))!), `/api/v1/disputes/${row.id}`);
  }, { actorUserId: u.userId });
});

export const listDisputes = route({ auth: "customer", query: PageQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const { page: p, size } = ctx.query;
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM disputes WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]);
  const rows = await query(`${SELECT} WHERE d.sandbox_id = $1 AND d.customer_id = $2 ORDER BY d.created_at DESC, d.id DESC LIMIT $3 OFFSET $4`, [sb, cid, size, p * size]);
  return ok(pageResult(rows.map(view), p, size, n));
});

export const getDispute = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(`${SELECT} WHERE d.sandbox_id = $1 AND d.id = $2 AND d.customer_id = $3`, [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Dispute");
  return ok(view(rows[0]));
});

const notifView = (n: Record<string, unknown>) => ({
  id: Number(n.id), type: String(n.type), title: String(n.title), body: String(n.body), createdAt: isoOffset(n.created_at as Date)!, readAt: isoOffset(n.read_at as Date | null),
});

export const listNotifications = route({ auth: "user", query: NotifQuery }, async (ctx) => {
  const u = ctx.user!;
  const { page: p, size, unread } = ctx.query;
  const where = `sandbox_id = $1 AND user_id = $2${unread === "true" ? " AND read_at IS NULL" : ""}`;
  const [{ n, unreadCount }] = await query<{ n: number; unreadCount: number }>(
    `SELECT count(*)::int AS n, (SELECT count(*)::int FROM notifications WHERE sandbox_id = $1 AND user_id = $2 AND read_at IS NULL) AS "unreadCount"
       FROM notifications WHERE ${where}`, [u.sandboxId, u.userId]);
  const rows = await query(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, [u.sandboxId, u.userId, size, p * size]);
  return ok({ ...pageResult(rows.map(notifView), p, size, n), unreadCount });
});

export const markRead = route({ auth: "user" }, async (ctx) => {
  const u = ctx.user!;
  const rows = await query("UPDATE notifications SET read_at = COALESCE(read_at, app_now($1)) WHERE sandbox_id = $1 AND id = $2 AND user_id = $3 RETURNING *",
    [u.sandboxId, intParam(ctx.params.id), u.userId]);
  if (!rows[0]) throw notFound("Notification");
  return ok(notifView(rows[0]));
});
