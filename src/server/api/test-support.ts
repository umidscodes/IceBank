/** Test support: health, reset, app clock. Reset and clock need X-Sandbox-Key. */
import { z, doc, DateTimeStr, DateStr, Id } from "../openapi/registry";
import { route, ok } from "../http/handler";
import { pool, query } from "../db/pool";
import { ApiError, rule, validation } from "../errors";
import { processDueWork, forgetDueWork } from "../services/due-work";
import { resetSandbox, LOCAL_SANDBOX } from "../../../db/seed/reset";
import { clearRateLimits } from "../http/rate-limit";
import { isoOffset, torontoDate, SEED_INSTANT, ZONE } from "@/lib/dates";
import { DateTime } from "luxon";

const ClockSchema = z.object({
  sandboxId: Id,
  now: DateTimeStr.openapi({ description: "The sandbox's virtual time" }),
  today: DateStr.openapi({ description: "Virtual date in America/Toronto" }),
  offsetSeconds: z.number().int(),
  offsetDays: z.number().openapi({ example: 3.5, description: "How far the clock is ahead of real time, in days" }),
});

const ClockBody = z.object({
  date: DateStr.optional().openapi({ description: "Jump to this date (Toronto), keeping the current time of day" }),
  dateTime: z.string().optional().openapi({ example: "2026-12-01T09:00:00-05:00", description: "Jump to this exact instant" }),
  advanceDays: z.number().int("must be a whole number").min(1, "must be at least 1").max(3660).optional().openapi({ example: 30 }),
  advanceMinutes: z.number().int("must be a whole number").min(1, "must be at least 1").max(527040).optional().openapi({ example: 16 }),
}).openapi({ example: { advanceDays: 30 } });

const DueSchema = z.object({
  billPaymentsPosted: z.number().int(), billPaymentsFailed: z.number().int(), loanPaymentsCollected: z.number().int(),
  loanPaymentsMissed: z.number().int(), etransfersExpired: z.number().int(), interestPayments: z.number().int(), daysProcessed: z.number().int(),
});

doc({ method: "get", path: "/test/health", tag: "Test support", summary: "Health check", auth: "none",
  responses: { 200: { schema: z.object({ status: z.literal("UP"), database: z.literal("UP"), build: z.string(), version: z.string(), time: DateTimeStr }), description: "Up" } } });
doc({ method: "post", path: "/test/reset", tag: "Test support", summary: "Reset your sandbox to its seed state", auth: "sandbox",
  description: "Deletes every row of the sandbox and re-seeds it: same IDs, same balances. The clock goes back to the seed instant 2026-11-02T09:00:00-05:00.",
  responses: { 200: { schema: z.object({ sandboxId: Id, resetAt: DateTimeStr, clock: ClockSchema, customers: z.number().int(), accounts: z.number().int(), transactions: z.number().int() }), description: "Reset done" } } });
doc({ method: "get", path: "/test/clock", tag: "Test support", summary: "Read the sandbox clock", auth: "sandbox", responses: { 200: { schema: ClockSchema, description: "Clock" } } });
doc({ method: "post", path: "/test/clock", tag: "Test support", summary: "Move the sandbox clock forward", auth: "sandbox",
  description: "Send exactly one of date, dateTime, advanceDays or advanceMinutes. The clock never moves backwards (use reset). " +
    "Due work (scheduled payments, interest, loan payments, e-transfer expiry) runs before the response, so the database already shows the result.",
  body: ClockBody, responses: { 200: { schema: ClockSchema.extend({ dueWork: DueSchema }), description: "Clock moved" } },
  errors: { 400: "Send exactly one of date, dateTime, advanceDays or advanceMinutes.", 422: "The clock cannot move backwards. Use POST /test/reset." } });

export async function clockFor(sb: number) {
  const [r] = await query<{ now: Date; offset: number }>("SELECT app_now(id) AS now, clock_offset_seconds AS offset FROM sandboxes WHERE id = $1", [sb]);
  return {
    sandboxId: sb, now: isoOffset(r.now)!, today: torontoDate(r.now),
    offsetSeconds: Number(r.offset), offsetDays: Math.round((Number(r.offset) / 86400) * 100) / 100,
  };
}

export const health = route({ auth: "none", rate: "none", skipDueWork: true }, async () => {
  try {
    await pool().query("SELECT count(*) FROM sandboxes");
  } catch {
    throw new ApiError(503, "DATABASE_DOWN", "The database is not reachable.");
  }
  return ok({ status: "UP", database: "UP", build: process.env.BUILD_FLAVOR ?? "clean", version: "1.0.0", time: isoOffset(new Date())! });
});

export const reset = route({ auth: "optional", sandboxKey: "required", rate: "none", skipDueWork: true }, async (ctx) => {
  const sb = ctx.keySandboxId!;
  const client = await pool().connect();
  let summary;
  try {
    const spec = sb === LOCAL_SANDBOX.id && !process.env.ICEBANK_SANDBOXES
      ? LOCAL_SANDBOX
      : { id: sb, name: `Sandbox ${sb}`, key: ctx.req.headers.get("x-sandbox-key")!, emailSuffix: process.env.ICEBANK_SANDBOXES ? `+s${sb}` : undefined };
    summary = await resetSandbox(client, spec);
  } finally {
    client.release();
  }
  forgetDueWork(sb);
  clearRateLimits();
  return ok({ sandboxId: sb, resetAt: isoOffset(new Date())!, clock: await clockFor(sb), ...summary });
});

export const getClock = route({ auth: "optional", sandboxKey: "required", rate: "none" }, async (ctx) => ok(await clockFor(ctx.keySandboxId!)));

export const setClock = route({ auth: "optional", sandboxKey: "required", body: ClockBody, rate: "none" }, async (ctx) => {
  const sb = ctx.keySandboxId!;
  const b = ctx.body;
  const given = [b.date, b.dateTime, b.advanceDays, b.advanceMinutes].filter((v) => v !== undefined).length;
  if (given !== 1) throw validation([{ field: "body", message: "send exactly one of date, dateTime, advanceDays or advanceMinutes" }]);
  const [cur] = await query<{ now: Date }>("SELECT app_now($1) AS now", [sb]);
  const current = DateTime.fromJSDate(cur.now).setZone(ZONE);
  let target: DateTime;
  if (b.advanceDays) target = current.plus({ days: b.advanceDays });
  else if (b.advanceMinutes) target = current.plus({ minutes: b.advanceMinutes });
  else if (b.date) {
    const d = DateTime.fromISO(b.date, { zone: ZONE });
    if (!d.isValid) throw validation([{ field: "date", message: "must be a real date" }]);
    target = d.set({ hour: current.hour, minute: current.minute, second: current.second });
  } else {
    const d = DateTime.fromISO(b.dateTime!, { setZone: true });
    if (!d.isValid || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(b.dateTime!)) throw validation([{ field: "dateTime", message: "must be ISO 8601 with an offset, e.g. 2026-12-01T09:00:00-05:00" }]);
    target = d;
  }
  if (target < current) throw rule("CLOCK_BACKWARDS", "The clock cannot move backwards. Use POST /test/reset to go back to the seed date.");
  const delta = Math.round((target.toMillis() - current.toMillis()) / 1000);
  await query("UPDATE sandboxes SET clock_offset_seconds = clock_offset_seconds + $2 WHERE id = $1", [sb, delta]);
  const dueWork = await processDueWork(sb, { force: true });
  return ok({ ...(await clockFor(sb)), dueWork });
});

export { SEED_INSTANT };
