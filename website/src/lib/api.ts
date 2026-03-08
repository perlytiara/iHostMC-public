/** When true, auth requests go to same-origin /api/auth/* (Next.js proxy to backend). Use if CORS blocks direct backend calls. */
const USE_PROXY =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_USE_API_PROXY === "true";

const BASE =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? (process.env.NEXT_PUBLIC_API_URL as string).replace(/\/$/, "")
    : "";

/** Backend port when running API on same host (e.g. local dev). */
const DEFAULT_API_PORT = "3010";

/**
 * Parse response body as JSON without throwing on HTML/empty/invalid (avoids "JSON.parse: unexpected character").
 * Use for any fetch() where the server might return an error page or non-JSON.
 */
export async function responseJson<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  if (!text?.trim()) return fallback;
  try {
    const parsed = JSON.parse(text) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function getApiBaseUrl(): string {
  if (USE_PROXY) return "";
  if (BASE) return BASE;
  // Local dev: no env set → use same host, default API port (connect to local or live backend via .env)
  if (typeof window !== "undefined" && window.location?.hostname) {
    const { hostname } = window.location;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
  }
  return "";
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("ihostmc-auth");
    const data = raw ? JSON.parse(raw) : null;
    return data?.user?.token ?? null;
  } catch {
    return null;
  }
}

export interface StoredAuthUser {
  token: string;
  userId: string;
  email: string;
}

export function getStoredAuth(): StoredAuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("ihostmc-auth");
    const data = raw ? JSON.parse(raw) : null;
    const user = data?.user;
    if (user?.token && user?.userId && user?.email) return user;
    return null;
  } catch {
    return null;
  }
}

/** Clear stored auth (e.g. on 401). Call before redirecting to login so old/invalid tokens don't persist. */
export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("ihostmc-auth");
  } catch {
    // ignore
  }
}

/**
 * Register auth for an app session via backend (website verification only; no localhost).
 * Website calls this after user signs in; app polls GET /api/auth/app-session to claim the token.
 * Returns { ok: true } on success, or { ok: false, error } when session expired or request failed.
 */
export async function registerSessionAndRedirect(
  sessionId: string,
  auth: { token: string; userId: string; email: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!sessionId?.trim() || typeof window === "undefined") return { ok: false, error: "missing_session" };
  const base = getApiBaseUrl();
  const url = base ? `${base}/api/auth/app-session/register` : "/api/auth/app-session/register";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ session_id: sessionId.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg = data?.error ?? (res.status === 404 ? "Invalid or expired session" : "Request failed");
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * Create app session on backend, register current user, open app deep link (ihostmc://auth?session=ID),
 * then redirect to dashboard. App will poll for the session and sign in.
 */
export async function sendAuthToDevAppAndRedirect(
  auth?: { token: string; userId: string; email: string } | null
): Promise<void> {
  const user = auth ?? getStoredAuth();
  if (!user || typeof window === "undefined") return;
  const base = getApiBaseUrl();
  const createUrl = base ? `${base}/api/auth/app-session` : "/api/auth/app-session";
  const registerUrl = base ? `${base}/api/auth/app-session/register` : "/api/auth/app-session/register";
  try {
    const createRes = await fetch(createUrl, { method: "POST" });
    if (!createRes.ok) return;
    const createData = await responseJson(createRes, {} as { session_id?: string });
    const sessionId = createData?.session_id?.trim();
    if (!sessionId) return;
    await fetch(registerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    try {
      window.open(`ihostmc://auth?session=${encodeURIComponent(sessionId)}`, "_blank", "noopener");
    } catch {
      // protocol not registered or blocked
    }
    const url = new URL(window.location.href);
    url.searchParams.set("signed_in", "app");
    window.location.href = url.toString();
  } catch {
    // network error
  }
}

/** Optional: direct payload deep link (legacy). Prefer session-based flow via website. */
export function buildOpenInAppUrl(auth?: { token: string; userId: string; email: string } | null): string | null {
  if (!auth?.token || !auth?.userId || !auth?.email) return null;
  const payload = { token: auth.token, userId: auth.userId, email: auth.email, exp: Date.now() + 5 * 60 * 1000 };
  const b64 = typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) : null;
  if (!b64) return null;
  return `ihostmc://auth?payload=${encodeURIComponent(b64)}`;
}
