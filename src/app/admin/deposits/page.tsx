"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/ui/api";
import { useApi, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, SelectField, Spinner, StatusBadge } from "@/ui/components";
import { formatDateTime, formatMoney } from "@/ui/format";
import { PageAlert, ReasonModal, useAdminAction, type AdminDeposit } from "@/ui/admin/shared";

const STATUSES = [{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }];

export default function AdminDepositsPage() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useApi<Page<AdminDeposit>>(`/admin/deposits?page=${page}&size=20${status ? `&status=${status}` : ""}`);
  const { run, alert } = useAdminAction(reload);
  const [rejecting, setRejecting] = useState<AdminDeposit | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const approve = async (d: AdminDeposit) => {
    setBusy(d.id);
    await run(() => api(`/admin/deposits/${d.id}/approve`, { method: "POST" }), `Deposit ${d.referenceId} approved. ${formatMoney(d.heldAmount)} released.`);
    setBusy(null);
  };
  const reject = async (reason: string) => {
    const d = rejecting!;
    const r = await run(() => api(`/admin/deposits/${d.id}/reject`, { body: { reason } }), `Deposit ${d.referenceId} rejected and reversed.`);
    if (r.fieldErrors) return r.fieldErrors;
    setRejecting(null);
  };

  return (
    <div>
      <PageHeader title="Cheque deposit approvals" subtitle="The first $100.00 is available right away; approve to release the held amount, or reject to reverse the deposit." />
      <PageAlert message={alert} testId="admin-deposits-action-error" />
      <Card testId="admin-deposits-card">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <SelectField id="status" label="Status" testId="admin-deposits-status-select" className="w-56" placeholder="All statuses" options={STATUSES}
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} />
          <Button variant="secondary" testId="admin-deposits-refresh-button" onClick={() => reload()}>Refresh</Button>
        </div>
        {error && <div className="mb-3"><Alert testId="admin-deposits-error">{error}</Alert></div>}
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="ib-table" data-testid="admin-deposits-table">
            <thead><tr><th>Submitted</th><th>Customer</th><th>Account</th><th className="text-right">Amount</th><th className="text-right">Held</th><th>Images</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {data?.content.map((d) => (
                <tr key={d.id} data-testid={`admin-deposit-row-${d.id}`}>
                  <td className="whitespace-nowrap"><span data-testid="admin-deposit-date">{formatDateTime(d.createdAt)}</span><span className="block text-xs text-muted" data-testid="admin-deposit-reference">{d.referenceId}</span></td>
                  <td className="whitespace-nowrap"><Link href={`/admin/customers/${d.customerId}`} className="ib-link" data-testid="admin-deposit-customer">{d.customerName}</Link></td>
                  <td className="whitespace-nowrap" data-testid="admin-deposit-account">{d.accountNumber}</td>
                  <td className="text-right tabular-nums" data-testid="admin-deposit-amount">{formatMoney(d.amount)}</td>
                  <td className="text-right tabular-nums" data-testid="admin-deposit-held">{formatMoney(d.heldAmount)}</td>
                  <td>
                    <div className="flex gap-2">
                      {(["front", "back"] as const).map((side) => (
                        <a key={side} href={`/api/v1/admin/deposits/${d.id}/images/${side}`} target="_blank" rel="noopener" data-testid={`admin-deposit-${side}-link-${d.id}`}
                          className="block text-center text-xs text-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/v1/admin/deposits/${d.id}/images/${side}`} alt={`Cheque ${side}, deposit ${d.referenceId}`} data-testid={`admin-deposit-${side}-image-${d.id}`}
                            className="h-12 w-24 object-cover rounded border border-line bg-frost" />
                          {side === "front" ? "Front" : "Back"}
                        </a>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={d.status} testId="admin-deposit-status" />
                    {d.rejectReason && <span className="block text-xs text-muted mt-1" data-testid="admin-deposit-reject-reason">{d.rejectReason}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {d.status === "PENDING" ? (
                      <div className="flex gap-2 justify-end">
                        <Button className="!py-1 !px-3 text-sm" testId={`admin-deposit-approve-${d.id}`} disabled={busy === d.id} onClick={() => approve(d)}>{busy === d.id ? "Approving…" : "Approve"}</Button>
                        <Button variant="danger" className="!py-1 !px-3 text-sm" testId={`admin-deposit-reject-${d.id}`} disabled={busy === d.id} onClick={() => setRejecting(d)}>Reject</Button>
                      </div>
                    ) : <span className="text-xs text-muted" data-testid="admin-deposit-decided">{d.decidedAt ? `Decided ${formatDateTime(d.decidedAt)}` : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && <div className="py-6"><Spinner /></div>}
          {data && data.content.length === 0 && <EmptyState testId="admin-deposits-empty">No {status ? status.toLowerCase() : ""} cheque deposits.</EmptyState>}
        </div>
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="admin-deposits-pagination" />}
      </Card>

      <ReasonModal open={!!rejecting} title="Reject cheque deposit" testId="admin-reject-modal" confirmLabel="Reject deposit"
        intro={rejecting && <p>Reject deposit <strong>{rejecting.referenceId}</strong> of <strong>{formatMoney(rejecting.amount)}</strong> from {rejecting.customerName}? The full amount is reversed from the account.</p>}
        onCancel={() => setRejecting(null)} onConfirm={reject} />
    </div>
  );
}
