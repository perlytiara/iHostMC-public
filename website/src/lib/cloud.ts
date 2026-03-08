/** Shared types and helpers for Cloud / Backups / Sync UI */

/** Label for interval schedule: 1 = "Hourly", else "Every X hours". */
export function getIntervalLabel(hours: number): string {
  return hours === 1 ? "Hourly" : `Every ${hours} hours`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

/** File tree node from snapshot manifest (Rust or backend). */
export interface SnapshotFileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  tier?: string;
  category?: string;
  /** Tag for backup scope: must | cache | mini | big. */
  tag?: SnapshotFileTag;
  children?: SnapshotFileTreeNode[];
}

/** File tag for backup scope: must = essential, cache = cache/logs, big = large files, mini = small stored. */
export type SnapshotFileTag = "must" | "cache" | "big" | "mini";

/** Category breakdown from Rust or app (essential vs downloadable). */
export interface SnapshotCategories {
  config?: number;
  world?: number;
  mod?: number;
  plugin?: number;
  library?: number;
  jar?: number;
  cache?: number;
  other?: number;
  essential_count?: number;
  downloadable_count?: number;
  /** Counts by tag for UI and restore. */
  must_count?: number;
  cache_count?: number;
  mini_count?: number;
  big_count?: number;
}

/** Server preset: enough to re-download server jar and identify loader (e.g. Paper 1.20.1). */
export interface SnapshotPreset {
  server_type?: string;
  minecraft_version?: string;
  loader_version?: string;
  /** e.g. Paper build ID or Forge version for download URL. */
  build_id?: string;
}

/** Manifest stored when snapshot was created (from sync_manifests or app). */
export interface SnapshotManifest {
  file_tree?: SnapshotFileTreeNode[];
  mods?: string[];
  plugins?: string[];
  fileList?: string[];
  version?: string;
  syncedAt?: string;
  server_name?: string;
  server_type?: string;
  minecraft_version?: string;
  categories?: SnapshotCategories;
  /** Preset for restore: server type + version so server jar can be fetched. */
  preset?: SnapshotPreset;
  /** Paths tagged as must (essential config, small critical files). */
  mustFiles?: string[];
  /** Paths tagged as cache (logs, cache – can skip or backup separately). */
  cacheFiles?: string[];
  [key: string]: unknown;
}

/** What to include in a backup: full (default), must only, or must + mini. */
export type BackupScope = "full" | "must_only" | "must_and_mini";

export interface BackupMetadata {
  mods?: string[];
  plugins?: string[];
  filesOnBackup?: number;
  filesMissing?: number;
  filesTooBig?: number;
  fileList?: string[];
  bigFileList?: string[];
  /** Paths of files stored as mini (small) tier in this snapshot. */
  miniFiles?: string[];
  /** Paths of files stored as big tier in this snapshot. */
  bigFiles?: string[];
  /** Paths tagged must (essential). */
  mustFiles?: string[];
  /** Paths tagged cache (logs, cache). */
  cacheFiles?: string[];
  /** Full manifest at snapshot time (tree, mods, plugins, preset). */
  snapshotManifest?: SnapshotManifest;
  version?: string;
  minecraftVersion?: string;
  gameVersion?: string;
  /** Loader type: Paper, Forge, Vanilla, etc. (from app/sync_servers). */
  server_type?: string;
  /** Server display name (from sync_servers or snapshot manifest). */
  server_name?: string;
  source?: "sync_snapshot";
  /** Scope used when creating this backup (default full). */
  backupScope?: BackupScope;
  /** Save tier from backend: snapshot | structural | full | world. */
  saveTier?: "snapshot" | "structural" | "full" | "world";
  /** When "world", backup is map/world only. */
  scope?: "world";
  /** Path prefixes included (custom backup from app). e.g. ["world", "config", "mods"]. */
  includePaths?: string[];
  /** Set when created by iteration; used to replace previous same-type backup. */
  iterationType?: "3h" | "daily" | "weekly" | "monthly";
  /** Slot id for iteration (e.g. date for daily, week for weekly). */
  iterationSlot?: string;
}

export interface BackupItem {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  createdAt: string;
  serverId?: string;
  serverName?: string;
  metadata?: BackupMetadata;
}

export interface TrashItem extends BackupItem {
  deletedAt: string;
  purgeAt: string | null;
}

/** Display tier: snapshot (metadata only), structural (mini, no worlds), full (everything), world (map only), custom (chosen folders). */
export type BackupTierDisplay = "snapshot" | "structural" | "full" | "world" | "custom";

/** Prefer API kind/saveTier; fall back to derived scope for legacy backups. Custom = has includePaths and not scope world. */
export function getBackupTier(b: { kind: string; metadata?: BackupMetadata }): BackupTierDisplay {
  const meta = b.metadata;
  if (meta?.scope === "world") return "world";
  if (Array.isArray(meta?.includePaths) && meta.includePaths.length > 0) return "custom";
  const k = (b.kind ?? "").toLowerCase();
  if (k === "snapshot" || k === "structural" || k === "full" || k === "world") return k as BackupTierDisplay;
  if (k === "mini") return "structural";
  if (meta?.saveTier) return meta.saveTier as BackupTierDisplay;
  const saved = meta?.filesOnBackup ?? 0;
  const missing = meta?.filesMissing ?? 0;
  const total = saved + missing;
  if (total > 0) {
    const ratio = saved / total;
    if (ratio >= 0.95) return "full";
    if (saved > 0) return "structural";
    return "snapshot";
  }
  if (saved > 0) return "structural";
  return "snapshot";
}

