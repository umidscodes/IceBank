"use client";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { Alert, Button, Card, PageHeader, SelectField, TextField } from "@/ui/components";
import { formatDate, formatDateTime } from "@/ui/format";
import { PasswordRules } from "@/ui/password-rules";
import { useSession, type Profile } from "@/ui/session";
import { useToast } from "@/ui/toast";
import { PROVINCES } from "@/ui/services/banking";

type Toast = ReturnType<typeof useToast>;

/** Shared error handling: field errors next to fields, everything else in an Alert and a toast. */
function handle(err: unknown, setErrors: (e: Record<string, string>) => void, setError: (m: string | null) => void, toast: Toast) {
  if (err instanceof ApiProblem) {
    setErrors(err.fieldErrors());
    setError(err.errors.length ? "Please fix the highlighted fields." : err.message);
    toast.error(err.message);
  } else {
    setError("Something went wrong. Please try again.");
    toast.error("Something went wrong. Please try again.");
  }
}

export default function ProfilePage() {
  const { me } = useSession();
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Profile and security" subtitle="Your personal details, contact information, password and display preferences." />
      <Card testId="profile-summary">
        <h2 className="font-bold text-navy text-lg mb-4">Personal details</h2>
        <dl className="grid sm:grid-cols-4 gap-y-2 text-sm">
          <dt className="text-muted">Name</dt><dd className="sm:col-span-3" data-testid="profile-name">{[me.firstName, me.lastName].filter(Boolean).join(" ") || "-"}</dd>
          <dt className="text-muted">Email</dt><dd className="sm:col-span-3" data-testid="profile-email">{me.email}</dd>
          <dt className="text-muted">Date of birth</dt><dd className="sm:col-span-3" data-testid="profile-dob">{formatDate(me.dateOfBirth) || "-"}</dd>
          <dt className="text-muted">SIN</dt><dd className="sm:col-span-3 font-mono" data-testid="profile-sin">{me.sinLast3 ? `***-***-${me.sinLast3.padStart(3, "*")}` : "-"}</dd>
          <dt className="text-muted">Phone</dt><dd className="sm:col-span-3" data-testid="profile-phone">{me.phone ?? "-"}</dd>
          <dt className="text-muted">Address</dt><dd className="sm:col-span-3" data-testid="profile-address">
            {me.address ? `${me.address.line1}${me.address.line2 ? `, ${me.address.line2}` : ""}, ${me.address.city}, ${me.address.province} ${me.address.postalCode}` : "-"}</dd>
          <dt className="text-muted">Last sign-in</dt><dd className="sm:col-span-3" data-testid="profile-last-login">{formatDateTime(me.lastLoginAt) || "-"}</dd>
          <dt className="text-muted">Customer since</dt><dd className="sm:col-span-3" data-testid="profile-created">{formatDate(me.createdAt)}</dd>
        </dl>
        <p className="text-xs text-muted mt-3">To change your name or date of birth, visit a branch with two pieces of ID.</p>
      </Card>
      {me.customerId !== null && <ContactForm key={`${me.phone}-${me.address?.line1}-${me.address?.postalCode}`} me={me} />}
      <PasswordForm />
      <EmailChange />
      <ClassicToggle />
    </div>
  );
}

