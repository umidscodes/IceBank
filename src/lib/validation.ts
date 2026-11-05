/** Shared validation rules (the test oracle; mirrored in the README). */

export const PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut",
  ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};
export const PROVINCE_CODES = Object.keys(PROVINCES) as [string, ...string[]];

/** Canadian postal code "A1A 1A1" (letters D, F, I, O, Q, U never used; W, Z never first). */
export const POSTAL_CODE_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/;
export const PHONE_RE = /^\(\d{3}\) \d{3}-\d{4}$/;
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Append a Luhn check digit to a digit string. */
export function withLuhnDigit(partial: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValid(partial + d)) return partial + d;
  }
  throw new Error("unreachable");
}

/** SIN: 9 digits (spaces or dashes allowed between groups), Luhn valid, not starting with 0 or 8. */
export function normaliseSin(sin: string): string | null {
  const digits = sin.replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(digits)) return null;
  if (digits[0] === "0" || digits[0] === "8") return null;
  return luhnValid(digits) ? digits : null;
}

/** Returns the list of password rule violations (empty = valid). */
export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 8 || pw.length > 64) p.push("must be 8 to 64 characters");
  if (!/[A-Z]/.test(pw)) p.push("must contain an uppercase letter");
  if (!/[a-z]/.test(pw)) p.push("must contain a lowercase letter");
  if (!/\d/.test(pw)) p.push("must contain a digit");
  if (!SPECIAL_RE.test(pw)) p.push("must contain a special character");
  return p;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
