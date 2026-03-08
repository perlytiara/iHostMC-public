"use client";

import { useEffect, useState, useRef } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { getPath, getCloudServerDetailPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredToken, clearStoredAuth, responseJson } from "@/lib/api";
import { formatSize, getBackupTier, getTierLabel, getTierDescription, getCustomBackupTags, type BackupItem, type BackupMetadata, type SnapshotFileTreeNode } from "@/lib/cloud";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileArchive,
  Server,
  Download,
  Trash2,
  Pencil,
  Package,
  FileCheck,
  FileX,
  HardDrive,
  FileText,
  Tag,
  Folder,
  FolderOpen,
  File,
  Info,
  Layers,
  ExternalLink,
  MoreVertical,
} from "lucide-react";

interface BackupDetailPageProps {
  backupId: string;
}

const NOTABLE_CONFIG_PATTERNS = [
  "server.properties",
  "eula.txt",
  "bukkit.yml",
  "help.yml",
  "commands.yml",
  "config/",
  "paper-global.yml",
  "paper-world-defaults.yml",
];

function isNotableConfigPath(path: string): boolean {
  const lower = path.replace(/\\/g, "/").toLowerCase();
  const name = lower.split("/").pop() ?? "";
  if (NOTABLE_CONFIG_PATTERNS.some((p) => (p.endsWith("/") ? lower.includes(p) : name === p || lower.endsWith("/" + p)))) return true;
  if (name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".properties")) return true;
  return false;
}

function flattenFileTree(nodes: SnapshotFileTreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (!n.is_dir) out.push(n.path);
    if (n.children?.length) out.push(...flattenFileTree(n.children));
  }
  return out;
}

type FileEntry = { path: string; tag?: string; category?: string };

function flattenFileTreeWithMeta(nodes: SnapshotFileTreeNode[]): FileEntry[] {
  const out: FileEntry[] = [];
  for (const n of nodes) {
    if (!n.is_dir) out.push({ path: n.path, tag: n.tag, category: n.category });
    if (n.children?.length) out.push(...flattenFileTreeWithMeta(n.children));
  }
  return out;
}

/** Path is a file (not a directory): no other path has this as a prefix. */
function onlyFilePathsFromEntries(entries: FileEntry[]): FileEntry[] {
  const paths = entries.map((e) => e.path);
  const set = new Set(paths);
  return entries.filter((e) => {
    const prefix = e.path + "/";
    return ![...set].some((other) => other !== e.path && other.startsWith(prefix));
  });
}

