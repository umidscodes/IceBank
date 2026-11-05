/** Interac e-Transfer: send, list, cancel, accept, contacts and autodeposit. */
import { z, doc, page, PageQuery, Money, DateTimeStr, Id, IdParam, moneyInput, registry } from "../openapi/registry";
import { route, ok, created, accepted, noContent, type Principal } from "../http/handler";
import { query, tx, one, type Db } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { conflict, notFound, rule, validation, type FieldError } from "../errors";
import { customerId, audit, notifyCustomer, sendMail } from "../services/common";
import { formatCents, formatDisplay, money, toCents } from "@/lib/money";
import { referenceId, sha256, randomDigits } from "@/lib/crypto";
import { isoOffset, torontoDate, startOfDay } from "@/lib/dates";
import { EMAIL_RE, normaliseEmail } from "@/lib/validation";
import { ownedAccount } from "./accounts";
import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from "./auth";

export const PER_TRANSFER_MAX = 300000n; // cents
export const DAILY_MAX = 300000n;
export const ROLLING_30_MAX = 1000000n;
export const MAX_CONTACTS = 50;
export const EXPIRY_DAYS = 30;

// ---- schemas ----------------------------------------------------------------------------------

const Email = z.string({ error: "is required" }).trim().max(254).refine((v) => EMAIL_RE.test(v), "must be a valid email address");

const SendBody = z.object({
  fromAccountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  recipientName: z.string({ error: "is required" }).trim().min(1, "is required").max(60, "must be at most 60 characters").openapi({ example: "Liam Chen" }),
  recipientEmail: Email.openapi({ example: "liam.chen@icebank.test" }),
  amount: moneyInput({ min: 1n, example: "50.00", description: "$0.01 to $3,000.00 per transfer (more is a 422 LIMIT_PER_TRANSFER)" }),
  message: z.string().trim().max(400, "must be at most 400 characters").optional().openapi({ example: "Pizza night" }),
  securityQuestion: z.string().trim().min(5, "must be 5 to 100 characters").max(100, "must be 5 to 100 characters").optional().openapi({ example: "Where did we meet?" }),
  securityAnswer: z.string().optional().openapi({ example: "Halifax", description: "3 to 25 characters, case-insensitive, must not appear in the message" }),
});

const EtSchema = registry.register("ETransfer", z.object({
  id: Id, direction: z.enum(["SENT", "RECEIVED"]),
  senderName: z.string(), recipientName: z.string(), recipientEmail: z.string(),
  fromAccountId: Id.nullable().openapi({ description: "Only shown to the sender" }),
  depositAccountId: Id.nullable(),
  amount: Money, message: z.string().nullable(), securityQuestion: z.string().nullable(), autodeposit: z.boolean(),
  status: z.enum(["PENDING", "DEPOSITED", "CANCELLED", "EXPIRED"]), referenceId: z.string(),
  createdAt: DateTimeStr, expiresAt: DateTimeStr, depositedAt: DateTimeStr.nullable(), cancelledAt: DateTimeStr.nullable(), expiredAt: DateTimeStr.nullable(),
}));

const ListQuery = PageQuery.extend({
  direction: z.enum(["sent", "received"], { error: "must be sent or received" }).default("sent"),
  status: z.enum(["PENDING", "DEPOSITED", "CANCELLED", "EXPIRED"]).optional(),
});
const AcceptBody = z.object({
  accountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1 }),
  securityAnswer: z.string({ error: "is required" }).min(1, "is required").openapi({ example: "glacier" }),
});
const ContactBody = z.object({
  name: z.string({ error: "is required" }).trim().min(1, "is required").max(60, "must be at most 60 characters").openapi({ example: "Sophie Bouchard" }),
  email: Email.openapi({ example: "sophie.bouchard@icebank.test" }),
});
const ContactSchema = registry.register("ETransferContact", z.object({ id: Id, name: z.string(), email: z.string(), createdAt: DateTimeStr }));
const AutodepositBody = z.object({
  enabled: z.boolean().default(true),
  email: Email.optional().openapi({ example: "emma.tremblay@icebank.test" }),
  accountId: z.number().int().positive().optional().openapi({ example: 1 }),
  otpCode: z.string().regex(/^\d{6}$/, "must be 6 digits").optional().openapi({ description: "Second call: the code sent to Ice Mail" }),
});
const AutodepositSchema = z.object({
  status: z.enum(["NONE", "PENDING_CONFIRMATION", "ACTIVE"]), email: z.string().nullable(), accountId: Id.nullable(), confirmedAt: DateTimeStr.nullable(),
});

