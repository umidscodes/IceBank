"use client";
/** Small shared UI building blocks. Every interactive element gets a data-testid. */
import { useEffect, useRef } from "react";
import { formatMoney } from "./format";

export function Logo({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" data-testid="brand-logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="19" fill={light ? "#ffffff" : "#0B2545"} />
        <path d="M7 25 L14 15 L18 20 L23 11 L33 25 Z" fill="#4FA3D9" />
        <path d="M14 15 L16.5 18.5 L13 19 Z M23 11 L26.5 16 L21.5 15.5 Z" fill="#F5F9FC" />
        <rect x="7" y="25" width="26" height="3" rx="1.5" fill={light ? "#0B2545" : "#F5F9FC"} opacity="0.35" />
      </svg>
      <span className={`font-bold tracking-tight ${light ? "text-white" : "text-navy"}`} style={{ fontSize: size * 0.6 }}>Ice Bank</span>
    </span>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string; label: string; testId: string; error?: string; help?: string;
}
export function TextField({ id, label, testId, error, help, className, ...rest }: FieldProps) {
  return (
    <div className={className}>
      <label className="ib-label" htmlFor={id}>{label}</label>
      <input id={id} name={id} className="ib-input" data-testid={testId} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {...rest} />
      {help && !error && <p className="ib-help" id={`${id}-help`}>{help}</p>}
      {error && <p className="ib-error" id={`${id}-error`} data-testid={`${testId.replace(/-(input|select)$/, "")}-error`} role="alert">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string; label: string; testId: string; error?: string; help?: string; options: { value: string; label: string }[]; placeholder?: string;
}
export function SelectField({ id, label, testId, error, help, options, placeholder, className, ...rest }: SelectProps) {
  return (
    <div className={className}>
      <label className="ib-label" htmlFor={id}>{label}</label>
      <select id={id} name={id} className="ib-input" data-testid={testId} aria-invalid={error ? true : undefined} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {help && !error && <p className="ib-help">{help}</p>}
      {error && <p className="ib-error" data-testid={`${testId.replace(/-(input|select)$/, "")}-error`} role="alert">{error}</p>}
    </div>
  );
}

export function Button({ variant = "primary", testId, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; testId: string }) {
  return <button type="button" className={`ib-btn ib-btn-${variant} ${className}`} data-testid={testId} {...rest} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted text-sm" data-testid="loading-indicator" role="status">
      <span className="h-4 w-4 rounded-full border-2 border-glacier border-t-transparent animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, testId = "page-title" }: { title: string; subtitle?: string; actions?: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy" data-testid={testId}>{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return <section className={`ib-card p-6 ${className}`} data-testid={testId}>{children}</section>;
}

const BADGE: Record<string, string> = {
  OPEN: "bg-success-bg text-success", ACTIVE: "bg-success-bg text-success", POSTED: "bg-success-bg text-success", DEPOSITED: "bg-success-bg text-success",
  APPROVED: "bg-success-bg text-success", COMPLETED: "bg-success-bg text-success", RESOLVED: "bg-success-bg text-success", PAID: "bg-success-bg text-success",
  PENDING: "bg-warn-bg text-warn", SCHEDULED: "bg-[#E8F2FA] text-glacier-600", MANUAL_REVIEW: "bg-warn-bg text-warn", DUE: "bg-[#E8F2FA] text-glacier-600",
  PENDING_CONFIRMATION: "bg-warn-bg text-warn",
  FROZEN: "bg-alert-bg text-alert", LOCKED: "bg-alert-bg text-alert", CANCELLED: "bg-[#EEF1F4] text-muted", EXPIRED: "bg-[#EEF1F4] text-muted",
  REVERSED: "bg-[#EEF1F4] text-muted", CLOSED: "bg-[#EEF1F4] text-muted", PAID_OFF: "bg-[#EEF1F4] text-muted",
  FAILED: "bg-alert-bg text-alert", DECLINED: "bg-alert-bg text-alert", REJECTED: "bg-alert-bg text-alert", MISSED: "bg-alert-bg text-alert", DISABLED: "bg-alert-bg text-alert",
};
export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  return <span className={`ib-badge ${BADGE[status] ?? "bg-[#EEF1F4] text-muted"}`} data-testid={testId}>{status.replace(/_/g, " ")}</span>;
}

export function Amount({ value, direction, testId, className = "" }: { value: string; direction?: string; testId?: string; className?: string }) {
  const neg = direction === "DEBIT";
  return (
    <span className={`tabular-nums whitespace-nowrap ${neg ? "text-ink" : direction === "CREDIT" ? "text-success" : ""} ${className}`} data-testid={testId}>
      {direction === "DEBIT" ? "-" : direction === "CREDIT" ? "+" : ""}{formatMoney(value)}
    </span>
  );
}

export function Modal({ open, title, children, onClose, testId, footer }: { open: boolean; title: string; children: React.ReactNode; onClose?: () => void; testId: string; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4" data-testid={`${testId}-overlay`}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} className="ib-card w-full max-w-md p-6 outline-none" data-testid={testId}
        onKeyDown={(e) => { if (e.key === "Escape" && onClose) onClose(); }}>
        <h2 id={`${testId}-title`} className="text-lg font-bold text-navy mb-3" data-testid={`${testId}-title`}>{title}</h2>
        <div className="text-sm text-ink">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({ kind = "error", children, testId }: { kind?: "error" | "success" | "info" | "warn"; children: React.ReactNode; testId: string }) {
  const cls = kind === "error" ? "bg-alert-bg text-alert border-alert/30" : kind === "success" ? "bg-success-bg text-success border-success/30"
    : kind === "warn" ? "bg-warn-bg text-warn border-warn/30" : "bg-[#E8F2FA] text-navy border-glacier/30";
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${cls}`} data-testid={testId}>{children}</div>;
}

export function Pagination({ page, totalPages, totalElements, onPage, testId = "pagination" }: { page: number; totalPages: number; totalElements: number; onPage: (p: number) => void; testId?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm" data-testid={testId}>
      <span className="text-muted" data-testid={`${testId}-summary`}>
        {totalElements === 0 ? "No results" : `Page ${page + 1} of ${Math.max(totalPages, 1)} · ${totalElements} result${totalElements === 1 ? "" : "s"}`}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" testId={`${testId}-prev`} disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" testId={`${testId}-next`} disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function EmptyState({ children, testId = "empty-state" }: { children: React.ReactNode; testId?: string }) {
  return <p className="text-muted text-sm py-8 text-center" data-testid={testId}>{children}</p>;
}

/** Waits 1 to 3 seconds: the "Processing" state for transfers and e-transfers. */
export function processingDelay(): Promise<void> {
  const ms = 1000 + Math.floor(Math.random() * 2000);
  return new Promise((r) => setTimeout(r, ms));
}
