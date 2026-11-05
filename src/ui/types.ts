"use client";
/** API response types used by the UI (mirrors the OpenAPI schemas) and small data hooks. */
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface Page<T> { content: T[]; page: number; size: number; totalElements: number; totalPages: number }

export interface Account {
  id: number; accountNumber: string; type: "CHEQUING" | "SAVINGS" | "CREDIT" | "LOAN"; displayName: string; nickname: string | null;
  currency: "CAD"; balance: string; availableBalance: string; status: "OPEN" | "FROZEN" | "CLOSED"; creditLimit: string | null;
  availableCredit: string | null; minimumPayment: string | null; interestRate: string | null; openedAt: string;
}

export interface Transaction {
  id: number; accountId: number; direction: "DEBIT" | "CREDIT"; amount: string; balanceAfter: string | null;
  status: "PENDING" | "POSTED" | "REVERSED"; type: string; description: string; referenceId: string; createdAt: string; postedAt: string | null;
}

/** Load something from the API with loading/error state and a reload function. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function useAccounts() {
  return useApi<Account[]>("/accounts");
}

/** Label used in account dropdowns: "Chequing 7919 - $5,703.95". */
export function accountOption(a: Account, money: (v: string) => string) {
  const bal = a.type === "CREDIT" ? `${money(a.availableCredit ?? "0")} available` : money(a.availableBalance);
  return { value: String(a.id), label: `${a.displayName} - ${bal}${a.status === "FROZEN" ? " (frozen)" : ""}` };
}
