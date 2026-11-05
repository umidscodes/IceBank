"use client";
/**
 * Custom date picker (a Selenium "date picker" challenge): a text input that accepts YYYY-MM-DD plus a toggle button
 * that opens a calendar popup. Days before `min` (or after `max`) are disabled. Keyboard: arrows move a day/week,
 * PageUp/PageDown a month, Home/End the start/end of the week, Enter or Space picks, Escape closes.
 *
 * Test ids use the `testId` prefix (default "date-picker"): <prefix>-input, -toggle, -calendar, -prev-month,
 * -next-month, -month-label, -day-YYYY-MM-DD.
 */
import { useEffect, useId, useRef, useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain calendar dates, computed in UTC so time zones never shift a day. */
interface Ymd { y: number; m: number; d: number } // m is 0-11
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = ({ y, m, d }: Ymd) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parseIso(s: string | undefined): Ymd | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: m - 1, d };
}
const fromDate = (dt: Date): Ymd => ({ y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() });
const toDate = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m, d));
const addDays = (v: Ymd, n: number) => fromDate(new Date(Date.UTC(v.y, v.m, v.d + n)));
function addMonths(v: Ymd, n: number): Ymd {
  const first = new Date(Date.UTC(v.y, v.m + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return { y: first.getUTCFullYear(), m: first.getUTCMonth(), d: Math.min(v.d, last) };
}

export interface DatePickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date (YYYY-MM-DD). */
  min?: string;
  /** Latest selectable date (YYYY-MM-DD). */
  max?: string;
  error?: string;
  help?: string;
  placeholder?: string;
  testId?: string;
  className?: string;
}

export function DatePicker({ id, label, value, onChange, min, max, error, help, placeholder = "YYYY-MM-DD", testId = "date-picker", className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const minD = parseIso(min);
  const maxD = parseIso(max);
  const selected = parseIso(value);
  const initial = () => selected ?? minD ?? fromDate(new Date());
  const [focus, setFocus] = useState<Ymd>(initial);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const calId = `${useId()}-calendar`;

  const minIso = minD ? toIso(minD) : null;
  const maxIso = maxD ? toIso(maxD) : null;
  const disabled = (v: Ymd) => { const iso = toIso(v); return (!!minIso && iso < minIso) || (!!maxIso && iso > maxIso); };
  const clamp = (v: Ymd): Ymd => {
    const iso = toIso(v);
    if (minD && minIso && iso < minIso) return minD;
    if (maxD && maxIso && iso > maxIso) return maxD;
    return v;
  };

  function openCalendar() {
    setFocus(clamp(initial()));
    setOpen(true);
    moveFocus.current = true;
  }
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }
  function pick(v: Ymd) {
    if (disabled(v)) return;
    onChange(toIso(v));
    close();
  }

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move keyboard focus to the focused day after it changes via the keyboard (or on open).
  useEffect(() => {
    if (!open || !moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toIso(focus)}"]`)?.focus();
  }, [open, focus]);

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1), PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -toDate(focus).getUTCDay()), End: () => addDays(focus, 6 - toDate(focus).getUTCDay()),
    };
    if (moves[e.key]) {
      e.preventDefault();
      moveFocus.current = true;
      setFocus(clamp(moves[e.key]()));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  }

  // Calendar grid for the month being shown.
  const month = { y: focus.y, m: focus.m };
  const firstDow = new Date(Date.UTC(month.y, month.m, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (Ymd | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => ({ ...month, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);
  const weeks: (Ymd | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const prevDisabled = !!minD && (month.y < minD.y || (month.y === minD.y && month.m <= minD.m));
  const nextDisabled = !!maxD && (month.y > maxD.y || (month.y === maxD.y && month.m >= maxD.m));
  const shiftMonth = (n: number) => setFocus(clamp(addMonths(focus, n)));
  const todayIso = minIso;
  const errId = `${id}-error`, helpId = `${id}-help`;

  return (
    <div className={`relative ${className ?? ""}`} ref={wrapRef}>
      <label className="ib-label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} name={id} className="ib-input" data-testid={`${testId}-input`} value={value} placeholder={placeholder} autoComplete="off" inputMode="numeric"
          maxLength={10} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : help ? helpId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); openCalendar(); } }} />
        <button ref={toggleRef} type="button" className="ib-btn ib-btn-secondary !px-3 shrink-0" data-testid={`${testId}-toggle`}
          aria-label={`${open ? "Close" : "Open"} calendar for ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? calId : undefined}
          onClick={() => (open ? close() : openCalendar())}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      {help && !error && <p className="ib-help" id={helpId}>{help}</p>}
      {error && <p className="ib-error" id={errId} data-testid={`${testId}-error`} role="alert">{error}</p>}

      {open && (
        <div id={calId} role="dialog" aria-modal="false" aria-label={`Choose ${label.toLowerCase()}`} data-testid={`${testId}-calendar`}
          className="absolute z-40 mt-2 w-[19rem] ib-card p-3 shadow-lg"
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="ib-btn ib-btn-secondary !px-2 !py-1" data-testid={`${testId}-prev-month`} aria-label="Previous month"
              disabled={prevDisabled} onClick={() => shiftMonth(-1)}>‹</button>
            <span className="font-semibold text-navy" aria-live="polite" data-testid={`${testId}-month-label`}>{MONTHS[month.m]} {month.y}</span>
            <button type="button" className="ib-btn ib-btn-secondary !px-2 !py-1" data-testid={`${testId}-next-month`} aria-label="Next month"
              disabled={nextDisabled} onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div role="grid" ref={gridRef} aria-label={`${MONTHS[month.m]} ${month.y}`} onKeyDown={onGridKey}>
            <div role="row" className="grid grid-cols-7 text-center text-xs text-muted mb-1">
              {WEEKDAYS.map((w, i) => <span key={w} role="columnheader" aria-label={WEEKDAYS_LONG[i]}>{w}</span>)}
            </div>
            {weeks.map((week, wi) => (
              <div role="row" key={wi} className="grid grid-cols-7 gap-0.5">
                {week.map((day, di) => {
                  if (!day) return <span key={di} role="gridcell" />;
                  const iso = toIso(day);
                  const isSel = selected && toIso(selected) === iso;
                  const isFocus = toIso(focus) === iso;
                  const off = disabled(day);
                  const dow = toDate(day).getUTCDay();
                  return (
                    <span key={di} role="gridcell" aria-selected={isSel ? true : undefined}>
                      <button type="button" data-date={iso} data-testid={`${testId}-day-${iso}`} tabIndex={isFocus ? 0 : -1} disabled={off}
                        aria-label={`${WEEKDAYS_LONG[dow]}, ${MONTHS[day.m]} ${day.d}, ${day.y}${off ? " (not available)" : ""}`}
                        aria-pressed={isSel ? true : false} aria-current={iso === todayIso ? "date" : undefined}
                        onClick={() => pick(day)} onFocus={() => { if (!isFocus) setFocus(day); }}
                        className={`w-full h-9 rounded-md text-sm tabular-nums transition-colors ${
                          isSel ? "bg-navy text-white font-semibold" : off ? "text-[#A9B6C3] cursor-not-allowed line-through"
                            : `hover:bg-[#E8F2FA] ${dow === 0 || dow === 6 ? "text-muted" : "text-ink"}`} ${iso === todayIso && !isSel ? "ring-1 ring-glacier" : ""}`}>
                        {day.d}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-2 text-xs text-muted">
            <span>Weekends shown in grey</span>
            <button type="button" className="ib-link" data-testid={`${testId}-close`} onClick={() => close()}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
