"use client";
/** Standalone loan calculator, embedded in an iframe on the Loans page (iframe Selenium challenge). No app shell. */
import { useState } from "react";
import { formatMoney } from "@/ui/format";
import { centsToString, LOAN_APR_PERCENT, monthlyPaymentCents, parseCents, totalInterestCents } from "@/ui/services/loan-math";

export default function LoanCalculatorPage() {
  const [errors, setErrors] = useState<{ amount?: string; term?: string }>({});
  const [result, setResult] = useState<{ payment: string; interest: string; total: string } | null>(null);

  function calculate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the fields from the form itself (uncontrolled inputs), so text typed before the page
    // finished loading still counts.
    const data = new FormData(e.currentTarget);
    const amount = String(data.get("amount") ?? "");
    const term = String(data.get("term") ?? "");
    const fe: { amount?: string; term?: string } = {};
    const cents = parseCents(amount);
    if (cents === null) fe.amount = "Enter an amount like 15000.00.";
    else if (cents < 100000 || cents > 5000000) fe.amount = "Enter an amount from $1,000.00 to $50,000.00.";
    const n = /^\d+$/.test(term.trim()) ? Number(term.trim()) : NaN;
    if (!Number.isInteger(n) || n < 12 || n > 60) fe.term = "Enter a term from 12 to 60 months.";
    setErrors(fe);
    if (Object.keys(fe).length) { setResult(null); return; }
    const pay = monthlyPaymentCents(cents!, n);
    const interest = totalInterestCents(cents!, n);
    setResult({ payment: centsToString(pay), interest: centsToString(interest), total: centsToString(cents! + interest) });
  }

  return (
    <main className="min-h-screen bg-white p-4 text-ink" data-testid="loan-calculator">
      <header className="flex items-center justify-between border-b border-line pb-2 mb-4">
        <h1 className="text-lg font-bold text-navy" data-testid="calc-title">Ice Bank loan calculator</h1>
        <span className="text-xs text-muted">Estimate only</span>
      </header>
      <form onSubmit={calculate} noValidate className="grid sm:grid-cols-3 gap-3 items-start" data-testid="calc-form">
        <div>
          <label className="ib-label" htmlFor="calc-amount">Loan amount (CAD)</label>
          <input id="calc-amount" className="ib-input" inputMode="decimal" data-testid="calc-amount-input" name="amount" defaultValue="15000.00"
            aria-invalid={errors.amount ? true : undefined} />
          {errors.amount && <p className="ib-error" role="alert" data-testid="calc-amount-error">{errors.amount}</p>}
        </div>
        <div>
          <label className="ib-label" htmlFor="calc-term">Term (months)</label>
          <input id="calc-term" className="ib-input" inputMode="numeric" data-testid="calc-term-input" name="term" defaultValue="48"
            aria-invalid={errors.term ? true : undefined} />
          {errors.term && <p className="ib-error" role="alert" data-testid="calc-term-error">{errors.term}</p>}
        </div>
        <div>
          <label className="ib-label" htmlFor="calc-apr">APR (fixed)</label>
          <input id="calc-apr" className="ib-input bg-frost" readOnly value={`${LOAN_APR_PERCENT}%`} data-testid="calc-apr" />
        </div>
        <div className="sm:col-span-3">
          <button type="submit" className="ib-btn ib-btn-primary" data-testid="calc-calculate-button">Calculate</button>
        </div>
      </form>
      <div className="mt-4 grid sm:grid-cols-3 gap-3" data-testid="calc-result" aria-live="polite">
        <div className="rounded-lg bg-frost p-3">
          <p className="text-xs text-muted">Monthly payment</p>
          <p className="text-xl font-bold text-navy tabular-nums" data-testid="calc-monthly-payment">{result ? formatMoney(result.payment) : "-"}</p>
        </div>
        <div className="rounded-lg bg-frost p-3">
          <p className="text-xs text-muted">Total interest</p>
          <p className="text-xl font-bold tabular-nums" data-testid="calc-total-interest">{result ? formatMoney(result.interest) : "-"}</p>
        </div>
        <div className="rounded-lg bg-frost p-3">
          <p className="text-xs text-muted">Total cost</p>
          <p className="text-xl font-bold tabular-nums" data-testid="calc-total-cost">{result ? formatMoney(result.total) : "-"}</p>
        </div>
      </div>
      <p className="text-xs text-muted mt-3">Payment = P × r / (1 − (1 + r)^−n), r = APR / 12, rounded to the cent.</p>
    </main>
  );
}
