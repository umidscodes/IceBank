/** Account number = institution 999 (fictional) - 5-digit transit - 7-digit account. */
export const TRANSITS = ["10021", "10045", "20012", "30077"] as const;

export function accountNumberFor(id: number): string {
  return `999-${TRANSITS[id % TRANSITS.length]}-${String(1000000 + ((id * 7919) % 9000000)).padStart(7, "0")}`;
}

export const ACCOUNT_LABELS: Record<string, string> = {
  CHEQUING: "Chequing", SAVINGS: "Savings", CREDIT: "Credit card", LOAN: "Personal loan",
};

/** Mask to the last 4 digits: "•••• 1234". */
export function maskLast4(last4: string): string {
  return `**** **** **** ${last4}`;
}
