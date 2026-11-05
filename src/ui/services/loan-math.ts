/** Client-side loan maths, mirroring src/lib/loans.ts: payment = P*r/(1-(1+r)^-n), r = APR/12, rounded to the cent. */
export const LOAN_APR_PERCENT = "8.99";

/** Monthly payment in cents. */
export function monthlyPaymentCents(principalCents: number, termMonths: number, aprPercent = LOAN_APR_PERCENT): number {
  const r = Number((Number(aprPercent) / 100).toFixed(8)) / 12; // same float as the server's Number("0.0899") / 12
  const p = principalCents / 100;
  if (r === 0) return Math.round((p / termMonths) * 100);
  return Math.round(((p * r) / (1 - Math.pow(1 + r, -termMonths))) * 100);
}

/**
 * Total interest in cents, summed row by row like the server's amortization schedule
 * (interest = remaining * r rounded half-up; the last row pays off what is left).
 */
export function totalInterestCents(principalCents: number, termMonths: number, aprPercent = LOAN_APR_PERCENT): number {
  const payment = monthlyPaymentCents(principalCents, termMonths, aprPercent);
  // APR in hundredths of a percent, e.g. 899; monthly interest = remaining * bp / (10000 * 12).
  const bp = BigInt(Math.round(Number(aprPercent) * 100));
  let remaining = BigInt(principalCents);
  let total = 0n;
  for (let i = 1; i <= termMonths; i++) {
    const num = remaining * bp * 2n + 120000n;
    const interest = num / 240000n; // half-up rounding of remaining * bp / 120000
    let principal = BigInt(payment) - interest;
    if (i === termMonths || principal > remaining) principal = remaining;
    remaining -= principal;
    total += interest;
  }
  return Number(total);
}

/** Parse "15000" / "15,000.50" into cents, or null. */
export function parseCents(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

export function centsToString(c: number): string {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}
