import { beforeAll, describe, expect, it } from "vitest";
import { call, clock, latestOtp, login, reset, KEY, EMMA, LIAM, NOAH, PASSWORD } from "./helpers";

const validRegistration = (over: Record<string, unknown> = {}) => ({
  firstName: "Maya", lastName: "Fraser", dateOfBirth: "1996-08-21", email: `maya.${Date.now()}@icebank.test`, phone: "(416) 555-0199",
  addressLine1: "200 Bay Street", city: "Toronto", province: "ON", postalCode: "M5J 2T3", sin: "193 746 286", password: "Glacier#2026", ...over,
});

describe("auth and security", () => {
  beforeAll(reset);

  it("signs in with password + OTP from Ice Mail and returns tokens", async () => {
    const r = await call("POST", "/auth/login", { body: { email: EMMA, password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mfaRequired: true, expiresIn: 300 });
    const v = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r.body.mfaToken, code: await latestOtp(EMMA) } });
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ tokenType: "Bearer", expiresIn: 900 });
    expect(v.headers.get("x-request-id")).toBeTruthy();
    const me = await call("GET", "/me", { token: v.body.accessToken });
    expect(me.body.email).toBe(EMMA);
  });

  it("locks the user on the 5th failed login, for 15 minutes", async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await call("POST", "/auth/login", { body: { email: NOAH, password: "Wrong#123" } });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe("INVALID_CREDENTIALS");
    }
    const fifth = await call("POST", "/auth/login", { body: { email: NOAH, password: "Wrong#123" } });
    expect(fifth.body.code).toBe("ACCOUNT_LOCKED");
    const right = await call("POST", "/auth/login", { body: { email: NOAH, password: PASSWORD } });
    expect(right.status).toBe(401);
    expect(right.body.code).toBe("ACCOUNT_LOCKED");
    await clock({ advanceMinutes: 16 });
    const later = await call("POST", "/auth/login", { body: { email: NOAH, password: PASSWORD } });
    expect(later.status).toBe(200);
  });

  it("keeps Liam locked until an admin unlocks him", async () => {
    const r = await call("POST", "/auth/login", { body: { email: LIAM, password: PASSWORD } });
    expect(r.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("rejects an expired OTP and allows only 3 attempts", async () => {
    const r1 = await call("POST", "/auth/login", { body: { email: EMMA, password: PASSWORD } });
    const code = await latestOtp(EMMA);
    await clock({ advanceMinutes: 6 });
    const expired = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r1.body.mfaToken, code } });
    expect(expired.body.code).toBe("OTP_EXPIRED");

    const r2 = await call("POST", "/auth/login", { body: { email: EMMA, password: PASSWORD } });
    const good = await latestOtp(EMMA);
    const bad = good === "000000" ? "111111" : "000000";
    const a1 = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r2.body.mfaToken, code: bad } });
    expect(a1.body).toMatchObject({ code: "OTP_INVALID", attemptsRemaining: 2 });
    await call("POST", "/auth/mfa/verify", { body: { mfaToken: r2.body.mfaToken, code: bad } });
    const a3 = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r2.body.mfaToken, code: bad } });
    expect(a3.body.code).toBe("OTP_ATTEMPTS_EXCEEDED");
    const after = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r2.body.mfaToken, code: good } });
    expect(after.status).toBe(401);
  });

  it("rotates refresh tokens and revokes them on logout", async () => {
    const r = await call("POST", "/auth/login", { body: { email: EMMA, password: PASSWORD } });
    const v = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r.body.mfaToken, code: await latestOtp(EMMA) } });
    const rt1 = v.body.refreshToken;
    const ref = await call("POST", "/auth/refresh", { body: { refreshToken: rt1 } });
    expect(ref.status).toBe(200);
    const reuse = await call("POST", "/auth/refresh", { body: { refreshToken: rt1 } });
    expect(reuse.status).toBe(401);
    const t2 = await login(EMMA);
    const v2 = await call("POST", "/auth/logout", { token: t2 });
    expect(v2.status).toBe(204);
    expect((await call("GET", "/me", { token: t2 })).status).toBe(401);
  });

  it("validates registration fields and the password rules", async () => {
    const r = await call("POST", "/auth/register", { body: validRegistration({ postalCode: "12345", phone: "4165550199", sin: "123456789", password: "password1" }) });
    expect(r.status).toBe(400);
    const fields = r.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["postalCode", "phone", "sin"]));
    const pw = await call("POST", "/auth/register", { body: validRegistration({ password: "Password1" }) });
    expect(pw.body.errors).toEqual([{ field: "password", message: "must contain a special character" }]);
  });

  it("registers an adult, rejects under-18 and duplicate emails", async () => {
    const body = validRegistration();
    const ok = await call("POST", "/auth/register", { body });
    expect(ok.status).toBe(201);
    expect(ok.headers.get("location")).toBe("/api/v1/me");
    expect(ok.body.accounts[0].type).toBe("CHEQUING");
    const dup = await call("POST", "/auth/register", { body: { ...body, email: body.email.toUpperCase() } });
    expect(dup.status).toBe(409);
    const clockNow = await call("GET", "/test/clock", { headers: { "x-sandbox-key": KEY } });
    const today: string = clockNow.body.today;
    const almost18 = `${Number(today.slice(0, 4)) - 18}${today.slice(4, 8)}${String(Number(today.slice(8)) + 1).padStart(2, "0")}`;
    const young = await call("POST", "/auth/register", { body: validRegistration({ dateOfBirth: almost18 }) });
    expect(young.status).toBe(422);
    expect(young.body.code).toBe("UNDERAGE");
  });

  it("resets a password once with a 30-minute link and blocks the last 3 passwords", async () => {
    const f = await call("POST", "/auth/password/forgot", { body: { email: NOAH } });
    expect(f.status).toBe(202);
    const inbox = await call("GET", `/inbox?email=${NOAH}&kind=PASSWORD_RESET`, { headers: { "x-sandbox-key": KEY } });
    const token = new URL("http://x" + inbox.body.content[0].link).searchParams.get("token")!;
    const reuse = await call("POST", "/auth/password/reset", { body: { token, newPassword: PASSWORD } });
    expect(reuse.body.code).toBe("PASSWORD_REUSED");
    const ok = await call("POST", "/auth/password/reset", { body: { token, newPassword: "Frosty#2027" } });
    expect(ok.status).toBe(204);
    const again = await call("POST", "/auth/password/reset", { body: { token, newPassword: "Frosty#2028" } });
    expect(again.body.code).toBe("RESET_TOKEN_INVALID");
    const f2 = await call("POST", "/auth/password/forgot", { body: { email: NOAH } });
    expect(f2.status).toBe(202);
    const inbox2 = await call("GET", `/inbox?email=${NOAH}&kind=PASSWORD_RESET&size=1`, { headers: { "x-sandbox-key": KEY } });
    const t2 = new URL("http://x" + inbox2.body.content[0].link).searchParams.get("token")!;
    await clock({ advanceMinutes: 31 });
    const late = await call("POST", "/auth/password/reset", { body: { token: t2, newPassword: "Frosty#2029" } });
    expect(late.body.code).toBe("RESET_TOKEN_INVALID");
  });

  it("returns RFC 7807 errors and X-Request-Id", async () => {
    const malformed = await call("POST", "/auth/login", { rawBody: "{bad" });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("content-type")).toContain("application/problem+json");
    expect(malformed.body).toMatchObject({ status: 400, code: "MALFORMED_JSON", instance: "/api/v1/auth/login" });
    expect(malformed.headers.get("x-request-id")).toBeTruthy();
    const nf = await call("GET", "/does-not-exist");
    expect(nf.status).toBe(404);
    expect((await call("GET", "/accounts")).status).toBe(401);
  });
});
