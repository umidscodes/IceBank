/** Admin (teller) portal API. ADMIN role only; every action is audited. */
import { z, doc, page, PageQuery, DateStr, DateTimeStr, Id, IdParam } from "../openapi/registry";
import { route, ok } from "../http/handler";
import { query, tx, one } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { conflict, notFound, validation } from "../errors";
import { audit, notifyCustomer, notify } from "../services/common";
import { isoOffset, isValidIsoDate, startOfDay, endOfDay } from "@/lib/dates";
import { AccountSchema, accountView } from "./views";
import { DepositSchema, depositView, decideDeposit, SELECT as DEPOSIT_SELECT } from "./deposits";
import { appView, fundLoan } from "./loans";
import { maskLast4 } from "@/lib/accounts";

const CustomerSummary = z.object({
  id: Id, userId: Id, firstName: z.string(), lastName: z.string(), email: z.string(), phone: z.string(), city: z.string(), province: z.string(),
  userStatus: z.enum(["ACTIVE", "LOCKED", "DISABLED"]), accountCount: z.number().int(), createdAt: DateTimeStr,
});
const CustomerDetail = CustomerSummary.extend({
  dateOfBirth: DateStr, address: z.object({ line1: z.string(), line2: z.string().nullable(), city: z.string(), province: z.string(), postalCode: z.string() }),
  sinLast3: z.string(), failedLoginCount: z.number().int(), lockedUntil: DateTimeStr.nullable(), lastLoginAt: DateTimeStr.nullable(),
  accounts: z.array(AccountSchema),
  cards: z.array(z.object({ id: Id, type: z.string(), maskedNumber: z.string(), status: z.string(), accountId: Id })),
});
const ReasonBody = z.object({ reason: z.string({ error: "is required" }).trim().min(3, "must be 3 to 200 characters").max(200, "must be 3 to 200 characters").openapi({ example: "Suspicious activity review" }) });
const DecisionBody = z.object({
  decision: z.enum(["APPROVED", "DECLINED"], { error: "must be APPROVED or DECLINED" }),
  reason: z.string().trim().min(3, "must be 3 to 200 characters").max(200).openapi({ example: "Verified employment letter" }),
});
const AuditEntry = z.object({
  id: Id, actorUserId: Id.nullable(), actorEmail: z.string().nullable(), action: z.string().openapi({ example: "TRANSFER_POSTED" }),
  entityType: z.string(), entityId: Id.nullable(), oldValue: z.unknown().nullable(), newValue: z.unknown().nullable(), createdAt: DateTimeStr,
});
const AuditQuery = PageQuery.extend({
  action: z.string().optional(), entityType: z.string().optional(), entityId: z.coerce.number().int().optional(), actorUserId: z.coerce.number().int().optional(),
  from: DateStr.optional(), to: DateStr.optional(),
});
const StatusQuery = (values: readonly [string, ...string[]]) => PageQuery.extend({ status: z.enum(values).optional() });

const tag = "Admin";
doc({ method: "get", path: "/admin/customers", tag, summary: "Search customers", auth: "admin",
  description: "q matches first or last name, email, phone or an account number (case-insensitive, partial).",
  query: PageQuery.extend({ q: z.string().optional().openapi({ example: "tremblay" }) }), responses: { 200: { schema: page(CustomerSummary), description: "Customers" } } });
doc({ method: "get", path: "/admin/customers/{id}", tag, summary: "Customer detail with accounts and cards", auth: "admin", params: IdParam,
  responses: { 200: { schema: CustomerDetail, description: "Customer" } }, errors: { 404: "Customer not found." } });
doc({ method: "post", path: "/admin/accounts/{id}/freeze", tag, summary: "Freeze an account", auth: "admin", params: IdParam, body: ReasonBody,
  description: "A frozen account cannot send or receive transfers, e-Transfers, bill payments or deposits.",
  responses: { 200: { schema: AccountSchema, description: "Frozen" } }, errors: { 404: "Account not found.", 409: "This account is already frozen." } });
