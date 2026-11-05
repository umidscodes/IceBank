/**
 * Every API route goes through route(): request id, auth, sandbox key, rate limits, lazy due work,
 * JSON/multipart parsing, Zod validation, idempotency and RFC 7807 errors.
 */
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import crypto from "node:crypto";
import { ApiError, fromPg, unauthorized, forbidden, badRequest, validation, conflict, type FieldError } from "../errors";
import { verifyAccessToken } from "../auth/tokens";
import { pool, query } from "../db/pool";
import { hit, LIMITS } from "./rate-limit";
import { sha256 } from "@/lib/crypto";
import { processDueWork } from "../services/due-work";

export type AuthMode = "none" | "optional" | "user" | "customer" | "admin";

export interface Principal {
  userId: number;
  sandboxId: number;
  role: "CUSTOMER" | "ADMIN" | "INSTRUCTOR";
  sessionId: string;
  customerId: number | null;
  email: string;
}

export interface Ctx<B, Q> {
  req: NextRequest;
  requestId: string;
  ip: string;
  path: string;
  params: Record<string, string>;
  body: B;
  query: Q;
  user: Principal | null;
  /** Sandbox from the token, else from X-Sandbox-Key, else null. */
  sandboxId: number | null;
  /** Sandbox proven by a valid X-Sandbox-Key header. */
  keySandboxId: number | null;
  form: FormData | null;
}

export interface Cookie { name: string; value: string; maxAge: number }
export interface Result {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Cookie[];
  /** Non-JSON payload (CSV, PDF, images). */
  raw?: { data: Uint8Array | string; contentType: string };
}

export const ok = (body: unknown, headers?: Record<string, string>): Result => ({ status: 200, body, headers });
export const created = (body: unknown, location: string, headers: Record<string, string> = {}): Result =>
  ({ status: 201, body, headers: { Location: location, ...headers } });
export const accepted = (body: unknown): Result => ({ status: 202, body });
export const noContent = (cookies?: Cookie[]): Result => ({ status: 204, cookies });

export interface RouteOptions<B, Q> {
  auth: AuthMode;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  multipart?: boolean;
  idempotent?: boolean;
  rate?: "login" | "default" | "none";
  sandboxKey?: "required" | "optional";
  /** Skip the lazy due-work pass (health checks, reset). */
  skipDueWork?: boolean;
}

const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;

