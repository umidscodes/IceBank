"use client";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { useAccounts, useApi } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Modal, PageHeader, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { maskCard, POS_LIMIT_OPTIONS, type BankCard } from "@/ui/services/banking";

export default function CardsPage() {
  const toast = useToast();
  const { data: cards, error: loadError, reload, setData } = useApi<BankCard[]>("/cards");
  const { data: accounts } = useAccounts();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [lost, setLost] = useState<BankCard | null>(null);
  const [replacement, setReplacement] = useState<BankCard | null>(null);
  const [limits, setLimits] = useState<Record<number, string>>({});
  const [limitErrors, setLimitErrors] = useState<Record<number, string>>({});

  const accountName = (id: number) => accounts?.find((a) => a.id === id)?.displayName ?? "";
  const replace = (card: BankCard) => setData((cs) => cs?.map((c) => (c.id === card.id ? card : c)) ?? cs);

  function fail(err: unknown) {
    const msg = err instanceof ApiProblem ? err.message : "Something went wrong. Please try again.";
    setError(msg);
    toast.error(msg);
  }

  async function toggleLock(c: BankCard) {
    setBusy(c.id); setError(null);
    try {
      const updated = await api<BankCard>(`/cards/${c.id}/${c.status === "LOCKED" ? "unlock" : "lock"}`, { method: "POST" });
      replace(updated);
      toast.success(updated.status === "LOCKED" ? `Card ending ${updated.last4} is locked.` : `Card ending ${updated.last4} is unlocked.`);
    } catch (err) { fail(err); reload(); } finally { setBusy(null); }
  }

  async function confirmLost() {
    if (!lost) return;
    const c = lost;
    setBusy(c.id); setError(null);
    try {
      const r = await api<{ cancelledCard: BankCard; newCard: BankCard }>(`/cards/${c.id}/report-lost`, { method: "POST" });
      setLost(null);
      setReplacement(r.newCard);
      toast.success(`Card ending ${r.cancelledCard.last4} cancelled. Your new card ends in ${r.newCard.last4}.`);
      await reload();
    } catch (err) { setLost(null); fail(err); reload(); } finally { setBusy(null); }
  }

  async function saveLimit(c: BankCard) {
    const value = limits[c.id] ?? c.dailyPosLimit ?? "";
    setBusy(c.id); setError(null); setLimitErrors((e) => ({ ...e, [c.id]: "" }));
    try {
      const updated = await api<BankCard>(`/cards/${c.id}/limits`, { method: "PATCH", body: { dailyPosLimit: value } });
      replace(updated);
      toast.success(`Daily purchase limit set to ${formatMoney(updated.dailyPosLimit)}.`);
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        setLimitErrors((e) => ({ ...e, [c.id]: err.fieldErrors().dailyPosLimit ?? err.errors[0].message }));
        toast.error(err.message);
      } else fail(err);
    } finally { setBusy(null); }
  }

  if (loadError) return <Alert testId="cards-error">{loadError}</Alert>;
  if (!cards) return <Spinner label="Loading cards" />;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Cards" subtitle="Lock a card instantly, report it lost or change your daily debit purchase limit." />
      {error && <div className="mb-4"><Alert testId="cards-action-error">{error}</Alert></div>}
      {replacement && (
        <div className="mb-4">
          <Alert kind="success" testId="card-replacement-message">
            Your replacement {replacement.type === "DEBIT" ? "debit" : "credit"} card ending <strong data-testid="card-replacement-last4">{replacement.last4}</strong> is
            active (expires <span data-testid="card-replacement-expiry">{replacement.expiry}</span>). It will arrive by mail in 5 to 7 business days.
          </Alert>
        </div>
      )}
      {cards.length === 0 && <EmptyState testId="cards-empty">You have no cards.</EmptyState>}
      <div className="space-y-4" data-testid="cards-list">
        {cards.map((c) => {
          const cancelled = c.status === "CANCELLED";
          const limitValue = limits[c.id] ?? c.dailyPosLimit ?? "";
          return (
            <Card key={c.id} testId={`card-row-${c.id}`} className={cancelled ? "opacity-70" : ""}>
              <div className="flex flex-wrap gap-6 items-start">
                <div className={`w-64 h-36 rounded-xl p-4 flex flex-col justify-between text-white shadow ${c.type === "DEBIT" ? "bg-navy" : "bg-gradient-to-br from-[#13315C] to-[#2F86BF]"}`} aria-hidden>
                  <span className="text-sm font-semibold tracking-wide">Ice Bank {c.type === "DEBIT" ? "Debit" : "Credit"}</span>
                  <span className="font-mono text-base tracking-wider whitespace-nowrap">{maskCard(c.last4)}</span>
                  <span className="text-xs">EXP {c.expiry}</span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-bold text-navy" data-testid={`card-type-${c.id}`}>{c.type === "DEBIT" ? "Debit card" : "Credit card"}</h2>
                    <StatusBadge status={c.status} testId={`card-status-${c.id}`} />
                  </div>
                  <dl className="grid grid-cols-3 gap-y-1 text-sm">
                    <dt className="text-muted">Number</dt><dd className="col-span-2 font-mono" data-testid={`card-number-${c.id}`}>{maskCard(c.last4)}</dd>
                    <dt className="text-muted">Expires</dt><dd className="col-span-2" data-testid={`card-expiry-${c.id}`}>{c.expiry}</dd>
                    <dt className="text-muted">Account</dt><dd className="col-span-2" data-testid={`card-account-${c.id}`}>{accountName(c.accountId)}</dd>
                    {c.type === "DEBIT" && <><dt className="text-muted">Daily limit</dt><dd className="col-span-2" data-testid={`card-limit-${c.id}`}>{formatMoney(c.dailyPosLimit)}</dd></>}
                    {cancelled && <><dt className="text-muted">Cancelled</dt><dd className="col-span-2 text-muted" data-testid={`card-cancelled-note-${c.id}`}>
                      Reported lost{c.replacedByCardId ? ", replaced by a new card" : ""} · issued {formatDate(c.createdAt)}</dd></>}
                  </dl>
                  {!cancelled && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button variant="secondary" testId={`card-lock-button-${c.id}`} disabled={busy === c.id} onClick={() => toggleLock(c)} aria-pressed={c.status === "LOCKED"}>
                        {c.status === "LOCKED" ? "Unlock card" : "Lock card"}
                      </Button>
                      <Button variant="danger" testId={`card-report-lost-button-${c.id}`} disabled={busy === c.id} onClick={() => setLost(c)}>Report lost or stolen</Button>
                    </div>
                  )}
                  {!cancelled && c.type === "DEBIT" && (
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="ib-label" htmlFor={`card-limit-${c.id}`}>Daily purchase (POS) limit</label>
                        <select id={`card-limit-${c.id}`} className="ib-input !w-auto" data-testid={`card-limit-select-${c.id}`} value={limitValue}
                          aria-invalid={limitErrors[c.id] ? true : undefined}
                          onChange={(e) => setLimits((l) => ({ ...l, [c.id]: e.target.value }))}>
                          {limitValue && !POS_LIMIT_OPTIONS.includes(limitValue) && <option value={limitValue}>{formatMoney(limitValue)}</option>}
                          {POS_LIMIT_OPTIONS.map((v) => <option key={v} value={v}>{formatMoney(v)}</option>)}
                        </select>
                      </div>
                      <Button testId={`card-limit-save-button-${c.id}`} disabled={busy === c.id || limitValue === c.dailyPosLimit} onClick={() => saveLimit(c)}>Save limit</Button>
                      {limitErrors[c.id] && <p className="ib-error w-full" role="alert" data-testid={`card-limit-error-${c.id}`}>{limitErrors[c.id]}</p>}
                      <p className="ib-help w-full">$500.00 to $5,000.00, in $100.00 steps.</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Modal open={!!lost} title="Report card lost or stolen?" testId="report-lost-modal" onClose={() => setLost(null)}
        footer={<>
          <Button variant="secondary" testId="report-lost-cancel-button" onClick={() => setLost(null)}>Keep my card</Button>
          <Button variant="danger" testId="report-lost-confirm-button" disabled={busy !== null} onClick={confirmLost}>Cancel and replace card</Button>
        </>}>
        <p>Your card ending <strong data-testid="report-lost-modal-last4">{lost?.last4}</strong> will be cancelled right away and can no longer be used.
          We will issue a new card with a new number on the same account.</p>
      </Modal>
    </div>
  );
}
