/** Fixed-window rate limits: login 10/min per IP, everything else 120/min per user (or IP). */
const windows = new Map<string, { start: number; count: number }>();

export const LIMITS = { login: 10, default: 120 } as const;

export function perfMode(): boolean {
  return process.env.PERF_MODE === "true";
}

/** Returns seconds to wait if the limit is exceeded, otherwise null. */
export function hit(bucket: string, limit: number, now = Date.now()): number | null {
  if (perfMode()) return null;
  const w = windows.get(bucket);
  if (!w || now - w.start >= 60000) {
    windows.set(bucket, { start: now, count: 1 });
    if (windows.size > 20000) for (const [k, v] of windows) if (now - v.start >= 60000) windows.delete(k);
    return null;
  }
  w.count++;
  if (w.count > limit) return Math.max(1, Math.ceil((w.start + 60000 - now) / 1000));
  return null;
}

/** Clears all counters (used by reset so tests start clean). */
export function clearRateLimits() {
  windows.clear();
}
