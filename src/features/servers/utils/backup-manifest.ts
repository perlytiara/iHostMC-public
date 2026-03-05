import type {
  BackupManifest,
  ManifestFileEntry,
  ManifestModEntry,
  SnapshotFileTag,
  SnapshotPreset,
} from "@/lib/api-client";

const SIZE_THRESHOLD_BIG_BYTES = 5 * 1024 * 1024; // 5 MB
const MODS_PREFIX = "mods/";
const PLUGINS_PREFIX = "plugins/";
const JAR = ".jar";
const LIBRARIES_PREFIX = "libraries/";
const CACHE_PREFIX = "cache/";
const CONFIG_PREFIX = "config/";
const LOGS_PREFIX = "logs/";

export type FileCategoryName =
  | "config"
  | "world"
  | "mod"
  | "plugin"
  | "library"
  | "jar"
  | "cache"
  | "other";

function classifyPath(path: string): FileCategoryName {
  const first = path.split("/")[0] ?? "";
  if (path.startsWith(MODS_PREFIX) && path.endsWith(JAR)) return "mod";
  if (path.startsWith(PLUGINS_PREFIX) && path.endsWith(JAR)) return "plugin";
  if (path.startsWith(LIBRARIES_PREFIX)) return "library";
  if (path.startsWith(CACHE_PREFIX) || path.startsWith(LOGS_PREFIX)) return "cache";
  if (first === "world" || first.startsWith("world_") || first === "DIM-1" || first === "DIM1") return "world";
  if (
    path === "server.properties" ||
    path === "eula.txt" ||
    path === "bukkit.yml" ||
    path === "help.yml" ||
    path === "commands.yml" ||
    path.startsWith(CONFIG_PREFIX + "/") ||
    path.toLowerCase().endsWith("paper-global.yml") ||
    path.toLowerCase().endsWith("paper-world-defaults.yml") ||
    path.endsWith(".yml") ||
    path.endsWith(".yaml") ||
    path.endsWith(".properties")
  )
    return "config";
  if (path.endsWith(JAR) && !path.includes("/")) return "jar";
  if (path.toLowerCase().includes("installer") && path.endsWith(JAR)) return "jar";
  if (path === "run.jar") return "jar";
  return "other";
}

