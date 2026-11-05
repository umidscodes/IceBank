import type { Db } from "../db/pool";
import { one } from "../db/pool";
import { torontoDate } from "@/lib/dates";
import { notFound } from "../errors";
import type { Principal } from "../http/handler";

export async function now(db: Db, sandboxId: number): Promise<Date> {
  return (await one<{ now: Date }>(db, "SELECT app_now($1) AS now", [sandboxId]))!.now;
}

export async function today(db: Db, sandboxId: number): Promise<string> {
  return torontoDate(await now(db, sandboxId));
}

export type NotificationType = "MONEY_MOVEMENT" | "LOGIN" | "SECURITY" | "ACCOUNT" | "LOAN" | "DEPOSIT";

export async function notify(db: Db, sandboxId: number, userId: number, type: NotificationType, title: string, body: string) {
  await db.query(
    "INSERT INTO notifications (sandbox_id, user_id, type, title, body, created_at) VALUES ($1, $2, $3, $4, $5, app_now($1))",
    [sandboxId, userId, type, title, body],
  );
}

export async function notifyCustomer(db: Db, sandboxId: number, customerId: number, type: NotificationType, title: string, body: string) {
  const c = await one<{ user_id: number }>(db, "SELECT user_id FROM customers WHERE sandbox_id = $1 AND id = $2", [sandboxId, customerId]);
  if (c) await notify(db, sandboxId, c.user_id, type, title, body);
}

export async function audit(
  db: Db, sandboxId: number, actorUserId: number | null, action: string, entityType: string,
  entityId: number | null, oldValue: unknown, newValue: unknown,
) {
  await db.query(
    `INSERT INTO audit_log (sandbox_id, actor_user_id, action, entity_type, entity_id, old_value, new_value, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, app_now($1))`,
    [sandboxId, actorUserId, action, entityType, entityId,
      oldValue === null || oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === null || newValue === undefined ? null : JSON.stringify(newValue)],
  );
}

export async function sendMail(
  db: Db, sandboxId: number, to: string, kind: string, subject: string, body: string,
  extra: { otpCode?: string; link?: string } = {},
) {
  await db.query(
    `INSERT INTO inbox_messages (sandbox_id, to_email, kind, subject, body, otp_code, link, created_at)
     VALUES ($1, lower($2), $3, $4, $5, $6, $7, app_now($1))`,
    [sandboxId, to, kind, subject, body, extra.otpCode ?? null, extra.link ?? null],
  );
}

/** The signed-in customer's id; admins and instructors have no customer record. */
export function customerId(user: Principal | null): number {
  if (!user || user.customerId === null) throw notFound("Customer");
  return user.customerId;
}
