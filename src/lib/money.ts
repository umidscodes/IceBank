/**
 * Money helpers. Amounts travel as decimal strings with exactly two places ("1250.00") and are
 * calculated as integer cents (bigint), never as floating point.
 */

/** Strict parse of a decimal string or JSON number into cents. Returns null if invalid. */
export function parseAmount(input: unknown, opts: { maxDecimals?: number; allowNegative?: boolean } = {}): bigint | null {
  const maxDecimals = opts.maxDecimals ?? 2;
  let s: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    s = String(input);
    if (/e/i.test(s)) return null;
  } else if (typeof input === "string") {
    s = input.trim();
  } else {
    return null;
  }
  const m = /^(-)?(\d{1,12})(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  if (m[1] && !opts.allowNegative) return null;
  const frac = m[3] ?? "";
  if (frac.length > maxDecimals) return null;
  const cents = BigInt(m[2]) * 100n + BigInt((frac + "00").slice(0, 2));
  return m[1] ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Round any decimal string to cents, half away from zero. */
export function roundHalfUpToCents(value: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`Not a decimal: ${value}`);
  const frac = (m[3] ?? "").padEnd(3, "0");
  let cents = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1n;
  return m[1] ? -cents : cents;
}

/** Normalise a NUMERIC from Postgres ("12.5", "-3", "1.234567") to a 2-place string. */
export function money(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  if (typeof value === "bigint") return formatCents(value);
  return formatCents(roundHalfUpToCents(String(value)));
}

export function toCents(value: string | number): bigint {
  return roundHalfUpToCents(String(value));
}

/**
 * cents * rate / divisor, rounded half away from zero. `rate` is a decimal string such as "0.2099".
 */
export function mulRate(cents: bigint, rate: string, divisor = 1n): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!m) throw new Error(`Bad rate ${rate}`);
  const scale = 10n ** BigInt((m[2] ?? "").length);
  const r = BigInt(m[1] + (m[2] ?? ""));
  const num = cents * r;
  const den = scale * divisor;
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (a * 2n + den) / (den * 2n);
  return neg ? -q : q;
}

/** "$1,250.00" / "-$40.00" */
export function formatDisplay(value: bigint | string): string {
  const c = typeof value === "string" ? toCents(value) : value;
  const neg = c < 0n;
  const [w, f] = formatCents(neg ? -c : c).split(".");
  return `${neg ? "-" : ""}$${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

export const minCents = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxCents = (a: bigint, b: bigint) => (a > b ? a : b);
