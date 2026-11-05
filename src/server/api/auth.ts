/**
 * Auth: register, login (password, then a 6-digit OTP sent to Ice Mail), refresh, logout,
 * forgot / reset password.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z, doc, DateStr, Id } from "../openapi/registry";
import { route, ok, created, noContent, accepted, type Cookie, type Ctx } from "../http/handler";
import { tx, one, query, type Db } from "../db/pool";
import { ApiError, conflict, rule, unauthorized, validation, type FieldError } from "../errors";
import { signAccessToken, ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS } from "../auth/tokens";
import { sha256, randomDigits, randomToken } from "@/lib/crypto";
import { PROVINCE_CODES, POSTAL_CODE_RE, PHONE_RE, EMAIL_RE, normaliseSin, passwordProblems, normaliseEmail } from "@/lib/validation";
import { ageOn, isValidIsoDate, torontoDate } from "@/lib/dates";
import { audit, notify, sendMail } from "../services/common";
import { createAccount, createCard } from "../services/provision";
import { accountView } from "./views";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 3;
export const RESET_TTL_MINUTES = 30;

const DUMMY_HASH = "$2b$10$zICHbY7DqBWI0qy19nbm9egnjHe0kkMZ42Jroa6C/fTSMhE6nCuvi";
const DEFAULT_SANDBOX = Number(process.env.DEFAULT_SANDBOX_ID ?? 1);
const anonSandbox = (ctx: Ctx<unknown, unknown>) => ctx.keySandboxId ?? DEFAULT_SANDBOX;

// ---- schemas ----------------------------------------------------------------------------------

const Password = z.string({ error: "is required" });
const Email = z.string({ error: "is required" }).trim().max(254, "must be at most 254 characters")
  .refine((v) => EMAIL_RE.test(v), "must be a valid email address").openapi({ example: "emma.tremblay@icebank.test" });

const RegisterBody = z.object({
  firstName: z.string({ error: "is required" }).trim().min(1, "is required").max(50, "must be at most 50 characters").openapi({ example: "Maya" }),
  lastName: z.string({ error: "is required" }).trim().min(1, "is required").max(50, "must be at most 50 characters").openapi({ example: "Fraser" }),
  dateOfBirth: DateStr.refine(isValidIsoDate, "must be a real date").openapi({ example: "1996-08-21" }),
  email: Email.openapi({ example: "maya.fraser@icebank.test" }),
  phone: z.string({ error: "is required" }).regex(PHONE_RE, "must use the format (###) ###-####").openapi({ example: "(416) 555-0199" }),
  addressLine1: z.string({ error: "is required" }).trim().min(1, "is required").max(100).openapi({ example: "200 Bay Street" }),
  addressLine2: z.string().trim().max(100).nullish().openapi({ example: "Suite 1200" }),
  city: z.string({ error: "is required" }).trim().min(1, "is required").max(60).openapi({ example: "Toronto" }),
  province: z.enum(PROVINCE_CODES, { error: `must be one of ${PROVINCE_CODES.join(", ")}` }).openapi({ example: "ON" }),
  postalCode: z.string({ error: "is required" }).transform((v) => v.trim().toUpperCase())
    .refine((v) => POSTAL_CODE_RE.test(v), "must be a Canadian postal code in the format A1A 1A1").openapi({ example: "M5J 2T3" }),
  sin: z.string({ error: "is required" }).refine((v) => normaliseSin(v) !== null, "must be a valid 9-digit SIN").openapi({ example: "193 746 286" }),
  password: Password.openapi({ example: "Glacier#2026" }),
});

const RegisterResponse = z.object({
  userId: Id, customerId: Id, email: z.string(),
  accounts: z.array(z.object({ id: Id, accountNumber: z.string(), type: z.string() })),
});

const LoginBody = z.object({ email: Email, password: Password.min(1, "is required").openapi({ example: "IceBank#2026" }) });
const LoginResponse = z.object({
  mfaRequired: z.literal(true),
  mfaToken: z.string().openapi({ example: "Zr4b2kq3...", description: "Send with the OTP to /auth/mfa/verify" }),
  expiresIn: z.number().int().openapi({ example: 300, description: "Seconds until the OTP expires" }),
  delivery: z.string().openapi({ example: "Ice Mail", description: "Where the OTP was sent" }),
});
const MfaBody = z.object({
  mfaToken: z.string({ error: "is required" }).min(1, "is required"),
  code: z.string({ error: "is required" }).regex(/^\d{6}$/, "must be 6 digits").openapi({ example: "482913" }),
});
const TokenResponse = z.object({
  accessToken: z.string(), refreshToken: z.string(),
  tokenType: z.literal("Bearer"), expiresIn: z.number().int().openapi({ example: 900 }),
});
const RefreshBody = z.object({ refreshToken: z.string().min(1, "is required").optional() });
const ForgotBody = z.object({ email: Email });
const ResetBody = z.object({ token: z.string({ error: "is required" }).min(1, "is required"), newPassword: Password });
const Message = z.object({ message: z.string() });

// ---- docs -------------------------------------------------------------------------------------

doc({
  method: "post", path: "/auth/register", tag: "Auth", summary: "Register a new customer", auth: "none",
  description: "Creates the user, the customer and a chequing account with a debit card, and sends a welcome email to Ice Mail. " +
    "Rules: age 18+ (422 UNDERAGE), postal code A1A 1A1, phone (###) ###-####, SIN Luhn-valid, email unique per sandbox (409 EMAIL_TAKEN), " +
    "password 8-64 chars with upper, lower, digit and special character.",
  body: RegisterBody, responses: { 201: { schema: RegisterResponse, description: "Registered", headers: { Location: "/api/v1/me" } } },
  errors: { 400: "One or more fields are invalid.", 409: "An account with this email already exists.", 422: "You must be at least 18 years old to open an account." },
});
doc({
  method: "post", path: "/auth/login", tag: "Auth", summary: "Step 1: email and password", auth: "none",
  description: "On success a 6-digit OTP is sent to Ice Mail (valid 5 minutes, 3 attempts). 5 failed logins lock the user for 15 minutes (code ACCOUNT_LOCKED). " +
    "Rate limit: 10 requests per minute per IP.",
  body: LoginBody, bodyExample: { email: "emma.tremblay@icebank.test", password: "IceBank#2026" },
  responses: { 200: { schema: LoginResponse, description: "Password accepted, OTP sent" } },
  errors: { 401: "Invalid email or password." },
});
doc({
  method: "post", path: "/auth/mfa/verify", tag: "Auth", summary: "Step 2: verify the OTP", auth: "none",
  description: "Returns a 15-minute access token and a 7-day refresh token (also set as httpOnly cookies for the web UI). " +
    "Codes: OTP_INVALID (with attemptsRemaining), OTP_EXPIRED, OTP_ATTEMPTS_EXCEEDED.",
  body: MfaBody, responses: { 200: { schema: TokenResponse, description: "Signed in" } },
  errors: { 401: "The code is incorrect. 2 attempts remaining." },
});
doc({
  method: "post", path: "/auth/refresh", tag: "Auth", summary: "Exchange a refresh token for new tokens", auth: "none",
  description: "Refresh tokens rotate: the old one stops working. Reusing a rotated token ends the whole session.",
  body: RefreshBody, responses: { 200: { schema: TokenResponse, description: "New tokens" } },
  errors: { 401: "The refresh token is invalid, expired or has been revoked." },
});
doc({ method: "post", path: "/auth/logout", tag: "Auth", summary: "End the session", auth: "bearer",
  description: "Revokes the session's refresh tokens; the access token stops working too.",
  responses: { 204: { description: "Signed out" } } });
doc({
  method: "post", path: "/auth/password/forgot", tag: "Auth", summary: "Send a password reset link", auth: "none",
  description: "Always returns 202 so the response does not reveal whether the email exists. The link (valid 30 minutes, single use) goes to Ice Mail.",
  body: ForgotBody, responses: { 202: { schema: Message, description: "If the email exists, a link was sent" } },
});
doc({
  method: "post", path: "/auth/password/reset", tag: "Auth", summary: "Set a new password with a reset token", auth: "none",
  description: "The new password must follow the password rules and must not equal any of the last 3 passwords (422 PASSWORD_REUSED). All sessions are signed out.",
  body: ResetBody, responses: { 204: { description: "Password changed" } },
  errors: { 400: "One or more fields are invalid.", 422: "The new password cannot be one of your last 3 passwords." },
});

// ---- helpers ----------------------------------------------------------------------------------

export function passwordFieldErrors(pw: string, field = "password"): FieldError[] {
  return passwordProblems(pw).map((message) => ({ field, message }));
}

export async function issueSession(db: Db, sb: number, userId: number, sessionId?: string) {
  const sid = sessionId ?? crypto.randomUUID();
  const refreshToken = randomToken(32);
  await db.query(
    `INSERT INTO refresh_tokens (sandbox_id, user_id, session_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, app_now($1) + make_interval(days => $5), app_now($1))`,
    [sb, userId, sid, sha256(refreshToken), REFRESH_TTL_DAYS]);
  const u = (await one<{ role: "CUSTOMER" | "ADMIN" | "INSTRUCTOR"; customer_id: number | null }>(db,
    `SELECT u.role, c.id AS customer_id FROM users u LEFT JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id
      WHERE u.sandbox_id = $1 AND u.id = $2`, [sb, userId]))!;
  const accessToken = await signAccessToken({ sub: String(userId), sbx: sb, role: u.role, sid, cid: u.customer_id });
  const body = { accessToken, refreshToken, tokenType: "Bearer" as const, expiresIn: ACCESS_TTL_SECONDS };
  const cookies: Cookie[] = [
    { name: "ib_at", value: accessToken, maxAge: ACCESS_TTL_SECONDS },
    { name: "ib_rt", value: refreshToken, maxAge: REFRESH_TTL_DAYS * 86400 },
  ];
  return { body, cookies, sessionId: sid };
}

export const clearCookies: Cookie[] = [{ name: "ib_at", value: "", maxAge: 0 }, { name: "ib_rt", value: "", maxAge: 0 }];

async function findLoginUser(ctx: Ctx<unknown, unknown>, email: string) {
  const rows = await query<{ sandbox_id: number; id: number; password_hash: string; status: string; failed_login_count: number;
    locked_until: Date | null; now: Date; role: string }>(
    `SELECT u.sandbox_id, u.id, u.password_hash, u.status, u.failed_login_count, u.locked_until, u.role, app_now(u.sandbox_id) AS now
       FROM users u WHERE u.email = $1 AND ($2::int IS NULL OR u.sandbox_id = $2) ORDER BY (u.sandbox_id = $3) DESC, u.sandbox_id`,
    [email, ctx.keySandboxId, DEFAULT_SANDBOX]);
  return rows[0];
}

function lockedError(lockedUntil: Date | null, now: Date) {
  if (!lockedUntil) {
    return new ApiError(401, "ACCOUNT_LOCKED", "Your sign-in is locked. Please contact Ice Bank to unlock it.");
  }
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
  return new ApiError(401, "ACCOUNT_LOCKED", `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    undefined, {}, { lockedUntil: lockedUntil.toISOString() });
}

// ---- handlers ---------------------------------------------------------------------------------

export const register = route({ auth: "none", body: RegisterBody, rate: "login" }, async (ctx) => {
  const b = ctx.body;
  const errors = passwordFieldErrors(b.password);
  if (errors.length) throw validation(errors);
  const sb = anonSandbox(ctx);
  const email = normaliseEmail(b.email);
  const sin = normaliseSin(b.sin)!;
  return tx(async (db) => {
    const now = (await one<{ now: Date }>(db, "SELECT app_now($1) AS now", [sb]))!.now;
    if (ageOn(b.dateOfBirth, torontoDate(now)) < 18) throw rule("UNDERAGE", "You must be at least 18 years old to open an account.");
    if (b.dateOfBirth > torontoDate(now)) throw validation([{ field: "dateOfBirth", message: "must be in the past" }]);
    const exists = await one(db, "SELECT 1 FROM users WHERE sandbox_id = $1 AND email = $2", [sb, email]);
    if (exists) throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
    const hash = await bcrypt.hash(b.password, 10);
    const user = (await one<{ id: number }>(db,
      `INSERT INTO users (sandbox_id, email, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'CUSTOMER', 'ACTIVE', app_now($1), app_now($1)) RETURNING id`, [sb, email, hash]))!;
    await db.query("INSERT INTO password_history (sandbox_id, user_id, password_hash, created_at) VALUES ($1, $2, $3, app_now($1))", [sb, user.id, hash]);
    const cust = (await one<{ id: number }>(db,
      `INSERT INTO customers (sandbox_id, user_id, first_name, last_name, date_of_birth, phone, address_line1, address_line2, city,
         province, postal_code, sin_hash, sin_last3, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, app_now($1), app_now($1)) RETURNING id`,
      [sb, user.id, b.firstName, b.lastName, b.dateOfBirth, b.phone, b.addressLine1, b.addressLine2 || null, b.city, b.province,
        b.postalCode, sha256(sin), sin.slice(-3)]))!;
    const accountId = await createAccount(db, sb, cust.id, "CHEQUING");
    await createCard(db, sb, cust.id, accountId, "DEBIT");
    await audit(db, sb, user.id, "CUSTOMER_REGISTERED", "customer", cust.id, null, { email, accountId });
    await sendMail(db, sb, email, "WELCOME", "Welcome to Ice Bank",
      `Hi ${b.firstName}, welcome to Ice Bank! Your chequing account is ready. Sign in any time at http://localhost:3000/login.`);
    const acct = await one<Record<string, unknown>>(db, "SELECT * FROM accounts WHERE sandbox_id = $1 AND id = $2", [sb, accountId]);
    return created({ userId: user.id, customerId: cust.id, email, accounts: [accountView(acct!)] }, "/api/v1/me");
  });
});

export const login = route({ auth: "none", body: LoginBody, rate: "login" }, async (ctx) => {
  const email = normaliseEmail(ctx.body.email);
  const u = await findLoginUser(ctx, email);
  const invalid = () => unauthorized("Invalid email or password.", "INVALID_CREDENTIALS");
  if (!u) {
    await bcrypt.compare(ctx.body.password, DUMMY_HASH); // same work as a real check
    throw invalid();
  }
  const sb = u.sandbox_id;
  if (u.status === "DISABLED") throw new ApiError(401, "ACCOUNT_DISABLED", "This sign-in has been disabled. Please contact Ice Bank.");
  return tx(async (db) => {
    const fresh = (await one<typeof u>(db, "SELECT status, failed_login_count, locked_until, app_now($1) AS now FROM users WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, u.id]))!;
    if (fresh.status === "LOCKED") {
      if (fresh.locked_until && fresh.locked_until <= fresh.now) {
        await db.query("UPDATE users SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, u.id]);
        await audit(db, sb, null, "USER_UNLOCKED", "user", u.id, { status: "LOCKED" }, { status: "ACTIVE", reason: "Lock expired" });
        fresh.failed_login_count = 0;
      } else {
        throw lockedError(fresh.locked_until, fresh.now);
      }
    }
    const good = await bcrypt.compare(ctx.body.password, u.password_hash);
    if (!good) {
      const count = fresh.failed_login_count + 1;
      if (count >= MAX_FAILED_LOGINS) {
        const r = (await one<{ locked_until: Date; now: Date }>(db,
          `UPDATE users SET failed_login_count = $3, status = 'LOCKED', locked_until = app_now($1) + make_interval(mins => $4), updated_at = app_now($1)
            WHERE sandbox_id = $1 AND id = $2 RETURNING locked_until, app_now($1) AS now`, [sb, u.id, count, LOCK_MINUTES]))!;
        await audit(db, sb, null, "USER_LOCKED", "user", u.id, { status: "ACTIVE", failedLoginCount: count - 1 }, { status: "LOCKED", failedLoginCount: count });
        await notify(db, sb, u.id, "SECURITY", "Sign-in locked", `Your sign-in was locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} failed attempts.`);
        // Commit the lock, then report it.
        return { status: 401, ...lockResult(lockedError(r.locked_until, r.now), ctx.path) };
      }
      await db.query("UPDATE users SET failed_login_count = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, u.id, count]);
      return { status: 401, ...lockResult(invalid(), ctx.path, { attemptsRemaining: MAX_FAILED_LOGINS - count }) };
    }
    await db.query("UPDATE users SET failed_login_count = 0, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, u.id]);
    const code = randomDigits(6);
    const mfaToken = randomToken(24);
    await db.query(
      `INSERT INTO otp_codes (sandbox_id, user_id, purpose, code_hash, token_hash, expires_at, created_at)
       VALUES ($1, $2, 'LOGIN', $3, $4, app_now($1) + make_interval(mins => $5), app_now($1))`,
      [sb, u.id, sha256(code), sha256(mfaToken), OTP_TTL_MINUTES]);
    await sendMail(db, sb, email, "OTP", "Your Ice Bank sign-in code",
      `Your one-time sign-in code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Never share this code with anyone.`, { otpCode: code });
    return ok({ mfaRequired: true, mfaToken, expiresIn: OTP_TTL_MINUTES * 60, delivery: "Ice Mail" });
  });
});

/** A problem body returned as a normal result, so the transaction still commits (failed-login counters). */
function lockResult(e: ApiError, path: string, extra: Record<string, unknown> = {}) {
  return {
    headers: { "Content-Type": "application/problem+json" },
    body: { type: e.type, title: e.title, status: e.status, detail: e.detail, instance: path, code: e.code, ...e.extra, ...extra },
  };
}

