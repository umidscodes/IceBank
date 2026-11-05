"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccounts, useApi, accountOption } from "@/ui/types";
import { Alert, Card, EmptyState, PageHeader, SelectField, Spinner } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import type { Statement } from "@/ui/services/banking";

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("en-CA", { year: "numeric", month: "long", timeZone: "UTC" });
}

function Statements() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: accounts, error: accountsError } = useAccounts();
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const eligible = accounts?.filter((a) => a.type !== "LOAN") ?? [];

  useEffect(() => {
    if (!accounts) return;
    if (!accountId || !accounts.some((a) => String(a.id) === accountId)) {
      const first = accounts.find((a) => a.type !== "LOAN") ?? accounts[0];
      if (first) setAccountId(String(first.id));
    }
  }, [accounts, accountId]);

  const { data: statements, error, loading } = useApi<Statement[]>(accountId ? `/accounts/${accountId}/statements` : null);

  function choose(id: string) {
    setAccountId(id);
    router.replace(`/statements?account=${id}`);
  }

  if (accountsError) return <Alert testId="statements-error">{accountsError}</Alert>;
  if (!accounts) return <Spinner label="Loading accounts" />;
  const options = (accounts.some((a) => String(a.id) === accountId && a.type === "LOAN") ? accounts : eligible).map((a) => accountOption(a, formatMoney));
  return (
    <div className="max-w-5xl">
      <PageHeader title="Statements" subtitle="Monthly statements for every complete calendar month, as PDF." />
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField id="statementAccount" label="Account" testId="statements-account-select" value={accountId} onChange={(e) => choose(e.target.value)}
            options={options} className="min-w-[320px]" />
          {accountId && (
            <a href={`/api/v1/accounts/${accountId}/transactions.csv`} download className="ib-btn ib-btn-secondary" data-testid="statements-csv-link">
              Export all transactions (CSV)
            </a>
          )}
        </div>
      </Card>
      <Card testId="statements-card">
        {error && <Alert testId="statements-list-error">{error}</Alert>}
        {(loading || !statements) && !error && <Spinner label="Loading statements" />}
        {statements && !loading && statements.length === 0 && (
          <EmptyState testId="statements-empty">No statements yet. Your first statement is ready after your first full calendar month.</EmptyState>
        )}
        {statements && !loading && statements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ib-table" data-testid="statements-table">
              <thead><tr><th>Statement</th><th>Period</th><th className="!text-right">Opening balance</th><th className="!text-right">Closing balance</th><th className="!text-right">Transactions</th><th>Actions</th></tr></thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.month} data-testid={`statement-row-${s.month}`}>
                    <td className="font-semibold" data-testid={`statement-month-${s.month}`}>{monthLabel(s.month)}</td>
                    <td className="whitespace-nowrap text-muted" data-testid={`statement-period-${s.month}`}>{formatDate(s.periodStart)} to {formatDate(s.periodEnd)}</td>
                    <td className="text-right tabular-nums" data-testid={`statement-opening-${s.month}`}>{formatMoney(s.openingBalance)}</td>
                    <td className="text-right tabular-nums" data-testid={`statement-closing-${s.month}`}>{formatMoney(s.closingBalance)}</td>
                    <td className="text-right tabular-nums" data-testid={`statement-count-${s.month}`}>{s.transactionCount}</td>
                    <td className="whitespace-nowrap">
                      <a href={`/api/v1/accounts/${accountId}/statements/${s.month}.pdf?inline=1`} target="_blank" rel="noopener" className="ib-link mr-4"
                        data-testid={`statement-pdf-link-${s.month}`}>View PDF<span className="sr-only"> (opens in a new tab)</span></a>
                      <a href={`/api/v1/accounts/${accountId}/statements/${s.month}.pdf`} download className="ib-link" data-testid={`statement-download-link-${s.month}`}>Download</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function StatementsPage() {
  return <Suspense fallback={<Spinner label="Loading" />}><Statements /></Suspense>;
}
