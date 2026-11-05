"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/ui/api";
import { useApi, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Modal, PageHeader, Pagination, SelectField, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/ui/format";
import { PageAlert, useAdminAction, type AdminLoanApp } from "@/ui/admin/shared";

const STATUSES = [{ value: "MANUAL_REVIEW", label: "Manual review" }, { value: "APPROVED", label: "Approved" }, { value: "DECLINED", label: "Declined" }];

export default function AdminLoansPage() {
  const [status, setStatus] = useState("MANUAL_REVIEW");
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useApi<Page<AdminLoanApp>>(`/admin/loans?page=${page}&size=20${status ? `&status=${status}` : ""}`);
  const { run, alert } = useAdminAction(reload);
  const [deciding, setDeciding] = useState<AdminLoanApp | null>(null);

  const decide = async (decision: string, reason: string) => {
    const a = deciding!;
    const r = await run(() => api(`/admin/loans/${a.id}/decision`, { body: { decision, reason } }),
      decision === "APPROVED" ? `Application #${a.id} approved. ${formatMoney(a.amount)} deposited.` : `Application #${a.id} declined.`);
    if (r.fieldErrors) return r.fieldErrors;
    setDeciding(null);
  };

  return (
    <div>
      <PageHeader title="Loan reviews" subtitle="Applications with a debt-to-income ratio between 35% and 45% need a teller's decision." />
      <PageAlert message={alert} testId="admin-loans-action-error" />
      <Card testId="admin-loans-card">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <SelectField id="status" label="Status" testId="admin-loans-status-select" className="w-56" placeholder="All statuses" options={STATUSES}
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} />
          <Button variant="secondary" testId="admin-loans-refresh-button" onClick={() => reload()}>Refresh</Button>
        </div>
        {error && <div className="mb-3"><Alert testId="admin-loans-error">{error}</Alert></div>}
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="ib-table [&_td]:!px-2 [&_th]:!px-2" data-testid="admin-loans-table">
            <thead><tr>
              <th>Applied</th><th>Customer</th><th className="text-right">Amount</th><th className="text-right">Term</th><th className="text-right">Income / yr</th>
              <th className="text-right">Debts / mo</th><th className="text-right">DTI</th><th className="text-right">Payment / mo</th><th>Status</th><th className="text-right">Actions</th>
            </tr></thead>
            <tbody>
              {data?.content.map((a) => (
                <tr key={a.id} data-testid={`admin-loan-row-${a.id}`}>
                  <td className="whitespace-nowrap"><span data-testid="admin-loan-date" title={formatDateTime(a.createdAt)}>{formatDate(a.createdAt)}</span><span className="block text-xs text-muted">#{a.id} · {humanize(a.purpose)}</span></td>
                  <td className="whitespace-nowrap"><Link href={`/admin/customers/${a.customerId}`} className="ib-link" data-testid="admin-loan-customer">{a.customerName}</Link></td>
                  <td className="text-right tabular-nums" data-testid="admin-loan-amount">{formatMoney(a.amount)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap" data-testid="admin-loan-term">{a.termMonths} mo</td>
                  <td className="text-right tabular-nums" data-testid="admin-loan-income">{formatMoney(a.annualIncome)}</td>
                  <td className="text-right tabular-nums" data-testid="admin-loan-debts">{formatMoney(a.monthlyDebtPayments)}</td>
                  <td className="text-right tabular-nums" data-testid="admin-loan-dti">{a.dtiPercent}%</td>
                  <td className="text-right tabular-nums whitespace-nowrap" data-testid="admin-loan-payment">{formatMoney(a.monthlyPayment)}<span className="block text-xs text-muted">{a.apr}% APR</span></td>
                  <td className="max-w-[180px]">
                    <span className="whitespace-nowrap"><StatusBadge status={a.status} testId="admin-loan-status" /></span>
                    {a.decisionReason && a.status !== "MANUAL_REVIEW" && <span className="block text-xs text-muted mt-1" data-testid="admin-loan-decision-reason">{a.decisionReason}</span>}
                  </td>
                  <td className="text-right">
                    {a.status === "MANUAL_REVIEW"
                      ? <Button className="!py-1 !px-3 text-sm" testId={`admin-loan-decide-${a.id}`} onClick={() => setDeciding(a)}>Decide</Button>
                      : <span className="text-xs text-muted" data-testid="admin-loan-decision-source">{humanize(a.decisionSource)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && <div className="py-6"><Spinner /></div>}
          {data && data.content.length === 0 && <EmptyState testId="admin-loans-empty">No loan applications{status ? ` with status ${humanize(status).toLowerCase()}` : ""}.</EmptyState>}
        </div>
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="admin-loans-pagination" />}
      </Card>
      <DecisionModal app={deciding} onCancel={() => setDeciding(null)} onConfirm={decide} />
    </div>
  );
}

function DecisionModal({ app, onCancel, onConfirm }: {
  app: AdminLoanApp | null; onCancel: () => void; onConfirm: (decision: string, reason: string) => Promise<Record<string, string> | void>;
}) {
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDecision(""); setReason(""); setErrors({}); setBusy(false); }, [app]);

  async function confirm() {
    const fe: Record<string, string> = {};
    if (!decision) fe.decision = "Choose approve or decline.";
    const r = reason.trim();
    if (r.length < 3 || r.length > 200) fe.reason = "Enter a reason of 3 to 200 characters.";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    const server = await onConfirm(decision, r);
    setBusy(false);
    if (server) setErrors(Object.fromEntries(Object.entries(server).map(([k, v]) => [k, `${k === "reason" ? "Reason" : "Decision"} ${v}.`])));
  }

  return (
    <Modal open={!!app} title={app ? `Decide application #${app.id}` : ""} testId="admin-loan-decision-modal" onClose={onCancel}
      footer={<>
        <Button variant="secondary" testId="admin-loan-decision-cancel-button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button testId="admin-loan-decision-confirm-button" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Save decision"}</Button>
      </>}>
      {app && (
        <p className="mb-3">{app.customerName} applied for <strong>{formatMoney(app.amount)}</strong> over {app.termMonths} months (DTI {app.dtiPercent}%, payment {formatMoney(app.monthlyPayment)}/month).</p>
      )}
      <fieldset className="mb-3" aria-describedby={errors.decision ? "decision-error" : undefined}>
        <legend className="ib-label">Decision</legend>
        <div className="flex gap-6">
          {(["APPROVED", "DECLINED"] as const).map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => { setDecision(d); setErrors((e) => ({ ...e, decision: "" })); }}
                data-testid={`admin-loan-decision-${d.toLowerCase()}`} />
              {d === "APPROVED" ? "Approve" : "Decline"}
            </label>
          ))}
        </div>
        {errors.decision && <p className="ib-error" id="decision-error" data-testid="admin-loan-decision-error" role="alert">{errors.decision}</p>}
      </fieldset>
      <label className="ib-label" htmlFor="loan-reason">Reason</label>
      <textarea id="loan-reason" className="ib-input" rows={3} maxLength={200} value={reason} data-testid="admin-loan-reason-input"
        aria-invalid={errors.reason ? true : undefined} aria-describedby={errors.reason ? "loan-reason-error" : undefined}
        onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: "" })); }} />
      {errors.reason
        ? <p className="ib-error" id="loan-reason-error" data-testid="admin-loan-reason-error" role="alert">{errors.reason}</p>
        : <p className="ib-help">3 to 200 characters. Declines are sent to the customer.</p>}
      <div className="mt-3"><Alert kind="info" testId="admin-loan-decision-note"><span className="text-xs">Approving creates the loan account and deposits the money into the customer&apos;s chosen account.</span></Alert></div>
    </Modal>
  );
}
