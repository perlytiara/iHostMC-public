/**
 * Re-sync CurseForge API key from backend into Tauri so Mods/Plugins can use it.
 * Call before CurseForge search so the app uses the latest key (e.g. after adding it on the website).
 */
import { getToken } from "@/features/auth";
import { api, isBackendConfigured } from "@/lib/api-client";
import { isTauri } from "@/lib/utils";

export async function syncCurseforgeKeyFromBackend(): Promise<void> {
  if (!isTauri() || !isBackendConfigured()) return;
  const token = getToken();
  if (!token) return;
  try {
    const { key } = await api.getRelayCurseforgeKey(token);
    if (key?.trim()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_curseforge_api_key", { key: key.trim() });
    }
  } catch {
    // ignore
  }
}