export interface ScanEntry {
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

/**
 * Classify file as small (fits in "small" storage) or big (goes to "big" storage).
 * Mods/plugins under threshold can be "reference" (public, by name) or "small"/"big" (hosted copy).
 */
function storageTier(sizeBytes: number, path: string): "small" | "big" | "reference" {
  const isMod = path.startsWith(MODS_PREFIX) && path.endsWith(JAR);
  const isPlugin = path.startsWith(PLUGINS_PREFIX) && path.endsWith(JAR);
  if (isMod || isPlugin) {
    if (sizeBytes <= SIZE_THRESHOLD_BIG_BYTES) return "small";
    return "big";
  }
  if (sizeBytes <= SIZE_THRESHOLD_BIG_BYTES) return "small";
  return "big";
}

/**
 * Tag for backup scope: must (essential), cache (logs/cache), mini/big (storage tier).
 * Used so backups can include must only, must+mini, or full (default).
 */
function getFileTag(
  category: FileCategoryName | undefined,
  storage: "small" | "big" | "reference",
  _path: string
): SnapshotFileTag {
  if (category === "cache") return "cache";
  if (category === "config" || category === "jar") return "must";
  return storage === "small" || storage === "reference" ? "mini" : "big";
}

/**
 * Build backup manifest from Tauri scan result (flat list with sizes).
 * Adds tag (must/cache/mini/big) per file and mustFiles/cacheFiles lists for restore scope.
 */
export function buildManifestFromScan(
  entries: ScanEntry[],
  options?: { preset?: SnapshotPreset }
): BackupManifest {
  const files: ManifestFileEntry[] = [];
  const mods: ManifestModEntry[] = [];
  const plugins: ManifestModEntry[] = [];
  const mustFiles: string[] = [];
  const cacheFiles: string[] = [];
  let smallCount = 0;
  let bigCount = 0;
  let smallBytes = 0;
  let bigBytes = 0;
  let referenceCount = 0;
  let mustCount = 0;
  let cacheCount = 0;
  let totalBytes = 0;

  for (const e of entries) {
    const path = e.path.replace(/\\/g, "/");
    const isDir = e.is_dir;
    const sizeBytes = e.size_bytes ?? 0;
    const storage = isDir ? "small" : storageTier(sizeBytes, path);
    const category = isDir ? undefined : classifyPath(path);
    const tag = isDir ? undefined : getFileTag(category, storage, path);

    files.push({
      path,
      isDir,
      sizeBytes,
      storage,
      ...(category && { category }),
      ...(tag && { tag }),
    });

    if (!isDir) {
      totalBytes += sizeBytes;
      if (storage === "small") {
        smallCount++;
        smallBytes += sizeBytes;
      } else if (storage === "big") {
        bigCount++;
        bigBytes += sizeBytes;
      } else {
        referenceCount++;
      }
      if (tag === "must") {
        mustCount++;
        mustFiles.push(path);
      } else if (tag === "cache") {
        cacheCount++;
        cacheFiles.push(path);
      }
    }

    const name = path.split("/").pop() ?? path;
    if (path.startsWith(MODS_PREFIX) && path.endsWith(JAR) && !isDir) {
      mods.push({
        path,
        name,
        sizeBytes,
        storage,
      });
    } else if (path.startsWith(PLUGINS_PREFIX) && path.endsWith(JAR) && !isDir) {
      plugins.push({
        path,
        name,
        sizeBytes,
        storage,
      });
    }
  }

  return {
    files,
    mods,
    plugins,
    summary: {
      smallCount,
      bigCount,
      smallBytes,
      bigBytes,
      referenceCount,
      totalBytes,
      mustCount,
      cacheCount,
    },
    mustFiles: mustFiles.length > 0 ? mustFiles : undefined,
    cacheFiles: cacheFiles.length > 0 ? cacheFiles : undefined,
    preset: options?.preset,
  };
}

/** Tree node for UI (built from flat manifest files). */
export interface ManifestTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  storage: "small" | "big" | "reference";
  category?: string;
  tag?: SnapshotFileTag;
  children: ManifestTreeNode[];
}

export function buildManifestTree(files: ManifestFileEntry[]): ManifestTreeNode[] {
  const root: ManifestTreeNode[] = [];
  const byPath = new Map<string, ManifestTreeNode>();

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    const node: ManifestTreeNode = {
      name: f.path.split("/").pop() ?? f.path,
      path: f.path,
      isDir: f.isDir,
      sizeBytes: f.sizeBytes,
      storage: f.storage,
      ...(f.category && { category: f.category }),
      ...(f.tag && { tag: f.tag }),
      children: [],
    };
    byPath.set(f.path, node);

    if (!f.path.includes("/")) {
      root.push(node);
      continue;
    }
    const parts = f.path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const parent = byPath.get(parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      root.push(node);
    }
  }

  const sortNodes = (nodes: ManifestTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

/** Snapshot tree node shape for backend/website (is_dir, size_bytes, tier, category, tag). */
export interface SnapshotTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  tier?: string;
  category?: string;
  /** must | cache | mini | big for backup scope. */
  tag?: SnapshotFileTag;
  children?: SnapshotTreeNode[];
}

export function manifestTreeToSnapshotTree(nodes: ManifestTreeNode[]): SnapshotTreeNode[] {
  return nodes.map((n) => ({
    name: n.name,
    path: n.path,
    is_dir: n.isDir,
    size_bytes: n.sizeBytes,
    tier: n.storage === "small" ? "mini" : n.storage === "big" ? "big" : undefined,
    ...(n.category && { category: n.category }),
    ...(n.tag && { tag: n.tag }),
    children: n.children?.length ? manifestTreeToSnapshotTree(n.children) : undefined,
  }));
}
