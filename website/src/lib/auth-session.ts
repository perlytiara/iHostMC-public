/**
 * Centralized auth/session handling: validate token, sanitize stale state, redirect to login.
 * Keeps cookies and localStorage in sync and avoids buggy "half logged-in" states.
 */

import { getStoredToken, clearStoredAuth, getApiBaseUrl, responseJson } from "@/lib/api";
import { clearDevViewCookie } from "@/lib/dev-view";

const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 min when tab visible
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // consider stale after 24h without validation (optional)

/** Clear all auth-related state (localStorage, cookies). Call before redirect to login. */
export async function clearAllAuthStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  clearStoredAuth();
  clearDevViewCookie();
  try {
    await fetch("/api/admin-preview", { method: "DELETE", credentials: "include" });
  } catch {
    // ignore
  }
}

/**
 * Sanitize auth state and redirect to login. Use when token is invalid/expired (401)
 * or when you want to force a clean sign-in (e.g. "Session expired. Please sign in again.").
 */
export async function sanitizeAndRedirectToLogin(
  loginPath: string,
  reason?: "session_expired" | "invalid"
): Promise<void> {
  await clearAllAuthStorage();
  const url = reason ? `${loginPath.replace(/\?.*$/, "")}?reason=${encodeURIComponent(reason)}` : loginPath;
  window.location.assign(url);
}

/** Full logout (user clicked Sign out): clear everything and go to home. */
export async function performFullLogout(): Promise<void> {
  await clearAllAuthStorage();
  window.location.assign("/");
}

export type ValidateResult = { valid: true; isAdmin: boolean } | { valid: false };

/**
 * Validate current token with backend. If 401, returns { valid: false } (caller should sanitize and redirect).
 * If 200, optionally refreshes admin-preview cookie and returns { valid: true, isAdmin }.
 */
export async function validateSession(): Promise<ValidateResult> {
  const token = getStoredToken();
  const base = getApiBaseUrl();
  if (!token) return { valid: false };

  const meUrl = base ? `${base}/api/auth/me` : "/api/auth/me";
  const meRes = await fetch(meUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!meRes || meRes.status === 401) return { valid: false };

  if (!meRes.ok) return { valid: true, isAdmin: false };

  // Refresh admin-preview cookie when session is valid (works for both proxy and direct API)
  try {
    await fetch("/api/admin-preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
  } catch {
    // best-effort
  }

  let isAdmin = false;
  if (base) {
    const adminRes = await fetch(`${base}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (adminRes?.ok) {
      const data = await responseJson(adminRes, { admin: false });
      isAdmin = !!data?.admin;
    }
  }
  return { valid: true, isAdmin };
}

/** Interval in ms for periodic re-validation when tab is visible. */
export const REVALIDATE_INTERVAL = REVALIDATE_INTERVAL_MS;
