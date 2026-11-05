"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, TextField } from "@/ui/components";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address."); return; }
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ message: string }>("/auth/password/forgot", { body: { email }, noAuthRedirect: true });
      setSent(r.message);
    } catch (err) {
      setError(err instanceof ApiProblem ? (err.fieldErrors().email ?? err.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-navy mb-1" data-testid="page-title">Reset your password</h1>
      <p className="text-muted mb-6">We will send a reset link to Ice Mail. It works once and expires in 30 minutes.</p>
      {sent ? (
        <div className="space-y-4">
          <Alert kind="success" testId="forgot-success">{sent}</Alert>
          <a href={`/mail?email=${encodeURIComponent(email)}`} target="_blank" rel="noopener" className="ib-link" data-testid="forgot-open-icemail-link">Open Ice Mail ↗</a>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="ib-card p-6 space-y-4" data-testid="forgot-form">
          <TextField id="email" label="Email" type="email" testId="forgot-email-input" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" testId="forgot-submit-button" className="w-full" disabled={busy}>Send reset link</Button>
          <Link href="/login" className="ib-link text-sm" data-testid="forgot-back-link">Back to sign in</Link>
        </form>
      )}
    </div>
  );
}
