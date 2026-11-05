"use client";
/** "Sent e-Transfers" table. Cancelling uses the NATIVE window.confirm() on purpose (the Selenium "browser alert" challenge). */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, newIdempotencyKey } from "@/ui/api";
import type { Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Pagination, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { describeProblem, type ETransfer } from "./shared";

export function SentETransfers({ version = 0, onChanged }: { version?: number; onChanged?: () => void }) {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<ETransfer> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const keys = useRef(new Map<number, string>());

  const load = useCallback(async () => {
    try {
      setData(await api<Page<ETransfer>>(`/etransfers?direction=sent&page=${page}&size=10`));
    } catch (e) {
      setError(describeProblem(e).message);
    }
  }, [page]);
  useEffect(() => { load(); }, [load, version]);

  async function cancel(t: ETransfer) {
    // Native browser confirm dialog, deliberately not a custom modal.
    if (!window.confirm(`Cancel this e-Transfer of ${formatMoney(t.amount)} to ${t.recipientName}?`)) return;
    if (!keys.current.has(t.id)) keys.current.set(t.id, newIdempotencyKey());
    setBusy(t.id);
    setError(null);
    try {
      await api<ETransfer>(`/etransfers/${t.id}/cancel`, { method: "POST", body: {}, idempotencyKey: keys.current.get(t.id) });
      toast.success(`e-Transfer to ${t.recipientName} cancelled. ${formatMoney(t.amount)} was returned to your account.`);
      onChanged?.();
      await load();
    } catch (e) {
      const p = describeProblem(e);
      setError(p.message);
      toast.error(p.message);
      await load();
    } finally {
      keys.current.delete(t.id);
      setBusy(null);
    }
  }

  return (
    <Card className="mt-8" testId="sent-etransfers">
      <h2 className="font-bold text-navy text-lg mb-4">Sent e-Transfers</h2>
      {error && <div className="mb-3"><Alert testId="sent-etransfers-error">{error}</Alert></div>}
      {!data ? <Spinner /> : data.content.length === 0 ? <EmptyState testId="sent-etransfers-empty">You have not sent any e-Transfers yet.</EmptyState> : (
        <div className="overflow-x-auto">
          <table className="ib-table" data-testid="sent-etransfers-table">
            <thead><tr><th>Sent</th><th>Recipient</th><th className="text-right">Amount</th><th>Status</th><th>Reference</th><th>Expires</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.content.map((t) => (
                <tr key={t.id} data-testid={`sent-etransfer-row-${t.id}`}>
                  <td className="whitespace-nowrap" data-testid="sent-etransfer-date">{formatDateTime(t.createdAt)}</td>
                  <td data-testid="sent-etransfer-recipient">{t.recipientName}<span className="block text-xs text-muted">{t.recipientEmail}</span></td>
                  <td className="text-right tabular-nums whitespace-nowrap font-semibold" data-testid="sent-etransfer-amount">{formatMoney(t.amount)}</td>
                  <td><StatusBadge status={t.status} testId="sent-etransfer-status" />{t.autodeposit && <span className="block text-xs text-muted mt-1">Autodeposit</span>}</td>
                  <td className="font-mono text-xs" data-testid="sent-etransfer-reference">{t.referenceId}</td>
                  <td className="whitespace-nowrap text-muted" data-testid="sent-etransfer-expires">{t.status === "PENDING" ? formatDate(t.expiresAt) : "-"}</td>
                  <td className="text-right">
                    {t.status === "PENDING" && (
                      <Button variant="secondary" className="!py-1 !px-3 text-sm" testId={`sent-etransfer-cancel-${t.id}`} disabled={busy === t.id}
                        aria-label={`Cancel e-Transfer of ${formatMoney(t.amount)} to ${t.recipientName}`} onClick={() => cancel(t)}>
                        {busy === t.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalElements > 0 && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="sent-etransfers-pagination" />}
    </Card>
  );
}
