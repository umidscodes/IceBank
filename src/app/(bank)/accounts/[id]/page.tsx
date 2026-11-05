"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { useSession } from "@/ui/session";
import { useApi, type Account, type Page, type Transaction } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, SelectField, Spinner, StatusBadge, TextField } from "@/ui/components";
import { formatDateTime, formatMoney, formatOwing, ACCOUNT_LABEL, humanize } from "@/ui/format";
import { ClassicTransactions } from "@/ui/classic";
import { filterQuery } from "@/ui/account-math";

const TYPES = ["TRANSFER", "ETRANSFER", "BILL_PAYMENT", "CHEQUE_DEPOSIT", "INTEREST", "PURCHASE", "PAYROLL", "LOAN_DISBURSEMENT", "LOAN_PAYMENT",
  "REVERSAL", "ATM", "CARD_PAYMENT", "PREAUTHORIZED_DEBIT", "ADJUSTMENT"];

type Filters = { from: string; to: string; type: string; minAmount: string; maxAmount: string; q: string };
const EMPTY: Filters = { from: "", to: "", type: "", minAmount: "", maxAmount: "", q: "" };
type SortField = "createdAt" | "amount" | "description" | "type";


export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useSession();
  const { data: account, error } = useApi<Account>(`/accounts/${id}`);
  if (error) return <Alert testId="account-error">{error}</Alert>;
  if (!account) return <Spinner label="Loading account" />;
  if (me.classicView) return <ClassicTransactions account={account} />;
  const owing = account.type === "CREDIT" || account.type === "LOAN";
  return (
    <div>
      <nav className="text-sm mb-3" aria-label="Breadcrumb"><Link href="/dashboard" className="ib-link" data-testid="breadcrumb-dashboard">Accounts</Link> <span className="text-muted">/ {account.displayName}</span></nav>
      <PageHeader title={account.displayName} subtitle={`${ACCOUNT_LABEL[account.type]} · ${account.accountNumber}`} testId="account-title"
        actions={account.status !== "OPEN" ? <StatusBadge status={account.status} testId="account-status" /> : undefined} />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card testId="account-balance-card">
          <p className="text-sm text-muted">{owing ? "Balance owing" : "Current balance"}</p>
          <p className="text-2xl font-bold text-navy tabular-nums" data-testid="account-detail-balance">{owing ? formatOwing(account.balance) : formatMoney(account.balance)}</p>
        </Card>
        {account.type === "CREDIT" ? (<>
          <Card><p className="text-sm text-muted">Available credit</p><p className="text-2xl font-bold tabular-nums" data-testid="account-detail-available-credit">{formatMoney(account.availableCredit)}</p>
            <p className="text-xs text-muted mt-1">Limit {formatMoney(account.creditLimit)} · APR {account.interestRate}%</p></Card>
          <Card><p className="text-sm text-muted">Minimum payment</p><p className="text-2xl font-bold tabular-nums" data-testid="account-detail-minimum-payment">{formatMoney(account.minimumPayment)}</p>
            <p className="text-xs text-muted mt-1">Greater of $10.00 or 3% of the balance</p></Card>
        </>) : (<>
          <Card><p className="text-sm text-muted">Available balance</p><p className="text-2xl font-bold tabular-nums" data-testid="account-detail-available">{owing ? "-" : formatMoney(account.availableBalance)}</p></Card>
          <Card><p className="text-sm text-muted">{account.interestRate ? "Interest rate" : "Status"}</p>
            <p className="text-2xl font-bold" data-testid="account-detail-rate">{account.interestRate ? `${account.interestRate}%` : humanize(account.status)}</p></Card>
        </>)}
      </div>
      <TransactionsTable account={account} />
    </div>
  );
}

