"use client";
import Link from "next/link";
import { useApi } from "@/ui/types";
import { Alert, Card, EmptyState, PageHeader, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import type { Loan } from "@/ui/services/banking";

export default function LoansPage() {
  const { data: loans, error } = useApi<Loan[]>("/loans");
  return (
    <div className="max-w-5xl">
      <PageHeader title="My loans" subtitle="Personal loans at a fixed 8.99% APR, $1,000 to $50,000 over 12 to 60 months."
        actions={<Link href="/loans/apply" className="ib-btn ib-btn-primary" data-testid="loans-apply-link">Apply for a loan</Link>} />
      {error && <div className="mb-4"><Alert testId="loans-error">{error}</Alert></div>}
      {!loans && !error && <Spinner label="Loading loans" />}
      {loans && loans.length === 0 && (
        <Card testId="loans-empty"><EmptyState testId="loans-empty-message">You have no loans yet. Apply in a few minutes and get a decision right away.</EmptyState></Card>
      )}
      {loans && loans.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4 mb-8" data-testid="loans-list">
          {loans.map((l) => (
            <Card key={l.id} testId={`loan-card-${l.id}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-navy">Personal loan #{l.id}</h2>
                <StatusBadge status={l.status} testId={`loan-status-${l.id}`} />
              </div>
              <p className="text-sm text-muted">Balance owing</p>
              <p className="text-2xl font-bold text-navy tabular-nums mb-3" data-testid={`loan-balance-${l.id}`}>{formatMoney(l.balanceOwing)}</p>
              <dl className="grid grid-cols-2 gap-y-1 text-sm mb-4">
                <dt className="text-muted">Monthly payment</dt><dd className="tabular-nums" data-testid={`loan-monthly-payment-${l.id}`}>{formatMoney(l.monthlyPayment)}</dd>
                <dt className="text-muted">Next payment</dt><dd data-testid={`loan-next-payment-${l.id}`}>{l.nextPaymentDate ? formatDate(l.nextPaymentDate) : "None"}</dd>
                <dt className="text-muted">Principal</dt><dd className="tabular-nums" data-testid={`loan-principal-${l.id}`}>{formatMoney(l.principal)}</dd>
                <dt className="text-muted">Term</dt><dd data-testid={`loan-term-${l.id}`}>{l.termMonths} months · {l.apr}% APR</dd>
                <dt className="text-muted">Payments made</dt><dd data-testid={`loan-payments-made-${l.id}`}>{l.paymentsMade} of {l.termMonths}</dd>
              </dl>
              <Link href={`/loans/${l.id}`} className="ib-link text-sm" data-testid={`loan-schedule-link-${l.id}`}>View payment schedule</Link>
            </Card>
          ))}
        </div>
      )}
      <Card testId="loan-calculator-section" className="mt-6">
        <h2 className="font-bold text-navy text-lg mb-1">Loan calculator</h2>
        <p className="text-sm text-muted mb-4">See what your monthly payment could be before you apply.</p>
        <iframe src="/loan-calculator" title="Loan calculator" data-testid="loan-calculator-iframe" className="w-full h-[380px] border border-line rounded-lg" />
      </Card>
    </div>
  );
}
