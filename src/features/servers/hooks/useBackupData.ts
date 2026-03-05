import { useCallback, useEffect, useState } from "react";
import { api, getApiBaseUrl, type BackupReport, type BackupListItem } from "@/lib/api-client";

export interface BackupLimits {
  count: number;
  maxBackups: number;
}

export interface BackupDataState {
  report: BackupReport | null;
  list: BackupListItem[];
  limits: BackupLimits | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches backup report, list, and limits from the API for the Backup & Sync tab.
 * Storage is combined for all servers; filter list by syncedServer.id for "this server".
 */
export function useBackupData(token: string | null, enabled: boolean): BackupDataState {
  const [report, setReport] = useState<BackupReport | null>(null);
  const [list, setList] = useState<BackupListItem[]>([]);
  const [limits, setLimits] = useState<BackupLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !getApiBaseUrl() || !enabled) return;
    setError(null);
    setLoading(true);
    try {
      const [reportRes, listRes, limitsRes] = await Promise.all([
        api.getBackupReport(token),
        api.getBackupList(token),
        api.getBackupLimits(token),
      ]);
      setReport(reportRes);
      setList(Array.isArray(listRes) ? listRes : []);
      setLimits(limitsRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReport(null);
      setList([]);
      setLimits(null);
    } finally {
      setLoading(false);
    }
  }, [token, enabled]);

  useEffect(() => {
    if (token && getApiBaseUrl() && enabled) refresh();
  }, [token, enabled, refresh]);

  // Live sync with website: refetch backups when window gains focus (e.g. after editing on web)
  useEffect(() => {
    if (!enabled || !token || !getApiBaseUrl()) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, token, refresh]);

  return { report, list, limits, loading, error, refresh };
}
