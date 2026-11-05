/**
 * One OpenAPI registry for the whole API. Each module under src/server/api registers its schemas
 * and paths here; /api/v1/openapi.json renders the document.
 */
import { z } from "zod";
import { extendZodWithOpenApi, OpenAPIRegistry, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { parseAmount } from "@/lib/money";

extendZodWithOpenApi(z);
export { z };

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http", scheme: "bearer", bearerFormat: "JWT",
  description: "Access token from POST /auth/mfa/verify (valid 15 minutes).",
});
registry.registerComponent("securitySchemes", "sandboxKey", {
  type: "apiKey", in: "header", name: "X-Sandbox-Key",
  description: "Sandbox key. Locally: ICEBANK-LOCAL-KEY.",
});

export const FieldErrorSchema = z.object({
  field: z.string().openapi({ example: "amount" }),
  message: z.string().openapi({ example: "must have at most 2 decimal places" }),
});

export const ProblemSchema = registry.register("Problem", z.object({
  type: z.string().openapi({ example: "https://icebank.test/problems/insufficient-funds" }),
  title: z.string().openapi({ example: "Unprocessable Entity" }),
  status: z.number().int().openapi({ example: 422 }),
  detail: z.string().openapi({ example: "Available balance is 120.00." }),
  instance: z.string().openapi({ example: "/api/v1/transfers" }),
  code: z.string().openapi({ example: "INSUFFICIENT_FUNDS", description: "Machine-readable error code." }),
  errors: z.array(FieldErrorSchema).optional(),
}).openapi({ description: "RFC 7807 problem details (application/problem+json)." }));

export const Money = z.string().regex(/^-?\d+\.\d{2}$/).openapi({ example: "1250.00", description: "Decimal string with exactly 2 places." });
export const DateTimeStr = z.string().openapi({ example: "2026-11-04T21:15:00-05:00", description: "ISO 8601 with offset." });
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in the format YYYY-MM-DD").openapi({ example: "2026-11-04" });
export const Id = z.number().int().openapi({ example: 1 });

/**
 * Money input: a decimal string ("25.00") or JSON number (25 or 25.5). More than two decimals is
 * rejected, never rounded. Output is integer cents.
 */
export function moneyInput(opts: { min?: bigint; max?: bigint; example?: string; description?: string } = {}) {
  const min = opts.min ?? 1n;
  return z.union([z.string(), z.number()], { error: "must be a decimal amount such as \"25.00\"" })
    .transform((v, ctx) => {
      const raw = typeof v === "number" ? String(v) : v.trim();
      if (/^-?\d+\.\d{3,}$/.test(raw)) {
        ctx.addIssue({ code: "custom", message: "must have at most 2 decimal places" });
        return z.NEVER;
      }
      const c = parseAmount(v);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: /^-/.test(raw) ? "must be greater than 0" : "must be a decimal amount such as \"25.00\"" });
        return z.NEVER;
      }
      if (c < min) {
        ctx.addIssue({ code: "custom", message: `must be at least ${fmt(min)}` });
        return z.NEVER;
      }
      if (opts.max !== undefined && c > opts.max) {
        ctx.addIssue({ code: "custom", message: `must be at most ${fmt(opts.max)}` });
        return z.NEVER;
      }
      return c;
    })
    .openapi({ type: "string", example: opts.example ?? "250.00", description: opts.description ?? "Decimal string with up to 2 places." });
}
const fmt = (c: bigint) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;

export const PageQuery = z.object({
  page: z.coerce.number({ error: "must be a whole number" }).int("must be a whole number").min(0, "must be 0 or more").default(0).openapi({ example: 0 }),
  size: z.coerce.number({ error: "must be a whole number" }).int("must be a whole number").min(1, "must be between 1 and 100").max(100, "must be between 1 and 100").default(20).openapi({ example: 20 }),
  sort: z.string().optional().openapi({ example: "createdAt,desc", description: "field,direction" }),
});

export function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    content: z.array(item),
    page: z.number().int().openapi({ example: 0 }),
    size: z.number().int().openapi({ example: 20 }),
    totalElements: z.number().int().openapi({ example: 57 }),
    totalPages: z.number().int().openapi({ example: 3 }),
  });
}

// ---- path documentation helper ----------------------------------------------------------------

type Auth = "bearer" | "admin" | "sandbox" | "none" | "bearer-or-sandbox";

