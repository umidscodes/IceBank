/** Personal loans: deterministic decision by debt-to-income, amortization schedule. */
import { z, doc, Money, DateStr, DateTimeStr, Id, IdParam, moneyInput, registry } from "../openapi/registry";
import { route, ok, created } from "../http/handler";
import { query, tx, one, type Db } from "../db/pool";
import { intParam } from "../http/params";
import { conflict, notFound, rule } from "../errors";
import { customerId, audit, notifyCustomer, today as todayOf } from "../services/common";
import { createAccount } from "../services/provision";
import { formatCents, money } from "@/lib/money";
import { isoOffset } from "@/lib/dates";
import { amortizationSchedule, monthlyPayment, dtiBasisPoints, decide, firstPaymentDate, LOAN_APR, LOAN_MIN, LOAN_MAX } from "@/lib/loans";
import { ownedAccount } from "./accounts";

const PURPOSES = ["Car purchase", "Home renovation", "Debt consolidation", "Education", "Vacation", "Wedding", "Medical", "Other"] as const;

const ApplyBody = z.object({
  amount: moneyInput({ min: LOAN_MIN, max: LOAN_MAX, example: "15000.00", description: "$1,000.00 to $50,000.00" }),
  termMonths: z.number({ error: "is required and must be a number" }).int("must be a whole number of months").min(12, "must be 12 to 60 months").max(60, "must be 12 to 60 months").openapi({ example: 48 }),
  purpose: z.enum(PURPOSES, { error: `must be one of: ${PURPOSES.join(", ")}` }).openapi({ example: "Home renovation" }),
  annualIncome: moneyInput({ min: 1n, max: 99999999999n, example: "62000.00", description: "Gross yearly income" }),
  monthlyDebtPayments: moneyInput({ min: 0n, max: 9999999999n, example: "1500.00", description: "Existing monthly debt payments (rent/mortgage, car, cards)" }),
  disbursementAccountId: z.number({ error: "is required and must be a number" }).int().positive().openapi({ example: 1, description: "Your chequing account that receives the money and pays the installments" }),
});

const AppSchema = registry.register("LoanApplication", z.object({
  id: Id, amount: Money, termMonths: z.number().int(), purpose: z.string(), annualIncome: Money, monthlyDebtPayments: Money,
  apr: z.string().openapi({ example: "8.99" }), monthlyPayment: Money, dtiPercent: z.string().openapi({ example: "36.26" }),
  status: z.enum(["APPROVED", "MANUAL_REVIEW", "DECLINED"]), decisionSource: z.enum(["AUTOMATIC", "ADMIN"]), decisionReason: z.string().nullable(),
  disbursementAccountId: Id, loanId: Id.nullable(), createdAt: DateTimeStr, decidedAt: DateTimeStr.nullable(),
}));
const LoanSchema = registry.register("Loan", z.object({
  id: Id, applicationId: Id, accountId: Id, principal: Money, apr: z.string(), termMonths: z.number().int(), monthlyPayment: Money,
  totalInterest: Money, balanceOwing: Money, firstPaymentDate: DateStr, nextPaymentDate: DateStr.nullable(), paymentsMade: z.number().int(),
  status: z.enum(["ACTIVE", "PAID_OFF"]), createdAt: DateTimeStr,
}));
const RowSchema = z.object({
  installmentNo: z.number().int(), dueDate: DateStr, payment: Money, principal: Money, interest: Money, remainingBalance: Money,
  status: z.enum(["DUE", "PAID", "MISSED"]), paidAt: DateTimeStr.nullable(),
});

doc({
  method: "post", path: "/loans/applications", tag: "Loans", summary: "Apply for a personal loan", auth: "bearer", body: ApplyBody,
  description: "APR 8.99%. Monthly payment = P*r/(1-(1+r)^-n), r = APR/12, rounded to the cent. DTI % = (monthlyDebtPayments + new payment) / (annualIncome / 12) * 100, " +
    "rounded to 2 decimals. Decision: DTI under 35.00 APPROVED (loan created and money deposited at once); 35.00 to 45.00 MANUAL_REVIEW; over 45.00 DECLINED. " +
    "Only one application can be in review at a time (409 APPLICATION_IN_REVIEW).",
  bodyExample: { amount: "15000.00", termMonths: 48, purpose: "Home renovation", annualIncome: "62000.00", monthlyDebtPayments: "1500.00", disbursementAccountId: 12 },
  responses: { 201: { schema: AppSchema, description: "Application decided", headers: { Location: "/api/v1/loans/applications/{id}" } } },
  errors: { 404: "Account not found.", 409: "You already have an application in review.", 422: "Loans can only be paid into a chequing account." },
});
doc({ method: "get", path: "/loans/applications", tag: "Loans", summary: "List my loan applications (newest first)", auth: "bearer",
  responses: { 200: { schema: z.array(AppSchema), description: "Applications" } } });
