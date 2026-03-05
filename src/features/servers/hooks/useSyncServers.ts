import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiBaseUrl, type SyncServerInfo } from "@/lib/api-client";
import type { ServerConfig } from "../types";

export interface SyncState {
  /** Last time we successfully synced all servers to the backend */
  lastSyncedAt: string | null;
  /** Currently running a sync */
  syncing: boolean;
  /** Error from last sync (cleared on next sync) */
  error: string | null;
  /** Server IDs that exist on the backend (from GET /api/sync/servers), so we can show "Synced" per server */
  syncedServers: SyncServerInfo[];
  /** Trigger a sync now. If serverId is passed, only that server is registered/synced and the backend server id is returned; otherwise all servers and returns undefined. */
  syncNow: (serverId?: string) => Promise<string | undefined>;
  /** Refresh list of synced servers from backend (GET /api/sync/servers) */
  refreshSynced: () => Promise<void>;
}

/**
 * Syncs local server list to iHost.one (or configured backend) so the website shows "Your servers"
 * and backup counts. Call syncNow() when user taps "Sync now", and optionally auto-sync when
 * servers or token become available.
 */
export function useSyncServers(
  servers: ServerConfig[],
  token: string | null,
  options?: { autoSyncOnLoad?: boolean }
): SyncState {
  const serversRef = useRef(servers);
  serversRef.current = servers;

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedServers, setSyncedServers] = useState<SyncServerInfo[]>([]);

  const refreshSynced = useCallback(async () => {
    if (!token || !getApiBaseUrl()) return;
    try {
      const list = await api.getSyncServers(token);
      setSyncedServers(list);
      setError(null);
    } catch (e) {
      setSyncedServers([]);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("migrations") || msg.includes("Sync not available")) setError(msg);
    }
  }, [token]);

  const syncNow = useCallback(async (serverId?: string): Promise<string | undefined> => {
    if (!token || !getApiBaseUrl()) {
      setError("Not signed in or backend not configured");
      return undefined;
    }
    setError(null);
    setSyncing(true);
    const minLoadingMs = 400;
    const start = Date.now();
    let backendId: string | undefined;
    try {
      const now = new Date().toISOString();
      const currentServers = serversRef.current;
      const toSync = serverId ? currentServers.filter((s) => s.id === serverId) : currentServers;
      for (const s of toSync) {
        const res = await api.syncServer(token, {
          hostId: s.id,
          name: s.name,
          lastSyncedAt: now,
          metadata: {
            server_type: s.server_type,
            minecraft_version: s.minecraft_version,
          },
        });
        if (serverId && s.id === serverId) backendId = res.id;
      }
      setLastSyncedAt(now);
      await refreshSynced();
      return backendId;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < minLoadingMs) {
        await new Promise((r) => setTimeout(r, minLoadingMs - elapsed));
      }
      setSyncing(false);
    }
  }, [token, refreshSynced]);

  // Defer initial fetch so the app shell can paint first (faster perceived load)
  useEffect(() => {
    if (!token || !getApiBaseUrl()) return;
    const useIdle = typeof requestIdleCallback !== "undefined";
    const id = useIdle
      ? requestIdleCallback(() => refreshSynced(), { timeout: 150 })
      : setTimeout(() => refreshSynced(), 0);
    return () => (useIdle ? cancelIdleCallback(id) : clearTimeout(id));
  }, [token, refreshSynced]);

  // Background interval: keep synced list live without blocking UI
  const BACKGROUND_REFRESH_MS = 2 * 60 * 1000;
  useEffect(() => {
    if (!token || !getApiBaseUrl()) return;
    const id = setInterval(() => refreshSynced(), BACKGROUND_REFRESH_MS);
    return () => clearInterval(id);
  }, [token, refreshSynced]);

  // Refetch when window/tab becomes visible (e.g. after disabling occurrences on the website)
  useEffect(() => {
    if (!token || !getApiBaseUrl()) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshSynced();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [token, refreshSynced]);

  useEffect(() => {
    if (options?.autoSyncOnLoad && token && servers.length > 0 && !syncing) {
      syncNow();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on token/servers change, not syncNow
  }, [!!token, servers.length, options?.autoSyncOnLoad]);

  return {
    lastSyncedAt,
    syncing,
    error,
    syncedServers,
    syncNow,
    refreshSynced,
  };
}
