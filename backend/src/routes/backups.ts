import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { getEffectiveTier } from "../tier-resolver.js";
import { buildSnapshotPayload, validateSnapshotPayload } from "../lib/export-import.js";

const router = Router();
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = (req as Request & { userId?: string }).userId;
    if (!config.backupStoragePath || !userId) {
      cb(new Error("Backup storage not configured"), "");
      return;
    }
    const dir = path.join(config.backupStoragePath, userId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e as Error, "");
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".zip";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

router.use(authMiddleware);

function hasDeletedAtColumn(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return msg.includes("deleted_at") || msg.includes("does not exist");
}

/** GET /api/backups/limits – returns count and max allowed for the user's tier (for UI). */
router.get("/limits", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  try {
    const tier = await getEffectiveTier(userId);
    let countResult: { rows: { n: string }[] };
    try {
      countResult = await query<{ n: string }>(
        "SELECT COUNT(*) AS n FROM backups WHERE user_id = $1 AND (deleted_at IS NULL)",
        [userId]
      );
    } catch (e) {
      if (hasDeletedAtColumn(e)) {
        countResult = await query<{ n: string }>(
          "SELECT COUNT(*) AS n FROM backups WHERE user_id = $1",
          [userId]
        );
      } else throw e;
    }
    const count = parseInt(countResult.rows[0]?.n ?? "0", 10);
    const hasBackupTier = tier.id === "backup" || tier.id === "pro";
    const maxBackups = hasBackupTier ? config.backupTierMaxBackups : config.freeTierMaxBackups;
    res.json({ count, maxBackups });
  } catch {
    res.status(500).json({ error: "Failed to get backup limits" });
  }
});

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const listSql = `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.server_id, s.name AS server_name, b.metadata
       FROM backups b
       LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
       WHERE b.user_id = $1 ORDER BY b.created_at DESC`;
  const listSqlWithDeleted = `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.server_id, s.name AS server_name, b.metadata
       FROM backups b
       LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
       WHERE b.user_id = $1 AND (b.deleted_at IS NULL) ORDER BY b.created_at DESC`;
  type Row = { id: string; name: string; kind: string; size_bytes: string; created_at: string; server_id: string | null; server_name: string | null; metadata: unknown };
  try {
    let result: { rows: Row[] };
    try {
      result = await query<Row>(listSqlWithDeleted, [userId]);
    } catch (e) {
      if (hasDeletedAtColumn(e)) {
        result = await query<Row>(listSql, [userId]);
      } else throw e;
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

/** GET /api/backups/report – summary for UI: total size, mini/big split (backups + sync), storage limit by tier. */
router.get("/report", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  try {
    const tier = await getEffectiveTier(userId);
    const tierId = tier.id as "free" | "backup" | "pro";
    const limitGb = config.storageLimitGbByTier[tierId] ?? config.storageLimitGbByTier.free;
    const storageLimitBytes =
      config.backupStorageLimitGb > 0
        ? config.backupStorageLimitGb * 1024 * 1024 * 1024
        : limitGb > 0
          ? limitGb * 1024 * 1024 * 1024
          : null;

    let result: { rows: { kind: string; size_bytes: string; metadata: unknown }[] };
    try {
      result = await query<{ kind: string; size_bytes: string; metadata: unknown }>(
        "SELECT COALESCE(kind, 'full') AS kind, size_bytes, metadata FROM backups WHERE user_id = $1 AND (deleted_at IS NULL)",
        [userId]
      );
    } catch (e) {
      if (hasDeletedAtColumn(e)) {
        result = await query<{ kind: string; size_bytes: string; metadata: unknown }>(
          "SELECT COALESCE(kind, 'full') AS kind, size_bytes, metadata FROM backups WHERE user_id = $1",
          [userId]
        );
      } else throw e;
    }
    let backupMiniBytes = 0;
    let backupBigBytes = 0;
    let miniCount = 0;
    let fullCount = 0;
    let filesTooBigCount = 0;
    for (const r of result.rows) {
      const size = parseInt(r.size_bytes, 10) || 0;
      if (r.kind === "mini") {
        backupMiniBytes += size;
        miniCount += 1;
      } else {
        backupBigBytes += size;
        fullCount += 1;
      }
      const meta = (r.metadata ?? {}) as { filesTooBig?: number };
      if (typeof meta.filesTooBig === "number" && meta.filesTooBig > 0) {
        filesTooBigCount += meta.filesTooBig;
      }
    }

    let syncMiniBytes = 0;
    let syncBigBytes = 0;
    try {
      const syncResult = await query<{ storage_tier: string; sum: string }>(
        `SELECT storage_tier, COALESCE(SUM(size_bytes), 0)::text AS sum
         FROM sync_files WHERE user_id = $1 GROUP BY storage_tier`,
        [userId]
      );
      for (const row of syncResult.rows) {
        const sum = parseInt(row.sum, 10) || 0;
        if (row.storage_tier === "mini") syncMiniBytes = sum;
        else syncBigBytes = sum;
      }
    } catch {
      // sync_files table may not exist
    }

    const miniBytes = backupMiniBytes + syncMiniBytes;
    const bigBytes = backupBigBytes + syncBigBytes;
    const totalSizeBytes = miniBytes + bigBytes;

    res.json({
      totalSizeBytes,
      miniBytes,
      bigBytes,
      totalCount: result.rows.length,
      byKind: { mini: miniCount, full: fullCount },
      filesTooBigCount,
      storageLimitBytes,
      tierId,
      storageLimitGb: limitGb,
    });
  } catch {
    res.status(500).json({ error: "Failed to get backup report" });
  }
});

router.post("/", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  if (!config.backupStoragePath) {
    res.status(503).json({ error: "Backup storage not configured" });
    return;
  }
  const userId = (req as Request & { userId: string }).userId;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const body = req.body as { name?: string; serverId?: string; kind?: string; metadata?: string };
  const name = body.name?.trim() || file?.originalname || "backup.zip";
  const serverId = typeof body.serverId === "string" ? body.serverId.trim() || null : null;
  const kind = body.kind === "mini" ? "mini" : "full";
  let metadata: Record<string, unknown> = {};
  if (typeof body.metadata === "string") {
    try {
      metadata = JSON.parse(body.metadata) as Record<string, unknown>;
    } catch {}
  }
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    const tier = await getEffectiveTier(userId);
    const hasBackupTier = tier.id === "backup" || tier.id === "pro";
    const maxBackups = hasBackupTier ? config.backupTierMaxBackups : config.freeTierMaxBackups;
    const countResult = await query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM backups WHERE user_id = $1",
      [userId]
    );
    const count = parseInt(countResult.rows[0]?.n ?? "0", 10);
    if (count >= maxBackups) {
      res.status(403).json({
        error: `Backup limit reached (${maxBackups} for ${tier.name}). Delete an old backup or upgrade for more.`,
      });
      return;
    }
    const tierId = tier.id as "free" | "backup" | "pro";
    const limitGb = config.storageLimitGbByTier[tierId] ?? config.storageLimitGbByTier.free;
    const storageLimitBytes =
      limitGb > 0 ? limitGb * 1024 * 1024 * 1024 : null;
    if (storageLimitBytes != null) {
      const reportRes = await query<{ size_bytes: string }>(
        "SELECT COALESCE(SUM(size_bytes), 0)::text AS size_bytes FROM backups WHERE user_id = $1",
        [userId]
      );
      const used = parseInt(reportRes.rows[0]?.size_bytes ?? "0", 10) || 0;
      const syncRes = await query<{ sum: string }>(
        "SELECT COALESCE(SUM(size_bytes), 0)::text AS sum FROM sync_files WHERE user_id = $1",
        [userId]
      ).catch(() => ({ rows: [{ sum: "0" }] }));
      const syncUsed = parseInt((syncRes as { rows: { sum: string }[] }).rows[0]?.sum ?? "0", 10) || 0;
      if (used + syncUsed + file.size > storageLimitBytes) {
        res.status(403).json({
          error: `Storage limit reached (${limitGb} GB for ${tier.name}). Delete some backups or upgrade.`,
        });
        return;
      }
    }
  } catch {
    res.status(500).json({ error: "Failed to check backup limit" });
    return;
  }
  try {
    const relativePath = path.join(userId, path.basename(file.filename));
    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO backups (user_id, server_id, name, kind, size_bytes, storage_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [userId, serverId, name, kind, file.size, relativePath, JSON.stringify(metadata)]
    );
    const backup = inserted.rows[0];
    if (serverId && backup?.id) {
      await query(
        `UPDATE sync_servers SET backup_count = backup_count + 1, last_backup_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
        [serverId, userId]
      );
    }
    res.status(201).json({
      id: backup?.id,
      name,
      kind,
      sizeBytes: file.size,
      createdAt: backup?.created_at,
      serverId: serverId ?? undefined,
      metadata,
    });
  } catch (e) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
    res.status(500).json({ error: "Failed to save backup" });
  }
});

const TRASH_RETENTION_DAYS = 30;

/** GET /api/backups/trash – list backups in trash (soft-deleted); purge_at = deleted_at + 30 days. */
router.get("/trash", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  try {
    let result: { rows: { id: string; name: string; kind: string; size_bytes: string; created_at: string; deleted_at: string | null; server_id: string | null; server_name: string | null; metadata: unknown }[] };
    try {
      result = await query<{
      id: string;
      name: string;
      kind: string;
      size_bytes: string;
      created_at: string;
      deleted_at: string | null;
      server_id: string | null;
      server_name: string | null;
      metadata: unknown;
    }>(
      `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.deleted_at, b.server_id, s.name AS server_name, b.metadata
       FROM backups b
       LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
       WHERE b.user_id = $1 AND (b.deleted_at IS NOT NULL) ORDER BY b.deleted_at DESC`,
      [userId]
    );
    } catch (e) {
      if (hasDeletedAtColumn(e)) {
        res.json([]);
        return;
      }
      throw e;
    }
    const list = result.rows.map((r) => {
      const deletedAt = r.deleted_at ? new Date(r.deleted_at) : null;
      const purgeAt = deletedAt ? new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000) : null;
      return {
        id: r.id,
        name: r.name,
        kind: r.kind || "full",
        sizeBytes: parseInt(r.size_bytes, 10),
        createdAt: r.created_at,
        deletedAt: r.deleted_at,
        purgeAt: purgeAt?.toISOString() ?? null,
        serverId: r.server_id ?? undefined,
        serverName: r.server_name ?? undefined,
        metadata: r.metadata ?? {},
      };
    });
    res.json(list);
  } catch {
    res.status(500).json({ error: "Failed to list trash" });
  }
});

/** POST /api/backups/trash/purge – permanently delete all backups that have been in trash for 30+ days; free storage. */
router.post("/trash/purge", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  try {
    const result = await query<{ id: string; storage_path: string; server_id: string | null }>(
      `SELECT id, storage_path, server_id FROM backups
       WHERE user_id = $1 AND deleted_at IS NOT NULL AND deleted_at < now() - interval '1 day' * $2`,
      [userId, TRASH_RETENTION_DAYS]
    );
    const basePath = config.backupStoragePath || "";
    for (const row of result.rows) {
      if (row.server_id) {
        await query(
          "UPDATE sync_servers SET backup_count = GREATEST(0, backup_count - 1), updated_at = now() WHERE id = $1 AND user_id = $2",
          [row.server_id, userId]
        );
      }
      if (!row.storage_path.includes("__snapshot_") && basePath) {
        const fullPath = path.join(basePath, row.storage_path);
        try {
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch {}
      }
      await query("DELETE FROM backups WHERE id = $1 AND user_id = $2", [row.id, userId]);
    }
    res.json({ ok: true, purged: result.rows.length });
  } catch {
    res.status(500).json({ error: "Failed to purge trash" });
  }
});

/** POST /api/backups/import – upload a .ihostmc-snapshot JSON file to create a snapshot backup (metadata only). */
router.post("/import", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file || !config.backupStoragePath) {
    res.status(400).json({ error: "No file uploaded. Send a .ihostmc-snapshot JSON file." });
    return;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(file.path, "utf-8");
  } catch {
    res.status(400).json({ error: "Could not read uploaded file." });
    return;
  }
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch {}
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "Invalid JSON. Expected iHostMC Snapshot format." });
    return;
  }
  if (!validateSnapshotPayload(payload)) {
    res.status(400).json({ error: "Invalid iHostMC Snapshot (format, version, server, manifest required)." });
    return;
  }
  const p = payload as { server: { name: string }; manifest: Record<string, unknown> };
  const serverName = p.server?.name || "Imported snapshot";
  const manifest = p.manifest && typeof p.manifest === "object" ? p.manifest : {};
  try {
    const tier = await getEffectiveTier(userId);
    const hasBackupTier = tier.id === "backup" || tier.id === "pro";
    const maxBackups = hasBackupTier ? config.backupTierMaxBackups : config.freeTierMaxBackups;
    const countResult = await query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM backups WHERE user_id = $1 AND (deleted_at IS NULL)",
      [userId]
    ).catch(() => query<{ n: string }>("SELECT COUNT(*) AS n FROM backups WHERE user_id = $1", [userId]));
    const count = parseInt(countResult.rows[0]?.n ?? "0", 10);
    if (count >= maxBackups) {
      res.status(403).json({ error: `Backup limit reached (${maxBackups}). Delete an old backup or upgrade.` });
      return;
    }
    const name = `Imported: ${serverName} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    const storagePath = `${userId}/__snapshot_import_${Date.now()}`;
    const metadata = { source: "sync_snapshot", snapshotManifest: manifest, server_name: serverName };
    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO backups (user_id, server_id, name, kind, size_bytes, storage_path, metadata)
       VALUES ($1, NULL, $2, 'snapshot', 0, $3, $4) RETURNING id, created_at`,
      [userId, name, storagePath, JSON.stringify(metadata)]
    );
    const row = inserted.rows[0];
    res.status(201).json({
      id: row?.id,
      name,
      kind: "snapshot",
      sizeBytes: 0,
      createdAt: row?.created_at,
      serverId: undefined,
      metadata,
    });
  } catch (e) {
    console.error("[backups] import snapshot:", (e as Error)?.message);
    res.status(500).json({ error: "Failed to import snapshot" });
  }
});

/** GET /api/backups/:id – single backup with metadata (for manifest in app). Excludes trashed. */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const result = await query<{
    id: string;
    name: string;
    kind: string;
    size_bytes: string;
    created_at: string;
    server_id: string | null;
    server_name: string | null;
    metadata: unknown;
  }>(
    `SELECT b.id, b.name, COALESCE(b.kind, 'full') AS kind, b.size_bytes, b.created_at, b.server_id, s.name AS server_name, b.metadata
     FROM backups b
     LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
     WHERE b.id = $1 AND b.user_id = $2 AND (b.deleted_at IS NULL)`,
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    kind: row.kind || "full",
    sizeBytes: parseInt(row.size_bytes, 10),
    createdAt: row.created_at,
    serverId: row.server_id ?? undefined,
    serverName: row.server_name ?? undefined,
    metadata: row.metadata ?? {},
  });
});

/** PATCH /api/backups/:id – update archive/display name (e.g. date + version). */
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const body = req.body as { name?: string };
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!name || name.length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (name.length > 256) {
    res.status(400).json({ error: "Name too long" });
    return;
  }
  try {
    const result = await query<{ id: string }>(
      "UPDATE backups SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id",
      [name, id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    res.json({ ok: true, name });
  } catch {
    res.status(500).json({ error: "Failed to update backup name" });
  }
});

/** GET /api/backups/:id/export?format=snapshot – export backup as single .ihostmc-snapshot JSON (all backup types). */
router.get("/:id/export", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const format = (req.query.format as string)?.toLowerCase() === "snapshot" ? "snapshot" : "snapshot";
  const result = await query<{
    name: string;
    server_id: string | null;
    server_name: string | null;
    metadata: unknown;
    deleted_at: string | null;
  }>(
    `SELECT b.name, b.server_id, b.metadata, b.deleted_at, s.name AS server_name
     FROM backups b LEFT JOIN sync_servers s ON s.id = b.server_id AND s.user_id = b.user_id
     WHERE b.id = $1 AND b.user_id = $2`,
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  if (row.deleted_at) {
    res.status(410).json({ error: "Backup is in trash; restore it first to export." });
    return;
  }
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const snapshotManifest = (meta.snapshotManifest && typeof meta.snapshotManifest === "object"
    ? meta.snapshotManifest
    : meta) as Record<string, unknown>;
  const serverName = (row.server_name as string) || (meta.server_name as string) || row.name || "Backup";
  const payload = buildSnapshotPayload({
    serverName,
    hostId: "",
    manifest: snapshotManifest,
    filesIncluded: row.metadata && (row.metadata as { source?: string }).source === "sync_snapshot" ? "none" : "zip_companion",
  });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(String(serverName).replace(/[/\\?*]/g, "_"))}-snapshot.ihostmc-snapshot"`);
  res.json(payload);
});

