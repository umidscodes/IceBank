/**
 * Due work runs lazily at the start of any request for a sandbox (and right after the clock moves),
 * based on the sandbox clock. Nothing runs in the background.
 *
 * For every day between the last processed day and "today" (Toronto), in order:
 *   - scheduled bill payments with a posting date on or before that day post (or fail)
 *   - loan installments due on or before that day are collected from the disbursement account
 *   - e-transfers past their expiry are expired and refunded
 *   - savings interest accrues for the day; after the last day of a month it is paid
 */
import { pool, type Db } from "../db/pool";
import { addDays, recurrenceDate, onOrNextBusinessDay, torontoDate, endOfDay } from "@/lib/dates";
import { money } from "@/lib/money";
import { DateTime } from "luxon";
import { ZONE } from "@/lib/dates";
import { notifyCustomer, audit } from "./common";

const lastRun = new Map<number, number>();
const running = new Map<number, Promise<DueWorkSummary>>();
const THROTTLE_MS = 3000;

export interface DueWorkSummary {
  billPaymentsPosted: number;
  billPaymentsFailed: number;
  loanPaymentsCollected: number;
  loanPaymentsMissed: number;
  etransfersExpired: number;
  interestPayments: number;
  daysProcessed: number;
}

const empty = (): DueWorkSummary => ({
  billPaymentsPosted: 0, billPaymentsFailed: 0, loanPaymentsCollected: 0, loanPaymentsMissed: 0,
  etransfersExpired: 0, interestPayments: 0, daysProcessed: 0,
});

export async function processDueWork(sandboxId: number, opts: { force?: boolean } = {}): Promise<DueWorkSummary> {
  const inflight = running.get(sandboxId);
  if (inflight) {
    if (!opts.force) return inflight;
    await inflight.catch(() => {});
    return processDueWork(sandboxId, opts);
  }
  if (!opts.force && Date.now() - (lastRun.get(sandboxId) ?? 0) < THROTTLE_MS) return empty();
  const p = run(sandboxId).finally(() => {
    running.delete(sandboxId);
    lastRun.set(sandboxId, Date.now());
  });
  running.set(sandboxId, p);
  return p;
}

export function forgetDueWork(sandboxId: number) {
  lastRun.delete(sandboxId);
}

