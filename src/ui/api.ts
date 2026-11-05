"use client";
/**
 * Browser-side API client. The UI uses the same public REST API as the tests, with the tokens in
 * httpOnly cookies. A 401 triggers one refresh attempt, then a redirect to the login page.
 */

export interface FieldError { field: string; message: string }

export class ApiProblem extends Error {
  constructor(public status: number, public code: string, message: string, public errors: FieldError[] = [], public body: Record<string, unknown> = {}) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.errors) if (!out[e.field]) out[e.field] = e.message;
    return out;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  idempotencyKey?: string | true;
  /** Don't try to refresh / redirect on 401 (login pages). */
  noAuthRedirect?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey === true ? newIdempotencyKey() : opts.idempotencyKey;
  const res = await fetch(`/api/v1${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, credentials: "same-origin" });
  if (res.status === 401 && !opts.noAuthRedirect && !retried) {
    if (await refresh()) return api<T>(path, opts, true);
    if (typeof window !== "undefined") window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiProblem(401, "UNAUTHORIZED", "Your session has ended. Please sign in again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) {
    throw new ApiProblem(res.status, String(data.code ?? "ERROR"), String(data.detail ?? `Request failed (${res.status})`), (data.errors as FieldError[]) ?? [], data);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiProblem) {
    if (err.errors.length) return err.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export async function logout() {
  try { await api("/auth/logout", { method: "POST", noAuthRedirect: true }); } catch { /* already signed out */ }
  window.location.href = "/login?signedOut=1";
}
