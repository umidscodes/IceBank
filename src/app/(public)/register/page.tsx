"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, SelectField, TextField } from "@/ui/components";
import { PasswordRules } from "@/ui/password-rules";
import { formatDate } from "@/ui/format";
import { PROVINCES } from "@/lib/validation";
import {
  EMPTY_FORM, FIELD_STEP, PROVINCE_OPTIONS, STEPS, formatPhone, maskSin, normalisePostal, toRegisterBody, todayToronto, validateStep,
  type RegisterForm, type Step,
} from "@/ui/register/wizard";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef<Step>(1);

  useEffect(() => {
    if (prevStep.current === step) return;
    prevStep.current = step;
    heading.current?.focus();
  }, [step]);

  const set = <K extends keyof RegisterForm>(k: K, v: RegisterForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  function next(e?: React.FormEvent) {
    e?.preventDefault();
    const fe = validateStep(step, form);
    setErrors(fe);
    if (Object.keys(fe).length) {
      const firstField = Object.keys(fe)[0];
      setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      return;
    }
    setAlert(null);
    setStep((s) => Math.min(4, s + 1) as Step);
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  function goTo(s: Step) {
    setErrors({});
    setStep(s);
  }

  async function submit() {
    // Re-check every step in case something changed.
    for (const s of [1, 2, 3] as Step[]) {
      const fe = validateStep(s, form);
      if (Object.keys(fe).length) { setErrors(fe); setStep(s); return; }
    }
    setBusy(true);
    setAlert(null);
    try {
      await api("/auth/register", { body: toRegisterBody(form), noAuthRedirect: true });
      router.push("/login?registered=1");
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiProblem) {
        const fe = err.fieldErrors();
        if (err.status === 400 && Object.keys(fe).length) {
          const pretty: Record<string, string> = {};
          for (const [k, v] of Object.entries(fe)) pretty[k] = `${v.charAt(0).toUpperCase()}${v.slice(1)}.`.replace(/\.\.$/, ".");
          const owner = Math.min(...Object.keys(fe).map((k) => FIELD_STEP[k] ?? 1)) as Step;
          setErrors(pretty);
          setStep(owner);
          setAlert("Please fix the highlighted fields.");
        } else if (err.status === 409 && err.code === "EMAIL_TAKEN") {
          setAlert(err.message);
          setErrors({ email: "This email is already registered. Sign in instead, or use another email." });
        } else if (err.status === 422 && err.code === "UNDERAGE") {
          setAlert(err.message);
          setErrors({ dateOfBirth: "You must be at least 18 years old to open an account." });
        } else {
          setAlert(err.message);
        }
      } else setAlert("We could not reach Ice Bank. Please try again.");
    }
  }

  const title = STEPS[step - 1].label;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-navy mb-1" data-testid="page-title">Open an Ice Bank account</h1>
      <p className="text-muted mb-6">It takes about 3 minutes. You will get a no-fee chequing account right away.</p>

      <ol className="flex gap-2 mb-6" data-testid="register-step-indicator" aria-label="Registration progress">
        {STEPS.map((s) => {
          const state = s.n === step ? "current" : s.n < step ? "complete" : "upcoming";
          return (
            <li key={s.n} className="flex-1" data-testid={`register-step-${s.n}`} data-state={state} aria-current={s.n === step ? "step" : undefined}>
              <div className={`h-1.5 rounded-full mb-2 ${state === "upcoming" ? "bg-line" : state === "current" ? "bg-glacier" : "bg-navy"}`} aria-hidden />
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${state === "upcoming" ? "text-muted" : "text-navy"}`}>
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${state === "upcoming" ? "bg-line text-muted" : state === "current" ? "bg-glacier text-navy" : "bg-navy text-white"}`} aria-hidden>
                  {state === "complete" ? "✓" : s.n}
                </span>
                {s.label}
                <span className="sr-only">{state === "complete" ? " (completed)" : state === "current" ? " (current step)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {alert && <div className="mb-4"><Alert testId="register-error">{alert}</Alert></div>}

      <form onSubmit={step === 4 ? (e) => { e.preventDefault(); submit(); } : next} noValidate className="ib-card p-6" data-testid={`register-step-${step}-form`}>
        <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-navy mb-4 outline-none" data-testid="register-step-title">
          Step {step} of 4: {title}
        </h2>

        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField id="firstName" label="First name" autoComplete="given-name" testId="register-first-name-input" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} maxLength={50} />
            <TextField id="lastName" label="Last name" autoComplete="family-name" testId="register-last-name-input" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} maxLength={50} />
            <TextField id="dateOfBirth" label="Date of birth" type="date" autoComplete="bday" testId="register-date-of-birth-input" max={todayToronto()} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} error={errors.dateOfBirth} help="You must be 18 or older." />
            <TextField id="phone" label="Phone number" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(416) 555-0199" testId="register-phone-input" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} error={errors.phone} help="Format: (###) ###-####" />
            <TextField id="email" label="Email" type="email" autoComplete="email" testId="register-email-input" className="sm:col-span-2" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} help="You will sign in with this email. Codes are sent to Ice Mail." />
            <TextField id="sin" label="Social Insurance Number (SIN)" inputMode="numeric" autoComplete="off" placeholder="130 692 544" testId="register-sin-input" value={form.sin} onChange={(e) => set("sin", e.target.value)} error={errors.sin} help="9 digits. Spaces or dashes are fine." maxLength={11} />
          </div>
        )}

        {step === 2 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField id="addressLine1" label="Street address" autoComplete="address-line1" testId="register-address-line1-input" className="sm:col-span-2" value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} error={errors.addressLine1} maxLength={100} />
            <TextField id="addressLine2" label="Apartment, suite, unit (optional)" autoComplete="address-line2" testId="register-address-line2-input" className="sm:col-span-2" value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} error={errors.addressLine2} maxLength={100} />
            <TextField id="city" label="City" autoComplete="address-level2" testId="register-city-input" value={form.city} onChange={(e) => set("city", e.target.value)} error={errors.city} maxLength={60} />
            <SelectField id="province" label="Province or territory" autoComplete="address-level1" testId="register-province-select" placeholder="Choose…" options={PROVINCE_OPTIONS} value={form.province} onChange={(e) => set("province", e.target.value)} error={errors.province} />
            <TextField id="postalCode" label="Postal code" autoComplete="postal-code" placeholder="M5J 2T3" testId="register-postal-code-input" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value.toUpperCase())} onBlur={(e) => set("postalCode", normalisePostal(e.target.value.trim()))} error={errors.postalCode} help="Format: A1A 1A1" maxLength={7} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <TextField id="password" label="Password" type={showPassword ? "text" : "password"} autoComplete="new-password" testId="register-password-input" value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password} maxLength={64} />
            <PasswordRules password={form.password} />
            <TextField id="confirmPassword" label="Confirm password" type={showPassword ? "text" : "password"} autoComplete="new-password" testId="register-confirm-password-input" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} error={errors.confirmPassword} maxLength={64} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} data-testid="register-show-password-checkbox" />
              Show passwords
            </label>
            <div>
              <label className="flex items-start gap-2 text-sm" htmlFor="terms">
                <input id="terms" name="terms" type="checkbox" className="mt-0.5" checked={form.terms} onChange={(e) => set("terms", e.target.checked)}
                  data-testid="register-terms-checkbox" aria-invalid={errors.terms ? true : undefined} aria-describedby={errors.terms ? "terms-error" : undefined} />
                <span>I agree to the Ice Bank account agreement, privacy policy and electronic communications terms. (Ice Bank is fictional.)</span>
              </label>
              {errors.terms && <p className="ib-error" id="terms-error" data-testid="register-terms-error" role="alert">{errors.terms}</p>}
            </div>
          </div>
        )}

        {step === 4 && <Review form={form} onEdit={goTo} />}

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-line">
          {step > 1
            ? <Button variant="secondary" testId="register-back-button" onClick={back} disabled={busy}>Back</Button>
            : <Link href="/login" className="ib-link text-sm" data-testid="register-signin-link">Already a client? Sign in</Link>}
          {step < 4
            ? <Button type="submit" testId="register-next-button">Next</Button>
            : <Button type="submit" testId="register-submit-button" disabled={busy}>{busy ? "Opening your account…" : "Open my account"}</Button>}
        </div>
      </form>
    </div>
  );
}

