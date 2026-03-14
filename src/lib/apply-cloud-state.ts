import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";
import type { SyncServerInfo } from "@/lib/api-client";
import type { ServerConfig } from "@/features/servers/types";

/**
 * When backend says a server is active (not archived, not trashed), make local state match
 * so the app shows it as present/active. Call after fetching synced list from API.
 */
export async function applyCloudStateToLocal(
  syncedList: SyncServerInfo[],
  servers: ServerConfig[],
  refresh: () => Promise<void>
): Promise<void> {
  if (!isTauri()) return;
  let needRefresh = false;
  for (const s of syncedList) {
    if (s.trashedAt || s.archived) continue;
    const local = servers.find((l) => l.id === s.hostId);
    if (!local || (!local.archived && !local.trashed_at)) continue;
    try {
      await invoke("unarchive_server", { id: s.hostId });
      needRefresh = true;
    } catch {
      // ignore
    }
    try {
      await invoke("restore_server", { id: s.hostId });
      needRefresh = true;
    } catch {
      // ignore (e.g. not in trash)
    }
  }
  if (needRefresh) await refresh();
}