async function run(sandboxId: number): Promise<DueWorkSummary> {
  const client = await pool().connect();
  const s = empty();
  try {
    await client.query("BEGIN");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(424242, $1) AS ok", [sandboxId]);
    if (!lock.rows[0].ok) { await client.query("ROLLBACK"); return s; }
    const sb = (await client.query<{ now: Date; processed_through: string | null }>(
      "SELECT app_now(id) AS now, processed_through FROM sandboxes WHERE id = $1 FOR UPDATE", [sandboxId])).rows[0];
    if (!sb) { await client.query("ROLLBACK"); return s; }
    const now = sb.now;
    const today = torontoDate(now);
    let pt = sb.processed_through ?? addDays(today, -1);

    while (pt < addDays(today, -1)) {
      const d = addDays(pt, 1);
      await dayItems(client, sandboxId, d, endOfDay(d), s);
      await accrue(client, sandboxId);
      if (DateTime.fromISO(d, { zone: ZONE }).endOf("month").toISODate() === d) {
        s.interestPayments += await payInterest(client, sandboxId, d);
      }
      pt = d;
      s.daysProcessed++;
    }
    await dayItems(client, sandboxId, today, now, s);
    await client.query("UPDATE sandboxes SET processed_through = $2 WHERE id = $1", [sandboxId, pt]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[due-work] sandbox ${sandboxId} failed:`, err);
  } finally {
    client.release();
  }
  return s;
}

async function dayItems(db: Db, sb: number, day: string, until: Date, s: DueWorkSummary) {
  await postBillPayments(db, sb, day, s);
  await collectLoanPayments(db, sb, day, s);
  await expireETransfers(db, sb, until, s);
}

// ---- bill payments ---------------------------------------------------------------------------

interface DueBill {
  id: number; customer_id: number; payee_id: number; from_account_id: number; amount: string; status: string;
  transaction_id: number | null; recurrence: string; series_id: string | null; occurrence: number;
  requested_date: string; end_date: string | null; biller_name: string; account_status: string;
  available: string; type: string; credit_limit: string | null; reference_id: string;
}

async function postBillPayments(db: Db, sb: number, day: string, s: DueWorkSummary) {
  const due = (await db.query<DueBill>(
    `SELECT bp.id, bp.customer_id, bp.payee_id, bp.from_account_id, bp.amount, bp.status, bp.transaction_id, bp.recurrence,
            bp.series_id, bp.occurrence, bp.requested_date, bp.end_date, bp.reference_id, b.name AS biller_name,
            a.status AS account_status, a.available_balance AS available, a.type, a.credit_limit
       FROM bill_payments bp
       JOIN payees p ON p.sandbox_id = bp.sandbox_id AND p.id = bp.payee_id
       JOIN billers b ON b.sandbox_id = p.sandbox_id AND b.id = p.biller_id
       JOIN accounts a ON a.sandbox_id = bp.sandbox_id AND a.id = bp.from_account_id
      WHERE bp.sandbox_id = $1 AND bp.status IN ('SCHEDULED', 'PENDING') AND bp.posting_date <= $2
      ORDER BY bp.posting_date, bp.id FOR UPDATE OF bp`,
    [sb, day],
  )).rows;
  for (const bp of due) {
    if (bp.status === "PENDING" && bp.transaction_id) {
      await db.query("SELECT settle_entry($1, $2)", [sb, bp.transaction_id]);
      await db.query("UPDATE bill_payments SET status = 'POSTED', posted_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, bp.id]);
      s.billPaymentsPosted++;
      await notifyCustomer(db, sb, bp.customer_id, "MONEY_MOVEMENT", "Bill payment posted", `Your $${money(bp.amount)} payment to ${bp.biller_name} has posted.`);
    } else {
      const available = Number(bp.available) + (bp.type === "CREDIT" ? Number(bp.credit_limit ?? 0) : 0);
      let failure: string | null = null;
      if (bp.account_status !== "OPEN") failure = bp.account_status === "FROZEN" ? "ACCOUNT_FROZEN" : "ACCOUNT_CLOSED";
      else if (Number(bp.amount) > available) failure = "INSUFFICIENT_FUNDS";
      if (failure) {
        await db.query("UPDATE bill_payments SET status = 'FAILED', failure_reason = $3 WHERE sandbox_id = $1 AND id = $2", [sb, bp.id, failure]);
        s.billPaymentsFailed++;
        await notifyCustomer(db, sb, bp.customer_id, "MONEY_MOVEMENT", "Bill payment failed",
          `Your $${money(bp.amount)} payment to ${bp.biller_name} could not be made (${failure.replace(/_/g, " ").toLowerCase()}).`);
        await audit(db, sb, null, "BILL_PAYMENT_FAILED", "bill_payment", bp.id, { status: "SCHEDULED" }, { status: "FAILED", reason: failure });
      } else {
        const tx = await db.query<{ id: number }>("SELECT post_entry($1, $2, 'DEBIT', $3, 'BILL_PAYMENT', $4, $5) AS id",
          [sb, bp.from_account_id, bp.amount, `Bill payment - ${bp.biller_name}`, bp.reference_id]);
        await db.query("UPDATE bill_payments SET status = 'POSTED', posted_at = app_now($1), transaction_id = $3 WHERE sandbox_id = $1 AND id = $2",
          [sb, bp.id, tx.rows[0].id]);
        s.billPaymentsPosted++;
        await notifyCustomer(db, sb, bp.customer_id, "MONEY_MOVEMENT", "Bill payment posted", `Your $${money(bp.amount)} payment to ${bp.biller_name} has posted.`);
      }
    }
    if (bp.recurrence !== "NONE" && bp.series_id) await topUpSeries(db, sb, bp.series_id);
  }
}

/** Keep a rolling window of future occurrences for a recurring series. */
export const SERIES_WINDOW: Record<string, number> = { WEEKLY: 26, BIWEEKLY: 26, MONTHLY: 12 };

export async function topUpSeries(db: Db, sb: number, seriesId: string) {
  const rows = (await db.query<{ first_date: string; recurrence: string; end_date: string | null; max_occ: number; scheduled: number;
    customer_id: number; payee_id: number; from_account_id: number; amount: string }>(
    `SELECT min(requested_date) FILTER (WHERE occurrence = 1) AS first_date, max(recurrence) AS recurrence, max(end_date) AS end_date,
            max(occurrence) AS max_occ, count(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled,
            max(customer_id) AS customer_id, max(payee_id) AS payee_id, max(from_account_id) AS from_account_id, max(amount) AS amount
       FROM bill_payments WHERE sandbox_id = $1 AND series_id = $2`, [sb, seriesId])).rows;
  const r = rows[0];
  if (!r || !r.first_date) return;
  const window = SERIES_WINDOW[r.recurrence] ?? 12;
  let occ = r.max_occ;
  let scheduled = r.scheduled;
  while (scheduled < window) {
    const requested = recurrenceDate(r.first_date, r.recurrence, occ);
    if (r.end_date && requested > r.end_date) break;
    occ++;
    await db.query(
      `INSERT INTO bill_payments (sandbox_id, customer_id, payee_id, from_account_id, amount, requested_date, posting_date, recurrence,
         series_id, occurrence, end_date, status, reference_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SCHEDULED', $12, app_now($1))`,
      [sb, r.customer_id, r.payee_id, r.from_account_id, r.amount, requested, onOrNextBusinessDay(requested), r.recurrence,
        seriesId, occ, r.end_date, `${seriesId}-${String(occ).padStart(3, "0")}`],
    );
    scheduled++;
  }
}

// ---- loans -----------------------------------------------------------------------------------

async function collectLoanPayments(db: Db, sb: number, day: string, s: DueWorkSummary) {
  const due = (await db.query<{ loan_id: number; installment_no: number; payment: string; principal: string; customer_id: number;
    loan_account_id: number; loan_balance: string; from_account_id: number; available: string; from_status: string; term_months: number }>(
    `SELECT ls.loan_id, ls.installment_no, ls.payment, ls.principal, l.customer_id, l.account_id AS loan_account_id, la.balance AS loan_balance,
            app.disbursement_account_id AS from_account_id, fa.available_balance AS available, fa.status AS from_status, l.term_months
       FROM loan_schedule ls
       JOIN loans l ON l.sandbox_id = ls.sandbox_id AND l.id = ls.loan_id AND l.status = 'ACTIVE'
       JOIN accounts la ON la.sandbox_id = l.sandbox_id AND la.id = l.account_id
       JOIN loan_applications app ON app.sandbox_id = l.sandbox_id AND app.id = l.application_id
       JOIN accounts fa ON fa.sandbox_id = app.sandbox_id AND fa.id = app.disbursement_account_id
      WHERE ls.sandbox_id = $1 AND ls.status = 'DUE' AND ls.due_date <= $2
      ORDER BY ls.due_date, ls.loan_id, ls.installment_no FOR UPDATE OF ls`, [sb, day])).rows;
  for (const r of due) {
    const owing = -Number(r.loan_balance);
    const principal = Math.min(Number(r.principal), owing);
    const payment = Number(r.payment) - Number(r.principal) + principal;
    if (principal <= 0) {
      await db.query("UPDATE loan_schedule SET status = 'PAID', paid_at = app_now($1) WHERE sandbox_id = $1 AND loan_id = $2 AND installment_no = $3",
        [sb, r.loan_id, r.installment_no]);
      continue;
    }
    if (r.from_status !== "OPEN" || payment > Number(r.available)) {
      await db.query("UPDATE loan_schedule SET status = 'MISSED' WHERE sandbox_id = $1 AND loan_id = $2 AND installment_no = $3", [sb, r.loan_id, r.installment_no]);
      s.loanPaymentsMissed++;
      await notifyCustomer(db, sb, r.customer_id, "LOAN", "Loan payment missed", `We could not collect your loan payment of $${payment.toFixed(2)}.`);
      continue;
    }
    const ref = `LNP-${r.loan_id}-${r.installment_no}`;
    await db.query("SELECT post_entry($1, $2, 'DEBIT', $3, 'LOAN_PAYMENT', $4, $5)",
      [sb, r.from_account_id, payment.toFixed(2), `Loan payment ${r.installment_no} of ${r.term_months}`, ref]);
    await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'LOAN_PAYMENT', $4, $5)",
      [sb, r.loan_account_id, principal.toFixed(2), `Loan payment ${r.installment_no} of ${r.term_months} (principal)`, ref]);
    await db.query("UPDATE loan_schedule SET status = 'PAID', paid_at = app_now($1) WHERE sandbox_id = $1 AND loan_id = $2 AND installment_no = $3",
      [sb, r.loan_id, r.installment_no]);
    s.loanPaymentsCollected++;
    await notifyCustomer(db, sb, r.customer_id, "LOAN", "Loan payment collected", `Your loan payment of $${payment.toFixed(2)} was collected.`);
    await db.query(
      `UPDATE loans SET status = 'PAID_OFF' WHERE sandbox_id = $1 AND id = $2
         AND (SELECT balance FROM accounts WHERE sandbox_id = $1 AND id = $3) = 0`, [sb, r.loan_id, r.loan_account_id]);
  }
}

