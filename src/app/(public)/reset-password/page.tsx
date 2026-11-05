"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, TextField } from "@/ui/components";
import { PasswordRules } from "@/ui/password-rules";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!pw) fe.newPassword = "Enter a new password.";
    if (pw !== confirm) fe.confirm = "The passwords do not match.";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password/reset", { body: { token, newPassword: pw }, noAuthRedirect: true });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiProblem) { setErrors(err.fieldErrors()); if (!err.errors.length) setError(err.message); }
      setBusy(false);
    }
  }

  if (!token) return <div className="max-w-md mx-auto px-6 py-16"><Alert testId="reset-error">This reset link is missing its token. Ask for a new link.</Alert></div>;
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-navy mb-6" data-testid="page-title">Choose a new password</h1>
      {error && <div className="mb-4"><Alert testId="reset-error">{error}</Alert></div>}
      <form onSubmit={submit} noValidate className="ib-card p-6 space-y-4" data-testid="reset-form">
        <TextField id="newPassword" label="New password" type="password" autoComplete="new-password" testId="reset-password-input" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.newPassword} />
        <PasswordRules password={pw} />
        <TextField id="confirm" label="Confirm new password" type="password" autoComplete="new-password" testId="reset-confirm-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit" testId="reset-submit-button" className="w-full" disabled={busy}>Change password</Button>
      </form>
    </div>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
