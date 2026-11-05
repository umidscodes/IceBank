/**
 * Personal loan rules.
 *  - APR fixed at 8.99%, monthly rate = APR / 12.
 *  - Monthly payment = P * r / (1 - (1 + r)^-n), rounded to the nearest cent.
 *  - Each schedule row: interest = remaining * r rounded half-up to the cent; principal = payment - interest.
 *    The last row pays off whatever is left, so the rows sum exactly to principal + total interest.
 *  - DTI % = (monthly debt payments + new loan payment) / (annual income / 12) * 100, rounded to 2 places.
 *    Under 35.00 approved; 35.00 to 45.00 manual review; over 45.00 declined.
 */
import { formatCents, mulRate } from "./money";
import { monthlyOccurrence } from "./dates";

export const LOAN_APR = "0.0899";
export const LOAN_MIN = 100000n; // cents
export const LOAN_MAX = 5000000n;
export const TERM_MIN = 12;
export const TERM_MAX = 60;

export function monthlyPayment(principalCents: bigint, termMonths: number, apr = LOAN_APR): bigint {
  const r = Number(apr) / 12;
  const p = Number(principalCents) / 100;
  const pay = (p * r) / (1 - Math.pow(1 + r, -termMonths));
  return BigInt(Math.round(pay * 100));
}

export interface ScheduleRow {
  installmentNo: number;
  dueDate: string;
  payment: bigint;
  principal: bigint;
  interest: bigint;
  remainingBalance: bigint;
}

export function amortizationSchedule(principalCents: bigint, termMonths: number, firstPaymentDate: string, apr = LOAN_APR): ScheduleRow[] {
  const payment = monthlyPayment(principalCents, termMonths, apr);
  const rows: ScheduleRow[] = [];
  let remaining = principalCents;
  for (let i = 1; i <= termMonths; i++) {
    const interest = mulRate(remaining, apr, 12n);
    let principal = payment - interest;
    if (i === termMonths || principal > remaining) principal = remaining;
    remaining -= principal;
    rows.push({
      installmentNo: i,
      dueDate: monthlyOccurrence(firstPaymentDate, i - 1),
      payment: principal + interest,
      principal,
      interest,
      remainingBalance: remaining,
    });
  }
  return rows;
}

/** DTI in hundredths of a percent (3626 = 36.26%). */
export function dtiBasisPoints(monthlyDebtCents: bigint, paymentCents: bigint, annualIncomeCents: bigint): bigint {
  const num = (monthlyDebtCents + paymentCents) * 12n * 10000n;
  return (num * 2n + annualIncomeCents) / (annualIncomeCents * 2n);
}

export function dtiString(bp: bigint): string {
  return formatCents(bp);
}

export type LoanDecision = "APPROVED" | "MANUAL_REVIEW" | "DECLINED";
export function decide(bp: bigint): LoanDecision {
  if (bp < 3500n) return "APPROVED";
  if (bp <= 4500n) return "MANUAL_REVIEW";
  return "DECLINED";
}

/** First payment is one month after the decision date (same day of month, capped to month end). */
export function firstPaymentDate(decisionDate: string): string {
  return monthlyOccurrence(decisionDate, 1);
}
