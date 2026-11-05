/** Ice Mail: the simulated inbox. Holds OTPs, reset links and e-transfer notices. */
import { z, doc, page, PageQuery, DateTimeStr, Id, IdParam, registry } from "../openapi/registry";
import { route, ok, type Ctx } from "../http/handler";
import { query } from "../db/pool";
import { intParam, pageResult } from "../http/params";
import { fieldError, notFound, unauthorized } from "../errors";
import { EMAIL_RE, normaliseEmail } from "@/lib/validation";
import { isoOffset } from "@/lib/dates";

const MessageSchema = registry.register("InboxMessage", z.object({
  id: Id,
  to: z.string().openapi({ example: "emma.tremblay@icebank.test" }),
  from: z.string().openapi({ example: "Ice Bank" }),
  kind: z.enum(["OTP", "PASSWORD_RESET", "ETRANSFER", "EMAIL_CHANGE", "AUTODEPOSIT", "WELCOME", "NOTICE"]),
  subject: z.string().openapi({ example: "Your Ice Bank sign-in code" }),
  body: z.string(),
  otpCode: z.string().nullable().openapi({ example: "482913", description: "The code, for OTP-type messages" }),
  link: z.string().nullable().openapi({ example: "/reset-password?token=abc", description: "The link, for reset and e-transfer messages" }),
  createdAt: DateTimeStr,
  read: z.boolean(),
}));

const InboxQuery = PageQuery.extend({
  email: z.string().optional().openapi({ example: "emma.tremblay@icebank.test", description: "Required when using X-Sandbox-Key instead of a token" }),
  kind: z.enum(["OTP", "PASSWORD_RESET", "ETRANSFER", "EMAIL_CHANGE", "AUTODEPOSIT", "WELCOME", "NOTICE"]).optional(),
});

doc({
  method: "get", path: "/inbox", tag: "Ice Mail", summary: "List Ice Mail messages (newest first)", auth: "bearer-or-sandbox",
  description: "Signed in: your own inbox. For test automation, send X-Sandbox-Key plus ?email= to read any inbox in your sandbox " +
    "without signing in (this is how a test reads the login OTP). Filter with ?kind=OTP.",
  query: InboxQuery, responses: { 200: { schema: page(MessageSchema), description: "Messages" } },
});
doc({ method: "get", path: "/inbox/{id}", tag: "Ice Mail", summary: "Read one message (marks it read)", auth: "bearer-or-sandbox",
  params: IdParam, query: z.object({ email: z.string().optional() }), responses: { 200: { schema: MessageSchema, description: "Message" } },
  errors: { 404: "Message not found." } });

function view(m: Record<string, unknown>) {
  return {
    id: Number(m.id), to: String(m.to_email), from: String(m.from_name), kind: String(m.kind), subject: String(m.subject),
    body: String(m.body), otpCode: (m.otp_code as string | null) ?? null, link: (m.link as string | null) ?? null,
    createdAt: isoOffset(m.created_at as Date)!, read: m.read_at !== null,
  };
}

/** Which mailbox: the signed-in user's, or ?email= with a sandbox key. */
function mailbox(ctx: Ctx<unknown, { email?: string }>): { sb: number; email: string } {
  // A sandbox key with ?email= reads that inbox even if the browser also sends login cookies.
  if (ctx.user && !(ctx.keySandboxId !== null && ctx.query?.email)) return { sb: ctx.user.sandboxId, email: ctx.user.email };
  if (ctx.keySandboxId === null) throw unauthorized("Sign in, or send X-Sandbox-Key with ?email= to read a test inbox.");
  const email = ctx.query?.email;
  if (!email) throw fieldError("email", "is required when using X-Sandbox-Key");
  if (!EMAIL_RE.test(email.trim())) throw fieldError("email", "must be a valid email address");
  return { sb: ctx.keySandboxId, email: normaliseEmail(email) };
}

export const list = route({ auth: "optional", query: InboxQuery }, async (ctx) => {
  const { sb, email } = mailbox(ctx);
  const { page: p, size, kind } = ctx.query;
  const where = "sandbox_id = $1 AND to_email = $2 AND ($3::text IS NULL OR kind = $3)";
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM inbox_messages WHERE ${where}`, [sb, email, kind ?? null]);
  const rows = await query(`SELECT * FROM inbox_messages WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
    [sb, email, kind ?? null, size, p * size]);
  return ok(pageResult(rows.map(view), p, size, n));
});

export const get = route({ auth: "optional", query: z.object({ email: z.string().optional() }) }, async (ctx) => {
  const { sb, email } = mailbox(ctx);
  const id = intParam(ctx.params.id);
  const rows = await query(
    `UPDATE inbox_messages SET read_at = COALESCE(read_at, app_now($1)) WHERE sandbox_id = $1 AND id = $2 AND to_email = $3 RETURNING *`,
    [sb, id, email]);
  if (!rows[0]) throw notFound("Message");
  return ok(view(rows[0]));
});
