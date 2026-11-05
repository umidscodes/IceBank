"use client";
/** Types and small helpers shared by the e-Transfer and bill payment pages. */
import { ApiProblem } from "@/ui/api";
import { useSession } from "@/ui/session";
import type { Account } from "@/ui/types";

export interface ETransfer {
  id: number; direction: "SENT" | "RECEIVED"; senderName: string; recipientName: string; recipientEmail: string;
  fromAccountId: number | null; depositAccountId: number | null; amount: string; message: string | null; securityQuestion: string | null;
  autodeposit: boolean; status: "PENDING" | "DEPOSITED" | "CANCELLED" | "EXPIRED"; referenceId: string;
  createdAt: string; expiresAt: string; depositedAt: string | null; cancelledAt: string | null; expiredAt: string | null;
}
export interface Contact { id: number; name: string; email: string; createdAt: string }
export interface Autodeposit { status: "NONE" | "PENDING_CONFIRMATION" | "ACTIVE"; email: string | null; accountId: number | null; confirmedAt: string | null }
export interface Biller { id: number; name: string; category: string; accountNumberHint: string; accountNumberPattern: string }
export interface Payee { id: number; billerId: number; billerName: string; category: string; nickname: string | null; accountNumber: string; createdAt: string }
export type Recurrence = "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export interface BillPayment {
  id: number; payeeId: number; billerName: string; payeeNickname: string | null; payeeAccountNumber: string; fromAccountId: number;
  amount: string; paymentDate: string; postingDate: string; recurrence: Recurrence; seriesId: string | null; occurrence: number; endDate: string | null;
  status: "SCHEDULED" | "PENDING" | "POSTED" | "CANCELLED" | "FAILED"; failureReason: string | null; transactionId: number | null;
  referenceId: string; createdAt: string; postedAt: string | null; cancelledAt: string | null;
}

export const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Client-side amount check; returns an error message or undefined. */
export function amountError(amount: string): string | undefined {
  if (!amount.trim()) return "Enter an amount.";
  if (!AMOUNT_RE.test(amount.trim())) return "Enter an amount like 25.00 (at most 2 decimals).";
  return undefined;
}

/** Chequing and savings accounts that are open: the only ones e-Transfers can use. */
export function depositAccounts(accounts: Account[] | null): Account[] {
  return accounts?.filter((a) => (a.type === "CHEQUING" || a.type === "SAVINGS") && a.status !== "CLOSED") ?? [];
}

/** Toronto calendar date (YYYY-MM-DD) of an instant. */
export function torontoDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Earliest date a payment can be made on, as far as the browser knows. The sandbox has its own clock (it can be moved
 * forward by tests), so we use the sign-in time stamped by the server with that clock: it is never later than the
 * sandbox's "today". The server always has the final say.
 */
export function useEarliestDate(): string {
  const { me } = useSession();
  return torontoDate(me.lastLoginAt ?? new Date());
}

/** Splits an API error into field errors and a page-level message. */
export function describeProblem(err: unknown): { fields: Record<string, string>; message: string } {
  if (err instanceof ApiProblem) {
    const fields = err.fieldErrors();
    const message = err.errors.length ? "Please fix the highlighted fields." : err.message;
    return { fields, message };
  }
  return { fields: {}, message: "Something went wrong. Please try again." };
}

/** Field errors from the server read "is required"; prefix them so they make sense on their own. */
export function withLabels(fields: Record<string, string>, labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = labels[k] ? `${labels[k]} ${v}.`.replace(/\.\.$/, ".") : v;
  return out;
}

export function Details({ rows, testId }: { rows: [string, React.ReactNode, string?][]; testId?: string }) {
  return (
    <dl className="grid grid-cols-3 gap-y-2 text-sm" data-testid={testId}>
      {rows.map(([label, value, tid]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="col-span-2 break-words" data-testid={tid}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = { NONE: "One time", WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", MONTHLY: "Monthly" };

/** Adds days to a YYYY-MM-DD date. */
export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function payeeLabel(p: Pick<Payee, "billerName" | "nickname" | "accountNumber">): string {
  return `${p.nickname ? `${p.nickname} (${p.billerName})` : p.billerName} - ${p.accountNumber}`;
}
