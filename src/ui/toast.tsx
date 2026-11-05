"use client";
/** Toasts auto-hide after 4 seconds (a classic explicit-wait challenge). */
import { createContext, useCallback, useContext, useState } from "react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; message: string }
const Ctx = createContext<(kind: Kind, message: string) => void>(() => {});

export const TOAST_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" aria-live="polite" data-testid="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            data-testid={`toast-${t.kind}`}
            className={`rounded-lg border px-4 py-3 shadow-lg text-sm font-medium flex gap-3 items-start ${
              t.kind === "success" ? "bg-success-bg border-success/30 text-success" : t.kind === "error" ? "bg-alert-bg border-alert/30 text-alert" : "bg-white border-line text-ink"}`}
          >
            <span aria-hidden className="mt-0.5">{t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}</span>
            <span data-testid="toast-message">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const show = useContext(Ctx);
  return {
    success: (m: string) => show("success", m),
    error: (m: string) => show("error", m),
    info: (m: string) => show("info", m),
  };
}