export const verifyMfa = route({ auth: "none", body: MfaBody, rate: "login" }, async (ctx) => {
  return tx(async (db) => {
    const otp = await one<{ sandbox_id: number; id: number; user_id: number; code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null; now: Date }>(db,
      `SELECT sandbox_id, id, user_id, code_hash, attempts, expires_at, consumed_at, app_now(sandbox_id) AS now
         FROM otp_codes WHERE token_hash = $1 AND purpose = 'LOGIN' FOR UPDATE`, [sha256(ctx.body.mfaToken)]);
    if (!otp || otp.consumed_at) throw unauthorized("The sign-in session is invalid. Start again from the login step.", "MFA_TOKEN_INVALID");
    const sb = otp.sandbox_id;
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw unauthorized("Too many incorrect codes. Start again from the login step.", "OTP_ATTEMPTS_EXCEEDED");
    if (otp.expires_at <= otp.now) throw unauthorized("The code has expired. Start again from the login step.", "OTP_EXPIRED");
    if (sha256(ctx.body.code) !== otp.code_hash) {
      const attempts = otp.attempts + 1;
      await db.query("UPDATE otp_codes SET attempts = $3 WHERE sandbox_id = $1 AND id = $2", [sb, otp.id, attempts]);
      const remaining = OTP_MAX_ATTEMPTS - attempts;
      const e = remaining > 0
        ? unauthorized(`The code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`, "OTP_INVALID")
        : unauthorized("Too many incorrect codes. Start again from the login step.", "OTP_ATTEMPTS_EXCEEDED");
      return { status: 401, ...lockResult(e, ctx.path, { attemptsRemaining: remaining }) };
    }
    await db.query("UPDATE otp_codes SET consumed_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, otp.id]);
    const user = (await one<{ status: string }>(db, "SELECT status FROM users WHERE sandbox_id = $1 AND id = $2", [sb, otp.user_id]))!;
    if (user.status !== "ACTIVE") throw new ApiError(401, "ACCOUNT_LOCKED", "Your sign-in is locked. Please contact Ice Bank.");
    await db.query("UPDATE users SET last_login_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, otp.user_id]);
    const s = await issueSession(db, sb, otp.user_id);
    await notify(db, sb, otp.user_id, "LOGIN", "New sign-in", "You signed in to Ice Bank Online Banking. If this wasn't you, change your password.");
    await audit(db, sb, otp.user_id, "LOGIN", "user", otp.user_id, null, { sessionId: s.sessionId });
    return { status: 200, body: s.body, cookies: s.cookies };
  });
});

export const refresh = route({ auth: "none", body: RefreshBody, rate: "login" }, async (ctx) => {
  const token = ctx.body.refreshToken ?? ctx.req.cookies.get("ib_rt")?.value;
  if (!token) throw validation([{ field: "refreshToken", message: "is required" }]);
  return tx(async (db) => {
    const r = await one<{ sandbox_id: number; id: number; user_id: number; session_id: string; revoked_at: Date | null; expires_at: Date; now: Date }>(db,
      `SELECT sandbox_id, id, user_id, session_id, revoked_at, expires_at, app_now(sandbox_id) AS now
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [sha256(token)]);
    const bad = () => unauthorized("The refresh token is invalid, expired or has been revoked.", "INVALID_REFRESH_TOKEN");
    if (!r) throw bad();
    if (r.revoked_at) {
      // Reuse of a rotated token: end the whole session.
      await db.query("UPDATE refresh_tokens SET revoked_at = app_now($1) WHERE sandbox_id = $1 AND session_id = $2 AND revoked_at IS NULL", [r.sandbox_id, r.session_id]);
      return { status: 401, ...lockResult(bad(), ctx.path), cookies: clearCookies };
    }
    if (r.expires_at <= r.now) throw bad();
    const u = (await one<{ status: string }>(db, "SELECT status FROM users WHERE sandbox_id = $1 AND id = $2", [r.sandbox_id, r.user_id]))!;
    if (u.status !== "ACTIVE") throw bad();
    await db.query("UPDATE refresh_tokens SET revoked_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [r.sandbox_id, r.id]);
    const s = await issueSession(db, r.sandbox_id, r.user_id, r.session_id);
    return { status: 200, body: s.body, cookies: s.cookies };
  });
});

export const logout = route({ auth: "user" }, async (ctx) => {
  const u = ctx.user!;
  await tx(async (db) => {
    await db.query("UPDATE refresh_tokens SET revoked_at = app_now($1) WHERE sandbox_id = $1 AND session_id = $2 AND revoked_at IS NULL", [u.sandboxId, u.sessionId]);
    await audit(db, u.sandboxId, u.userId, "LOGOUT", "user", u.userId, null, { sessionId: u.sessionId });
  });
  return noContent(clearCookies);
});

export const forgotPassword = route({ auth: "none", body: ForgotBody, rate: "login" }, async (ctx) => {
  const email = normaliseEmail(ctx.body.email);
  const u = await findLoginUser(ctx, email);
  if (u) {
    await tx(async (db) => {
      const token = randomToken(24);
      await db.query(
        `INSERT INTO password_reset_tokens (sandbox_id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, app_now($1) + make_interval(mins => $4), app_now($1))`, [u.sandbox_id, u.id, sha256(token), RESET_TTL_MINUTES]);
      const link = `/reset-password?token=${token}`;
      await sendMail(db, u.sandbox_id, email, "PASSWORD_RESET", "Reset your Ice Bank password",
        `We received a request to reset your password. Use this link within ${RESET_TTL_MINUTES} minutes: http://localhost:3000${link}\nIf you did not ask for this, ignore this email.`,
        { link });
    });
  }
  return accepted({ message: "If an account exists for this email, we sent a password reset link to Ice Mail." });
});

export const resetPassword = route({ auth: "none", body: ResetBody, rate: "login" }, async (ctx) => {
  const errors = passwordFieldErrors(ctx.body.newPassword, "newPassword");
  if (errors.length) throw validation(errors);
  return tx(async (db) => {
    const t = await one<{ sandbox_id: number; id: number; user_id: number; used_at: Date | null; expires_at: Date; now: Date }>(db,
      `SELECT sandbox_id, id, user_id, used_at, expires_at, app_now(sandbox_id) AS now FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE`,
      [sha256(ctx.body.token)]);
    if (!t || t.used_at || t.expires_at <= t.now) throw rule("RESET_TOKEN_INVALID", "This reset link is invalid, expired or already used. Ask for a new one.");
    await changePassword(db, t.sandbox_id, t.user_id, ctx.body.newPassword);
    await db.query("UPDATE password_reset_tokens SET used_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [t.sandbox_id, t.id]);
    return noContent();
  });
});

/** Shared by reset and PUT /me/password. Enforces "not one of the last 3". Signs out every session. */
export async function changePassword(db: Db, sb: number, userId: number, newPassword: string, keepSession?: string) {
  const history = (await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM password_history WHERE sandbox_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT 3", [sb, userId])).rows;
  for (const h of history) {
    if (await bcrypt.compare(newPassword, h.password_hash)) throw rule("PASSWORD_REUSED", "The new password cannot be one of your last 3 passwords.");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.query("UPDATE users SET password_hash = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, userId, hash]);
  await db.query("INSERT INTO password_history (sandbox_id, user_id, password_hash, created_at) VALUES ($1, $2, $3, app_now($1))", [sb, userId, hash]);
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = app_now($1) WHERE sandbox_id = $1 AND user_id = $2 AND revoked_at IS NULL AND session_id IS DISTINCT FROM $3",
    [sb, userId, keepSession ?? null]);
  await audit(db, sb, userId, "PASSWORD_CHANGED", "user", userId, null, null);
  await notify(db, sb, userId, "SECURITY", "Password changed", "Your Ice Bank password was changed. If this wasn't you, contact us right away.");
}