doc({ method: "get", path: "/loans/applications/{id}", tag: "Loans", summary: "Get a loan application", auth: "bearer", params: IdParam,
  responses: { 200: { schema: AppSchema, description: "Application" } }, errors: { 404: "Loan application not found." } });
doc({ method: "get", path: "/loans", tag: "Loans", summary: "List my loans", auth: "bearer", responses: { 200: { schema: z.array(LoanSchema), description: "Loans" } } });
doc({ method: "get", path: "/loans/{id}/schedule", tag: "Loans", summary: "Amortization schedule", auth: "bearer", params: IdParam,
  description: "Rows sum exactly to principal + total interest; the last row absorbs rounding.",
  responses: { 200: { schema: z.object({ loanId: Id, principal: Money, totalInterest: Money, totalPaid: Money, rows: z.array(RowSchema) }), description: "Schedule" } },
  errors: { 404: "Loan not found." } });

export function appView(a: Record<string, unknown>) {
  return {
    id: Number(a.id), amount: money(String(a.amount)), termMonths: Number(a.term_months), purpose: String(a.purpose),
    annualIncome: money(String(a.annual_income)), monthlyDebtPayments: money(String(a.monthly_debt_payments)),
    apr: (Number(a.apr) * 100).toFixed(2), monthlyPayment: money(String(a.monthly_payment)), dtiPercent: Number(a.dti_percent).toFixed(2),
    status: String(a.status), decisionSource: String(a.decision_source), decisionReason: (a.decision_reason as string | null) ?? null,
    disbursementAccountId: Number(a.disbursement_account_id), loanId: a.loan_id === null ? null : Number(a.loan_id),
    createdAt: isoOffset(a.created_at as Date)!, decidedAt: isoOffset(a.decided_at as Date | null),
  };
}

