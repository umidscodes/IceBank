"use client";
import { useState } from "react";
import { api } from "@/ui/api";
import { useSession } from "@/ui/session";
import { useAccounts, useApi, accountOption } from "@/ui/types";
import { Alert, Button, Card, Modal, PageHeader, SelectField, Spinner, StatusBadge, TextField } from "@/ui/components";
import { formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { depositAccounts, describeProblem, Details, withLabels, type Autodeposit } from "@/ui/payments/shared";

const LABELS = { email: "Email", accountId: "Deposit account", otpCode: "Code" };

export default function AutodepositPage() {
  const toast = useToast();
  const { me } = useSession();
  const { data: status, error: loadError, setData } = useApi<Autodeposit>("/etransfers/autodeposit");
  const { data: accounts } = useAccounts();
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState(me.email);
  const [accountId, setAccountId] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const targets = depositAccounts(accounts).filter((a) => a.status === "OPEN");
  const accountName = (id: number | null) => accounts?.find((a) => a.id === id)?.displayName ?? (id ? `Account ${id}` : "-");

  async function put(body: Record<string, unknown>, success: (s: Autodeposit) => string) {
    setBusy(true);
    setError(null);
    try {
      const s = await api<Autodeposit>("/etransfers/autodeposit", { method: "PUT", body });
      setData(s);
      setErrors({});
      setCode("");
      setChanging(false);
      toast.success(success(s));
      return true;
    } catch (err) {
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, LABELS));
      setError(p.message);
      toast.error(p.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!email.trim()) fe.email = "Enter your email address.";
    if (!accountId) fe.accountId = "Choose the account to deposit into.";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    put({ email: email.trim(), accountId: Number(accountId) }, () => "We sent a confirmation code to Ice Mail.");
  }

  function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setErrors({ otpCode: "Enter the 6-digit code from Ice Mail." }); return; }
    put({ otpCode: code.trim() }, () => "Autodeposit is now on.");
  }

  async function turnOff() {
    await put({ enabled: false }, () => "Autodeposit is turned off.");
    setConfirmOff(false);
  }

  function startChange() {
    setChanging(true);
    setErrors({});
    setError(null);
    setEmail(status?.email ?? me.email);
    setAccountId(status?.accountId ? String(status.accountId) : "");
  }

  const showRegister = status && (status.status === "NONE" || changing);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Interac e-Transfer Autodeposit" subtitle="Money sent to your email is deposited automatically, with no security question." />
      {loadError && <Alert testId="autodeposit-load-error">{loadError}</Alert>}
      {!status ? (!loadError && <Spinner />) : (
        <div className="space-y-6">
          <Card testId="autodeposit-status-card">
            <div className="flex justify-between items-start gap-4 mb-4">
              <h2 className="font-bold text-navy text-lg">Status</h2>
              <StatusBadge status={status.status === "NONE" ? "NOT_REGISTERED" : status.status} testId="autodeposit-status" />
            </div>
            {status.status === "NONE" ? (
              <p className="text-sm text-muted" data-testid="autodeposit-status-text">Autodeposit is off. Senders must set a security question, and you answer it to deposit each e-Transfer.</p>
            ) : (
              <Details rows={[
                ["Email", status.email ?? "-", "autodeposit-email"],
                ["Deposit account", accountName(status.accountId), "autodeposit-account"],
                ...(status.confirmedAt ? [["Active since", formatDateTime(status.confirmedAt), "autodeposit-confirmed-at"] as [string, string, string]] : []),
              ]} />
            )}
            {status.status !== "NONE" && !changing && (
              <div className="flex gap-2 mt-5">
                <Button variant="secondary" testId="autodeposit-change-button" onClick={startChange}>Change account</Button>
                <Button variant="secondary" className="!text-alert" testId="autodeposit-turn-off-button" onClick={() => { setError(null); setConfirmOff(true); }}>Turn off Autodeposit</Button>
              </div>
            )}
          </Card>

          {error && <Alert testId="autodeposit-error">{error}</Alert>}

          {status.status === "PENDING_CONFIRMATION" && !changing && (
            <Card testId="autodeposit-confirm-card">
              <h2 className="font-bold text-navy mb-2">Enter your confirmation code</h2>
              <p className="text-sm text-muted mb-4">
                We sent a 6-digit code to <strong>{status.email}</strong>.{" "}
                <a href="/mail" target="_blank" rel="noopener" className="ib-link" data-testid="autodeposit-open-mail-link">Open Ice Mail ↗</a> in a new tab to read it.
              </p>
              <form onSubmit={confirmCode} noValidate className="flex flex-wrap gap-3 items-start" data-testid="autodeposit-confirm-form">
                <TextField id="otpCode" label="Confirmation code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="w-48"
                  testId="autodeposit-code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={errors.otpCode} />
                <Button type="submit" className="mt-6" testId="autodeposit-confirm-button" disabled={busy}>{busy ? "Confirming…" : "Confirm"}</Button>
              </form>
              <p className="text-xs text-muted mt-3">The code expires in a few minutes. You can try 3 times. Need a new code? Use <em>Change account</em> to register again.</p>
            </Card>
          )}

          {showRegister && (
            <Card testId="autodeposit-register-card">
              <h2 className="font-bold text-navy mb-4">{status.status === "NONE" ? "Register for Autodeposit" : "Update your registration"}</h2>
              <form onSubmit={register} noValidate className="space-y-4" data-testid="autodeposit-register-form">
                <TextField id="email" label="Email" type="email" testId="autodeposit-email-input" value={email} onChange={(e) => setEmail(e.target.value)}
                  error={errors.email} help="Must be the email you sign in with." />
                {!accounts ? <Spinner label="Loading accounts" /> : (
                  <SelectField id="accountId" label="Deposit to" testId="autodeposit-account-select" placeholder="Choose an account" value={accountId}
                    onChange={(e) => setAccountId(e.target.value)} options={targets.map((a) => accountOption(a, formatMoney))} error={errors.accountId}
                    help="Chequing or savings accounts only." />
                )}
                <p className="text-sm text-muted">We will send a confirmation code to this email in Ice Mail. Autodeposit starts once you enter it.</p>
                <div className="flex gap-2">
                  <Button type="submit" testId="autodeposit-register-button" disabled={busy}>{busy ? "Sending code…" : "Send confirmation code"}</Button>
                  {changing && <Button variant="secondary" testId="autodeposit-cancel-change-button" onClick={() => { setChanging(false); setErrors({}); setError(null); }}>Cancel</Button>}
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
      <Modal open={confirmOff} title="Turn off Autodeposit?" testId="autodeposit-off-modal" onClose={() => setConfirmOff(false)}
        footer={<>
          <Button variant="secondary" testId="autodeposit-off-cancel-button" onClick={() => setConfirmOff(false)}>Keep it on</Button>
          <Button variant="danger" testId="autodeposit-off-confirm-button" disabled={busy} onClick={turnOff}>Turn off</Button>
        </>}>
        <p>New e-Transfers sent to you will need a security answer before you can deposit them.</p>
      </Modal>
    </div>
  );
}