router.get("/:id/download", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const result = await query<{ name: string; storage_path: string; deleted_at: string | null }>(
    "SELECT name, storage_path, deleted_at FROM backups WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  if (row.deleted_at) {
    res.status(410).json({ error: "Backup is in trash; restore it first to download." });
    return;
  }
  if (row.storage_path.includes("__snapshot_")) {
    res.status(400).json({ error: "This backup is a sync snapshot; download not available. Files are in Current synced data." });
    return;
  }
  const fullPath = path.join(config.backupStoragePath, row.storage_path);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(row.name)}"`);
  res.sendFile(fullPath, (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
});

/** POST /api/backups/:id/restore – restore a backup from trash. */
router.post("/:id/restore", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const result = await query<{ id: string; server_id: string | null }>(
    "UPDATE backups SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id, server_id",
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "Backup not found or not in trash" });
    return;
  }
  if (row.server_id) {
    await query(
      "UPDATE sync_servers SET backup_count = backup_count + 1, updated_at = now() WHERE id = $1 AND user_id = $2",
      [row.server_id, userId]
    );
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const id = req.params.id;
  const permanent = (req.query.permanent as string) === "1" || (req.query.permanent as string) === "true";
  const result = await query<{ storage_path: string; server_id: string | null; deleted_at: string | null }>(
    "SELECT storage_path, server_id, deleted_at FROM backups WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  if (permanent && row.deleted_at) {
    if (row.server_id) {
      await query(
        "UPDATE sync_servers SET backup_count = GREATEST(0, backup_count - 1), updated_at = now() WHERE id = $1 AND user_id = $2",
        [row.server_id, userId]
      );
    }
    if (!row.storage_path.includes("__snapshot_")) {
      const fullPath = path.join(config.backupStoragePath, row.storage_path);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch {}
    }
    await query("DELETE FROM backups WHERE id = $1 AND user_id = $2", [id, userId]);
    res.json({ ok: true, permanent: true });
    return;
  }
  if (row.deleted_at) {
    res.status(400).json({ error: "Already in trash; use permanent=1 to delete now." });
    return;
  }
  await query("UPDATE backups SET deleted_at = now() WHERE id = $1 AND user_id = $2", [id, userId]);
  if (row.server_id) {
    await query(
      "UPDATE sync_servers SET backup_count = GREATEST(0, backup_count - 1), updated_at = now() WHERE id = $1 AND user_id = $2",
      [row.server_id, userId]
    );
  }
  res.json({ ok: true, movedToTrash: true });
});

export default router;