// ---- docs -------------------------------------------------------------------------------------

doc({
  method: "post", path: "/etransfers", tag: "Interac e-Transfer", summary: "Send money to an email address", auth: "bearer", idempotent: true,
  description: "Limits (422): per transfer $3,000.00 (LIMIT_PER_TRANSFER); per Toronto calendar day $3,000.00 (DAILY_LIMIT_EXCEEDED); rolling 30 days " +
    "$10,000.00 (ROLLING_LIMIT_EXCEEDED). Pending transfers count toward the limits. If the recipient has autodeposit the money is deposited " +
    "instantly and no security question is needed; otherwise securityQuestion and securityAnswer are required (answer 3 to 25 characters, " +
    "case-insensitive, must not appear in the message) and the transfer stays PENDING until accepted, for up to 30 days. " +
    "The money leaves your account immediately. Other rules: INSUFFICIENT_FUNDS, ACCOUNT_FROZEN, INVALID_SOURCE (only chequing or savings), SELF_TRANSFER.",
  body: SendBody,
  bodyExample: { fromAccountId: 1, recipientName: "Liam Chen", recipientEmail: "liam.chen@icebank.test", amount: "50.00", message: "Pizza night", securityQuestion: "Where did we meet?", securityAnswer: "Halifax" },
  responses: { 201: { schema: EtSchema, description: "Sent", headers: { Location: "/api/v1/etransfers/{id}" } } },
  errors: { 404: "Account not found.", 422: "This transfer would exceed your daily limit of $3,000.00. Remaining today: $2,950.00." },
});
doc({ method: "get", path: "/etransfers", tag: "Interac e-Transfer", summary: "List sent or received e-Transfers", auth: "bearer",
  query: ListQuery, responses: { 200: { schema: page(EtSchema), description: "e-Transfers (newest first)" } } });
doc({ method: "get", path: "/etransfers/{id}", tag: "Interac e-Transfer", summary: "Get an e-Transfer (sender or recipient)", auth: "bearer",
  params: IdParam, responses: { 200: { schema: EtSchema, description: "e-Transfer" } }, errors: { 404: "e-Transfer not found." } });
doc({ method: "post", path: "/etransfers/{id}/cancel", tag: "Interac e-Transfer", summary: "Cancel a pending e-Transfer (full refund)", auth: "bearer",
  idempotent: true, params: IdParam, description: "Sender only, while PENDING. The full amount is refunded with a REVERSAL transaction.",
  responses: { 200: { schema: EtSchema, description: "Cancelled" } }, errors: { 404: "e-Transfer not found.", 409: "Only a pending e-Transfer can be cancelled." } });
doc({ method: "post", path: "/etransfers/{id}/accept", tag: "Interac e-Transfer", summary: "Accept a pending e-Transfer", auth: "bearer",
  idempotent: true, params: IdParam, body: AcceptBody,
  description: "Recipient only. The answer is compared case-insensitively (422 WRONG_ANSWER). Expired or cancelled transfers return 409.",
  responses: { 200: { schema: EtSchema, description: "Deposited" } }, errors: { 404: "e-Transfer not found.", 409: "This e-Transfer has expired.", 422: "The security answer is incorrect." } });
doc({ method: "get", path: "/etransfers/autodeposit", tag: "Interac e-Transfer", summary: "My autodeposit setting", auth: "bearer",
  responses: { 200: { schema: AutodepositSchema, description: "Setting" } } });
