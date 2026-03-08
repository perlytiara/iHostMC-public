import { query } from "../db/pool.js";
import { config } from "../config.js";
import { getEffectiveTier } from "../tier-resolver.js";

const SNAPSHOT_PATH_PREFIX = "__snapshot_";

export type IterationType = "3h" | "daily" | "weekly" | "monthly";

function getIterationSlot(type: IterationType): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  if (type === "3h") return `${y}-${m}-${d}-${h}`;
  if (type === "daily") return `${y}-${m}-${d}`;
  if (type === "monthly") return `${y}-${m}`;
  const startOfYear = new Date(y, 0, 1);
  const weekNo = Math.ceil((now.getTime() - startOfYear.getTime()) / 86400000 / 7);
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

export interface CreateArchiveResult {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  createdAt: string;
  serverId: string;
}

/** Save tier: snapshot = metadata only; structural = mini files (config, mods, no world); full = mini + big (everything); world = world/map only. */
export type SaveTier = "snapshot" | "structural" | "full" | "world";

export interface CreateArchiveOptions {
  /** When set, previous backup with same iterationType for this server is moved to trash (replace on occurrence). */
  iterationType?: IterationType;
  /** Requested tier. When set, stored as backup kind. "snapshot" = manifest only (no synced files). Otherwise kind is derived from content. */
  saveTier?: SaveTier;
  /** When "world", only include paths that are world/map folders (world, world_nether, world_the_end, DIM-1, DIM1). */
  scope?: "world";
  /** When set, only include files whose path starts with one of these prefixes (e.g. ["world/", "world_nether/"]). */
  includePaths?: string[];
}

function isWorldPath(path: string): boolean {
  const first = (path.split("/")[0] ?? "").replace(/\\/g, "/");
  return first === "world" || first.startsWith("world_") || first === "DIM-1" || first === "DIM1";
}

function pathMatchesPrefixes(path: string, prefixes: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  return prefixes.some((p) => normalized === p || normalized.startsWith(p + "/") || normalized.startsWith(p));
}

/**
 * Create a backup (archive) from current synced data for a server.
 * Used by POST /api/sync/servers/:serverId/archive and by iteration scheduler.
 * When iterationType is set, replaces the previous backup of that type (3h/daily/weekly) for this server.
 */