/** Count files by tag and category from tree (for when metadata counts are missing). */
function countByTagAndCategory(nodes: SnapshotFileTreeNode[]): {
  byTag: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const byTag: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  function walk(ns: SnapshotFileTreeNode[]) {
    for (const n of ns) {
      if (!n.is_dir) {
        if (n.tag) byTag[n.tag] = (byTag[n.tag] ?? 0) + 1;
        if (n.category) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;
      }
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return { byTag, byCategory };
}

const CATEGORY_LABELS: Record<string, string> = {
  config: "Config",
  world: "World",
  mod: "Mods",
  plugin: "Plugins",
  library: "Libraries",
  jar: "JARs",
  cache: "Cache",
  other: "Other",
};

/** Renders children only after mount to avoid hydration mismatch from extensions (e.g. Dark Reader) modifying SVG. */
function AfterMount({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}

function BreakdownBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 shrink-0 text-xs text-zinc-400">{label}</span>
      <div className="flex-1 min-w-0 h-5 rounded bg-zinc-800/80 overflow-hidden">
        <div className="h-full rounded transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-mono text-zinc-500">{count}</span>
    </div>
  );
}

/** Extract loader/build version from file paths (e.g. Paper from libraries/io/papermc/paper/...). */
function extractLoaderInfo(paths: string[], serverType?: string): { loaderVersion?: string; build?: string; details?: string[] } {
  const result: { loaderVersion?: string; build?: string; details?: string[] } = { details: [] };
  const lowerType = (serverType ?? "").toLowerCase();
  for (const p of paths) {
    const path = p.replace(/\\/g, "/");
    const matchPaper = path.match(/libraries\/io\/papermc\/paper\/paper-api\/([^/]+)/);
    if (matchPaper) {
      result.loaderVersion = matchPaper[1];
      if (!result.build && path.includes("paper-api")) result.build = matchPaper[1];
    }
    const matchPaperJar = path.match(/paper-api-([^/]+)\.jar/);
    if (matchPaperJar && !result.loaderVersion) result.loaderVersion = matchPaperJar[1];
    const matchPurpur = path.match(/purpur-(\d+\.\d+(?:\.\d+)?(?:-R\d+)?)\.jar/);
    if (matchPurpur) result.loaderVersion = matchPurpur[1];
    const matchForge = path.match(/libraries\/net\/minecraftforge\/forge\/([^/]+)/);
    if (matchForge) result.loaderVersion = matchForge[1];
    const matchNeoForge = path.match(/libraries\/net\/neoforged\/neoforge\/([^/]+)/);
    if (matchNeoForge) result.loaderVersion = matchNeoForge[1];
    const matchFabric = path.match(/fabric-loader-(\d+\.\d+\.\d+(?:\.\d+)?)/);
    if (matchFabric) (result.details = result.details ?? []).push(`Fabric loader ${matchFabric[1]}`);
    const matchSpark = path.match(/spark-paper\/([^/]+)\/spark-paper/);
    if (matchSpark) (result.details = result.details ?? []).push(`Spark ${matchSpark[1]}`);
  }
  if (result.details?.length === 0) delete result.details;
  return result;
}

/** Build a tree from flat file paths for display when file_tree is not in manifest. */
function buildTreeFromPaths(paths: string[]): SnapshotFileTreeNode[] {
  const byPath = new Map<string, SnapshotFileTreeNode>();
  const rootChildren: SnapshotFileTreeNode[] = [];
  const sorted = [...paths].filter(Boolean).sort((a, b) => a.localeCompare(b));
  for (const path of sorted) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    for (let i = 0; i < parts.length; i++) {
      const segPath = parts.slice(0, i + 1).join("/");
      if (byPath.has(segPath)) continue;
      const name = parts[i]!;
      const isDir = i < parts.length - 1;
      const node: SnapshotFileTreeNode = {
        name,
        path: segPath,
        is_dir: isDir,
        size_bytes: 0,
        children: isDir ? [] : undefined,
      };
      byPath.set(segPath, node);
      if (i === 0) {
        rootChildren.push(node);
      } else {
        const parentPath = parts.slice(0, i).join("/");
        const parent = byPath.get(parentPath);
        if (parent) (parent.children = parent.children ?? []).push(node);
      }
    }
  }
  function sortNodes(nodes: SnapshotFileTreeNode[]) {
    nodes.sort((a, b) => (a.is_dir === b.is_dir ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) : a.is_dir ? -1 : 1));
    nodes.forEach((n) => n.children?.length && sortNodes(n.children));
  }
  sortNodes(rootChildren);
  return rootChildren;
}

function countFilesUnder(node: SnapshotFileTreeNode): number {
  if (!node.is_dir) return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countFilesUnder(c), 0);
}

function SnapshotFileTree({ nodes, depth }: { nodes: SnapshotFileTreeNode[]; depth: number }) {
  if (!nodes.length) return null;
  return (
    <>
      {nodes.map((node, i) => (
        <li key={i} className="list-none">
          <div
            className="flex items-center gap-1.5 py-0.5 truncate"
            style={{ paddingLeft: depth * 12 }}
            title={node.path}
          >
            {node.is_dir ? (
              <Folder className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden />
            ) : (
              <File className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden />
            )}
            <span className="truncate">{node.name}</span>
            {!node.is_dir && node.size_bytes > 0 && (
              <span className="text-zinc-600 shrink-0 ml-1">{formatSize(node.size_bytes)}</span>
            )}
            {node.category && (
              <span className="shrink-0 text-zinc-500 text-[10px] ml-1 uppercase">[{node.category}]</span>
            )}
            {node.tag && (
              <span
                className={`shrink-0 text-[10px] ml-1 px-1 rounded ${
                  node.tag === "must"
                    ? "bg-emerald-900/50 text-emerald-300"
                    : node.tag === "cache"
                      ? "bg-zinc-700/50 text-zinc-400"
                      : node.tag === "mini"
                        ? "bg-blue-900/50 text-blue-300"
                        : "bg-amber-900/50 text-amber-300"
                }`}
              >
                {node.tag}
              </span>
            )}
            {node.tier && !node.category && !node.tag && (
              <span className="shrink-0 text-zinc-600 text-[10px] ml-1">({node.tier})</span>
            )}
          </div>
          {node.children && node.children.length > 0 && (
            <ul className="list-none">
              <SnapshotFileTree nodes={node.children} depth={depth + 1} />
            </ul>
          )}
        </li>
      ))}
    </>
  );
}

