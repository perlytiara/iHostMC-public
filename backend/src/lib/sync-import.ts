import path from "path";
import fs from "fs";
import unzipper from "unzipper";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { IMPORT_MANIFEST_FILENAME, validateSnapshotPayload } from "./export-import.js";

function getSyncStorageDir(userId: string, serverId: string): string {
  const base = config.backupStoragePath || "/tmp/ihostmc-sync";
  return path.join(base, "sync", userId, serverId);
}

export interface SyncImportResult {
  serverId: string;
  serverName: string;
  fileCount: number;
  totalBytes: number;
}

/**
 * Import a ZIP that contains ihostmc-import.json at root. Creates a new sync_servers row and
 * sync_files rows, writing file contents to sync storage.
 */
export async function importSyncFromZip(
  userId: string,
  zipPath: string
): Promise<{ error: string } | SyncImportResult> {
  const tempDir = path.join(config.backupStoragePath || "/tmp/ihostmc-sync", "sync", ".tmp", `import-${uuidv4()}`);
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const extract = unzipper.Extract({ path: tempDir });
    fs.createReadStream(zipPath).pipe(extract);
    await extract.promise();

    const manifestPath = path.join(tempDir, IMPORT_MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) {
      return { error: `ZIP must contain ${IMPORT_MANIFEST_FILENAME} at root.` };
    }
    const raw = fs.readFileSync(manifestPath, "utf-8");
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { error: "Invalid JSON in import manifest." };
    }
    if (!validateSnapshotPayload(payload)) {
      return { error: "Invalid iHostMC import manifest (format, version, server, manifest required)." };
    }

    const serverName = (payload.server as { name: string }).name || "Imported Server";
    const hostId = `imported-${uuidv4().slice(0, 8)}`;
    const serverId = uuidv4();

    const inserted = await query<{ id: string }>(
      `INSERT INTO sync_servers (id, user_id, host_id, name, mini_synced, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, now(), now()) RETURNING id`,
      [serverId, userId, hostId, serverName, JSON.stringify({ importedAt: new Date().toISOString() })]
    );
    if (!inserted.rows[0]) {
      return { error: "Failed to create server." };
    }

    const storageDir = getSyncStorageDir(userId, serverId);
    fs.mkdirSync(storageDir, { recursive: true });
    const basePath = config.backupStoragePath || "/tmp/ihostmc-sync";
    let fileCount = 0;
    let totalBytes = 0;

    const walk = async (dir: string, relativePrefix: string): Promise<void> => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const relative = relativePrefix ? `${relativePrefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(full, relative);
          continue;
        }
        if (relative === IMPORT_MANIFEST_FILENAME) continue;
        const filePath = relative.replace(/\\/g, "/");
        if (filePath.includes("..")) continue;
        const size = fs.statSync(full).size;
        const ext = path.extname(filePath) || ".dat";
        const storageName = `${uuidv4()}${ext}`;
        const destPath = path.join(storageDir, storageName);
        fs.copyFileSync(full, destPath);
        const relativePath = path.relative(basePath, destPath);
        const storageTier = size > 20 * 1024 * 1024 ? "big" : "mini";
        await query(
          `INSERT INTO sync_files (user_id, server_id, file_path, file_hash, size_bytes, storage_tier, encrypted, storage_path, synced_at)
           VALUES ($1, $2, $3, '', $4, $5, false, $6, now())`,
          [userId, serverId, filePath, size, storageTier, relativePath.replace(/\\/g, "/")]
        );
        fileCount++;
        totalBytes += size;
      }
    };
    await walk(tempDir, "");

    const manifestData = (payload as { manifest: Record<string, unknown> }).manifest;
    if (manifestData && typeof manifestData === "object") {
      await query(
        `INSERT INTO sync_manifests (user_id, server_id, manifest_type, file_count, total_bytes, manifest_data)
         VALUES ($1, $2, 'combined', $3, $4, $5)`,
        [userId, serverId, fileCount, totalBytes, JSON.stringify(manifestData)]
      ).catch(() => {});
    }

    return { serverId, serverName, fileCount, totalBytes };
  } finally {
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    } catch {}
  }
}
