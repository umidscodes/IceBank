"use client";
import { useState } from "react";
import { api, ApiProblem } from "@/ui/api";
import { useApi, type Page } from "@/ui/types";
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, Spinner } from "@/ui/components";
import { formatDateTime, humanize } from "@/ui/format";
import { useSession } from "@/ui/session";
import { useToast } from "@/ui/toast";
import type { Notification } from "@/ui/services/banking";

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const toast = useToast();
  const { refreshUnread } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const { data, error, reload, setData } = useApi<Page<Notification> & { unreadCount: number }>(
    `/notifications?unread=${filter === "unread"}&page=${page}&size=20`);

  async function markRead(n: Notification) {
    setBusy(n.id);
    try {
      const updated = await api<Notification>(`/notifications/${n.id}/read`, { method: "POST" });
      setData((d) => d ? { ...d, unreadCount: Math.max(0, d.unreadCount - 1), content: d.content.map((x) => (x.id === n.id ? updated : x)) } : d);
      refreshUnread();
      toast.success("Notification marked as read.");
      if (filter === "unread") reload();
    } catch (err) {
      toast.error(err instanceof ApiProblem ? err.message : "Could not mark the notification as read.");
    } finally { setBusy(null); }
  }

  const tab = (f: Filter, label: string) => (
    <button type="button" role="tab" aria-selected={filter === f} data-testid={`notifications-filter-${f}`}
      onClick={() => { setFilter(f); setPage(0); }}
      className={`px-4 py-2 text-sm font-semibold rounded-md ${filter === f ? "bg-navy text-white" : "text-navy hover:bg-[#EEF4F9]"}`}>{label}</button>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" subtitle="Money movement, sign-ins and security changes on your profile."
        actions={data ? <span className="text-sm text-muted self-center" data-testid="notifications-unread-count">{data.unreadCount} unread</span> : undefined} />
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Filter notifications">
        {tab("all", "All")}
        {tab("unread", "Unread only")}
      </div>
      {error && <Alert testId="notifications-error">{error}</Alert>}
      {!data && !error && <Spinner label="Loading notifications" />}
      {data && (
        <Card testId="notifications-card" className="!p-0">
          {data.content.length === 0 ? (
            <EmptyState testId="notifications-empty">{filter === "unread" ? "You're all caught up. No unread notifications." : "You have no notifications."}</EmptyState>
          ) : (
            <ul data-testid="notifications-list">
              {data.content.map((n) => (
                <li key={n.id} data-testid={`notification-row-${n.id}`} data-read={n.readAt ? "true" : "false"}
                  className={`flex gap-4 items-start px-6 py-4 border-b border-line last:border-b-0 ${n.readAt ? "" : "bg-[#F3F8FC]"}`}>
                  <span className={`mt-2 h-2.5 w-2.5 rounded-full shrink-0 ${n.readAt ? "bg-transparent" : "bg-glacier"}`} aria-hidden />
                  <div className="flex-1">
                    <p className={`text-navy ${n.readAt ? "font-medium" : "font-bold"}`} data-testid="notification-title">{n.title}</p>
                    <p className="text-sm" data-testid="notification-body">{n.body}</p>
                    <p className="text-xs text-muted mt-1">
                      <span data-testid="notification-type">{humanize(n.type)}</span> · <span data-testid="notification-date">{formatDateTime(n.createdAt)}</span>
                      {!n.readAt && <span className="sr-only"> · Unread</span>}
                    </p>
                  </div>
                  {!n.readAt && (
                    <Button variant="secondary" testId={`notification-mark-read-${n.id}`} disabled={busy === n.id} onClick={() => markRead(n)}>Mark as read</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} testId="notifications-pagination" />
      )}
    </div>
  );
}
