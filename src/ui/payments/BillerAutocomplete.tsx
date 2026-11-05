"use client";
/**
 * Custom autocomplete (ARIA 1.2 combobox) for the billers directory: typing calls GET /billers?q= after a 250 ms pause.
 * ArrowDown/ArrowUp move through the options, Enter picks, Escape closes; options can also be clicked.
 * Test ids: biller-search-input, biller-listbox, biller-option-<id>, biller-search-status, biller-selected.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/ui/api";
import type { Biller } from "./shared";

export const BILLER_DEBOUNCE_MS = 250;

export function BillerAutocomplete({ value, onSelect, error, id = "billerSearch" }: {
  value: Biller | null; onSelect: (b: Biller | null) => void; error?: string; id?: string;
}) {
  const [text, setText] = useState(value?.name ?? "");
  const [results, setResults] = useState<Biller[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const seq = useRef(0);
  const listId = `${id}-listbox`;

  // Follow a selection made by the parent (to clear the field, the parent remounts this component with a new key).
  useEffect(() => { if (value) setText(value.name); }, [value]);

  // Debounced search: each new query cancels the pending timer; stale responses are ignored.
  useEffect(() => {
    if (query === null) return;
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const q = query.trim();
        const rows = await api<Biller[]>(`/billers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        if (n !== seq.current) return;
        setResults(rows);
        setFailed(false);
        setActive(rows.length ? 0 : -1);
      } catch {
        if (n === seq.current) { setResults([]); setFailed(true); }
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, BILLER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  function choose(b: Biller) {
    onSelect(b);
    setText(b.name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); if (query === null || !results.length) setQuery(text); return; }
      if (results.length) setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (open && results.length) setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); }
    }
  }

  const showList = open && (text.trim().length > 0 || results.length > 0);
  const status = loading ? "Searching…" : failed ? "Could not search billers. Try again." : query !== null && results.length === 0 ? "No billers match your search."
    : `${results.length} biller${results.length === 1 ? "" : "s"} found. Use the up and down arrows to choose.`;

  return (
    <div className="relative">
      <label className="ib-label" htmlFor={id}>Biller</label>
      <input id={id} name={id} type="text" role="combobox" className="ib-input" data-testid="biller-search-input" autoComplete="off"
        placeholder="Search billers, e.g. power" value={text}
        aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={showList && active >= 0 && results[active] ? `${listId}-opt-${results[active].id}` : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-status`}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setQuery(e.target.value);
          if (value) onSelect(null);
        }}
        onFocus={() => { if (text.trim() && !value) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown} />
      <p id={`${id}-status`} className="sr-only" aria-live="polite" data-testid="biller-search-status">{open ? status : ""}</p>
      {error && <p className="ib-error" id={`${id}-error`} data-testid="biller-search-error" role="alert">{error}</p>}
      {showList && (
        <ul id={listId} role="listbox" aria-label="Billers" data-testid="biller-listbox"
          className="absolute z-40 mt-1 w-full max-h-72 overflow-auto ib-card !rounded-lg py-1 shadow-lg">
          {loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted" data-testid="biller-search-loading">Searching…</li>}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted" data-testid="biller-no-results">{failed ? "Could not search billers." : "No billers match your search."}</li>}
          {results.map((b, i) => (
            <li key={b.id} id={`${listId}-opt-${b.id}`} role="option" aria-selected={i === active} data-testid={`biller-option-${b.id}`}
              className={`px-3 py-2 cursor-pointer ${i === active ? "bg-[#E8F2FA]" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(b)}>
              <span className="flex justify-between gap-3">
                <span className="font-semibold text-navy" data-testid="biller-option-name">{b.name}</span>
                <span className="ib-badge bg-[#EEF1F4] text-muted self-center" data-testid="biller-option-category">{b.category}</span>
              </span>
              <span className="block text-xs text-muted" data-testid="biller-option-hint">Account number: {b.accountNumberHint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
