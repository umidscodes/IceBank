"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, ApiProblem, newIdempotencyKey } from "@/ui/api";
import { useAccounts, accountOption } from "@/ui/types";
import { Alert, Button, Card, PageHeader, SelectField, Spinner, TextField, processingDelay } from "@/ui/components";
import { formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";

interface Transfer { id: number; amount: string; referenceId: string; createdAt: string; fromAccountId: number; toAccountId: number; memo: string | null }

export default function TransferPage() {
  const toast = useToast();
  const { data: accounts, reload } = useAccounts();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "review" | "processing" | "done">("form");
  const [result, setResult] = useState<Transfer | null>(null);
  const key = useRef(newIdempotencyKey());

  const sources = accounts?.filter((a) => a.type !== "LOAN") ?? [];
  const label = (id: string) => accounts?.find((a) => String(a.id) === id)?.displayName ?? "";

  function review(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!from) fe.fromAccountId = "Choose the account to transfer from.";
    if (!to) fe.toAccountId = "Choose the account to transfer to.";
    if (!amount.trim()) fe.amount = "Enter an amount.";
    else if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) fe.amount = "Enter an amount like 25.00 (at most 2 decimals).";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length === 0) setPhase("review");
  }

  const submitting = useRef(false);
  async function confirm() {
    if (submitting.current) return; // a double click must not send the request twice
    submitting.current = true;
    setPhase("processing");
    try {
      const [r] = await Promise.all([
        api<Transfer>("/transfers", { body: { fromAccountId: Number(from), toAccountId: Number(to), amount: amount.trim(), memo: memo || undefined }, idempotencyKey: key.current }),
        processingDelay(),
      ]);
      setResult(r);
      submitting.current = false;
      setPhase("done");
      toast.success(`Transfer of ${formatMoney(r.amount)} completed.`);
      reload();
    } catch (err) {
      submitting.current = false;
      setPhase("form");
      key.current = newIdempotencyKey();
      if (!(err instanceof ApiProblem)) {
        setError("We could not reach Ice Bank. Check your connection, then try again. Your transfer was not sent.");
        toast.error("Network error: the transfer was not sent.");
      }
      if (err instanceof ApiProblem) {
        setErrors(err.fieldErrors());
        setError(err.message === "One or more fields are invalid." ? "Please fix the highlighted fields." : err.message);
        toast.error(err.message);
      }
    }
  }

  function again() {
    setAmount(""); setMemo(""); setResult(null); setPhase("form"); key.current = newIdempotencyKey();
  }

  if (!accounts) return <Spinner label="Loading accounts" />;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Transfer between my accounts" subtitle="Transfers are instant. $0.01 to $999,999.99." />
      {error && <div className="mb-4"><Alert testId="transfer-error">{error}</Alert></div>}
      {phase === "form" && (
        <Card>
          <form onSubmit={review} noValidate className="space-y-4" data-testid="transfer-form">
            <SelectField id="fromAccountId" label="From" testId="transfer-from-select" placeholder="Choose an account" value={from} onChange={(e) => setFrom(e.target.value)}
              options={sources.map((a) => accountOption(a, formatMoney))} error={errors.fromAccountId} />
            <SelectField id="toAccountId" label="To" testId="transfer-to-select" placeholder="Choose an account" value={to} onChange={(e) => setTo(e.target.value)}
              options={accounts.map((a) => accountOption(a, formatMoney))} error={errors.toAccountId} />
            <TextField id="amount" label="Amount (CAD)" inputMode="decimal" placeholder="0.00" testId="transfer-amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
            <TextField id="memo" label="Memo (optional)" maxLength={100} testId="transfer-memo-input" value={memo} onChange={(e) => setMemo(e.target.value)} error={errors.memo} />
            <Button type="submit" testId="transfer-review-button">Review transfer</Button>
          </form>
        </Card>
      )}
      {phase === "review" && (
        <Card testId="transfer-review">
          <h2 className="font-bold text-navy mb-4">Review and confirm</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm mb-6">
            <dt className="text-muted">From</dt><dd className="col-span-2" data-testid="transfer-review-from">{label(from)}</dd>
            <dt className="text-muted">To</dt><dd className="col-span-2" data-testid="transfer-review-to">{label(to)}</dd>
            <dt className="text-muted">Amount</dt><dd className="col-span-2 font-semibold" data-testid="transfer-review-amount">{formatMoney(amount.trim())}</dd>
            {memo && <><dt className="text-muted">Memo</dt><dd className="col-span-2">{memo}</dd></>}
          </dl>
          <div className="flex gap-2">
            <Button variant="secondary" testId="transfer-edit-button" onClick={() => setPhase("form")}>Edit</Button>
            <Button testId="transfer-confirm-button" onClick={confirm}>Confirm transfer</Button>
          </div>
        </Card>
      )}
      {phase === "processing" && (
        <Card testId="transfer-processing"><Spinner label="Processing your transfer…" /></Card>
      )}
      {phase === "done" && result && (
        <Card testId="transfer-confirmation">
          <p className="text-success font-bold text-lg mb-2" data-testid="transfer-success-message">Transfer complete</p>
          <dl className="grid grid-cols-3 gap-y-2 text-sm mb-6">
            <dt className="text-muted">Amount</dt><dd className="col-span-2 font-semibold" data-testid="transfer-confirmation-amount">{formatMoney(result.amount)}</dd>
            <dt className="text-muted">Reference</dt><dd className="col-span-2 font-mono" data-testid="transfer-confirmation-reference">{result.referenceId}</dd>
            <dt className="text-muted">Date</dt><dd className="col-span-2">{formatDateTime(result.createdAt)}</dd>
          </dl>
          <div className="flex gap-2">
            <Button variant="secondary" testId="transfer-another-button" onClick={again}>Make another transfer</Button>
            <Link href={`/accounts/${result.fromAccountId}`} className="ib-btn ib-btn-primary" data-testid="transfer-view-account-link">View account</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