/** Create the loan account, disburse the money and write the schedule. */
export async function fundLoan(db: Db, sb: number, appId: number) {
  const a = (await one<{ customer_id: number; amount: string; term_months: number; disbursement_account_id: number; monthly_payment: string }>(db,
    "SELECT * FROM loan_applications WHERE sandbox_id = $1 AND id = $2", [sb, appId]))!;
  const today = await todayOf(db, sb);
  const first = firstPaymentDate(today);
  const principal = BigInt(Math.round(Number(a.amount) * 100));
  const rows = amortizationSchedule(principal, a.term_months, first);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0n);
  const accountId = await createAccount(db, sb, a.customer_id, "LOAN");
  const loan = (await one<{ id: number }>(db,
    `INSERT INTO loans (sandbox_id, customer_id, application_id, account_id, principal, apr, term_months, monthly_payment, total_interest, first_payment_date, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', app_now($1)) RETURNING id`,
    [sb, a.customer_id, appId, accountId, a.amount, LOAN_APR, a.term_months, a.monthly_payment, formatCents(totalInterest), first]))!;
  for (const r of rows) {
    await db.query(`INSERT INTO loan_schedule (sandbox_id, loan_id, installment_no, due_date, payment, principal, interest, remaining_balance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sb, loan.id, r.installmentNo, r.dueDate, formatCents(r.payment), formatCents(r.principal), formatCents(r.interest), formatCents(r.remainingBalance)]);
  }
  const ref = `LON-${loan.id}`;
  await db.query("SELECT post_entry($1, $2, 'DEBIT', $3, 'LOAN_DISBURSEMENT', 'Loan disbursement', $4)", [sb, accountId, a.amount, ref]);
  await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'LOAN_DISBURSEMENT', 'Personal loan disbursement', $4)", [sb, a.disbursement_account_id, a.amount, ref]);
  await db.query("UPDATE loan_applications SET loan_id = $3 WHERE sandbox_id = $1 AND id = $2", [sb, appId, loan.id]);
  await notifyCustomer(db, sb, a.customer_id, "LOAN", "Loan approved", `Your $${money(a.amount)} loan was approved and deposited. First payment of $${money(a.monthly_payment)} is due ${first}.`);
  return loan.id;
}

export const apply = route({ auth: "customer", body: ApplyBody }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  const b = ctx.body;
  return tx(async (db) => {
    await db.query("SELECT 1 FROM customers WHERE sandbox_id = $1 AND id = $2 FOR UPDATE", [sb, cid]);
    const acct = await ownedAccount(db, sb, cid, b.disbursementAccountId);
    if (acct.type !== "CHEQUING") throw rule("INVALID_TARGET", "Loans can only be paid into a chequing account.");
    if (acct.status !== "OPEN") throw rule("ACCOUNT_FROZEN", "This account cannot receive money right now.");
    if (await one(db, "SELECT 1 FROM loan_applications WHERE sandbox_id = $1 AND customer_id = $2 AND status = 'MANUAL_REVIEW'", [sb, cid])) {
      throw conflict("APPLICATION_IN_REVIEW", "You already have an application in review.");
    }
    const payment = monthlyPayment(b.amount, b.termMonths);
    const bp = dtiBasisPoints(b.monthlyDebtPayments, payment, b.annualIncome);
    const decision = decide(bp);
    const reason = decision === "APPROVED" ? "Debt-to-income under 35%" : decision === "MANUAL_REVIEW" ? "Debt-to-income between 35% and 45%" : "Debt-to-income over 45%";
    const row = (await one<{ id: number }>(db,
      `INSERT INTO loan_applications (sandbox_id, customer_id, amount, term_months, purpose, annual_income, monthly_debt_payments, apr, monthly_payment,
         dti_percent, disbursement_account_id, status, decision_source, decision_reason, decided_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'AUTOMATIC', $13, $14, app_now($1)) RETURNING id`,
      [sb, cid, formatCents(b.amount), b.termMonths, b.purpose, formatCents(b.annualIncome), formatCents(b.monthlyDebtPayments), LOAN_APR,
        formatCents(payment), formatCents(bp), acct.id, decision, reason, decision === "MANUAL_REVIEW" ? null : new Date()]))!;
    if (decision !== "MANUAL_REVIEW") await db.query("UPDATE loan_applications SET decided_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, row.id]);
    await audit(db, sb, u.userId, "LOAN_APPLICATION_SUBMITTED", "loan_application", row.id, null, { status: decision, dtiPercent: formatCents(bp) });
    if (decision === "APPROVED") await fundLoan(db, sb, row.id);
    else await notifyCustomer(db, sb, cid, "LOAN", decision === "DECLINED" ? "Loan application declined" : "Loan application in review",
      decision === "DECLINED" ? "We could not approve your loan application." : "Your loan application needs a manual review. We will let you know.");
    const app = (await one(db, "SELECT * FROM loan_applications WHERE sandbox_id = $1 AND id = $2", [sb, row.id]))!;
    return created(appView(app), `/api/v1/loans/applications/${row.id}`);
  }, { actorUserId: u.userId });
});

export const listApplications = route({ auth: "customer" }, async (ctx) => {
  const rows = await query("SELECT * FROM loan_applications WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY created_at DESC, id DESC", [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map(appView));
});

export const getApplication = route({ auth: "customer" }, async (ctx) => {
  const rows = await query("SELECT * FROM loan_applications WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3", [ctx.user!.sandboxId, intParam(ctx.params.id), customerId(ctx.user)]);
  if (!rows[0]) throw notFound("Loan application");
  return ok(appView(rows[0]));
});

export const listLoans = route({ auth: "customer" }, async (ctx) => {
  const rows = await query(
    `SELECT l.*, a.balance, (SELECT min(due_date) FROM loan_schedule s WHERE s.sandbox_id = l.sandbox_id AND s.loan_id = l.id AND s.status = 'DUE') AS next_due,
            (SELECT count(*)::int FROM loan_schedule s WHERE s.sandbox_id = l.sandbox_id AND s.loan_id = l.id AND s.status = 'PAID') AS paid
       FROM loans l JOIN accounts a ON a.sandbox_id = l.sandbox_id AND a.id = l.account_id
      WHERE l.sandbox_id = $1 AND l.customer_id = $2 ORDER BY l.id`, [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map((l) => ({
    id: Number(l.id), applicationId: Number(l.application_id), accountId: Number(l.account_id), principal: money(l.principal), apr: (Number(l.apr) * 100).toFixed(2),
    termMonths: Number(l.term_months), monthlyPayment: money(l.monthly_payment), totalInterest: money(l.total_interest), balanceOwing: money(String(-Number(l.balance))),
    firstPaymentDate: l.first_payment_date, nextPaymentDate: l.next_due ?? null, paymentsMade: Number(l.paid), status: l.status, createdAt: isoOffset(l.created_at)!,
  })));
});

export const schedule = route({ auth: "customer" }, async (ctx) => {
  const sb = ctx.user!.sandboxId;
  const id = intParam(ctx.params.id);
  const [loan] = await query("SELECT * FROM loans WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3", [sb, id, customerId(ctx.user)]);
  if (!loan) throw notFound("Loan");
  const rows = await query("SELECT * FROM loan_schedule WHERE sandbox_id = $1 AND loan_id = $2 ORDER BY installment_no", [sb, id]);
  const total = rows.reduce((s, r) => s + BigInt(Math.round(Number(r.payment) * 100)), 0n);
  return ok({
    loanId: id, principal: money(loan.principal), totalInterest: money(loan.total_interest), totalPaid: formatCents(total),
    rows: rows.map((r) => ({
      installmentNo: Number(r.installment_no), dueDate: r.due_date, payment: money(r.payment), principal: money(r.principal), interest: money(r.interest),
      remainingBalance: money(r.remaining_balance), status: r.status, paidAt: isoOffset(r.paid_at),
    })),
  });
});
