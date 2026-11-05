"use client";
/** Signed-in session: profile context, idle timeout (warning at 9 min, sign-out at 10 min). */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, logout } from "./api";
import { Button, Modal } from "./components";

export interface Profile {
  userId: number; customerId: number | null; email: string; role: "CUSTOMER" | "ADMIN" | "INSTRUCTOR";
  firstName: string | null; lastName: string | null; phone: string | null; dateOfBirth: string | null;
  address: { line1: string; line2: string | null; city: string; province: string; postalCode: string } | null;
  sinLast3: string | null; classicView: boolean; lastLoginAt: string | null; createdAt: string;
}

interface SessionCtx { me: Profile; reload: () => Promise<void>; unread: number; refreshUnread: () => void }
const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

/** Idle limits. Testers may shorten them with localStorage keys icebank-idle-warning-seconds / icebank-idle-logout-seconds. */
function idleLimits() {
  let warn = 9 * 60, out = 10 * 60;
  try {
    const w = Number(localStorage.getItem("icebank-idle-warning-seconds"));
    const o = Number(localStorage.getItem("icebank-idle-logout-seconds"));
    if (w > 0) warn = w;
    if (o > 0) out = o;
  } catch { /* storage unavailable */ }
  return { warn, out: Math.max(out, warn + 1) };
}

export function SessionProvider({ children, role }: { children: React.ReactNode; role: "CUSTOMER" | "ADMIN" }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [unread, setUnread] = useState(0);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const last = useRef(Date.now());

  const reload = useCallback(async () => { setMe(await api<Profile>("/me")); }, []);
  const refreshUnread = useCallback(() => {
    api<{ unreadCount: number }>("/notifications?size=1").then((r) => setUnread(r.unreadCount)).catch(() => {});
  }, []);

  useEffect(() => { reload().catch(() => {}); refreshUnread(); }, [reload, refreshUnread]);

  useEffect(() => {
    if (me && me.role !== role) window.location.href = me.role === "ADMIN" ? "/admin" : "/dashboard";
  }, [me, role]);

  useEffect(() => {
    const bump = () => { if (!warningRef.current) last.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      const { warn, out } = idleLimits();
      const idle = (Date.now() - last.current) / 1000;
      if (idle >= out) { clearInterval(timer); logoutForTimeout(); return; }
      if (idle >= warn) { setWarning(true); setSecondsLeft(Math.ceil(out - idle)); }
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, []);
  const warningRef = useRef(false);
  warningRef.current = warning;

  const stay = async () => {
    try { await api("/auth/refresh", { method: "POST", body: {} }); } catch { /* handled by api() */ }
    last.current = Date.now();
    setWarning(false);
  };

  if (!me) {
    return <div className="min-h-screen flex items-center justify-center text-muted" data-testid="session-loading">Loading your banking…</div>;
  }
  return (
    <Ctx.Provider value={{ me, reload, unread, refreshUnread }}>
      {children}
      <Modal open={warning} title="Are you still there?" testId="session-timeout-modal"
        footer={<>
          <Button variant="secondary" testId="session-timeout-signout-button" onClick={() => logout()}>Sign out</Button>
          <Button testId="session-timeout-stay-button" onClick={stay}>Stay signed in</Button>
        </>}>
        <p>For your security, you will be signed out in <strong data-testid="session-timeout-countdown">{secondsLeft}</strong> seconds because you have been inactive.</p>
      </Modal>
    </Ctx.Provider>
  );
}

async function logoutForTimeout() {
  try { await api("/auth/logout", { method: "POST", noAuthRedirect: true }); } catch { /* ignore */ }
  window.location.href = "/login?timeout=1";
}