// ---- e-transfers -----------------------------------------------------------------------------

async function expireETransfers(db: Db, sb: number, until: Date, s: DueWorkSummary) {
  const rows = (await db.query<{ id: number; sender_customer_id: number; from_account_id: number; amount: string; recipient_name: string; reference_id: string }>(
    `SELECT id, sender_customer_id, from_account_id, amount, recipient_name, reference_id FROM etransfers
      WHERE sandbox_id = $1 AND status = 'PENDING' AND expires_at <= $2 ORDER BY expires_at, id FOR UPDATE`, [sb, until])).rows;
  for (const e of rows) {
    await db.query("UPDATE etransfers SET status = 'EXPIRED', expired_at = app_now($1) WHERE sandbox_id = $1 AND id = $2", [sb, e.id]);
    await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'REVERSAL', $4, $5)",
      [sb, e.from_account_id, e.amount, `Interac e-Transfer expired - refund (${e.recipient_name})`, e.reference_id]);
    await audit(db, sb, null, "ETRANSFER_EXPIRED", "etransfer", e.id, { status: "PENDING" }, { status: "EXPIRED", refunded: money(e.amount) });
    await notifyCustomer(db, sb, e.sender_customer_id, "MONEY_MOVEMENT", "Interac e-Transfer expired",
      `Your $${money(e.amount)} e-Transfer to ${e.recipient_name} expired and was refunded.`);
    s.etransfersExpired++;
  }
}

// ---- savings interest ------------------------------------------------------------------------

async function accrue(db: Db, sb: number) {
  await db.query(
    `UPDATE accounts SET accrued_interest = accrued_interest + round(balance * interest_rate / 365, 6)
      WHERE sandbox_id = $1 AND type = 'SAVINGS' AND status <> 'CLOSED' AND balance > 0`, [sb]);
}

async function payInterest(db: Db, sb: number, monthEnd: string): Promise<number> {
  const rows = (await db.query<{ id: number; pay: string }>(
    `SELECT id, round(accrued_interest, 2) AS pay FROM accounts
      WHERE sandbox_id = $1 AND type = 'SAVINGS' AND status <> 'CLOSED' AND round(accrued_interest, 2) >= 0.01 ORDER BY id`, [sb])).rows;
  for (const r of rows) {
    await db.query("SELECT post_entry($1, $2, 'CREDIT', $3, 'INTEREST', 'Interest paid', $4)",
      [sb, r.id, r.pay, `INT-${r.id}-${monthEnd.slice(0, 7)}`]);
    await db.query("UPDATE accounts SET accrued_interest = accrued_interest - $3 WHERE sandbox_id = $1 AND id = $2", [sb, r.id, r.pay]);
  }
  return rows.length;
}
