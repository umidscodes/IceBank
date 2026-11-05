"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApi, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, Spinner, StatusBadge, TextField } from "@/ui/components";
import type { CustomerSummary } from "@/ui/admin/shared";

function CustomerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
  const [draft, setDraft] = useState(q);
  const { data, error, loading } = useApi<Page<CustomerSummary>>(`/admin/customers?page=${page}&size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);

  const go = (nq: string, np: number) => {
    const sp = new URLSearchParams();
    if (nq) sp.set("q", nq);
    if (np) sp.set("page", String(np));
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Search by name, email, phone or account number." />
      <Card testId="admin-customers-card">
        <form className="flex flex-wrap gap-3 items-end mb-4" role="search" data-testid="admin-customer-search-form"
          onSubmit={(e) => { e.preventDefault(); go(draft.trim(), 0); }}>
          <TextField id="q" label="Search customers" type="search" placeholder="e.g. tremblay, 416, 9990" className="flex-1 min-w-[260px]"
            testId="admin-customer-search-input" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" testId="admin-customer-search-button">Search</Button>
          <Button variant="secondary" testId="admin-customer-clear-button" onClick={() => { setDraft(""); go("", 0); }}>Clear</Button>
        </form>
        {error && <div className="mb-3"><Alert testId="admin-customers-error">{error}</Alert></div>}
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="ib-table" data-testid="admin-customers-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Status</th><th className="text-right">Accounts</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data?.content.map((c) => (
                <tr key={c.id} data-testid={`admin-customer-row-${c.id}`}>
                  <td className="font-semibold"><Link href={`/admin/customers/${c.id}`} className="ib-link" data-testid="admin-customer-name">{c.firstName} {c.lastName}</Link></td>
                  <td data-testid="admin-customer-email">{c.email}</td>
                  <td className="whitespace-nowrap" data-testid="admin-customer-phone">{c.phone}</td>
                  <td data-testid="admin-customer-city">{c.city}, {c.province}</td>
                  <td><StatusBadge status={c.userStatus} testId="admin-customer-status" /></td>
                  <td className="text-right tabular-nums" data-testid="admin-customer-account-count">{c.accountCount}</td>
                  <td className="text-right"><Link href={`/admin/customers/${c.id}`} className="ib-btn ib-btn-secondary !py-1 !px-3 text-sm" data-testid={`admin-customer-view-${c.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && <div className="py-6"><Spinner label="Searching" /></div>}
          {data && data.content.length === 0 && <EmptyState testId="admin-customers-empty">No customers match “{q}”.</EmptyState>}
        </div>
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={(p) => go(q, p)} testId="admin-customers-pagination" />}
      </Card>
    </div>
  );
}

export default function AdminCustomersPage() {
  return <Suspense fallback={<Spinner />}><CustomerSearch /></Suspense>;
}
