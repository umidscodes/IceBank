/** Audit-log filter helpers for the admin audit page. */

/** Suggestions for the action filter (free text is still allowed). */
export const AUDIT_ACTIONS = [
  "ACCOUNT_FROZEN", "ACCOUNT_OPENED", "ACCOUNT_UNFROZEN", "AUTODEPOSIT_ACTIVATED", "AUTODEPOSIT_DISABLED", "BILL_PAYMENT_CANCELLED", "BILL_PAYMENT_CREATED",
  "BILL_PAYMENT_FAILED", "CARD_LIMIT_CHANGED", "CARD_REPORTED_LOST", "CARD_UNLOCKED", "CHEQUE_DEPOSIT_APPROVED", "CHEQUE_DEPOSIT_REJECTED",
  "CHEQUE_DEPOSIT_SUBMITTED", "CUSTOMER_REGISTERED", "DISPUTE_OPENED", "EMAIL_CHANGED", "ETRANSFER_ACCEPTED", "ETRANSFER_CANCELLED", "ETRANSFER_EXPIRED",
  "ETRANSFER_SENT", "LOAN_APPLICATION_SUBMITTED", "LOAN_APPROVED", "LOAN_DECLINED", "LOGIN", "LOGOUT", "PASSWORD_CHANGED", "PAYEE_ADDED", "PAYEE_DELETED",
  "PROFILE_UPDATED", "TRANSFER_POSTED", "USER_LOCKED", "USER_UNLOCKED",
];

export const AUDIT_ENTITY_TYPES = [
  "account", "bill_payment", "card", "cheque_deposit", "customer", "dispute", "etransfer", "loan_application", "payee", "transfer", "user",
];

export type AuditFilters = { action: string; entityType: string; entityId: string; actorUserId: string; from: string; to: string };
export const EMPTY_AUDIT_FILTERS: AuditFilters = { action: "", entityType: "", entityId: "", actorUserId: "", from: "", to: "" };

export function auditQuery(f: AuditFilters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v.trim()) sp.set(k, v.trim());
  return sp.toString();
}

/** Client-side checks so obviously bad filters are flagged before calling the API. */
export function validateAuditFilters(f: AuditFilters): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.entityId.trim() && !/^\d+$/.test(f.entityId.trim())) e.entityId = "Enter a whole number.";
  if (f.actorUserId.trim() && !/^\d+$/.test(f.actorUserId.trim())) e.actorUserId = "Enter a whole number.";
  if (f.from && f.to && f.from > f.to) e.to = "The end date must be on or after the start date.";
  return e;
}

export function prettyJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
