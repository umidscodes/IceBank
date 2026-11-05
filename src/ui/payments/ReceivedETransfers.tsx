"use client";
/** Received e-Transfers with an Accept panel. Used by /etransfer/received and the Ice Mail deep link /etransfer/received/{id}. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiProblem, newIdempotencyKey } from "@/ui/api";
import { useAccounts, accountOption, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, SelectField, Spinner, StatusBadge, TextField, processingDelay } from "@/ui/components";
import { formatDate, formatDateTime, formatMoney } from "@/ui/format";
import { useToast } from "@/ui/toast";
import { depositAccounts, describeProblem, Details, withLabels, type ETransfer } from "./shared";

export function ReceivedETransfers({ focusId }: { focusId?: number }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<ETransfer> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ETransfer | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page<ETransfer>>(`/etransfers?direction=received&page=${page}&size=10`));
      setError(null);
    } catch (e) {
      setError(describeProblem(e).message);
    }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  // Deep link: load that one transfer and open its panel.
  useEffect(() => {
    if (focusId === undefined) return;
    if (!Number.isInteger(focusId) || focusId <= 0) { setLinkError("This e-Transfer link is not valid."); return; }
    api<ETransfer>(`/etransfers/${focusId}`)
      .then((t) => {
        if (t.direction !== "RECEIVED") { setLinkError("This e-Transfer was not sent to you."); return; }
        setSelected(t);
      })
      .catch((e) => setLinkError(e instanceof ApiProblem && e.status === 404 ? "We could not find this e-Transfer. It may have been sent to a different email address." : describeProblem(e).message));
  }, [focusId]);

  function open(t: ETransfer) {
    setSelected(t);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  const pendingCount = data?.content.filter((t) => t.status === "PENDING").length ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Received e-Transfers" subtitle="Deposit money that was sent to your email address."
        actions={<Link href="/etransfer" className="ib-btn ib-btn-secondary" data-testid="received-send-link">Send an e-Transfer</Link>} />
      {linkError && <div className="mb-4"><Alert testId="received-link-error">{linkError}</Alert></div>}
      <div ref={panelRef}>
        {selected && <AcceptPanel key={selected.id} transfer={selected} onClose={() => setSelected(null)}
          onDone={(t) => { setSelected(t); load(); }} />}
      </div>
      <Card testId="received-etransfers">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-navy text-lg">Received</h2>
          {data && <span className="text-sm text-muted" data-testid="received-pending-count">{pendingCount} waiting to be deposited</span>}
        </div>
        {error && <div className="mb-3"><Alert testId="received-etransfers-error">{error}</Alert></div>}
        {!data ? <Spinner /> : data.content.length === 0 ? <EmptyState testId="received-etransfers-empty">No e-Transfers have been sent to you.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="ib-table" data-testid="received-etransfers-table">
              <thead><tr><th>Received</th><th>From</th><th>Message</th><th className="text-right">Amount</th><th>Status</th><th>Expires / deposited</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.content.map((t) => (
                  <tr key={t.id} data-testid={`received-etransfer-row-${t.id}`} className={selected?.id === t.id ? "bg-[#F3F8FC]" : ""}>
                    <td className="whitespace-nowrap" data-testid="received-etransfer-date">{formatDateTime(t.createdAt)}</td>
                    <td data-testid="received-etransfer-sender">{t.senderName}</td>
                    <td className="text-muted max-w-[16rem]" data-testid="received-etransfer-message">{t.message ?? "-"}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-semibold" data-testid="received-etransfer-amount">{formatMoney(t.amount)}</td>
                    <td><StatusBadge status={t.status} testId="received-etransfer-status" /></td>
                    <td className="whitespace-nowrap text-muted" data-testid="received-etransfer-when">
                      {t.status === "PENDING" ? `Expires ${formatDate(t.expiresAt)}` : t.depositedAt ? formatDate(t.depositedAt) : t.expiredAt ? formatDate(t.expiredAt) : t.cancelledAt ? formatDate(t.cancelledAt) : "-"}
                    </td>
                    <td className="text-right">
                      {t.status === "PENDING" && (
                        <Button className="!py-1 !px-3 text-sm" testId={`received-etransfer-accept-${t.id}`} onClick={() => open(t)}
                          aria-label={`Deposit ${formatMoney(t.amount)} from ${t.senderName}`}>Deposit</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalElements > 0 && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="received-etransfers-pagination" />}
      </Card>
    </div>
  );
}

function AcceptPanel({ transfer, onClose, onDone }: { transfer: ETransfer; onClose: () => void; onDone: (t: ETransfer) => void }) {
  const toast = useToast();
  const { data: accounts, reload } = useAccounts();
  const targets = depositAccounts(accounts).filter((a) => a.status === "OPEN");
  const [accountId, setAccountId] = useState("");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "processing" | "done">(transfer.status === "PENDING" ? "form" : "done");
  const [result, setResult] = useState<ETransfer | null>(transfer.status === "PENDING" ? null : transfer);
  const key = useRef(newIdempotencyKey());

  useEffect(() => { if (!accountId && targets.length) setAccountId(String(targets[0].id)); }, [targets, accountId]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!accountId) fe.accountId = "Choose an account to deposit into.";
    if (!answer.trim()) fe.securityAnswer = "Enter the answer to the security question.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setPhase("processing");
    try {
      const [r] = await Promise.all([
        api<ETransfer>(`/etransfers/${transfer.id}/accept`, { body: { accountId: Number(accountId), securityAnswer: answer }, idempotencyKey: key.current }),
        processingDelay(),
      ]);
      setResult(r);
      setPhase("done");
      toast.success(`${formatMoney(r.amount)} from ${r.senderName} was deposited.`);
      reload();
      onDone(r);
    } catch (err) {
      setPhase("form");
      key.current = newIdempotencyKey();
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, { accountId: "Deposit account", securityAnswer: "Security answer" }));
      setError(p.message);
      toast.error(p.message);
    }
  }

  const accountName = (id: number | null) => accounts?.find((a) => a.id === id)?.displayName ?? "";
  return (
    <Card className="mb-6 border-glacier" testId="accept-etransfer-panel">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <h2 className="font-bold text-navy text-lg" data-testid="accept-etransfer-title">
            {transfer.senderName} sent you {formatMoney(transfer.amount)}
          </h2>
          <p className="text-sm text-muted">Reference <span className="font-mono" data-testid="accept-etransfer-reference">{transfer.referenceId}</span></p>
        </div>
        <Button variant="secondary" className="!py-1 !px-3 text-sm" testId="accept-etransfer-close-button" onClick={onClose}>Close</Button>
      </div>
      {phase !== "done" && (
        <>
          <Details rows={[
            ["Amount", <strong key="a">{formatMoney(transfer.amount)}</strong>, "accept-etransfer-amount"],
            ["Message", transfer.message ?? <span key="m" className="text-muted">No message</span>, "accept-etransfer-message"],
            ["Expires", formatDateTime(transfer.expiresAt), "accept-etransfer-expires"],
            ["Security question", <strong key="q">{transfer.securityQuestion ?? "-"}</strong>, "accept-etransfer-question"],
          ]} />
          {error && <div className="mt-4"><Alert testId="accept-etransfer-error">{error}</Alert></div>}
          {phase === "form" && (
            <form onSubmit={accept} noValidate className="grid sm:grid-cols-2 gap-4 mt-5" data-testid="accept-etransfer-form">
              {!accounts ? <Spinner label="Loading accounts" /> : (
                <SelectField id="accountId" label="Deposit to" testId="accept-etransfer-account-select" placeholder="Choose an account" value={accountId}
                  onChange={(e) => setAccountId(e.target.value)} options={targets.map((a) => accountOption(a, formatMoney))} error={errors.accountId}
                  help="Chequing or savings accounts only." />
              )}
              <TextField id="securityAnswer" label="Security answer" autoComplete="off" testId="accept-etransfer-answer-input" value={answer}
                onChange={(e) => setAnswer(e.target.value)} error={errors.securityAnswer} help="Not case-sensitive." />
              <div className="sm:col-span-2"><Button type="submit" testId="accept-etransfer-submit-button">Deposit money</Button></div>
            </form>
          )}
          {phase === "processing" && <div className="mt-5" data-testid="accept-etransfer-processing"><Spinner label="Depositing your e-Transfer…" /></div>}
        </>
      )}
      {phase === "done" && result && (
        result.status === "DEPOSITED" ? (
          <div data-testid="accept-etransfer-confirmation">
            <Alert kind="success" testId="accept-etransfer-success">
              <span data-testid="accept-etransfer-success-message">{formatMoney(result.amount)} was deposited{result.depositAccountId ? ` into ${accountName(result.depositAccountId)}` : ""}.</span>
            </Alert>
            <div className="mt-4">
              <Details rows={[
                ["Status", <StatusBadge key="s" status={result.status} />, "accept-etransfer-status"],
                ["Deposited", formatDateTime(result.depositedAt), "accept-etransfer-deposited-at"],
                ["Reference", <span key="r" className="font-mono">{result.referenceId}</span>, "accept-etransfer-confirmation-reference"],
              ]} />
            </div>
            {result.depositAccountId && <Link href={`/accounts/${result.depositAccountId}`} className="ib-btn ib-btn-primary mt-5" data-testid="accept-etransfer-view-account-link">View account</Link>}
          </div>
        ) : (
          <Alert kind="info" testId="accept-etransfer-unavailable">
            This e-Transfer is <strong data-testid="accept-etransfer-status">{result.status.toLowerCase()}</strong> and can no longer be deposited.
          </Alert>
        )
      )}
    </Card>
  );
}
