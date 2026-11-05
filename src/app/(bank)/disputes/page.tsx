"use client";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { useAccounts, useApi, accountOption, type Page, type Transaction } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, SelectField, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { DISPUTE_REASONS, DISPUTE_REASON_LABEL, type Dispute } from "@/ui/services/banking";

export default function DisputesPage() {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const list = useApi<Page<Dispute>>(`/disputes?page=${page}&size=10`);
  const { data: accounts } = useAccounts();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Dispute | null>(null);
  const txs = useApi<Page<Transaction>>(accountId ? `/accounts/${accountId}/transactions?direction=DEBIT&status=POSTED&size=50` : null);

  const sources = accounts?.filter((a) => a.type !== "LOAN") ?? [];

  function start() {
    setOpen(true); setCreated(null); setAccountId(""); setTransactionId(""); setReason(""); setDescription(""); setErrors({}); setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!accountId) fe.accountId = "Choose an account.";
    if (!transactionId) fe.transactionId = "Choose the transaction to dispute.";
    if (!reason) fe.reason = "Choose a reason.";
    if (description.length > 500) fe.description = "Use at most 500 characters.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const d = await api<Dispute>("/disputes", { body: { transactionId: Number(transactionId), reason, description: description.trim() || undefined } });
      setCreated(d);
      setOpen(false);
      toast.success(`Dispute #${d.id} opened. We will review it within 10 business days.`);
      setPage(0);
      list.reload();
    } catch (err) {
      if (err instanceof ApiProblem) {
        setErrors(err.fieldErrors());
        setError(err.errors.length ? "Please fix the highlighted fields." : err.message);
        toast.error(err.message);
      } else setError("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Disputes" subtitle="Don't recognise a charge? Tell us and we will investigate."
        actions={!open ? <Button testId="dispute-open-button" onClick={start}>Open a dispute</Button> : undefined} />
      {created && (
        <div className="mb-4"><Alert kind="success" testId="dispute-success-message">
          Dispute <strong data-testid="dispute-success-id">#{created.id}</strong> opened for {created.transaction.description} ({formatMoney(created.transaction.amount)}).
        </Alert></div>
      )}
      {open && (
        <Card className="mb-6" testId="dispute-form-card">
          <h2 className="font-bold text-navy text-lg mb-1">Open a dispute</h2>
          <p className="text-sm text-muted mb-4" data-testid="dispute-rules">
            You can dispute money that left your account (posted debits) within <strong>60 days</strong> of the date it posted. Each transaction can have one open dispute.
          </p>
          {error && <div className="mb-4"><Alert testId="dispute-error">{error}</Alert></div>}
          <form onSubmit={submit} noValidate className="space-y-4" data-testid="dispute-form">
            <SelectField id="accountId" label="Account" testId="dispute-account-select" placeholder="Choose an account" value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setTransactionId(""); }} options={sources.map((a) => accountOption(a, formatMoney))} error={errors.accountId} />
            {accountId && (
              txs.loading && !txs.data ? <Spinner label="Loading transactions" /> : txs.error ? <Alert testId="dispute-transactions-error">{txs.error}</Alert> : (
                <SelectField id="transactionId" label="Transaction" testId="dispute-transaction-select" placeholder={txs.data?.content.length ? "Choose a transaction" : "No posted debits on this account"}
                  value={transactionId} onChange={(e) => setTransactionId(e.target.value)} error={errors.transactionId}
                  help="Your 50 most recent posted debits."
                  options={(txs.data?.content ?? []).map((t) => ({ value: String(t.id), label: `${formatDate(t.postedAt ?? t.createdAt)} · ${t.description} · ${formatMoney(t.amount)}` }))} />
              )
            )}
            <SelectField id="reason" label="Reason" testId="dispute-reason-select" placeholder="Choose a reason" value={reason} onChange={(e) => setReason(e.target.value)}
              options={DISPUTE_REASONS.map((r) => ({ value: r, label: DISPUTE_REASON_LABEL[r] }))} error={errors.reason} />
            <div>
              <label className="ib-label" htmlFor="description">Description (optional)</label>
              <textarea id="description" name="description" rows={3} maxLength={500} className="ib-input" data-testid="dispute-description-input"
                aria-invalid={errors.description ? true : undefined} value={description} onChange={(e) => setDescription(e.target.value)} />
              <p className="ib-help" data-testid="dispute-description-count">{description.length}/500</p>
              {errors.description && <p className="ib-error" role="alert" data-testid="dispute-description-error">{errors.description}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" testId="dispute-cancel-button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" testId="dispute-submit-button" disabled={busy}>{busy ? "Submitting…" : "Submit dispute"}</Button>
            </div>
          </form>
        </Card>
      )}
      <Card testId="disputes-card">
        <h2 className="font-bold text-navy text-lg mb-4">My disputes</h2>
        {list.error && <Alert testId="disputes-error">{list.error}</Alert>}
        {!list.data && !list.error && <Spinner label="Loading disputes" />}
        {list.data && list.data.content.length === 0 && <EmptyState testId="disputes-empty">You have no disputes.</EmptyState>}
        {list.data && list.data.content.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ib-table" data-testid="disputes-table">
              <thead><tr><th>Opened</th><th>Transaction</th><th className="!text-right">Amount</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {list.data.content.map((d) => (
                  <tr key={d.id} data-testid={`dispute-row-${d.id}`}>
                    <td className="whitespace-nowrap" data-testid="dispute-row-date">{formatDateTime(d.createdAt)}</td>
                    <td data-testid="dispute-row-transaction">{d.transaction.description}<span className="block text-xs text-muted">{d.transaction.referenceId}</span>
                      {d.description && <span className="block text-xs text-muted mt-1" data-testid="dispute-row-description">“{d.description}”</span>}</td>
                    <td className="text-right tabular-nums" data-testid="dispute-row-amount">{formatMoney(d.transaction.amount)}</td>
                    <td data-testid="dispute-row-reason">{humanize(d.reason)}</td>
                    <td><StatusBadge status={d.status} testId="dispute-row-status" />
                      {d.resolvedAt && <span className="block text-xs text-muted mt-1">{formatDate(d.resolvedAt)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.totalPages > 1 && (
          <Pagination page={list.data.page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} onPage={setPage} testId="disputes-pagination" />
        )}
      </Card>
    </div>
  );
}