export function getTierLabel(tier: BackupTierDisplay): string {
  if (tier === "full") return "Full";
  if (tier === "structural") return "Mini";
  if (tier === "world") return "Map";
  if (tier === "custom") return "Custom";
  return "Snapshot";
}

export function getTierDescription(tier: BackupTierDisplay): string {
  if (tier === "snapshot") return "Essentials only: preset, file tree, mod/plugin list, how to get server JAR. No file contents — free to save many.";
  if (tier === "structural") return "Config, mods & plugins (no worlds). Server JAR can be included in app options.";
  if (tier === "world") return "World/map folders only (world, world_nether, world_the_end).";
  if (tier === "custom") return "Selected folders only (World, Config, Mods, Plugins, etc.). Chosen in the app.";
  return "Full: config, mods, plugins, worlds and large files. Server JAR included by default.";
}

/** Map path prefixes from custom backup metadata to display labels. */
const INCLUDE_PATH_LABELS: Record<string, string> = {
  world: "World",
  world_nether: "World",
  world_the_end: "World",
  "DIM-1": "World",
  DIM1: "World",
  config: "Config",
  mods: "Mods",
  plugins: "Plugins",
  libraries: "Libraries",
  cache: "Cache & logs",
  logs: "Cache & logs",
};

/** Return human-readable tags for a custom backup (from metadata.includePaths). Deduplicated and sorted. */
export function getCustomBackupTags(metadata?: BackupMetadata): string[] {
  const paths = metadata?.includePaths;
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const seen = new Set<string>();
  for (const p of paths) {
    const label = INCLUDE_PATH_LABELS[p] ?? (p.charAt(0).toUpperCase() + p.slice(1));
    seen.add(label);
  }
  return Array.from(seen).sort();
}

export interface SyncServer {
  id: string;
  hostId: string;
  name: string;
  lastSyncedAt: string | null;
  lastBackupAt: string | null;
  backupCount: number;
  miniSynced: boolean;
  archived?: boolean;
  trashedAt?: string | null;
  metadata: Record<string, unknown> & {
    mods?: string[];
    plugins?: string[];
    version?: string;
    minecraftVersion?: string;
    gameVersion?: string;
  };
  updatedAt: string;
  /** Iteration schedule (from app): same as in app Backup & Sync tab */
  iterationEvery3h?: boolean;
  iterationDaily?: boolean;
  iterationWeekly?: boolean;
  iterationLast3hAt?: string | null;
  iterationLastDailyAt?: string | null;
  iterationLastWeeklyAt?: string | null;
  iterationDailyAt?: string | null;
  iterationWeeklyOn?: number | null;
  iterationMonthly?: boolean;
  iterationMonthlyDay?: number | null;
  iterationMonthlyAt?: string | null;
  iterationLastMonthlyAt?: string | null;
  iterationIntervalHours?: number | null;
  /** Save tier for automatic iterations: snapshot | structural | full. */
  iterationSaveTier?: "snapshot" | "structural" | "full" | null;
}

export type ServerSummary = { mini: number; big: number; miniBytes: number; bigBytes: number };

/** Next run time from last run ISO string; interval: "3h" | "daily" | "weekly" | "monthly". Returns null if no lastRun or invalid. */
export function getNextRunAt(
  lastRun: string | null | undefined,
  interval: "3h" | "daily" | "weekly" | "monthly",
  opts?: { intervalHours?: number; monthlyDay?: number }
): Date | null {
  if (!lastRun) return null;
  const last = new Date(lastRun).getTime();
  if (Number.isNaN(last)) return null;
  if (interval === "3h") {
    const hours = Math.min(24, Math.max(1, opts?.intervalHours ?? 1));
    return new Date(last + hours * 60 * 60 * 1000);
  }
  if (interval === "daily") return new Date(last + 24 * 60 * 60 * 1000);
  if (interval === "weekly") return new Date(last + 7 * 24 * 60 * 60 * 1000);
  if (interval === "monthly") {
    const lastDate = new Date(last);
    const day = Math.min(31, Math.max(1, opts?.monthlyDay ?? 1));
    let nextMonthIdx = lastDate.getMonth() + 1;
    let nextYear = lastDate.getFullYear();
    if (nextMonthIdx > 11) {
      nextMonthIdx = 0;
      nextYear += 1;
    }
    const daysInNextMonth = new Date(nextYear, nextMonthIdx + 1, 0).getDate();
    const safeDay = Math.min(day, daysInNextMonth);
    return new Date(nextYear, nextMonthIdx, safeDay);
  }
  return null;
}

export type SyncedFile = {
  id: string;
  filePath: string;
  sizeBytes: number;
  storageTier: string;
  syncedAt: string | null;
};
