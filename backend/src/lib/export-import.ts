/**
 * iHostMC Snapshot & Import format helpers.
 * See docs/IHOSTMC-SNAPSHOT-FORMAT.md and website /docs#export-format.
 */

export const FORMAT_NAME = "iHostMC Snapshot";
export const FORMAT_VERSION = 1;
export const IMPORT_MANIFEST_FILENAME = "ihostmc-import.json";

export type FilesIncluded = "none" | "manifest_only" | "inline" | "zip_companion";

export interface IHostMCSnapshotPayload {
  format: string;
  version: number;
  exportedAt: string;
  server: { name: string; hostId?: string };
  manifest: Record<string, unknown>;
  filesIncluded: FilesIncluded;
}

/** Build snapshot JSON for export (single file or ZIP root manifest). */
export function buildSnapshotPayload(
  opts: {
    serverName: string;
    hostId?: string;
    manifest: Record<string, unknown>;
    filesIncluded: FilesIncluded;
  }
): IHostMCSnapshotPayload {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    server: { name: opts.serverName, hostId: opts.hostId ?? "" },
    manifest: opts.manifest,
    filesIncluded: opts.filesIncluded,
  };
}

/** Validate that parsed JSON is a valid iHostMC import/snapshot. */
export function validateSnapshotPayload(obj: unknown): obj is IHostMCSnapshotPayload {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (o.format !== FORMAT_NAME) return false;
  if (typeof o.version !== "number" || o.version < 1) return false;
  if (typeof o.exportedAt !== "string") return false;
  if (!o.server || typeof o.server !== "object") return false;
  const s = o.server as Record<string, unknown>;
  if (typeof s.name !== "string") return false;
  if (!o.manifest || typeof o.manifest !== "object") return false;
  const validFiles: FilesIncluded[] = ["none", "manifest_only", "inline", "zip_companion"];
  if (typeof o.filesIncluded !== "string" || !validFiles.includes(o.filesIncluded as FilesIncluded)) return false;
  return true;
}
