/**
 * API client for iHostMC backend (auth, keys, usage, Stripe).
 * Set VITE_API_BASE_URL in .env to point to your backend.
 */

const RAW_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, "")
    : "";

/** Use api.ihost.one for legacy DuckDNS API host so sync/relay work (same backend, canonical domain). */
const BASE =
  RAW_BASE && (RAW_BASE.includes("ihostmc-api.duckdns.org") || RAW_BASE.includes("ihostmc.duckdns.org"))
    ? "https://api.ihost.one"
    : RAW_BASE;

export function getApiBaseUrl(): string {
  return BASE;
}

/** Website base URL for browser sign-in. Uses VITE_WEBSITE_URL or same host as API with port 3020. */
export function getWebsiteUrl(): string {
  const envUrl = typeof import.meta !== "undefined" && import.meta.env?.VITE_WEBSITE_URL;
  let base = envUrl && typeof envUrl === "string" ? (envUrl as string).replace(/\/$/, "") : "";
  if (!base && BASE) {
    try {
      const u = new URL(BASE);
      const port = u.port === "3010" || u.port === "3000" ? "3020" : u.port;
      base = `${u.protocol}//${u.hostname}${port ? `:${port}` : ""}`;
    } catch {
      base = BASE;
    }
  }
  // Canonical website: ihost.one (API is api.ihost.one)
  if (base && (base.includes("ihostmc.duckdns.org") || base.includes("ihostmc-api.duckdns.org") || base.includes("api.ihost.one")))
    return "https://ihost.one";
  return base;
}

/** Canonical sign-in URL (website + /login?return=app). Use this link everywhere in the app. */
export function getWebsiteLoginUrl(): string {
  const base = getWebsiteUrl();
  return base ? `${base}/login?return=app` : "";
}

/** Canonical sign-up URL (website + /signup?return=app). */
export function getWebsiteSignupUrl(): string {
  const base = getWebsiteUrl();
  return base ? `${base}/signup?return=app` : "";
}

/** Account settings on the website (profile, passkeys, password, billing). Use English path so it works from the app. */
export function getWebsiteAccountSettingsUrl(): string {
  const base = getWebsiteUrl();
  return base ? `${base}/dashboard/account` : "";
}

/** Backups & sync page on the website (private storage at ihost.one or configured domain). */
export function getWebsiteBackupsUrl(): string {
  const base = getWebsiteUrl();
  return base ? `${base}/dashboard/backups` : "";
}

/** URL to a specific backup on the website (view details, download). Product slug "minecraft" is default. */
export function getBackupDetailUrl(backupId: string, productSlug = "minecraft"): string {
  const base = getWebsiteBackupsUrl();
  return base ? `${base}/${productSlug}/${backupId}` : "";
}

/** URL to this server's cloud page on the website (live sync, occurrences, backups). Uses English path. */
export function getCloudServerUrl(serverId: string): string {
  const base = getWebsiteUrl();
  return base ? `${base}/dashboard/backups/server/${serverId}` : "";
}

/** Backend health (ok, syncAvailable). No auth. Only syncAvailable is set when we got a valid 2xx JSON response. */
export async function getHealth(): Promise<{ ok: boolean; syncAvailable?: boolean }> {
  if (!BASE) return { ok: false };
  try {
    const res = await fetch(`${BASE}/health`, FETCH_OPTIONS);
    const data = (await res.json()) as { ok?: boolean; syncAvailable?: boolean };
    const ok = res.ok && !!data.ok;
    return { ok, syncAvailable: ok ? data.syncAvailable : undefined };
  } catch {
    return { ok: false };
  }
}

/** Result of creating an app login session (backend-verified via website). */
export interface LoginSessionResult {
  url: string;
  sessionId: string;
}

const FETCH_OPTIONS: RequestInit = { mode: "cors", credentials: "omit" };

/** Called automatically when any API returns 401. Set by App to clear auth so user sees connect screen. */
let onAuthExpired: (() => void) | null = null;

export function setOnAuthExpired(cb: (() => void) | null): void {
  onAuthExpired = cb;
}