interface DocResponse { schema?: z.ZodTypeAny; description: string; example?: unknown; contentType?: string; headers?: Record<string, string> }

export interface DocDef {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth: Auth;
  body?: z.ZodTypeAny;
  bodyExample?: unknown;
  multipart?: z.ZodTypeAny;
  query?: z.ZodObject;
  params?: z.ZodObject;
  idempotent?: boolean;
  responses: Record<number, DocResponse>;
  /** Error statuses this endpoint can return, with an example detail for each. */
  errors?: Partial<Record<400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429, string>>;
}

const ERROR_CODES: Record<number, string> = {
  400: "VALIDATION_FAILED", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE", 422: "BUSINESS_RULE", 429: "RATE_LIMITED",
};
const TITLES: Record<number, string> = {
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict",
  413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests",
};

export function doc(d: DocDef) {
  const fullPath = "/api/v1" + d.path;
  const security: Record<string, string[]>[] =
    d.auth === "bearer" || d.auth === "admin" ? [{ bearerAuth: [] }]
    : d.auth === "sandbox" ? [{ sandboxKey: [] }]
    : d.auth === "bearer-or-sandbox" ? [{ bearerAuth: [] }, { sandboxKey: [] }]
    : [];
  const errors: Record<number, string> = { ...(d.errors ?? {}) } as Record<number, string>;
  if (d.auth !== "none" && !errors[401]) errors[401] = d.auth === "sandbox" ? "This endpoint needs the X-Sandbox-Key header." : "Authentication is required.";
  if (d.auth === "admin" && !errors[403]) errors[403] = "This endpoint requires the ADMIN role.";
  if (!errors[429]) errors[429] = "Too many requests. Try again in 42 seconds.";
  if ((d.body || d.query) && !errors[400]) errors[400] = "One or more fields are invalid.";

  const responses: RouteConfig["responses"] = {};
  for (const [status, r] of Object.entries(d.responses)) {
    const headers: Record<string, { description: string; schema: { type: "string" } }> = {
      "X-Request-Id": { description: "Request id for tracing", schema: { type: "string" } },
    };
    for (const [h, desc] of Object.entries(r.headers ?? {})) headers[h] = { description: desc, schema: { type: "string" } };
    responses[Number(status)] = {
      description: r.description,
      headers,
      ...(r.schema ? { content: { [r.contentType ?? "application/json"]: { schema: r.schema, ...(r.example !== undefined ? { example: r.example } : {}) } } } : {}),
    };
  }
  for (const [status, detail] of Object.entries(errors)) {
    const s = Number(status);
    const example: Record<string, unknown> = {
      type: `https://icebank.test/problems/${ERROR_CODES[s].toLowerCase().replace(/_/g, "-")}`,
      title: TITLES[s], status: s, detail, instance: fullPath.replace(/\{(\w+)\}/g, "1"), code: ERROR_CODES[s],
    };
    if (s === 400) example.errors = [{ field: "amount", message: "must have at most 2 decimal places" }];
    responses[s] = {
      description: TITLES[s],
      headers: s === 429 ? { "Retry-After": { description: "Seconds to wait", schema: { type: "string" } } } : undefined,
      content: { "application/problem+json": { schema: ProblemSchema, example } },
    };
  }

  const reqHeaders = d.idempotent
    ? z.object({ "Idempotency-Key": z.string().max(100).openapi({ example: "6f1c0d7e-2b4a-4c55-9a51-0d1d1a8c9e10", description: "Required. Same key + same body replays the first response; same key + different body returns 409." }) })
    : undefined;

  registry.registerPath({
    method: d.method,
    path: fullPath.replace(/\{(\w+)\}/g, "{$1}"),
    tags: [d.tag],
    summary: d.summary,
    description: d.description,
    security,
    request: {
      ...(d.params ? { params: d.params } : {}),
      ...(d.query ? { query: d.query as z.ZodObject } : {}),
      ...(reqHeaders ? { headers: reqHeaders } : {}),
      ...(d.body ? { body: { required: true, content: { "application/json": { schema: d.body, ...(d.bodyExample ? { example: d.bodyExample } : {}) } } } } : {}),
      ...(d.multipart ? { body: { required: true, content: { "multipart/form-data": { schema: d.multipart } } } } : {}),
    },
    responses,
  });
}

export const IdParam = z.object({ id: z.string().openapi({ example: "1", description: "Resource id" }) });