doc({ method: "post", path: "/admin/accounts/{id}/unfreeze", tag, summary: "Unfreeze an account", auth: "admin", params: IdParam,
  responses: { 200: { schema: AccountSchema, description: "Open again" } }, errors: { 404: "Account not found.", 409: "This account is not frozen." } });
doc({ method: "post", path: "/admin/users/{id}/unlock", tag, summary: "Unlock a locked user", auth: "admin", params: IdParam,
  description: "Sets status ACTIVE and failedLoginCount 0.", responses: { 200: { schema: z.object({ userId: Id, status: z.literal("ACTIVE"), failedLoginCount: z.literal(0) }), description: "Unlocked" } },
  errors: { 404: "User not found.", 409: "This user is not locked." } });
doc({ method: "get", path: "/admin/deposits", tag, summary: "List cheque deposits", auth: "admin", query: StatusQuery(["PENDING", "APPROVED", "REJECTED"]),
  responses: { 200: { schema: page(DepositSchema.extend({ customerId: Id, customerName: z.string() })), description: "Deposits (oldest pending first)" } } });
doc({ method: "get", path: "/admin/deposits/{id}/images/{side}", tag, summary: "View a cheque image", auth: "admin",
  params: z.object({ id: z.string(), side: z.enum(["front", "back"]) }), responses: { 200: { schema: z.string().openapi({ format: "binary" }), contentType: "image/png", description: "Image" } },
  errors: { 404: "Deposit not found." } });
doc({ method: "post", path: "/admin/deposits/{id}/approve", tag, summary: "Approve a cheque deposit (releases the hold)", auth: "admin", params: IdParam,
  responses: { 200: { schema: DepositSchema, description: "Approved" } }, errors: { 404: "Deposit not found.", 409: "This deposit was already approved." } });
doc({ method: "post", path: "/admin/deposits/{id}/reject", tag, summary: "Reject a cheque deposit (reverses it)", auth: "admin", params: IdParam, body: ReasonBody,
  description: "Posts a REVERSAL for the full amount. Fails with 422 INSUFFICIENT_FUNDS if the customer already spent the money.",
  responses: { 200: { schema: DepositSchema, description: "Rejected" } }, errors: { 404: "Deposit not found.", 409: "This deposit was already rejected.", 422: "Insufficient funds." } });
doc({ method: "get", path: "/admin/loans", tag, summary: "List loan applications", auth: "admin", query: StatusQuery(["APPROVED", "MANUAL_REVIEW", "DECLINED"]),
  responses: { 200: { schema: page(z.object({ id: Id, customerId: Id, customerName: z.string() }).passthrough()), description: "Applications" } } });
doc({ method: "post", path: "/admin/loans/{id}/decision", tag, summary: "Decide a loan application in manual review", auth: "admin", params: IdParam, body: DecisionBody,
  description: "Only MANUAL_REVIEW applications (409 otherwise). APPROVED creates the loan and deposits the money.",
  responses: { 200: { schema: z.object({ id: Id, status: z.string() }).passthrough(), description: "Decided" } },
  errors: { 404: "Loan application not found.", 409: "Only applications in manual review can be decided." } });
doc({ method: "get", path: "/admin/audit-log", tag, summary: "Read the audit log (newest first)", auth: "admin", query: AuditQuery,
  responses: { 200: { schema: page(AuditEntry), description: "Entries" } } });

