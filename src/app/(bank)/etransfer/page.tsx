"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, newIdempotencyKey } from "@/ui/api";
import { useAccounts, useApi, accountOption } from "@/ui/types";
import { Alert, Button, Card, PageHeader, SelectField, Spinner, StatusBadge, TextField, processingDelay } from "@/ui/components";
import { formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { amountError, depositAccounts, describeProblem, Details, withLabels, type Contact, type ETransfer } from "@/ui/payments/shared";
import { SentETransfers } from "@/ui/payments/SentETransfers";

const LABELS = { fromAccountId: "From account", recipientName: "Recipient name", recipientEmail: "Recipient email", amount: "Amount", message: "Message",
  securityQuestion: "Security question", securityAnswer: "Security answer" };

export default function ETransferPage() {
  return <Suspense fallback={<Spinner />}><SendETransfer /></Suspense>;
}

function SendETransfer() {
  const toast = useToast();
  const params = useSearchParams();
  const { data: accounts, reload: reloadAccounts } = useAccounts();
  const { data: contacts } = useApi<Contact[]>("/etransfer-contacts");
  const [from, setFrom] = useState("");
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "review" | "processing" | "done">("form");
  const [result, setResult] = useState<ETransfer | null>(null);
  const [sentVersion, setSentVersion] = useState(0);
  const key = useRef(newIdempotencyKey());

  const sources = depositAccounts(accounts).filter((a) => a.status === "OPEN" || a.status === "FROZEN");
  const accountName = (id: string | number | null) => accounts?.find((a) => String(a.id) === String(id))?.displayName ?? "";

  function pickContact(id: string) {
    setContactId(id);
    const c = contacts?.find((x) => String(x.id) === id);
    if (c) { setName(c.name); setEmail(c.email); }
  }

  // Deep link from the contacts page: /etransfer?contact=ID
  const wanted = params.get("contact");
  useEffect(() => {
    if (wanted && contacts && !contactId) pickContact(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, contacts]);

  function review(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!from) fe.fromAccountId = "Choose the account to send from.";
    if (!name.trim()) fe.recipientName = "Enter the recipient's name.";
    if (!email.trim()) fe.recipientEmail = "Enter the recipient's email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.recipientEmail = "Enter a valid email address.";
    const ae = amountError(amount);
    if (ae) fe.amount = ae;
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length === 0) setPhase("review");
  }

  async function confirm() {
    setPhase("processing");
    try {
      const body = {
        fromAccountId: Number(from), recipientName: name.trim(), recipientEmail: email.trim(), amount: amount.trim(),
        message: message.trim() || undefined, securityQuestion: question.trim() || undefined, securityAnswer: answer || undefined,
      };
      const [r] = await Promise.all([api<ETransfer>("/etransfers", { body, idempotencyKey: key.current }), processingDelay()]);
      setResult(r);
      setPhase("done");
      toast.success(r.status === "DEPOSITED" ? `${formatMoney(r.amount)} was deposited to ${r.recipientName}.` : `e-Transfer of ${formatMoney(r.amount)} sent to ${r.recipientName}.`);
      reloadAccounts();
      setSentVersion((v) => v + 1);
    } catch (err) {
      setPhase("form");
      key.current = newIdempotencyKey();
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, LABELS));
      setError(p.message);
      toast.error(p.message);
    }
  }

  function again() {
    setAmount(""); setMessage(""); setQuestion(""); setAnswer(""); setContactId(""); setName(""); setEmail("");
    setErrors({}); setError(null); setResult(null); setPhase("form"); key.current = newIdempotencyKey();
  }

  if (!accounts) return <Spinner label="Loading accounts" />;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Send Interac e-Transfer" subtitle="Send money to anyone with an email address."
        actions={<>
          <Link href="/etransfer/received" className="ib-btn ib-btn-secondary" data-testid="etransfer-received-link">Received</Link>
          <Link href="/etransfer/contacts" className="ib-btn ib-btn-secondary" data-testid="etransfer-contacts-link">Contacts</Link>
        </>} />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          {error && <Alert testId="etransfer-error">{error}</Alert>}
          {phase === "form" && (
            <Card>
              <form onSubmit={review} noValidate className="space-y-4" data-testid="etransfer-form">
                <SelectField id="fromAccountId" label="From" testId="etransfer-from-select" placeholder="Choose an account" value={from}
                  onChange={(e) => setFrom(e.target.value)} options={sources.map((a) => accountOption(a, formatMoney))} error={errors.fromAccountId}
                  help="Chequing or savings accounts only." />
                <fieldset className="space-y-4 border border-line rounded-lg p-4">
                  <legend className="text-sm font-semibold text-navy px-1">Recipient</legend>
                  <SelectField id="contactId" label="Saved contact" testId="etransfer-contact-select" placeholder={contacts?.length ? "Choose a contact or type below" : "No saved contacts"}
                    value={contactId} onChange={(e) => pickContact(e.target.value)} disabled={!contacts?.length}
                    options={(contacts ?? []).map((c) => ({ value: String(c.id), label: `${c.name} (${c.email})` }))} />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <TextField id="recipientName" label="Name" maxLength={60} autoComplete="off" testId="etransfer-recipient-name-input" value={name}
                      onChange={(e) => { setName(e.target.value); setContactId(""); }} error={errors.recipientName} />
                    <TextField id="recipientEmail" label="Email" type="email" maxLength={254} autoComplete="off" testId="etransfer-recipient-email-input" value={email}
                      onChange={(e) => { setEmail(e.target.value); setContactId(""); }} error={errors.recipientEmail} />
                  </div>
                </fieldset>
                <TextField id="amount" label="Amount (CAD)" inputMode="decimal" placeholder="0.00" testId="etransfer-amount-input" value={amount}
                  onChange={(e) => setAmount(e.target.value)} error={errors.amount} help="$0.01 to $3,000.00 per transfer." />
                <div>
                  <label className="ib-label" htmlFor="message">Message (optional)</label>
                  <textarea id="message" name="message" className="ib-input" rows={2} maxLength={400} data-testid="etransfer-message-input" value={message}
                    onChange={(e) => setMessage(e.target.value)} aria-invalid={errors.message ? true : undefined} />
                  <p className="ib-help" data-testid="etransfer-message-count">{message.length}/400 characters</p>
                  {errors.message && <p className="ib-error" data-testid="etransfer-message-error" role="alert">{errors.message}</p>}
                </div>
                <fieldset className="space-y-4 border border-line rounded-lg p-4">
                  <legend className="text-sm font-semibold text-navy px-1">Security question</legend>
                  <p className="text-sm text-muted -mt-1">Required unless the recipient has registered for Autodeposit. Share the answer with the recipient in person or by phone, never in the message.</p>
                  <TextField id="securityQuestion" label="Question" maxLength={100} placeholder="e.g. Where did we meet?" testId="etransfer-security-question-input"
                    value={question} onChange={(e) => setQuestion(e.target.value)} error={errors.securityQuestion} help="5 to 100 characters." />
                  <TextField id="securityAnswer" label="Answer" type="password" autoComplete="new-password" maxLength={25} testId="etransfer-security-answer-input"
                    value={answer} onChange={(e) => setAnswer(e.target.value)} error={errors.securityAnswer} help="3 to 25 characters, not case-sensitive, must not appear in the message." />
                </fieldset>
                <Button type="submit" testId="etransfer-review-button">Review e-Transfer</Button>
              </form>
            </Card>
          )}
          {phase === "review" && (
            <Card testId="etransfer-review">
              <h2 className="font-bold text-navy mb-4">Review and confirm</h2>
              <Details rows={[
                ["From", accountName(from), "etransfer-review-from"],
                ["To", <>{name.trim()} <span className="text-muted">({email.trim()})</span></>, "etransfer-review-recipient"],
                ["Amount", <strong key="a">{formatMoney(amount.trim())}</strong>, "etransfer-review-amount"],
                ...(message.trim() ? [["Message", message.trim(), "etransfer-review-message"] as [string, string, string]] : []),
                ["Security question", question.trim() || <span key="q" className="text-muted">None (only if the recipient has Autodeposit)</span>, "etransfer-review-question"],
              ]} />
              <p className="text-sm text-muted mt-4">The money leaves your account as soon as you confirm.</p>
              <div className="flex gap-2 mt-6">
                <Button variant="secondary" testId="etransfer-edit-button" onClick={() => setPhase("form")}>Edit</Button>
                <Button testId="etransfer-confirm-button" onClick={confirm}>Send e-Transfer</Button>
              </div>
            </Card>
          )}
          {phase === "processing" && <Card testId="etransfer-processing"><Spinner label="Processing your e-Transfer…" /></Card>}
          {phase === "done" && result && (
            <Card testId="etransfer-confirmation">
              <p className="text-success font-bold text-lg mb-1" data-testid="etransfer-success-message">
                {result.status === "DEPOSITED" ? "e-Transfer deposited" : "e-Transfer sent"}
              </p>
              <p className="text-sm text-muted mb-4" data-testid="etransfer-confirmation-note">
                {result.status === "DEPOSITED"
                  ? `${result.recipientName} has Autodeposit, so the money was deposited right away.`
                  : `We emailed ${result.recipientEmail}. ${result.recipientName} needs the answer to your security question to deposit it.`}
              </p>
              <Details rows={[
                ["Status", <StatusBadge key="s" status={result.status} />, "etransfer-confirmation-status"],
                ["Amount", <strong key="a">{formatMoney(result.amount)}</strong>, "etransfer-confirmation-amount"],
                ["To", `${result.recipientName} (${result.recipientEmail})`, "etransfer-confirmation-recipient"],
                ["From", accountName(result.fromAccountId), "etransfer-confirmation-from"],
                ["Reference", <span key="r" className="font-mono">{result.referenceId}</span>, "etransfer-confirmation-reference"],
                ["Sent", formatDateTime(result.createdAt), "etransfer-confirmation-date"],
                ...(result.status === "PENDING" ? [["Expires", formatDateTime(result.expiresAt), "etransfer-confirmation-expiry"] as [string, string, string]] : []),
              ]} />
              <div className="flex gap-2 mt-6">
                <Button variant="secondary" testId="etransfer-another-button" onClick={again}>Send another</Button>
                {result.fromAccountId && <Link href={`/accounts/${result.fromAccountId}`} className="ib-btn ib-btn-primary" data-testid="etransfer-view-account-link">View account</Link>}
              </div>
            </Card>
          )}
        </div>
        <LimitsCard />
      </div>
      <SentETransfers version={sentVersion} onChanged={reloadAccounts} />
    </div>
  );
}

function LimitsCard() {
  return (
    <Card testId="etransfer-limits">
      <h2 className="font-bold text-navy mb-3">Sending limits</h2>
      <ul className="text-sm space-y-2">
        <li className="flex justify-between gap-2"><span className="text-muted">Per transfer</span><span className="font-semibold tabular-nums" data-testid="etransfer-limit-per-transfer">$3,000.00</span></li>
        <li className="flex justify-between gap-2"><span className="text-muted">Per day</span><span className="font-semibold tabular-nums" data-testid="etransfer-limit-daily">$3,000.00</span></li>
        <li className="flex justify-between gap-2"><span className="text-muted">Rolling 30 days</span><span className="font-semibold tabular-nums" data-testid="etransfer-limit-30-day">$10,000.00</span></li>
      </ul>
      <p className="text-xs text-muted mt-3 leading-relaxed" data-testid="etransfer-limits-note">
        Pending e-Transfers count toward your limits. Days follow Toronto time. Cancelled and expired e-Transfers do not count.
        Unclaimed e-Transfers expire after 30 days and the money is returned.
      </p>
    </Card>
  );
}
