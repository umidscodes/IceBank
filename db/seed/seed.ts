/**
 * Deterministic seed. Same IDs, same balances, same timestamps after every reset.
 *
 * History runs from November 2024 up to the seed instant (Monday 2 November 2026, 09:00 Toronto).
 * Reset also moves the sandbox clock back to the seed instant, so "60 days ago" always means the
 * same date.
 */
import type pg from "pg";
import { DateTime } from "luxon";
import {
  ADDRESSES, BILLERS, BRANCHES, EMPLOYERS, FIRST_NAMES, LAST_NAMES, MERCHANTS, PERSONAS,
  SEED_PASSWORD_HASH, TINY_PNG,
} from "./data";
import { ZONE, SEED_INSTANT, onOrNextBusinessDay, recurrenceDate } from "../../src/lib/dates";
import { prng, sha256, encryptCardNumber } from "../../src/lib/crypto";
import { withLuhnDigit } from "../../src/lib/validation";
import { accountNumberFor } from "../../src/lib/accounts";
import { formatCents, mulRate } from "../../src/lib/money";
import { amortizationSchedule, monthlyPayment, dtiBasisPoints, LOAN_APR } from "../../src/lib/loans";

export interface SeedOptions {
  sandboxId: number;
  sandboxName: string;
  sandboxKey: string;
  /** Added before the @ of every seeded email, e.g. "+s1" on the hosted QA site. */
  emailSuffix?: string;
}

type AccountType = "CHEQUING" | "SAVINGS" | "CREDIT" | "LOAN";
interface Acct {
  id: number; customerId: number; type: AccountType; number: string; nickname: string | null;
  balance: bigint; held: bigint; creditLimit: bigint | null; rate: string | null; status: string;
  openedAt: DateTime; frozenAt?: DateTime;
}
interface Cust {
  id: number; userId: number; first: string; last: string; email: string; dob: string;
  addressIndex: number; createdAt: DateTime; accounts: Acct[]; salary: bigint; employer: string;
  payeeIds: number[];
}
interface Leg { acct: Acct; dir: "DEBIT" | "CREDIT"; amount: bigint | (() => bigint); type: string; desc: string }
interface Ev {
  at: DateTime; seq: number; legs: Leg[]; ref: string;
  after?: (txIds: number[], amounts: bigint[]) => void;
  dependsOn?: Ev; ok?: boolean;
}

const HISTORY_START = DateTime.fromISO("2024-11-04T00:00:00", { zone: ZONE });
const SEED_DATE = SEED_INSTANT.toISODate()!;
const iso = (d: DateTime) => d.toUTC().toISO()!;

export interface SeedSummary { customers: number; accounts: number; transactions: number }

