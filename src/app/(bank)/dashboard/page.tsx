"use client";
import Link from "next/link";
import { useSession } from "@/ui/session";
import { useAccounts, useApi, type Account, type Page, type Transaction } from "@/ui/types";
import { Alert, Card, PageHeader, Spinner, StatusBadge } from "@/ui/components";
import { formatDate, formatMoney, formatOwing, ACCOUNT_LABEL } from "@/ui/format";
import { ClassicDashboard } from "@/ui/classic";
import { balanceTestIds, netTotal } from "@/ui/account-math";

export default function Dashboard() {
  const { me } = useSession();
  const { data: accounts, error, loading } = useAccounts();
  if (me.classicView) return <ClassicDashboard />;

  const ids = accounts ? balanceTestIds(accounts) : new Map<number, string>();
  const deposits = accounts?.filter((a) => a.type === "CHEQUING" || a.type === "SAVINGS") ?? [];
  const borrowing = accounts?.filter((a) => a.type === "CREDIT" || a.type === "LOAN") ?? [];
  return (
    <div>
      <PageHeader title={`Good day, ${me.firstName ?? "there"}`} subtitle="Here is an overview of your accounts." testId="dashboard-greeting" />
      {loading && <Spinner label="Loading accounts" />}
      {error && <Alert testId="dashboard-error">{error}</Alert>}
      {accounts && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <AccountGroup title="Bank accounts" accounts={deposits} ids={ids} testId="dashboard-deposit-accounts" />
            {borrowing.length > 0 && <AccountGroup title="Credit cards and loans" accounts={borrowing} ids={ids} testId="dashboard-borrowing-accounts" />}
          </div>
          <div className="space-y-6">
            <Card testId="dashboard-net-total-card">
              <p className="text-sm text-muted">Net total (CAD)</p>
              <p className="text-3xl font-bold text-navy mt-1 tabular-nums" data-testid="dashboard-net-total">{formatMoney(netTotal(accounts))}</p>
              <p className="text-xs text-muted mt-2">Bank account balances minus credit card and loan balances owing.</p>
            </Card>
            <Card testId="dashboard-quick-actions">
              <h2 className="font-bold text-navy mb-3">Quick actions</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[["Transfer", "/transfer", "quick-transfer"], ["e-Transfer", "/etransfer", "quick-etransfer"], ["Pay a bill", "/bills", "quick-pay-bill"],
                  ["Deposit", "/deposit", "quick-deposit"]].map(([l, h, t]) => (
                  <Link key={t} href={h} className="ib-btn ib-btn-secondary" data-testid={t}>{l}</Link>
                ))}
              </div>
            </Card>
            <RecentActivity accounts={accounts} />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountGroup({ title, accounts, ids, testId }: { title: string; accounts: Account[]; ids: Map<number, string>; testId: string }) {
  return (
    <section data-testid={testId}>
      <h2 className="font-bold text-navy mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {accounts.map((a) => {
          const owing = a.type === "CREDIT" || a.type === "LOAN";
          return (
            <Link key={a.id} href={`/accounts/${a.id}`} className="ib-card p-5 hover:border-glacier transition-colors block" data-testid={`account-card-${a.id}`} data-account-type={a.type}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-semibold text-ink" data-testid={`account-name-${a.id}`}>{a.displayName}</p>
                  <p className="text-xs text-muted" data-testid={`account-number-${a.id}`}>{ACCOUNT_LABEL[a.type]} · {a.accountNumber}</p>
                </div>
                {a.status !== "OPEN" && <StatusBadge status={a.status} testId={`account-status-${a.id}`} />}
              </div>
              <p className="text-xs text-muted mt-4">{owing ? "Balance owing" : "Balance"}</p>
              <p className="text-2xl font-bold text-navy tabular-nums" data-testid={`account-balance-${ids.get(a.id)}`}>
                {owing ? formatOwing(a.balance) : formatMoney(a.balance)}
              </p>
              {a.type === "CREDIT" && <p className="text-xs text-muted mt-1" data-testid={`account-available-credit-${a.id}`}>Available credit {formatMoney(a.availableCredit)}</p>}
              {(a.type === "CHEQUING" || a.type === "SAVINGS") && a.availableBalance !== a.balance && (
                <p className="text-xs text-warn mt-1" data-testid={`account-available-${a.id}`}>Available {formatMoney(a.availableBalance)}</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecentActivity({ accounts }: { accounts: Account[] }) {
  const first = accounts.find((a) => a.type === "CHEQUING") ?? accounts[0];
  const { data } = useApi<Page<Transaction>>(first ? `/accounts/${first.id}/transactions?size=5` : null);
  if (!first) return null;
  return (
    <Card testId="dashboard-recent-activity">
      <h2 className="font-bold text-navy mb-3">Recent activity <span className="text-muted font-normal text-sm">· {first.displayName}</span></h2>
      {!data ? <Spinner /> : data.content.length === 0 ? <p className="text-sm text-muted" data-testid="recent-activity-empty">No transactions yet.</p> : (
        <ul className="divide-y divide-line text-sm">
          {data.content.map((t) => (
            <li key={t.id} className="py-2 flex justify-between gap-3" data-testid={`recent-transaction-${t.id}`}>
              <span className="min-w-0"><span className="block truncate">{t.description}</span><span className="text-xs text-muted">{formatDate(t.createdAt)}</span></span>
              <span className={`tabular-nums whitespace-nowrap ${t.direction === "CREDIT" ? "text-success" : ""}`}>{t.direction === "DEBIT" ? "-" : "+"}{formatMoney(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
