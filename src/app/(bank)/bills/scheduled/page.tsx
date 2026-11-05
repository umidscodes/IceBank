"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/ui/api";
import { useAccounts, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Modal, PageHeader, Pagination, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { describeProblem, RECURRENCE_LABEL, type BillPayment } from "@/ui/payments/shared";

const STATUSES = ["SCHEDULED", "PENDING", "POSTED", "CANCELLED", "FAILED"] as const;
const TAB_LABEL: Record<string, string> = { "": "All", SCHEDULED: "Scheduled", PENDING: "Pending", POSTED: "Posted", CANCELLED: "Cancelled", FAILED: "Failed" };
const PAGE_SIZE = 10;

export default function ScheduledPaymentsPage() {
  return <Suspense fallback={<Spinner />}><ScheduledPayments /></Suspense>;
}

function ScheduledPayments() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status") ?? "";
  const [status, setStatus] = useState<string>((STATUSES as readonly string[]).includes(initial) ? initial : "");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<BillPayment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<BillPayment | null>(null);
  const [cancelling, setCancelling] = useState<"occurrence" | "series" | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { data: accounts } = useAccounts();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Page<BillPayment>>(`/bill-payments?page=${page}&size=${PAGE_SIZE}${status ? `&status=${status}` : ""}`));
      setError(null);
    } catch (e) {
      setError(describeProblem(e).message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);
  useEffect(() => { load(); }, [load]);

  function selectTab(s: string) {
    setStatus(s);
    setPage(0);
    router.replace(s ? `/bills/scheduled?status=${s}` : "/bills/scheduled", { scroll: false });
  }

  async function cancel(scope: "occurrence" | "series") {
    if (!toCancel) return;
    setCancelling(scope);
    setCancelError(null);
    try {
      await api(`/bill-payments/${toCancel.id}${scope === "series" ? "?scope=series" : ""}`, { method: "DELETE" });
      toast.success(scope === "series" ? `This and all later ${toCancel.billerName} payments were cancelled.` : `Payment of ${formatMoney(toCancel.amount)} to ${toCancel.billerName} cancelled.`);
      setToCancel(null);
      load();
    } catch (err) {
      const p = describeProblem(err);
      setCancelError(p.message);
      toast.error(p.message);
    } finally {
      setCancelling(null);
    }
  }

  const accountName = (id: number) => accounts?.find((a) => a.id === id)?.displayName ?? "";
  const tabs = ["", ...STATUSES];
  return (
    <div className="max-w-6xl">
      <PageHeader title="Bill payments" subtitle="Scheduled, pending and past bill payments, latest posting date first."
        actions={<>
          <Link href="/bills" className="ib-btn ib-btn-primary" data-testid="scheduled-pay-bill-link">Pay a bill</Link>
          <Link href="/bills/payees" className="ib-btn ib-btn-secondary" data-testid="scheduled-payees-link">Payees</Link>
        </>} />
      <Card testId="bill-payments-card">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 border-b border-line mb-4" data-testid="bill-payments-status-tabs">
          {tabs.map((s) => (
            <button key={s || "ALL"} type="button" role="tab" aria-selected={status === s} data-testid={`bill-payments-tab-${(s || "all").toLowerCase()}`}
              onClick={() => selectTab(s)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${status === s ? "border-navy text-navy" : "border-transparent text-muted hover:text-navy"}`}>
              {TAB_LABEL[s]}
            </button>
          ))}
        </div>
        {error && <div className="mb-3"><Alert testId="bill-payments-error">{error}</Alert></div>}
        <div className="overflow-x-auto" aria-busy={loading} role="tabpanel">
          {data && data.content.length > 0 && (
            <table className="ib-table" data-testid="bill-payments-table">
              <thead><tr><th>Posting date</th><th>Payment date</th><th>Payee</th><th>From</th><th>Frequency</th><th className="text-right">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.content.map((p) => (
                  <tr key={p.id} data-testid={`bill-payment-row-${p.id}`}>
                    <td className="whitespace-nowrap" data-testid="bill-payment-posting-date" data-iso={p.postingDate}>{formatDate(p.postingDate)}</td>
                    <td className="whitespace-nowrap text-muted" data-testid="bill-payment-payment-date" data-iso={p.paymentDate}>{formatDate(p.paymentDate)}</td>
                    <td data-testid="bill-payment-payee">
                      <span className="font-semibold text-navy">{p.payeeNickname ?? p.billerName}</span>
                      <span className="block text-xs text-muted">{p.payeeNickname ? `${p.billerName} · ` : ""}{p.payeeAccountNumber}</span>
                    </td>
                    <td className="whitespace-nowrap" data-testid="bill-payment-from">{accountName(p.fromAccountId)}</td>
                    <td className="whitespace-nowrap" data-testid="bill-payment-recurrence">
                      {RECURRENCE_LABEL[p.recurrence]}
                      {p.seriesId && <span className="block text-xs text-muted">Payment {p.occurrence}{p.endDate ? ` · ends ${formatDate(p.endDate)}` : ""}</span>}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap font-semibold" data-testid="bill-payment-amount">{formatMoney(p.amount)}</td>
                    <td>
                      <StatusBadge status={p.status} testId="bill-payment-status" />
                      {p.failureReason && <span className="block text-xs text-alert mt-1" data-testid="bill-payment-failure-reason">{p.failureReason}</span>}
                    </td>
                    <td className="text-right">
                      {(p.status === "SCHEDULED" || p.status === "PENDING") && (
                        <Button variant="secondary" className="!py-1 !px-3 text-sm" testId={`bill-payment-cancel-${p.id}`}
                          aria-label={`Cancel payment of ${formatMoney(p.amount)} to ${p.billerName} on ${formatDate(p.postingDate)}`}
                          onClick={() => { setCancelError(null); setToCancel(p); }}>Cancel</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {loading && !data && <div className="py-6"><Spinner /></div>}
          {data && data.content.length === 0 && (
            <EmptyState testId="bill-payments-empty">{status ? `No ${TAB_LABEL[status].toLowerCase()} payments.` : "You have no bill payments yet."}</EmptyState>
          )}
        </div>
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="bill-payments-pagination" />}
      </Card>

      <Modal open={!!toCancel} title={toCancel?.seriesId ? "Cancel recurring payment" : "Cancel payment?"} testId="bill-cancel-modal" onClose={() => setToCancel(null)}
        footer={<>
          <Button variant="secondary" testId="bill-cancel-keep-button" onClick={() => setToCancel(null)}>Keep</Button>
          {toCancel?.seriesId && (
            <Button variant="danger" testId="bill-cancel-series-button" disabled={!!cancelling} onClick={() => cancel("series")}>
              {cancelling === "series" ? "Cancelling…" : "This and later"}
            </Button>
          )}
          <Button variant={toCancel?.seriesId ? "secondary" : "danger"} testId="bill-cancel-occurrence-button" disabled={!!cancelling} onClick={() => cancel("occurrence")}>
            {cancelling === "occurrence" ? "Cancelling…" : toCancel?.seriesId ? "Only this one" : "Cancel payment"}
          </Button>
        </>}>
        {toCancel && (
          <>
            <p data-testid="bill-cancel-summary">
              {formatMoney(toCancel.amount)} to <strong>{toCancel.payeeNickname ?? toCancel.billerName}</strong>, posting {formatDate(toCancel.postingDate)}.
            </p>
            {toCancel.seriesId && <p className="mt-2 text-muted">This is payment {toCancel.occurrence} of a {RECURRENCE_LABEL[toCancel.recurrence].toLowerCase()} series. Cancel only this payment, or this one and every later payment in the series?</p>}
            {toCancel.status === "PENDING" && <p className="mt-2 text-muted">The money held for this payment will be released.</p>}
            {cancelError && <div className="mt-3"><Alert testId="bill-cancel-error">{cancelError}</Alert></div>}
          </>
        )}
      </Modal>
    </div>
  );
}
