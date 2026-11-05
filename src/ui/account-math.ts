import type { Account } from "./types";

/** testid for a balance: account-balance-chequing, then account-balance-chequing-2 for a second chequing account, etc. */
export function balanceTestIds(accounts: Account[]): Map<number, string> {
  const seen: Record<string, number> = {};
  const out = new Map<number, string>();
  for (const a of accounts) {
    const t = a.type.toLowerCase();
    seen[t] = (seen[t] ?? 0) + 1;
    out.set(a.id, seen[t] === 1 ? t : `${t}-${seen[t]}`);
  }
  return out;
}

/** Net total = deposits minus what is owed on credit cards and loans (owed balances are negative). */
export function netTotal(accounts: Account[]): string {
  const cents = accounts.reduce((s, a) => s + Math.round(Number(a.balance) * 100), 0);
  return (cents / 100).toFixed(2);
}

/** Turn non-empty filter fields into a query string. */
export function filterQuery(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v.trim()) p.set(k, v.trim());
  return p.toString();
}
