/** Profile: GET/PATCH /me, password change, email change with an OTP sent to the new address. */
import bcrypt from "bcryptjs";
import { z, doc, DateStr, DateTimeStr, Id, registry } from "../openapi/registry";
import { route, ok, accepted, noContent } from "../http/handler";
import { query, tx, one } from "../db/pool";
import { conflict, rule, validation } from "../errors";
import { PROVINCE_CODES, POSTAL_CODE_RE, PHONE_RE, EMAIL_RE, normaliseEmail } from "@/lib/validation";
import { isoOffset } from "@/lib/dates";
import { sha256, randomDigits } from "@/lib/crypto";
import { audit, notify, sendMail } from "../services/common";
import { changePassword, passwordFieldErrors, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from "./auth";

const ProfileSchema = registry.register("Profile", z.object({
  userId: Id, customerId: Id.nullable(), email: z.string(), role: z.enum(["CUSTOMER", "ADMIN", "INSTRUCTOR"]),
  firstName: z.string().nullable(), lastName: z.string().nullable(), dateOfBirth: DateStr.nullable(), phone: z.string().nullable(),
  address: z.object({ line1: z.string(), line2: z.string().nullable(), city: z.string(), province: z.string(), postalCode: z.string() }).nullable(),
  sinLast3: z.string().nullable().openapi({ example: "286", description: "Only the last 3 digits are ever returned" }),
  classicView: z.boolean(), lastLoginAt: DateTimeStr.nullable(), createdAt: DateTimeStr,
}));

const PatchBody = z.object({
  phone: z.string().regex(PHONE_RE, "must use the format (###) ###-####").optional(),
  addressLine1: z.string().trim().min(1, "is required").max(100).optional(),
  addressLine2: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(1, "is required").max(60).optional(),
  province: z.enum(PROVINCE_CODES, { error: `must be one of ${PROVINCE_CODES.join(", ")}` }).optional(),
  postalCode: z.string().transform((v) => v.trim().toUpperCase()).refine((v) => POSTAL_CODE_RE.test(v), "must be a Canadian postal code in the format A1A 1A1").optional(),
  classicView: z.boolean().optional().openapi({ description: "Switch selected pages to the Classic (hard mode) layout" }),
}).strict().openapi({ example: { phone: "(416) 555-0142", city: "Toronto" } });

const PasswordBody = z.object({
  currentPassword: z.string({ error: "is required" }).min(1, "is required"),
  newPassword: z.string({ error: "is required" }),
});
const EmailChangeBody = z.object({ newEmail: z.string({ error: "is required" }).trim().refine((v) => EMAIL_RE.test(v), "must be a valid email address") });
const ConfirmBody = z.object({ code: z.string({ error: "is required" }).regex(/^\d{6}$/, "must be 6 digits") });

doc({ method: "get", path: "/me", tag: "Profile", summary: "My profile", auth: "bearer", responses: { 200: { schema: ProfileSchema, description: "Profile" } } });
doc({ method: "patch", path: "/me", tag: "Profile", summary: "Update address, phone or view mode", auth: "bearer",
  description: "Only the fields you send change. Email has its own endpoint because it needs an OTP. Unknown fields are a 400.",
  body: PatchBody, responses: { 200: { schema: ProfileSchema, description: "Updated" } } });
doc({ method: "put", path: "/me/password", tag: "Profile", summary: "Change my password", auth: "bearer",
  description: "currentPassword must be right (422 CURRENT_PASSWORD_INCORRECT). The new one follows the password rules and must not be one of the last 3. Other sessions are signed out.",
  body: PasswordBody, responses: { 204: { description: "Changed" } },
  errors: { 422: "The new password cannot be one of your last 3 passwords." } });
doc({ method: "post", path: "/me/email-change", tag: "Profile", summary: "Start an email change", auth: "bearer",
  description: "Sends a 6-digit code to the NEW address in Ice Mail (valid 5 minutes, 3 attempts). The email changes only after /me/email-change/confirm.",
  body: EmailChangeBody, responses: { 202: { schema: z.object({ message: z.string(), expiresIn: z.number().int() }), description: "Code sent" } },
  errors: { 409: "An account with this email already exists." } });
doc({ method: "post", path: "/me/email-change/confirm", tag: "Profile", summary: "Confirm an email change with the code", auth: "bearer",
  body: ConfirmBody, responses: { 200: { schema: ProfileSchema, description: "Email changed" } },
  errors: { 422: "The code is incorrect. 2 attempts remaining." } });

async function profile(sb: number, userId: number) {
  const [r] = await query(
    `SELECT u.id AS user_id, u.email, u.role, u.classic_view, u.last_login_at, u.created_at, c.*
       FROM users u LEFT JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id WHERE u.sandbox_id = $1 AND u.id = $2`, [sb, userId]);
  return {
    userId: Number(r.user_id), customerId: r.id === null ? null : Number(r.id), email: String(r.email), role: r.role,
    firstName: r.first_name ?? null, lastName: r.last_name ?? null, dateOfBirth: r.date_of_birth ?? null, phone: r.phone ?? null,
    address: r.id === null ? null : { line1: r.address_line1, line2: r.address_line2 ?? null, city: r.city, province: r.province, postalCode: r.postal_code },
    sinLast3: r.sin_last3 ?? null, classicView: Boolean(r.classic_view), lastLoginAt: isoOffset(r.last_login_at), createdAt: isoOffset(r.created_at)!,
  };
}

export const getMe = route({ auth: "user" }, async (ctx) => ok(await profile(ctx.user!.sandboxId, ctx.user!.userId)));

export const patchMe = route({ auth: "user", body: PatchBody }, async (ctx) => {
  const u = ctx.user!;
  const b = ctx.body;
  if (Object.keys(b).length === 0) throw validation([{ field: "body", message: "send at least one field to change" }]);
  await tx(async (db) => {
    const before = await profile(u.sandboxId, u.userId);
    if (b.classicView !== undefined) {
      await db.query("UPDATE users SET classic_view = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [u.sandboxId, u.userId, b.classicView]);
    }
    const map: Record<string, string> = { phone: "phone", addressLine1: "address_line1", addressLine2: "address_line2", city: "city", province: "province", postalCode: "postal_code" };
    const sets: string[] = [];
    const params: unknown[] = [u.sandboxId, u.userId];
    for (const [k, col] of Object.entries(map)) {
      const v = (b as Record<string, unknown>)[k];
      if (v !== undefined) { params.push(v === "" ? null : v); sets.push(`${col} = $${params.length}`); }
    }
    if (sets.length) {
      if (u.customerId === null) throw validation([{ field: "body", message: "only customers have an address and phone" }]);
      await db.query(`UPDATE customers SET ${sets.join(", ")}, updated_at = app_now($1) WHERE sandbox_id = $1 AND user_id = $2`, params);
      await audit(db, u.sandboxId, u.userId, "PROFILE_UPDATED", "customer", u.customerId, { phone: before.phone, address: before.address }, b);
      await notify(db, u.sandboxId, u.userId, "SECURITY", "Profile updated", "Your contact details were updated.");
    }
  }, { actorUserId: u.userId });
  return ok(await profile(u.sandboxId, u.userId));
});

export const changeMyPassword = route({ auth: "user", body: PasswordBody }, async (ctx) => {
  const u = ctx.user!;
  const errors = passwordFieldErrors(ctx.body.newPassword, "newPassword");
  if (errors.length) throw validation(errors);
  await tx(async (db) => {
    const row = (await one<{ password_hash: string }>(db, "SELECT password_hash FROM users WHERE sandbox_id = $1 AND id = $2", [u.sandboxId, u.userId]))!;
    if (!(await bcrypt.compare(ctx.body.currentPassword, row.password_hash))) throw rule("CURRENT_PASSWORD_INCORRECT", "The current password is incorrect.");
    await changePassword(db, u.sandboxId, u.userId, ctx.body.newPassword, u.sessionId);
  });
  return noContent();
});

export const startEmailChange = route({ auth: "user", body: EmailChangeBody }, async (ctx) => {
  const u = ctx.user!;
  const email = normaliseEmail(ctx.body.newEmail);
  if (email === u.email) throw validation([{ field: "newEmail", message: "must be different from your current email" }]);
  await tx(async (db) => {
    if (await one(db, "SELECT 1 FROM users WHERE sandbox_id = $1 AND email = $2", [u.sandboxId, email])) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
    }
    await db.query("UPDATE otp_codes SET consumed_at = app_now($1) WHERE sandbox_id = $1 AND user_id = $2 AND purpose = 'EMAIL_CHANGE' AND consumed_at IS NULL", [u.sandboxId, u.userId]);
    const code = randomDigits(6);
    await db.query(
      `INSERT INTO otp_codes (sandbox_id, user_id, purpose, code_hash, target, expires_at, created_at)
       VALUES ($1, $2, 'EMAIL_CHANGE', $3, $4, app_now($1) + make_interval(mins => $5), app_now($1))`,
      [u.sandboxId, u.userId, sha256(code), email, OTP_TTL_MINUTES]);
    await sendMail(db, u.sandboxId, email, "EMAIL_CHANGE", "Confirm your new Ice Bank email",
      `Use code ${code} to confirm this as your new Ice Bank email address. It expires in ${OTP_TTL_MINUTES} minutes.`, { otpCode: code });
  });
  return accepted({ message: "We sent a 6-digit code to the new address in Ice Mail.", expiresIn: OTP_TTL_MINUTES * 60 });
});

export const confirmEmailChange = route({ auth: "user", body: ConfirmBody }, async (ctx) => {
  const u = ctx.user!;
  const result = await tx(async (db) => {
    const otp = await one<{ id: number; code_hash: string; target: string; attempts: number; expires_at: Date; now: Date }>(db,
      `SELECT id, code_hash, target, attempts, expires_at, app_now($1) AS now FROM otp_codes
        WHERE sandbox_id = $1 AND user_id = $2 AND purpose = 'EMAIL_CHANGE' AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [u.sandboxId, u.userId]);
    if (!otp) throw rule("NO_PENDING_CHANGE", "There is no email change waiting for confirmation.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw rule("OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Start the email change again.");
    if (otp.expires_at <= otp.now) throw rule("OTP_EXPIRED", "The code has expired. Start the email change again.");
    if (sha256(ctx.body.code) !== otp.code_hash) {
      await db.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE sandbox_id = $1 AND id = $2", [u.sandboxId, otp.id]);
      const remaining = OTP_MAX_ATTEMPTS - otp.attempts - 1;
      return { status: 422, headers: { "Content-Type": "application/problem+json" }, body: {
        type: "https://icebank.test/problems/otp-invalid", title: "Unprocessable Entity", status: 422, instance: ctx.path, code: "OTP_INVALID",
        detail: `The code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`, attemptsRemaining: remaining } };
    }
    if (await one(db, "SELECT 1 FROM users WHERE sandbox_id = $1 AND email = $2", [u.sandboxId, otp.target])) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
    }
    await db.query("UPDATE otp_codes SET consumed_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [u.sandboxId, otp.id]);
    await db.query("UPDATE users SET email = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [u.sandboxId, u.userId, otp.target]);
    await audit(db, u.sandboxId, u.userId, "EMAIL_CHANGED", "user", u.userId, { email: u.email }, { email: otp.target });
    await sendMail(db, u.sandboxId, u.email, "NOTICE", "Your Ice Bank email was changed", `Your sign-in email is now ${otp.target}. If this wasn't you, contact Ice Bank right away.`);
    await notify(db, u.sandboxId, u.userId, "SECURITY", "Email changed", `Your sign-in email is now ${otp.target}.`);
    return null;
  }, { actorUserId: u.userId });
  if (result) return result;
  return ok(await profile(u.sandboxId, u.userId));
});