export async function createArchiveFromSync(
  userId: string,
  serverId: string,
  name: string,
  options?: CreateArchiveOptions
): Promise<CreateArchiveResult | null> {
  try {
    const iterationType = options?.iterationType;
    const saveTier = options?.saveTier;
    const scope = options?.scope;
    const includePaths = options?.includePaths;
    const iterationSlot = iterationType ? getIterationSlot(iterationType) : undefined;

    const tier = await getEffectiveTier(userId);
    const hasBackupTier = tier.id === "backup" || tier.id === "pro";
    const maxBackups = hasBackupTier ? config.backupTierMaxBackups : config.freeTierMaxBackups;

    if (!iterationType) {
      const countResult = await query<{ n: string }>(
        "SELECT COUNT(*) AS n FROM backups WHERE user_id = $1 AND (deleted_at IS NULL) AND (kind IS NULL OR kind != 'snapshot')",
        [userId]
      ).catch(() => query<{ n: string }>("SELECT COUNT(*) AS n FROM backups WHERE user_id = $1 AND (kind IS NULL OR kind != 'snapshot')", [userId]));
      const count = parseInt(countResult.rows[0]?.n ?? "0", 10);
      if (count >= maxBackups) return null;
    }

    const serverRow = await query<{ name: string; metadata: unknown }>(
      "SELECT name, metadata FROM sync_servers WHERE id = $1 AND user_id = $2",
      [serverId, userId]
    );
    const srv = serverRow.rows[0];
    const serverMetadata = (srv?.metadata && typeof srv.metadata === "object" ? srv.metadata : {}) as Record<string, unknown>;

    let snapshotManifest: Record<string, unknown> | undefined;
    try {
      const manifestResult = await query<{ manifest_data: unknown }>(
        `SELECT manifest_data FROM sync_manifests
         WHERE server_id = $1 AND user_id = $2 AND manifest_type = 'combined'
         ORDER BY created_at DESC LIMIT 1`,
        [serverId, userId]
      );
      const mrow = manifestResult.rows[0];
      if (mrow?.manifest_data && typeof mrow.manifest_data === "object") {
        snapshotManifest = mrow.manifest_data as Record<string, unknown>;
      }
    } catch {
      // sync_manifests may be missing or empty
    }

    const manifestOnly = saveTier === "snapshot";
    let fileList: string[] = [];
    let totalSize = 0;
    let miniFiles: string[] = [];
    let bigFiles: string[] = [];

    if (!manifestOnly) {
      const filesResult = await query<{ file_path: string; size_bytes: string; storage_tier: string }>(
        "SELECT file_path, size_bytes, storage_tier FROM sync_files WHERE server_id = $1 AND user_id = $2 ORDER BY file_path",
        [serverId, userId]
      );
      let allPaths = filesResult.rows.map((r) => r.file_path);
      if (scope === "world" || (includePaths && includePaths.length > 0)) {
        const filter = scope === "world"
          ? (p: string) => isWorldPath(p)
          : (p: string) => pathMatchesPrefixes(p, includePaths!);
        allPaths = allPaths.filter(filter);
      }
      fileList = allPaths;
      const pathSet = new Set(allPaths);
      totalSize = filesResult.rows
        .filter((r) => pathSet.has(r.file_path))
        .reduce((sum, r) => sum + parseInt(r.size_bytes, 10), 0);
      miniFiles = filesResult.rows
        .filter((r) => r.storage_tier === "mini" && pathSet.has(r.file_path))
        .map((r) => r.file_path);
      bigFiles = filesResult.rows
        .filter((r) => r.storage_tier === "big" && pathSet.has(r.file_path))
        .map((r) => r.file_path);
    }

    const derivedKind: SaveTier =
      saveTier === "world" || (scope === "world" && fileList.length > 0)
        ? "world"
        : saveTier != null
          ? saveTier
          : fileList.length === 0
            ? "snapshot"
            : bigFiles.length > 0
              ? "full"
              : "structural";

    const metadata: Record<string, unknown> = {
      ...serverMetadata,
      fileList,
      filesOnBackup: fileList.length,
      source: "sync_snapshot",
      saveTier: derivedKind,
      ...(scope === "world" && { scope: "world" }),
      ...(includePaths && includePaths.length > 0 && { includePaths }),
      miniFiles: miniFiles.length > 0 ? miniFiles : undefined,
      bigFiles: bigFiles.length > 0 ? bigFiles : undefined,
      ...(snapshotManifest && { snapshotManifest }),
      ...(iterationType && { iterationType, iterationSlot }),
    };

    if (iterationType) {
      const previous = await query<{ id: string }>(
        `SELECT id FROM backups WHERE user_id = $1 AND server_id = $2 AND deleted_at IS NULL
         AND metadata->>'iterationType' = $3`,
        [userId, serverId, iterationType]
      ).catch(() => ({ rows: [] as { id: string }[] }));
      for (const r of previous.rows) {
        await query(
          "UPDATE backups SET deleted_at = now() WHERE id = $1 AND user_id = $2",
          [r.id, userId]
        );
        await query(
          "UPDATE sync_servers SET backup_count = GREATEST(0, backup_count - 1), updated_at = now() WHERE id = $1 AND user_id = $2",
          [serverId, userId]
        );
      }
    }

    const storagePath = `${userId}/${SNAPSHOT_PATH_PREFIX}${serverId}_${Date.now()}`;
    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO backups (user_id, server_id, name, kind, size_bytes, storage_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [userId, serverId, name, derivedKind, totalSize, storagePath, JSON.stringify(metadata)]
    );
    const row = inserted.rows[0];
    if (!row?.id) return null;

    await query(
      `UPDATE sync_servers SET backup_count = backup_count + 1, last_backup_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
      [serverId, userId]
    );

    return {
      id: row.id,
      name,
      kind: derivedKind,
      sizeBytes: totalSize,
      createdAt: row.created_at,
      serverId,
    };
  } catch {
    return null;
  }
}