function CollapsibleFileTree({ nodes }: { nodes: SnapshotFileTreeNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  if (!nodes.length) return null;
  return (
    <ul className="list-none space-y-0.5">
      {nodes.map((node, i) => {
        const isExpanded = expanded.has(node.path);
        const fileCount = countFilesUnder(node);
        return (
          <li key={i} className="list-none">
            <button
              type="button"
              onClick={() => toggle(node.path)}
              className="flex items-center gap-1.5 py-1.5 pr-2 w-full text-left rounded hover:bg-zinc-800/50 text-zinc-300 hover:text-zinc-100 transition-colors"
              title={node.path}
            >
              {node.is_dir ? (
                isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
              ) : null}
              {!node.is_dir && <span className="w-4 shrink-0" />}
              {node.is_dir ? (
                <Folder className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden />
              ) : (
                <File className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden />
              )}
              <span className="truncate min-w-0">{node.name}</span>
              {node.is_dir && (
                <span className="shrink-0 text-[10px] text-zinc-500 font-mono ml-1">({fileCount})</span>
              )}
              {!node.is_dir && node.size_bytes > 0 && (
                <span className="shrink-0 text-zinc-600 text-[10px] ml-1">{formatSize(node.size_bytes)}</span>
              )}
              {!node.is_dir && node.tag && (
                <span className={`shrink-0 text-[10px] px-1 rounded ${node.tag === "must" ? "bg-emerald-900/50 text-emerald-300" : node.tag === "cache" ? "bg-zinc-700/50 text-zinc-400" : node.tag === "mini" ? "bg-blue-900/50 text-blue-300" : "bg-amber-900/50 text-amber-300"}`}>{node.tag}</span>
              )}
              {!node.is_dir && node.category && (
                <span className="shrink-0 text-zinc-500 text-[10px] uppercase">[{node.category}]</span>
              )}
            </button>
            {node.is_dir && isExpanded && node.children && node.children.length > 0 && (
              <div className="pl-4 border-l border-zinc-700/40 ml-2 my-1">
                <SnapshotFileTree nodes={node.children} depth={1} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function BackupDetailPage({ backupId }: BackupDetailPageProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [backup, setBackup] = useState<BackupItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${backupId}` : `/api/backups/${backupId}`;
    setError(null);
    const alreadyHave = backup?.id === backupId;
    if (!alreadyHave) {
      setBackup(null);
      setLoading(true);
    }
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        if (!r.ok) {
          return responseJson(r, { error: "Failed to load" }).then((d) => { throw new Error(d?.error ?? "Failed to load"); });
        }
        return responseJson(r, null as unknown as BackupItem);
      })
      .then((data: BackupItem | null) => {
        setBackup(data ?? null);
        if (data?.name) setRenameValue(data.name);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [backupId, locale, router]);

  const handleRename = async () => {
    if (!backup || !renameValue.trim()) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${backup.id}` : `/api/backups/${backup.id}`;
    setRenaming(true);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) setBackup((b) => (b ? { ...b, name: renameValue.trim() } : null));
    } finally {
      setRenaming(false);
    }
  };

  const handleMoveToTrash = async () => {
    if (!backup) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${backup.id}` : `/api/backups/${backup.id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDeleteConfirm(false);
      router.push(getPath("dashboardBackups", locale));
    }
  };

  const handleDownload = () => {
    if (!backup || backup.metadata?.source === "sync_snapshot") {
      if (backup?.metadata?.source === "sync_snapshot") alert("Archives from Live sync are not downloadable; files are in Current synced data.");
      return;
    }
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${backup.id}/download` : `/api/backups/${backup.id}/download`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = backup.name || "backup.zip";
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const handleExportSnapshot = () => {
    if (!backup) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${backup.id}/export?format=snapshot` : `/api/backups/${backup.id}/export?format=snapshot`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (backup.name || "backup").replace(/[/\\?*]/g, "_") + "-snapshot.ihostmc-snapshot";
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const meta = backup ? (backup.metadata ?? {}) as BackupMetadata : null;
  const isSnapshot = meta?.source === "sync_snapshot";
  const snapshotManifest = meta?.snapshotManifest;
  const version = snapshotManifest?.version ?? meta?.version ?? meta?.minecraftVersion ?? meta?.gameVersion;
  const modsList = snapshotManifest?.mods ?? meta?.mods ?? [];
  const pluginsList = snapshotManifest?.plugins ?? meta?.plugins ?? [];
  const miniFiles = meta?.miniFiles ?? [];
  const bigFiles = meta?.bigFiles ?? [];
  const mustFiles = meta?.mustFiles ?? snapshotManifest?.mustFiles ?? [];
  const cacheFiles = meta?.cacheFiles ?? snapshotManifest?.cacheFiles ?? [];
  const preset = snapshotManifest?.preset;
  const fileTree = snapshotManifest?.file_tree ?? [];
  const hasFileTree = fileTree.length > 0;
  const hasMiniBig = miniFiles.length > 0 || bigFiles.length > 0;
  const allPaths = hasFileTree
    ? flattenFileTree(fileTree)
    : [...miniFiles, ...bigFiles, ...(meta?.fileList ?? [])];
  const notableConfigPaths = [...new Set(allPaths)].filter(isNotableConfigPath).sort((a, b) => a.localeCompare(b));
  const hasNotableConfig = notableConfigPaths.length > 0;
  const serverName = backup?.serverName ?? snapshotManifest?.server_name ?? meta?.server_name;
  const serverType = snapshotManifest?.server_type ?? meta?.server_type;
  const categories = snapshotManifest?.categories;
  const hasCategories = categories && (Number(categories.essential_count) > 0 || Number(categories.downloadable_count) > 0);
  const loaderInfo = extractLoaderInfo(allPaths, serverType);
  const displayTree = hasFileTree ? fileTree : (allPaths.length > 0 ? buildTreeFromPaths(allPaths) : []);
  const hasHierarchy = displayTree.length > 0;
  const treeCounts = hasHierarchy ? countByTagAndCategory(displayTree) : { byTag: {} as Record<string, number>, byCategory: {} as Record<string, number> };
  const tagTotal = mustFiles.length + cacheFiles.length + miniFiles.length + bigFiles.length || Object.values(treeCounts.byTag).reduce((a, b) => a + b, 0);
  const categoryKeys = ["config", "world", "mod", "plugin", "library", "jar", "cache", "other"] as const;
  const categoryCounts = categoryKeys.reduce<Record<string, number>>((acc, key) => {
    const n = Number((categories as Record<string, number>)?.[key]) ?? treeCounts.byCategory[key] ?? 0;
    if (n > 0) acc[key] = n;
    return acc;
  }, {});
  const categoryTotal = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const tagColors: Record<string, string> = { must: "rgba(52, 211, 153, 0.5)", mini: "rgba(96, 165, 250, 0.5)", big: "rgba(251, 191, 36, 0.5)", cache: "rgba(113, 113, 122, 0.5)" };
  const categoryColors: Record<string, string> = { config: "rgba(52, 211, 153, 0.4)", world: "rgba(168, 85, 247, 0.4)", mod: "rgba(59, 130, 246, 0.4)", plugin: "rgba(59, 130, 246, 0.4)", library: "rgba(34, 197, 94, 0.4)", jar: "rgba(249, 115, 22, 0.4)", cache: "rgba(113, 113, 122, 0.4)", other: "rgba(100, 116, 139, 0.4)" };

  const savedPaths = new Set<string>([...miniFiles, ...bigFiles]);
  const allFileEntries = hasHierarchy ? onlyFilePathsFromEntries(flattenFileTreeWithMeta(displayTree)) : [];
  const missingEntries = allFileEntries.filter((e) => !savedPaths.has(e.path));
  const missingByTag = missingEntries.reduce<Record<string, number>>((acc, e) => {
    const t = e.tag ?? "other";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const missingByCategory = missingEntries.reduce<Record<string, number>>((acc, e) => {
    const c = e.category ?? "other";
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const missingTotal = missingEntries.length;
  const totalInSnapshot = allFileEntries.length || allPaths.length;
  const totalSaved = savedPaths.size;

  const tier = backup ? getBackupTier(backup) : "snapshot";
  const tierLabel = getTierLabel(tier);
  const tierDescription = getTierDescription(tier);

  return (
    <div className="space-y-6">
      <Link href={getPath("dashboardBackups", locale)} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <AfterMount fallback={<span className="h-4 w-4 shrink-0 inline-block" aria-hidden />}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </AfterMount>{" "}
        Back to Cloud
      </Link>

      {error && (
        <p className="text-zinc-400">{error}</p>
      )}
      {!error && !backup && !loading && (
        <p className="text-zinc-400">Backup not found.</p>
      )}

      {(loading || backup) && (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-zinc-700/50 p-3 flex items-center justify-center">
              <AfterMount fallback={<span className="h-8 w-8 block" aria-hidden />}>
                <FileArchive className="h-8 w-8 text-zinc-400" aria-hidden />
              </AfterMount>
            </div>
            <div className="min-w-0 flex-1 min-h-[3.5rem]">
              {loading ? (
                <>
                  <div className="h-6 w-48 rounded bg-zinc-700/40" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="h-5 w-12 rounded bg-zinc-700/30" />
                    <span className="h-4 w-20 rounded bg-zinc-700/30" />
                  </div>
                </>
              ) : backup ? (
                <>
                  {renaming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm font-mono text-white min-w-[200px]"
                        placeholder="Name"
                        autoFocus
                      />
                      <button type="button" onClick={handleRename} className="rounded bg-emerald-600 px-2 py-1.5 text-xs text-white hover:bg-emerald-500">Save</button>
                      <button type="button" onClick={() => setRenaming(false)} className="rounded bg-zinc-600 px-2 py-1.5 text-xs text-zinc-200">Cancel</button>
                    </div>
                  ) : (
                    <h1 className="text-xl font-bold text-zinc-100 truncate" title={backup.name}>
                      {backup.name}
                    </h1>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        tier === "full"
                          ? "bg-emerald-900/50 text-emerald-300"
                          : tier === "structural"
                            ? "bg-blue-900/50 text-blue-300"
                            : tier === "world"
                              ? "bg-amber-900/50 text-amber-300"
                              : tier === "custom"
                                ? "bg-violet-900/50 text-violet-300"
                                : "bg-zinc-600/60 text-zinc-400"
                      }`}
                      title={tierDescription}
                    >
                      {tierLabel}
                    </span>
                    <span className="text-xs text-zinc-500">{formatSize(backup.sizeBytes)}</span>
                    <span className="text-xs text-zinc-500">{new Date(backup.createdAt).toLocaleString()}</span>
                    {backup.serverId && backup.serverName && (
                      <Link
                        href={getCloudServerDetailPath(backup.serverId, locale)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                      >
                        <Server className="h-3.5 w-3.5" /> {backup.serverName}
                      </Link>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          {!loading && backup && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isSnapshot}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              title={isSnapshot ? "Not downloadable" : "Download"}
            >
              <Download className="h-4 w-4" /> Download
            </button>
            <button
              type="button"
              onClick={handleExportSnapshot}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              title="Export as single .ihostmc-snapshot file"
            >
              <FileText className="h-4 w-4" /> Export snapshot
            </button>
            <div className="relative" ref={actionsRef}>
              <button
                type="button"
                onClick={() => setActionsOpen((o) => !o)}
                className="rounded-lg p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                title="Actions"
                aria-expanded={actionsOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {actionsOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setActionsOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                    <button type="button" onClick={() => { setActionsOpen(false); setRenaming(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    <button type="button" onClick={() => { setActionsOpen(false); setDeleteConfirm(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800">
                      <Trash2 className="h-3.5 w-3.5" /> Move to trash
                    </button>
                  </div>
                </>
              )}
            </div>
            {deleteConfirm && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-amber-300">Trash?</span>
                <button type="button" onClick={handleMoveToTrash} className="rounded bg-amber-600 px-2 py-1.5 text-white text-sm">Yes</button>
                <button type="button" onClick={() => setDeleteConfirm(false)} className="rounded bg-zinc-600 px-2 py-1.5 text-zinc-200 text-sm">Cancel</button>
              </span>
            )}
          </div>
          )}
        </div>

        {/* Metadata sections - only when loaded */}
        {backup && meta && (
        <div className="mt-6 pt-6 border-t border-zinc-700/50 space-y-6">
          {tier === "custom" && (() => {
            const tags = getCustomBackupTags(backup.metadata);
            return tags.length > 0 ? (
              <section className="rounded-lg border border-violet-800/50 bg-violet-900/20 p-4">
                <h2 className="text-sm font-semibold text-violet-200 flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4" /> Custom backup
                </h2>
                <p className="text-xs text-zinc-400 mb-2">This backup contains only the categories you chose in the app.</p>
                <p className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Included: </span>
                  {tags.join(", ")}
                </p>
              </section>
            ) : null;
          })()}
          {(serverName || serverType || version || loaderInfo.loaderVersion || (loaderInfo.details?.length ?? 0) > 0) && (
            <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-3">
                <Server className="h-4 w-4" /> Server
              </h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {serverName && (
                  <>
                    <dt className="text-zinc-500">Name</dt>
                    <dd className="font-medium text-zinc-200">{serverName}</dd>
                  </>
                )}
                {serverType && (
                  <>
                    <dt className="text-zinc-500">Loader</dt>
                    <dd className="font-mono text-zinc-300 capitalize">{serverType}</dd>
                  </>
                )}
                {loaderInfo.loaderVersion && (
                  <>
                    <dt className="text-zinc-500">Loader version</dt>
                    <dd className="font-mono text-zinc-300">{loaderInfo.loaderVersion}</dd>
                  </>
                )}
                {(version || snapshotManifest?.minecraft_version) && (
                  <>
                    <dt className="text-zinc-500">Minecraft</dt>
                    <dd className="font-mono text-zinc-300">{version ?? snapshotManifest?.minecraft_version}</dd>
                  </>
                )}
                {loaderInfo.details && loaderInfo.details.length > 0 && (
                  <>
                    <dt className="text-zinc-500">Detected</dt>
                    <dd className="font-mono text-zinc-400 text-xs">{loaderInfo.details.join(" · ")}</dd>
                  </>
                )}
              </dl>
            </section>
          )}
          {(preset?.server_type || preset?.minecraft_version || preset?.loader_version) && (
            <section className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
              <h2 className="text-sm font-semibold text-emerald-200 flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4" /> Restore preset
              </h2>
              <p className="text-xs text-zinc-400 mb-2">
                Use this preset to re-download the server jar and match the original environment (e.g. Paper API, Forge, Modrinth).
              </p>
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                {preset.server_type && (
                  <>
                    <dt className="text-zinc-500">Server type</dt>
                    <dd className="font-mono text-emerald-200">{preset.server_type}</dd>
                  </>
                )}
                {(preset.minecraft_version || preset.loader_version) && (
                  <>
                    <dt className="text-zinc-500">Version</dt>
                    <dd className="font-mono text-zinc-300">{preset.minecraft_version ?? preset.loader_version}</dd>
                  </>
                )}
                {preset.build_id && (
                  <>
                    <dt className="text-zinc-500">Build</dt>
                    <dd className="font-mono text-zinc-400">{preset.build_id}</dd>
                  </>
                )}
              </dl>
            </section>
          )}
          {(hasCategories || tagTotal > 0 || categoryTotal > 0 || missingTotal > 0 || totalSaved > 0 || allPaths.length > 0) && (
            <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4" /> What’s in this backup
              </h2>
              <p className="text-xs text-zinc-400 mb-2">{tierDescription}</p>
              <p className="text-xs text-zinc-500 mb-4">
                {totalSaved > 0 ? `${totalSaved} saved` : "0 saved"}
                {totalInSnapshot > 0 && (
                  <span className="text-zinc-400">
                    {missingTotal > 0 ? ` · ${missingTotal} in snapshot, not stored` : " · 0 missing"}
                  </span>
                )}
                {allPaths.length > 0 && totalSaved === 0 && missingTotal === 0 && (
                  <span className="text-zinc-400"> · {allPaths.length} in snapshot</span>
                )}
              </p>
              <div className={`grid gap-6 ${(totalInSnapshot > 0 || allPaths.length > 0) ? "sm:grid-cols-2" : ""}`}>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">By tag</h3>
                    <div className="space-y-0">
                      {mustFiles.length > 0 && <BreakdownBar label="must" count={mustFiles.length} total={tagTotal || 1} color={tagColors.must} />}
                      {miniFiles.length > 0 && <BreakdownBar label="mini" count={miniFiles.length} total={tagTotal || 1} color={tagColors.mini} />}
                      {bigFiles.length > 0 && <BreakdownBar label="big" count={bigFiles.length} total={tagTotal || 1} color={tagColors.big} />}
                      {cacheFiles.length > 0 && <BreakdownBar label="cache" count={cacheFiles.length} total={tagTotal || 1} color={tagColors.cache} />}
                      {tagTotal === 0 && Object.entries(treeCounts.byTag).length > 0 && (
                        Object.entries(treeCounts.byTag).map(([tag, count]) => (
                          <BreakdownBar key={tag} label={tag} count={count} total={Object.values(treeCounts.byTag).reduce((a, b) => a + b, 0)} color={tagColors[tag] ?? "rgba(113, 113, 122, 0.5)"} />
                        ))
                      )}
                      {tagTotal === 0 && Object.entries(treeCounts.byTag).length === 0 && totalSaved > 0 && (
                        <BreakdownBar label="files" count={totalSaved} total={totalSaved} color="rgba(96, 165, 250, 0.4)" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">By category</h3>
                    <div className="space-y-0">
                      {Object.entries(categoryCounts).map(([key, count]) => (
                        <BreakdownBar key={key} label={CATEGORY_LABELS[key] ?? key} count={count} total={categoryTotal || 1} color={categoryColors[key] ?? "rgba(100, 116, 139, 0.4)"} />
                      ))}
                      {categoryTotal === 0 && totalSaved > 0 && (
                        <BreakdownBar label="files" count={totalSaved} total={totalSaved} color="rgba(100, 116, 139, 0.4)" />
                      )}
                    </div>
                  </div>
                </div>
                {(totalInSnapshot > 0 || allPaths.length > 0) && (
                  <div className="space-y-4 border-l border-zinc-700/50 pl-6">
                    <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Not in this backup</h3>
                    <p className="text-[11px] text-zinc-500">Files in snapshot that weren’t stored. Run a full backup in the app to sync them.</p>
                    {missingTotal > 0 ? (
                      <>
                        <div>
                          <p className="text-[10px] text-zinc-500 mb-2">By tag</p>
                          <div className="space-y-0">
                            {(["must", "mini", "big", "cache", "other"] as const).map((tag) => {
                              const count = missingByTag[tag] ?? 0;
                              if (count === 0) return null;
                              const tot = Object.values(missingByTag).reduce((a, b) => a + b, 0);
                              return <BreakdownBar key={tag} label={tag} count={count} total={tot || 1} color={tagColors[tag] ?? "rgba(100, 116, 139, 0.35)"} />;
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 mb-2">By category</p>
                          <div className="space-y-0">
                            {Object.entries(missingByCategory).map(([key, count]) => {
                              const tot = Object.values(missingByCategory).reduce((a, b) => a + b, 0);
                              return <BreakdownBar key={key} label={CATEGORY_LABELS[key] ?? key} count={count} total={tot || 1} color={categoryColors[key] ?? "rgba(100, 116, 139, 0.35)"} />;
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-emerald-400/90">All snapshot files are in this backup. Use the app to run a full backup and include any new or big files.</p>
                    )}
                  </div>
                )}
              </div>
              {(Number(categories?.essential_count) > 0 || Number(categories?.downloadable_count) > 0) && (
                <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-zinc-700/50 text-xs text-zinc-500">
                  {Number(categories?.essential_count) > 0 && <span><FileCheck className="h-3 w-3 inline mr-1" />{categories!.essential_count} essential</span>}
                  {Number(categories?.downloadable_count) > 0 && <span><HardDrive className="h-3 w-3 inline mr-1" />{categories!.downloadable_count} re-downloadable</span>}
                </div>
              )}
            </section>
          )}
          {isSnapshot && (modsList.length > 0 || version || serverType) && (
            <section className="rounded-lg border border-blue-800/40 bg-blue-900/10 p-3">
              <p className="text-xs text-zinc-400 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                Preset + mod list → Paper API, Modrinth, CurseForge.
              </p>
            </section>
          )}
          {version && !serverType && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4" /> Version
              </h2>
              <p className="text-sm text-zinc-400 font-mono">{version}</p>
            </section>
          )}
          {modsList.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <Package className="h-4 w-4" /> Mods ({modsList.length})
              </h2>
              <p className="text-xs text-zinc-500 mb-1.5">Get online: search by name on Modrinth or CurseForge.</p>
              <ul className="text-sm text-zinc-500 font-mono max-h-40 overflow-y-auto space-y-1">
                {modsList.map((m, i) => {
                  const name = typeof m === "string" ? m.replace(/\.jar$/i, "") : String(m);
                  const modrinthSearch = `https://modrinth.com/mods?q=${encodeURIComponent(name)}`;
                  const curseforgeSearch = `https://www.curseforge.com/minecraft/mc-mods?search=${encodeURIComponent(name)}`;
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 py-0.5">
                      <span className="truncate min-w-0 flex-1" title={name}>{name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <a
                          href={modrinthSearch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5"
                        >
                          Modrinth <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={curseforgeSearch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"
                        >
                          CurseForge <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {pluginsList.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <Package className="h-4 w-4" /> Plugins ({pluginsList.length})
              </h2>
              <p className="text-xs text-zinc-500 mb-1.5">Get online: search by name on Modrinth or CurseForge.</p>
              <ul className="text-sm text-zinc-500 font-mono max-h-40 overflow-y-auto space-y-1">
                {pluginsList.map((p, i) => {
                  const name = typeof p === "string" ? p.replace(/\.jar$/i, "") : String(p);
                  const modrinthSearch = `https://modrinth.com/plugins?q=${encodeURIComponent(name)}`;
                  const curseforgeSearch = `https://www.curseforge.com/minecraft/bukkit-plugins?search=${encodeURIComponent(name)}`;
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 py-0.5">
                      <span className="truncate min-w-0 flex-1" title={name}>{name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <a
                          href={modrinthSearch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5"
                        >
                          Modrinth <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={curseforgeSearch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"
                        >
                          CurseForge <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {hasNotableConfig && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" /> Config & notable files ({notableConfigPaths.length})
              </h2>
              <ul className="text-xs text-zinc-500 font-mono max-h-32 overflow-y-auto space-y-0.5">
                {notableConfigPaths.map((p, i) => (
                  <li key={i} className="truncate" title={p}>{p}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            {meta.filesOnBackup != null && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <FileCheck className="h-4 w-4" /> {meta.filesOnBackup} files on backup
              </span>
            )}
            {meta.filesMissing != null && meta.filesMissing > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <FileX className="h-4 w-4" /> {meta.filesMissing} missing
              </span>
            )}
            {meta.filesTooBig != null && meta.filesTooBig > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <HardDrive className="h-4 w-4" /> {meta.filesTooBig} too big
              </span>
            )}
          </div>

          {hasHierarchy && (
            <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-3">
                <FolderOpen className="h-4 w-4" /> Full folder hierarchy ({allPaths.length} files)
              </h2>
              <p className="text-xs text-zinc-500 mb-3">Expand a folder to browse its contents. Tags: must, mini, big, cache.</p>
              <div className="text-xs font-mono max-h-[28rem] overflow-y-auto overflow-x-auto rounded-lg border border-zinc-700/50 p-3 bg-zinc-900/30">
                <CollapsibleFileTree nodes={displayTree} />
              </div>
            </section>
          )}

          {!hasHierarchy && (meta.fileList?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" /> Files on backup ({(meta.fileList ?? []).length})
              </h2>
              <ul className="text-xs text-zinc-500 font-mono max-h-48 overflow-y-auto space-y-0.5">
                {(meta.fileList ?? []).slice(0, 100).map((p, i) => (
                  <li key={i} className="truncate" title={p}>{p}</li>
                ))}
                {(meta.fileList ?? []).length > 100 && <li>…+{(meta.fileList ?? []).length - 100} more</li>}
              </ul>
            </section>
          )}
          {(meta.bigFileList?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4" /> Files too big, not stored ({(meta.bigFileList ?? []).length})
              </h2>
              <ul className="text-xs text-zinc-500 font-mono max-h-32 overflow-y-auto space-y-0.5">
                {(meta.bigFileList ?? []).slice(0, 50).map((p, i) => (
                  <li key={i} className="truncate" title={p}>{p}</li>
                ))}
                {(meta.bigFileList ?? []).length > 50 && <li>…+{(meta.bigFileList ?? []).length - 50} more</li>}
              </ul>
            </section>
          )}
        </div>
        )}
      </div>
      )}
    </div>
  );
}