doc({ method: "put", path: "/etransfers/autodeposit", tag: "Interac e-Transfer", summary: "Register, confirm or turn off autodeposit", auth: "bearer",
  description: "1) Send {email, accountId}: the email must be your own sign-in email (422 EMAIL_NOT_OWNED). A code goes to Ice Mail; response 202 PENDING_CONFIRMATION. " +
    "2) Send {otpCode}: autodeposit becomes ACTIVE (200). Send {enabled:false} to turn it off.",
  body: AutodepositBody, responses: { 200: { schema: AutodepositSchema, description: "Active or turned off" }, 202: { schema: AutodepositSchema, description: "Code sent" } },
  errors: { 422: "The autodeposit email must be your own email address." } });
doc({ method: "get", path: "/etransfer-contacts", tag: "Interac e-Transfer", summary: "List my contacts", auth: "bearer",
  responses: { 200: { schema: z.array(ContactSchema), description: "Contacts (alphabetical)" } } });
doc({ method: "post", path: "/etransfer-contacts", tag: "Interac e-Transfer", summary: "Add a contact", auth: "bearer", body: ContactBody,
  description: "Up to 50 contacts (422 CONTACT_LIMIT). Email unique per customer (409 CONTACT_EXISTS).",
  responses: { 201: { schema: ContactSchema, description: "Added", headers: { Location: "/api/v1/etransfer-contacts/{id}" } } },
  errors: { 409: "You already have a contact with this email.", 422: "You can have at most 50 contacts." } });
doc({ method: "put", path: "/etransfer-contacts/{id}", tag: "Interac e-Transfer", summary: "Update a contact", auth: "bearer", params: IdParam, body: ContactBody,
  responses: { 200: { schema: ContactSchema, description: "Updated" } }, errors: { 404: "Contact not found.", 409: "You already have a contact with this email." } });
doc({ method: "delete", path: "/etransfer-contacts/{id}", tag: "Interac e-Transfer", summary: "Delete a contact", auth: "bearer", params: IdParam,
  responses: { 204: { description: "Deleted" } }, errors: { 404: "Contact not found." } });

// ---- helpers ----------------------------------------------------------------------------------

const SELECT = `SELECT e.*, sc.first_name || ' ' || sc.last_name AS sender_name FROM etransfers e
  JOIN customers sc ON sc.sandbox_id = e.sandbox_id AND sc.id = e.sender_customer_id`;

function view(e: Record<string, unknown>, u: Principal) {
  const sent = Number(e.sender_customer_id) === u.customerId;
  return {
    id: Number(e.id), direction: sent ? "SENT" : "RECEIVED", senderName: String(e.sender_name), recipientName: String(e.recipient_name),
    recipientEmail: String(e.recipient_email), fromAccountId: sent ? Number(e.from_account_id) : null,
    depositAccountId: sent || e.deposit_account_id === null ? null : Number(e.deposit_account_id),
    amount: money(String(e.amount)), message: (e.message as string | null) ?? null, securityQuestion: (e.security_question as string | null) ?? null,
    autodeposit: Boolean(e.autodeposit), status: String(e.status), referenceId: String(e.reference_id),
    createdAt: isoOffset(e.created_at as Date)!, expiresAt: isoOffset(e.expires_at as Date)!, depositedAt: isoOffset(e.deposited_at as Date | null),
    cancelledAt: isoOffset(e.cancelled_at as Date | null), expiredAt: isoOffset(e.expired_at as Date | null),
  };
}

async function visible(db: Db, u: Principal, id: number, lock = false) {
  const row = await one(db, `${SELECT} WHERE e.sandbox_id = $1 AND e.id = $2 AND (e.sender_customer_id = $3 OR e.recipient_email = $4)${lock ? " FOR UPDATE OF e" : ""}`,
    [u.sandboxId, id, u.customerId, u.email]);
  if (!row) throw notFound("e-Transfer");
  return row as Record<string, unknown>;
}

const fmt = (c: bigint) => formatDisplay(c);

