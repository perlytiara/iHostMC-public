import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { getEffectiveTier } from "../tier-resolver.js";
import { encryptBuffer, decryptBuffer, canEncrypt } from "../lib/file-encrypt.js";
import { createArchiveFromSync } from "../lib/sync-archive.js";
import archiver from "archiver";
import { buildSnapshotPayload, IMPORT_MANIFEST_FILENAME } from "../lib/export-import.js";
import { importSyncFromZip } from "../lib/sync-import.js";

const router = Router();
router.use(authMiddleware);

const MAX_SYNC_FILE_SIZE = 500 * 1024 * 1024; // 500 MB per file (mini + big; nginx/client allow 1GB)
/** Skip encryption for files larger than this to avoid OOM (encryptBuffer loads full file in memory). */
const MAX_ENCRYPT_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

function syncStorageDir(userId: string, serverId: string): string {
  const base = config.backupStoragePath || "/tmp/ihostmc-sync";
  return path.join(base, "sync", userId, serverId);
}

function syncTempDir(): string {
  const base = config.backupStoragePath || "/tmp/ihostmc-sync";
  return path.join(base, "sync", ".tmp");
}

const syncUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = syncTempDir();
      try {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e as Error, "");
      }
    },
    filename: (_req, _file, cb) => {
      cb(null, `${uuidv4()}.tmp`);
    },
  }),
  limits: { fileSize: MAX_SYNC_FILE_SIZE },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncServerRow {
  id: string;
  host_id: string;
  name: string;
  last_synced_at: string | null;
  last_backup_at: string | null;
  backup_count: string;
  mini_synced: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  archived?: boolean;
  trashed_at?: string | null;
  iteration_every3h?: boolean;
  iteration_daily?: boolean;
  iteration_weekly?: boolean;
  iteration_last_3h_at?: string | null;
  iteration_last_daily_at?: string | null;
  iteration_last_weekly_at?: string | null;
}

interface SyncFileRow {
  id: string;
  file_path: string;
  file_hash: string;
  size_bytes: string;
  storage_tier: string;
  encrypted: boolean;
  synced_at: string;
  created_at: string;
}

interface SyncManifestRow {
  id: string;
  manifest_type: string;
  file_count: string;
  total_bytes: string;
  manifest_data: unknown;
  created_at: string;
}

const SYNC_NOT_AVAILABLE_MSG =
  "Sync not available. Run database migrations on the server (npm run db:migrate in backend).";

function noCache(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

function isTableMissing(msg: string): boolean {
  return (msg.includes("sync_servers") || msg.includes("sync_files") || msg.includes("sync_manifests")) &&
    msg.includes("does not exist");
}

function isIterationColumnMissing(msg: string): boolean {
  return msg.includes("iteration_every3h") || msg.includes("does not exist");
}

function mapServerRowToJson(r: SyncServerRow): Record<string, unknown> {
  const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
  return {
    id: r.id,
    hostId: r.host_id,
    name: r.name || "Unnamed",
    lastSyncedAt: r.last_synced_at,
    lastBackupAt: r.last_backup_at,
    backupCount: parseInt(r.backup_count, 10),
    miniSynced: r.mini_synced,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived ?? false,
    trashedAt: r.trashed_at ?? null,
    iterationEvery3h: r.iteration_every3h ?? false,
    iterationDaily: r.iteration_daily ?? false,
    iterationWeekly: r.iteration_weekly ?? false,
    iterationLast3hAt: r.iteration_last_3h_at ?? null,
    iterationLastDailyAt: r.iteration_last_daily_at ?? null,
    iterationLastWeeklyAt: r.iteration_last_weekly_at ?? null,
    iterationDailyAt: meta.iterationDailyAt ?? null,
    iterationWeeklyOn: meta.iterationWeeklyOn ?? null,
    iterationMonthly: meta.iterationMonthly === true,
    iterationMonthlyDay: typeof meta.iterationMonthlyDay === "number" ? meta.iterationMonthlyDay : null,
    iterationMonthlyAt: typeof meta.iterationMonthlyAt === "string" ? meta.iterationMonthlyAt : null,
    iterationLastMonthlyAt: typeof meta.iterationLastMonthlyAt === "string" ? meta.iterationLastMonthlyAt : null,
    iterationIntervalHours: typeof meta.iterationIntervalHours === "number" ? meta.iterationIntervalHours : null,
    iterationSaveTier:
      meta.iterationSaveTier === "snapshot" || meta.iterationSaveTier === "structural" || meta.iterationSaveTier === "full"
        ? meta.iterationSaveTier
        : null,
  };
}

/** POST /api/sync/import – upload a ZIP containing ihostmc-import.json to create a new sync server with files */
router.post(
  "/import",
  (req: Request, res: Response, next: () => void) => {
    syncUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        noCache(res);
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large" });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      noCache(res);
      res.status(400).json({ error: "No file uploaded. Send a ZIP with ihostmc-import.json at root." });
      return;
    }
    const zipPath = file.path;
    try {
      const result = await importSyncFromZip(userId, zipPath);
      if ("error" in result) {
        noCache(res);
        res.status(400).json({ error: result.error });
        return;
      }
      noCache(res);
      res.status(201).json({
        serverId: result.serverId,
        serverName: result.serverName,
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
      });
    } catch (e) {
      console.error("[sync] import:", (e as Error)?.message);
      noCache(res);
      res.status(500).json({ error: "Failed to import ZIP" });
    } finally {
      try {
        if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      } catch {}
    }
  }
);

