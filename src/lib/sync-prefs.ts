/** localStorage key for "sync automatically when app opens" (default true). */
export const AUTO_BACKUP_STORAGE_KEY = "ihostmc-auto-backup";

export function getAutoBackupEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (raw === "false") return false;
    if (raw === "true") return true;
  } catch {
    // ignore
  }
  return true;
}

export function setAutoBackupEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}