function TransactionsTable({ account }: { account: Account }) {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "createdAt", dir: "desc" });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState<Page<Transaction> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filterQuery(filters);
      setData(await api<Page<Transaction>>(`/accounts/${account.id}/transactions?page=${page}&size=${size}&sort=${sort.field},${sort.dir}${q ? `&${q}` : ""}`));
      setErrors({});
      setError(null);
    } catch (e) {
      if (e instanceof ApiProblem) { setErrors(e.fieldErrors()); setError(e.errors.length ? "Check the filters." : e.message); }
    } finally {
      setLoading(false);
    }
  }, [account.id, filters, page, size, sort]);
  useEffect(() => { load(); }, [load]);

  const toggleSort = (field: SortField) => {
    setPage(0);
    setSort((s) => ({ field, dir: s.field === field && s.dir === "desc" ? "asc" : s.field === field ? "desc" : field === "createdAt" || field === "amount" ? "desc" : "asc" }));
  };
  const header = (field: SortField, label: string, right = false) => (
    <th className={right ? "text-right" : ""} aria-sort={sort.field === field ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 hover:text-navy" data-testid={`transactions-sort-${field}`}>
        {label} <span aria-hidden className="text-xs">{sort.field === field ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
  const csvHref = `/api/v1/accounts/${account.id}/transactions.csv${filterQuery(filters) ? `?${filterQuery(filters)}` : ""}`;

  return (
    <Card testId="transactions-card">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="font-bold text-navy text-lg">Transactions</h2>
        <div className="flex gap-2">
          <a href={csvHref} download className="ib-btn ib-btn-secondary" data-testid="transactions-download-csv">Download CSV</a>
          <Link href={`/statements?account=${account.id}`} className="ib-btn ib-btn-secondary" data-testid="transactions-statements-link">Statements</Link>
        </div>
      </div>
      <form className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4 items-end" data-testid="transactions-filter-form"
        onSubmit={(e) => { e.preventDefault(); setPage(0); setFilters(draft); }}>
        <TextField id="from" label="From" type="date" testId="filter-from-input" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} error={errors.from} />
        <TextField id="to" label="To" type="date" testId="filter-to-input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} error={errors.to} />
        <SelectField id="type" label="Type" testId="filter-type-select" placeholder="All types" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}
          options={TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
        <TextField id="minAmount" label="Min amount" inputMode="decimal" testId="filter-min-amount-input" value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} error={errors.minAmount} />
        <TextField id="maxAmount" label="Max amount" inputMode="decimal" testId="filter-max-amount-input" value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} error={errors.maxAmount} />
        <TextField id="q" label="Search" placeholder="Description" testId="filter-search-input" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
          <Button type="submit" testId="filter-apply-button">Apply filters</Button>
          <Button variant="secondary" testId="filter-clear-button" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(0); }}>Clear</Button>
          <span className="ml-auto flex items-center gap-2 text-sm">
            <label htmlFor="pageSize" className="text-muted">Rows</label>
            <select id="pageSize" className="ib-input !w-auto" data-testid="transactions-page-size" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </div>
      </form>
      {error && <div className="mb-3"><Alert testId="transactions-error">{error}</Alert></div>}
      <div className="overflow-x-auto relative" aria-busy={loading}>
        <table className="ib-table" data-testid="transactions-table">
          <thead><tr>{header("createdAt", "Date")}{header("description", "Description")}{header("type", "Type")}<th>Status</th>{header("amount", "Amount", true)}<th className="text-right">Balance</th></tr></thead>
          <tbody>
            {data?.content.map((t) => (
              <tr key={t.id} data-testid={`transaction-row-${t.id}`}>
                <td className="whitespace-nowrap" data-testid="transaction-date">{formatDateTime(t.createdAt)}</td>
                <td data-testid="transaction-description">{t.description}<span className="block text-xs text-muted">{t.referenceId}</span></td>
                <td className="whitespace-nowrap" data-testid="transaction-type">{humanize(t.type)}</td>
                <td><StatusBadge status={t.status} testId="transaction-status" /></td>
                <td className={`text-right tabular-nums whitespace-nowrap ${t.direction === "CREDIT" ? "text-success" : ""}`} data-testid="transaction-amount">
                  {t.direction === "DEBIT" ? "-" : "+"}{formatMoney(t.amount)}
                </td>
                <td className="text-right tabular-nums whitespace-nowrap text-muted" data-testid="transaction-balance">{t.balanceAfter ? formatMoney(t.balanceAfter) : "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <div className="py-6"><Spinner /></div>}
        {data && data.content.length === 0 && <EmptyState testId="transactions-empty">No transactions match these filters.</EmptyState>}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="transactions-pagination" />}
    </Card>
  );
}
