"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { useAccounts, accountOption } from "@/ui/types";
import { Alert, Button, Card, PageHeader, SelectField, Spinner, StatusBadge, TextField } from "@/ui/components";
import { formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { LOAN_PURPOSES, type LoanApplication } from "@/ui/services/banking";

type Form = { amount: string; termMonths: string; purpose: string; annualIncome: string; monthlyDebtPayments: string; disbursementAccountId: string };
const EMPTY: Form = { amount: "", termMonths: "", purpose: "", annualIncome: "", monthlyDebtPayments: "", disbursementAccountId: "" };
const MONEY = /^\d+(\.\d{1,2})?$/;

const DECISION_TEXT: Record<string, string> = {
  APPROVED: "Congratulations, your loan is approved. The money has been deposited into your chequing account.",
  MANUAL_REVIEW: "Your application needs a closer look. A loan specialist will review it and you will get a notification with the decision.",
  DECLINED: "We are not able to approve this loan right now. Your debt payments would be too high compared to your income.",
};

export default function LoanApplyPage() {
  const toast = useToast();
  const { data: accounts } = useAccounts();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LoanApplication | null>(null);
  const chequing = accounts?.filter((a) => a.type === "CHEQUING") ?? [];
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!MONEY.test(f.amount.trim())) fe.amount = "Enter an amount like 15000.00.";
    else if (Number(f.amount) < 1000 || Number(f.amount) > 50000) fe.amount = "Enter an amount from $1,000.00 to $50,000.00.";
    if (!/^\d+$/.test(f.termMonths.trim())) fe.termMonths = "Enter the term in whole months.";
    else if (Number(f.termMonths) < 12 || Number(f.termMonths) > 60) fe.termMonths = "The term must be 12 to 60 months.";
    if (!f.purpose) fe.purpose = "Choose the purpose of the loan.";
    if (!MONEY.test(f.annualIncome.trim()) || Number(f.annualIncome) <= 0) fe.annualIncome = "Enter your gross yearly income, like 62000.00.";
    if (!MONEY.test(f.monthlyDebtPayments.trim())) fe.monthlyDebtPayments = "Enter your monthly debt payments, like 1500.00 (0 if none).";
    if (!f.disbursementAccountId) fe.disbursementAccountId = "Choose the chequing account that receives the money.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const r = await api<LoanApplication>("/loans/applications", { body: {
        amount: f.amount.trim(), termMonths: Number(f.termMonths), purpose: f.purpose, annualIncome: f.annualIncome.trim(),
        monthlyDebtPayments: f.monthlyDebtPayments.trim(), disbursementAccountId: Number(f.disbursementAccountId),
      } });
      setResult(r);
      if (r.status === "APPROVED") toast.success("Your loan is approved.");
      else if (r.status === "MANUAL_REVIEW") toast.info("Your application is in review.");
      else toast.error("Your application was declined.");
    } catch (err) {
      if (err instanceof ApiProblem) {
        setErrors(err.fieldErrors());
        setError(err.errors.length ? "Please fix the highlighted fields." : err.message);
        toast.error(err.message);
      } else setError("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  if (!accounts) return <Spinner label="Loading accounts" />;
  return (
    <div className="max-w-4xl">
      <nav className="text-sm mb-3" aria-label="Breadcrumb"><Link href="/loans" className="ib-link" data-testid="breadcrumb-loans">My loans</Link> <span className="text-muted">/ Apply</span></nav>
      <PageHeader title="Apply for a personal loan" subtitle="Fixed 8.99% APR. Get a decision in seconds." />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {error && <div className="mb-4"><Alert testId="loan-apply-error">{error}</Alert></div>}
          {!result ? (
            <Card>
              <form onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-4" data-testid="loan-apply-form">
                <TextField id="amount" label="Loan amount (CAD)" inputMode="decimal" placeholder="15000.00" testId="loan-amount-input" value={f.amount} onChange={set("amount")}
                  error={errors.amount} help="$1,000.00 to $50,000.00" />
                <TextField id="termMonths" label="Term (months)" inputMode="numeric" placeholder="48" testId="loan-term-input" value={f.termMonths} onChange={set("termMonths")}
                  error={errors.termMonths} help="12 to 60 months" />
                <SelectField id="purpose" label="Purpose" testId="loan-purpose-select" placeholder="Choose a purpose" value={f.purpose} onChange={set("purpose")}
                  options={LOAN_PURPOSES.map((p) => ({ value: p, label: p }))} error={errors.purpose} className="sm:col-span-2" />
                <TextField id="annualIncome" label="Gross annual income (CAD)" inputMode="decimal" placeholder="62000.00" testId="loan-annual-income-input" value={f.annualIncome}
                  onChange={set("annualIncome")} error={errors.annualIncome} />
                <TextField id="monthlyDebtPayments" label="Monthly debt payments (CAD)" inputMode="decimal" placeholder="1500.00" testId="loan-monthly-debt-input"
                  value={f.monthlyDebtPayments} onChange={set("monthlyDebtPayments")} error={errors.monthlyDebtPayments} help="Rent or mortgage, car, credit cards" />
                <SelectField id="disbursementAccountId" label="Deposit the money into" testId="loan-account-select" placeholder="Choose a chequing account"
                  value={f.disbursementAccountId} onChange={set("disbursementAccountId")} options={chequing.map((a) => accountOption(a, formatMoney))}
                  error={errors.disbursementAccountId} help="Monthly payments are also taken from this account." className="sm:col-span-2" />
                <div className="sm:col-span-2">
                  <Button type="submit" testId="loan-submit-button" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card testId="loan-decision">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-bold text-navy text-lg">Decision</h2>
                <StatusBadge status={result.status} testId="loan-decision-status" />
              </div>
              <p className="mb-4 text-sm" data-testid="loan-decision-message">{DECISION_TEXT[result.status]}</p>
              <dl className="grid grid-cols-3 gap-y-2 text-sm mb-6">
                <dt className="text-muted">Amount</dt><dd className="col-span-2" data-testid="loan-decision-amount">{formatMoney(result.amount)}</dd>
                <dt className="text-muted">Term</dt><dd className="col-span-2" data-testid="loan-decision-term">{result.termMonths} months at {result.apr}% APR</dd>
                <dt className="text-muted">Monthly payment</dt><dd className="col-span-2 font-semibold" data-testid="loan-decision-monthly-payment">{formatMoney(result.monthlyPayment)}</dd>
                <dt className="text-muted">Debt-to-income</dt><dd className="col-span-2 font-semibold" data-testid="loan-decision-dti">{result.dtiPercent}%</dd>
                <dt className="text-muted">Application</dt><dd className="col-span-2" data-testid="loan-decision-application-id">#{result.id}</dd>
                {result.decisionReason && <><dt className="text-muted">Reason</dt><dd className="col-span-2" data-testid="loan-decision-reason">{result.decisionReason}</dd></>}
              </dl>
              <div className="flex gap-2">
                {result.loanId && <Link href={`/loans/${result.loanId}`} className="ib-btn ib-btn-primary" data-testid="loan-decision-view-loan-link">View my loan</Link>}
                <Link href="/loans" className="ib-btn ib-btn-secondary" data-testid="loan-decision-loans-link">Back to my loans</Link>
              </div>
            </Card>
          )}
        </div>
        <Card testId="loan-rules">
          <h2 className="font-bold text-navy mb-3">How we decide</h2>
          <p className="text-sm mb-3">We compare your monthly debt payments, including this loan, with your monthly income. This is your debt-to-income ratio (DTI).</p>
          <p className="text-xs text-muted mb-3 font-mono">DTI = (monthly debts + new payment) ÷ (annual income ÷ 12) × 100</p>
          <ul className="text-sm space-y-2">
            <li className="flex flex-col items-start gap-1" data-testid="loan-rule-approved"><StatusBadge status="APPROVED" /> DTI under 35%: approved and paid out at once</li>
            <li className="flex flex-col items-start gap-1" data-testid="loan-rule-review"><StatusBadge status="MANUAL_REVIEW" /> DTI 35% to 45%: reviewed by a loan specialist</li>
            <li className="flex flex-col items-start gap-1" data-testid="loan-rule-declined"><StatusBadge status="DECLINED" /> DTI over 45%: declined</li>
          </ul>
          <p className="text-xs text-muted mt-3">Only one application can be in review at a time.</p>
        </Card>
      </div>
    </div>
  );
}
