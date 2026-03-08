"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { getPath, type Locale } from "@/i18n/pathnames";
import { useLocale } from "next-intl";
import { SafeIcon } from "@/components/SafeIcon";
import {
  getApiBaseUrl,
  getStoredToken,
  getStoredAuth,
  clearStoredAuth,
  buildOpenInAppUrl,
  sendAuthToDevAppAndRedirect,
} from "@/lib/api";
import {
  Server,
  FolderArchive,
  HardDrive,
  CreditCard,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

interface Me {
  userId: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
}

interface SubStatus {
  status: string;
  currentPeriodEnd: string | null;
  endsAtPeriodEnd?: boolean;
  tierId?: string;
  tier?: { id: string; name: string; priceUsd: number };
  devOverride?: boolean;
}

const LOAD_TIMEOUT_MS = 15000;

function safeJson<T>(r: Response, fallback: T): Promise<T> {
  return r.text().then((t) => {
    if (!t?.trim()) return fallback;
    try {
      return (JSON.parse(t) as T) ?? fallback;
    } catch {
      return fallback;
    }
  });
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 rounded-md bg-muted/60" />
        <div className="h-4 w-72 max-w-full rounded-md bg-muted/40" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card/50 p-4">
            <div className="h-4 w-16 rounded bg-muted/60 mb-3" />
            <div className="h-8 w-12 rounded bg-muted/80" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="h-5 w-32 rounded bg-muted/60 mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/40" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="h-5 w-24 rounded bg-muted/60 mb-4" />
          <div className="h-20 rounded-lg bg-muted/40 mb-4" />
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-md bg-muted/60" />
            <div className="h-9 w-24 rounded-md bg-muted/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

type DashState = "loading" | "error" | "ready";

function DashboardContent() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();

  const [state, setState] = useState<DashState>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);
  const [backups, setBackups] = useState<{ id: string; name: string; sizeBytes: number; createdAt: string }[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string; backupCount: number; lastSyncedAt: string | null }[]>([]);
  const [openInAppSent, setOpenInAppSent] = useState(false);

  // Prevent double-fire from StrictMode or router reference changes
  const fetchedRef = useRef(false);
  const retryRef = useRef(0);

  function doFetch() {
    const token = getStoredToken();
    if (!token) {
      setState("ready");
      return;
    }
    const base = getApiBaseUrl();
    const api = (path: string) => (base ? `${base}${path}` : path);
    setState("loading");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    const authHeader = { Authorization: `Bearer ${token}` };
    const signal = controller.signal;

    Promise.all([
      fetch(api("/api/auth/me"), { headers: authHeader, signal }).then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        if (r.status >= 500) throw new Error("API error");
        return safeJson<Me | null>(r, null);
      }),
      fetch(api("/api/subscription/status"), { headers: authHeader, signal }).then((r) => {
        if (r.status >= 500) throw new Error("API error");
        return r.status === 401 || r.status === 403 ? null : safeJson<SubStatus | null>(r, null);
      }),
      fetch(api("/api/backups"), { headers: authHeader, signal }).then((r) => {
        if (r.status >= 500) throw new Error("API error");
        return r.ok ? safeJson<typeof backups>(r, []) : [];
      }),
      fetch(api("/api/sync/servers"), { headers: authHeader, signal }).then((r) => {
        if (r.status >= 500) throw new Error("API error");
        return r.ok ? safeJson<typeof servers>(r, []).then((a) => (Array.isArray(a) ? a : [])) : Promise.resolve([]);
      }),
    ])
      .then(([meData, sub, backupList, serverList]) => {
        setMe(meData ?? null);
        setSubStatus(sub ?? null);
        setBackups(Array.isArray(backupList) ? backupList : []);
        setServers(
          Array.isArray(serverList)
            ? serverList.map((s) => ({ id: s.id, name: s.name, backupCount: s.backupCount, lastSyncedAt: s.lastSyncedAt }))
            : []
        );
        setState("ready");
      })
      .catch(() => setState("error"))
      .finally(() => clearTimeout(timeoutId));
  }

  const doFetchRef = useRef(doFetch);
  doFetchRef.current = doFetch;

  // Single fetch on mount — no dependencies that change
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live sync with app: refetch when tab becomes visible or every 60s so backups/servers stay current
  useEffect(() => {
    if (state !== "ready" || !getStoredToken()) return;
    const refresh = () => doFetchRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const intervalMs = 60 * 1000;
    const id = setInterval(refresh, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [state]);

  useEffect(() => {
    if (searchParams.get("openInApp") !== "1" || openInAppSent) return;
    const auth = getStoredAuth();
    if (!auth) return;
    setOpenInAppSent(true);
    sendAuthToDevAppAndRedirect(auth);
    router.replace("/dashboard", { scroll: false });
  }, [searchParams, openInAppSent, router]);

  const token = getStoredToken();
  const authPayload = me ? { token: token!, userId: me.userId, email: me.email } : null;
  const openInAppUrl = buildOpenInAppUrl(authPayload) ?? buildOpenInAppUrl();

  const handleRetry = () => {
    retryRef.current++;
    fetchedRef.current = true;
    doFetch();
  };

  const totalStorage = backups.reduce((s, b) => s + b.sizeBytes, 0);

  if (state === "loading") return <DashboardSkeleton />;

  if (state === "error") {
    return (
      <div className="min-h-[320px] flex flex-col items-center justify-center rounded-xl border border-border bg-card/50 p-6 text-center">
        <SafeIcon><AlertCircle className="h-10 w-10 text-destructive/80 mb-3" aria-hidden /></SafeIcon>
        <h2 className="font-semibold text-foreground mb-1">Couldn&apos;t load dashboard</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Check your connection or try again. If this keeps happening, ensure the API is reachable.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <SafeIcon><RefreshCw className="h-4 w-4" /></SafeIcon>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {me ? `Welcome back, ${me.displayName || me.email?.split("@")[0] || "there"}` : "Your account, servers, and backups in one place."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary">{subStatus?.tier?.name ?? "Free"}</span>
          {subStatus?.devOverride && (
            <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">Dev</span>
          )}
          <Link href={getPath("dashboardAccount", locale)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Account <SafeIcon><ChevronRight className="h-3.5 w-3.5" /></SafeIcon>
          </Link>
        </div>
      </div>

      {openInAppSent && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          Opening iHost app… If it didn&apos;t open, use the button below.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Servers", value: servers.length, Icon: Server },
          { label: "Backups", value: backups.length, Icon: FolderArchive },
          { label: "Storage", value: formatSize(totalStorage), Icon: HardDrive },
          { label: "Plan", value: subStatus?.tier?.name ?? "Free", Icon: CreditCard },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <SafeIcon><Icon className="h-5 w-5 text-primary" aria-hidden /></SafeIcon>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-lg font-semibold tabular-nums truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Synced servers</h2>
            <Link href={getPath("dashboardServers", locale)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Browse <SafeIcon><ExternalLink className="h-3 w-3" /></SafeIcon>
            </Link>
          </div>
          <div className="p-4">
            {servers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No servers synced yet. Use the app to add servers and sync.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {servers.slice(0, 5).map((s) => {
                  const syncAgo = s.lastSyncedAt ? Math.round((Date.now() - new Date(s.lastSyncedAt).getTime()) / 60000) : null;
                  const syncLabel =
                    syncAgo !== null ? (syncAgo < 2 ? "Just now" : syncAgo < 60 ? `${syncAgo}m ago` : `${Math.round(syncAgo / 60)}h ago`) : null;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {syncLabel && <span className="text-emerald-600 dark:text-emerald-400">{syncLabel}</span>}
                        {s.backupCount} backup{s.backupCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {servers.length > 5 && (
              <Link href={getPath("dashboardServers", locale)} className="mt-2 block text-xs text-muted-foreground hover:text-foreground">
                +{servers.length - 5} more
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Backups</h2>
            <Link href={getPath("dashboardBackups", locale)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              View all <SafeIcon><ExternalLink className="h-3 w-3" /></SafeIcon>
            </Link>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {backups.length > 0 ? `${backups.length} backup(s) · ${formatSize(totalStorage)} total.` : "Sync from the app to create backups."}
            </p>
            {backups.length > 0 && backups[0] && (
              <p className="text-xs text-muted-foreground">
                Latest: <span className="text-foreground/80">{backups[0].name}</span> — {new Date(backups[0].createdAt).toLocaleDateString()}
              </p>
            )}
            <Link href={getPath("dashboardBackups", locale)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
              <SafeIcon><FolderArchive className="h-4 w-4" /></SafeIcon>
              {backups.length > 0 ? `View ${backups.length} backup(s) in Cloud` : "Open Cloud"}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h2 className="font-semibold text-sm mb-2">Subscription</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{subStatus?.tier?.name ?? "Free"}</strong>
            {subStatus?.devOverride && " (dev override)"}
          </p>
          {subStatus?.currentPeriodEnd && (
            <p className="text-xs text-muted-foreground mt-1">
              {subStatus.endsAtPeriodEnd ? "Access until" : "Renews"} {new Date(subStatus.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
          <Link href={getPath("dashboardAccount", locale)} className="mt-2 inline-block text-sm text-primary hover:underline">
            Manage in Account →
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h2 className="font-semibold text-sm mb-2">Desktop app</h2>
          <p className="text-sm text-muted-foreground mb-3">Run Minecraft servers. Sign in for Share and encrypted keys.</p>
          <div className="flex flex-wrap gap-2">
            {openInAppUrl && (
              <button
                type="button"
                onClick={() => {
                  const auth = authPayload ?? getStoredAuth();
                  if (auth) sendAuthToDevAppAndRedirect(auth);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Open in iHost app
              </button>
            )}
            {process.env.NEXT_PUBLIC_DOWNLOAD_URL && (
              <a
                href={process.env.NEXT_PUBLIC_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Download
              </a>
            )}
          </div>
          {openInAppUrl && <p className="text-xs text-muted-foreground mt-2">Have the app running first; your browser may ask to open it.</p>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
