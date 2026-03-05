/**
 * Client-side dev overrides for testing: simulate storage almost full,
 * unlimited API usage. Only applied when flags are set (Settings → Developer).
 * Used by HomePage and any UI that shows storage/usage.
 */

const STORAGE_SIMULATE_FULL_KEY = "ihostmc-dev-simulate-storage-full";
const USAGE_UNLIMITED_KEY = "ihostmc-dev-usage-unlimited";

function getBool(key: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(key) === "true";
}

function setBool(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) localStorage.setItem(key, "true");
  else localStorage.removeItem(key);
}

export function getDevStorageSimulateFull(): boolean {
  return getBool(STORAGE_SIMULATE_FULL_KEY);
}

const DEV_OVERRIDES_EVENT = "ihostmc-dev-overrides-change";

export function setDevStorageSimulateFull(value: boolean): void {
  setBool(STORAGE_SIMULATE_FULL_KEY, value);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEV_OVERRIDES_EVENT));
}

export function getDevUsageUnlimited(): boolean {
  return getBool(USAGE_UNLIMITED_KEY);
}

export function setDevUsageUnlimited(value: boolean): void {
  setBool(USAGE_UNLIMITED_KEY, value);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEV_OVERRIDES_EVENT));
}

/** Subscribe to dev override changes (e.g. from Settings → Developer). */
export function subscribeDevOverrides(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DEV_OVERRIDES_EVENT, listener);
  return () => window.removeEventListener(DEV_OVERRIDES_EVENT, listener);
}

/**
 * When dev "simulate storage full" is on, return display values as if
 * storage is at 98% of limit. Pass through real values when off.
 */
export function applyStorageDevOverride(
  used: number,
  limit: number | null
): { displayUsed: number; displayLimit: number | null; displayPct: number | null } {
  if (!getDevStorageSimulateFull()) {
    const pct =
      limit != null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
    return { displayUsed: used, displayLimit: limit, displayPct: pct };
  }
  if (limit == null || limit <= 0) {
    const fakeLimit = 10 * 1024 * 1024 * 1024;
    const fakeUsed = Math.round(fakeLimit * 0.98);
    return { displayUsed: fakeUsed, displayLimit: fakeLimit, displayPct: 98 };
  }
  const displayUsed = Math.round(limit * 0.98);
  return { displayUsed, displayLimit: limit, displayPct: 98 };
}