export const searchCustomers = route({ auth: "admin", query: PageQuery.extend({ q: z.string().max(100).optional() }) }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const { page: p, size } = ctx.query;
  const q = ctx.query.q?.trim() || null;
  const where = `c.sandbox_id = $1 AND ($2::text IS NULL OR c.first_name ILIKE '%'||$2||'%' OR c.last_name ILIKE '%'||$2||'%' OR (c.first_name || ' ' || c.last_name) ILIKE '%'||$2||'%'
    OR u.email ILIKE '%'||$2||'%' OR c.phone LIKE '%'||$2||'%' OR EXISTS (SELECT 1 FROM accounts a WHERE a.sandbox_id = c.sandbox_id AND a.customer_id = c.id AND a.account_number LIKE '%'||$2||'%'))`;
  const params = [sb, q ? q.replace(/[\\%_]/g, (ch) => "\\" + ch) : null];
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM customers c JOIN users u ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id WHERE ${where}`, params);
  const rows = await query(`SELECT c.*, u.email, u.status AS user_status,
      (SELECT count(*)::int FROM accounts a WHERE a.sandbox_id = c.sandbox_id AND a.customer_id = c.id) AS account_count
      FROM customers c JOIN users u ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id WHERE ${where} ORDER BY c.last_name, c.first_name, c.id LIMIT ${size} OFFSET ${p * size}`, params);
  return ok(pageResult(rows.map((c) => ({
    id: Number(c.id), userId: Number(c.user_id), firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, city: c.city,
    province: c.province, userStatus: c.user_status, accountCount: c.account_count, createdAt: isoOffset(c.created_at)!,
  })), p, size, n));
});

export const getCustomer = route({ auth: "admin" }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const id = intParam(ctx.params.id);
  const [c] = await query(`SELECT c.*, u.email, u.status AS user_status, u.failed_login_count, u.locked_until, u.last_login_at FROM customers c
     JOIN users u ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id WHERE c.sandbox_id = $1 AND c.id = $2`, [sb, id]);
  if (!c) throw notFound("Customer");
  const accounts = await query("SELECT * FROM accounts WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY id", [sb, id]);
  const cards = await query("SELECT * FROM cards WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY id", [sb, id]);
  return ok({
    id: Number(c.id), userId: Number(c.user_id), firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, city: c.city, province: c.province,
    userStatus: c.user_status, accountCount: accounts.length, createdAt: isoOffset(c.created_at)!, dateOfBirth: c.date_of_birth,
    address: { line1: c.address_line1, line2: c.address_line2 ?? null, city: c.city, province: c.province, postalCode: c.postal_code },
    sinLast3: c.sin_last3, failedLoginCount: c.failed_login_count, lockedUntil: isoOffset(c.locked_until), lastLoginAt: isoOffset(c.last_login_at),
    accounts: accounts.map(accountView),
    cards: cards.map((k) => ({ id: Number(k.id), type: k.type, maskedNumber: maskLast4(k.last4), status: k.status, accountId: Number(k.account_id) })),
  });
});

function freezeRoute(freeze: boolean) {
  return route({ auth: "admin", ...(freeze ? { body: ReasonBody } : {}) }, async (ctx) => {
    const u = ctx.user!;
    const sb = u.sandboxId;
    const id = intParam(ctx.params.id);
    return tx(async (db) => {
      const a = await one<Record<string, unknown>>(db, "SELECT * FROM accounts WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, id]);
      if (!a) throw notFound("Account");
      if (freeze && a.status !== "OPEN") throw conflict("INVALID_STATE", a.status === "FROZEN" ? "This account is already frozen." : "This account is closed.");
      if (!freeze && a.status !== "FROZEN") throw conflict("INVALID_STATE", "This account is not frozen.");
      const reason = freeze ? (ctx.body as { reason: string }).reason : null;
      const row = (await one(db, "UPDATE accounts SET status = $3 WHERE sandbox_id = $1 AND id = $2 RETURNING *", [sb, id, freeze ? "FROZEN" : "OPEN"]))!;
      await audit(db, sb, u.userId, freeze ? "ACCOUNT_FROZEN" : "ACCOUNT_UNFROZEN", "account", id, { status: a.status }, { status: row.status, reason });
      await notifyCustomer(db, sb, Number(a.customer_id), "ACCOUNT", freeze ? "Account frozen" : "Account unfrozen",
        freeze ? `Your account ending ${String(a.account_number).slice(-4)} has been frozen. Please contact Ice Bank.` : `Your account ending ${String(a.account_number).slice(-4)} is open again.`);
      return ok(accountView(row));
    }, { actorUserId: u.userId });
  });
}
export const freezeAccount = freezeRoute(true);
export const unfreezeAccount = freezeRoute(false);

export const unlockUser = route({ auth: "admin" }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const id = intParam(ctx.params.id);
  return tx(async (db) => {
    const t = await one<{ status: string; failed_login_count: number }>(db, "SELECT status, failed_login_count FROM users WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, id]);
    if (!t) throw notFound("User");
    if (t.status !== "LOCKED") throw conflict("INVALID_STATE", "This user is not locked.");
    await db.query("UPDATE users SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, id]);
    await audit(db, sb, u.userId, "USER_UNLOCKED", "user", id, { status: "LOCKED", failedLoginCount: t.failed_login_count }, { status: "ACTIVE", failedLoginCount: 0 });
    await notify(db, sb, id, "SECURITY", "Sign-in unlocked", "An Ice Bank teller unlocked your sign-in. You can sign in again.");
    return ok({ userId: id, status: "ACTIVE", failedLoginCount: 0 });
  }, { actorUserId: u.userId });
});

export const listDeposits = route({ auth: "admin", query: StatusQuery(["PENDING", "APPROVED", "REJECTED"]) }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const { page: p, size, status } = ctx.query;
  const where = "d.sandbox_id = $1 AND ($2::text IS NULL OR d.status = $2)";
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM cheque_deposits d WHERE ${where}`, [sb, status ?? null]);
  const rows = await query(`SELECT x.*, c.first_name || ' ' || c.last_name AS customer_name FROM (${DEPOSIT_SELECT} WHERE ${where}) x
      JOIN customers c ON c.sandbox_id = $1 AND c.id = x.customer_id ORDER BY (x.status = 'PENDING') DESC, x.created_at, x.id LIMIT ${size} OFFSET ${p * size}`, [sb, status ?? null]);
  return ok(pageResult(rows.map((r) => ({ ...depositView(r), customerId: Number(r.customer_id), customerName: r.customer_name })), p, size, n));
});

