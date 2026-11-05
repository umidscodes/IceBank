/** Display formatting shared by client components. */
const ZONE = "America/Toronto";

export function formatMoney(value: string | number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || value === "") return "";
  const s = typeof value === "number" ? value.toFixed(2) : value;
  const neg = s.startsWith("-");
  const [w, f = "00"] = (neg ? s.slice(1) : s).split(".");
  const body = `$${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f.padEnd(2, "0").slice(0, 2)}`;
  if (neg) return `-${body}`;
  return opts.sign ? `+${body}` : body;
}

/** "Owing" amounts are stored negative; show them as a positive amount owed. */
export function formatOwing(value: string): string {
  return formatMoney(value.startsWith("-") ? value.slice(1) : value === "0.00" ? "0.00" : `-${value}`);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: ZONE });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE });
}

export const ACCOUNT_LABEL: Record<string, string> = { CHEQUING: "Chequing", SAVINGS: "Savings", CREDIT: "Credit card", LOAN: "Personal loan" };

export function humanize(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");
}
