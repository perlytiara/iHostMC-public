import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, getApiBaseUrl, type SyncFileInfo, type SyncSummary } from "@/lib/api-client";
import { isTauri } from "@/lib/utils";

export type FileSyncStatus = "pending" | "scanning" | "uploading" | "done" | "skipped" | "failed";

export interface FileSyncProgress {
  filePath: string;
  status: FileSyncStatus;
  error?: string;
}

export interface SyncFilesState {
  syncing: boolean;
  progress: FileSyncProgress[];
  current: number;
  total: number;
  error: string | null;
  syncedFiles: SyncFileInfo[];
  summary: SyncSummary | null;
  lastSyncCompletedAt: string | null;
  syncMiniFiles: (serverId: string, backendServerId: string, options?: { includeBig?: boolean; includeServerJar?: boolean }) => Promise<number>;
  refreshSyncedFiles: (backendServerId: string) => Promise<void>;
  refreshSummary: (backendServerId: string) => Promise<void>;
}

export function useSyncFiles(token: string | null, backendServerId: string | null = null): SyncFilesState {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<FileSyncProgress[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncedFiles, setSyncedFiles] = useState<SyncFileInfo[]>([]);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [lastSyncCompletedAt, setLastSyncCompletedAt] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const syncTargetRef = useRef<string | null>(null);
  const progressRef = useRef<FileSyncProgress[]>([]);

  const STORAGE_KEY_PREFIX = "ihostmc-sync-last-";

  const loadPersistedProgress = useCallback((serverId: string) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + serverId);
      if (!raw) return;
      const data = JSON.parse(raw) as { progress: FileSyncProgress[]; current: number; total: number; completedAt?: string };
      if (Array.isArray(data.progress)) {
        // Never restore failed state so we don't flash old errors
        const withoutFailed = data.progress.filter((p) => p.status !== "failed");
        setProgress(withoutFailed);
        progressRef.current = withoutFailed;
        setCurrent(data.current ?? 0);
        setTotal(data.total ?? 0);
        setLastSyncCompletedAt(data.completedAt ?? null);
      }
    } catch {
      // ignore
    }
  }, []);

  const savePersistedProgress = useCallback((backendServerId: string, progressData: FileSyncProgress[], currentVal: number, totalVal: number) => {
    const completedAt = new Date().toISOString();
    try {
      // Don't persist failed entries so we never reload and flash old errors
      const withoutFailed = progressData.filter((p) => p.status !== "failed");
      localStorage.setItem(
        STORAGE_KEY_PREFIX + backendServerId,
        JSON.stringify({
          progress: withoutFailed,
          current: currentVal,
          total: totalVal,
          completedAt,
        })
      );
      setLastSyncCompletedAt(completedAt);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    listen<{
      server_id: string;
      file_path: string;
      status: string;
      current: number;
      total: number;
      error: string | null;
    }>("sync-progress", (event) => {
      if (cancelled) return;
      const { file_path, status, current: c, total: t, error: e } = event.payload;
      setCurrent(c);
      setTotal(t);

      if (status === "scanning") return;

      setProgress((prev) => {
        const entry: FileSyncProgress = {
          filePath: file_path,
          status: status as FileSyncStatus,
          error: e ?? undefined,
        };
        const existing = prev.findIndex((p) => p.filePath === file_path);
        const next =
          existing >= 0
            ? (() => {
                const arr = [...prev];
                arr[existing] = entry;
                return arr;
              })()
            : [...prev, entry];
        progressRef.current = next;
        return next;
      });
    }).then((unlisten) => {
      if (cancelled) { unlisten(); return; }
      unlistenRef.current = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (backendServerId && !syncing) {
      loadPersistedProgress(backendServerId);
    }
  }, [backendServerId, syncing, loadPersistedProgress]);

  const syncMiniFiles = useCallback(
    async (
      serverId: string,
      backendServerIdParam: string,
      options?: { includeBig?: boolean; includeServerJar?: boolean }
    ): Promise<number> => {
      if (!isTauri() || !token) return 0;
      const apiBase = getApiBaseUrl();
      if (!apiBase) throw new Error("API not configured");

      setSyncing(true);
      setProgress([]);
      progressRef.current = [];
      setCurrent(0);
      setTotal(0);
      setError(null);
      // Clear any previously persisted state so we never reload old failures
      try {
        localStorage.removeItem(STORAGE_KEY_PREFIX + backendServerIdParam);
      } catch {
        // ignore
      }

      try {
        const count = await invoke<number>("sync_mini_files", {
          serverId,
          apiBase,
          token,
          backendServerId: backendServerIdParam,
          includeBig: options?.includeBig ?? false,
          excludeServerJar: options?.includeServerJar === false,
        });
        return count;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return 0;
      } finally {
        syncTargetRef.current = backendServerIdParam;
        setSyncing(false);
      }
    },
    [token]
  );

  const prevSyncingRef = useRef(false);
  useEffect(() => {
    const justFinished = prevSyncingRef.current && !syncing;
    prevSyncingRef.current = syncing;
    if (justFinished && syncTargetRef.current) {
      const target = syncTargetRef.current;
      syncTargetRef.current = null;
      const toSave = progressRef.current.length > 0 ? progressRef.current : progress;
      savePersistedProgress(target, toSave, current, total);
    }
  }, [syncing, progress, current, total, savePersistedProgress]);

  const refreshSyncedFiles = useCallback(
    async (backendServerId: string) => {
      if (!token || !getApiBaseUrl()) return;
      try {
        const resp = await api.getSyncFiles(token, backendServerId, { limit: 2500 });
        setSyncedFiles(resp.files);
      } catch {
        setSyncedFiles([]);
      }
    },
    [token]
  );

  const refreshSummary = useCallback(
    async (backendServerId: string) => {
      if (!token || !getApiBaseUrl()) return;
      try {
        const s = await api.getSyncSummary(token, backendServerId);
        setSummary(s);
      } catch {
        setSummary(null);
      }
    },
    [token]
  );

  return {
    syncing,
    progress,
    current,
    total,
    error,
    syncedFiles,
    summary,
    lastSyncCompletedAt,
    syncMiniFiles,
    refreshSyncedFiles,
    refreshSummary,
  };
}