export const depositImage = route({ auth: "admin" }, async (ctx) => {
  const side = ctx.params.side;
  if (side !== "front" && side !== "back") throw notFound("Image");
  const [d] = await query(`SELECT ${side}_image AS img, ${side}_mime AS mime FROM cheque_deposits WHERE sandbox_id = $1 AND id = $2`, [ctx.user!.sandboxId, intParam(ctx.params.id)]);
  if (!d) throw notFound("Deposit");
  return { status: 200, raw: { data: new Uint8Array(d.img as Buffer), contentType: String(d.mime) } };
});

function depositDecision(approve: boolean) {
  return route({ auth: "admin", ...(approve ? {} : { body: ReasonBody }) }, async (ctx) => {
    const u = ctx.user!;
    const sb = u.sandboxId;
    const id = intParam(ctx.params.id);
    return tx(async (db) => {
      await decideDeposit(db, sb, id, u.userId, approve, approve ? null : (ctx.body as { reason: string }).reason);
      return ok(depositView((await one(db, `${DEPOSIT_SELECT} WHERE d.sandbox_id = $1 AND d.id = $2`, [sb, id]))!));
    }, { actorUserId: u.userId });
  });
}
export const approveDeposit = depositDecision(true);
export const rejectDeposit = depositDecision(false);