/** Totals that count toward the limits: PENDING and DEPOSITED only. */
export async function limitUsage(db: Db, sb: number, custId: number, now: Date) {
  const r = (await one<{ day: string; rolling: string }>(db,
    `SELECT COALESCE(sum(amount) FILTER (WHERE created_at >= $3), 0) AS day,
            COALESCE(sum(amount) FILTER (WHERE created_at > $4), 0) AS rolling
       FROM etransfers WHERE sandbox_id = $1 AND sender_customer_id = $2 AND status IN ('PENDING', 'DEPOSITED')`,
    [sb, custId, startOfDay(torontoDate(now)), new Date(now.getTime() - 30 * 86400000)]))!;
  return { day: toCents(r.day), rolling: toCents(r.rolling) };
}

// ---- handlers ---------------------------------------------------------------------------------

export const send = route({ auth: "customer", body: SendBody, idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const b = ctx.body;
  const email = normaliseEmail(b.recipientEmail);
  return tx(async (db) => {
    const from = await ownedAccount(db, sb, cid, b.fromAccountId, true);
    if (email === u.email) throw rule("SELF_TRANSFER", "You cannot send an e-Transfer to your own email. Use a transfer between your accounts.");
    if (from.type !== "CHEQUING" && from.type !== "SAVINGS") throw rule("INVALID_SOURCE", "e-Transfers can only be sent from a chequing or savings account.");
    if (from.status === "FROZEN") throw rule("ACCOUNT_FROZEN", "This account is frozen and cannot send money.");
    if (b.amount > PER_TRANSFER_MAX) throw rule("LIMIT_PER_TRANSFER", `The most you can send in one e-Transfer is ${fmt(PER_TRANSFER_MAX)}.`);

    const auto = await one<{ customer_id: number; account_id: number; account_status: string }>(db,
      `SELECT ad.customer_id, ad.account_id, a.status AS account_status FROM autodeposit_registrations ad
         JOIN accounts a ON a.sandbox_id = ad.sandbox_id AND a.id = ad.account_id
        WHERE ad.sandbox_id = $1 AND ad.email = $2 AND ad.status = 'ACTIVE'`, [sb, email]);
    const autodeposit = !!auto && auto.account_status === "OPEN";
    if (!autodeposit) {
      const errors: FieldError[] = [];
      if (!b.securityQuestion) errors.push({ field: "securityQuestion", message: "is required when the recipient does not have autodeposit" });
      const ans = (b.securityAnswer ?? "").trim();
      if (!b.securityAnswer) errors.push({ field: "securityAnswer", message: "is required when the recipient does not have autodeposit" });
      else if (ans.length < 3 || ans.length > 25) errors.push({ field: "securityAnswer", message: "must be 3 to 25 characters" });
      else if (/\s{2,}/.test(ans)) errors.push({ field: "securityAnswer", message: "must not contain repeated spaces" });
      if (ans && b.message && b.message.toLowerCase().includes(ans.toLowerCase())) errors.push({ field: "securityAnswer", message: "must not appear in the message" });
      if (errors.length) throw validation(errors);
    }

    await db.query("SELECT 1 FROM customers WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, cid]); // serialise limit checks
    const now = (await one<{ now: Date }>(db, "SELECT app_now($1) AS now", [sb]))!.now;
    const used = await limitUsage(db, sb, cid, now);
    if (used.day + b.amount > DAILY_MAX) {
      throw rule("DAILY_LIMIT_EXCEEDED", `This transfer would exceed your daily limit of ${fmt(DAILY_MAX)}. Remaining today: ${fmt(DAILY_MAX - used.day)}.`,
        { remaining: formatCents(DAILY_MAX - used.day) });
    }
    if (used.rolling + b.amount > ROLLING_30_MAX) {
      throw rule("ROLLING_LIMIT_EXCEEDED", `This transfer would exceed your 30-day limit of ${fmt(ROLLING_30_MAX)}. Remaining: ${fmt(ROLLING_30_MAX - used.rolling)}.`,
        { remaining: formatCents(ROLLING_30_MAX - used.rolling) });
    }
    if (b.amount > toCents(String(from.available_balance))) throw rule("INSUFFICIENT_FUNDS", `Available balance is ${money(String(from.available_balance))}.`);

    const amount = formatCents(b.amount);
    const ref = referenceId("ETR");
    const sender = (await one<{ name: string; first: string }>(db, "SELECT first_name || ' ' || last_name AS name, first_name AS first FROM customers WHERE sandbox_id = $1 AND id = $2", [sb, cid]))!;
    const recipient = await one<{ id: number }>(db,
      "SELECT c.id FROM customers c JOIN users u ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id WHERE c.sandbox_id = $1 AND u.email = $2", [sb, email]);
    await db.query("SELECT post_entry($1, $2, 'DEBIT', $3, 'ETRANSFER', $4, $5)", [sb, b.fromAccountId, amount, `Interac e-Transfer to ${b.recipientName}`, ref]);
    const et = (await one<{ id: number }>(db,
      `INSERT INTO etransfers (sandbox_id, sender_customer_id, from_account_id, recipient_name, recipient_email, recipient_customer_id, deposit_account_id,
         amount, message, security_question, security_answer_hash, autodeposit, status, reference_id, created_at, expires_at, deposited_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, app_now($1), app_now($1) + make_interval(days => $15), $16)
       RETURNING id`,
      [sb, cid, b.fromAccountId, b.recipientName, email, recipient?.id ?? null, autodeposit ? auto!.account_id : null, amount, b.message || null,
        autodeposit ? null : b.securityQuestion, autodeposit ? null : sha256(b.securityAnswer!.trim().toLowerCase()), autodeposit,
        autodeposit ? "DEPOSITED" : "PENDING", ref, EXPIRY_DAYS, autodeposit ? now : null]))!;
    if (autodeposit) {
      await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'ETRANSFER', $4, $5)", [sb, auto!.account_id, amount, `Interac e-Transfer from ${sender.name}`, ref]);
      await sendMail(db, sb, email, "ETRANSFER", `INTERAC e-Transfer: ${sender.name} sent you money`,
        `${sender.name} sent you $${amount} (CAD) and it was automatically deposited.${b.message ? `\nMessage: ${b.message}` : ""}`);
      await notifyCustomer(db, sb, auto!.customer_id, "MONEY_MOVEMENT", "Interac e-Transfer deposited", `${sender.name} sent you $${amount}. It was deposited automatically.`);
    } else {
      await sendMail(db, sb, email, "ETRANSFER", `INTERAC e-Transfer: ${sender.name} sent you money`,
        `${sender.name} sent you $${amount} (CAD).${b.message ? `\nMessage: ${b.message}` : ""}\nSign in to Ice Bank to deposit it. Security question: ${b.securityQuestion}\nThis transfer expires in ${EXPIRY_DAYS} days.`,
        { link: `/etransfer/received/${et.id}` });
      if (recipient) await notifyCustomer(db, sb, recipient.id, "MONEY_MOVEMENT", "Interac e-Transfer received", `${sender.name} sent you $${amount}. Accept it to deposit the money.`);
    }
    await notifyCustomer(db, sb, cid, "MONEY_MOVEMENT", "Interac e-Transfer sent", `You sent $${amount} to ${b.recipientName}.`);
    await audit(db, sb, u.userId, "ETRANSFER_SENT", "etransfer", et.id, null, { amount, recipientEmail: email, autodeposit });
    const row = await visible(db, u, et.id);
    return created(view(row, u), `/api/v1/etransfers/${et.id}`);
  }, { actorUserId: u.userId });
});