// ─── Server CRUD (existing) ──────────────────────────────────────────────────

router.get("/servers", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const trashedOnly = req.query.trashed === "1" || req.query.trashed === "true";
  try {
    let result: { rows: SyncServerRow[] };
    const trashedClause = trashedOnly ? "AND trashed_at IS NOT NULL" : "AND (trashed_at IS NULL)";
    try {
      result = await query<SyncServerRow>(
        `SELECT id, host_id, name, last_synced_at, last_backup_at, backup_count, mini_synced, metadata, created_at, updated_at,
          COALESCE(archived, false) AS archived, trashed_at,
          iteration_every3h, iteration_daily, iteration_weekly,
          iteration_last_3h_at, iteration_last_daily_at, iteration_last_weekly_at
         FROM sync_servers WHERE user_id = $1 ${trashedClause} ORDER BY updated_at DESC`,
        [userId]
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (!isIterationColumnMissing(msg) && !msg.includes("trashed_at") && !msg.includes("archived")) throw e;
      if (trashedOnly) {
        noCache(res);
        res.json([]);
        return;
      }
      result = await query<SyncServerRow>(
        `SELECT id, host_id, name, last_synced_at, last_backup_at, backup_count, mini_synced, metadata, created_at, updated_at
         FROM sync_servers WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId]
      );
    }
    noCache(res);
    res.json(result.rows.map((r) => mapServerRowToJson(r)));
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    noCache(res);
    res.status(500).json({ error: "Failed to list servers" });
  }
});

router.post("/servers", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const body = req.body as {
    hostId?: string;
    name?: string;
    lastSyncedAt?: string;
    lastBackupAt?: string;
    backupCount?: number;
    miniSynced?: boolean;
    metadata?: Record<string, unknown>;
  };
  const hostId = typeof body.hostId === "string" ? body.hostId.trim() : "";
  if (!hostId) {
    res.status(400).json({ error: "hostId required" });
    return;
  }
  const name = typeof body.name === "string" ? body.name.trim() || "Unnamed" : "Unnamed";
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  try {
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO sync_servers (user_id, host_id, name, last_synced_at, last_backup_at, backup_count, mini_synced, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, false), COALESCE($8, '{}'::jsonb), now())
       ON CONFLICT (user_id, host_id) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), sync_servers.name),
         last_synced_at = COALESCE(EXCLUDED.last_synced_at, sync_servers.last_synced_at),
         last_backup_at = COALESCE(EXCLUDED.last_backup_at, sync_servers.last_backup_at),
         backup_count = COALESCE(EXCLUDED.backup_count, sync_servers.backup_count),
         mini_synced = COALESCE(EXCLUDED.mini_synced, sync_servers.mini_synced),
         metadata = COALESCE(sync_servers.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
         updated_at = now()
       RETURNING id, created_at`,
      [
        userId,
        hostId,
        name,
        body.lastSyncedAt || null,
        body.lastBackupAt || null,
        typeof body.backupCount === "number" ? body.backupCount : null,
        typeof body.miniSynced === "boolean" ? body.miniSynced : null,
        JSON.stringify(metadata),
      ]
    );
    const row = result.rows[0];
    if (!row) {
      noCache(res);
      res.status(500).json({ error: "Upsert failed" });
      return;
    }
    noCache(res);
    res.status(200).json({ id: row.id, hostId, name, createdAt: row.created_at });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      console.error("[sync] POST /servers: table missing:", msg);
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    console.error("[sync] POST /servers: unexpected error:", msg);
    noCache(res);
    res.status(500).json({ error: "Failed to save server" });
  }
});

/** GET /api/sync/servers/:serverId – single server by id (so detail page works even when list is empty/stale). */
router.get("/servers/:serverId", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  if (!serverId) {
    res.status(400).json({ error: "Server ID required" });
    return;
  }
  try {
    let result: { rows: SyncServerRow[] };
    try {
      result = await query<SyncServerRow>(
        `SELECT id, host_id, name, last_synced_at, last_backup_at, backup_count, mini_synced, metadata, created_at, updated_at,
          COALESCE(archived, false) AS archived, trashed_at,
          iteration_every3h, iteration_daily, iteration_weekly,
          iteration_last_3h_at, iteration_last_daily_at, iteration_last_weekly_at
         FROM sync_servers WHERE id = $1 AND user_id = $2 AND (trashed_at IS NULL)`,
        [serverId, userId]
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (!isIterationColumnMissing(msg) && !msg.includes("trashed_at") && !msg.includes("archived")) throw e;
      result = await query<SyncServerRow>(
        `SELECT id, host_id, name, last_synced_at, last_backup_at, backup_count, mini_synced, metadata, created_at, updated_at
         FROM sync_servers WHERE id = $1 AND user_id = $2`,
        [serverId, userId]
      );
    }
    if (result.rows.length > 0) {
      noCache(res);
      res.json(mapServerRowToJson(result.rows[0]!));
      return;
    }
    const stub = await query<{ server_id: string; name: string; metadata: unknown; created_at: string }>(
      `SELECT server_id, name, metadata, created_at FROM backups
       WHERE user_id = $1 AND server_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, serverId]
    );
    if (stub.rows.length > 0) {
      const row = stub.rows[0]!;
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      noCache(res);
      res.json({
        id: row.server_id,
        hostId: row.server_id,
        name: (row.name && row.name !== "Backup") ? row.name : ((meta.serverName as string) || "Server"),
        lastSyncedAt: null,
        lastBackupAt: row.created_at,
        backupCount: 1,
        miniSynced: false,
        metadata: meta,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      });
      return;
    }
    res.status(404).json({ error: "Server not found" });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    noCache(res);
    res.status(500).json({ error: "Failed to get server" });
  }
});

router.patch("/servers/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const body = req.body as {
    name?: string;
    lastSyncedAt?: string;
    lastBackupAt?: string;
    backupCount?: number;
    miniSynced?: boolean;
    metadata?: Record<string, unknown>;
    archived?: boolean;
    trashed?: boolean;
    restoreFromTrash?: boolean;
  };
  try {
    if (body.trashed === true) {
      const row = await query<{ id: string }>(
        "SELECT id FROM sync_servers WHERE id = $1 AND user_id = $2 AND (trashed_at IS NULL)",
        [id, userId]
      );
      if (row.rows.length === 0) { res.status(404).json({ error: "Server not found or already in trash" }); return; }
      await query(
        "UPDATE backups SET deleted_at = now() WHERE server_id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, userId]
      );
      await query(
        "UPDATE sync_servers SET trashed_at = now(), backup_count = 0, updated_at = now() WHERE id = $1 AND user_id = $2",
        [id, userId]
      );
      noCache(res);
      res.json({ ok: true, trashed: true });
      return;
    }
    if (body.restoreFromTrash === true) {
      const result = await query(
        "UPDATE sync_servers SET trashed_at = NULL, updated_at = now() WHERE id = $1 AND user_id = $2 AND trashed_at IS NOT NULL RETURNING id",
        [id, userId]
      );
      if (result.rowCount === 0) { res.status(404).json({ error: "Server not found or not in trash" }); return; }
      noCache(res);
      res.json({ ok: true, restored: true });
      return;
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (typeof body.name === "string") { updates.push(`name = $${i++}`); values.push(body.name.trim() || "Unnamed"); }
    if (typeof body.lastSyncedAt === "string") { updates.push(`last_synced_at = $${i++}`); values.push(body.lastSyncedAt); }
    if (typeof body.lastBackupAt === "string") { updates.push(`last_backup_at = $${i++}`); values.push(body.lastBackupAt); }
    if (typeof body.backupCount === "number") { updates.push(`backup_count = $${i++}`); values.push(body.backupCount); }
    if (typeof body.miniSynced === "boolean") { updates.push(`mini_synced = $${i++}`); values.push(body.miniSynced); }
    if (typeof body.archived === "boolean") { updates.push(`archived = $${i++}`); values.push(body.archived); }
    if (body.metadata && typeof body.metadata === "object") { updates.push(`metadata = $${i++}`); values.push(JSON.stringify(body.metadata)); }
    if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    updates.push(`updated_at = now()`);
    const result = await query(
      `UPDATE sync_servers SET ${updates.join(", ")} WHERE id = $${i} AND user_id = $${i + 1} RETURNING id`,
      [...values, id, userId]
    );
    if (result.rowCount === 0) { res.status(404).json({ error: "Server not found" }); return; }
    res.json({ ok: true });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("archived") || msg.includes("trashed_at")) {
      res.status(503).json({ error: "Server archive/trash not available. Run database migrations." });
      return;
    }
    res.status(500).json({ error: "Failed to update server" });
  }
});

/** DELETE /api/sync/servers/:id – permanently delete a server. Only allowed when server is in trash. Deletes server, all its backups, and sync data. */
router.delete("/servers/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Server ID required" });
    return;
  }
  try {
    const check = await query<{ id: string }>(
      "SELECT id FROM sync_servers WHERE id = $1 AND user_id = $2 AND trashed_at IS NOT NULL",
      [id, userId]
    );
    if (check.rows.length === 0) {
      res.status(400).json({
        error: "Server must be in trash before permanent delete. Move server to trash first from Servers or Archive.",
      });
      return;
    }
    const backups = await query<{ id: string; storage_path: string }>(
      "SELECT id, storage_path FROM backups WHERE server_id = $1 AND user_id = $2",
      [id, userId]
    );
    const basePath = config.backupStoragePath || "";
    for (const row of backups.rows) {
      if (row.storage_path && !row.storage_path.includes("__snapshot_")) {
        try {
          const fullPath = path.join(basePath, row.storage_path);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch {
          /* best effort */
        }
      }
    }
    await query("DELETE FROM backups WHERE server_id = $1 AND user_id = $2", [id, userId]);
    await clearSyncedDataForServer(userId, id);
    await query("DELETE FROM sync_servers WHERE id = $1 AND user_id = $2", [id, userId]);
    noCache(res);
    res.json({ ok: true });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    res.status(500).json({ error: "Failed to delete server" });
  }
});

// ─── File Sync Endpoints ─────────────────────────────────────────────────────

/** Verify server belongs to user and is not trashed; returns server row or sends 404. */
async function verifyServer(
  userId: string,
  serverId: string,
  res: Response
): Promise<{ id: string } | null> {
  const r = await query<{ id: string }>(
    "SELECT id FROM sync_servers WHERE id = $1 AND user_id = $2 AND (trashed_at IS NULL)",
    [serverId, userId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Server not found" });
    return null;
  }
  return r.rows[0]!;
}

/** POST /api/sync/servers/:serverId/files – upload a single synced file (disk storage to avoid OOM on large files). */
router.post(
  "/servers/:serverId/files",
  (req: Request, res: Response, next: () => void) => {
    syncUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        noCache(res);
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large" });
          return;
        }
        const msg = err instanceof Error ? err.message : "Upload failed";
        res.status(err && typeof err === "object" && "code" in err ? 400 : 500).json({ error: msg });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    const { serverId } = req.params;
    const server = await verifyServer(userId, serverId, res);
    if (!server) return;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const body = req.body as {
      filePath?: string;
      fileHash?: string;
      storageTier?: string;
    };

    const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";
    if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
    if (filePath.includes("..")) { res.status(400).json({ error: "Invalid path" }); return; }

    const fileHash = typeof body.fileHash === "string" ? body.fileHash.trim() : "";
    const storageTier = body.storageTier === "big" ? "big" : "mini";

    // If hash matches existing file, skip upload (already synced)
    if (fileHash) {
      const existing = await query<{ id: string; file_hash: string }>(
        "SELECT id, file_hash FROM sync_files WHERE server_id = $1 AND file_path = $2",
        [serverId, filePath]
      );
      if (existing.rows.length > 0 && existing.rows[0]!.file_hash === fileHash) {
        await query(
          "UPDATE sync_files SET synced_at = now() WHERE id = $1",
          [existing.rows[0]!.id]
        );
        res.json({ id: existing.rows[0]!.id, status: "skipped", reason: "hash_match" });
        return;
      }
    }

    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const tempPath = file.path;
    const fileSize = file.size;
    const base = config.backupStoragePath || "/tmp/ihostmc-sync";

    const unlinkTemp = () => {
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
    };

    try {
      const dir = syncStorageDir(userId, serverId);
      fs.mkdirSync(dir, { recursive: true });

      let diskPath: string;
      let encIv = "";
      let encTag = "";
      const useEncryption = canEncrypt() && fileSize <= MAX_ENCRYPT_FILE_SIZE;

      if (useEncryption) {
        const buffer = fs.readFileSync(tempPath);
        const enc = encryptBuffer(buffer);
        encIv = enc.iv;
        encTag = enc.tag;
        const filename = `${uuidv4()}.enc`;
        diskPath = path.join(dir, filename);
        fs.writeFileSync(diskPath, enc.data);
      } else {
        const ext = path.extname(filePath) || ".dat";
        const filename = `${uuidv4()}${ext}`;
        diskPath = path.join(dir, filename);
        fs.copyFileSync(tempPath, diskPath);
      }
      unlinkTemp();

      const relativePath = path.relative(base, diskPath);
      const ivField = useEncryption ? `${encIv}:${encTag}` : "";

      const result = await query<{ id: string; synced_at: string }>(
        `INSERT INTO sync_files (user_id, server_id, file_path, file_hash, size_bytes, storage_tier, encrypted, encryption_iv, storage_path, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (server_id, file_path) DO UPDATE SET
           file_hash = EXCLUDED.file_hash,
           size_bytes = EXCLUDED.size_bytes,
           storage_tier = EXCLUDED.storage_tier,
           encrypted = EXCLUDED.encrypted,
           encryption_iv = EXCLUDED.encryption_iv,
           storage_path = EXCLUDED.storage_path,
           synced_at = now()
         RETURNING id, synced_at`,
        [userId, serverId, filePath, fileHash, fileSize, storageTier, useEncryption, ivField, relativePath]
      );

      const row = result.rows[0];
      res.status(200).json({
        id: row?.id,
        filePath,
        sizeBytes: fileSize,
        status: "synced",
        encrypted: useEncryption,
        syncedAt: row?.synced_at,
      });
    } catch (e) {
      unlinkTemp();
      const msg = (e as Error)?.message ?? "";
      if (isTableMissing(msg)) {
        noCache(res);
        res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
        return;
      }
      console.error("[sync] POST file:", msg);
      noCache(res);
      res.status(500).json({ error: "Failed to sync file" });
    }
  }
);

/** GET /api/sync/servers/:serverId/files – list synced files */
router.get("/servers/:serverId/files", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  const tier = req.query.tier as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string || "500", 10), 2500);
  const offset = Math.max(parseInt(req.query.offset as string || "0", 10), 0);

  try {
    let where = "WHERE server_id = $1 AND user_id = $2";
    const params: unknown[] = [serverId, userId];
    if (tier === "mini" || tier === "big") {
      where += ` AND storage_tier = $3`;
      params.push(tier);
    }

    const result = await query<SyncFileRow>(
      `SELECT id, file_path, file_hash, size_bytes, storage_tier, encrypted, synced_at, created_at
       FROM sync_files ${where}
       ORDER BY file_path ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const countResult = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sync_files ${where}`,
      params
    );

    noCache(res);
    res.json({
      files: result.rows.map((r) => ({
        id: r.id,
        filePath: r.file_path,
        fileHash: r.file_hash,
        sizeBytes: parseInt(r.size_bytes, 10),
        storageTier: r.storage_tier,
        encrypted: r.encrypted,
        syncedAt: r.synced_at,
      })),
      total: parseInt(countResult.rows[0]?.n ?? "0", 10),
      limit,
      offset,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    res.status(500).json({ error: "Failed to list files" });
  }
});

/** GET /api/sync/servers/:serverId/export?format=zip|snapshot – export full copy as ZIP (with ihostmc-import.json) or single snapshot JSON */
router.get("/servers/:serverId/export", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const format = (req.query.format as string)?.toLowerCase() === "zip" ? "zip" : "snapshot";
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  const basePath = config.backupStoragePath || "/tmp/ihostmc-sync";
  try {
    const serverRow = await query<{ name: string; host_id: string; metadata: unknown }>(
      "SELECT name, host_id, metadata FROM sync_servers WHERE id = $1 AND user_id = $2",
      [serverId, userId]
    );
    const srv = serverRow.rows[0];
    const serverName = srv?.name || "Exported Server";
    const hostId = srv?.host_id || "";

    let manifestData: Record<string, unknown> = {};
    const manifestResult = await query<{ manifest_data: unknown }>(
      `SELECT manifest_data FROM sync_manifests
       WHERE server_id = $1 AND user_id = $2 AND manifest_type = 'combined'
       ORDER BY created_at DESC LIMIT 1`,
      [serverId, userId]
    ).catch(() => ({ rows: [] }));
    if (manifestResult.rows[0]?.manifest_data && typeof manifestResult.rows[0].manifest_data === "object") {
      manifestData = manifestResult.rows[0].manifest_data as Record<string, unknown>;
    }

    if (format === "snapshot") {
      const payload = buildSnapshotPayload({
        serverName,
        hostId,
        manifest: manifestData,
        filesIncluded: "zip_companion",
      });
      noCache(res);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(serverName.replace(/[/\\?*]/g, "_"))}-snapshot.ihostmc-snapshot"`);
      res.json(payload);
      return;
    }

    const filesResult = await query<{
      id: string;
      file_path: string;
      storage_path: string;
      encrypted: boolean;
      encryption_iv: string;
      size_bytes: string;
    }>(
      "SELECT id, file_path, storage_path, encrypted, encryption_iv, size_bytes FROM sync_files WHERE server_id = $1 AND user_id = $2 ORDER BY file_path",
      [serverId, userId]
    );
    const importPayload = buildSnapshotPayload({
      serverName,
      hostId,
      manifest: manifestData,
      filesIncluded: "inline",
    });
    noCache(res);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(serverName.replace(/[/\\?*]/g, "_"))}-export.zip"`);
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: "Failed to build ZIP" });
      console.error("[sync] export zip:", (err as Error)?.message);
    });
    archive.pipe(res);
    archive.append(JSON.stringify(importPayload, null, 0), { name: IMPORT_MANIFEST_FILENAME });
    for (const row of filesResult.rows) {
      const fullPath = path.join(basePath, row.storage_path);
      if (!fs.existsSync(fullPath)) continue;
      let data = fs.readFileSync(fullPath);
      if (row.encrypted && row.encryption_iv) {
        const parts = row.encryption_iv.split(":");
        if (parts.length === 2) data = decryptBuffer(data, parts[0]!, parts[1]!);
      }
      const safePath = row.file_path.replace(/\.\./g, "").replace(/^\/+/, "");
      if (!safePath) continue;
      archive.append(data, { name: safePath });
    }
    await archive.finalize();
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    console.error("[sync] export:", msg);
    if (!res.headersSent) res.status(500).json({ error: "Failed to export" });
  }
});

