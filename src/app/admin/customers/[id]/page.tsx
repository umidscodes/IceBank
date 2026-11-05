"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api } from "@/ui/api";
import { useApi, type Account } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatusBadge } from "@/ui/components";
import { ACCOUNT_LABEL, formatDate, formatDateTime, formatMoney, formatOwing, humanize } from "@/ui/format";
import { PageAlert, ReasonModal, useAdminAction, type CustomerDetail } from "@/ui/admin/shared";

export default function AdminCustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, error, reload } = useApi<CustomerDetail>(`/admin/customers/${id}`);
  const { run, alert } = useAdminAction(reload);
  const [freezing, setFreezing] = useState<Account | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (error && !c) return <Alert testId="admin-customer-error">{error}</Alert>;
  if (!c) return <Spinner label="Loading customer" />;

  const unlock = async () => {
    setBusy("unlock");
    await run(() => api(`/admin/users/${c.userId}/unlock`, { method: "POST" }), `${c.firstName} ${c.lastName} can sign in again.`);
    setBusy(null);
  };
  const unfreeze = async (a: Account) => {
    setBusy(`unfreeze-${a.id}`);
    await run(() => api(`/admin/accounts/${a.id}/unfreeze`, { method: "POST" }), `${a.displayName} ${a.accountNumber} is open again.`);
    setBusy(null);
  };
  const freeze = async (reason: string) => {
    const a = freezing!;
    const r = await run(() => api(`/admin/accounts/${a.id}/freeze`, { body: { reason } }), `${a.displayName} ${a.accountNumber} is now frozen.`);
    if (r.fieldErrors) return r.fieldErrors;
    setFreezing(null);
  };

  const owing = (a: Account) => a.type === "CREDIT" || a.type === "LOAN";
  const field = (label: string, value: React.ReactNode, testId: string) => (
    <div className="contents"><dt className="text-muted">{label}</dt><dd data-testid={testId}>{value || <span className="text-muted">—</span>}</dd></div>
  );

  return (
    <div>
      <nav className="text-sm mb-3" aria-label="Breadcrumb">
        <Link href="/admin" className="ib-link" data-testid="breadcrumb-admin-customers">Customers</Link> <span className="text-muted">/ {c.firstName} {c.lastName}</span>
      </nav>
      <PageHeader title={`${c.firstName} ${c.lastName}`} subtitle={`Customer #${c.id} · User #${c.userId} · Joined ${formatDate(c.createdAt)}`} testId="admin-customer-title"
        actions={<StatusBadge status={c.userStatus} testId="admin-user-status-badge" />} />
      <PageAlert message={alert} testId="admin-customer-action-error" />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card testId="admin-customer-profile">
          <h2 className="font-bold text-navy text-lg mb-3">Profile</h2>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
            {field("Email", c.email, "admin-customer-email")}
            {field("Phone", c.phone, "admin-customer-phone")}
            {field("Date of birth", formatDate(c.dateOfBirth), "admin-customer-dob")}
            {field("SIN", `*** *** ${c.sinLast3}`, "admin-customer-sin")}
            {field("Address", <>{c.address.line1}{c.address.line2 ? `, ${c.address.line2}` : ""}<br />{c.address.city}, {c.address.province} {c.address.postalCode}</>, "admin-customer-address")}
          </dl>
        </Card>
        <Card testId="admin-customer-security">
          <div className="flex justify-between items-start mb-3">
            <h2 className="font-bold text-navy text-lg">Sign-in</h2>
            {c.userStatus === "LOCKED" && (
              <Button testId="admin-unlock-button" onClick={unlock} disabled={busy === "unlock"}>{busy === "unlock" ? "Unlocking…" : "Unlock user"}</Button>
            )}
          </div>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
            {field("User status", <StatusBadge status={c.userStatus} testId="admin-user-status" />, "admin-user-status-cell")}
            {field("Failed logins", String(c.failedLoginCount), "admin-failed-login-count")}
            {field("Locked until", c.lockedUntil ? formatDateTime(c.lockedUntil) : "", "admin-locked-until")}
            {field("Last sign-in", c.lastLoginAt ? formatDateTime(c.lastLoginAt) : "Never", "admin-last-login")}
          </dl>
        </Card>
      </div>

      <Card testId="admin-accounts-card" className="mb-6">
        <h2 className="font-bold text-navy text-lg mb-3">Accounts</h2>
        <div className="overflow-x-auto">
          <table className="ib-table" data-testid="admin-accounts-table">
            <thead><tr><th>Account</th><th>Number</th><th>Status</th><th className="text-right">Balance</th><th className="text-right">Available</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {c.accounts.map((a) => (
                <tr key={a.id} data-testid={`admin-account-row-${a.id}`}>
                  <td data-testid="admin-account-name">{a.displayName}<span className="block text-xs text-muted">{ACCOUNT_LABEL[a.type]} · #{a.id}</span></td>
                  <td className="whitespace-nowrap tabular-nums" data-testid="admin-account-number">{a.accountNumber}</td>
                  <td><StatusBadge status={a.status} testId={`admin-account-status-${a.id}`} /></td>
                  <td className="text-right tabular-nums whitespace-nowrap" data-testid="admin-account-balance">{owing(a) ? `${formatOwing(a.balance)} owing` : formatMoney(a.balance)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap" data-testid="admin-account-available">
                    {a.type === "CREDIT" ? formatMoney(a.availableCredit) : a.type === "LOAN" ? "—" : formatMoney(a.availableBalance)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {a.status === "OPEN" && <Button variant="danger" className="!py-1 !px-3 text-sm" testId={`admin-freeze-button-${a.id}`} onClick={() => setFreezing(a)}>Freeze</Button>}
                    {a.status === "FROZEN" && (
                      <Button variant="secondary" className="!py-1 !px-3 text-sm" testId={`admin-unfreeze-button-${a.id}`} disabled={busy === `unfreeze-${a.id}`} onClick={() => unfreeze(a)}>
                        {busy === `unfreeze-${a.id}` ? "Unfreezing…" : "Unfreeze"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.accounts.length === 0 && <EmptyState testId="admin-accounts-empty">This customer has no accounts.</EmptyState>}
        </div>
      </Card>

      <Card testId="admin-cards-card">
        <h2 className="font-bold text-navy text-lg mb-3">Cards</h2>
        {c.cards.length === 0 ? <EmptyState testId="admin-cards-empty">No cards.</EmptyState> : (
          <ul className="divide-y divide-line" data-testid="admin-cards-list">
            {c.cards.map((k) => {
              const acct = c.accounts.find((a) => a.id === k.accountId);
              return (
                <li key={k.id} className="flex items-center justify-between py-2 text-sm" data-testid={`admin-card-row-${k.id}`}>
                  <span>
                    <span className="font-semibold" data-testid="admin-card-type">{humanize(k.type)} card</span>{" "}
                    <span className="tabular-nums" data-testid="admin-card-number">{k.maskedNumber}</span>
                    <span className="block text-xs text-muted" data-testid="admin-card-account">Linked to {acct ? `${acct.displayName} ${acct.accountNumber}` : `account #${k.accountId}`}</span>
                  </span>
                  <StatusBadge status={k.status} testId="admin-card-status" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ReasonModal open={!!freezing} title="Freeze account" testId="admin-freeze-modal" confirmLabel="Freeze account"
        intro={freezing && <p>Freeze <strong>{freezing.displayName} {freezing.accountNumber}</strong>? A frozen account cannot send or receive transfers, e-Transfers, bill payments or deposits. The customer is notified.</p>}
        onCancel={() => setFreezing(null)} onConfirm={freeze} />
    </div>
  );
}
