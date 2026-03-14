"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useServers } from "@/features/servers/hooks/useServers";
import { useSyncServers } from "@/features/servers/hooks/useSyncServers";
import { getToken } from "@/features/auth";
import { getApiBaseUrl, getWebsiteBackupsUrl, getWebsiteUrl, getHealth } from "@/lib/api-client";
import { applyCloudStateToLocal } from "@/lib/apply-cloud-state";
import { getAutoBackupEnabled, setAutoBackupEnabled } from "@/lib/sync-prefs";
import {
  getIterationsEnabledForNewServers,
  setIterationsEnabledForNewServers,
  setIterationSchedule,
} from "@/lib/iteration-prefs";
import { CloudCog, ExternalLink, Loader2, RefreshCw, Server, CheckCircle, AlertCircle, Clock, Zap } from "lucide-react";
import { toast } from "@/lib/toast-store";
import { useTranslation } from "react-i18next";
import { SaveTierHelper } from "./SaveTierHelper";

function getStorageHostLabel(): string {
  try {
    const websiteUrl = getWebsiteUrl();
    if (websiteUrl) return new URL(websiteUrl).hostname || "iHost.one";
    const base = getApiBaseUrl();
    if (!base) return "iHost.one";
    return new URL(base).hostname || "iHost.one";
  } catch {
    return "iHost.one";
  }
}

