import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, clock, idem, login, reset, sql, EMMA, LUCAS, LIAM, TELLER } from "./helpers";
import { luhnValid } from "@/lib/validation";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const cheque = (accountId: number, amount: string, front: BlobPart = PNG, type = "image/png") => {
  const f = new FormData();
  f.set("accountId", String(accountId));
  f.set("amount", amount);
  f.set("frontImage", new File([front], "front.png", { type }));
  f.set("backImage", new File([PNG], "back.png", { type: "image/png" }));
  return f;
};

describe("cheque deposits", () => {
  let lucas: string;
  beforeEach(async () => { await reset(); lucas = await login(LUCAS); });

  it("makes the first $100 available and holds the rest until approved", async () => {
    const before = (await call("GET", "/accounts/12", { token: lucas })).body;
    const r = await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(12, "250.00") });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ amount: "250.00", immediateAmount: "100.00", heldAmount: "150.00", status: "PENDING" });
    const after = (await call("GET", "/accounts/12", { token: lucas })).body;
    expect(Number(after.balance) - Number(before.balance)).toBeCloseTo(250, 2);
    expect(Number(after.availableBalance) - Number(before.availableBalance)).toBeCloseTo(100, 2);
    const teller = await login(TELLER);
    expect((await call("POST", `/admin/deposits/${r.body.id}/approve`, { token: teller })).body.status).toBe("APPROVED");
    const done = (await call("GET", "/accounts/12", { token: lucas })).body;
    expect(Number(done.availableBalance) - Number(before.availableBalance)).toBeCloseTo(250, 2);
  });

  it("enforces the $5,000 daily limit and image rules", async () => {
    expect((await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(12, "5000.01") })).body.code).toBe("DAILY_DEPOSIT_LIMIT");
    const txt = await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(12, "10.00", "not an image", "image/png") });
    expect(txt.status).toBe(400);
    expect(txt.body.errors[0]).toEqual({ field: "frontImage", message: "must be a JPG or PNG image" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(12, "10.00", big) })).body.errors[0].message).toBe("must be 5 MB or smaller");
    // 850 already pending today? no: seeded on Oct 31. 4,000 + 1,000 = exactly 5,000 is allowed.
    expect((await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(12, "4000.00") })).status).toBe(201);
    expect((await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(13, "1000.00") })).status).toBe(201);
    expect((await call("POST", "/deposits/cheque", { token: lucas, headers: idem(), form: cheque(13, "0.01") })).status).toBe(422);
  });
});

describe("cards", () => {
  let emma: string;
  beforeAll(async () => { await reset(); emma = await login(EMMA); });

  it("locks, unlocks and changes the debit POS limit in $100 steps", async () => {
    const cards = (await call("GET", "/cards", { token: emma })).body;
    const debit = cards.find((c: { type: string }) => c.type === "DEBIT");
    expect(debit.maskedNumber).toMatch(/^\*{4} \*{4} \*{4} \d{4}$/);
    expect((await call("POST", `/cards/${debit.id}/lock`, { token: emma })).body.status).toBe("LOCKED");
    expect((await call("POST", `/cards/${debit.id}/lock`, { token: emma })).status).toBe(409);
    expect((await call("POST", `/cards/${debit.id}/unlock`, { token: emma })).body.status).toBe("ACTIVE");
    expect((await call("PATCH", `/cards/${debit.id}/limits`, { token: emma, body: { dailyPosLimit: "2550" } })).status).toBe(400);
    expect((await call("PATCH", `/cards/${debit.id}/limits`, { token: emma, body: { dailyPosLimit: "400" } })).status).toBe(400);
    expect((await call("PATCH", `/cards/${debit.id}/limits`, { token: emma, body: { dailyPosLimit: "5000.00" } })).body.dailyPosLimit).toBe("5000.00");
    const credit = cards.find((c: { type: string }) => c.type === "CREDIT");
    expect((await call("PATCH", `/cards/${credit.id}/limits`, { token: emma, body: { dailyPosLimit: "1000" } })).status).toBe(422);
  });

  it("report lost cancels the card and issues a new Luhn-valid number", async () => {
    const debit = (await call("GET", "/cards", { token: emma })).body.find((c: { type: string; status: string }) => c.type === "DEBIT" && c.status !== "CANCELLED");
    const r = await call("POST", `/cards/${debit.id}/report-lost`, { token: emma });
    expect(r.body.cancelledCard.status).toBe("CANCELLED");
    expect(r.body.newCard.last4).not.toBe(debit.last4);
    const { rows } = await sql().query("SELECT number_encrypted FROM cards WHERE sandbox_id = 1 AND id = $1", [r.body.newCard.id]);
    const { decryptCardNumber } = await import("@/lib/crypto");
    expect(luhnValid(decryptCardNumber(rows[0].number_encrypted))).toBe(true);
  });
});

