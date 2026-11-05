"use client";
import Link from "next/link";
import { use } from "react";
import { useApi } from "@/ui/types";
import { Alert, Card, PageHeader, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import type { Loan, LoanSchedule } from "@/ui/services/banking";

function sum(values: string[]): string {
  const cents = values.reduce((s, v) => s + Math.round(Number(v) * 100), 0);
  return (cents / 100).toFixed(2);
}

export default function LoanSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: schedule, error } = useApi<LoanSchedule>(`/loans/${id}/schedule`);
  const { data: loans } = useApi<Loan[]>("/loans");
  const loan = loans?.find((l) => String(l.id) === id);

  return (
    <div className="max-w-5xl">
      <nav className="text-sm mb-3" aria-label="Breadcrumb"><Link href="/loans" className="ib-link" data-testid="breadcrumb-loans">My loans</Link> <span className="text-muted">/ Loan #{id}</span></nav>
      <PageHeader title={`Loan #${id} payment schedule`} testId="loan-schedule-title"
        subtitle={loan ? `${formatMoney(loan.principal)} over ${loan.termMonths} months at ${loan.apr}% APR` : undefined}
        actions={loan ? <StatusBadge status={loan.status} testId="loan-schedule-status" /> : undefined} />
      {error && <Alert testId="loan-schedule-error">{error}</Alert>}
      {!schedule && !error && <Spinner label="Loading schedule" />}
      {schedule && (<>
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <Card><p className="text-sm text-muted">Principal</p><p className="text-xl font-bold text-navy tabular-nums" data-testid="loan-schedule-principal">{formatMoney(schedule.principal)}</p></Card>
          <Card><p className="text-sm text-muted">Total interest</p><p className="text-xl font-bold tabular-nums" data-testid="loan-schedule-total-interest">{formatMoney(schedule.totalInterest)}</p></Card>
          <Card><p className="text-sm text-muted">Total to repay</p><p className="text-xl font-bold tabular-nums" data-testid="loan-schedule-total-paid">{formatMoney(schedule.totalPaid)}</p></Card>
          <Card><p className="text-sm text-muted">Balance owing</p><p className="text-xl font-bold tabular-nums" data-testid="loan-schedule-balance">{loan ? formatMoney(loan.balanceOwing) : "-"}</p></Card>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="ib-table" data-testid="loan-schedule-table">
              <thead><tr><th>#</th><th>Due date</th><th className="!text-right">Payment</th><th className="!text-right">Principal</th><th className="!text-right">Interest</th><th className="!text-right">Remaining</th><th>Status</th></tr></thead>
              <tbody>
                {schedule.rows.map((r) => (
                  <tr key={r.installmentNo} data-testid={`schedule-row-${r.installmentNo}`}>
                    <td data-testid="schedule-installment">{r.installmentNo}</td>
                    <td className="whitespace-nowrap" data-testid="schedule-due-date">{formatDate(r.dueDate)}</td>
                    <td className="text-right tabular-nums" data-testid="schedule-payment">{formatMoney(r.payment)}</td>
                    <td className="text-right tabular-nums" data-testid="schedule-principal">{formatMoney(r.principal)}</td>
                    <td className="text-right tabular-nums" data-testid="schedule-interest">{formatMoney(r.interest)}</td>
                    <td className="text-right tabular-nums" data-testid="schedule-remaining">{formatMoney(r.remainingBalance)}</td>
                    <td><StatusBadge status={r.status} testId="schedule-status" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold" data-testid="schedule-totals-row">
                  <td colSpan={2}>Total</td>
                  <td className="text-right tabular-nums" data-testid="schedule-total-payment">{formatMoney(sum(schedule.rows.map((r) => r.payment)))}</td>
                  <td className="text-right tabular-nums" data-testid="schedule-total-principal">{formatMoney(sum(schedule.rows.map((r) => r.principal)))}</td>
                  <td className="text-right tabular-nums" data-testid="schedule-total-interest">{formatMoney(sum(schedule.rows.map((r) => r.interest)))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </>)}
    </div>
  );
}