function handle401(res: Response): void {
  if (res.status === 401 && onAuthExpired) {
    onAuthExpired();
  }
}

/** Delay helper for retries */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a unique app session on the backend and return the login URL with that session.
 * The website uses the session param to show "Use this account / Connect to app".
 * Never open a login link without a session or the website won't show the connect flow.
 * Builds: {websiteUrl}/login?return=app&session={sessionId}
 */
export async function getLoginUrlWithSession(): Promise<LoginSessionResult | null> {
  const websiteBase = getWebsiteUrl();
  if (!websiteBase || !BASE) return null;
  const loginPath = "/login?return=app";
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/auth/app-session`, {
        method: "POST",
        ...FETCH_OPTIONS,
        headers: { "Content-Type": "application/json" },
      });
      const text = await res.text();
      let data: { session_id?: string } = {};
      if (text) {
        try {
          data = JSON.parse(text) as { session_id?: string };
        } catch {
          if (attempt === maxAttempts - 1) return null;
          await delay(400);
          continue;
        }
      }
      if (!res.ok) {
        if (attempt === maxAttempts - 1) return null;
        await delay(400);
        continue;
      }
      const sid = data?.session_id?.trim();
      if (!sid) {
        if (attempt === maxAttempts - 1) return null;
        await delay(400);
        continue;
      }
      const url = `${websiteBase}${loginPath}&session=${encodeURIComponent(sid)}`;
      return { url, sessionId: sid };
    } catch {
      if (attempt === maxAttempts - 1) return null;
      await delay(500);
    }
  }
  return null;
}

/** Poll the backend once for an app session. Returns auth when website has registered it. */
export async function claimAppSession(
  sessionId: string
): Promise<{ token: string; userId: string; email: string } | null> {
  const sid = sessionId?.trim();
  if (!BASE || !sid) return null;
  try {
    const res = await fetch(
      `${BASE}/api/auth/app-session?session_id=${encodeURIComponent(sid)}`,
      FETCH_OPTIONS
    );
    const text = await res.text();
    if (!res.ok) return null;
    let data: { token?: string; userId?: string; email?: string } = {};
    if (text) {
      try {
        data = JSON.parse(text) as { token?: string; userId?: string; email?: string };
      } catch {
        return null;
      }
    }
    if (data?.token && data?.userId && data?.email)
      return { token: data.token, userId: data.userId, email: data.email };
    return null;
  } catch {
    return null;
  }
}

export function isBackendConfigured(): boolean {
  return BASE.length > 0;
}

export interface AuthResponse {
  token: string;
  userId: string;
  email: string;
}

export interface MeResponse {
  userId: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
  emailVerified?: boolean;
}

export interface UpdateMePayload {
  displayName?: string | null;
  username?: string | null;
}

export interface WebAuthnCredential {
  id: string;
  deviceType: string | null;
  createdAt: string;
}

export interface TierInfo {
  id: string;
  name: string;
  priceUsd: number;
  maxServers: number;
  aiIncluded: boolean;
  /** AI credits per month (Pro tier). */
  aiCreditsPerMonth?: number;
  autoBackup: boolean;
  apiRequestsPerMonth: number;
  description: string;
  featureKeys: string[];
}

export interface SubscriptionStatus {
  status: string;
  currentPeriodEnd: string | null;
  /** True when subscription is canceled but still active until currentPeriodEnd */
  endsAtPeriodEnd?: boolean;
  tierId: string;
  tier: TierInfo;
  /** True when current tier is from dev override (testing, no payment) */
  devOverride?: boolean;
}

export interface KeyResponse {
  set: boolean;
  value?: string;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    handle401(res);
    const isHtml = text.trimStart().startsWith("<") || /Cannot (GET|POST|PUT|PATCH|DELETE) /i.test(text);
    const isSync = path.includes("/sync/");
    if ((res.status === 404 || isHtml) && isSync) {
      throw new Error("Sync not available on this server. Update the backend to the latest version.");
    }
    let err: { error?: string } = {};
    try {
      err = JSON.parse(text);
    } catch {
      throw new Error(text || res.statusText);
    }
    throw new Error(err.error || res.statusText);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid response from server");
  }
}

export const api = {
  async register(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async me(token: string): Promise<MeResponse> {
    return request<MeResponse>("/api/auth/me", { token });
  },

  async updateMe(token: string, payload: UpdateMePayload): Promise<MeResponse> {
    return request<MeResponse>("/api/auth/me", {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    });
  },

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      token,
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });
  },

  async getWebAuthnCredentials(token: string): Promise<WebAuthnCredential[]> {
    const res = await request<{ credentials: WebAuthnCredential[] }>(
      "/api/auth/webauthn/credentials",
      { token }
    );
    return res?.credentials ?? [];
  },

  /** Returns options for browser passkey registration (use with @simplewebauthn/browser startRegistration). */
  async getWebAuthnRegisterOptions(token: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      "/api/auth/webauthn/register-options",
      { method: "POST", token }
    );
  },

  async verifyWebAuthnRegister(
    token: string,
    response: unknown
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/auth/webauthn/register-verify", {
      method: "POST",
      token,
      body: JSON.stringify({ response }),
    });
  },

  async deleteWebAuthnCredential(
    token: string,
    credentialId: string
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      `/api/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`,
      { method: "DELETE", token }
    );
  },

  async getKey(token: string, keyName: string): Promise<KeyResponse> {
    return request<KeyResponse>(`/api/keys/${keyName}`, { token });
  },

  async setKey(
    token: string,
    keyName: string,
    value: string
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/keys/${keyName}`, {
      method: "PUT",
      token,
      body: JSON.stringify({ value }),
    });
  },

  async deleteKey(
    token: string,
    keyName: string
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/keys/${keyName}`, {
      method: "DELETE",
      token,
    });
  },

  /**
   * Record a usage event. Use eventType prefix "ai_" for AI usage; backend allows AI events only for Pro tier.
   * Free and Backup: AI events are rejected (403). Check subscription.tier.aiIncluded before calling with ai_*.
   */
  async recordUsage(
    token: string,
    eventType: string,
    units?: number,
    metadata?: Record<string, unknown>
  ): Promise<{ ok: boolean }> {
    const res = await fetch(`${BASE}/api/usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ eventType, units, metadata }),
    });
    const text = await res.text();
    if (res.status === 402) {
      let body: { limit?: number; used?: number; upgradeUrl?: string; priceUsd?: number; error?: string } = {};
      try {
        if (text) body = JSON.parse(text);
      } catch {
        // ignore
      }
      const err = new Error(body.error ?? "Monthly request limit reached") as Error & {
        limit: number;
        used: number;
        upgradeUrl?: string;
        priceUsd?: number;
      };
      err.limit = body.limit ?? 0;
      err.used = body.used ?? 0;
      err.upgradeUrl = body.upgradeUrl;
      err.priceUsd = body.priceUsd;
      throw err;
    }
    if (res.status === 403) {
      let body: { error?: string; code?: string } = {};
      try {
        if (text) body = JSON.parse(text);
      } catch {
        // ignore
      }
      throw new Error(body.error ?? "AI features require Pro");
    }
    if (!res.ok) {
      handle401(res);
      let err: { error?: string } = {};
      try {
        if (text) err = JSON.parse(text);
      } catch {
        throw new Error(text || res.statusText);
      }
      throw new Error(err.error || res.statusText);
    }
    return text ? (JSON.parse(text) as { ok: boolean }) : { ok: true };
  },

  async getUsageSummary(
    token: string,
    period?: "month" | "current_month"
  ): Promise<{
    period: string;
    since: string;
    summary: Record<string, number>;
    summaryByDay?: Record<string, number>;
    used: number;
    limit: number;
    tier: "free" | "paid";
    tierId?: string;
    priceUsd: number;
    aiCreditsBalance?: number;
    aiUsedThisMonth?: number;
    aiCreditsPerMonth?: number;
  }> {
    const q = period ? `?period=${period}` : "";
    return request(`/api/usage/summary${q}`, { token });
  },

  /** Type guard for 402 usage-limit errors from recordUsage. */
  isUsageLimitError(e: unknown): e is Error & { limit: number; used: number; upgradeUrl?: string; priceUsd?: number } {
    return (
      e instanceof Error &&
      "limit" in e &&
      "used" in e &&
      typeof (e as { limit: unknown }).limit === "number" &&
      typeof (e as { used: unknown }).used === "number"
    );
  },

  async createCheckoutSession(
    token: string,
    options?: { tierId?: string; successUrl?: string; cancelUrl?: string }
  ): Promise<{ url: string; sessionId: string }> {
    return request<{ url: string; sessionId: string }>(
      "/api/stripe/create-checkout-session",
      {
        method: "POST",
        token,
        body: JSON.stringify({
          tierId: options?.tierId,
          successUrl: options?.successUrl,
          cancelUrl: options?.cancelUrl,
        }),
      }
    );
  },

  /** List billing tiers (no auth). */
  async getTiers(): Promise<{ tiers: TierInfo[] }> {
    return request<{ tiers: TierInfo[] }>("/api/tiers");
  },

  /** Subscription status and current tier (auth). */
  async getSubscriptionStatus(token: string): Promise<SubscriptionStatus> {
    return request<SubscriptionStatus>("/api/subscription/status", { token });
  },

  async createCustomerPortalSession(
    token: string,
    returnUrl?: string
  ): Promise<{ url: string }> {
    return request<{ url: string }>("/api/stripe/customer-portal", {
      method: "POST",
      token,
      body: JSON.stringify({ returnUrl }),
    });
  },

  /** One-time checkout for AI credit packs (small / medium / bulk). Returns url to Stripe Checkout or throws. */
  async createCreditCheckoutSession(
    token: string,
    options: { packId: "small" | "medium" | "bulk"; successUrl?: string; cancelUrl?: string }
  ): Promise<{ url: string }> {
    return request<{ url: string }>("/api/stripe/create-credit-checkout", {
      method: "POST",
      token,
      body: JSON.stringify({
        packId: options.packId,
        successUrl: options.successUrl,
        cancelUrl: options.cancelUrl,
      }),
    });
  },

  /** Relay (FRP) token – from backend, only when logged in. Not in distributed build. */
  async getRelayToken(authToken: string): Promise<{ token: string }> {
    return request<{ token: string }>("/api/relay/token", { token: authToken });
  },

  /** CurseForge API key – from backend for logged-in users; app uses it so CurseForge works without user entering a key. */
  async getRelayCurseforgeKey(authToken: string): Promise<{ key: string }> {
    return request<{ key: string }>("/api/relay/curseforge-key", { token: authToken });
  },

  /** Dev only: whether this user can use dev tier override (no secret). */
  async getDevCanUseOverride(token: string): Promise<{ allowed: boolean }> {
    return request<{ allowed: boolean }>("/api/dev/can-use-override", { token });
  },

  /** Dev only: get Stripe test mode preference. */
  async getDevStripeMode(token: string): Promise<{ useTestMode: boolean }> {
    return request<{ useTestMode: boolean }>("/api/dev/stripe-mode", { token });
  },

  /** Dev only: set Stripe test mode (use test keys / no real charges). */
  async setDevStripeMode(token: string, useTestMode: boolean): Promise<{ useTestMode: boolean }> {
    return request<{ useTestMode: boolean }>("/api/dev/stripe-mode", {
      method: "POST",
      token,
      body: JSON.stringify({ useTestMode }),
    });
  },

  /**
   * AI chat completion (proxy to xAI via backend). Server-held key; never exposed to client.
   * Requires Pro tier (aiIncluded). Records usage (ai_completion). Throws on 402/403/503.
   * Optional context (servers, selectedServerId) lets the AI reference @servers and suggest actions.
   */
  async aiChat(
    token: string,
    body: {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      context?: { servers?: Array<{ id: string; name: string }>; selectedServerId?: string };
    },
    options?: { signal?: AbortSignal }
  ): Promise<{
    id?: string;
    choices?: Array<{ message?: { role?: string; content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    content?: string;
    actions?: Array<{ type: string; params: Record<string, unknown> }>;
  }> {
    if (!BASE) {
      throw new Error(
        "API URL not configured. Set VITE_API_BASE_URL in .env (e.g. https://api.ihost.one or http://localhost:3010)."
      );
    }
    const res = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: body.messages,
        model: body.model ?? undefined,
        context: body.context ?? undefined,
      }),
      signal: options?.signal,
    });
    const text = await res.text();
    if (res.status === 402) {
      let data: { error?: string; limit?: number; used?: number; upgradeUrl?: string; priceUsd?: number } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        // ignore
      }
      const err = new Error(data.error ?? "Monthly request limit reached") as Error & {
        limit: number;
        used: number;
        upgradeUrl?: string;
        priceUsd?: number;
      };
      err.limit = data.limit ?? 0;
      err.used = data.used ?? 0;
      err.upgradeUrl = data.upgradeUrl;
      err.priceUsd = data.priceUsd;
      throw err;
    }
    if (res.status === 403) {
      let data: { error?: string; code?: string; tierId?: string } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        // ignore
      }
      throw new Error(data.error ?? "AI features require Pro");
    }
    if (res.status === 503) {
      throw new Error("AI is not configured on this server.");
    }
    if (!res.ok) {
      handle401(res);
      let data: { error?: string } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        throw new Error(text || res.statusText);
      }
      throw new Error(data.error || res.statusText);
    }
    const data = text ? JSON.parse(text) : {};
    return {
      id: data.id,
      choices: data.choices ?? [],
      usage: data.usage,
      content: data.content,
      actions: data.actions,
    };
  },

  /**
   * Suggest a short conversation title from the first user message (e.g. for advisor sidebar).
   * Pro tier required; no usage recorded. Returns { title: string }.
   */
  async aiSuggestTitle(
    token: string,
    body: { message: string },
    options?: { signal?: AbortSignal }
  ): Promise<{ title: string }> {
    if (!BASE) {
      throw new Error(
        "API URL not configured. Set VITE_API_BASE_URL in .env (e.g. https://api.ihost.one or http://localhost:3010)."
      );
    }
    const res = await fetch(`${BASE}/api/ai/suggest-title`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: body.message }),
      signal: options?.signal,
    });
    const text = await res.text();
    if (res.status === 403) {
      throw new Error("AI features require Pro");
    }
    if (res.status === 503) {
      throw new Error("AI is not configured on this server.");
    }
    if (!res.ok) {
      handle401(res);
      let data: { error?: string } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        throw new Error(text || res.statusText);
      }
      throw new Error(data.error || res.statusText);
    }
    const data = text ? JSON.parse(text) : {};
    return { title: typeof data.title === "string" ? data.title.trim().slice(0, 60) : "New chat" };
  },

  /** Dev only: set subscription tier without Stripe (header X-Dev-Tier-Secret). */
  async setDevTier(
    token: string,
    secret: string,
    tierId: "free" | "backup" | "pro"
  ): Promise<{ ok: boolean; tierId: string; message?: string }> {
    const res = await fetch(`${BASE}/api/dev/set-tier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Dev-Tier-Secret": secret,
      },
      body: JSON.stringify({ tierId }),
    });
    const text = await res.text();
    if (!res.ok) {
      handle401(res);
      let err: { error?: string } = {};
      try {
        err = JSON.parse(text);
      } catch {
        throw new Error(text || res.statusText);
      }
      throw new Error(err.error || res.statusText);
    }
    return text ? JSON.parse(text) : { ok: true, tierId };
  },

  // ---- Sync & backup (ihost.one / private storage) ----

  /** Sync server: register or update one server so the website shows "My servers" and backup count. */
  async syncServer(
    token: string,
    payload: {
      hostId: string;
      name: string;
      lastSyncedAt?: string;
      lastBackupAt?: string;
      backupCount?: number;
      miniSynced?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ id: string; hostId: string; name: string; createdAt: string }> {
    return request("/api/sync/servers", {
      method: "POST",
      token,
      body: JSON.stringify({
        hostId: payload.hostId,
        name: payload.name,
        lastSyncedAt: payload.lastSyncedAt ?? new Date().toISOString(),
        lastBackupAt: payload.lastBackupAt,
        backupCount: payload.backupCount,
        miniSynced: payload.miniSynced,
        metadata: payload.metadata ?? {},
      }),
    });
  },

  /** List sync servers (what the website shows as "Your servers"). */
  async getSyncServers(token: string): Promise<SyncServerInfo[]> {
    const list = await request<SyncServerInfo[]>("/api/sync/servers", { token });
    return Array.isArray(list) ? list : [];
  },

  /** Get backup storage report: total size, mini/big split, files-too-big count, storage limit, tier (for usage in app). */
  async getBackupReport(token: string): Promise<BackupReport> {
    return request<BackupReport>("/api/backups/report", { token });
  },

  /** Get backup count and max allowed for the user's tier (for "X / Y backups" in UI). */
  async getBackupLimits(token: string): Promise<{ count: number; maxBackups: number }> {
    return request<{ count: number; maxBackups: number }>("/api/backups/limits", { token });
  },

  /** List all backups (user's private storage). Filter by serverId in app for "backups for this server". */
  async getBackupList(token: string): Promise<BackupListItem[]> {
    const list = await request<BackupListItem[]>("/api/backups", { token });
    return Array.isArray(list) ? list : [];
  },

  /** Get single backup with full metadata (for manifest). */
  async getBackup(token: string, id: string): Promise<BackupDetail> {
    return request<BackupDetail>(`/api/backups/${encodeURIComponent(id)}`, { token });
  },

  /** Upload a backup file to the private storage (ihost.one). Optional serverId links it to a sync server. */
  async uploadBackup(
    token: string,
    file: File,
    options?: { serverId?: string; name?: string; kind?: "full" | "mini"; metadata?: Record<string, unknown> }
  ): Promise<{ id: string; name: string; sizeBytes: number; createdAt: string }> {
    const form = new FormData();
    form.append("file", file);
    form.append("name", options?.name ?? file.name);
    if (options?.serverId) form.append("serverId", options.serverId);
    if (options?.kind) form.append("kind", options.kind);
    if (options?.metadata) form.append("metadata", JSON.stringify(options.metadata));
    const res = await fetch(`${BASE}/api/backups`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      handle401(res);
      let err: { error?: string } = {};
      try {
        if (text) err = JSON.parse(text);
      } catch {
        throw new Error(text || res.statusText);
      }
      throw new Error(err.error || res.statusText);
    }
    return text ? JSON.parse(text) : { id: "", name: file.name, sizeBytes: file.size, createdAt: "" };
  },

  // ---- File Sync (per-file sync to backend) ----

  async getSyncFiles(
    token: string,
    serverId: string,
    options?: { tier?: "mini" | "big"; limit?: number; offset?: number }
  ): Promise<SyncFilesResponse> {
    const params = new URLSearchParams();
    if (options?.tier) params.set("tier", options.tier);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const qs = params.toString();
    return request<SyncFilesResponse>(
      `/api/sync/servers/${encodeURIComponent(serverId)}/files${qs ? `?${qs}` : ""}`,
      { token }
    );
  },

  async getSyncFileContent(token: string, serverId: string, fileId: string): Promise<string> {
    const res = await fetch(
      `${BASE}/api/sync/servers/${encodeURIComponent(serverId)}/files/${encodeURIComponent(fileId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      handle401(res);
      throw new Error(`Failed to get file content: ${res.statusText}`);
    }
    return res.text();
  },

  async deleteSyncFile(token: string, serverId: string, fileId: string): Promise<void> {
    await request(`/api/sync/servers/${encodeURIComponent(serverId)}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      token,
    });
  },

  async postSyncManifest(
    token: string,
    serverId: string,
    manifest: { manifestType: string; fileCount: number; totalBytes: number; manifestData: unknown }
  ): Promise<{ id: string; createdAt: string }> {
    return request(`/api/sync/servers/${encodeURIComponent(serverId)}/manifest`, {
      method: "POST",
      token,
      body: JSON.stringify(manifest),
    });
  },

  async getSyncManifests(
    token: string,
    serverId: string,
    type?: "mini" | "big" | "combined"
  ): Promise<SyncManifestInfo[]> {
    const qs = type ? `?type=${type}` : "";
    return request<SyncManifestInfo[]>(
      `/api/sync/servers/${encodeURIComponent(serverId)}/manifest${qs}`,
      { token }
    );
  },

  async getSyncSummary(token: string, serverId: string): Promise<SyncSummary> {
    return request<SyncSummary>(
      `/api/sync/servers/${encodeURIComponent(serverId)}/summary`,
      { token }
    );
  },

  /** Request a sync from the website (e.g. user clicked "Trigger sync" on Cloud). App can poll or run sync when convenient. */
  async triggerSyncRequest(token: string, serverId: string): Promise<{ ok: boolean; message?: string }> {
    return request<{ ok: boolean; message?: string }>(
      `/api/sync/servers/${encodeURIComponent(serverId)}/trigger-sync`,
      { method: "POST", token }
    );
  },

  /** Create a snapshot/archive from current synced data. saveTier: snapshot | structural | full | world. scope: "world" = map backup only. includePaths: path prefixes to include (custom backup). keepLiveSync: if true, do not clear synced data after creating archive. */
  async createArchive(
    token: string,
    serverId: string,
    options?: {
      name?: string;
      iterationType?: "3h" | "daily" | "weekly";
      saveTier?: "snapshot" | "structural" | "full" | "world";
      keepLiveSync?: boolean;
      scope?: "world";
      includePaths?: string[];
    }
  ): Promise<{ id: string; name: string; kind: string; sizeBytes: number; createdAt: string; serverId: string }> {
    return request(`/api/sync/servers/${encodeURIComponent(serverId)}/archive`, {
      method: "POST",
      token,
      body: JSON.stringify({
        name: options?.name ?? undefined,
        iterationType: options?.iterationType ?? undefined,
        saveTier: options?.saveTier ?? undefined,
        keepLiveSync: options?.keepLiveSync ?? undefined,
        scope: options?.scope ?? undefined,
        includePaths: options?.includePaths ?? undefined,
      }),
    });
  },

  /** Update iteration schedule and/or last run on backend (for backend cron and app sync). Syncs with website. */
  async patchIteration(
    token: string,
    serverId: string,
    body: {
      every3h?: boolean;
      daily?: boolean;
      weekly?: boolean;
      lastRun3h?: string;
      lastRunDaily?: string;
      lastRunWeekly?: string;
      dailyAt?: string;
      weeklyOn?: number;
      intervalHours?: number;
      monthly?: boolean;
      monthlyDay?: number;
      monthlyAt?: string;
      lastRunMonthly?: string;
      saveTier?: "snapshot" | "structural" | "full";
    }
  ): Promise<{ ok: boolean }> {
    return request(`/api/sync/servers/${encodeURIComponent(serverId)}/iteration`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
};

/** Backup storage report from GET /api/backups/report (combined for all servers). */
export interface BackupReport {
  totalSizeBytes: number;
  totalCount: number;
  byKind: { mini: number; full: number };
  filesTooBigCount: number;
  storageLimitBytes: number | null;
  /** Mini (small) files size in bytes; present when backend supports it. */
  miniBytes?: number;
  /** Big (full) files size in bytes; present when backend supports it. */
  bigBytes?: number;
  /** Current tier id: free | backup | pro. */
  tierId?: string;
  /** Storage limit in GB for current tier. */
  storageLimitGb?: number;
}

/** One backup from GET /api/backups list. */
export interface BackupListItem {
  id: string;
  name: string;
  kind: "mini" | "full" | "snapshot" | "structural" | "world";
  sizeBytes: number;
  createdAt: string;
  serverId?: string;
  serverName?: string;
  metadata?: Record<string, unknown>;
}

/** Single backup from GET /api/backups/:id (includes full metadata.manifest). */
export interface BackupDetail extends BackupListItem {
  metadata: Record<string, unknown>;
}

/** File tag for backup scope: must = essential, cache = cache/logs, mini = small stored, big = large. */
export type SnapshotFileTag = "must" | "cache" | "mini" | "big";

/** Manifest file entry (path, size, storage tier, tag for restore scope). */
export interface ManifestFileEntry {
  path: string;
  isDir: boolean;
  sizeBytes: number;
  storage: "small" | "big" | "reference";
  /** From Rust or frontend: config | world | mod | plugin | library | jar | cache | other */
  category?: string;
  /** Tag for backup scope: must (essential), cache (skip or separate), mini/big (storage tier). */
  tag?: SnapshotFileTag;
}

/** Manifest mod/plugin (path, name, optional source for reference). */
export interface ManifestModEntry {
  path: string;
  name: string;
  sizeBytes: number;
  storage: "small" | "big" | "reference";
  source?: "curseforge" | "modrinth";
  projectId?: string;
  version?: string;
}

/** Server preset for restore (re-download server jar, etc.). */
export interface SnapshotPreset {
  server_type?: string;
  minecraft_version?: string;
  loader_version?: string;
  build_id?: string;
}

/** Backup manifest (file tree + mod list + summary + tag lists + preset). */
export interface BackupManifest {
  files: ManifestFileEntry[];
  mods: ManifestModEntry[];
  plugins: ManifestModEntry[];
  summary: {
    smallCount: number;
    bigCount: number;
    smallBytes: number;
    bigBytes: number;
    referenceCount: number;
    totalBytes: number;
    mustCount?: number;
    cacheCount?: number;
  };
  /** Paths tagged must (essential config, jar). */
  mustFiles?: string[];
  /** Paths tagged cache (logs, cache). */
  cacheFiles?: string[];
  /** Preset for restore (server type + version). */
  preset?: SnapshotPreset;
}

/** One sync server as returned by GET /api/sync/servers (used by app and website). */
export interface SyncServerInfo {
  id: string;
  hostId: string;
  name: string;
  lastSyncedAt: string | null;
  lastBackupAt: string | null;
  backupCount: number;
  miniSynced: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
  /** Iteration schedule (synced from website/app); used to show occurrences live. */
  iterationEvery3h?: boolean;
  iterationDaily?: boolean;
  iterationWeekly?: boolean;
  iterationLast3hAt?: string | null;
  iterationLastDailyAt?: string | null;
  iterationLastWeeklyAt?: string | null;
  iterationDailyAt?: string | null;
  iterationWeeklyOn?: number | null;
  iterationMonthly?: boolean;
  iterationMonthlyDay?: number | null;
  iterationMonthlyAt?: string | null;
  iterationLastMonthlyAt?: string | null;
  iterationIntervalHours?: number | null;
  /** Save tier for automatic iterations (snapshot | structural | full). */
  iterationSaveTier?: "snapshot" | "structural" | "full" | null;
}

/** One synced file as returned by GET /api/sync/servers/:id/files */
export interface SyncFileInfo {
  id: string;
  filePath: string;
  fileHash: string;
  sizeBytes: number;
  storageTier: "mini" | "big";
  encrypted: boolean;
  syncedAt: string;
}

export interface SyncFilesResponse {
  files: SyncFileInfo[];
  total: number;
  limit: number;
  offset: number;
}

export interface SyncManifestInfo {
  id: string;
  manifestType: "mini" | "big" | "combined";
  fileCount: number;
  totalBytes: number;
  manifestData: Record<string, unknown>;
  createdAt: string;
}

export interface SyncSummary {
  syncedFiles: {
    mini: number;
    big: number;
    totalFiles: number;
    miniBytes: number;
    bigBytes: number;
    totalBytes: number;
  };
  manifests: Array<{
    id: string;
    manifestType: string;
    fileCount: number;
    totalBytes: number;
    createdAt: string;
  }>;
}