export const list = route({ auth: "customer", query: ListQuery }, async (ctx) => {
  const u = ctx.user!;
  const { page: p, size, direction, status } = ctx.query;
  const cond = direction === "sent" ? "e.sender_customer_id = $2" : "e.recipient_email = $2";
  const where = `e.sandbox_id = $1 AND ${cond} AND ($3::text IS NULL OR e.status = $3)`;
  const params = [u.sandboxId, direction === "sent" ? customerId(u) : u.email, status ?? null];
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM etransfers e WHERE ${where}`, params);
  const rows = await query(`${SELECT} WHERE ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ${size} OFFSET ${p * size}`, params);
  return ok(pageResult(rows.map((r) => view(r, u)), p, size, n));
});

export const get = route({ auth: "customer" }, async (ctx) =>
  tx(async (db) => ok(view(await visible(db, ctx.user!, intParam(ctx.params.id)), ctx.user!))));

export const cancel = route({ auth: "customer", idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  return tx(async (db) => {
    const e = await visible(db, u, intParam(ctx.params.id), true);
    if (Number(e.sender_customer_id) !== u.customerId) throw notFound("e-Transfer");
    if (e.status !== "PENDING") throw conflict("INVALID_STATE", `Only a pending e-Transfer can be cancelled. This one is ${String(e.status).toLowerCase()}.`);
    await db.query("UPDATE etransfers SET status = 'CANCELLED', cancelled_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, e.id]);
    await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'REVERSAL', $4, $5)",
      [sb, e.from_account_id, e.amount, `Interac e-Transfer cancelled - refund (${e.recipient_name})`, e.reference_id]);
    await audit(db, sb, u.userId, "ETRANSFER_CANCELLED", "etransfer", Number(e.id), { status: "PENDING" }, { status: "CANCELLED", refunded: money(String(e.amount)) });
    await notifyCustomer(db, sb, Number(e.sender_customer_id), "MONEY_MOVEMENT", "Interac e-Transfer cancelled", `Your $${money(String(e.amount))} e-Transfer to ${e.recipient_name} was cancelled and refunded.`);
    await sendMail(db, sb, String(e.recipient_email), "ETRANSFER", "INTERAC e-Transfer cancelled", `${e.sender_name} cancelled the $${money(String(e.amount))} e-Transfer sent to you.`);
    return ok(view(await visible(db, u, Number(e.id)), u));
  }, { actorUserId: u.userId });
});

export const acceptTransfer = route({ auth: "customer", body: AcceptBody, idempotent: true }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  return tx(async (db) => {
    const e = await visible(db, u, intParam(ctx.params.id), true);
    if (String(e.recipient_email) !== u.email) throw notFound("e-Transfer");
    const now = (await one<{ now: Date }>(db, "SELECT app_now($1) AS now", [sb]))!.now;
    if (e.status === "PENDING" && (e.expires_at as Date) <= now) throw conflict("INVALID_STATE", "This e-Transfer has expired.");
    if (e.status !== "PENDING") throw conflict("INVALID_STATE", `This e-Transfer is ${String(e.status).toLowerCase()} and cannot be accepted.`);
    const acct = await ownedAccount(db, sb, cid, ctx.body.accountId, true);
    if (acct.type !== "CHEQUING" && acct.type !== "SAVINGS") throw rule("INVALID_TARGET", "e-Transfers can only be deposited into a chequing or savings account.");
    if (acct.status !== "OPEN") throw rule("ACCOUNT_FROZEN", "This account cannot receive money right now.");
    if (sha256(ctx.body.securityAnswer.trim().toLowerCase()) !== e.security_answer_hash) throw rule("WRONG_ANSWER", "The security answer is incorrect.");
    await db.query("UPDATE etransfers SET status = 'DEPOSITED', deposited_at = app_now($1), deposit_account_id = $3, recipient_customer_id = $4 WHERE sandbox_id = $1 AND id = $2",
      [sb, e.id, acct.id, cid]);
    await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'ETRANSFER', $4, $5)", [sb, acct.id, e.amount, `Interac e-Transfer from ${e.sender_name}`, e.reference_id]);
    await audit(db, sb, u.userId, "ETRANSFER_ACCEPTED", "etransfer", Number(e.id), { status: "PENDING" }, { status: "DEPOSITED", accountId: acct.id });
    await notifyCustomer(db, sb, cid, "MONEY_MOVEMENT", "Interac e-Transfer deposited", `You deposited $${money(String(e.amount))} from ${e.sender_name}.`);
    await notifyCustomer(db, sb, Number(e.sender_customer_id), "MONEY_MOVEMENT", "Interac e-Transfer accepted", `${e.recipient_name} accepted your $${money(String(e.amount))} e-Transfer.`);
    return ok(view(await visible(db, u, Number(e.id)), u));
  }, { actorUserId: u.userId });
});

// ---- autodeposit -------------------------------------------------------------------------------

async function autodepositView(sb: number, cid: number) {
  const [r] = await query("SELECT * FROM autodeposit_registrations WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]);
  if (!r) return { status: "NONE", email: null, accountId: null, confirmedAt: null };
  return { status: r.status, email: r.email, accountId: Number(r.account_id), confirmedAt: isoOffset(r.confirmed_at) };
}

export const getAutodeposit = route({ auth: "customer" }, async (ctx) => ok(await autodepositView(ctx.user!.sandboxId, customerId(ctx.user))));

export const putAutodeposit = route({ auth: "customer", body: AutodepositBody }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const b = ctx.body;
  const status = await tx(async (db) => {
    if (b.enabled === false) {
      await db.query("DELETE FROM autodeposit_registrations WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]);
      await audit(db, sb, u.userId, "AUTODEPOSIT_DISABLED", "customer", cid, null, null);
      return 200;
    }
    if (b.otpCode) {
      const reg = await one<{ id: number; status: string }>(db, "SELECT id, status FROM autodeposit_registrations WHERE sandbox_id = $1 AND customer_id = $2 FOR UPDATE", [sb, cid]);
      if (!reg || reg.status !== "PENDING_CONFIRMATION") throw rule("NO_PENDING_REGISTRATION", "There is no autodeposit registration waiting for a code.");
      const otp = await one<{ id: number; code_hash: string; attempts: number; expires_at: Date; now: Date }>(db,
        `SELECT id, code_hash, attempts, expires_at, app_now($1) AS now FROM otp_codes WHERE sandbox_id = $1 AND user_id = $2 AND purpose = 'AUTODEPOSIT'
           AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`, [sb, u.userId]);
      if (!otp) throw rule("NO_PENDING_REGISTRATION", "There is no autodeposit registration waiting for a code.");
      if (otp.attempts >= OTP_MAX_ATTEMPTS) throw rule("OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Register again to get a new code.");
      if (otp.expires_at <= otp.now) throw rule("OTP_EXPIRED", "The code has expired. Register again to get a new code.");
      if (sha256(b.otpCode) !== otp.code_hash) {
        await db.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE sandbox_id = $1 AND id = $2", [sb, otp.id]);
        throw rule("OTP_INVALID", `The code is incorrect. ${OTP_MAX_ATTEMPTS - otp.attempts - 1} attempts remaining.`);
      }
      await db.query("UPDATE otp_codes SET consumed_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, otp.id]);
      await db.query("UPDATE autodeposit_registrations SET status = 'ACTIVE', confirmed_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, reg.id]);
      await audit(db, sb, u.userId, "AUTODEPOSIT_ACTIVATED", "customer", cid, { status: "PENDING_CONFIRMATION" }, { status: "ACTIVE" });
      await notifyCustomer(db, sb, cid, "SECURITY", "Autodeposit is on", "e-Transfers sent to your email will now be deposited automatically.");
      return 200;
    }
    const errors: FieldError[] = [];
    if (!b.email) errors.push({ field: "email", message: "is required" });
    if (!b.accountId) errors.push({ field: "accountId", message: "is required" });
    if (errors.length) throw validation(errors);
    const email = normaliseEmail(b.email!);
    if (email !== u.email) throw rule("EMAIL_NOT_OWNED", "The autodeposit email must be your own email address.");
    const acct = await ownedAccount(db, sb, cid, b.accountId!);
    if (acct.type !== "CHEQUING" && acct.type !== "SAVINGS") throw rule("INVALID_TARGET", "Autodeposit must go to a chequing or savings account.");
    await db.query(
      `INSERT INTO autodeposit_registrations (sandbox_id, customer_id, email, account_id, status, created_at)
       VALUES ($1, $2, $3, $4, 'PENDING_CONFIRMATION', app_now($1))
       ON CONFLICT (sandbox_id, customer_id) DO UPDATE SET email = EXCLUDED.email, account_id = EXCLUDED.account_id,
         status = 'PENDING_CONFIRMATION', created_at = EXCLUDED.created_at, confirmed_at = NULL`, [sb, cid, email, acct.id]);
    await db.query("UPDATE otp_codes SET consumed_at = app_now($1) WHERE sandbox_id = $1 AND user_id = $2 AND purpose = 'AUTODEPOSIT' AND consumed_at IS NULL", [sb, u.userId]);
    const code = randomDigits(6);
    await db.query(
      `INSERT INTO otp_codes (sandbox_id, user_id, purpose, code_hash, target, expires_at, created_at)
       VALUES ($1, $2, 'AUTODEPOSIT', $3, $4, app_now($1) + make_interval(mins => $5), app_now($1))`, [sb, u.userId, sha256(code), email, OTP_TTL_MINUTES]);
    await sendMail(db, sb, email, "AUTODEPOSIT", "Confirm Interac e-Transfer Autodeposit",
      `Use code ${code} to turn on autodeposit for ${email}. It expires in ${OTP_TTL_MINUTES} minutes.`, { otpCode: code });
    return 202;
  }, { actorUserId: u.userId });
  const body = await autodepositView(sb, cid);
  return status === 202 ? accepted(body) : ok(body);
});

// ---- contacts ----------------------------------------------------------------------------------

const contactView = (c: Record<string, unknown>) => ({ id: Number(c.id), name: String(c.name), email: String(c.email), createdAt: isoOffset(c.created_at as Date)! });

export const listContacts = route({ auth: "customer" }, async (ctx) => {
  const rows = await query("SELECT * FROM etransfer_contacts WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY lower(name), id", [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map(contactView));
});

export const addContact = route({ auth: "customer", body: ContactBody }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  return tx(async (db) => {
    await db.query("SELECT 1 FROM customers WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, cid]);
    const { n } = (await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM etransfer_contacts WHERE sandbox_id = $1 AND customer_id = $2", [sb, cid]))!;
    if (n >= MAX_CONTACTS) throw rule("CONTACT_LIMIT", `You can have at most ${MAX_CONTACTS} contacts.`);
    const email = normaliseEmail(ctx.body.email);
    if (await one(db, "SELECT 1 FROM etransfer_contacts WHERE sandbox_id = $1 AND customer_id = $2 AND email = $3", [sb, cid, email])) {
      throw conflict("CONTACT_EXISTS", "You already have a contact with this email.");
    }
    const row = (await one(db, "INSERT INTO etransfer_contacts (sandbox_id, customer_id, name, email, created_at) VALUES ($1, $2, $3, $4, app_now($1)) RETURNING *",
      [sb, cid, ctx.body.name, email]))!;
    return created(contactView(row), `/api/v1/etransfer-contacts/${row.id}`);
  });
});

export const updateContact = route({ auth: "customer", body: ContactBody }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const cid = customerId(ctx.user);
  const id = intParam(ctx.params.id);
  return tx(async (db) => {
    if (!(await one(db, "SELECT 1 FROM etransfer_contacts WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3", [sb, id, cid]))) throw notFound("Contact");
    const email = normaliseEmail(ctx.body.email);
    if (await one(db, "SELECT 1 FROM etransfer_contacts WHERE sandbox_id = $1 AND customer_id = $2 AND email = $3 AND id <> $4", [sb, cid, email, id])) {
      throw conflict("CONTACT_EXISTS", "You already have a contact with this email.");
    }
    const row = (await one(db, "UPDATE etransfer_contacts SET name = $4, email = $5 WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3 RETURNING *",
      [sb, id, cid, ctx.body.name, email]))!;
    return ok(contactView(row));
  });
});

export const deleteContact = route({ auth: "customer" }, async (ctx) => {
  const r = await query("DELETE FROM etransfer_contacts WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3 RETURNING id",
    [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!r[0]) throw notFound("Contact");
  return noContent();
});
