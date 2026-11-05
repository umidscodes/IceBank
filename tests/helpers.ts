/**
 * Test helpers: a tiny router that finds the Next.js route handler for a path under
 * src/app/api/v1 and calls it directly with a NextRequest (no HTTP server needed).
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import pg from "pg";

const API_DIR = path.resolve(__dirname, "../src/app/api/v1");
export const KEY = "ICEBANK-LOCAL-KEY";
export const PASSWORD = "IceBank#2026";

interface RouteEntry { regex: RegExp; names: string[]; file: string; specificity: number }
const routes: RouteEntry[] = [];
(function scan(dir: string, segs: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) scan(path.join(dir, e.name), [...segs, e.name]);
    else if (e.name === "route.ts") {
      const names: string[] = [];
      let specificity = 0;
      const pattern = segs.map((s) => {
        if (s.startsWith("[...")) { names.push(s.slice(4, -1)); return "(.+)"; }
        if (s.startsWith("[")) { names.push(s.slice(1, -1)); specificity += 1; return "([^/]+)"; }
        specificity += 10;
        return s.replace(/[.]/g, "\\.");
      }).join("/");
      routes.push({ regex: new RegExp(`^/${pattern}$`), names, file: path.join(dir, e.name), specificity });
    }
  }
})(API_DIR, []);
routes.sort((a, b) => b.specificity - a.specificity || (a.names.length - b.names.length));

export interface Res<T = any> { status: number; headers: Headers; body: T; text: string; raw: Response } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function call<T = any>(method: string, url: string, opts: { body?: unknown; token?: string; headers?: Record<string, string>; form?: FormData; rawBody?: string } = {}): Promise<Res<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [p] = url.split("?");
  const route = routes.find((r) => r.regex.test(p));
  if (!route) throw new Error(`No route for ${p}`);
  const m = route.regex.exec(p)!;
  const params: Record<string, string> = {};
  route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
  const mod = await import(route.file);
  const handler = mod[method];
  if (!handler) return { status: 405, headers: new Headers(), body: null as T, text: "", raw: new Response(null, { status: 405 }) };
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.rawBody !== undefined) { body = opts.rawBody; headers["content-type"] ??= "application/json"; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let req = new NextRequest(`http://localhost:3000/api/v1${url}`, { method, headers, body });
  if (opts.form) {
    // Let Request compute the multipart content-type with its boundary.
    const r = new Request("http://x", { method: "POST", body: opts.form });
    req = new NextRequest(`http://localhost:3000/api/v1${url}`, { method, headers: { ...headers, "content-type": r.headers.get("content-type")! }, body: await r.arrayBuffer() });
  }
  const res: Response = await handler(req, { params: Promise.resolve(params) });
  const text = await res.clone().text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, body: parsed as T, text, raw: res };
}

export async function reset() {
  const r = await call("POST", "/test/reset", { headers: { "x-sandbox-key": KEY } });
  if (r.status !== 200) throw new Error(`reset failed: ${r.status} ${r.text}`);
}

export async function clock(body: Record<string, unknown>) {
  const r = await call("POST", "/test/clock", { body, headers: { "x-sandbox-key": KEY } });
  if (r.status !== 200) throw new Error(`clock failed: ${r.status} ${r.text}`);
  return r.body;
}

export async function latestOtp(email: string): Promise<string> {
  const r = await call("GET", `/inbox?email=${encodeURIComponent(email)}&size=1`, { headers: { "x-sandbox-key": KEY } });
  const msg = r.body.content.find((m: { otpCode: string | null }) => m.otpCode);
  if (!msg) throw new Error(`no OTP for ${email}`);
  return msg.otpCode;
}

export async function login(email: string, password = PASSWORD): Promise<string> {
  const r = await call("POST", "/auth/login", { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${r.text}`);
  const code = await latestOtp(email);
  const v = await call("POST", "/auth/mfa/verify", { body: { mfaToken: r.body.mfaToken, code } });
  if (v.status !== 200) throw new Error(`mfa ${email}: ${v.status} ${v.text}`);
  return v.body.accessToken;
}

let keyN = 0;
export const idem = () => ({ "idempotency-key": `test-${Date.now()}-${keyN++}` });

let dbClient: pg.Pool | null = null;
/** Direct database access as the superuser (for JDBC-style checks). */
export function sql(): pg.Pool {
  dbClient ??= new pg.Pool({ connectionString: process.env.ICEBANK_TEST_ADMIN_URL, max: 2 });
  return dbClient;
}

export const EMMA = "emma.tremblay@icebank.test";
export const LIAM = "liam.chen@icebank.test";
export const OLIVIA = "olivia.singh@icebank.test";
export const NOAH = "noah.martin@icebank.test";
export const AVA = "ava.roy@icebank.test";
export const LUCAS = "lucas.gagnon@icebank.test";
export const TELLER = "teller@icebank.test";
