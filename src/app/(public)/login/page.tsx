"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, TextField } from "@/ui/components";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notice = params.get("timeout") ? "You were signed out because you were inactive for 10 minutes."
    : params.get("expired") ? "Your session has ended. Please sign in again."
    : params.get("signedOut") ? "You have signed out. See you soon!"
    : params.get("reset") ? "Your password was changed. Sign in with your new password."
    : params.get("registered") ? "Your account is ready. Sign in to start banking." : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fe: Record<string, string> = {};
    if (!email.trim()) fe.email = "Enter your email address.";
    if (!password) fe.password = "Enter your password.";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const r = await api<{ mfaToken: string }>("/auth/login", { body: { email, password }, noAuthRedirect: true });
      try { sessionStorage.setItem("icebank-mfa", JSON.stringify({ token: r.mfaToken, email, next: params.get("next") })); } catch { /* ignore */ }
      router.push(`/login/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiProblem) {
        setErrors(err.fieldErrors());
        setError(err.errors.length ? null : err.message);
      } else setError("We could not reach Ice Bank. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-navy mb-1" data-testid="page-title">Sign in to Online Banking</h1>
      <p className="text-muted mb-6">Use the email address you registered with.</p>
      {notice && <div className="mb-4"><Alert kind="info" testId="login-notice">{notice}</Alert></div>}
      {error && <div className="mb-4"><Alert testId="login-error">{error}</Alert></div>}
      <form onSubmit={submit} noValidate className="ib-card p-6 space-y-4" data-testid="login-form">
        <TextField id="email" label="Email" type="email" autoComplete="username" testId="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField id="password" label="Password" type="password" autoComplete="current-password" testId="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Button type="submit" testId="login-submit-button" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="ib-link" data-testid="login-forgot-link">Forgot password?</Link>
          <Link href="/register" className="ib-link" data-testid="login-register-link">Open an account</Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
