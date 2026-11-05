/** Debit and credit cards: lock/unlock, report lost (cancel + reissue), daily debit POS limit. */
import { z, doc, Money, Id, IdParam, DateTimeStr, registry } from "../openapi/registry";
import { route, ok } from "../http/handler";
import { query, tx, one, type Db } from "../db/pool";
import { intParam } from "../http/params";
import { conflict, notFound, rule, validation } from "../errors";
import { customerId, audit, notifyCustomer } from "../services/common";
import { createCard } from "../services/provision";
import { money, parseAmount } from "@/lib/money";
import { isoOffset } from "@/lib/dates";
import { maskLast4 } from "@/lib/accounts";

const CardSchema = registry.register("Card", z.object({
  id: Id, accountId: Id, type: z.enum(["DEBIT", "CREDIT"]),
  maskedNumber: z.string().openapi({ example: "**** **** **** 4821", description: "Always masked to the last 4 digits" }),
  last4: z.string().openapi({ example: "4821" }), expiry: z.string().openapi({ example: "07/30" }),
  status: z.enum(["ACTIVE", "LOCKED", "CANCELLED"]), dailyPosLimit: Money.nullable().openapi({ description: "Debit cards only" }),
  replacedByCardId: Id.nullable(), createdAt: DateTimeStr,
}));
const LimitBody = z.object({
  dailyPosLimit: z.union([z.string(), z.number()], { error: "is required" }).openapi({ type: "string", example: "2500.00", description: "$500 to $5,000 in $100 steps" }),
});

doc({ method: "get", path: "/cards", tag: "Cards", summary: "List my cards", auth: "bearer", responses: { 200: { schema: z.array(CardSchema), description: "Cards" } } });
doc({ method: "post", path: "/cards/{id}/lock", tag: "Cards", summary: "Lock a card (instant)", auth: "bearer", params: IdParam,
  responses: { 200: { schema: CardSchema, description: "Locked" } }, errors: { 404: "Card not found.", 409: "This card is already locked." } });
doc({ method: "post", path: "/cards/{id}/unlock", tag: "Cards", summary: "Unlock a card (instant)", auth: "bearer", params: IdParam,
  responses: { 200: { schema: CardSchema, description: "Unlocked" } }, errors: { 404: "Card not found.", 409: "This card is not locked." } });
doc({ method: "post", path: "/cards/{id}/report-lost", tag: "Cards", summary: "Report a card lost or stolen", auth: "bearer", params: IdParam,
  description: "Cancels the card and issues a new one with a new Luhn-valid number on the same account (same daily limit).",
  responses: { 200: { schema: z.object({ cancelledCard: CardSchema, newCard: CardSchema }), description: "Cancelled and replaced" } },
  errors: { 404: "Card not found.", 409: "This card is already cancelled." } });
doc({ method: "patch", path: "/cards/{id}/limits", tag: "Cards", summary: "Change the daily debit POS limit", auth: "bearer", params: IdParam, body: LimitBody,
  description: "Debit cards only (422 NOT_A_DEBIT_CARD). $500.00 to $5,000.00 in $100.00 steps.",
  responses: { 200: { schema: CardSchema, description: "Updated" } }, errors: { 404: "Card not found.", 409: "This card is cancelled.", 422: "Only debit cards have a daily POS limit." } });

function view(c: Record<string, unknown>) {
  return {
    id: Number(c.id), accountId: Number(c.account_id), type: String(c.type), maskedNumber: maskLast4(String(c.last4)), last4: String(c.last4),
    expiry: `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`, status: String(c.status),
    dailyPosLimit: c.daily_pos_limit === null ? null : money(String(c.daily_pos_limit)),
    replacedByCardId: c.replaced_by_card_id === null ? null : Number(c.replaced_by_card_id), createdAt: isoOffset(c.created_at as Date)!,
  };
}

async function owned(db: Db, sb: number, cid: number, id: number) {
  const c = await one(db, "SELECT * FROM cards WHERE sandbox_id = $1 AND id = $2 AND customer_id = $3 FOR UPDATE", [sb, id, cid]);
  if (!c) throw notFound("Card");
  return c as Record<string, unknown>;
}