export function route<B = undefined, Q = undefined>(
  opts: RouteOptions<B, Q>,
  fn: (ctx: Ctx<B, Q>) => Promise<Result>,
) {
  return async (req: NextRequest, nctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const started = Date.now();
    const incoming = req.headers.get("x-request-id");
    const requestId = incoming && /^[\w.-]{1,100}$/.test(incoming) ? incoming : crypto.randomUUID();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const path = req.nextUrl.pathname;
    let response: Response;
    let idem: { id: number; sandboxId: number } | null = null;
    try {
      const params = (await nctx?.params) ?? {};

      // ---- authentication --------------------------------------------------------------------
      let user: Principal | null = null;
      const authz = req.headers.get("authorization");
      const bearer = authz?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
      const token = bearer ?? req.cookies.get("ib_at")?.value ?? null;
      if (authz && !bearer && opts.auth !== "none") throw unauthorized("Authorization header must use the Bearer scheme.", "INVALID_TOKEN");
      if (token && opts.auth !== "none") {
        user = await loadPrincipal(token);
        if (!user && (bearer || opts.auth !== "optional")) throw unauthorized("The access token is invalid or has expired.", "INVALID_TOKEN");
      }
      if (opts.auth !== "none" && opts.auth !== "optional" && !user) throw unauthorized();
      if (user && opts.auth === "customer" && user.role !== "CUSTOMER") throw forbidden("This endpoint is for customers.");
      if (user && opts.auth === "admin" && user.role !== "ADMIN") throw forbidden("This endpoint requires the ADMIN role.");

      // ---- sandbox key ----------------------------------------------------------------------
      let keySandboxId: number | null = null;
      const key = req.headers.get("x-sandbox-key");
      if (key) {
        const r = await query<{ id: number }>("SELECT id FROM sandboxes WHERE key_hash = $1", [sha256(key)]);
        if (!r[0]) throw unauthorized("The X-Sandbox-Key header is not valid.", "INVALID_SANDBOX_KEY");
        keySandboxId = r[0].id;
        if (user && user.sandboxId !== keySandboxId) throw forbidden("The sandbox key does not match your sandbox.");
      } else if (opts.sandboxKey === "required") {
        throw unauthorized("This endpoint needs the X-Sandbox-Key header.", "SANDBOX_KEY_REQUIRED");
      }
      const sandboxId = user?.sandboxId ?? keySandboxId;

      // ---- rate limits ------------------------------------------------------------------------
      if (opts.rate !== "none") {
        const wait = opts.rate === "login"
          ? hit(`login:${ip}`, LIMITS.login)
          : hit(user ? `u:${user.sandboxId}:${user.userId}` : `ip:${ip}`, LIMITS.default);
        if (wait !== null) {
          throw new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${wait} seconds.`, undefined, { "Retry-After": String(wait) });
        }
      }

      if (sandboxId !== null && !opts.skipDueWork) await processDueWork(sandboxId);

      // ---- query ------------------------------------------------------------------------------
      let q: Q = undefined as Q;
      if (opts.query) {
        const raw: Record<string, string> = {};
        req.nextUrl.searchParams.forEach((v, k) => { raw[k] = v; });
        q = parseWith(opts.query, raw, "query");
      }

      // ---- body -------------------------------------------------------------------------------
      let body: B = undefined as B;
      let form: FormData | null = null;
      let rawForHash = "";
      if (opts.multipart) {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().startsWith("multipart/form-data")) {
          throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send this request as multipart/form-data.");
        }
        const len = Number(req.headers.get("content-length") ?? 0);
        if (len > MAX_MULTIPART_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request is larger than 11 MB.");
        const buf = new Uint8Array(await req.arrayBuffer());
        if (buf.byteLength > MAX_MULTIPART_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request is larger than 11 MB.");
        try {
          form = await new Response(buf, { headers: { "content-type": ct } }).formData();
        } catch {
          throw badRequest("The multipart body could not be parsed.", undefined, "MALFORMED_MULTIPART");
        }
        // Hash the parsed parts, not the raw bytes: the multipart boundary changes on every retry.
        const parts: string[] = [];
        for (const [name, value] of form.entries()) {
          if (typeof value === "string") parts.push(`${name}=${value}`);
          else parts.push(`${name}=file:${crypto.createHash("sha256").update(new Uint8Array(await value.arrayBuffer())).digest("hex")}`);
        }
        rawForHash = sha256(parts.sort().join("&"));
      } else if (opts.body) {
        const ct = req.headers.get("content-type") ?? "";
        const text = await req.text();
        if (text.length > 0 && !/^application\/([\w.+-]*\+)?json/i.test(ct)) {
          throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.");
        }
        let json: unknown = {};
        if (text.trim().length > 0) {
          try { json = JSON.parse(text); } catch {
            throw badRequest("The request body is not valid JSON.", undefined, "MALFORMED_JSON");
          }
        } else {
          throw badRequest("A JSON request body is required.", undefined, "BODY_REQUIRED");
        }
        if (json === null || typeof json !== "object" || Array.isArray(json)) {
          throw badRequest("The request body must be a JSON object.", undefined, "MALFORMED_JSON");
        }
        rawForHash = sha256(stableStringify(json));
        body = parseWith(opts.body, json, "body");
      }

      const ctx: Ctx<B, Q> = { req, requestId, ip, path, params, body, query: q, user, sandboxId, keySandboxId, form };

      // ---- idempotency ------------------------------------------------------------------------
      if (opts.idempotent && user) {
        const key = req.headers.get("idempotency-key");
        if (!key) throw badRequest("The Idempotency-Key header is required for this request.", [{ field: "Idempotency-Key", message: "is required" }], "IDEMPOTENCY_KEY_REQUIRED");
        if (key.length > 100) throw badRequest("Idempotency-Key must be at most 100 characters.", [{ field: "Idempotency-Key", message: "must be at most 100 characters" }]);
        const requestHash = sha256(`${req.method} ${path} ${rawForHash}`);
        const replay = await claimIdempotencyKey(user, key, req.method, path, requestHash);
        if (replay.kind === "replay") {
          response = buildResponse(replay.result, requestId, path);
          response.headers.set("Idempotent-Replayed", "true");
          return finish(response, req, started, requestId);
        }
        idem = { id: replay.id, sandboxId: user.sandboxId };
      }

      const result = await fn(ctx);
      if (idem) await storeIdempotent(idem, result);
      response = buildResponse(result, requestId, path);
    } catch (err) {
      const apiErr = toApiError(err);
      if (idem) {
        if (apiErr.status < 500) await storeIdempotent(idem, problemResult(apiErr, path));
        else await pool().query("DELETE FROM idempotency_keys WHERE sandbox_id = $1 AND id = $2", [idem.sandboxId, idem.id]).catch(() => {});
      }
      if (apiErr.status >= 500) console.error(`[api] ${req.method} ${path} failed (${requestId}):`, err);
      response = buildResponse(problemResult(apiErr, path), requestId, path);
    }
    return finish(response, req, started, requestId);
  };
}

function finish(res: Response, req: NextRequest, started: number, requestId: string): Response {
  if (process.env.ICEBANK_QUIET_LOGS !== "true") {
    console.log(`[api] ${req.method} ${req.nextUrl.pathname} -> ${res.status} ${Date.now() - started}ms ${requestId}`);
  }
  return res;
}

function parseWith<T>(schema: ZodType<T>, input: unknown, where: "query" | "body"): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw validation(zodToFieldErrors(r.error, where));
}

export function zodToFieldErrors(err: ZodError, where = "body"): FieldError[] {
  return err.issues.map((i) => ({
    field: i.path.length ? i.path.join(".") : where,
    message: i.message,
  }));
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) return validation(zodToFieldErrors(err));
  return fromPg(err) ?? new ApiError(500, "INTERNAL_ERROR", "Something went wrong on our side. Quote the X-Request-Id when reporting it.");
}

function problemResult(e: ApiError, path: string): Result {
  return {
    status: e.status,
    headers: { ...e.headers, "Content-Type": "application/problem+json" },
    body: {
      type: e.type, title: e.title, status: e.status, detail: e.detail, instance: path, code: e.code,
      ...(e.errors ? { errors: e.errors } : {}), ...e.extra,
    },
  };
}

function buildResponse(r: Result, requestId: string, _path: string): Response {
  const headers = new Headers(r.headers ?? {});
  headers.set("X-Request-Id", requestId);
  headers.set("Cache-Control", "no-store");
  let res: Response;
  if (r.raw) {
    headers.set("Content-Type", r.raw.contentType);
    res = new NextResponse(r.raw.data as BodyInit, { status: r.status, headers });
  } else if (r.status === 204 || r.body === undefined) {
    res = new NextResponse(null, { status: r.status, headers });
  } else {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    res = new NextResponse(JSON.stringify(r.body), { status: r.status, headers });
  }
  for (const c of r.cookies ?? []) {
    (res as NextResponse).cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: c.maxAge, secure: false });
  }
  return res;
}

async function loadPrincipal(token: string): Promise<Principal | null> {
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const rows = await query<{ id: number; role: Principal["role"]; email: string; status: string; customer_id: number | null; live: boolean }>(
    `SELECT u.id, u.role, u.email, u.status, c.id AS customer_id,
            EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.sandbox_id = u.sandbox_id AND r.session_id = $3
                     AND r.user_id = u.id AND r.revoked_at IS NULL AND r.expires_at > app_now(u.sandbox_id)) AS live
       FROM users u LEFT JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id
      WHERE u.sandbox_id = $1 AND u.id = $2`,
    [claims.sbx, Number(claims.sub), claims.sid],
  );
  const u = rows[0];
  if (!u || !u.live || u.status === "DISABLED") return null;
  return { userId: u.id, sandboxId: claims.sbx, role: u.role, sessionId: claims.sid, customerId: u.customer_id, email: u.email };
}

type Claim = { kind: "new"; id: number } | { kind: "replay"; result: Result };

async function claimIdempotencyKey(user: Principal, key: string, method: string, path: string, hash: string): Promise<Claim> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await query<{ id: number; request_hash: string; response_status: number | null; response_body: unknown; response_headers: Record<string, string> | null }>(
      `SELECT id, request_hash, response_status, response_body, response_headers FROM idempotency_keys
        WHERE sandbox_id = $1 AND user_id = $2 AND idempotency_key = $3`,
      [user.sandboxId, user.userId, key],
    );
    const e = existing[0];
    if (e) {
      if (e.request_hash !== hash) throw conflict("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
      if (e.response_status === null) throw conflict("IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still being processed.");
      return { kind: "replay", result: { status: e.response_status, body: e.response_body ?? undefined, headers: e.response_headers ?? {} } };
    }
    const ins = await query<{ id: number }>(
      `INSERT INTO idempotency_keys (sandbox_id, user_id, idempotency_key, method, path, request_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, app_now($1)) ON CONFLICT (sandbox_id, user_id, idempotency_key) DO NOTHING RETURNING id`,
      [user.sandboxId, user.userId, key, method, path, hash],
    );
    if (ins[0]) return { kind: "new", id: ins[0].id };
  }
  throw conflict("IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still being processed.");
}

async function storeIdempotent(idem: { id: number; sandboxId: number }, r: Result) {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers ?? {})) headers[k] = v;
  await pool().query(
    "UPDATE idempotency_keys SET response_status = $3, response_body = $4, response_headers = $5 WHERE sandbox_id = $1 AND id = $2",
    [idem.sandboxId, idem.id, r.status, r.body === undefined ? null : JSON.stringify(r.body), JSON.stringify(headers)],
  );
}

/** JSON.stringify with sorted keys, so {"a":1,"b":2} and {"b":2,"a":1} count as the same body. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}