describe("loans", () => {
  let emma: string;
  beforeEach(async () => { await reset(); emma = await login(EMMA); });
  const apply = (annualIncome: string, monthlyDebtPayments: string) => call("POST", "/loans/applications", {
    token: emma, body: { amount: "10000.00", termMonths: 36, purpose: "Car purchase", annualIncome, monthlyDebtPayments, disbursementAccountId: 1 },
  });

  it("decides by debt-to-income: <35 approved, 35-45 review, >45 declined", async () => {
    // payment for 10,000 over 36 months at 8.99% = 317.95; income 60,000 => 5,000 a month
    const a = await apply("60000.00", "1000.00");
    expect(a.body).toMatchObject({ status: "APPROVED", dtiPercent: "26.36", monthlyPayment: "317.95" });
    expect(a.body.loanId).toBeTruthy();
    await reset(); emma = await login(EMMA);
    const under = await apply("60000.00", "1432.04"); // 34.9998 -> 35.00 after rounding: manual review
    expect(under.body.dtiPercent).toBe("35.00");
    await reset(); emma = await login(EMMA);
    const below = await apply("60000.00", "1431.55"); // 34.99
    expect(below.body).toMatchObject({ status: "APPROVED", dtiPercent: "34.99" });
    await reset(); emma = await login(EMMA);
    const review = await apply("60000.00", "1432.05"); // exactly 35.00
    expect(review.body).toMatchObject({ status: "MANUAL_REVIEW", dtiPercent: "35.00" });
    await reset(); emma = await login(EMMA);
    const edge = await apply("60000.00", "1932.05"); // exactly 45.00
    expect(edge.body).toMatchObject({ status: "MANUAL_REVIEW", dtiPercent: "45.00" });
    await reset(); emma = await login(EMMA);
    const declined = await apply("60000.00", "1932.55"); // 45.01
    expect(declined.body).toMatchObject({ status: "DECLINED", dtiPercent: "45.01" });
  });

  it("validates amount and term ranges", async () => {
    const r = await call("POST", "/loans/applications", { token: emma, body: { amount: "999.99", termMonths: 61, purpose: "Car purchase", annualIncome: "1", monthlyDebtPayments: "0", disbursementAccountId: 1 } });
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["amount", "termMonths"]);
  });

  it("builds a schedule that sums exactly to principal + interest", async () => {
    const loans = (await call("GET", "/loans", { token: emma })).body;
    const s = (await call("GET", `/loans/${loans[0].id}/schedule`, { token: emma })).body;
    const cents = (v: string) => Math.round(Number(v) * 100);
    const principal = s.rows.reduce((t: number, r: { principal: string }) => t + cents(r.principal), 0);
    const interest = s.rows.reduce((t: number, r: { interest: string }) => t + cents(r.interest), 0);
    expect(principal).toBe(cents(s.principal));
    expect(interest).toBe(cents(s.totalInterest));
    expect(s.rows.at(-1).remainingBalance).toBe("0.00");
  });
});

