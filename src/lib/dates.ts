/**
 * Date helpers. Ice Bank runs on America/Toronto time: "today", daily limits, business days and
 * statement months all use the Toronto calendar. API timestamps are ISO 8601 with offset.
 */
import { DateTime } from "luxon";

export const ZONE = "America/Toronto";

/** The instant every sandbox clock returns to on reset: Monday 2 November 2026, 09:00 Toronto. */
export const SEED_INSTANT = DateTime.fromISO("2026-11-02T09:00:00", { zone: ZONE });

export function toZoned(d: Date | string): DateTime {
  return (typeof d === "string" ? DateTime.fromISO(d) : DateTime.fromJSDate(d)).setZone(ZONE);
}

/** 2026-11-04T21:15:00-05:00 */
export function isoOffset(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return toZoned(d).set({ millisecond: 0 }).toISO({ suppressMilliseconds: true });
}

/** A DATE column value (pg returns a "YYYY-MM-DD" string because we disable date parsing). */
export function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return toZoned(d).toISODate();
}

export function torontoDate(d: Date): string {
  return toZoned(d).toISODate()!;
}

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: ZONE }).isValid;
}

export function startOfDay(date: string): Date {
  return DateTime.fromISO(date, { zone: ZONE }).startOf("day").toJSDate();
}
export function endOfDay(date: string): Date {
  return DateTime.fromISO(date, { zone: ZONE }).endOf("day").toJSDate();
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: ZONE }).plus({ days }).toISODate()!;
}

/** Whole years between two ISO dates. */
export function ageOn(dateOfBirth: string, on: string): number {
  const dob = DateTime.fromISO(dateOfBirth);
  const ref = DateTime.fromISO(on);
  let age = ref.year - dob.year;
  if (ref.month < dob.month || (ref.month === dob.month && ref.day < dob.day)) age--;
  return age;
}

// ---------------------------------------------------------------------------------------------
// Business days and holidays
// ---------------------------------------------------------------------------------------------

function easterSunday(year: number): DateTime {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.fromObject({ year, month, day }, { zone: ZONE });
}

function nthWeekday(year: number, month: number, weekday: number, n: number): DateTime {
  let d = DateTime.fromObject({ year, month, day: 1 }, { zone: ZONE });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.plus({ weeks: n - 1 });
}

/** Monday on or before May 24 */
function victoriaDay(year: number): DateTime {
  let d = DateTime.fromObject({ year, month: 5, day: 24 }, { zone: ZONE });
  while (d.weekday !== 1) d = d.minus({ days: 1 });
  return d;
}

/** Weekend holidays move to the next weekday not already taken by another holiday. */
function observed(dates: { name: string; date: DateTime }[]): { name: string; date: string }[] {
  const taken = new Set<string>();
  const out: { name: string; date: string }[] = [];
  for (const h of dates) {
    let d = h.date;
    while (d.weekday >= 6 || taken.has(d.toISODate()!)) d = d.plus({ days: 1 });
    taken.add(d.toISODate()!);
    out.push({ name: h.name, date: d.toISODate()! });
  }
  return out;
}

const holidayCache = new Map<number, { name: string; date: string }[]>();

/** Ice Bank's posting holidays for a year (observed dates). */
export function holidays(year: number): { name: string; date: string }[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const D = (month: number, day: number) => DateTime.fromObject({ year, month, day }, { zone: ZONE });
  const list = observed([
    { name: "New Year's Day", date: D(1, 1) },
    { name: "Family Day", date: nthWeekday(year, 2, 1, 3) },
    { name: "Good Friday", date: easterSunday(year).minus({ days: 2 }) },
    { name: "Victoria Day", date: victoriaDay(year) },
    { name: "Canada Day", date: D(7, 1) },
    { name: "Civic Holiday", date: nthWeekday(year, 8, 1, 1) },
    { name: "Labour Day", date: nthWeekday(year, 9, 1, 1) },
    { name: "National Day for Truth and Reconciliation", date: D(9, 30) },
    { name: "Thanksgiving", date: nthWeekday(year, 10, 1, 2) },
    { name: "Remembrance Day", date: D(11, 11) },
    { name: "Christmas Day", date: D(12, 25) },
    { name: "Boxing Day", date: D(12, 26) },
  ]);
  holidayCache.set(year, list);
  return list;
}

export function holidayName(date: string): string | null {
  const year = Number(date.slice(0, 4));
  return holidays(year).find((h) => h.date === date)?.name ?? null;
}

export function isBusinessDay(date: string): boolean {
  const d = DateTime.fromISO(date, { zone: ZONE });
  return d.weekday <= 5 && holidayName(date) === null;
}

/** The given date if it is a business day, otherwise the next business day. */
export function onOrNextBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** The first business day strictly after the given date. */
export function nextBusinessDay(date: string): string {
  return onOrNextBusinessDay(addDays(date, 1));
}

/**
 * Monthly recurrence anchored on a day of month: the 29th to 31st fall on the last day of
 * shorter months. `n` is 0 for the first occurrence.
 */
export function monthlyOccurrence(firstDate: string, n: number): string {
  const first = DateTime.fromISO(firstDate, { zone: ZONE });
  const anchorDay = first.day;
  const target = first.startOf("month").plus({ months: n });
  const day = Math.min(anchorDay, target.daysInMonth!);
  return target.set({ day }).toISODate()!;
}

export function recurrenceDate(firstDate: string, recurrence: string, n: number): string {
  switch (recurrence) {
    case "WEEKLY": return addDays(firstDate, 7 * n);
    case "BIWEEKLY": return addDays(firstDate, 14 * n);
    case "MONTHLY": return monthlyOccurrence(firstDate, n);
    default: return firstDate;
  }
}
