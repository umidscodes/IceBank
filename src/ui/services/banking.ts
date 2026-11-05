/** Response types and constants for the deposit, card, loan, statement, dispute, notification and profile pages. */
import type { Transaction } from "../types";

export interface ChequeDeposit {
  id: number; accountId: number; amount: string; immediateAmount: string; heldAmount: string;
  status: "PENDING" | "APPROVED" | "REJECTED"; rejectReason: string | null;
  frontImage: { contentType: string; bytes: number }; backImage: { contentType: string; bytes: number };
  transactionId: number | null; referenceId: string; createdAt: string; decidedAt: string | null;
}

export interface BankCard {
  id: number; accountId: number; type: "DEBIT" | "CREDIT"; maskedNumber: string; last4: string; expiry: string;
  status: "ACTIVE" | "LOCKED" | "CANCELLED"; dailyPosLimit: string | null; replacedByCardId: number | null; createdAt: string;
}

export interface Loan {
  id: number; applicationId: number; accountId: number; principal: string; apr: string; termMonths: number; monthlyPayment: string;
  totalInterest: string; balanceOwing: string; firstPaymentDate: string; nextPaymentDate: string | null; paymentsMade: number;
  status: "ACTIVE" | "PAID_OFF"; createdAt: string;
}

export interface LoanApplication {
  id: number; amount: string; termMonths: number; purpose: string; annualIncome: string; monthlyDebtPayments: string; apr: string;
  monthlyPayment: string; dtiPercent: string; status: "APPROVED" | "MANUAL_REVIEW" | "DECLINED"; decisionSource: "AUTOMATIC" | "ADMIN";
  decisionReason: string | null; disbursementAccountId: number; loanId: number | null; createdAt: string; decidedAt: string | null;
}

export interface ScheduleRow {
  installmentNo: number; dueDate: string; payment: string; principal: string; interest: string; remainingBalance: string;
  status: "DUE" | "PAID" | "MISSED"; paidAt: string | null;
}
export interface LoanSchedule { loanId: number; principal: string; totalInterest: string; totalPaid: string; rows: ScheduleRow[] }

export interface Statement {
  month: string; periodStart: string; periodEnd: string; openingBalance: string; closingBalance: string; transactionCount: number; url: string;
}

export const DISPUTE_REASONS = ["UNAUTHORIZED", "DUPLICATE", "INCORRECT_AMOUNT", "NOT_RECEIVED", "CANCELLED_SERVICE", "OTHER"] as const;
export const DISPUTE_REASON_LABEL: Record<string, string> = {
  UNAUTHORIZED: "I did not authorize this transaction", DUPLICATE: "I was charged more than once", INCORRECT_AMOUNT: "The amount is wrong",
  NOT_RECEIVED: "I did not receive the goods or service", CANCELLED_SERVICE: "I cancelled this service", OTHER: "Other",
};
export interface Dispute {
  id: number; transactionId: number; reason: string; description: string | null; status: "OPEN" | "RESOLVED" | "REJECTED";
  transaction: Transaction; createdAt: string; resolvedAt: string | null;
}

export interface Notification {
  id: number; type: "MONEY_MOVEMENT" | "LOGIN" | "SECURITY" | "ACCOUNT" | "LOAN" | "DEPOSIT"; title: string; body: string;
  createdAt: string; readAt: string | null;
}

export const LOAN_PURPOSES = ["Car purchase", "Home renovation", "Debt consolidation", "Education", "Vacation", "Wedding", "Medical", "Other"] as const;

export const PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut",
  ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};

/** Only ever show the last 4 digits, whatever the server sends. */
export function maskCard(last4: string): string {
  return `**** **** **** ${last4.slice(-4)}`;
}

/** $500 to $5,000 in $100 steps, as "500.00" ... "5000.00". */
export const POS_LIMIT_OPTIONS: string[] = Array.from({ length: 46 }, (_, i) => `${500 + i * 100}.00`);