/** GET /api/sync/servers/:serverId/files/:fileId/content – download decrypted file */
router.get("/servers/:serverId/files/:fileId/content", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId, fileId } = req.params;

  try {
    const result = await query<{
      file_path: string;
      storage_path: string;
      encrypted: boolean;
      encryption_iv: string;
      size_bytes: string;
    }>(
      "SELECT file_path, storage_path, encrypted, encryption_iv, size_bytes FROM sync_files WHERE id = $1 AND server_id = $2 AND user_id = $3",
      [fileId, serverId, userId]
    );

    const row = result.rows[0];
    if (!row) { res.status(404).json({ error: "File not found" }); return; }

    const fullPath = path.join(config.backupStoragePath || "/tmp/ihostmc-sync", row.storage_path);
    if (!fs.existsSync(fullPath)) { res.status(404).json({ error: "File data missing" }); return; }

    const rawData = fs.readFileSync(fullPath);

    if (row.encrypted && row.encryption_iv) {
      const parts = row.encryption_iv.split(":");
      if (parts.length === 2) {
        const decrypted = decryptBuffer(rawData, parts[0]!, parts[1]!);
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(row.file_path)}"`);
        res.setHeader("Content-Length", decrypted.length.toString());
        res.send(decrypted);
        return;
      }
    }

    res.setHeader("Content-Disposition", `inline; filename="${path.basename(row.file_path)}"`);
    res.setHeader("Content-Length", rawData.length.toString());
    res.send(rawData);
  } catch (e) {
    console.error("[sync] GET file content:", (e as Error)?.message);
    res.status(500).json({ error: "Failed to read file" });
  }
});

