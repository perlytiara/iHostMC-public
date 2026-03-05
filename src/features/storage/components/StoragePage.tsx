"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HardDrive,
  ExternalLink,
  Server,
  FileArchive,
  RefreshCw,
  Loader2,
  FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken } from "@/features/auth";
import { api, getApiBaseUrl, getWebsiteBackupsUrl, getCloudServerUrl } from "@/lib/api-client";
import type { SyncServerInfo } from "@/lib/api-client";
import type { BackupListItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface StoragePageProps {
  onOpenAccount?: () => void;
}

export function StoragePage({ onOpenAccount }: StoragePageProps) {
  const { t } = useTranslation();
  const token = getToken();
  const [syncedServers, setSyncedServers] = useState<SyncServerInfo[]>([]);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [report, setReport] = useState<{
    totalSizeBytes: number;
    totalCount: number;
    storageLimitBytes: number | null;
    miniBytes?: number;
    bigBytes?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token || !getApiBaseUrl()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [serversRes, listRes, reportRes] = await Promise.all([
        api.getSyncServers(token),
        api.getBackupList(token),
        api.getBackupReport(token).catch(() => null),
      ]);
      setSyncedServers(Array.isArray(serversRes) ? serversRes : []);
      setBackups(Array.isArray(listRes) ? listRes : []);
      setReport(
        reportRes
          ? {
              totalSizeBytes: reportRes.totalSizeBytes ?? 0,
              totalCount: reportRes.totalCount ?? 0,
              storageLimitBytes: reportRes.storageLimitBytes ?? null,
              miniBytes: reportRes.miniBytes,
              bigBytes: reportRes.bigBytes,
            }
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSyncedServers([]);
      setBackups([]);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const websiteBackupsUrl = getWebsiteBackupsUrl();

  if (!getApiBaseUrl()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <FolderArchive className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("storage.backendNotConfigured", { defaultValue: "Backend not configured" })}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <HardDrive className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("storage.signInPrompt", { defaultValue: "Sign in to view backups and storage" })}</p>
        {onOpenAccount && (
          <Button variant="default" onClick={onOpenAccount}>
            {t("storage.openAccount", { defaultValue: "Sign in" })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{t("storage.title", { defaultValue: "Backups & storage" })}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t("storage.refresh", { defaultValue: "Refresh" })}
            </Button>
            {websiteBackupsUrl && (
              <a
                href={websiteBackupsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("storage.browseOnWeb", { defaultValue: "Browse on web" })}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        {loading && !report && !syncedServers.length ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Storage usage */}
            {report && (
              <section className="rounded-xl border border-border bg-card/50 p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">{t("storage.usage", { defaultValue: "Storage usage" })}</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {t("storage.totalUsed", { defaultValue: "Used" })}: <span className="font-medium text-foreground">{formatBytes(report.totalSizeBytes)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t("storage.backupCount", { defaultValue: "Backups" })}: <span className="font-medium text-foreground">{report.totalCount}</span>
                  </span>
                  {report.storageLimitBytes != null && report.storageLimitBytes > 0 && (
                    <span className="text-muted-foreground">
                      {t("storage.limit", { defaultValue: "Limit" })}: <span className="font-medium text-foreground">{formatBytes(report.storageLimitBytes)}</span>
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* Synced servers */}
            <section className="rounded-xl border border-border bg-card/50 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t("storage.servers", { defaultValue: "Your servers" })}</h2>
              {syncedServers.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("storage.noServersSynced", { defaultValue: "No servers synced yet. Go to Servers → select a server → Backup & Sync." })}</p>
              ) : (
                <ul className="space-y-2">
                  {syncedServers.map((s) => {
                    const cloudUrl = getCloudServerUrl(s.id);
                    return (
                      <li key={s.id}>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium text-foreground">{s.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {s.backupCount} {t("storage.backups", { defaultValue: "backup(s)" })}
                            </span>
                          </div>
                          {cloudUrl && (
                            <a
                              href={cloudUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t("storage.viewOnWeb", { defaultValue: "View on web" })}
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Recent backups */}
            <section className="rounded-xl border border-border bg-card/50 p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t("storage.recentBackups", { defaultValue: "Recent backups" })}</h2>
              {backups.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("storage.noBackups", { defaultValue: "No backups yet. Create one from Servers → Backup & Sync." })}</p>
              ) : (
                <ul className="space-y-1.5">
                  {backups.slice(0, 20).map((b) => (
                    <li
                      key={b.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                        "border border-transparent hover:bg-muted/30"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileArchive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-foreground">{b.name}</span>
                        <span className="shrink-0 text-muted-foreground capitalize">{b.kind}</span>
                        {b.serverName && (
                          <span className="shrink-0 text-muted-foreground/80">{b.serverName}</span>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(b.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {backups.length > 20 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("storage.moreOnWeb", { defaultValue: "View all on the website." })}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
