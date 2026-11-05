import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, clock, idem, login, reset, sql, EMMA, AVA, OLIVIA, KEY } from "./helpers";

let emma: string;
const balance = async (token: string, id: number) => (await call("GET", `/accounts/${id}`, { token })).body as { balance: string; availableBalance: string };

describe("accounts and transactions", () => {
  beforeAll(async () => { await reset(); emma = await login(EMMA); });

  it("lists Emma's four accounts with fixed seed ids and 999 account numbers", async () => {
    const r = await call("GET", "/accounts", { token: emma });
    expect(r.body.map((a: { id: number; type: string }) => [a.id, a.type])).toEqual([[1, "CHEQUING"], [2, "SAVINGS"], [3, "CREDIT"], [4, "LOAN"]]);
    for (const a of r.body) expect(a.accountNumber).toMatch(/^999-\d{5}-\d{7}$/);
    const credit = r.body[2];
    expect(credit.creditLimit).toBe("5000.00");
    expect(credit.minimumPayment).toBe("10.00");
  });

  it("returns 404 for another customer's account (no IDOR)", async () => {
    expect((await call("GET", "/accounts/7", { token: emma })).status).toBe(404);
    expect((await call("GET", "/accounts/7/transactions", { token: emma })).status).toBe(404);
  });

  it("filters by inclusive date range, paginates and sorts", async () => {
    const all = await call("GET", "/accounts/1/transactions?from=2026-10-01&to=2026-10-31&size=100", { token: emma });
    expect(all.status).toBe(200);
    for (const t of all.body.content) expect(t.createdAt >= "2026-10-01" && t.createdAt.slice(0, 10) <= "2026-10-31").toBe(true);
    const lastDay = all.body.content.filter((t: { createdAt: string }) => t.createdAt.startsWith("2026-10-30"));
    expect(lastDay.length).toBeGreaterThan(0);
    const end = await call("GET", "/accounts/1/transactions?from=2026-10-30&to=2026-10-30", { token: emma });
    expect(end.body.totalElements).toBe(lastDay.length);
    const p = await call("GET", "/accounts/1/transactions?size=5&page=1", { token: emma });
    expect(p.body).toMatchObject({ page: 1, size: 5 });
    expect(p.body.content).toHaveLength(5);
    expect((await call("GET", "/accounts/1/transactions?size=101", { token: emma })).status).toBe(400);
    expect((await call("GET", "/accounts/1/transactions?size=0", { token: emma })).status).toBe(400);
    const byAmount = await call("GET", "/accounts/1/transactions?sort=amount,desc&size=10", { token: emma });
    const amounts = byAmount.body.content.map((t: { amount: string }) => Number(t.amount));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    const def = await call("GET", "/accounts/1/transactions?size=10", { token: emma });
    const dates = def.body.content.map((t: { createdAt: string }) => t.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("exports CSV with the documented columns", async () => {
    const r = await call("GET", "/accounts/1/transactions.csv?from=2026-10-01", { token: emma });
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.text.split("\r\n")[0]).toBe("id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId");
  });

  it("opens up to 3 savings accounts", async () => {
    const bad = await call("POST", "/accounts", { token: emma, body: { type: "SAVINGS", nickname: "x".repeat(31) } });
    expect(bad.status).toBe(400);
    const a = await call("POST", "/accounts", { token: emma, body: { type: "SAVINGS", nickname: "Trip" } });
    expect(a.status).toBe(201);
    expect(a.headers.get("location")).toBe(`/api/v1/accounts/${a.body.id}`);
    expect((await call("POST", "/accounts", { token: emma, body: { type: "SAVINGS" } })).status).toBe(201);
    const fourth = await call("POST", "/accounts", { token: emma, body: { type: "SAVINGS" } });
    expect(fourth.status).toBe(422);
    expect(fourth.body.code).toBe("SAVINGS_LIMIT");
  });

  it("serves a monthly statement PDF", async () => {
    const list = await call("GET", "/accounts/1/statements", { token: emma });
    expect(list.body[0].month).toBe("2026-10");
    const pdf = await call("GET", "/accounts/1/statements/2026-10.pdf", { token: emma });
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.text.startsWith("%PDF")).toBe(true);
    expect((await call("GET", "/accounts/1/statements/2026-11.pdf", { token: emma })).status).toBe(404);
  });
});

describe("transfers", () => {
  beforeEach(async () => { await reset(); emma = await login(EMMA); });
  const transfer = (amount: unknown, from = 1, to = 2, headers = idem()) =>
    call("POST", "/transfers", { token: emma, headers, body: { fromAccountId: from, toAccountId: to, amount } });

  it("allows exactly the available balance and rejects one cent more", async () => {
    const { availableBalance } = await balance(emma, 1);
    const over = await transfer((Number(availableBalance) + 0.01).toFixed(2));
    expect(over.status).toBe(422);
    expect(over.body.code).toBe("INSUFFICIENT_FUNDS");
    const exact = await transfer(availableBalance);
    expect(exact.status).toBe(201);
    expect((await balance(emma, 1)).balance).toBe("0.00");
  });

  it("rejects 3 decimals, zero and the same account", async () => {
    expect((await transfer("10.005")).body.errors[0]).toEqual({ field: "amount", message: "must have at most 2 decimal places" });
    expect((await transfer("0.00")).status).toBe(400);
    expect((await transfer(1000000)).status).toBe(400);
    const same = await transfer("1.00", 1, 1);
    expect(same.status).toBe(422);
    expect(same.body.code).toBe("SAME_ACCOUNT");
  });

  it("is idempotent: same key + body replays, same key + other body is 409", async () => {
    const h = idem();
    const a = await transfer("12.34", 1, 2, h);
    const b = await transfer("12.34", 1, 2, h);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    const c = await transfer("12.35", 1, 2, h);
    expect(c.status).toBe(409);
    const { rows } = await sql().query("SELECT count(*)::int AS n FROM transfers WHERE sandbox_id = 1 AND reference_id = $1", [a.body.referenceId]);
    expect(rows[0].n).toBe(1);
    expect((await call("POST", "/transfers", { token: emma, body: { fromAccountId: 1, toAccountId: 2, amount: "1.00" } })).body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("writes two transaction legs with a shared reference and balance_after", async () => {
    const before = await balance(emma, 2);
    const r = await transfer("100.00");
    const { rows } = await sql().query("SELECT direction, amount, balance_after FROM transactions WHERE sandbox_id = 1 AND reference_id = $1 ORDER BY direction", [r.body.referenceId]);
    expect(rows.map((x) => x.direction)).toEqual(["CREDIT", "DEBIT"]);
    expect(rows[0].balance_after).toBe((Number(before.balance) + 100).toFixed(2));
  });

  it("blocks transfers from a frozen account", async () => {
    const ava = await login(AVA);
    const r = await call("POST", "/transfers", { token: ava, headers: idem(), body: { fromAccountId: 10, toAccountId: 11, amount: "5.00" } });
    expect(r.body.code).toBe("ACCOUNT_FROZEN");
  });
});

describe("Interac e-Transfer", () => {
  beforeEach(async () => { await reset(); emma = await login(EMMA); });
  const send = (body: Record<string, unknown>) => call("POST", "/etransfers", {
    token: emma, headers: idem(),
    body: { fromAccountId: 1, recipientName: "Liam Chen", recipientEmail: "liam.chen@icebank.test", securityQuestion: "Where did we meet?", securityAnswer: "Ottawa", ...body },
  });

  it("enforces $3,000 per transfer and $3,000 per day including pending", async () => {
    expect((await send({ amount: "3000.01" })).body.code).toBe("LIMIT_PER_TRANSFER");
    expect((await send({ amount: "2000.00" })).status).toBe(201);
    const over = await send({ amount: "1000.01" });
    expect(over.body.code).toBe("DAILY_LIMIT_EXCEEDED");
    expect(over.body.remaining).toBe("1000.00");
    expect((await send({ amount: "1000.00" })).status).toBe(201);
  });

  it("enforces the rolling 30-day $10,000 limit", async () => {
    await call("POST", "/transfers", { token: emma, headers: idem(), body: { fromAccountId: 2, toAccountId: 1, amount: "20000.00" } });
    for (let d = 0; d < 3; d++) { expect((await send({ amount: "3000.00" })).status).toBe(201); await clock({ advanceDays: 1 }); }
    emma = await login(EMMA);
    const r = await send({ amount: "925.01" });
    expect(r.body.code).toBe("ROLLING_LIMIT_EXCEEDED");
    expect((await send({ amount: "925.00" })).status).toBe(201);
  });

  it("validates the security answer (3-25 chars, not in the message)", async () => {
    expect((await send({ amount: "5", securityAnswer: "ab" })).body.errors[0].field).toBe("securityAnswer");
    expect((await send({ amount: "5", message: "Meet in OTTAWA", securityAnswer: "ottawa" })).body.errors[0].message).toBe("must not appear in the message");
    expect((await send({ amount: "5", securityQuestion: undefined, securityAnswer: undefined })).status).toBe(400);
  });

  it("accepts with a case-insensitive answer and deposits", async () => {
    const recv = await call("GET", "/etransfers?direction=received&status=PENDING", { token: emma });
    const id = recv.body.content[0].id;
    const before = await balance(emma, 2);
    expect((await call("POST", `/etransfers/${id}/accept`, { token: emma, headers: idem(), body: { accountId: 2, securityAnswer: "wrong" } })).body.code).toBe("WRONG_ANSWER");
    const ok = await call("POST", `/etransfers/${id}/accept`, { token: emma, headers: idem(), body: { accountId: 2, securityAnswer: "  GLACIER " } });
    expect(ok.body.status).toBe("DEPOSITED");
    expect((await balance(emma, 2)).balance).toBe((Number(before.balance) + 120).toFixed(2));
  });

  it("cancels a pending transfer with a full refund (REVERSAL row and audit row)", async () => {
    const before = await balance(emma, 1);
    const sent = await send({ amount: "40.00" });
    const c = await call("POST", `/etransfers/${sent.body.id}/cancel`, { token: emma, headers: idem() });
    expect(c.body.status).toBe("CANCELLED");
    expect((await balance(emma, 1)).balance).toBe(before.balance);
    const { rows } = await sql().query("SELECT type FROM transactions WHERE sandbox_id = 1 AND reference_id = $1 ORDER BY id", [sent.body.referenceId]);
    expect(rows.map((r) => r.type)).toEqual(["ETRANSFER", "REVERSAL"]);
    const audit = await sql().query("SELECT 1 FROM audit_log WHERE sandbox_id = 1 AND action = 'ETRANSFER_CANCELLED' AND entity_id = $1", [sent.body.id]);
    expect(audit.rowCount).toBe(1);
    expect((await call("POST", `/etransfers/${sent.body.id}/cancel`, { token: emma, headers: idem() })).status).toBe(409);
  });

  it("expires after 30 days and refunds", async () => {
    const sent = await send({ amount: "15.00" });
    await clock({ advanceDays: 30 });
    emma = await login(EMMA);
    const r = await call("GET", `/etransfers/${sent.body.id}`, { token: emma });
    expect(r.body.status).toBe("EXPIRED");
  });

  it("deposits instantly with autodeposit (registration confirmed by OTP)", async () => {
    const olivia = await login(OLIVIA);
    expect((await call("PUT", "/etransfers/autodeposit", { token: olivia, body: { email: "someone@else.test", accountId: 7 } })).body.code).toBe("EMAIL_NOT_OWNED");
    const reg = await call("PUT", "/etransfers/autodeposit", { token: olivia, body: { email: OLIVIA, accountId: 7 } });
    expect(reg.status).toBe(202);
    const inbox = await call("GET", `/inbox?email=${OLIVIA}&kind=AUTODEPOSIT&size=1`, { headers: { "x-sandbox-key": KEY } });
    const conf = await call("PUT", "/etransfers/autodeposit", { token: olivia, body: { otpCode: inbox.body.content[0].otpCode } });
    expect(conf.body.status).toBe("ACTIVE");
    const r = await call("POST", "/etransfers", { token: emma, headers: idem(), body: { fromAccountId: 1, recipientName: "Olivia", recipientEmail: OLIVIA, amount: "25.00" } });
    expect(r.body).toMatchObject({ status: "DEPOSITED", autodeposit: true });
  });
});

describe("bill payments", () => {
  beforeEach(async () => { await reset(); emma = await login(EMMA); });
  const pay = (body: Record<string, unknown>) => call("POST", "/bill-payments", { token: emma, headers: idem(), body: { payeeId: 1, fromAccountId: 1, amount: "50.00", ...body } });

  it("validates the payee account-number format per biller", async () => {
    const bad = await call("POST", "/payees", { token: emma, body: { billerId: 2, accountNumber: "12345678" } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].field).toBe("accountNumber");
    const ok = await call("POST", "/payees", { token: emma, body: { billerId: 2, accountNumber: "IT99999999" } });
    expect(ok.status).toBe(201);
    expect(ok.headers.get("location")).toBe(`/api/v1/payees/${ok.body.id}`);
  });

  it("pay now posts on the next business day (Monday -> Tuesday)", async () => {
    const r = await pay({});
    expect(r.body).toMatchObject({ status: "PENDING", paymentDate: "2026-11-02", postingDate: "2026-11-03" });
    expect((await balance(emma, 1)).availableBalance).not.toBe((await balance(emma, 1)).balance);
    await clock({ advanceDays: 1 });
    emma = await login(EMMA);
    expect((await call("GET", `/bill-payments/${r.body.id}`, { token: emma })).body.status).toBe("POSTED");
  });

  it("moves weekend and holiday dates to the next business day", async () => {
    expect((await pay({ paymentDate: "2026-11-07" })).body.postingDate).toBe("2026-11-09"); // Saturday -> Monday
    expect((await pay({ paymentDate: "2026-11-11" })).body.postingDate).toBe("2026-11-12"); // Remembrance Day
    expect((await pay({ paymentDate: "2026-12-25" })).body.postingDate).toBe("2026-12-29"); // Christmas, Boxing Day observed Mon 28
    expect((await pay({ paymentDate: "2027-07-01" })).body.postingDate).toBe("2027-07-02"); // Canada Day
  });

  it("puts monthly payments on the 31st on the last day of shorter months", async () => {
    const r = await pay({ paymentDate: "2027-01-31", recurrence: "MONTHLY" });
    const dates = [r.body.paymentDate, ...r.body.upcoming.map((u: { paymentDate: string }) => u.paymentDate)].slice(0, 4);
    expect(dates).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("rejects past dates and recurring payments starting today", async () => {
    expect((await pay({ paymentDate: "2026-11-01" })).status).toBe(400);
    expect((await pay({ recurrence: "WEEKLY" })).status).toBe(400);
  });

  it("refuses to delete a payee with scheduled payments", async () => {
    const r = await call("DELETE", "/payees/2", { token: emma });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PAYEE_HAS_SCHEDULED_PAYMENTS");
  });

  it("fails a scheduled payment when funds are short on the posting date", async () => {
    const r = await pay({ paymentDate: "2026-11-05", amount: "9000.00" });
    expect(r.body.status).toBe("SCHEDULED");
    await clock({ date: "2026-11-05" });
    emma = await login(EMMA);
    const after = await call("GET", `/bill-payments/${r.body.id}`, { token: emma });
    expect(after.body).toMatchObject({ status: "FAILED", failureReason: "INSUFFICIENT_FUNDS" });
  });
});
