"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, TextField } from "@/ui/components";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [state, setState] = useState<{ token: string; email: string; next: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("icebank-mfa");
      if (raw) setState(JSON.parse(raw));
      else router.replace("/login");
    } catch { router.replace("/login"); }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setFieldError("Enter the 6-digit code."); return; }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await api("/auth/mfa/verify", { body: { mfaToken: state?.token, code }, noAuthRedirect: true });
      sessionStorage.removeItem("icebank-mfa");
      const me = await api<{ role: string }>("/me");
      const next = state?.next && state.next.startsWith("/") && !state.next.startsWith("//") ? state.next : null;
      router.replace(me.role === "ADMIN" ? (next?.startsWith("/admin") ? next : "/admin") : next && !next.startsWith("/admin") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : "Something went wrong. Please try again.");
      if (err instanceof ApiProblem && ["OTP_EXPIRED", "OTP_ATTEMPTS_EXCEEDED", "MFA_TOKEN_INVALID"].includes(err.code)) {
        sessionStorage.removeItem("icebank-mfa");
      }
      setBusy(false);
    }
  }

  const email = state?.email ?? params.get("email") ?? "";
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-navy mb-1" data-testid="page-title">Enter your one-time code</h1>
      <p className="text-muted mb-6">We sent a 6-digit code to <strong data-testid="otp-email">{email}</strong> in Ice Mail. It expires in 5 minutes.</p>
      {error && <div className="mb-4"><Alert testId="otp-error">{error}</Alert></div>}
      <form onSubmit={submit} noValidate className="ib-card p-6 space-y-4" data-testid="otp-form">
        <TextField id="code" label="One-time code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} testId="otp-code-input"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={fieldError} />
        <Button type="submit" testId="otp-submit-button" className="w-full" disabled={busy || !state}>{busy ? "Verifying…" : "Verify and sign in"}</Button>
        <div className="flex justify-between text-sm">
          <a href={`/mail?email=${encodeURIComponent(email)}`} target="_blank" rel="noopener" className="ib-link" data-testid="otp-open-icemail-link">Open Ice Mail ↗</a>
          <Link href="/login" className="ib-link" data-testid="otp-restart-link">Start over</Link>
        </div>
      </form>
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense><VerifyForm /></Suspense>;
}
