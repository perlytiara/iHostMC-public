import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BackupManifest } from "@/lib/api-client";
import { buildManifestFromScan, type ScanEntry } from "../utils/backup-manifest";

export interface ServerBackupScanState {
  manifest: BackupManifest | null;
  scanning: boolean;
  error: string | null;
  scan: (serverId: string) => Promise<void>;
}

/**
 * Scan server files via Tauri and build manifest (small/big tiers, mod list).
 */
export function useServerBackupScan(): ServerBackupScanState {
  const [manifest, setManifest] = useState<BackupManifest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (serverId: string) => {
    if (!serverId) return;
    setError(null);
    setScanning(true);
    try {
      const entries = await invoke<ScanEntry[]>("scan_server_files_for_backup", {
        serverId,
      });
      const list = Array.isArray(entries) ? entries : [];
      const built = buildManifestFromScan(list);
      setManifest(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setManifest(null);
    } finally {
      setScanning(false);
    }
  }, []);

  return { manifest, scanning, error, scan };
}
