"use client";
/** Admin (teller) portal: response types, a mutation helper and the reason modal shared by several pages. */
import { useEffect, useState } from "react";
import { ApiProblem } from "../api";
import { Alert, Button, Modal } from "../components";
import { useToast } from "../toast";
import type { Account } from "../types";

export interface CustomerSummary {
  id: number; userId: number; firstName: string; lastName: string; email: string; phone: string; city: string; province: string;
  userStatus: "ACTIVE" | "LOCKED" | "DISABLED"; accountCount: number; createdAt: string;
}
export interface CustomerDetail extends CustomerSummary {
  dateOfBirth: string; address: { line1: string; line2: string | null; city: string; province: string; postalCode: string };
  sinLast3: string; failedLoginCount: number; lockedUntil: string | null; lastLoginAt: string | null;
  accounts: Account[]; cards: { id: number; type: string; maskedNumber: string; status: string; accountId: number }[];
}
export interface AdminDeposit {
  id: number; accountId: number; accountNumber: string; amount: string; immediateAmount: string; heldAmount: string; status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null; frontImage: { contentType: string; bytes: number }; backImage: { contentType: string; bytes: number };
  transactionId: number | null; referenceId: string; createdAt: string; decidedAt: string | null; customerId: number; customerName: string;
}
export interface AdminLoanApp {
  id: number; customerId: number; customerName: string; amount: string; termMonths: number; purpose: string; annualIncome: string;
  monthlyDebtPayments: string; apr: string; monthlyPayment: string; dtiPercent: string; status: string; decisionSource: string;
  decisionReason: string | null; disbursementAccountId: number; loanId: number | null; createdAt: string; decidedAt: string | null;
}
export interface AuditEntry {
  id: number; actorUserId: number | null; actorEmail: string | null; action: string; entityType: string; entityId: number | null;
  oldValue: unknown; newValue: unknown; createdAt: string;
}

/**
 * Run an admin mutation: toast on success, toast + page alert on 409/422 (and other errors), reload afterwards.
 * Returns field errors (400) so a modal can show them, or null when the action finished (success or business error).
 */
export function useAdminAction(reload: () => unknown) {
  const toast = useToast();
  const [alert, setAlert] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, success: string): Promise<{ ok: boolean; fieldErrors?: Record<string, string> }> {
    setAlert(null);
    try {
      await fn();
      toast.success(success);
      await reload();
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiProblem && err.status === 400 && err.errors.length) return { ok: false, fieldErrors: err.fieldErrors() };
      const msg = err instanceof ApiProblem ? err.message : "Something went wrong. Please try again.";
      setAlert(msg);
      toast.error(msg);
      await reload();
      return { ok: false };
    }
  }
  return { run, alert, clearAlert: () => setAlert(null) };
}

/** Modal asking for a 3 to 200 character reason (freeze an account, reject a deposit). */
export function ReasonModal({ open, title, intro, confirmLabel, testId, onCancel, onConfirm, danger = true }: {
  open: boolean; title: string; intro: React.ReactNode; confirmLabel: string; testId: string; danger?: boolean;
  onCancel: () => void; onConfirm: (reason: string) => Promise<Record<string, string> | void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(""); setError(null); setBusy(false); } }, [open]);

  async function confirm() {
    const r = reason.trim();
    if (r.length < 3 || r.length > 200) { setError("Enter a reason of 3 to 200 characters."); return; }
    setBusy(true);
    const fe = await onConfirm(r);
    setBusy(false);
    if (fe) setError(fe.reason ? `Reason ${fe.reason}.` : Object.values(fe).join("; "));
  }

  return (
    <Modal open={open} title={title} testId={testId} onClose={onCancel}
      footer={<>
        <Button variant="secondary" testId={`${testId}-cancel-button`} onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} testId={`${testId}-confirm-button`} onClick={confirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
      </>}>
      <div className="mb-3">{intro}</div>
      <label className="ib-label" htmlFor={`${testId}-reason`}>Reason</label>
      <textarea id={`${testId}-reason`} className="ib-input" rows={3} maxLength={200} value={reason} data-testid={`${testId}-reason-input`}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${testId}-reason-error` : `${testId}-reason-help`}
        onChange={(e) => { setReason(e.target.value); setError(null); }} />
      {error
        ? <p className="ib-error" id={`${testId}-reason-error`} data-testid={`${testId}-reason-error`} role="alert">{error}</p>
        : <p className="ib-help" id={`${testId}-reason-help`}>3 to 200 characters. Recorded in the audit log.</p>}
    </Modal>
  );
}

export function PageAlert({ message, testId }: { message: string | null; testId: string }) {
  if (!message) return null;
  return <div className="mb-4"><Alert testId={testId}>{message}</Alert></div>;
}
