"use client";
/** App shells: top navigation with hover sub-menus, notifications bell, user menu, footer. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./components";
import { logout } from "./api";
import { SessionProvider, useSession } from "./session";
import { ToastProvider } from "./toast";

interface NavItem { label: string; href: string; testId: string; newTab?: boolean }
interface NavGroup { label: string; testId: string; items: NavItem[]; href?: string }

const CUSTOMER_NAV: NavGroup[] = [
  { label: "Accounts", testId: "nav-menu-accounts", items: [
    { label: "Overview", href: "/dashboard", testId: "nav-link-dashboard" },
    { label: "Statements", href: "/statements", testId: "nav-link-statements" },
    { label: "Disputes", href: "/disputes", testId: "nav-link-disputes" },
  ] },
  { label: "Move money", testId: "nav-menu-move-money", items: [
    { label: "Transfer between my accounts", href: "/transfer", testId: "nav-link-transfer" },
    { label: "Send Interac e-Transfer", href: "/etransfer", testId: "nav-link-etransfer-send" },
    { label: "Received e-Transfers", href: "/etransfer/received", testId: "nav-link-etransfer-received" },
    { label: "e-Transfer contacts", href: "/etransfer/contacts", testId: "nav-link-etransfer-contacts" },
    { label: "Autodeposit", href: "/etransfer/autodeposit", testId: "nav-link-etransfer-autodeposit" },
  ] },
  { label: "Pay bills", testId: "nav-menu-bills", items: [
    { label: "Pay a bill", href: "/bills", testId: "nav-link-bills-pay" },
    { label: "Payees", href: "/bills/payees", testId: "nav-link-bills-payees" },
    { label: "Scheduled payments", href: "/bills/scheduled", testId: "nav-link-bills-scheduled" },
  ] },
  { label: "Deposit", testId: "nav-menu-deposit", href: "/deposit", items: [] },
  { label: "Cards", testId: "nav-menu-cards", href: "/cards", items: [] },
  { label: "Loans", testId: "nav-menu-loans", items: [
    { label: "My loans", href: "/loans", testId: "nav-link-loans" },
    { label: "Apply for a loan", href: "/loans/apply", testId: "nav-link-loans-apply" },
  ] },
];

const ADMIN_NAV: NavGroup[] = [
  { label: "Customers", testId: "nav-menu-admin-customers", href: "/admin", items: [] },
  { label: "Deposit approvals", testId: "nav-menu-admin-deposits", href: "/admin/deposits", items: [] },
  { label: "Loan reviews", testId: "nav-menu-admin-loans", href: "/admin/loans", items: [] },
  { label: "Audit log", testId: "nav-menu-admin-audit", href: "/admin/audit", items: [] },
];

function TopNav({ nav }: { nav: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-stretch gap-1" data-testid="main-nav">
      {nav.map((g) => {
        const active = g.href ? path === g.href || (g.href !== "/admin" && path.startsWith(g.href + "/")) : g.items.some((i) => path === i.href || path.startsWith(i.href + "/"));
        const cls = `px-3 py-2 rounded-md text-sm font-semibold ${active ? "bg-white/15 text-white" : "text-[#cfe4f5] hover:text-white hover:bg-white/10"}`;
        if (g.items.length === 0) return <Link key={g.label} href={g.href!} className={cls} data-testid={g.testId}>{g.label}</Link>;
        return (
          <div key={g.label} className="relative group" data-testid={`${g.testId}-wrapper`}>
            <button type="button" className={`${cls} inline-flex items-center gap-1`} aria-haspopup="true" data-testid={g.testId}>
              {g.label} <span aria-hidden className="text-xs">▾</span>
            </button>
            <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-40" data-testid={`${g.testId}-dropdown`}>
              <ul className="ib-card py-2 min-w-[250px]" role="menu">
                {g.items.map((i) => (
                  <li key={i.href} role="none">
                    <Link role="menuitem" href={i.href} className="block px-4 py-2 text-sm text-ink hover:bg-frost" data-testid={i.testId}>{i.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function HeaderRight({ admin }: { admin: boolean }) {
  const { me, unread, refreshUnread } = useSession();
  const path = usePathname();
  useEffect(() => { refreshUnread(); }, [path, refreshUnread]);
  const name = me.firstName ? `${me.firstName} ${me.lastName}` : me.email;
  return (
    <div className="flex items-center gap-2">
      <a href="/mail" target="_blank" rel="noopener" className="px-3 py-2 text-sm font-semibold text-[#cfe4f5] hover:text-white" data-testid="nav-link-icemail">Ice Mail ↗</a>
      {!admin && (
        <Link href="/notifications" className="relative px-3 py-2 text-[#cfe4f5] hover:text-white" aria-label={`Notifications, ${unread} unread`} data-testid="nav-notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          {unread > 0 && <span className="absolute -top-0.5 right-0.5 bg-alert text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center" data-testid="nav-notifications-count">{unread}</span>}
        </Link>
      )}
      <div className="relative group" data-testid="user-menu-wrapper">
        <button type="button" className="px-3 py-2 rounded-md text-sm font-semibold text-white hover:bg-white/10 inline-flex items-center gap-2" aria-haspopup="true" data-testid="user-menu">
          <span className="h-7 w-7 rounded-full bg-glacier text-navy flex items-center justify-center text-xs font-bold" aria-hidden>
            {(me.firstName?.[0] ?? me.email[0]).toUpperCase()}{(me.lastName?.[0] ?? "").toUpperCase()}
          </span>
          <span data-testid="user-menu-name">{name}</span> <span aria-hidden className="text-xs">▾</span>
        </button>
        <div className="absolute right-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-40" data-testid="user-menu-dropdown">
          <ul className="ib-card py-2 min-w-[220px]" role="menu">
            {!admin && <li role="none"><Link role="menuitem" href="/profile" className="block px-4 py-2 text-sm hover:bg-frost" data-testid="nav-link-profile">Profile and security</Link></li>}
            <li role="none"><a role="menuitem" href="/swagger" target="_blank" rel="noopener" className="block px-4 py-2 text-sm hover:bg-frost" data-testid="nav-link-swagger">API (Swagger) ↗</a></li>
            <li role="none"><button role="menuitem" type="button" onClick={() => logout()} className="block w-full text-left px-4 py-2 text-sm hover:bg-frost text-alert" data-testid="nav-signout">Sign out</button></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line mt-16 py-6 text-xs text-muted" data-testid="site-footer">
      <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between gap-3">
        <span>© 2026 Ice Bank. A fictional bank built for software testing practice. Not a real financial institution.</span>
        <span className="flex gap-4"><a href="/swagger" className="hover:underline">API</a><a href="/mail" target="_blank" rel="noopener" className="hover:underline">Ice Mail</a></span>
      </div>
    </footer>
  );
}

function Shell({ nav, admin, children }: { nav: NavGroup[]; admin: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-navy" data-testid="site-header">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href={admin ? "/admin" : "/dashboard"} aria-label="Ice Bank home" data-testid="nav-home"><Logo light size={30} /></Link>
            {admin && <span className="ib-badge bg-glacier text-navy" data-testid="admin-badge">TELLER PORTAL</span>}
            <TopNav nav={nav} />
          </div>
          <HeaderRight admin={admin} />
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8" data-testid="main-content">{children}</main>
      <Footer />
    </div>
  );
}

export function BankShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider role="CUSTOMER"><Shell nav={CUSTOMER_NAV} admin={false}>{children}</Shell></SessionProvider>
    </ToastProvider>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider role="ADMIN"><Shell nav={ADMIN_NAV} admin>{children}</Shell></SessionProvider>
    </ToastProvider>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  // Render page content only once React is running in the browser. Otherwise a fast test could
  // type into (or submit) the server-rendered form before its handlers are attached, and a native
  // submit would put the email and password in the URL.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-line" data-testid="site-header">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" aria-label="Ice Bank home" data-testid="nav-home"><Logo size={30} /></Link>
            <div className="flex items-center gap-3">
              <a href="/mail" target="_blank" rel="noopener" className="text-sm font-semibold text-glacier-600 hover:underline" data-testid="nav-link-icemail">Ice Mail ↗</a>
              <Link href="/login" className="ib-btn ib-btn-secondary" data-testid="nav-signin">Sign in</Link>
              <Link href="/register" className="ib-btn ib-btn-primary" data-testid="nav-open-account">Open an account</Link>
            </div>
          </div>
        </header>
        <main className="flex-1" data-testid="main-content" data-ready={ready}>{ready ? children : null}</main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
