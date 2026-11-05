"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import type { Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, Spinner, TextField } from "@/ui/components";
import { formatDateTime, humanize } from "@/ui/format";
import type { AuditEntry } from "@/ui/admin/shared";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, EMPTY_AUDIT_FILTERS, auditQuery, prettyJson, validateAuditFilters, type AuditFilters } from "@/ui/admin/audit";

export default function AdminAuditPage() {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = auditQuery(filters);
      setData(await api<Page<AuditEntry>>(`/admin/audit-log?page=${page}&size=20${q ? `&${q}` : ""}`));
      setError(null);
    } catch (e) {
      if (e instanceof ApiProblem) { setErrors(e.fieldErrors()); setError(e.errors.length ? "Check the filters." : e.message); }
      else setError("Could not load the audit log.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof AuditFilters, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const fe = validateAuditFilters(draft);
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setOpen(new Set());
    setPage(0);
    setFilters({ ...draft });
  };
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every money movement, security event and teller action, newest first." />
      <Card testId="admin-audit-card">
        <form className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4 items-start" onSubmit={apply} noValidate data-testid="admin-audit-filter-form">
          <TextField id="action" label="Action" list="audit-actions" placeholder="Any" testId="admin-audit-action-input" value={draft.action}
            onChange={(e) => set("action", e.target.value.toUpperCase())} error={errors.action} />
          <TextField id="entityType" label="Entity type" list="audit-entity-types" placeholder="Any" testId="admin-audit-entity-type-input" value={draft.entityType}
            onChange={(e) => set("entityType", e.target.value)} error={errors.entityType} />
          <TextField id="entityId" label="Entity ID" inputMode="numeric" testId="admin-audit-entity-id-input" value={draft.entityId} onChange={(e) => set("entityId", e.target.value)} error={errors.entityId} />
          <TextField id="actorUserId" label="Actor user ID" inputMode="numeric" testId="admin-audit-actor-user-id-input" value={draft.actorUserId} onChange={(e) => set("actorUserId", e.target.value)} error={errors.actorUserId} />
          <TextField id="from" label="From" type="date" testId="admin-audit-from-input" value={draft.from} onChange={(e) => set("from", e.target.value)} error={errors.from} />
          <TextField id="to" label="To" type="date" testId="admin-audit-to-input" value={draft.to} onChange={(e) => set("to", e.target.value)} error={errors.to} />
          <datalist id="audit-actions">{AUDIT_ACTIONS.map((a) => <option key={a} value={a} />)}</datalist>
          <datalist id="audit-entity-types">{AUDIT_ENTITY_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
            <Button type="submit" testId="admin-audit-apply-button">Apply filters</Button>
            <Button variant="secondary" testId="admin-audit-clear-button" onClick={() => { setDraft(EMPTY_AUDIT_FILTERS); setFilters(EMPTY_AUDIT_FILTERS); setErrors({}); setPage(0); setOpen(new Set()); }}>Clear</Button>
          </div>
        </form>
        {error && <div className="mb-3"><Alert testId="admin-audit-error">{error}</Alert></div>}
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="ib-table" data-testid="admin-audit-table">
            <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th><th className="text-right">Details</th></tr></thead>
            <tbody>
              {data?.content.map((r) => {
                const expanded = open.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr data-testid={`admin-audit-row-${r.id}`}>
                      <td className="whitespace-nowrap" data-testid="admin-audit-date">{formatDateTime(r.createdAt)}</td>
                      <td><code className="text-xs font-semibold text-navy" data-testid="admin-audit-action">{r.action}</code></td>
                      <td data-testid="admin-audit-entity">{humanize(r.entityType)}{r.entityId !== null ? ` #${r.entityId}` : ""}</td>
                      <td data-testid="admin-audit-actor">{r.actorEmail ?? <span className="text-muted">System</span>}{r.actorUserId !== null && <span className="block text-xs text-muted">User #{r.actorUserId}</span>}</td>
                      <td className="text-right">
                        <button type="button" className="ib-link text-sm" aria-expanded={expanded} aria-controls={`audit-details-${r.id}`}
                          onClick={() => toggle(r.id)} data-testid={`admin-audit-toggle-${r.id}`}>{expanded ? "Hide" : "Show"}</button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`audit-details-${r.id}`} data-testid={`admin-audit-details-${r.id}`}>
                        <td colSpan={5} className="bg-frost">
                          <div className="grid md:grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs font-semibold text-muted mb-1">Old value</p>
                              <pre className="text-xs bg-white border border-line rounded p-2 overflow-auto max-h-64" data-testid="admin-audit-old-value">{prettyJson(r.oldValue)}</pre>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted mb-1">New value</p>
                              <pre className="text-xs bg-white border border-line rounded p-2 overflow-auto max-h-64" data-testid="admin-audit-new-value">{prettyJson(r.newValue)}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {loading && !data && <div className="py-6"><Spinner /></div>}
          {data && data.content.length === 0 && <EmptyState testId="admin-audit-empty">No audit entries match these filters.</EmptyState>}
        </div>
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={(p) => { setOpen(new Set()); setPage(p); }} testId="admin-audit-pagination" />}
      </Card>
    </div>
  );
}
