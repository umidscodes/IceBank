"use client";
/**
 * Classic view (hard mode): an old-style online banking layout for the dashboard, transactions and
 * payees. No data-testid attributes, generated ids that change on every load, nested tables.
 * Use it to practise robust CSS and XPath locators.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccounts, useApi, type Account, type Page, type Transaction } from "./types";
import { formatDate, formatMoney, formatOwing, ACCOUNT_LABEL } from "./format";

/** A random id prefix, different on every page load. */
function useNoise(): (name: string) => string {
  const seed = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  return (name: string) => `c${seed}_${name}_${Math.floor(Math.random() * 1000)}`;
}

const table: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontFamily: "Verdana, Arial, sans-serif", fontSize: 12 };
const th: React.CSSProperties = { background: "#13315C", color: "#fff", textAlign: "left", padding: "4px 6px", border: "1px solid #0B2545" };
const td: React.CSSProperties = { padding: "4px 6px", border: "1px solid #c8d3df" };

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useNoise();
  return (
    <table id={id("frame")} style={{ ...table, background: "#fff", border: "2px solid #13315C" }} cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr><td id={id("title")} style={{ background: "#0B2545", color: "#fff", fontWeight: "bold", padding: "6px 8px", fontSize: 14 }}>{title}</td></tr>
        <tr><td style={{ padding: 8 }}>{children}</td></tr>
        <tr><td style={{ padding: "4px 8px", fontSize: 10, color: "#5B6B7C", borderTop: "1px solid #c8d3df" }}>
          Classic view. Switch back in <Link href="/profile" style={{ color: "#2F86BF" }}>Profile and security</Link>.
        </td></tr>
      </tbody>
    </table>
  );
}

export function ClassicDashboard() {
  const id = useNoise();
  const { data } = useAccounts();
  return (
    <Frame title="Account Summary">
      {!data ? <span>Loading...</span> : (
        <table id={id("summary")} style={table}>
          <tbody>
            <tr><th style={th}>Account</th><th style={th}>Number</th><th style={th}>Type</th><th style={{ ...th, textAlign: "right" }}>Balance</th><th style={th}>&nbsp;</th></tr>
            {data.map((a: Account, i) => (
              <tr key={a.id} id={id(`row${i}`)} style={{ background: i % 2 ? "#F5F9FC" : "#fff" }}>
                <td style={td}><table style={table}><tbody><tr><td><b>{a.displayName}</b></td></tr><tr><td style={{ fontSize: 10, color: "#666" }}>{a.status}</td></tr></tbody></table></td>
                <td style={td}>{a.accountNumber}</td>
                <td style={td}>{ACCOUNT_LABEL[a.type]}</td>
                <td style={{ ...td, textAlign: "right" }}><span id={id("bal")}>{a.type === "CREDIT" || a.type === "LOAN" ? `${formatOwing(a.balance)} owing` : formatMoney(a.balance)}</span></td>
                <td style={td}><Link id={id("view")} href={`/accounts/${a.id}`} style={{ color: "#2F86BF" }}>View</Link></td>
              </tr>
            ))}
            <tr><td style={{ ...td, fontWeight: "bold" }} colSpan={3}>Total</td>
              <td style={{ ...td, textAlign: "right", fontWeight: "bold" }}>{formatMoney((data.reduce((s, a) => s + Math.round(Number(a.balance) * 100), 0) / 100).toFixed(2))}</td><td style={td} /></tr>
          </tbody>
        </table>
      )}
    </Frame>
  );
}

export function ClassicTransactions({ account }: { account: Account }) {
  const id = useNoise();
  const [page, setPage] = useState(0);
  const { data } = useApi<Page<Transaction>>(`/accounts/${account.id}/transactions?page=${page}&size=25`);
  return (
    <Frame title={`Account History - ${account.displayName} (${account.accountNumber})`}>
      <table style={table}><tbody><tr>
        <td>Balance: <b>{formatMoney(account.balance)}</b></td>
        <td style={{ textAlign: "right" }}><Link href="/dashboard" style={{ color: "#2F86BF" }}>&laquo; Back to summary</Link></td>
      </tr></tbody></table>
      <br />
      {!data ? <span>Loading...</span> : (
        <table id={id("history")} style={table}>
          <tbody>
            <tr><th style={th}>Date</th><th style={th}>Details</th><th style={{ ...th, textAlign: "right" }}>Debit</th><th style={{ ...th, textAlign: "right" }}>Credit</th><th style={{ ...th, textAlign: "right" }}>Balance</th></tr>
            {data.content.map((t, i) => (
              <tr key={t.id} id={id(`tx${i}`)} style={{ background: i % 2 ? "#F5F9FC" : "#fff" }}>
                <td style={td}>{formatDate(t.createdAt)}</td>
                <td style={td}><table style={table}><tbody><tr><td>{t.description}</td></tr><tr><td style={{ fontSize: 10, color: "#666" }}>Ref {t.referenceId} &middot; {t.status}</td></tr></tbody></table></td>
                <td style={{ ...td, textAlign: "right" }}>{t.direction === "DEBIT" ? formatMoney(t.amount) : ""}</td>
                <td style={{ ...td, textAlign: "right" }}>{t.direction === "CREDIT" ? formatMoney(t.amount) : ""}</td>
                <td style={{ ...td, textAlign: "right" }}>{t.balanceAfter ? formatMoney(t.balanceAfter) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && (
        <table style={{ ...table, marginTop: 6 }}><tbody><tr>
          <td>Page {data.page + 1} of {Math.max(1, data.totalPages)}</td>
          <td style={{ textAlign: "right" }}>
            <input type="button" id={id("prev")} value="< Prev" disabled={page === 0} onClick={() => setPage(page - 1)} />{" "}
            <input type="button" id={id("next")} value="Next >" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)} />
          </td>
        </tr></tbody></table>
      )}
    </Frame>
  );
}

interface Payee { id: number; billerName: string; nickname: string | null; accountNumber: string; category: string }

export function ClassicPayees() {
  const id = useNoise();
  const { data } = useApi<Payee[]>("/payees");
  return (
    <Frame title="Bill Payees">
      {!data ? <span>Loading...</span> : (
        <table id={id("payees")} style={table}>
          <tbody>
            <tr><th style={th}>Payee</th><th style={th}>Nickname</th><th style={th}>Account #</th><th style={th}>Category</th><th style={th}>&nbsp;</th></tr>
            {data.map((p, i) => (
              <tr key={p.id} id={id(`p${i}`)} style={{ background: i % 2 ? "#F5F9FC" : "#fff" }}>
                <td style={td}><b>{p.billerName}</b></td><td style={td}>{p.nickname ?? "-"}</td><td style={td}>{p.accountNumber}</td><td style={td}>{p.category}</td>
                <td style={td}><Link id={id("pay")} href={`/bills?payee=${p.id}`} style={{ color: "#2F86BF" }}>Pay</Link></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td style={td} colSpan={5}>No payees.</td></tr>}
          </tbody>
        </table>
      )}
    </Frame>
  );
}