function ContactForm({ me }: { me: Profile }) {
  const { reload } = useSession();
  const toast = useToast();
  const [f, setF] = useState({
    phone: me.phone ?? "", addressLine1: me.address?.line1 ?? "", addressLine2: me.address?.line2 ?? "",
    city: me.address?.city ?? "", province: me.address?.province ?? "", postalCode: me.address?.postalCode ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(f.phone)) fe.phone = "Use the format (416) 555-0142.";
    if (!f.addressLine1.trim()) fe.addressLine1 = "Enter your street address.";
    if (!f.city.trim()) fe.city = "Enter your city.";
    if (!f.province) fe.province = "Choose your province or territory.";
    if (!/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(f.postalCode.trim())) fe.postalCode = "Use the format A1A 1A1.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: {
        phone: f.phone, addressLine1: f.addressLine1.trim(), addressLine2: f.addressLine2.trim() || null, city: f.city.trim(),
        province: f.province, postalCode: f.postalCode.trim().toUpperCase(),
      } });
      toast.success("Your contact details were updated.");
      await reload();
    } catch (err) { handle(err, setErrors, setError, toast); } finally { setBusy(false); }
  }

  return (
    <Card testId="profile-contact-card">
      <h2 className="font-bold text-navy text-lg mb-4">Contact information</h2>
      {error && <div className="mb-4"><Alert testId="profile-contact-error">{error}</Alert></div>}
      <form onSubmit={save} noValidate className="grid sm:grid-cols-2 gap-4" data-testid="profile-contact-form">
        <TextField id="phone" label="Phone" type="tel" placeholder="(416) 555-0142" testId="profile-phone-input" value={f.phone} onChange={set("phone")} error={errors.phone}
          help="Format: (###) ###-####" className="sm:col-span-2" />
        <TextField id="addressLine1" label="Street address" testId="profile-address-line1-input" value={f.addressLine1} onChange={set("addressLine1")} error={errors.addressLine1} />
        <TextField id="addressLine2" label="Apartment, suite (optional)" testId="profile-address-line2-input" value={f.addressLine2} onChange={set("addressLine2")} error={errors.addressLine2} />
        <TextField id="city" label="City" testId="profile-city-input" value={f.city} onChange={set("city")} error={errors.city} />
        <SelectField id="province" label="Province or territory" testId="profile-province-select" placeholder="Choose a province" value={f.province} onChange={set("province")}
          options={Object.entries(PROVINCES).map(([code, name]) => ({ value: code, label: name }))} error={errors.province} />
        <TextField id="postalCode" label="Postal code" placeholder="A1A 1A1" testId="profile-postal-code-input" value={f.postalCode} onChange={set("postalCode")} error={errors.postalCode} />
        <div className="sm:col-span-2"><Button type="submit" testId="profile-contact-save-button" disabled={busy}>{busy ? "Saving…" : "Save contact information"}</Button></div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const { reload } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!current) fe.currentPassword = "Enter your current password.";
    if (!next) fe.newPassword = "Enter a new password.";
    if (next !== confirm) fe.confirmPassword = "The passwords do not match.";
    setErrors(fe);
    setError(null);
    setDone(false);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api("/me/password", { method: "PUT", body: { currentPassword: current, newPassword: next } });
      setCurrent(""); setNext(""); setConfirm("");
      setDone(true);
      toast.success("Your password was changed.");
      await reload();
    } catch (err) { handle(err, setErrors, setError, toast); } finally { setBusy(false); }
  }

  return (
    <Card testId="profile-password-card">
      <h2 className="font-bold text-navy text-lg mb-1">Change password</h2>
      <p className="text-sm text-muted mb-4">You cannot reuse any of your last 3 passwords. Other devices will be signed out.</p>
      {error && <div className="mb-4"><Alert testId="password-change-error">{error}</Alert></div>}
      {done && <div className="mb-4"><Alert kind="success" testId="password-change-success">Your password was changed.</Alert></div>}
      <form onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-4" data-testid="password-change-form">
        <TextField id="currentPassword" label="Current password" type="password" autoComplete="current-password" testId="password-current-input" value={current}
          onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword} className="sm:col-span-2" />
        <TextField id="newPassword" label="New password" type="password" autoComplete="new-password" testId="password-new-input" value={next}
          onChange={(e) => setNext(e.target.value)} error={errors.newPassword} />
        <TextField id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" testId="password-confirm-input" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} error={errors.confirmPassword} />
        <div className="sm:col-span-2"><PasswordRules password={next} /></div>
        <div className="sm:col-span-2"><Button type="submit" testId="password-change-submit-button" disabled={busy}>{busy ? "Saving…" : "Change password"}</Button></div>
      </form>
    </Card>
  );
}