export const listCards = route({ auth: "customer" }, async (ctx) => {
  const rows = await query("SELECT * FROM cards WHERE sandbox_id = $1 AND customer_id = $2 ORDER BY (status = 'CANCELLED'), id", [ctx.user!.sandboxId, customerId(ctx.user)]);
  return ok(rows.map(view));
});

function setStatus(from: string, to: string, action: string) {
  return route({ auth: "customer" }, async (ctx) => {
    const u = ctx.user!;
    const sb = u.sandboxId;
    return tx(async (db) => {
      const c = await owned(db, sb, customerId(u), intParam(ctx.params.id));
      if (c.status === "CANCELLED") throw conflict("INVALID_STATE", "This card is cancelled.");
      if (c.status !== from) throw conflict("INVALID_STATE", to === "LOCKED" ? "This card is already locked." : "This card is not locked.");
      const row = (await one(db, "UPDATE cards SET status = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2 RETURNING *", [sb, c.id, to]))!;
      await audit(db, sb, u.userId, action, "card", Number(c.id), { status: from }, { status: to });
      await notifyCustomer(db, sb, customerId(u), "SECURITY", to === "LOCKED" ? "Card locked" : "Card unlocked", `Your card ending ${c.last4} is now ${to.toLowerCase()}.`);
      return ok(view(row));
    }, { actorUserId: u.userId });
  });
}
export const lockCard = setStatus("ACTIVE", "LOCKED", "CARD_LOCKED");
export const unlockCard = setStatus("LOCKED", "ACTIVE", "CARD_UNLOCKED");

export const reportLost = route({ auth: "customer" }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cid = customerId(u);
  return tx(async (db) => {
    const c = await owned(db, sb, cid, intParam(ctx.params.id));
    if (c.status === "CANCELLED") throw conflict("INVALID_STATE", "This card is already cancelled.");
    const newId = await createCard(db, sb, cid, Number(c.account_id), c.type as "DEBIT" | "CREDIT", c.daily_pos_limit === null ? null : String(c.daily_pos_limit));
    const old = (await one(db, "UPDATE cards SET status = 'CANCELLED', cancel_reason = 'LOST', replaced_by_card_id = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2 RETURNING *",
      [sb, c.id, newId]))!;
    const fresh = (await one(db, "SELECT * FROM cards WHERE sandbox_id = $1 AND id = $2", [sb, newId]))!;
    await audit(db, sb, u.userId, "CARD_REPORTED_LOST", "card", Number(c.id), { status: c.status }, { status: "CANCELLED", replacedByCardId: newId });
    await notifyCustomer(db, sb, cid, "SECURITY", "Card cancelled and replaced", `Your card ending ${c.last4} was cancelled. Your new card ends in ${fresh.last4}.`);
    return ok({ cancelledCard: view(old), newCard: view(fresh) });
  }, { actorUserId: u.userId });
});

export const setLimits = route({ auth: "customer", body: LimitBody }, async (ctx) => {
  const u = ctx.user!;
  const sb = u.sandboxId;
  const cents = parseAmount(ctx.body.dailyPosLimit);
  if (cents === null) throw validation([{ field: "dailyPosLimit", message: "must be an amount such as 2500.00" }]);
  if (cents < 50000n || cents > 500000n) throw validation([{ field: "dailyPosLimit", message: "must be between 500.00 and 5000.00" }]);
  if (cents % 10000n !== 0n) throw validation([{ field: "dailyPosLimit", message: "must be a multiple of 100.00" }]);
  return tx(async (db) => {
    const c = await owned(db, sb, customerId(u), intParam(ctx.params.id));
    if (c.type !== "DEBIT") throw rule("NOT_A_DEBIT_CARD", "Only debit cards have a daily POS limit.");
    if (c.status === "CANCELLED") throw conflict("INVALID_STATE", "This card is cancelled.");
    const row = (await one(db, "UPDATE cards SET daily_pos_limit = $3, updated_at = app_now($1) WHERE sandbox_id = $1 AND id = $2 RETURNING *", [sb, c.id, money(cents)]))!;
    await audit(db, sb, u.userId, "CARD_LIMIT_CHANGED", "card", Number(c.id), { dailyPosLimit: money(String(c.daily_pos_limit)) }, { dailyPosLimit: money(cents) });
    return ok(view(row));
  }, { actorUserId: u.userId });
});