export const listLoanApps = route({ auth: "admin", query: StatusQuery(["APPROVED", "MANUAL_REVIEW", "DECLINED"]) }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const { page: p, size, status } = ctx.query;
  const where = "la.sandbox_id = $1 AND ($2::text IS NULL OR la.status = $2)";
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM loan_applications la WHERE ${where}`, [sb, status ?? null]);
  const rows = await query(`SELECT la.*, c.first_name || ' ' || c.last_name AS customer_name FROM loan_applications la
      JOIN customers c ON c.sandbox_id = la.sandbox_id AND c.id = la.customer_id WHERE ${where}
      ORDER BY (la.status = 'MANUAL_REVIEW') DESC, la.created_at DESC, la.id DESC LIMIT ${size} OFFSET ${p * size}`, [sb, status ?? null]);
  return ok(pageResult(rows.map((r) => ({ ...appView(r), customerId: Number(r.customer_id), customerName: r.customer_name })), p, size, n));
});

export const decideLoan = route({ auth: "admin", body: DecisionBody }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const id = intParam(ctx.params.id);
  return tx(async (db) => {
    const a = await one<{ status: string; customer_id: number }>(db, "SELECT status, customer_id FROM loan_applications WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, id]);
    if (!a) throw notFound("Loan application");
    if (a.status !== "MANUAL_REVIEW") throw conflict("INVALID_STATE", "Only applications in manual review can be decided.");
    await db.query("UPDATE loan_applications SET status = $3, decision_source = 'ADMIN', decision_reason = $4, decided_by = $5, decided_at = app_now($1) WHERE sandbox_id = $1 AND id = $2",
      [sb, id, ctx.body.decision, ctx.body.reason, u.userId]);
    await audit(db, sb, u.userId, ctx.body.decision === "APPROVED" ? "LOAN_APPROVED" : "LOAN_DECLINED", "loan_application", id, { status: "MANUAL_REVIEW" },
      { status: ctx.body.decision, reason: ctx.body.reason });
    if (ctx.body.decision === "APPROVED") await fundLoan(db, sb, id);
    else await notifyCustomer(db, sb, a.customer_id, "LOAN", "Loan application declined", `We could not approve your loan application: ${ctx.body.reason}.`);
    return ok(appView((await one(db, "SELECT * FROM loan_applications WHERE sandbox_id = $1 AND id = $2", [sb, id]))!));
  }, { actorUserId: u.userId });
});

export const auditLog = route({ auth: "admin", query: AuditQuery }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const { page: p, size, action, entityType, entityId, actorUserId, from, to } = ctx.query;
  const errors = [];
  if (from && !isValidIsoDate(from)) errors.push({ field: "from", message: "must be a real date" });
  if (to && !isValidIsoDate(to)) errors.push({ field: "to", message: "must be a real date" });
  if (errors.length) throw validation(errors);
  const where = `l.sandbox_id = $1 AND ($2::text IS NULL OR l.action = $2) AND ($3::text IS NULL OR l.entity_type = $3) AND ($4::bigint IS NULL OR l.entity_id = $4)
    AND ($5::bigint IS NULL OR l.actor_user_id = $5) AND ($6::timestamptz IS NULL OR l.created_at >= $6) AND ($7::timestamptz IS NULL OR l.created_at <= $7)`;
  const params = [sb, action ?? null, entityType ?? null, entityId ?? null, actorUserId ?? null, from ? startOfDay(from) : null, to ? endOfDay(to) : null];
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log l WHERE ${where}`, params);
  const rows = await query(`SELECT l.*, u.email AS actor_email FROM audit_log l LEFT JOIN users u ON u.sandbox_id = l.sandbox_id AND u.id = l.actor_user_id
      WHERE ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ${size} OFFSET ${p * size}`, params);
  return ok(pageResult(rows.map((r) => ({
    id: Number(r.id), actorUserId: r.actor_user_id === null ? null : Number(r.actor_user_id), actorEmail: r.actor_email ?? null, action: r.action,
    entityType: r.entity_type, entityId: r.entity_id === null ? null : Number(r.entity_id), oldValue: r.old_value, newValue: r.new_value, createdAt: isoOffset(r.created_at)!,
  })), p, size, n));
});