export async function seedSandbox(db: pg.ClientBase, opts: SeedOptions): Promise<SeedSummary> {
  const sb = opts.sandboxId;
  const suffix = opts.emailSuffix ?? "";
  const rnd = prng(20261102);
  const mail = (local: string) => `${local}${suffix}@icebank.test`;
  const T: Record<string, unknown[][]> = {};
  const push = (table: string, row: unknown[]) => (T[table] ??= []).push(row);

  // ---- sandbox row and clock ------------------------------------------------------------------
  const offset = Math.round((SEED_INSTANT.toMillis() - Date.now()) / 1000);
  await db.query(
    `INSERT INTO sandboxes (id, name, key_hash, clock_offset_seconds, processed_through)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, key_hash = EXCLUDED.key_hash,
       clock_offset_seconds = EXCLUDED.clock_offset_seconds, processed_through = EXCLUDED.processed_through`,
    [sb, opts.sandboxName, sha256(opts.sandboxKey), offset, "2026-11-01"],
  );
  await db.query("SELECT set_config('icebank.skip_audit', 'on', true)");

  // ---- billers --------------------------------------------------------------------------------
  for (const b of BILLERS) push("billers", [sb, b.id, b.name, b.category, b.pattern, b.hint]);

  // ---- customers and accounts -----------------------------------------------------------------
  let nextAccountId = 1;
  const mkAcct = (c: Cust, type: AccountType, openedAt: DateTime, extra: Partial<Acct> = {}): Acct => {
    const a: Acct = {
      id: nextAccountId++, customerId: c.id, type, number: "", nickname: null, balance: 0n, held: 0n,
      creditLimit: type === "CREDIT" ? 500000n : null,
      rate: type === "SAVINGS" ? "0.0225" : type === "CREDIT" ? "0.2099" : type === "LOAN" ? LOAN_APR : null,
      status: "OPEN", openedAt, ...extra,
    };
    a.number = accountNumberFor(a.id);
    c.accounts.push(a);
    return a;
  };

  const customers: Cust[] = [];
  const personaByKey: Record<string, Cust> = {};
  const allDefs = [
    ...PERSONAS.map((p) => ({ ...p })),
    ...FIRST_NAMES.map((f, i) => ({
      key: `c${i + 7}`, firstName: f, lastName: LAST_NAMES[i],
      dob: `${1955 + ((i * 7) % 48)}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + ((i * 3) % 28)).padStart(2, "0")}`,
      addressIndex: i % ADDRESSES.length, scenario: "",
    })),
  ];
  allDefs.forEach((d, i) => {
    const id = i + 1;
    const createdAt = d.key === "noah"
      ? SEED_INSTANT.minus({ minutes: 30 })
      : HISTORY_START.plus({ days: rnd.int(0, 25), hours: 10 });
    const c: Cust = {
      id, userId: id, first: d.firstName, last: d.lastName,
      email: mail(`${d.firstName}.${d.lastName}`.toLowerCase()), dob: d.dob, addressIndex: d.addressIndex,
      createdAt, accounts: [], salary: BigInt(rnd.int(1100, 2600)) * 100n + BigInt(rnd.int(0, 99)),
      employer: rnd.pick(EMPLOYERS), payeeIds: [],
    };
    customers.push(c);
    personaByKey[d.key] = c;
  });
  const P = personaByKey;
  P.emma.salary = 285000n;

  for (const c of customers) {
    const k = PERSONAS.find((p) => p.firstName === c.first && p.lastName === c.last)?.key;
    const at = c.createdAt;
    if (k === "emma") {
      mkAcct(c, "CHEQUING", at); mkAcct(c, "SAVINGS", at, { nickname: "Rainy day" });
      mkAcct(c, "CREDIT", at); mkAcct(c, "LOAN", DateTime.fromISO("2025-05-01T10:00:00", { zone: ZONE }));
    } else if (k === "liam") { mkAcct(c, "CHEQUING", at); mkAcct(c, "SAVINGS", at); }
    else if (k === "olivia") { mkAcct(c, "CHEQUING", at); mkAcct(c, "CREDIT", at); }
    else if (k === "noah") { mkAcct(c, "CHEQUING", at); }
    else if (k === "ava") {
      mkAcct(c, "CHEQUING", at, { frozenAt: DateTime.fromISO("2026-10-20T14:05:00", { zone: ZONE }) });
      mkAcct(c, "SAVINGS", at);
    } else if (k === "lucas") { mkAcct(c, "CHEQUING", at); mkAcct(c, "SAVINGS", at, { nickname: "House fund" }); }
    else {
      mkAcct(c, "CHEQUING", at);
      if (rnd.chance(0.6)) mkAcct(c, "SAVINGS", at);
      if (rnd.chance(0.5)) mkAcct(c, "CREDIT", at);
    }
  }
  const acc = (c: Cust, t: AccountType) => c.accounts.find((a) => a.type === t);

  // ---- payees and contacts --------------------------------------------------------------------
  let payeeId = 1;
  const payeeRows: { id: number; customer: Cust; billerId: number; nickname: string | null }[] = [];
  const addPayee = (c: Cust, billerId: number, number: string, nickname: string | null = null) => {
    const id = payeeId++;
    push("payees", [sb, id, c.id, billerId, nickname, number, iso(c.createdAt.plus({ days: 2 })), null]);
    payeeRows.push({ id, customer: c, billerId, nickname });
    c.payeeIds.push(id);
    return id;
  };
  const sampleAccountNumber = (billerId: number, n: number): string => {
    const d = (len: number) => String((n * 7907 + billerId * 131) % 10 ** len).padStart(len, "0");
    switch (billerId) {
      case 1: case 12: return d(10);
      case 2: return "IT" + d(8);
      case 3: { const s = d(12); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; }
      case 4: return "W" + d(7);
      case 5: { const s = d(11); return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`; }
      case 6: return "GI-" + d(6);
      case 7: return d(12);
      case 8: return d(9);
      case 9: return "PA" + d(7);
      case 10: return d(8);
      default: return "SS" + d(6);
    }
  };
  addPayee(P.emma, 1, "4410028731", "Hydro");
  addPayee(P.emma, 2, "IT20456789", "Phone");
  addPayee(P.emma, 4, "W1048576", null);
  for (const c of customers) {
    if (c.id <= 6 && c !== P.lucas && c !== P.liam) continue;
    const n = 1 + (c.id % 3);
    for (let i = 0; i < n; i++) {
      const billerId = 1 + ((c.id + i * 5) % BILLERS.length);
      if (c.payeeIds.some((pid) => payeeRows[pid - 1].billerId === billerId)) continue;
      addPayee(c, billerId, sampleAccountNumber(billerId, c.id * 10 + i));
    }
  }

  let contactId = 1;
  const addContact = (c: Cust, name: string, email: string) =>
    push("etransfer_contacts", [sb, contactId++, c.id, name, email, iso(c.createdAt.plus({ days: 5 }))]);
  addContact(P.emma, "Liam Chen", P.liam.email);
  addContact(P.emma, "Olivia Singh", P.olivia.email);
  addContact(P.emma, "Sophie Bouchard", customers[6].email);
  addContact(P.emma, "Marc Dupont", "marc.dupont@example.com");
  addContact(P.olivia, "Emma Tremblay", P.emma.email);
  for (const c of customers.slice(6)) {
    if (c.id % 4 === 0) addContact(c, `${customers[(c.id + 3) % 50].first} ${customers[(c.id + 3) % 50].last}`, customers[(c.id + 3) % 50].email);
  }

  // ---- history events -------------------------------------------------------------------------
  const events: Ev[] = [];
  let seq = 0;
  let refSeq = 0;
  const ref = (prefix: string) => `${prefix}-S${String(++refSeq).padStart(7, "0")}`;
  const ev = (at: DateTime, legs: Leg[], prefix: string, after?: Ev["after"], dependsOn?: Ev): Ev => {
    const e: Ev = { at, seq: seq++, legs, ref: ref(prefix), after, dependsOn };
    events.push(e);
    return e;
  };
  const randCents = (min: number, max: number) => BigInt(rnd.int(min * 100, max * 100));
  const at = (d: DateTime, hMin = 8, hMax = 20) => d.set({ hour: rnd.int(hMin, hMax), minute: rnd.int(0, 59), second: rnd.int(0, 59) });
  const endOf = (a: Acct) => a.frozenAt ?? SEED_INSTANT;
  let transferId = 1;
  let billPaymentId = 1;
  let etransferId = 1;
  const historyCustomers = customers.filter((c) => c !== P.noah);

  for (const c of historyCustomers) {
    const chq = acc(c, "CHEQUING")!;
    const sav = acc(c, "SAVINGS");
    const cc = acc(c, "CREDIT");
    const start = c.createdAt;
    const stop = endOf(chq);

    ev(start.plus({ minutes: 5 }), [{ acct: chq, dir: "CREDIT", amount: randCents(500, 3000), type: "ADJUSTMENT", desc: "Opening deposit" }], "OPN");
    if (sav) ev(start.plus({ minutes: 6 }), [{ acct: sav, dir: "CREDIT", amount: randCents(1000, 8000), type: "ADJUSTMENT", desc: "Opening deposit" }], "OPN");

    // Payroll every second Friday
    let pay = start.plus({ days: ((5 - start.weekday + 7) % 7) || 7 }).set({ hour: 6, minute: 0, second: 0 });
    while (pay < stop) {
      ev(pay, [{ acct: chq, dir: "CREDIT", amount: c.salary, type: "PAYROLL", desc: `Payroll deposit - ${c.employer}` }], "PAY");
      pay = pay.plus({ days: 14 });
    }

    // Weekly purchases, occasional ATM
    for (let w = start.plus({ days: 1 }); w < stop; w = w.plus({ days: 7 })) {
      const n = rnd.int(1, 3);
      for (let i = 0; i < n; i++) {
        const d = at(w.plus({ days: rnd.int(0, 6) }));
        if (d >= stop) continue;
        const m = rnd.pick(MERCHANTS);
        const amt = randCents(m.min, m.max);
        if (cc && c !== P.olivia && rnd.chance(0.55)) {
          ev(d, [{ acct: cc, dir: "DEBIT", amount: amt, type: "PURCHASE", desc: m.name }], "POS");
        } else {
          ev(d, [{ acct: chq, dir: "DEBIT", amount: amt, type: "PURCHASE", desc: `POS purchase - ${m.name}` }], "POS");
        }
      }
      if (rnd.chance(0.2)) {
        const d = at(w.plus({ days: rnd.int(0, 6) }));
        if (d < stop) ev(d, [{ acct: chq, dir: "DEBIT", amount: BigInt(rnd.int(1, 10) * 2000), type: "ATM", desc: `ATM withdrawal - ${rnd.pick(BRANCHES).name}` }], "ATM");
      }
    }

    // Monthly: rent or mortgage, bill payments, savings transfer, card payment, savings interest
    const housing = (c.salary * 2n * BigInt(rnd.int(38, 48))) / 100n;
    const landlord = rnd.pick(["Maple Ridge Properties (rent)", "Iceport Mortgage Corp (mortgage)", "Harbourview Rentals (rent)"]);
    for (let m = start.startOf("month").plus({ months: 1 }); m < stop; m = m.plus({ months: 1 })) {
      const rentAt = DateTime.fromISO(onOrNextBusinessDay(m.toISODate()!), { zone: ZONE }).set({ hour: 5, minute: 45 });
      if (rentAt < stop) ev(rentAt, [{ acct: chq, dir: "DEBIT", amount: housing, type: "PREAUTHORIZED_DEBIT", desc: `Pre-authorized debit - ${landlord}` }], "PAD");
      for (const pid of c.payeeIds) {
        const p = payeeRows[pid - 1];
        const biller = BILLERS[p.billerId - 1];
        const day = 5 + ((pid * 3) % 20);
        const requested = m.set({ day });
        const posting = DateTime.fromISO(onOrNextBusinessDay(requested.toISODate()!), { zone: ZONE }).set({ hour: 7, minute: 30 });
        if (posting >= stop) continue;
        const amount = randCents(40, 180);
        const r = ev(posting, [{ acct: chq, dir: "DEBIT", amount, type: "BILL_PAYMENT", desc: `Bill payment - ${biller.name}` }], "BIL",
          (txIds) => {
            push("bill_payments", [sb, billPaymentId++, c.id, pid, chq.id, formatCents(amount), requested.toISODate(), posting.toISODate(),
              "NONE", null, 1, null, "POSTED", null, txIds[0], r.ref, iso(requested.minus({ days: 3 }).set({ hour: 19 })), iso(posting), null]);
          });
      }
      if (sav) {
        const d = at(m.set({ day: 3 }), 9, 12);
        if (d < stop) {
          // Sweep part of anything above $2,500 into savings, in whole dollars.
          let amount = 0n;
          const sweep = () => (amount = chq.balance > 250000n ? ((chq.balance - 250000n) * 6n / 10n / 100n) * 100n : 0n);
          const r = ev(d, [
            { acct: chq, dir: "DEBIT", amount: sweep, type: "TRANSFER", desc: `Transfer to Savings ${sav.number.slice(-4)}` },
            { acct: sav, dir: "CREDIT", amount: () => amount, type: "TRANSFER", desc: `Transfer from Chequing ${chq.number.slice(-4)}` },
          ], "TRF", () => push("transfers", [sb, transferId++, c.id, chq.id, sav.id, formatCents(amount), "Monthly savings", "COMPLETED", r.ref, iso(d)]));
        }
        const interestAt = m.set({ hour: 0, minute: 5 });
        if (interestAt < stop) {
          ev(interestAt, [{ acct: sav, dir: "CREDIT", amount: () => mulRate(sav.balance, "0.0225", 12n), type: "INTEREST", desc: "Interest paid" }], "INT");
        }
      }
      if (cc && c !== P.olivia) {
        const d = at(m.set({ day: 22 }), 9, 18);
        if (d < stop) {
          let paid = 0n;
          const r = ev(d, [
            { acct: chq, dir: "DEBIT", amount: () => (paid = -cc.balance), type: "CARD_PAYMENT", desc: `Transfer to Credit ${cc.number.slice(-4)}` },
            { acct: cc, dir: "CREDIT", amount: () => paid, type: "CARD_PAYMENT", desc: `Transfer from Chequing ${chq.number.slice(-4)}` },
          ], "TRF", () => push("transfers", [sb, transferId++, c.id, chq.id, cc.id, formatCents(paid), "Card payment", "COMPLETED", r.ref, iso(d)]));
        }
      }
    }

    // Occasional e-transfers to another customer
    if (c.id > 6 && c.id % 3 === 0) {
      for (let m = start.plus({ months: 2 }); m < stop; m = m.plus({ months: rnd.int(2, 4) })) {
        const to = customers[6 + ((c.id * 7 + m.month) % 44)];
        if (to === c) continue;
        const toChq = acc(to, "CHEQUING")!;
        const d = at(m.set({ day: Math.min(28, rnd.int(1, 28)) }));
        if (d >= stop || d < to.createdAt) continue;
        const amount = randCents(20, 300);
        const id = etransferId++;
        const send = ev(d, [{ acct: chq, dir: "DEBIT", amount, type: "ETRANSFER", desc: `Interac e-Transfer to ${to.first} ${to.last}` }], "ETR");
        const depAt = d.plus({ hours: 3 });
        ev(depAt, [{ acct: toChq, dir: "CREDIT", amount, type: "ETRANSFER", desc: `Interac e-Transfer from ${c.first} ${c.last}` }], "ETD",
          () => push("etransfers", [sb, id, c.id, chq.id, `${to.first} ${to.last}`, to.email, to.id, toChq.id, formatCents(amount),
            "Thanks!", "What do we call the cat?", sha256("whiskers"), false, "DEPOSITED", send.ref, iso(d), iso(d.plus({ days: 30 })), iso(depAt), null, null]),
          send);
      }
    }
  }

  // Emma's loan: approved application, disbursement, monthly payments
  const emmaChq = acc(P.emma, "CHEQUING")!;
  const emmaLoan = acc(P.emma, "LOAN")!;
  const loanStart = DateTime.fromISO("2025-05-01T10:00:00", { zone: ZONE });
  const principal = 1200000n;
  const schedule = amortizationSchedule(principal, 36, "2025-06-01");
  ev(loanStart.plus({ minutes: 1 }), [
    { acct: emmaLoan, dir: "DEBIT", amount: principal, type: "LOAN_DISBURSEMENT", desc: "Loan disbursement" },
    { acct: emmaChq, dir: "CREDIT", amount: principal, type: "LOAN_DISBURSEMENT", desc: "Personal loan disbursement" },
  ], "LON");
  for (const row of schedule) {
    const d = DateTime.fromISO(row.dueDate, { zone: ZONE }).set({ hour: 6, minute: 15 });
    if (d >= SEED_INSTANT) break;
    ev(d, [
      { acct: emmaChq, dir: "DEBIT", amount: row.payment, type: "LOAN_PAYMENT", desc: `Loan payment ${row.installmentNo} of 36` },
      { acct: emmaLoan, dir: "CREDIT", amount: row.principal, type: "LOAN_PAYMENT", desc: `Loan payment ${row.installmentNo} of 36 (principal)` },
    ], "LNP");
  }

  // Olivia's credit card: $4,960.00 owing on a $5,000.00 limit
  const olCc = acc(P.olivia, "CREDIT")!;
  const olPurchases: [string, string, bigint][] = [
    ["2026-05-14T15:20:00", "Summit Sports", 128950n], ["2026-06-22T11:05:00", "Caribou Clothing", 64320n],
    ["2026-07-30T19:40:00", "Glacier Hardware", 97815n], ["2026-08-18T13:10:00", "Aurora Cinemas", 21480n],
    ["2026-09-09T17:55:00", "Harbour Fish Market", 45635n], ["2026-10-03T12:30:00", "Iceport Grocers", 88200n],
    ["2026-10-28T20:15:00", "Tundra Eats", 49600n],
  ];
  for (const [t, m, a] of olPurchases) {
    ev(DateTime.fromISO(t, { zone: ZONE }), [{ acct: olCc, dir: "DEBIT", amount: a, type: "PURCHASE", desc: m }], "POS");
  }

  // Pending e-transfers: Emma -> Marc (external), Olivia -> Emma (waiting to be accepted)
  const pendingEt = (from: Cust, toName: string, toEmail: string, toCustomer: Cust | null, amount: bigint, t: string, msg: string, q: string, answer: string) => {
    const d = DateTime.fromISO(t, { zone: ZONE });
    const id = etransferId++;
    const fromChq = acc(from, "CHEQUING")!;
    const e = ev(d, [{ acct: fromChq, dir: "DEBIT", amount, type: "ETRANSFER", desc: `Interac e-Transfer to ${toName}` }], "ETR",
      () => push("etransfers", [sb, id, from.id, fromChq.id, toName, toEmail, toCustomer?.id ?? null, null, formatCents(amount), msg, q,
        sha256(answer.toLowerCase()), false, "PENDING", e.ref, iso(d), iso(d.plus({ days: 30 })), null, null, null]));
    return { id, d };
  };
  pendingEt(P.emma, "Marc Dupont", "marc.dupont@example.com", null, 7500n, "2026-10-30T10:15:00", "Ski trip share", "What city did we meet in?", "halifax");
  const olToEmma = pendingEt(P.olivia, "Emma Tremblay", P.emma.email, P.emma, 12000n, "2026-11-01T18:20:00", "Concert tickets", "Favourite band?", "glacier");

  // Lucas: cheque deposit of $850.00 waiting for approval ($100 available immediately)
  const lucasChq = acc(P.lucas, "CHEQUING")!;
  const chequeAt = DateTime.fromISO("2026-10-31T11:42:00", { zone: ZONE });
  const cheque = ev(chequeAt, [{ acct: lucasChq, dir: "CREDIT", amount: 85000n, type: "CHEQUE_DEPOSIT", desc: "Mobile cheque deposit" }], "CHQ",
    (txIds) => {
      lucasChq.held += 75000n;
      push("cheque_deposits", [sb, 1, P.lucas.id, lucasChq.id, "850.00", "100.00", "750.00", TINY_PNG, "image/png", TINY_PNG, "image/png",
        "PENDING", null, txIds[0], null, null, cheque.ref, iso(chequeAt)]);
    });

  // ---- run the ledger -------------------------------------------------------------------------
  events.sort((a, b) => a.at.toMillis() - b.at.toMillis() || a.seq - b.seq);
  let txId = 1;
  const txRows: unknown[][] = [];
  for (const e of events) {
    if (e.dependsOn && !e.dependsOn.ok) continue;
    const amounts = e.legs.map((l) => (typeof l.amount === "function" ? l.amount() : l.amount));
    if (amounts.some((a) => a <= 0n)) { e.ok = false; continue; }
    const fits = e.legs.every((l, i) => {
      if (l.dir === "CREDIT") return true;
      const after = l.acct.balance - l.acct.held - amounts[i];
      if (l.acct.type === "CREDIT") return after >= -(l.acct.creditLimit ?? 0n);
      if (l.acct.type === "LOAN") return true;
      return after >= 0n;
    });
    if (!fits) { e.ok = false; continue; }
    const ids: number[] = [];
    e.legs.forEach((l, i) => {
      l.acct.balance += l.dir === "CREDIT" ? amounts[i] : -amounts[i];
      const id = txId++;
      ids.push(id);
      txRows.push([sb, id, l.acct.id, l.dir, formatCents(amounts[i]), formatCents(l.acct.balance), "POSTED", l.type, l.desc, e.ref, iso(e.at), iso(e.at)]);
    });
    e.ok = true;
    e.after?.(ids, amounts);
  }
  T.transactions = txRows;

  // ---- users, customers, accounts rows --------------------------------------------------------
  for (const c of customers) {
    const addr = ADDRESSES[c.addressIndex];
    const isLiam = c === P.liam;
    push("users", [sb, c.userId, c.email, SEED_PASSWORD_HASH, "CUSTOMER", isLiam ? "LOCKED" : "ACTIVE", isLiam ? 5 : 0, null, false,
      c === P.noah ? null : iso(SEED_INSTANT.minus({ days: (c.id % 9) + 1, hours: 3 })), iso(c.createdAt), iso(c.createdAt)]);
    push("password_history", [sb, c.userId, c.userId, SEED_PASSWORD_HASH, iso(c.createdAt)]);
    const sin = withLuhnDigit("1" + String(c.id * 9973 % 10000000).padStart(7, "0"));
    push("customers", [sb, c.id, c.userId, c.first, c.last, c.dob, `(416) 555-${String(1000 + c.id).slice(-4)}`,
      `${100 + c.id * 7} ${addr.street}`, c.id % 5 === 0 ? `Unit ${c.id}` : null, addr.city, addr.province, addr.postal,
      sha256(sin), sin.slice(-3), iso(c.createdAt), iso(c.createdAt)]);
    for (const a of c.accounts) {
      const accrued = a.type === "SAVINGS" ? (Number(a.balance) / 100 * 0.0225 / 365).toFixed(6) : "0";
      push("accounts", [sb, a.id, c.id, a.number, a.type, a.nickname, formatCents(a.balance), formatCents(a.balance - a.held),
        a.creditLimit === null ? null : formatCents(a.creditLimit), a.rate, accrued, a.frozenAt ? "FROZEN" : "OPEN", iso(a.openedAt), null]);
    }
  }
  // Teller (admin)
  const tellerId = 51;
  push("users", [sb, tellerId, mail("teller"), SEED_PASSWORD_HASH, "ADMIN", "ACTIVE", 0, null, false, null,
    iso(HISTORY_START.minus({ days: 30 })), iso(HISTORY_START.minus({ days: 30 }))]);
  push("password_history", [sb, tellerId, tellerId, SEED_PASSWORD_HASH, iso(HISTORY_START.minus({ days: 30 }))]);

  // ---- Emma's loan records --------------------------------------------------------------------
  const emmaPayment = monthlyPayment(principal, 36);
  push("loan_applications", [sb, 1, P.emma.id, "12000.00", 36, "Car purchase", "92000.00", "450.00", LOAN_APR, formatCents(emmaPayment),
    formatCents(dtiBasisPoints(45000n, emmaPayment, 9200000n)), emmaChq.id, "APPROVED", "AUTOMATIC", "Debt-to-income under 35%", null,
    iso(loanStart), 1, iso(loanStart)]);
  push("loans", [sb, 1, P.emma.id, 1, emmaLoan.id, "12000.00", LOAN_APR, 36, formatCents(emmaPayment),
    formatCents(schedule.reduce((s, r) => s + r.interest, 0n)), "2025-06-01", "ACTIVE", iso(loanStart)]);
  for (const r of schedule) {
    const paid = r.dueDate < SEED_DATE;
    push("loan_schedule", [sb, 1, r.installmentNo, r.dueDate, formatCents(r.payment), formatCents(r.principal), formatCents(r.interest), formatCents(r.remainingBalance),
      paid ? "PAID" : "DUE", paid ? iso(DateTime.fromISO(r.dueDate, { zone: ZONE }).set({ hour: 6, minute: 15 })) : null]);
  }
  // Lucas: application in manual review
  const lucasPay = monthlyPayment(1500000n, 48);
  const lucasDti = dtiBasisPoints(150000n, lucasPay, 6200000n);
  push("loan_applications", [sb, 2, P.lucas.id, "15000.00", 48, "Home renovation", "62000.00", "1500.00", LOAN_APR, formatCents(lucasPay),
    formatCents(lucasDti), lucasChq.id, "MANUAL_REVIEW", "AUTOMATIC", "Debt-to-income between 35% and 45%", null, null, null,
    iso(DateTime.fromISO("2026-10-29T16:45:00", { zone: ZONE }))]);

  // ---- scheduled bill payments (Emma: IceTel on the 15th, monthly) ------------------------------
  const series = "SER-S0000001";
  for (let n = 0; n < 12; n++) {
    const requested = recurrenceDate("2026-11-15", "MONTHLY", n);
    push("bill_payments", [sb, billPaymentId++, P.emma.id, 2, emmaChq.id, "65.40", requested, onOrNextBusinessDay(requested), "MONTHLY", series,
      n + 1, null, "SCHEDULED", null, null, `BIL-SCHED-${String(n + 1).padStart(3, "0")}`, iso(SEED_INSTANT.minus({ days: 4 })), null, null]);
  }

  // ---- cards ----------------------------------------------------------------------------------
  let cardId = 1;
  for (const c of customers) {
    for (const a of c.accounts) {
      if (a.type !== "CHEQUING" && a.type !== "CREDIT") continue;
      const id = cardId++;
      const number = withLuhnDigit((a.type === "CHEQUING" ? "602199" : "452099") + String(id * 104729).padStart(9, "0"));
      const status = c === P.liam && a.type === "CHEQUING" ? "LOCKED" : "ACTIVE";
      push("cards", [sb, id, c.id, a.id, a.type === "CHEQUING" ? "DEBIT" : "CREDIT", encryptCardNumber(number), number.slice(-4),
        1 + (id % 12), 2028 + (id % 4), status, a.type === "CHEQUING" ? (c === P.emma ? "2000.00" : "1000.00") : null, null, null,
        iso(a.openedAt), iso(a.openedAt)]);
    }
  }

  // ---- disputes -------------------------------------------------------------------------------
  const jacob = customers[7];
  const jacobPurchases = txRows.filter((r) => r[2] === acc(jacob, "CHEQUING")!.id && r[7] === "PURCHASE");
  if (jacobPurchases.length > 0) {
    const t = jacobPurchases[jacobPurchases.length - 1];
    push("disputes", [sb, 1, jacob.id, t[1], "INCORRECT_AMOUNT", "Charged twice the menu price.", "OPEN", iso(SEED_INSTANT.minus({ days: 2 })), null]);
  }

  // ---- notifications and Ice Mail --------------------------------------------------------------
  let notifId = 1;
  const note = (c: Cust, type: string, title: string, body: string, t: DateTime, read = true) =>
    push("notifications", [sb, notifId++, c.userId, type, title, body, iso(t), read ? iso(t.plus({ hours: 1 })) : null]);
  note(P.emma, "MONEY_MOVEMENT", "Interac e-Transfer received", "Olivia Singh sent you $120.00. Accept it to deposit the money.", olToEmma.d, false);
  note(P.emma, "MONEY_MOVEMENT", "Interac e-Transfer sent", "You sent $75.00 to Marc Dupont.", DateTime.fromISO("2026-10-30T10:15:30", { zone: ZONE }));
  note(P.emma, "SECURITY", "New sign-in", "You signed in to Online Banking.", SEED_INSTANT.minus({ days: 2 }));
  note(P.ava, "ACCOUNT", "Account frozen", "Your chequing account has been frozen. Please contact Ice Bank.", acc(P.ava, "CHEQUING")!.frozenAt!, false);
  note(P.lucas, "DEPOSIT", "Cheque received", "We received your $850.00 cheque. $100.00 is available now; the rest is on hold until it is reviewed.", chequeAt);
  note(P.lucas, "LOAN", "Loan application received", "Your application for $15,000.00 needs a manual review. We will let you know.", DateTime.fromISO("2026-10-29T16:46:00", { zone: ZONE }), false);
  note(P.liam, "SECURITY", "Account locked", "Your sign-in was locked after 5 failed attempts. Please contact Ice Bank.", SEED_INSTANT.minus({ days: 1, hours: 2 }), false);

  let mailId = 1;
  const inbox = (to: string, kind: string, subject: string, body: string, t: DateTime, link: string | null = null) =>
    push("inbox_messages", [sb, mailId++, to, "Ice Bank", kind, subject, body, null, link, iso(t), null]);
  for (const c of [P.emma, P.liam, P.olivia, P.noah, P.ava, P.lucas]) {
    inbox(c.email, "WELCOME", "Welcome to Ice Bank", `Hi ${c.first}, welcome to Ice Bank! Your chequing account is ready.`, c.createdAt.plus({ minutes: 1 }));
  }
  inbox(P.emma.email, "ETRANSFER", "INTERAC e-Transfer: Olivia Singh sent you money",
    `Olivia Singh sent you $120.00 (CAD).\nMessage: Concert tickets\nSign in to Ice Bank to deposit it. Security question: Favourite band?`,
    olToEmma.d, `/etransfer/received`);

  // ---- audit log (admin actions) ---------------------------------------------------------------
  let auditId = 1;
  const audit = (actor: number | null, action: string, type: string, id: number, oldV: unknown, newV: unknown, t: DateTime) =>
    push("audit_log", [sb, auditId++, actor, action, type, id, oldV === null ? null : JSON.stringify(oldV), newV === null ? null : JSON.stringify(newV), iso(t)]);
  audit(tellerId, "ACCOUNT_FROZEN", "account", acc(P.ava, "CHEQUING")!.id, { status: "OPEN" }, { status: "FROZEN", reason: "Suspicious activity review" }, acc(P.ava, "CHEQUING")!.frozenAt!);
  audit(null, "USER_LOCKED", "user", P.liam.userId, { status: "ACTIVE", failedLoginCount: 4 }, { status: "LOCKED", failedLoginCount: 5 }, SEED_INSTANT.minus({ days: 1, hours: 2 }));
  audit(P.lucas.userId, "LOAN_APPLICATION_SUBMITTED", "loan_application", 2, null, { status: "MANUAL_REVIEW", dtiPercent: formatCents(lucasDti) }, DateTime.fromISO("2026-10-29T16:45:00", { zone: ZONE }));
  audit(P.lucas.userId, "CHEQUE_DEPOSIT_SUBMITTED", "cheque_deposit", 1, null, { amount: "850.00", status: "PENDING" }, chequeAt);

  // ---- insert ---------------------------------------------------------------------------------
  const COLS: Record<string, string[]> = {
    billers: ["sandbox_id", "id", "name", "category", "account_number_pattern", "account_number_hint"],
    users: ["sandbox_id", "id", "email", "password_hash", "role", "status", "failed_login_count", "locked_until", "classic_view", "last_login_at", "created_at", "updated_at"],
    password_history: ["sandbox_id", "id", "user_id", "password_hash", "created_at"],
    customers: ["sandbox_id", "id", "user_id", "first_name", "last_name", "date_of_birth", "phone", "address_line1", "address_line2", "city", "province", "postal_code", "sin_hash", "sin_last3", "created_at", "updated_at"],
    accounts: ["sandbox_id", "id", "customer_id", "account_number", "type", "nickname", "balance", "available_balance", "credit_limit", "interest_rate", "accrued_interest", "status", "opened_at", "closed_at"],
    transactions: ["sandbox_id", "id", "account_id", "direction", "amount", "balance_after", "status", "type", "description", "reference_id", "created_at", "posted_at"],
    transfers: ["sandbox_id", "id", "customer_id", "from_account_id", "to_account_id", "amount", "memo", "status", "reference_id", "created_at"],
    etransfers: ["sandbox_id", "id", "sender_customer_id", "from_account_id", "recipient_name", "recipient_email", "recipient_customer_id", "deposit_account_id", "amount", "message", "security_question", "security_answer_hash", "autodeposit", "status", "reference_id", "created_at", "expires_at", "deposited_at", "cancelled_at", "expired_at"],
    etransfer_contacts: ["sandbox_id", "id", "customer_id", "name", "email", "created_at"],
    payees: ["sandbox_id", "id", "customer_id", "biller_id", "nickname", "account_number", "created_at", "deleted_at"],
    bill_payments: ["sandbox_id", "id", "customer_id", "payee_id", "from_account_id", "amount", "requested_date", "posting_date", "recurrence", "series_id", "occurrence", "end_date", "status", "failure_reason", "transaction_id", "reference_id", "created_at", "posted_at", "cancelled_at"],
    cheque_deposits: ["sandbox_id", "id", "customer_id", "account_id", "amount", "immediate_amount", "held_amount", "front_image", "front_mime", "back_image", "back_mime", "status", "reject_reason", "transaction_id", "decided_by", "decided_at", "reference_id", "created_at"],
    cards: ["sandbox_id", "id", "customer_id", "account_id", "type", "number_encrypted", "last4", "expiry_month", "expiry_year", "status", "daily_pos_limit", "replaced_by_card_id", "cancel_reason", "created_at", "updated_at"],
    loan_applications: ["sandbox_id", "id", "customer_id", "amount", "term_months", "purpose", "annual_income", "monthly_debt_payments", "apr", "monthly_payment", "dti_percent", "disbursement_account_id", "status", "decision_source", "decision_reason", "decided_by", "decided_at", "loan_id", "created_at"],
    loans: ["sandbox_id", "id", "customer_id", "application_id", "account_id", "principal", "apr", "term_months", "monthly_payment", "total_interest", "first_payment_date", "status", "created_at"],
    loan_schedule: ["sandbox_id", "loan_id", "installment_no", "due_date", "payment", "principal", "interest", "remaining_balance", "status", "paid_at"],
    disputes: ["sandbox_id", "id", "customer_id", "transaction_id", "reason", "description", "status", "created_at", "resolved_at"],
    notifications: ["sandbox_id", "id", "user_id", "type", "title", "body", "created_at", "read_at"],
    inbox_messages: ["sandbox_id", "id", "to_email", "from_name", "kind", "subject", "body", "otp_code", "link", "created_at", "read_at"],
    audit_log: ["sandbox_id", "id", "actor_user_id", "action", "entity_type", "entity_id", "old_value", "new_value", "created_at"],
  };
  const ORDER = ["billers", "users", "password_history", "customers", "accounts", "transactions", "transfers", "etransfers",
    "etransfer_contacts", "payees", "bill_payments", "cheque_deposits", "cards", "loan_applications", "loans", "loan_schedule",
    "disputes", "notifications", "inbox_messages", "audit_log"];
  // loan_applications.loan_id references loans only logically; insert loans after applications.
  for (const table of ORDER) {
    const rows = T[table];
    if (rows?.length) await bulkInsert(db, table, COLS[table], rows);
  }
  await db.query("SELECT set_config('icebank.skip_audit', '', true)");

  return {
    customers: customers.length,
    accounts: customers.reduce((n, c) => n + c.accounts.length, 0),
    transactions: txRows.length,
  };
}

export async function bulkInsert(db: pg.ClientBase, table: string, cols: string[], rows: unknown[][]) {
  const perBatch = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < rows.length; i += perBatch) {
    const chunk = rows.slice(i, i + perBatch);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      if (r.length !== cols.length) throw new Error(`${table}: expected ${cols.length} values, got ${r.length}`);
      return "(" + r.map((v) => { params.push(v); return `$${params.length}`; }).join(",") + ")";
    });
    await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values.join(",")}`, params);
  }
}