function Review({ form, onEdit }: { form: RegisterForm; onEdit: (s: Step) => void }) {
  const section = (s: Step, title: string, rows: [string, string, string][]) => (
    <div className="mb-5" data-testid={`register-review-section-${s}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-navy">{title}</h3>
        <button type="button" className="ib-link text-sm" onClick={() => onEdit(s)} data-testid={`register-review-edit-step-${s}`}>Edit</button>
      </div>
      <dl className="grid grid-cols-[170px_1fr] gap-y-1.5 text-sm">
        {rows.map(([key, label, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd data-testid={`register-review-${key}`}>{value || <span className="text-muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return (
    <div>
      <p className="text-sm text-muted mb-4">Check your details before opening your account.</p>
      {section(1, "Personal info", [
        ["name", "Name", `${form.firstName.trim()} ${form.lastName.trim()}`],
        ["date-of-birth", "Date of birth", formatDate(form.dateOfBirth)],
        ["phone", "Phone", form.phone],
        ["email", "Email", form.email.trim()],
        ["sin", "SIN", maskSin(form.sin)],
      ])}
      {section(2, "Address", [
        ["address-line1", "Street address", form.addressLine1.trim()],
        ["address-line2", "Apt / suite", form.addressLine2.trim()],
        ["city", "City", form.city.trim()],
        ["province", "Province", form.province ? `${PROVINCES[form.province]} (${form.province})` : ""],
        ["postal-code", "Postal code", form.postalCode.trim().toUpperCase()],
      ])}
      {section(3, "Security", [
        ["password", "Password", "•".repeat(Math.min(form.password.length, 12))],
        ["terms", "Terms", form.terms ? "Accepted" : "Not accepted"],
      ])}
    </div>
  );
}
