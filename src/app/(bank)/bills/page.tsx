"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, newIdempotencyKey } from "@/ui/api";
import { useAccounts, useApi, accountOption } from "@/ui/types";
import { Alert, Button, Card, PageHeader, SelectField, Spinner, StatusBadge, TextField } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { DatePicker } from "@/ui/payments/DatePicker";
import {
  amountError, describeProblem, Details, ISO_DATE_RE, payeeLabel, RECURRENCE_LABEL, useEarliestDate, withLabels,
  type BillPayment, type Payee, type Recurrence,
} from "@/ui/payments/shared";

type Created = BillPayment & { upcoming: BillPayment[] };
const LABELS = { payeeId: "Payee", fromAccountId: "From account", amount: "Amount", paymentDate: "Payment date", recurrence: "Frequency", endDate: "End date" };

export default function PayBillPage() {
  return <Suspense fallback={<Spinner />}><PayBill /></Suspense>;
}

function PayBill() {
  const toast = useToast();
  const params = useSearchParams();
  const earliest = useEarliestDate();
  const { data: accounts, reload: reloadAccounts } = useAccounts();
  const { data: payees, error: payeesError } = useApi<Payee[]>("/payees");
  const [payeeId, setPayeeId] = useState(params.get("payee") ?? "");
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "review" | "submitting" | "done">("form");
  const [result, setResult] = useState<Created | null>(null);
  const key = useRef(newIdempotencyKey());

  // Drop a ?payee= that is not one of mine.
  useEffect(() => {
    if (payees && payeeId && !payees.some((p) => String(p.id) === payeeId)) setPayeeId("");
  }, [payees, payeeId]);

  const sources = accounts?.filter((a) => a.type !== "LOAN" && a.status !== "CLOSED") ?? [];
  const payee = payees?.find((p) => String(p.id) === payeeId);
  const accountName = (id: string | number) => accounts?.find((a) => String(a.id) === String(id))?.displayName ?? "";
  const recurring = recurrence !== "NONE";

  function review(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!payeeId) fe.payeeId = "Choose a payee.";
    if (!from) fe.fromAccountId = "Choose the account to pay from.";
    const ae = amountError(amount);
    if (ae) fe.amount = ae;
    if (date.trim() && !ISO_DATE_RE.test(date.trim())) fe.paymentDate = "Enter the date as YYYY-MM-DD, or leave it empty to pay today.";
    if (recurring && !date.trim()) fe.paymentDate = "Recurring payments need a start date in the future.";
    if (recurring && endDate.trim() && !ISO_DATE_RE.test(endDate.trim())) fe.endDate = "Enter the date as YYYY-MM-DD.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length === 0) setPhase("review");
  }

  async function confirm() {
    setPhase("submitting");
    try {
      const body = {
        payeeId: Number(payeeId), fromAccountId: Number(from), amount: amount.trim(), recurrence,
        paymentDate: date.trim() || undefined, endDate: recurring && endDate.trim() ? endDate.trim() : undefined,
      };
      const r = await api<Created>("/bill-payments", { body, idempotencyKey: key.current });
      setResult(r);
      setPhase("done");
      toast.success(r.status === "PENDING" ? `Payment of ${formatMoney(r.amount)} to ${r.billerName} sent.` : `Payment of ${formatMoney(r.amount)} to ${r.billerName} scheduled.`);
      reloadAccounts();
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
    setAmount(""); setDate(""); setRecurrence("NONE"); setEndDate(""); setErrors({}); setError(null); setResult(null);
    setPhase("form"); key.current = newIdempotencyKey();
  }

  if (!accounts || (!payees && !payeesError)) return <Spinner label="Loading" />;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Pay a bill" subtitle="Pay now or schedule a payment up to a year ahead."
        actions={<>
          <Link href="/bills/payees" className="ib-btn ib-btn-secondary" data-testid="bills-payees-link">Manage payees</Link>
          <Link href="/bills/scheduled" className="ib-btn ib-btn-secondary" data-testid="bills-scheduled-link">Scheduled payments</Link>
        </>} />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          {payeesError && <Alert testId="bill-payees-error">{payeesError}</Alert>}
          {error && <Alert testId="bill-payment-error">{error}</Alert>}
          {payees && payees.length === 0 && (
            <Alert kind="info" testId="bill-no-payees">You have no payees yet. <Link href="/bills/payees" className="ib-link">Add a payee</Link> to pay a bill.</Alert>
          )}
          {phase === "form" && payees && payees.length > 0 && (
            <Card>
              <form onSubmit={review} noValidate className="space-y-4" data-testid="bill-payment-form">
                <SelectField id="payeeId" label="Payee" testId="bill-payee-select" placeholder="Choose a payee" value={payeeId} onChange={(e) => setPayeeId(e.target.value)}
                  options={payees.map((p) => ({ value: String(p.id), label: payeeLabel(p) }))} error={errors.payeeId} />
                <SelectField id="fromAccountId" label="From" testId="bill-from-select" placeholder="Choose an account" value={from} onChange={(e) => setFrom(e.target.value)}
                  options={sources.map((a) => accountOption(a, formatMoney))} error={errors.fromAccountId} />
                <TextField id="amount" label="Amount (CAD)" inputMode="decimal" placeholder="0.00" testId="bill-amount-input" value={amount}
                  onChange={(e) => setAmount(e.target.value)} error={errors.amount} help="$0.01 to $25,000.00." />
                <div className="grid sm:grid-cols-2 gap-4">
                  <DatePicker id="paymentDate" label="Payment date" value={date} onChange={setDate} min={earliest} error={errors.paymentDate}
                    help={recurring ? "First payment. Must be a future date." : "Leave empty to pay today."} testId="date-picker" />
                  <SelectField id="recurrence" label="Frequency" testId="bill-recurrence-select" value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as Recurrence)} error={errors.recurrence}
                    options={(["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"] as Recurrence[]).map((r) => ({ value: r, label: RECURRENCE_LABEL[r] }))} />
                </div>
                {recurring && (
                  <DatePicker id="endDate" label="End date (optional)" value={endDate} onChange={setEndDate} min={ISO_DATE_RE.test(date) ? date : earliest}
                    error={errors.endDate} help="Last date a payment may fall on. Leave empty to repeat until you cancel." testId="end-date-picker" className="sm:w-1/2 sm:pr-2" />
                )}
                <p className="text-sm text-muted" data-testid="bill-date-summary">
                  {!date.trim() ? "Paying today: the money is held now and the payment posts on the next business day."
                    : `Scheduled for ${ISO_DATE_RE.test(date.trim()) ? formatDate(date.trim()) : date}: posts on that date, or the next business day if it is a weekend or holiday.`}
                </p>
                <Button type="submit" testId="bill-review-button">Review payment</Button>
              </form>
            </Card>
          )}
          {phase === "review" && payee && (
            <Card testId="bill-review">
              <h2 className="font-bold text-navy mb-4">Review and confirm</h2>
              <Details rows={[
                ["Payee", payeeLabel(payee), "bill-review-payee"],
                ["From", accountName(from), "bill-review-from"],
                ["Amount", <strong key="a">{formatMoney(amount.trim())}</strong>, "bill-review-amount"],
                ["Payment date", date.trim() ? formatDate(date.trim()) : "Today (pay now)", "bill-review-date"],
                ["Frequency", RECURRENCE_LABEL[recurrence], "bill-review-recurrence"],
                ...(recurring ? [["End date", endDate.trim() ? formatDate(endDate.trim()) : "Until cancelled", "bill-review-end-date"] as [string, string, string]] : []),
              ]} />
              <div className="flex gap-2 mt-6">
                <Button variant="secondary" testId="bill-edit-button" onClick={() => setPhase("form")}>Edit</Button>
                <Button testId="bill-confirm-button" onClick={confirm}>{date.trim() ? "Schedule payment" : "Pay now"}</Button>
              </div>
            </Card>
          )}
          {phase === "submitting" && <Card testId="bill-processing"><Spinner label="Submitting your payment…" /></Card>}
          {phase === "done" && result && (
            <Card testId="bill-confirmation">
              <p className="text-success font-bold text-lg mb-4" data-testid="bill-success-message">
                {result.status === "PENDING" ? "Payment sent" : recurring ? "Recurring payment scheduled" : "Payment scheduled"}
              </p>
              <Details rows={[
                ["Status", <StatusBadge key="s" status={result.status} />, "bill-confirmation-status"],
                ["Payee", payeeLabel({ billerName: result.billerName, nickname: result.payeeNickname, accountNumber: result.payeeAccountNumber }), "bill-confirmation-payee"],
                ["Amount", <strong key="a">{formatMoney(result.amount)}</strong>, "bill-confirmation-amount"],
                ["Payment date", <span key="p" data-iso={result.paymentDate}>{formatDate(result.paymentDate)}</span>, "bill-confirmation-payment-date"],
                ["Posting date", <span key="d" data-iso={result.postingDate}>{formatDate(result.postingDate)}</span>, "bill-confirmation-posting-date"],
                ["Frequency", RECURRENCE_LABEL[result.recurrence], "bill-confirmation-recurrence"],
                ...(result.endDate ? [["End date", formatDate(result.endDate), "bill-confirmation-end-date"] as [string, string, string]] : []),
                ["Reference", <span key="r" className="font-mono">{result.referenceId}</span>, "bill-confirmation-reference"],
              ]} />
              {result.paymentDate !== result.postingDate && (
                <p className="text-sm text-muted mt-3" data-testid="bill-confirmation-posting-note">
                  {result.status === "PENDING" ? "Bills paid today post on the next business day." : "The payment date is not a business day, so it posts on the next business day."}
                </p>
              )}
              {result.upcoming.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-navy mb-2">Upcoming payments</h3>
                  <table className="ib-table" data-testid="bill-upcoming-table">
                    <thead><tr><th>#</th><th>Payment date</th><th>Posting date</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {result.upcoming.map((u) => (
                        <tr key={u.id} data-testid={`bill-upcoming-row-${u.id}`}>
                          <td data-testid="bill-upcoming-occurrence">{u.occurrence}</td>
                          <td data-testid="bill-upcoming-payment-date" data-iso={u.paymentDate}>{formatDate(u.paymentDate)}</td>
                          <td data-testid="bill-upcoming-posting-date" data-iso={u.postingDate}>{formatDate(u.postingDate)}</td>
                          <td className="text-right tabular-nums" data-testid="bill-upcoming-amount">{formatMoney(u.amount)}</td>
                          <td><StatusBadge status={u.status} testId="bill-upcoming-status" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-2 mt-6">
                <Button variant="secondary" testId="bill-another-button" onClick={again}>Pay another bill</Button>
                <Link href="/bills/scheduled" className="ib-btn ib-btn-primary" data-testid="bill-view-scheduled-link">View payments</Link>
              </div>
            </Card>
          )}
        </div>
        <Card testId="bill-rules">
          <h2 className="font-bold text-navy mb-3">When will my payment arrive?</h2>
          <ul className="text-sm space-y-3 text-ink">
            <li><strong>Pay today:</strong> the money is held from your account right away and the payment posts on the <strong>next business day</strong>.</li>
            <li><strong>Future date:</strong> the payment posts on that date, or the next business day if it falls on a weekend or holiday. We check your balance on the posting date.</li>
            <li><strong>Recurring:</strong> weekly, every 2 weeks or monthly, starting on a future date. A monthly payment on the 29th to 31st falls on the last day of shorter months.</li>
          </ul>
          <p className="text-xs text-muted mt-4 leading-relaxed">
            Holidays: New Year&apos;s Day, Family Day, Good Friday, Victoria Day, Canada Day, Civic Holiday, Labour Day, National Day for Truth and Reconciliation,
            Thanksgiving, Remembrance Day, Christmas and Boxing Day. Payments can be scheduled up to 1 year ahead.
          </p>
        </Card>
      </div>
    </div>
  );
}
