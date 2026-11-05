"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, ApiProblem, newIdempotencyKey } from "@/ui/api";
import { useAccounts, useApi, accountOption, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, SelectField, Spinner, StatusBadge, TextField } from "@/ui/components";
import { formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import type { ChequeDeposit } from "@/ui/services/banking";
import { CHEQUE_ACCEPT, checkChequeImage, formatBytes } from "@/ui/services/cheque-files";

type Side = "front" | "back";

export default function DepositPage() {
  const toast = useToast();
  const { data: accounts, reload: reloadAccounts } = useAccounts();
  const [historyPage, setHistoryPage] = useState(0);
  const history = useApi<Page<ChequeDeposit>>(`/deposits?page=${historyPage}&size=10`);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<Record<Side, File | null>>({ front: null, back: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChequeDeposit | null>(null);
  const key = useRef(newIdempotencyKey());
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const targets = accounts?.filter((a) => a.type === "CHEQUING" || a.type === "SAVINGS") ?? [];
  const accountName = (id: number) => accounts?.find((a) => a.id === id)?.displayName ?? `Account ${id}`;

  function pick(side: Side, file: File | null) {
    setFiles((f) => ({ ...f, [side]: file }));
    const field = side === "front" ? "frontImage" : "backImage";
    setErrors((e) => {
      const next = { ...e };
      const problem = file ? checkChequeImage(file) : null;
      if (problem) next[field] = problem; else delete next[field];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!accountId) fe.accountId = "Choose the account to deposit into.";
    if (!amount.trim()) fe.amount = "Enter the cheque amount.";
    else if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) fe.amount = "Enter an amount like 250.00 (at most 2 decimals).";
    else if (Number(amount) <= 0) fe.amount = "The amount must be at least $0.01.";
    const front = checkChequeImage(files.front);
    const back = checkChequeImage(files.back);
    if (front) fe.frontImage = front;
    if (back) fe.backImage = back;
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;

    const form = new FormData();
    form.append("accountId", accountId);
    form.append("amount", amount.trim());
    form.append("frontImage", files.front!);
    form.append("backImage", files.back!);
    setBusy(true);
    try {
      const d = await api<ChequeDeposit>("/deposits/cheque", { form, idempotencyKey: key.current });
      setResult(d);
      toast.success(`Cheque deposit of ${formatMoney(d.amount)} received.`);
      reloadAccounts();
      setHistoryPage(0);
      history.reload();
    } catch (err) {
      key.current = newIdempotencyKey();
      if (err instanceof ApiProblem) {
        setErrors(err.fieldErrors());
        setError(err.errors.length ? "Please fix the highlighted fields." : err.message);
        toast.error(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setAmount(""); setFiles({ front: null, back: null }); setResult(null); setErrors({}); setError(null);
    key.current = newIdempotencyKey();
    if (frontRef.current) frontRef.current.value = "";
    if (backRef.current) backRef.current.value = "";
  }

  const fileInput = (side: Side, ref: React.RefObject<HTMLInputElement | null>) => {
    const field = side === "front" ? "frontImage" : "backImage";
    const id = `deposit-${side}`;
    const file = files[side];
    const err = errors[field];
    return (
      <div>
        <label className="ib-label" htmlFor={id}>{side === "front" ? "Front of cheque" : "Back of cheque (signed)"}</label>
        <input ref={ref} id={id} name={field} type="file" accept={CHEQUE_ACCEPT} className="ib-input" data-testid={`deposit-${side}-input`}
          aria-invalid={err ? true : undefined} aria-describedby={`${id}-help`} onChange={(e) => pick(side, e.target.files?.[0] ?? null)} />
        {file ? (
          <p className="ib-help" id={`${id}-help`} data-testid={`deposit-${side}-file-info`}>
            <span data-testid={`deposit-${side}-file-name`}>{file.name}</span> · <span data-testid={`deposit-${side}-file-size`}>{formatBytes(file.size)}</span>
          </p>
        ) : (
          <p className="ib-help" id={`${id}-help`}>JPG or PNG, 5 MB or smaller.</p>
        )}
        {err && <p className="ib-error" role="alert" data-testid={`deposit-${side}-error`}>{err}</p>}
      </div>
    );
  };

  if (!accounts) return <Spinner label="Loading accounts" />;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Deposit a cheque" subtitle="Take a photo of the front and back of your cheque and deposit it from anywhere." />
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          {error && <div className="mb-4"><Alert testId="deposit-error">{error}</Alert></div>}
          {!result ? (
            <Card>
              <form onSubmit={submit} noValidate className="space-y-4" data-testid="deposit-form">
                <SelectField id="accountId" label="Deposit to" testId="deposit-account-select" placeholder="Choose an account" value={accountId}
                  onChange={(e) => setAccountId(e.target.value)} options={targets.map((a) => accountOption(a, formatMoney))} error={errors.accountId} />
                <TextField id="amount" label="Cheque amount (CAD)" inputMode="decimal" placeholder="0.00" testId="deposit-amount-input" value={amount}
                  onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
                {fileInput("front", frontRef)}
                {fileInput("back", backRef)}
                <Button type="submit" testId="deposit-submit-button" disabled={busy}>{busy ? "Uploading…" : "Deposit cheque"}</Button>
                {busy && <div><Spinner label="Uploading your cheque images…" /></div>}
              </form>
            </Card>
          ) : (
            <Card testId="deposit-result">
              <p className="text-success font-bold text-lg mb-2" data-testid="deposit-success-message">Cheque received</p>
              <dl className="grid grid-cols-3 gap-y-2 text-sm mb-6">
                <dt className="text-muted">Account</dt><dd className="col-span-2" data-testid="deposit-result-account">{accountName(result.accountId)}</dd>
                <dt className="text-muted">Amount</dt><dd className="col-span-2 font-semibold" data-testid="deposit-result-amount">{formatMoney(result.amount)}</dd>
                <dt className="text-muted">Available now</dt><dd className="col-span-2 text-success font-semibold" data-testid="deposit-result-immediate">{formatMoney(result.immediateAmount)}</dd>
                <dt className="text-muted">On hold</dt><dd className="col-span-2" data-testid="deposit-result-held">{formatMoney(result.heldAmount)}</dd>
                <dt className="text-muted">Status</dt><dd className="col-span-2"><StatusBadge status={result.status} testId="deposit-result-status" /></dd>
                <dt className="text-muted">Reference</dt><dd className="col-span-2 font-mono" data-testid="deposit-result-reference">{result.referenceId}</dd>
              </dl>
              {Number(result.heldAmount) > 0 && (
                <p className="text-sm text-muted mb-4" data-testid="deposit-result-hold-note">The rest of the cheque will be available once our team reviews it.</p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" testId="deposit-another-button" onClick={again}>Deposit another cheque</Button>
                <Link href={`/accounts/${result.accountId}`} className="ib-btn ib-btn-primary" data-testid="deposit-view-account-link">View account</Link>
              </div>
            </Card>
          )}
        </div>
        <Card testId="deposit-rules">
          <h2 className="font-bold text-navy mb-3">How mobile deposit works</h2>
          <ul className="text-sm space-y-2 list-disc pl-5">
            <li data-testid="deposit-rule-limit">You can deposit up to <strong>$5,000.00</strong> per day.</li>
            <li data-testid="deposit-rule-immediate">The first <strong>$100.00</strong> of each cheque is available right away.</li>
            <li data-testid="deposit-rule-hold">The rest is on hold until our team reviews the cheque.</li>
            <li>Only chequing and savings accounts can receive cheque deposits.</li>
            <li>Images must be JPG or PNG files, 5 MB or smaller.</li>
            <li>Sign the back of the cheque and write &quot;For mobile deposit at Ice Bank&quot;.</li>
          </ul>
        </Card>
      </div>

      <Card testId="deposit-history">
        <h2 className="font-bold text-navy text-lg mb-4">Deposit history</h2>
        {history.error && <Alert testId="deposit-history-error">{history.error}</Alert>}
        {!history.data && !history.error && <Spinner label="Loading deposits" />}
        {history.data && history.data.content.length === 0 && <EmptyState testId="deposit-history-empty">You have not deposited any cheques yet.</EmptyState>}
        {history.data && history.data.content.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ib-table" data-testid="deposit-history-table">
              <thead><tr><th>Date</th><th>Account</th><th>Reference</th><th className="!text-right">Amount</th><th className="!text-right">Available now</th><th className="!text-right">On hold</th><th>Status</th></tr></thead>
              <tbody>
                {history.data.content.map((d) => (
                  <tr key={d.id} data-testid={`deposit-row-${d.id}`}>
                    <td className="whitespace-nowrap" data-testid="deposit-row-date">{formatDateTime(d.createdAt)}</td>
                    <td data-testid="deposit-row-account">{accountName(d.accountId)}</td>
                    <td className="font-mono text-xs" data-testid="deposit-row-reference">{d.referenceId}</td>
                    <td className="text-right tabular-nums" data-testid="deposit-row-amount">{formatMoney(d.amount)}</td>
                    <td className="text-right tabular-nums" data-testid="deposit-row-immediate">{formatMoney(d.immediateAmount)}</td>
                    <td className="text-right tabular-nums" data-testid="deposit-row-held">{formatMoney(d.heldAmount)}</td>
                    <td>
                      <StatusBadge status={d.status} testId="deposit-row-status" />
                      {d.rejectReason && <span className="block text-xs text-alert mt-1" data-testid="deposit-row-reject-reason">{d.rejectReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.data && history.data.totalPages > 1 && (
          <Pagination page={history.data.page} totalPages={history.data.totalPages} totalElements={history.data.totalElements} onPage={setHistoryPage} testId="deposit-history-pagination" />
        )}
      </Card>
    </div>
  );
}
