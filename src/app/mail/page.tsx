"use client";
/** Ice Mail: the simulated email inbox. Opens in its own tab. Uses the sandbox key + email, like an automated test would. */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/ui/components";
import { formatDateTime } from "@/ui/format";

interface Msg { id: number; to: string; from: string; kind: string; subject: string; body: string; otpCode: string | null; link: string | null; createdAt: string; read: boolean }
const DEFAULT_KEY = "ICEBANK-LOCAL-KEY";

function load(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function Inbox() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sandboxKey, setSandboxKey] = useState(DEFAULT_KEY);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [selected, setSelected] = useState<Msg | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(params.get("email") ?? load("icemail-email", ""));
    setSandboxKey(load("icemail-key", DEFAULT_KEY));
  }, [params]);

  const refresh = useCallback(async (addr = email) => {
    if (!addr) return;
    setError(null);
    const res = await fetch(`/api/v1/inbox?email=${encodeURIComponent(addr)}&size=50`, { headers: { "X-Sandbox-Key": sandboxKey } });
    const data = await res.json();
    if (!res.ok) { setError(data.detail ?? "Could not open this inbox."); setMessages(null); return; }
    setMessages(data.content);
    save("icemail-email", addr);
    save("icemail-key", sandboxKey);
  }, [email, sandboxKey]);

  useEffect(() => { if (email) refresh(email); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(m: Msg) {
    const res = await fetch(`/api/v1/inbox/${m.id}?email=${encodeURIComponent(email)}`, { headers: { "X-Sandbox-Key": sandboxKey } });
    if (res.ok) {
      const full: Msg = await res.json();
      setSelected(full);
      setMessages((list) => list?.map((x) => (x.id === full.id ? full : x)) ?? null);
    }
  }

  return (
    <div className="min-h-screen bg-frost">
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Logo size={26} /><span className="font-bold text-glacier-600" data-testid="icemail-title">Ice Mail</span>
          <span className="text-xs text-muted">Test inbox. Every message Ice Bank "emails" lands here.</span>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <form className="ib-card p-4 flex flex-wrap gap-3 items-end mb-4" data-testid="icemail-form" onSubmit={(e) => { e.preventDefault(); setSelected(null); refresh(); }}>
          <div className="flex-1 min-w-[260px]">
            <label className="ib-label" htmlFor="mailbox">Email address</label>
            <input id="mailbox" className="ib-input" type="email" placeholder="emma.tremblay@icebank.test" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="icemail-email-input" />
          </div>
          <div className="w-56">
            <label className="ib-label" htmlFor="sandboxKey">Sandbox key</label>
            <input id="sandboxKey" className="ib-input" value={sandboxKey} onChange={(e) => setSandboxKey(e.target.value)} data-testid="icemail-key-input" />
          </div>
          <button type="submit" className="ib-btn ib-btn-primary" data-testid="icemail-open-button">Open inbox</button>
          <button type="button" className="ib-btn ib-btn-secondary" onClick={() => refresh()} data-testid="icemail-refresh-button">Refresh</button>
        </form>
        {error && <div className="mb-4 rounded-lg border border-alert/30 bg-alert-bg text-alert px-4 py-3 text-sm" role="alert" data-testid="icemail-error">{error}</div>}
        {messages && (
          <div className="grid md:grid-cols-5 gap-4">
            <ul className="ib-card md:col-span-2 divide-y divide-line overflow-hidden" data-testid="icemail-list">
              {messages.length === 0 && <li className="p-6 text-sm text-muted" data-testid="icemail-empty">No messages yet.</li>}
              {messages.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => open(m)} data-testid={`icemail-message-${m.id}`} data-kind={m.kind}
                    className={`w-full text-left p-4 hover:bg-frost ${selected?.id === m.id ? "bg-[#E8F2FA]" : ""}`}>
                    <div className="flex justify-between gap-2 text-xs text-muted"><span>{m.from}</span><span>{formatDateTime(m.createdAt)}</span></div>
                    <p className={`text-sm mt-1 ${m.read ? "text-ink" : "font-bold text-navy"}`} data-testid="icemail-message-subject">{m.subject}</p>
                  </button>
                </li>
              ))}
            </ul>
            <article className="ib-card md:col-span-3 p-6 min-h-[300px]" data-testid="icemail-reader">
              {!selected ? <p className="text-muted text-sm">Select a message to read it.</p> : (
                <>
                  <h1 className="text-lg font-bold text-navy" data-testid="icemail-reader-subject">{selected.subject}</h1>
                  <p className="text-xs text-muted mt-1">From {selected.from} to {selected.to} · {formatDateTime(selected.createdAt)}</p>
                  {selected.otpCode && (
                    <p className="mt-5 text-3xl font-bold tracking-[0.3em] text-navy" data-testid="icemail-otp-code">{selected.otpCode}</p>
                  )}
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-6" data-testid="icemail-reader-body">{selected.body}</p>
                  {selected.link && <a href={selected.link} className="ib-btn ib-btn-primary mt-5" data-testid="icemail-reader-link">Open link</a>}
                </>
              )}
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MailPage() {
  return <Suspense><Inbox /></Suspense>;
}