function EmailChange() {
  const { me, reload } = useSession();
  const toast = useToast();
  const [step, setStep] = useState<"start" | "confirm" | "done">("start");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) fe.newEmail = "Enter a valid email address.";
    else if (newEmail.trim().toLowerCase() === me.email.toLowerCase()) fe.newEmail = "Enter an address different from your current email.";
    setErrors(fe); setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const r = await api<{ message: string; expiresIn: number }>("/me/email-change", { body: { newEmail: newEmail.trim() } });
      setStep("confirm"); setCode("");
      toast.success(r.message);
    } catch (err) { handle(err, setErrors, setError, toast); } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setErrors({ code: "Enter the 6-digit code." }); return; }
    setErrors({}); setError(null);
    setBusy(true);
    try {
      await api("/me/email-change/confirm", { body: { code: code.trim() } });
      setStep("done");
      toast.success("Your email address was changed.");
      await reload();
    } catch (err) { handle(err, setErrors, setError, toast); } finally { setBusy(false); }
  }

  return (
    <Card testId="profile-email-card">
      <h2 className="font-bold text-navy text-lg mb-1">Change email</h2>
      <p className="text-sm text-muted mb-4">We send a 6-digit code to the new address. Your email changes only after you enter the code (valid 5 minutes, 3 attempts).</p>
      {error && <div className="mb-4"><Alert testId="email-change-error">{error}</Alert></div>}
      {step === "start" && (
        <form onSubmit={start} noValidate className="flex flex-wrap items-start gap-3" data-testid="email-change-form">
          <TextField id="newEmail" label="New email" type="email" autoComplete="email" testId="email-change-new-input" value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)} error={errors.newEmail} className="flex-1 min-w-[260px]" />
          <Button type="submit" testId="email-change-send-button" className="mt-6" disabled={busy}>{busy ? "Sending…" : "Send code"}</Button>
        </form>
      )}
      {step === "confirm" && (
        <form onSubmit={confirm} noValidate className="space-y-3" data-testid="email-change-confirm-form">
          <Alert kind="info" testId="email-change-code-sent">
            We sent a code to <strong data-testid="email-change-pending-email">{newEmail.trim()}</strong>.{" "}
            <a href={`/mail?email=${encodeURIComponent(newEmail.trim())}`} target="_blank" rel="noopener" className="ib-link" data-testid="email-change-open-mail-link">Open Ice Mail</a>
          </Alert>
          <div className="flex flex-wrap items-start gap-3">
            <TextField id="code" label="6-digit code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" testId="email-change-code-input" value={code}
              onChange={(e) => setCode(e.target.value)} error={errors.code} className="w-48" />
            <Button type="submit" testId="email-change-confirm-button" className="mt-6" disabled={busy}>{busy ? "Confirming…" : "Confirm"}</Button>
            <Button variant="secondary" testId="email-change-restart-button" className="mt-6" onClick={() => { setStep("start"); setError(null); setErrors({}); }}>Use a different email</Button>
          </div>
        </form>
      )}
      {step === "done" && (
        <Alert kind="success" testId="email-change-success">Your sign-in email is now <strong>{me.email}</strong>.</Alert>
      )}
    </Card>
  );
}

function ClassicToggle() {
  const { me, reload } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      await api("/me", { method: "PATCH", body: { classicView: !me.classicView } });
      await reload();
      toast.success(!me.classicView ? "Classic view is on." : "Classic view is off.");
    } catch (err) {
      const m = err instanceof ApiProblem ? err.message : "Something went wrong. Please try again.";
      setError(m); toast.error(m);
    } finally { setBusy(false); }
  }

  return (
    <Card testId="profile-classic-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-bold text-navy text-lg mb-1">Classic view (hard mode)</h2>
          <p className="text-sm" data-testid="classic-view-explanation">
            Switches the dashboard, account transactions and payees pages to an old layout with <strong>no test ids</strong>. Use it to practise
            writing locators from text, labels, table structure and CSS instead of <code>data-testid</code>. Every other page stays the same.
          </p>
          {error && <div className="mt-3"><Alert testId="classic-view-error">{error}</Alert></div>}
        </div>
        <label className="inline-flex items-center gap-3 cursor-pointer select-none" htmlFor="classicView">
          <input id="classicView" type="checkbox" role="switch" className="h-5 w-5 accent-[#0B2545]" data-testid="classic-view-toggle"
            checked={me.classicView} disabled={busy} onChange={toggle} aria-describedby="classic-view-status" />
          <span className="font-semibold text-sm" id="classic-view-status" data-testid="classic-view-status">{me.classicView ? "On" : "Off"}</span>
        </label>
      </div>
    </Card>
  );
}