export function BackupSyncSection() {
  const { t } = useTranslation();
  const { servers, loading: serversLoading, refresh } = useServers();
  const token = getToken();
  const {
    lastSyncedAt,
    syncing,
    error,
    syncedServers,
    syncNow,
    refreshSynced,
  } = useSyncServers(servers, token, { autoSyncOnLoad: false });
  const [autoBackup, setAutoBackup] = useState(getAutoBackupEnabled);
  const [iterationsForNew, setIterationsForNew] = useState(getIterationsEnabledForNewServers);

  const storageHost = getStorageHostLabel();
  const backupsUrl = getWebsiteBackupsUrl();
  const hasBackend = !!getApiBaseUrl();
  const isSignedIn = !!token;

  const [syncAvailable, setSyncAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hasBackend) return;
    getHealth().then((h) => {
      setSyncAvailable(h.syncAvailable === true ? true : h.syncAvailable === false ? false : null);
    });
  }, [hasBackend]);

  useEffect(() => {
    if (!hasBackend || !isSignedIn || !refreshSynced || !refresh) return;
    refreshSynced().then((list) => {
      if (list?.length && servers.length) applyCloudStateToLocal(list, servers, refresh);
    });
  }, [hasBackend, isSignedIn, refreshSynced, refresh, servers.length]);

  const handleAutoBackupChange = (checked: boolean) => {
    setAutoBackupEnabled(checked);
    setAutoBackup(checked);
  };

  const handleIterationsForNewChange = (checked: boolean) => {
    setIterationsEnabledForNewServers(checked);
    setIterationsForNew(checked);
  };

  const handleEnableIterationsForAll = () => {
    servers.forEach((s) => setIterationSchedule(s.id, { every3h: true, daily: true, weekly: true }));
    toast.success(t("settings.backupSync.iterationsEnabledForAll", "Automatic backups enabled for all servers"));
  };

  const isSyncAvailable = syncAvailable === true;
  const syncedCount = syncedServers.length;
  const unsyncedCount = servers.length - servers.filter((s) => syncedServers.some((r) => r.hostId === s.id)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <CloudCog className="h-5 w-5 text-primary" />
          {t("settings.backupSync.title", "Backup cloud")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          {t("settings.backupSync.appRole", "Live synced data is the latest from the app. Save a snapshot (file log, mods, libraries) on the website. Snapshots & archives are saved backups; trash holds deleted items until purge.")}
        </p>
        {hasBackend && isSignedIn && syncAvailable !== null && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium mt-2 ${isSyncAvailable ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
            {isSyncAvailable ? <><CheckCircle className="h-3.5 w-3.5" /> {t("settings.backupSync.statusAvailable")}</> : <><AlertCircle className="h-3.5 w-3.5" /> {t("settings.backupSync.statusUnavailable")}</>}
          </span>
        )}
      </div>

      {!hasBackend && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Backend not configured. Set VITE_API_BASE_URL to enable sync.
        </div>
      )}
      {hasBackend && !isSignedIn && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Sign in to sync your servers and use cloud backups.
        </div>
      )}

      {hasBackend && isSignedIn && (
        <>
          {/* Quick sync — one primary action, dead simple */}
          <section className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Zap className="h-4 w-4 text-primary" />
              {t("settings.backupSync.quickSync", "Quick sync")}
            </h4>
            <p className="text-xs text-muted-foreground">
              {servers.length === 0
                ? t("settings.backupSync.noServers")
                : t("settings.backupSync.quickSyncDesc", { count: servers.length, synced: syncedCount, defaultValue: "Register and sync all servers to the cloud in one step." })}
              {unsyncedCount > 0 && ` ${unsyncedCount} pending.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="default"
                onClick={() => syncNow()}
                disabled={syncing || servers.length === 0 || !isSyncAvailable}
                className="gap-2"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? t("settings.backupSync.syncing", "Syncing…") : t("settings.backupSync.syncAll", "Sync all")}
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={async () => {
                  const list = await refreshSynced?.();
                  if (list && refresh) await applyCloudStateToLocal(list, servers, refresh);
                }}
                disabled={syncing}
                title={t("settings.backupSync.refreshFromCloudTitle", { defaultValue: "Reload server list from cloud (archive/trash from iHost.one)" })}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("settings.backupSync.refreshFromCloud", { defaultValue: "Refresh from cloud" })}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.backupSync.websiteSyncHint", { defaultValue: "Archive or trash on iHost.one? Use Refresh from cloud to see changes here." })}
            </p>
            {lastSyncedAt && (
              <p className="text-xs text-muted-foreground">
                {t("settings.backupSync.lastSynced", { defaultValue: "Last synced" })}: {new Date(lastSyncedAt).toLocaleString()}
              </p>
            )}
            {error && !error.includes("migrations") && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </section>

          {/* Backup options — grouped toggles and choices */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">
              {t("settings.backupSync.backupOptions", "Backup options")}
            </h4>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t("settings.backupSync.autoBackup", "Sync automatically when app opens")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("settings.backupSync.autoBackupHint", "Register all servers to the cloud when you open the app. New servers are also registered automatically when created. On by default.")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={(e) => handleAutoBackupChange(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="space-y-0.5 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-sm font-medium">
                    {t("settings.backupSync.iterationsForNewServers", "Automatic backups (iterations) for new servers")}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.backupSync.iterationsForNewServersHint", "When on, new servers get 3h / daily / weekly snapshots by default. Turn off to disable for new servers only.")}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={iterationsForNew}
                onChange={(e) => handleIterationsForNewChange(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
            </label>

            {servers.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-sm font-medium">{t("settings.backupSync.iterationsForAll", "Automatic backups for existing servers")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.backupSync.iterationsForAllHint", "Turn on 3h / daily / weekly snapshots for every server you have.")}
                </p>
                <Button variant="outline" size="sm" onClick={handleEnableIterationsForAll}>
                  {t("settings.backupSync.enableIterationsForAll", "Enable for all servers")}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
              {t("settings.backupSync.storageTiersHint")}
            </p>

            <SaveTierHelper />
          </section>

          {/* Your servers — list with sync status */}
          {servers.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <Server className="h-4 w-4" />
                {t("settings.backupSync.yourServers", "Your servers")}
              </h4>
              <ul className="space-y-1.5 text-sm">
                {servers.map((s) => {
                  const synced = syncedServers.find((r) => r.hostId === s.id);
                  return (
                    <li key={s.id} className="flex items-center gap-2">
                      {synced ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-muted-foreground/50 shrink-0" />
                      )}
                      <span className="truncate flex-1">{s.name}</span>
                      {synced && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {synced.backupCount} archive(s){synced.miniSynced ? " · Files synced" : ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Manage on web — snapshots, archives, trash */}
          {backupsUrl && (
            <section className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                {t("settings.backupSync.manageOnWeb", "Manage on web")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("settings.backupSync.webRole", "Open {{host}} to manage live sync, snapshots, archives, and trash. Sync here; manage there.", { host: storageHost })}
              </p>
              <a
                href={backupsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {t("settings.backupSync.openBackups", "Open {{host}}", { host: storageHost })}
              </a>
            </section>
          )}
        </>
      )}

      {serversLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading servers...
        </div>
      )}
    </div>
  );
}
