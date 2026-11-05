/**
 * RFC 7807 problem details. Every error response is application/problem+json with
 * type, title, status, detail, instance, plus `code` (machine-readable) and, for validation
 * errors, `errors: [{ field, message }]`.
 */
export interface FieldError { field: string; message: string }

const TITLES: Record<number, string> = {
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  409: "Conflict", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity",
  429: "Too Many Requests", 500: "Internal Server Error",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string,
    public errors?: FieldError[],
    public headers: Record<string, string> = {},
    public extra: Record<string, unknown> = {},
  ) {
    super(detail);
  }
  get title() { return TITLES[this.status] ?? "Error"; }
  get type() { return `https://icebank.test/problems/${this.code.toLowerCase().replace(/_/g, "-")}`; }
}

export const badRequest = (detail: string, errors?: FieldError[], code = "VALIDATION_FAILED") => new ApiError(400, code, detail, errors);
export const validation = (errors: FieldError[]) => new ApiError(400, "VALIDATION_FAILED", "One or more fields are invalid.", errors);
export const fieldError = (field: string, message: string) => validation([{ field, message }]);
export const unauthorized = (detail = "Authentication is required.", code = "UNAUTHORIZED") => new ApiError(401, code, detail);
export const forbidden = (detail = "You do not have permission to perform this action.") => new ApiError(403, "FORBIDDEN", detail);
export const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: string, detail: string) => new ApiError(409, code, detail);
export const rule = (code: string, detail: string, extra: Record<string, unknown> = {}) => new ApiError(422, code, detail, undefined, {}, extra);

/** Map errors raised by Postgres (constraints, post_transfer) to API errors. */
export function fromPg(err: unknown): ApiError | null {
  const e = err as { code?: string; message?: string; constraint?: string; detail?: string };
  if (!e || typeof e.code !== "string") return null;
  if (e.code === "P0001" && e.message) {
    const m = /^([A-Z_]+):\s*(.*)$/.exec(e.message);
    if (m) {
      const [, code, detail] = m;
      if (code === "ACCOUNT_NOT_FOUND") return notFound("Account");
      const pretty = detail.charAt(0).toUpperCase() + detail.slice(1) + (detail.endsWith(".") ? "" : ".");
      return rule(code, pretty);
    }
  }
  if (e.code === "23505") return conflict("DUPLICATE", "A record with the same unique value already exists.");
  if (e.code === "23503") return conflict("REFERENCED", "The record is referenced by other records and cannot be changed.");
  if (e.code === "23514") {
    if (e.constraint?.includes("balance") || e.constraint?.includes("credit_limit")) return rule("INSUFFICIENT_FUNDS", "Insufficient funds.");
    return rule("CONSTRAINT_VIOLATION", `The request breaks a data rule (${e.constraint ?? "check"}).`);
  }
  return null;
}