describe("disputes", () => {
  let emma: string;
  beforeAll(async () => { await reset(); emma = await login(EMMA); });

  it("allows disputes up to 60 days after posting, one open per transaction", async () => {
    const { rows } = await sql().query(
      `SELECT id, (app_now(1) AT TIME ZONE 'America/Toronto')::date - (posted_at AT TIME ZONE 'America/Toronto')::date AS days
         FROM transactions WHERE sandbox_id = 1 AND account_id = 1 AND direction = 'DEBIT' AND status = 'POSTED' ORDER BY posted_at DESC`);
    const d60 = rows.find((r) => r.days === 60) ?? rows.find((r) => r.days <= 60);
    const d61 = rows.find((r) => r.days > 60);
    const ok = await call("POST", "/disputes", { token: emma, body: { transactionId: d60.id, reason: "DUPLICATE" } });
    expect(ok.status).toBe(201);
    expect((await call("POST", "/disputes", { token: emma, body: { transactionId: d60.id, reason: "OTHER" } })).status).toBe(409);
    const late = await call("POST", "/disputes", { token: emma, body: { transactionId: d61.id, reason: "DUPLICATE" } });
    expect(late.body.code).toBe("DISPUTE_WINDOW_CLOSED");
    expect((await call("POST", "/disputes", { token: emma, body: { transactionId: 999999, reason: "OTHER" } })).status).toBe(404);
  });
});

describe("admin portal", () => {
  beforeEach(reset);

  it("is closed to customers", async () => {
    const emma = await login(EMMA);
    expect((await call("GET", "/admin/customers", { token: emma })).status).toBe(403);
  });

  it("unlocks a locked user and freezes an account (which blocks transfers)", async () => {
    const teller = await login(TELLER);
    expect((await call("POST", "/admin/users/2/unlock", { token: teller })).body).toEqual({ userId: 2, status: "ACTIVE", failedLoginCount: 0 });
    await login(LIAM);
    expect((await call("POST", "/admin/accounts/1/freeze", { token: teller, body: { reason: "Fraud check" } })).body.status).toBe("FROZEN");
    const emma = await login(EMMA);
    expect((await call("POST", "/transfers", { token: emma, headers: idem(), body: { fromAccountId: 1, toAccountId: 2, amount: "1.00" } })).body.code).toBe("ACCOUNT_FROZEN");
    expect((await call("POST", "/admin/accounts/1/freeze", { token: teller, body: { reason: "Again" } })).status).toBe(409);
    const log = await call("GET", "/admin/audit-log?action=ACCOUNT_FROZEN", { token: teller });
    expect(log.body.content[0]).toMatchObject({ entityType: "account", entityId: 1, actorEmail: TELLER });
  });

  it("decides a loan in manual review", async () => {
    const teller = await login(TELLER);
    const r = await call("POST", "/admin/loans/2/decision", { token: teller, body: { decision: "APPROVED", reason: "Verified income" } });
    expect(r.body).toMatchObject({ status: "APPROVED", decisionSource: "ADMIN" });
    expect((await call("POST", "/admin/loans/2/decision", { token: teller, body: { decision: "DECLINED", reason: "Changed mind" } })).status).toBe(409);
  });
});

describe("clock-driven work", () => {
  beforeEach(reset);

  it("pays monthly savings interest and collects loan installments", async () => {
    await clock({ date: "2026-12-02" });
    const emma = await login(EMMA);
    const interest = await call("GET", "/accounts/2/transactions?type=INTEREST&size=1", { token: emma });
    expect(interest.body.content[0].createdAt.startsWith("2026-12")).toBe(true);
    const loan = (await call("GET", "/loans", { token: emma })).body[0];
    expect(loan.paymentsMade).toBe(19);
  });

  it("never moves backwards", async () => {
    const r = await call("POST", "/test/clock", { headers: { "x-sandbox-key": "ICEBANK-LOCAL-KEY" }, body: { date: "2026-01-01" } });
    expect(r.status).toBe(422);
    expect((await call("POST", "/test/clock", { headers: { "x-sandbox-key": "nope" }, body: { advanceDays: 1 } })).status).toBe(401);
  });
});