/** DELETE /api/sync/servers/:serverId/files/:fileId */
router.delete("/servers/:serverId/files/:fileId", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId, fileId } = req.params;

  try {
    const result = await query<{ storage_path: string }>(
      "SELECT storage_path FROM sync_files WHERE id = $1 AND server_id = $2 AND user_id = $3",
      [fileId, serverId, userId]
    );
    const row = result.rows[0];
    if (!row) { res.status(404).json({ error: "File not found" }); return; }

    await query("DELETE FROM sync_files WHERE id = $1", [fileId]);

    if (row.storage_path) {
      const fullPath = path.join(config.backupStoragePath || "/tmp/ihostmc-sync", row.storage_path);
      try { fs.unlinkSync(fullPath); } catch { /* already gone */ }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

const SNAPSHOT_PATH_PREFIX = "__snapshot_";

/** Clear all synced files and manifests for a server so "live sync" is empty until next sync. Used after archive and for DELETE synced-data. */
async function clearSyncedDataForServer(userId: string, serverId: string): Promise<void> {
  const filesResult = await query<{ storage_path: string }>(
    "SELECT storage_path FROM sync_files WHERE server_id = $1 AND user_id = $2",
    [serverId, userId]
  );
  const basePath = config.backupStoragePath || "/tmp/ihostmc-sync";
  for (const row of filesResult.rows) {
    if (row.storage_path) {
      const fullPath = path.join(basePath, row.storage_path);
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* already gone or path issue */
      }
    }
  }
  const serverSyncDir = syncStorageDir(userId, serverId);
  try {
    if (fs.existsSync(serverSyncDir)) {
      fs.rmSync(serverSyncDir, { recursive: true });
    }
  } catch {
    /* best effort */
  }
  await query("DELETE FROM sync_files WHERE server_id = $1 AND user_id = $2", [serverId, userId]);
  await query("DELETE FROM sync_manifests WHERE server_id = $1 AND user_id = $2", [serverId, userId]);
  await query(
    "UPDATE sync_servers SET mini_synced = false, last_synced_at = null, updated_at = now() WHERE id = $1 AND user_id = $2",
    [serverId, userId]
  );
}

/** DELETE /api/sync/servers/:serverId/synced-data – create a snapshot in trash (best-effort), then always remove all synced files and manifests. */
router.delete("/servers/:serverId/synced-data", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;

  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  try {
    const serverRow = await query<{ name: string; metadata: unknown }>(
      "SELECT name, metadata FROM sync_servers WHERE id = $1 AND user_id = $2",
      [serverId, userId]
    );
    const srv = serverRow.rows[0];
    const serverMetadata = (srv?.metadata && typeof srv.metadata === "object" ? srv.metadata : {}) as Record<string, unknown>;

    const filesResult = await query<{ file_path: string; size_bytes: string; storage_path: string }>(
      "SELECT file_path, size_bytes, storage_path FROM sync_files WHERE server_id = $1 AND user_id = $2 ORDER BY file_path",
      [serverId, userId]
    );
    const fileList = filesResult.rows.map((r) => r.file_path);
    const totalSize = filesResult.rows.reduce((sum, r) => sum + parseInt(r.size_bytes, 10), 0);

    try {
      const name = `Removed sync: ${srv?.name || "Server"} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const metadata: Record<string, unknown> = {
        ...serverMetadata,
        fileList,
        filesOnBackup: fileList.length,
        source: "sync_snapshot",
      };
      const storagePath = `${userId}/${SNAPSHOT_PATH_PREFIX}${serverId}_removed_${Date.now()}`;
      await query(
        `INSERT INTO backups (user_id, server_id, name, kind, size_bytes, storage_path, metadata, deleted_at)
         VALUES ($1, $2, $3, 'mini', $4, $5, $6, now())`,
        [userId, serverId, name, totalSize, storagePath, JSON.stringify(metadata)]
      );
    } catch (trashErr) {
      console.error("[sync] DELETE synced-data: trash snapshot failed (continuing to remove sync):", (trashErr as Error)?.message ?? trashErr);
    }

    await clearSyncedDataForServer(userId, serverId);

    noCache(res);
    res.json({ ok: true, message: "Synced data removed from server." });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    console.error("[sync] DELETE synced-data:", msg);
    res.status(500).json({ error: "Failed to remove synced data" });
  }
});

/** GET /api/sync/servers/:serverId/backups – list backups (snapshots + archives) for this server only. */
router.get("/servers/:serverId/backups", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;
  try {
    const listSql = `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.server_id, s.name AS server_name, b.metadata
       FROM backups b
       LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
       WHERE b.user_id = $1 AND b.server_id = $2 ORDER BY b.created_at DESC`;
    const listSqlNoDeleted = `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.server_id, s.name AS server_name, b.metadata
       FROM backups b
       LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
       WHERE b.user_id = $1 AND b.server_id = $2 AND (b.deleted_at IS NULL) ORDER BY b.created_at DESC`;
    type Row = { id: string; name: string; kind: string; size_bytes: string; created_at: string; server_id: string | null; server_name: string | null; metadata: unknown };
    let result: { rows: Row[] };
    try {
      result = await query<Row>(listSqlNoDeleted, [userId, serverId]);
    } catch {
      result = await query<Row>(listSql, [userId, serverId]);
    }
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind || "full",
        sizeBytes: parseInt(r.size_bytes, 10),
        createdAt: r.created_at,
        serverId: r.server_id ?? undefined,
        serverName: r.server_name ?? undefined,
        metadata: r.metadata ?? {},
      }))
    );
  } catch {
    res.status(500).json({ error: "Failed to list backups" });
  }
});

/** POST /api/sync/servers/:serverId/archive – create a backup (archive) from current synced data. Server unchanged; adds a snapshot to backups with server metadata. Body may include iterationType (3h|daily|weekly) to replace previous backup of that type. */
router.post("/servers/:serverId/archive", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  const body = req.body as {
    name?: string;
    iterationType?: string;
    saveTier?: string;
    keepLiveSync?: boolean;
    scope?: string;
    includePaths?: string[];
  };
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 256)
      : `Sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const iterationType =
    body.iterationType === "3h" || body.iterationType === "daily" || body.iterationType === "weekly" || body.iterationType === "monthly"
      ? body.iterationType
      : undefined;
  const saveTier =
    body.saveTier === "snapshot" || body.saveTier === "structural" || body.saveTier === "full" || body.saveTier === "world"
      ? body.saveTier
      : undefined;
  const keepLiveSync = body.keepLiveSync === true;
  const scope = body.scope === "world" ? "world" : undefined;
  const includePaths =
    Array.isArray(body.includePaths) && body.includePaths.length > 0
      ? body.includePaths.filter((p) => typeof p === "string" && p.length > 0).slice(0, 100)
      : undefined;

  try {
    const result = await createArchiveFromSync(userId, serverId, name, {
      iterationType,
      saveTier,
      scope,
      includePaths,
    });
    if (result) {
      console.log("[sync] POST archive created:", { saveTier: body.saveTier, kind: result.kind, serverId, keepLiveSync });
    }
    if (!result) {
      const tier = await getEffectiveTier(userId);
      const hasBackupTier = tier.id === "backup" || tier.id === "pro";
      const maxBackups = hasBackupTier ? config.backupTierMaxBackups : config.freeTierMaxBackups;
      res.status(403).json({
        error: `Backup limit reached (${maxBackups}). Delete an old backup or upgrade for more.`,
      });
      return;
    }
    if (!keepLiveSync) await clearSyncedDataForServer(userId, serverId);
    noCache(res);
    res.status(201).json({
      id: result.id,
      name: result.name,
      kind: result.kind,
      sizeBytes: result.sizeBytes,
      createdAt: result.createdAt,
      serverId: result.serverId,
      metadata: { source: "sync_snapshot" },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    console.error("[sync] POST archive:", msg);
    const safeMessage =
      msg.includes("does not exist") || msg.includes("relation")
        ? "Database migration needed. Sync or backup tables may be missing."
        : "Failed to archive sync";
    res.status(500).json({ error: safeMessage });
  }
});

/** PATCH /api/sync/servers/:serverId/iteration – update iteration schedule and/or last run (for app sync and backend cron). */
router.patch("/servers/:serverId/iteration", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  const body = req.body as {
    every3h?: boolean;
    daily?: boolean;
    weekly?: boolean;
    lastRun3h?: string;
    lastRunDaily?: string;
    lastRunWeekly?: string;
    dailyAt?: string;
    weeklyOn?: number;
    manualLabel?: string;
    monthly?: boolean;
    monthlyDay?: number;
    monthlyAt?: string;
    intervalHours?: number;
    lastRunMonthly?: string;
    saveTier?: string;
  };

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (typeof body.every3h === "boolean") {
    updates.push(`iteration_every3h = $${i++}`);
    values.push(body.every3h);
  }
  if (typeof body.daily === "boolean") {
    updates.push(`iteration_daily = $${i++}`);
    values.push(body.daily);
  }
  if (typeof body.weekly === "boolean") {
    updates.push(`iteration_weekly = $${i++}`);
    values.push(body.weekly);
  }
  if (typeof body.lastRun3h === "string") {
    updates.push(`iteration_last_3h_at = $${i++}`);
    values.push(body.lastRun3h);
  }
  if (typeof body.lastRunDaily === "string") {
    updates.push(`iteration_last_daily_at = $${i++}`);
    values.push(body.lastRunDaily);
  }
  if (typeof body.lastRunWeekly === "string") {
    updates.push(`iteration_last_weekly_at = $${i++}`);
    values.push(body.lastRunWeekly);
  }
  if (
    body.dailyAt !== undefined ||
    body.weeklyOn !== undefined ||
    body.manualLabel !== undefined ||
    body.monthly !== undefined ||
    body.monthlyDay !== undefined ||
    body.monthlyAt !== undefined ||
    body.intervalHours !== undefined ||
    body.lastRunMonthly !== undefined ||
    body.saveTier !== undefined
  ) {
    const metaPatch: Record<string, unknown> = {};
    if (body.dailyAt !== undefined) metaPatch.iterationDailyAt = body.dailyAt;
    if (typeof body.weeklyOn === "number" && body.weeklyOn >= 0 && body.weeklyOn <= 6) metaPatch.iterationWeeklyOn = body.weeklyOn;
    if (body.manualLabel !== undefined) metaPatch.iterationManualLabel = body.manualLabel === "" ? null : body.manualLabel;
    if (typeof body.monthly === "boolean") {
      metaPatch.iterationMonthly = body.monthly;
      if (body.monthly === true && body.monthlyDay === undefined) metaPatch.iterationMonthlyDay = 1;
    }
    if (typeof body.monthlyDay === "number") metaPatch.iterationMonthlyDay = Math.min(31, Math.max(1, body.monthlyDay));
    if (typeof body.monthlyAt === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(body.monthlyAt)) metaPatch.iterationMonthlyAt = body.monthlyAt;
    if (typeof body.intervalHours === "number" && body.intervalHours >= 1 && body.intervalHours <= 24) metaPatch.iterationIntervalHours = Math.round(body.intervalHours);
    if (typeof body.lastRunMonthly === "string") metaPatch.iterationLastMonthlyAt = body.lastRunMonthly;
    if (body.saveTier === "snapshot" || body.saveTier === "structural" || body.saveTier === "full") metaPatch.iterationSaveTier = body.saveTier;
    if (Object.keys(metaPatch).length > 0) {
      updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${i++}::jsonb`);
      values.push(JSON.stringify(metaPatch));
    }
  }
  if (updates.length === 0) {
    noCache(res);
    res.json({ ok: true });
    return;
  }
  values.push(serverId, userId);
  try {
    await query(
      `UPDATE sync_servers SET ${updates.join(", ")}, updated_at = now() WHERE id = $${i} AND user_id = $${i + 1}`,
      values
    );
    noCache(res);
    res.json({ ok: true });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    res.status(500).json({ error: "Failed to update iteration" });
  }
});

/** POST /api/sync/servers/:serverId/trigger-sync – request a sync from the app (stub: app can poll or use push). */
router.post("/servers/:serverId/trigger-sync", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;
  try {
    await query(
      `UPDATE sync_servers SET updated_at = now() WHERE id = $1 AND user_id = $2`,
      [serverId, userId]
    );
    noCache(res);
    res.json({ ok: true, message: "Sync requested; the app will sync when connected." });
  } catch {
    res.status(500).json({ error: "Failed to request sync" });
  }
});

// ─── Manifest Endpoints ──────────────────────────────────────────────────────

/** POST /api/sync/servers/:serverId/manifest – store a manifest snapshot */
router.post("/servers/:serverId/manifest", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  const body = req.body as {
    manifestType?: string;
    fileCount?: number;
    totalBytes?: number;
    manifestData?: unknown;
  };

  const validTypes = ["mini", "big", "combined"];
  const manifestType = validTypes.includes(body.manifestType ?? "") ? body.manifestType! : "combined";
  const fileCount = typeof body.fileCount === "number" ? body.fileCount : 0;
  const totalBytes = typeof body.totalBytes === "number" ? body.totalBytes : 0;
  const manifestData = body.manifestData && typeof body.manifestData === "object" ? body.manifestData : {};

  try {
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO sync_manifests (user_id, server_id, manifest_type, file_count, total_bytes, manifest_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId, serverId, manifestType, fileCount, totalBytes, JSON.stringify(manifestData)]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row?.id,
      manifestType,
      fileCount,
      totalBytes,
      createdAt: row?.created_at,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    console.error("[sync] POST manifest:", msg);
    res.status(500).json({ error: "Failed to save manifest" });
  }
});

/** GET /api/sync/servers/:serverId/manifest – get latest manifest(s) */
router.get("/servers/:serverId/manifest", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const typeFilter = req.query.type as string | undefined;

  try {
    let where = "WHERE server_id = $1 AND user_id = $2";
    const params: unknown[] = [serverId, userId];
    if (typeFilter && ["mini", "big", "combined"].includes(typeFilter)) {
      where += ` AND manifest_type = $3`;
      params.push(typeFilter);
    }

    const result = await query<SyncManifestRow>(
      `SELECT DISTINCT ON (manifest_type)
         id, manifest_type, file_count, total_bytes, manifest_data, created_at
       FROM sync_manifests ${where}
       ORDER BY manifest_type, created_at DESC`,
      params
    );

    noCache(res);
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        manifestType: r.manifest_type,
        fileCount: parseInt(r.file_count, 10),
        totalBytes: parseInt(r.total_bytes, 10),
        manifestData: r.manifest_data ?? {},
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    res.status(500).json({ error: "Failed to get manifest" });
  }
});

/** GET /api/sync/servers/:serverId/summary – combined file + manifest stats */
router.get("/servers/:serverId/summary", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { serverId } = req.params;
  const server = await verifyServer(userId, serverId, res);
  if (!server) return;

  try {
    const fileStats = await query<{ tier: string; cnt: string; bytes: string }>(
      `SELECT storage_tier AS tier, COUNT(*) AS cnt, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM sync_files WHERE server_id = $1 AND user_id = $2 GROUP BY storage_tier`,
      [serverId, userId]
    );

    const manifests = await query<SyncManifestRow>(
      `SELECT DISTINCT ON (manifest_type)
         id, manifest_type, file_count, total_bytes, created_at, '{}' AS manifest_data
       FROM sync_manifests WHERE server_id = $1 AND user_id = $2
       ORDER BY manifest_type, created_at DESC`,
      [serverId, userId]
    );

    let miniFiles = 0, bigFiles = 0, miniBytes = 0, bigBytes = 0;
    for (const r of fileStats.rows) {
      if (r.tier === "mini") { miniFiles = parseInt(r.cnt, 10); miniBytes = parseInt(r.bytes, 10); }
      if (r.tier === "big") { bigFiles = parseInt(r.cnt, 10); bigBytes = parseInt(r.bytes, 10); }
    }

    noCache(res);
    res.json({
      syncedFiles: { mini: miniFiles, big: bigFiles, totalFiles: miniFiles + bigFiles, miniBytes, bigBytes, totalBytes: miniBytes + bigBytes },
      manifests: manifests.rows.map((r) => ({
        id: r.id,
        manifestType: r.manifest_type,
        fileCount: parseInt(r.file_count, 10),
        totalBytes: parseInt(r.total_bytes, 10),
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (isTableMissing(msg)) {
      noCache(res);
      res.status(503).json({ error: SYNC_NOT_AVAILABLE_MSG });
      return;
    }
    res.status(500).json({ error: "Failed to get summary" });
  }
});

export default router;
