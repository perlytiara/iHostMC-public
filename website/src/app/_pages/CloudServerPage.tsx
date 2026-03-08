"use client";

import { useEffect, useState, useRef } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getPath, getCloudServerDetailPath, getBackupDetailPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredToken, clearStoredAuth } from "@/lib/api";
import { formatSize, getNextRunAt, getBackupTier, getTierLabel, getIntervalLabel, type BackupItem, type SyncServer, type ServerSummary, type SyncedFile, type TrashItem } from "@/lib/cloud";
import { getTimeZones, getStoredTimeZone, setStoredTimeZone, formatDateTimeInTimeZone } from "@/lib/timezone";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import {
  ChevronLeft,
  Server,
  Zap,
  Package,
  FileArchive,
  Trash2,
  Download,
  Pencil,
  FolderOpen,
  RefreshCw,
  FileText,
  HardDrive,
  Folder,
  ChevronRight,
  File,
  Search,
  Clock,
  ExternalLink,
  X,
  Check,
  AlertCircle,
  ChevronDown,
  Calendar,
  CalendarRange,
  CalendarDays,
  Hand,
  type LucideIcon,
} from "lucide-react";

const MAX_OCCURRENCE_CARDS = 5;

/** Preset interval options (hours). Default 1 (Hourly). Custom 1–24 allowed. */
const INTERVAL_HOURS_PRESETS = [1, 2, 3, 4, 6, 8, 12, 24] as const;
const INTERVAL_HOURS_MIN = 1;
const INTERVAL_HOURS_MAX = 24;
const INTERVAL_HOURS_DEFAULT = 1;

/** Off-peak times for daily backup (low server load). */
const DAILY_OFF_PEAK_TIMES = ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00"] as const;

/** Day-of-month presets: 1st, 15th, 28th, 30th, 31st. Custom 1–31. */
const MONTHLY_DAY_PRESETS = [
  { day: 1, label: "1st" },
  { day: 15, label: "15th" },
  { day: 28, label: "28th" },
  { day: 30, label: "30th" },
  { day: 31, label: "31st" },
] as const;
const MONTHLY_DAY_DEFAULT = 1;
const MONTHLY_DAY_MIN = 1;
const MONTHLY_DAY_MAX = 31;

const OCCURRENCE_SLOT_DEFS: { type: "3h" | "daily" | "weekly" | "monthly" | "manual"; label: string; icon: LucideIcon }[] = [
  { type: "3h", label: "Hourly", icon: Clock },
  { type: "daily", label: "Daily", icon: Calendar },
  { type: "weekly", label: "Weekly", icon: CalendarRange },
  { type: "monthly", label: "Monthly", icon: CalendarDays },
  { type: "manual", label: "Manual", icon: Hand },
];

function getOccurrenceLabel(iterationType: "3h" | "daily" | "weekly" | "monthly" | null | undefined, intervalHours?: number): string {
  if (iterationType === "3h") return getIntervalLabel(Number(intervalHours) || INTERVAL_HOURS_DEFAULT);
  if (iterationType === "daily") return "Daily";
  if (iterationType === "weekly") return "Weekly";
  if (iterationType === "monthly") return "Monthly";
  return "Manual";
}

/** Tree node built from flat synced file paths for browsable folder structure */
interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  storageTier: string;
  children: FileTreeNode[];
  fileId?: string;
}

function buildTreeFromSyncedFiles(files: SyncedFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const byPath = new Map<string, FileTreeNode>();
  const sorted = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const f of sorted) {
    const parts = f.filePath.split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!byPath.has(dirPath)) {
        const node: FileTreeNode = {
          name: parts[i]!,
          path: dirPath,
          isDir: true,
          sizeBytes: 0,
          storageTier: "",
          children: [],
        };
        byPath.set(dirPath, node);
        if (i === 0) root.push(node);
        else byPath.get(parts.slice(0, i).join("/"))?.children.push(node);
      }
    }
    const node: FileTreeNode = {
      name: parts[parts.length - 1] ?? f.filePath,
      path: f.filePath,
      isDir: false,
      sizeBytes: f.sizeBytes,
      storageTier: f.storageTier,
      children: [],
      fileId: f.id,
    };
    byPath.set(f.filePath, node);
    if (parts.length <= 1) root.push(node);
    else byPath.get(parts.slice(0, -1).join("/"))?.children.push(node);
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
    );
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function FileTreeRow({
  node,
  depth,
  onDownload,
  onSelectFolder,
  onHighlight,
  selectedPath,
  filterPath,
}: {
  node: FileTreeNode;
  depth: number;
  onDownload: (fileId: string, filePath: string) => void;
  onSelectFolder: (path: string | null) => void;
  onHighlight: (path: string | null) => void;
  selectedPath: string | null;
  filterPath: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);

  const handleRowClick = () => {
    if (node.isDir) {
      setOpen((o) => !o);
      onSelectFolder(node.path === filterPath ? null : node.path);
    } else if (node.fileId) {
      onHighlight(node.path);
      onDownload(node.fileId, node.path);
    }
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.fileId) {
      onHighlight(node.path);
      onDownload(node.fileId, node.path);
    }
  };

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 w-full rounded px-1.5 py-1 text-left text-sm hover:bg-zinc-800/50 ${
          !node.isDir && selectedPath === node.path ? "bg-zinc-700/50" : ""
        } ${node.isDir && filterPath === node.path ? "bg-zinc-700/30" : ""}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <button
          type="button"
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
          onClick={handleRowClick}
        >
          {node.isDir ? (
            <ChevronRight
              className={`h-3.5 w-3.5 text-zinc-500 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {node.isDir ? (
            open ? (
              <FolderOpen className="h-4 w-4 text-amber-500/80 shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-zinc-500 shrink-0" />
            )
          ) : (
            <File className="h-4 w-4 text-zinc-500 shrink-0" />
          )}
          <span className="font-mono text-zinc-200 truncate min-w-0">{node.name}</span>
          {!node.isDir && (
            <>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-zinc-700/50 text-zinc-400">
                {node.storageTier}
              </span>
              <span className="text-xs text-zinc-500 shrink-0">{formatSize(node.sizeBytes)}</span>
            </>
          )}
        </button>
        {!node.isDir && node.fileId && (
          <button
            type="button"
            onClick={handleDownloadClick}
            className="shrink-0 p-1 rounded text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-zinc-700/50 transition-opacity"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {node.isDir && open && (
        <div>
          {node.children.map((c) => (
            <FileTreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              onDownload={onDownload}
              onSelectFolder={onSelectFolder}
              onHighlight={onHighlight}
              selectedPath={selectedPath}
              filterPath={filterPath}
            />
          ))}
        </div>
      )}
    </>
  );
}

type ManifestNode = {
  path: string;
  is_dir?: boolean;
  tag?: string;
  category?: string;
  children?: unknown[];
};

type ManifestDataShape = {
  fileList?: string[];
  file_tree?: ManifestNode[];
};

/** Infer category from path for display/grouping when manifest has no category. */
function inferCategory(path: string): string {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("libraries/")) return "library";
  if (p.startsWith("config/") || /\.(yml|yaml|properties)$/i.test(p)) return "config";
  if (p.startsWith("mods/") && p.endsWith(".jar")) return "mod";
  if (p.startsWith("plugins/") && p.endsWith(".jar")) return "plugin";
  if (p.startsWith("cache/") || p.startsWith("logs/")) return "cache";
  if (/^(world|world_nether|world_the_end|DIM-1|DIM1)\b/.test(p)) return "world";
  if (p.endsWith(".jar") && !p.includes("/")) return "jar";
  return "other";
}

const CATEGORY_LABELS: Record<string, string> = { config: "Config", world: "World", mod: "Mods", plugin: "Plugins", library: "Libraries", jar: "JARs", cache: "Cache", other: "Other" };

function flattenManifestPaths(manifest: ManifestDataShape): string[] {
  return flattenManifestPathsWithTags(manifest).map((x) => x.path);
}

/** Flatten manifest to file paths with tag and inferred category. */
function flattenManifestPathsWithTags(manifest: ManifestDataShape): { path: string; tag?: string; category?: string }[] {
  if (manifest.fileList && Array.isArray(manifest.fileList)) {
    return manifest.fileList.map((path) => ({ path, category: inferCategory(path) }));
  }
  if (!manifest.file_tree?.length) return [];
  const out: { path: string; tag?: string; category?: string }[] = [];
  function walk(nodes: ManifestNode[]) {
    for (const n of nodes) {
      if (n.is_dir !== true) out.push({ path: n.path, tag: n.tag, category: (n as { category?: string }).category ?? inferCategory(n.path) });
      if (Array.isArray(n.children)) walk(n.children as ManifestNode[]);
    }
  }
  walk(manifest.file_tree);
  return out;
}

/** Keep only entries that are files (not directories). A path is a directory if another path has it as a prefix. */
function onlyFilePaths<T extends { path: string }>(entries: T[]): T[] {
  const paths = entries.map((e) => e.path);
  const set = new Set(paths);
  return entries.filter((e) => {
    const prefix = e.path + "/";
    return ![...set].some((other) => other !== e.path && other.startsWith(prefix));
  });
}

function BreakdownBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-16 shrink-0 text-xs text-zinc-400">{label}</span>
      <div className="flex-1 min-w-0 h-4 rounded bg-zinc-800/80 overflow-hidden">
        <div className="h-full rounded transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-mono text-zinc-500">{count}</span>
    </div>
  );
}

/** Clickable bar for filtering/expanding by tag; selected = ring. */
function InteractiveBreakdownBar({
  label,
  count,
  total,
  color,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 py-1.5 w-full text-left rounded px-1 -mx-1 hover:bg-zinc-800/60 transition-colors ${selected ? "ring-2 ring-amber-400/80 ring-inset" : ""}`}
      title={`Show ${label} (${count} files)`}
    >
      <span className="w-16 shrink-0 text-xs text-zinc-400 font-medium">{label}</span>
      <div className="flex-1 min-w-0 h-4 rounded bg-zinc-800/80 overflow-hidden">
        <div className="h-full rounded transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-mono text-zinc-500">{count}</span>
    </button>
  );
}

const UNSYNCED_TAG_COLORS: Record<string, string> = { must: "rgba(251, 191, 36, 0.55)", mini: "rgba(96, 165, 250, 0.55)", big: "rgba(59, 130, 246, 0.55)", cache: "rgba(113, 113, 122, 0.55)", other: "rgba(100, 116, 139, 0.45)" };

const TAG_ORDER = ["must", "mini", "big", "cache", "other"] as const;

type UnsyncedEntry = { path: string; tag?: string; category?: string };

function SyncedVsUnsyncedView({
  syncedMini,
  syncedBig,
  notSynced,
}: {
  syncedMini: number;
  syncedBig: number;
  notSynced: UnsyncedEntry[];
}) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const byTag = TAG_ORDER.reduce<Record<string, UnsyncedEntry[]>>((acc, tag) => {
    acc[tag] = notSynced.filter((e) => (e.tag ?? "other") === tag);
    return acc;
  }, {});
  const tagTotals = TAG_ORDER.reduce<Record<string, number>>((acc, tag) => {
    acc[tag] = byTag[tag].length;
    return acc;
  }, {});
  const totalUnsynced = notSynced.length;
  const totalSynced = syncedMini + syncedBig;

  const toggleExpanded = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-zinc-700/50">
      <div
        className="rounded-lg border-l-4 border-emerald-600 bg-emerald-950/30 p-4"
        role="region"
        aria-label="Synced files"
      >
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-2">
          <Check className="h-4 w-4 text-emerald-400" aria-hidden />
          Synced
        </h3>
        <p className="text-xs text-zinc-500 mb-2">{totalSynced} files uploaded</p>
        <div className="space-y-0 max-w-xs">
          {syncedMini > 0 && <BreakdownBar label="mini" count={syncedMini} total={totalSynced || 1} color="rgba(52, 211, 153, 0.45)" />}
          {syncedBig > 0 && <BreakdownBar label="big" count={syncedBig} total={totalSynced || 1} color="rgba(251, 191, 36, 0.4)" />}
        </div>
      </div>
      <div
        className="rounded-lg border-l-4 border-amber-600 bg-amber-950/20 p-4"
        role="region"
        aria-label="Not synced files"
      >
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden />
          Not synced
        </h3>
        <p className="text-xs text-zinc-500 mb-2">{totalUnsynced} files in snapshot, not uploaded</p>
        {totalUnsynced === 0 ? (
          <p className="text-xs text-emerald-400/90">All snapshot files are synced.</p>
        ) : (
          <>
        <p className="text-[11px] text-zinc-500 mb-3">Click a bar to focus; expand a tag to browse files.</p>
        <div className="space-y-0 max-w-xs mb-4">
          {TAG_ORDER.filter((t) => tagTotals[t] > 0).map((tag) => (
            <InteractiveBreakdownBar
              key={tag}
              label={tag}
              count={tagTotals[tag]}
              total={totalUnsynced || 1}
              color={UNSYNCED_TAG_COLORS[tag]}
              selected={selectedTag === tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            />
          ))}
        </div>
        <div className="space-y-2">
          {TAG_ORDER.filter((t) => byTag[t].length > 0).map((tag) => (
            <div key={tag} className="rounded border border-zinc-700/50 bg-zinc-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpanded(tag)}
                className={`flex items-center justify-between w-full px-3 py-2 text-left text-sm font-medium transition-colors ${selectedTag === tag ? "bg-amber-900/30 text-amber-200" : "text-zinc-300 hover:bg-zinc-800/60"}`}
              >
                <span className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedTags.has(tag) ? "" : "-rotate-90"}`} aria-hidden />
                  {tag}
                  <span className="text-xs font-normal text-zinc-500">({byTag[tag].length} files)</span>
                </span>
              </button>
              {expandedTags.has(tag) && (
                <ul className="max-h-48 overflow-y-auto border-t border-zinc-700/50 p-2 text-xs font-mono text-zinc-500 space-y-0.5">
                  {byTag[tag].slice(0, 200).map((e, i) => (
                    <li key={i} className="truncate py-0.5" title={e.path}>
                      {e.category && <span className="text-zinc-600 mr-1.5">[{CATEGORY_LABELS[e.category] ?? e.category}]</span>}
                      {e.path}
                    </li>
                  ))}
                  {byTag[tag].length > 200 && <li className="text-zinc-600 py-1">…+{byTag[tag].length - 200} more</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function SyncBadge({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  if (lastSyncedAt) {
    const ago = Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000);
    const label = ago < 2 ? "Live" : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">
        <Zap className="h-3 w-3" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">
      Not synced
    </span>
  );
}

type TabId = "live-sync" | "backups" | "trash";

interface CloudServerPageProps {
  serverId: string;
  pathSegments?: string[];
}

export default function CloudServerPage({ serverId, pathSegments = [] }: CloudServerPageProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [server, setServer] = useState<SyncServer | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [serverFiles, setServerFiles] = useState<{ files: SyncedFile[]; total: number } | null>(null);
  const [manifestData, setManifestData] = useState<ManifestDataShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("live-sync");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [removingSynced, setRemovingSynced] = useState(false);
  const [removeSyncedConfirm, setRemoveSyncedConfirm] = useState(false);
  const [triggeringSync, setTriggeringSync] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  /** When set, the file list is filtered to this folder path (browse by folder from tree) */
  const [treeFilterPath, setTreeFilterPath] = useState<string | null>(null);
  const [highlightPath, setHighlightPath] = useState<string | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState<Set<string>>(new Set());
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [searchSnapshots, setSearchSnapshots] = useState("");
  const [searchTrash, setSearchTrash] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [updatingIteration, setUpdatingIteration] = useState<"3h" | "daily" | "weekly" | "monthly" | "manual" | null>(null);
  const [expandedOccurrence, setExpandedOccurrence] = useState<"3h" | "daily" | "weekly" | "monthly" | null>(null);
  const [customIntervalHours, setCustomIntervalHours] = useState<string>("");
  /** Optimistic interval hours so the UI updates immediately when changing hourly occurrence; cleared only when server response confirms it (so we never revert to 1). */
  const [optimisticIntervalHours, setOptimisticIntervalHours] = useState<number | null>(null);
  const optimisticIntervalHoursRef = useRef<number | null>(null);
  const [timeZone, setTimeZoneState] = useState<string>(() => (typeof window !== "undefined" ? getStoredTimeZone() : "UTC"));
  const [timeZoneSelectOpen, setTimeZoneSelectOpen] = useState(false);
  const [timeZoneFilter, setTimeZoneFilter] = useState("");

  const setTimeZone = (tz: string) => {
    setStoredTimeZone(tz);
    setTimeZoneState(tz);
    setTimeZoneSelectOpen(false);
    setTimeZoneFilter("");
  };

  const timeZones = getTimeZones();
  const filteredTimeZones = !timeZoneFilter.trim()
    ? timeZones
    : timeZones.filter((tz) => tz.toLowerCase().includes(timeZoneFilter.trim().toLowerCase()));

  const timeZoneDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!timeZoneSelectOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (timeZoneDropdownRef.current && !timeZoneDropdownRef.current.contains(e.target as Node)) {
        setTimeZoneSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [timeZoneSelectOpen]);

  const fetchData = () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const base = getApiBaseUrl();
    const api = (path: string) => (base ? `${base}${path}` : path);
    const auth = { Authorization: `Bearer ${token}` };
    setLoading(true);

    const safeJson = <T,>(r: Response, fallback: T): Promise<T> =>
      r.ok ? r.json().then((d: T) => d).catch(() => fallback) : Promise.resolve(fallback);

    Promise.allSettled([
      fetch(api("/api/sync/servers"), { headers: auth }).then((r) => safeJson<SyncServer[]>(r, [])),
      fetch(api(`/api/sync/servers/${serverId}`), { headers: auth }).then((r) => safeJson<SyncServer | null>(r, null)),
      fetch(api("/api/backups"), { headers: auth }).then((r) => safeJson<BackupItem[]>(r, [])),
      fetch(api(`/api/sync/servers/${serverId}/backups`), { headers: auth }).then((r) => safeJson<BackupItem[]>(r, [])),
      fetch(api("/api/backups/trash"), { headers: auth }).then((r) => safeJson<TrashItem[]>(r, [])),
      fetch(api(`/api/sync/servers/${serverId}/summary`), { headers: auth }).then((r) =>
        r.ok ? r.json().then((d: { syncedFiles?: ServerSummary }) => d?.syncedFiles ?? null).catch(() => null) : Promise.resolve(null)
      ),
      fetch(api(`/api/sync/servers/${serverId}/manifest?type=combined`), { headers: auth }).then((r) =>
        r.ok
          ? r.json().then((d: unknown) => {
              const arr = Array.isArray(d) ? d : [];
              const first = arr[0] as { manifestData?: unknown } | undefined;
              if (first?.manifestData && typeof first.manifestData === "object") return first.manifestData as ManifestDataShape;
              return null;
            })
          : Promise.resolve(null)
      ).catch(() => null),
    ]).then(([serversResult, serverResult, allBackupsResult, serverBackupsResult, trashResult, summaryResult, manifestResult]) => {
      const serversList = serversResult.status === "fulfilled" ? serversResult.value : [];
      const serverById = serverResult.status === "fulfilled" ? serverResult.value : null;
      const backupRaw = allBackupsResult.status === "fulfilled" ? allBackupsResult.value : [];
      const allBackupsList = Array.isArray(backupRaw) ? backupRaw : (backupRaw && typeof backupRaw === "object" && "backups" in backupRaw && Array.isArray((backupRaw as { backups: BackupItem[] }).backups) ? (backupRaw as { backups: BackupItem[] }).backups : []);
      const serverBackupsList = serverBackupsResult.status === "fulfilled" && Array.isArray(serverBackupsResult.value) ? serverBackupsResult.value : [];
      const trashList = trashResult.status === "fulfilled" ? trashResult.value : [];
      const sum = summaryResult.status === "fulfilled" ? summaryResult.value : null;
      const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
      setManifestData(manifest ?? null);

      const srv =
        (serverById && typeof serverById === "object" && serverById.id === serverId)
          ? (serverById as SyncServer)
          : (Array.isArray(serversList) ? serversList : []).find((s: SyncServer) => s.id === serverId) ?? null;
      setServer(srv);
      const expectedHours = optimisticIntervalHoursRef.current;
      const serverHours = typeof (srv as SyncServer)?.iterationIntervalHours === "number" ? (srv as SyncServer).iterationIntervalHours! : 0;
      if (expectedHours != null && serverHours === expectedHours) {
        setOptimisticIntervalHours(null);
        optimisticIntervalHoursRef.current = null;
      } else if (expectedHours === null) {
        setOptimisticIntervalHours(null);
      }
      const serverName = (srv && typeof srv === "object" && "name" in srv && srv.name) ? String(srv.name) : null;
      const serverIdStr = String(serverId);

      const belongsToServer = (b: BackupItem) => {
        if (b.serverId != null && String(b.serverId) === serverIdStr) return true;
        if (b.serverId != null) return false;
        const meta = b.metadata as { server_name?: string; snapshotManifest?: { server_name?: string } } | undefined;
        const nameInMeta = meta?.server_name ?? meta?.snapshotManifest?.server_name;
        return !!serverName && !!nameInMeta && String(nameInMeta).trim().toLowerCase() === String(serverName).trim().toLowerCase();
      };

      const fromServerEndpoint = serverBackupsList;
      const fromFilter = allBackupsList.filter(belongsToServer);
      const seen = new Set<string>();
      const merged: BackupItem[] = [];
      for (const b of fromServerEndpoint) {
        if (!seen.has(b.id)) {
          seen.add(b.id);
          merged.push(b);
        }
      }
      for (const b of fromFilter) {
        if (!seen.has(b.id)) {
          seen.add(b.id);
          merged.push(b);
        }
      }
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBackups(merged);

      const trashArr = Array.isArray(trashList) ? trashList : [];
      setTrash(trashArr.filter((t: TrashItem) => t.serverId != null && String(t.serverId) === serverIdStr));
      setSummary(sum ?? null);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [serverId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const intervalMs = 60 * 1000;
    const id = setInterval(fetchData, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [serverId]);

  const fetchFiles = () => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/files?limit=500` : `/api/sync/servers/${serverId}/files?limit=500`;
    setLoadingFiles(true);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { files?: SyncedFile[]; total?: number } | null) => {
        if (data?.files && Array.isArray(data.files)) {
          setServerFiles({ files: data.files, total: typeof data.total === "number" ? data.total : data.files.length });
        }
      })
      .finally(() => setLoadingFiles(false));
  };

  const storageSynced = summary ? summary.miniBytes + summary.bigBytes : 0;

  useEffect(() => {
    if (tab === "live-sync" && !serverFiles && server && storageSynced > 0) fetchFiles();
  }, [tab, server, storageSynced]);

  const handleTriggerSync = async () => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/trigger-sync` : `/api/sync/servers/${serverId}/trigger-sync`;
    setTriggeringSync(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message ?? "Sync requested. The app will sync when connected.");
      }
    } finally {
      setTriggeringSync(false);
    }
  };

  const handleArchiveSync = async () => {
    if (!server) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/archive` : `/api/sync/servers/${serverId}/archive`;
    setArchiving(true);
    try {
      const name = `Sync: ${server.name || "Server"} ${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { id?: string; name?: string; kind?: string; sizeBytes?: number; createdAt?: string; serverId?: string; metadata?: Record<string, unknown> };
        setServerFiles(null);
        // Clear Sync section and add new backup to Archives immediately
        setSummary((prev) => (prev ? { ...prev, miniBytes: 0, bigBytes: 0 } : null));
        if (data.id && data.name && data.createdAt) {
          setBackups((prev) => [
            {
              id: data.id!,
              name: data.name!,
              kind: data.kind ?? "mini",
              sizeBytes: data.sizeBytes ?? 0,
              createdAt: data.createdAt!,
              serverId: data.serverId ?? serverId,
              metadata: data.metadata,
            },
            ...prev,
          ]);
        }
        setServer((s) => s ? { ...s, backupCount: (s.backupCount ?? 0) + 1, lastBackupAt: new Date().toISOString() } : null);
        fetchData();
      } else {
        const text = await res.text();
        try {
          const data = text ? JSON.parse(text) : {};
          alert(data?.error || "Failed to archive sync");
        } catch {
          alert(text.slice(0, 200) || "Failed to archive sync");
        }
      }
    } finally {
      setArchiving(false);
    }
  };

  const handleRemoveSyncedData = async () => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/synced-data` : `/api/sync/servers/${serverId}/synced-data`;
    setRemovingSynced(true);
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRemoveSyncedConfirm(false);
        setServerFiles(null);
        fetchData();
      }
    } finally {
      setRemovingSynced(false);
    }
  };

  const handleUpdateIterationSchedule = async (patch: {
    every3h?: boolean;
    daily?: boolean;
    weekly?: boolean;
    dailyAt?: string;
    weeklyOn?: number;
    manualLabel?: string;
    monthly?: boolean;
    monthlyDay?: number;
    monthlyAt?: string;
    intervalHours?: number;
    saveTier?: "snapshot" | "structural" | "full";
  }) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/iteration` : `/api/sync/servers/${serverId}/iteration`;
    setUpdatingIteration(
      patch.every3h !== undefined
        ? "3h"
        : patch.daily !== undefined
          ? "daily"
          : patch.weekly !== undefined
            ? "weekly"
            : patch.monthly !== undefined
              ? "monthly"
              : patch.dailyAt !== undefined
                ? "daily"
                : patch.weeklyOn !== undefined
                  ? "weekly"
                  : patch.monthlyDay !== undefined
                    ? "monthly"
                    : patch.monthlyAt !== undefined
                      ? "monthly"
                      : patch.intervalHours !== undefined
                      ? "3h"
                      : patch.manualLabel !== undefined
                        ? "manual"
                        : null
    );
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Failed to update schedule");
        if (patch.intervalHours !== undefined) {
          setOptimisticIntervalHours(null);
          optimisticIntervalHoursRef.current = null;
        }
      }
    } catch {
      if (patch.intervalHours !== undefined) {
        setOptimisticIntervalHours(null);
        optimisticIntervalHoursRef.current = null;
      }
    } finally {
      setUpdatingIteration(null);
    }
  };

  const handleDownloadBackup = async (id: string, name: string, isSyncSnapshot?: boolean) => {
    if (isSyncSnapshot) {
      alert("This backup is an archive from Live sync; download not available.");
      return;
    }
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const downloadUrl = base ? `${base}/api/backups/${id}/download` : `/api/backups/${id}/download`;
    const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "backup.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFile = (fileId: string, filePath: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const contentUrl = base ? `${base}/api/sync/servers/${serverId}/files/${fileId}/content` : `/api/sync/servers/${serverId}/files/${fileId}/content`;
    fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = filePath.split(/[/\\]/).pop() || "file";
        a.click();
        URL.revokeObjectURL(u);
      });
  };

  const handleExport = async (format: "zip" | "snapshot") => {
    const token = getStoredToken();
    if (!token || !server) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/export?format=${format}` : `/api/sync/servers/${serverId}/export?format=${format}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Export failed");
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download =
      format === "zip"
        ? `${(server.name || "server").replace(/[/\\?*]/g, "_")}-export.zip`
        : `${(server.name || "server").replace(/[/\\?*]/g, "_")}-snapshot.ihostmc-snapshot`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleRename = async (id: string) => {
    const token = getStoredToken();
    if (!token || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}` : `/api/backups/${id}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (res.ok) {
      setBackups((prev) => prev.map((b) => (b.id === id ? { ...b, name: renameValue.trim() } : b)));
      setRenamingId(null);
    }
  };

  const handleMoveToTrash = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}` : `/api/backups/${id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDeleteConfirmId(null);
      setServerFiles(null);
      fetchData();
    }
  };

  const handleRestore = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}/restore` : `/api/backups/${id}/restore`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setServerFiles(null);
      fetchData();
    }
  };

  const handleDeletePermanent = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}?permanent=1` : `/api/backups/${id}?permanent=1`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDeleteConfirmId(null);
      setServerFiles(null);
      fetchData();
    }
  };

  /** Archives = iteration-based syncs (3h, daily, weekly, manual). For occurrence slots: 3h/daily/weekly = latest sync (archive) of that type; manual = current live sync when present, else latest manual archive. */
  const snapshotList = backups.filter((b) => b.metadata?.source === "sync_snapshot");
  const occurrenceSlots = (() => {
    const byType = new Map<string | "manual", BackupItem>();
    const sorted = [...snapshotList].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const b of sorted) {
      const type = (b.metadata?.iterationType as "3h" | "daily" | "weekly" | "monthly" | "manual") ?? "manual";
      if (!byType.has(type)) byType.set(type, b);
    }
    return OCCURRENCE_SLOT_DEFS.map((def) => {
      if (def.type === "manual") {
        if (storageSynced > 0) {
          return {
            ...def,
            backup: null,
            isCurrentLiveSync: true as const,
            currentLiveSyncSize: storageSynced,
            currentLiveSyncName: server?.name ?? "Server",
          };
        }
        return { ...def, backup: null, isCurrentLiveSync: false as const };
      }
      return {
        ...def,
        backup: byType.get(def.type) ?? null,
        isCurrentLiveSync: false as const,
      };
    });
  })();
  const searchFilteredSnapshots = !searchSnapshots.trim()
    ? snapshotList
    : snapshotList.filter(
        (b) =>
          b.name.toLowerCase().includes(searchSnapshots.trim().toLowerCase())
      );
  /** All backups (snapshot + full/structural) filtered by search for the Backups tab. */
  const searchFilteredBackups = !searchSnapshots.trim()
    ? backups
    : backups.filter((b) => b.name.toLowerCase().includes(searchSnapshots.trim().toLowerCase()));
  const snapshotIdsOnPage = searchFilteredBackups.filter((b) => b.metadata?.source === "sync_snapshot").map((b) => b.id);
  const searchFilteredTrash = !searchTrash.trim()
    ? trash
    : trash.filter(
        (t) =>
          t.name.toLowerCase().includes(searchTrash.trim().toLowerCase()) ||
          (t.serverName ?? "").toLowerCase().includes(searchTrash.trim().toLowerCase())
      );

  const handleBulkMoveSnapshotsToTrash = async () => {
    const token = getStoredToken();
    if (!token || selectedSnapshotIds.size === 0) return;
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    setBulkActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedSnapshotIds).map((id) =>
          fetch(api(`/api/backups/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        )
      );
      setSelectedSnapshotIds(new Set());
      setServerFiles(null);
      fetchData();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkRestoreTrash = async () => {
    const token = getStoredToken();
    if (!token || selectedTrashIds.size === 0) return;
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    setBulkActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedTrashIds).map((id) =>
          fetch(api(`/api/backups/${id}/restore`), { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        )
      );
      setSelectedTrashIds(new Set());
      setServerFiles(null);
      fetchData();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDeleteTrashPermanent = async () => {
    const token = getStoredToken();
    if (!token || selectedTrashIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedTrashIds.size} item(s)? This cannot be undone.`)) return;
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    setBulkActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedTrashIds).map((id) =>
          fetch(api(`/api/backups/${id}?permanent=1`), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        )
      );
      setSelectedTrashIds(new Set());
      setServerFiles(null);
      fetchData();
    } finally {
      setBulkActionLoading(false);
    }
  };

  if (loading && !server) {
    return (
      <div className="space-y-6">
        <DashboardLoadingBlock />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="space-y-6">
        <Link href={getPath("dashboardBackups", locale)} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Back to Cloud
        </Link>
        <p className="text-zinc-400">Server not found.</p>
      </div>
    );
  }

  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "live-sync", label: "Live sync", Icon: Zap },
    { id: "backups", label: "Backups", Icon: FileArchive },
    { id: "trash", label: "Trash", Icon: Trash2 },
  ];

  const meta = server.metadata ?? {};
  const version = meta.version ?? meta.minecraftVersion ?? meta.gameVersion;
  const hasMeta = (meta.mods?.length ?? 0) > 0 || (meta.plugins?.length ?? 0) > 0 || !!version;
  const latestBackup = backups.length > 0 ? backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] : null;
  const backupMeta = latestBackup?.metadata ?? {};
  const displayVersion = version ?? backupMeta.version ?? backupMeta.minecraftVersion ?? backupMeta.gameVersion;

  return (
    <div className="space-y-6">
      <Link href={getPath("dashboardBackups", locale)} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Back to Cloud
      </Link>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Server className="h-10 w-10 shrink-0 text-emerald-500" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-zinc-100 truncate" title={server.name || "Unnamed server"}>
                {server.name || "Unnamed server"}
              </h1>
              <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate" title={server.id}>
                {server.id.slice(0, 8)}…
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <SyncBadge lastSyncedAt={server.lastSyncedAt} />
                {storageSynced > 0 && (
                  <span className="text-xs text-zinc-500">{formatSize(storageSynced)} synced</span>
                )}
                {server.backupCount > 0 && (
                  <span className="text-xs text-zinc-500">{server.backupCount} archive{server.backupCount !== 1 ? "s" : ""}</span>
                )}
                {server.lastBackupAt && (
                  <span className="text-xs text-zinc-500">Last backup {new Date(server.lastBackupAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              title="Refresh server, archives, backups and trash"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={triggeringSync}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" aria-hidden />
              {triggeringSync ? "Requesting…" : "Trigger sync"}
            </button>
          </div>
        </div>

        {(hasMeta || displayVersion) && (
          <div className="mt-4 pt-4 border-t border-zinc-700/50 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {displayVersion && (
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <p className="font-medium text-zinc-400 text-xs mb-0.5">Minecraft / version</p>
                <p className="text-zinc-300 font-mono text-xs">{displayVersion}</p>
              </div>
            )}
            {(meta.mods?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <p className="font-medium text-zinc-400 text-xs flex items-center gap-1 mb-1"><Package className="h-3.5 w-3.5" /> Mods ({meta.mods!.length})</p>
                <ul className="text-zinc-500 text-xs max-h-20 overflow-y-auto space-y-0.5">
                  {meta.mods!.slice(0, 6).map((m, i) => <li key={i} className="truncate font-mono">{m}</li>)}
                  {meta.mods!.length! > 6 && <li>…+{meta.mods!.length! - 6} more</li>}
                </ul>
              </div>
            )}
            {(meta.plugins?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <p className="font-medium text-zinc-400 text-xs flex items-center gap-1 mb-1"><Package className="h-3.5 w-3.5" /> Plugins ({meta.plugins!.length})</p>
                <ul className="text-zinc-500 text-xs max-h-20 overflow-y-auto space-y-0.5">
                  {meta.plugins!.slice(0, 6).map((p, i) => <li key={i} className="truncate font-mono">{p}</li>)}
                  {meta.plugins!.length! > 6 && <li>…+{meta.plugins!.length! - 6} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timezone: choose timezone for all sync/backup times on this page */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-400">Times in</span>
          <div className="relative" ref={timeZoneDropdownRef}>
            <button
              type="button"
              onClick={() => setTimeZoneSelectOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 min-h-[44px]"
              aria-expanded={timeZoneSelectOpen}
              aria-haspopup="listbox"
            >
              <Clock className="h-4 w-4 text-zinc-500" aria-hidden />
              {timeZone}
              <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${timeZoneSelectOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {timeZoneSelectOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 max-h-[280px] w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl"
                role="listbox"
              >
                <div className="sticky top-0 border-b border-zinc-700 bg-zinc-900 p-2">
                  <input
                    type="search"
                    placeholder="Search timezones…"
                    value={timeZoneFilter}
                    onChange={(e) => setTimeZoneFilter(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500"
                  />
                </div>
                <ul className="max-h-[220px] overflow-y-auto p-1">
                  {filteredTimeZones.slice(0, 200).map((tz) => (
                    <li key={tz}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={tz === timeZone}
                        onClick={() => setTimeZone(tz)}
                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          tz === timeZone ? "bg-emerald-700/40 text-emerald-100" : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {tz}
                      </button>
                    </li>
                  ))}
                  {filteredTimeZones.length > 200 && (
                    <li className="px-3 py-2 text-xs text-zinc-500">Type to narrow down ({filteredTimeZones.length} total)</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <span className="text-xs text-zinc-500">All backup and sync times on this page use this timezone.</span>
        </div>
      </section>

      {/* Create & edit occurrences: 5 cards — interval, daily, weekly, monthly, Live. Big, clear, animated. */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-5 w-5 text-zinc-500" aria-hidden />
          <h2 className="font-semibold text-lg">Live sync by occurrence</h2>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Turn on automatic sync (interval, daily, weekly, monthly) and set <strong className="text-zinc-400">time</strong>, <strong className="text-zinc-400">day</strong>, or <strong className="text-zinc-400">day of month</strong> in one place. <strong className="text-zinc-400">Live</strong> = on demand (archive from Live sync anytime). Syncs with the app.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-zinc-500">When saving on schedule:</span>
          <div className="flex rounded-lg border border-zinc-600/60 bg-zinc-800/50 p-0.5">
            {(["snapshot", "structural", "full"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => handleUpdateIterationSchedule({ saveTier: tier })}
                disabled={updatingIteration !== null}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  (server.iterationSaveTier ?? "snapshot") === tier
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {tier === "snapshot" ? "Snapshot" : tier === "structural" ? "Structural" : "Full"}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">
            {(server.iterationSaveTier ?? "snapshot") === "snapshot" ? "Metadata only" : (server.iterationSaveTier ?? "snapshot") === "structural" ? "Config + mods + plugins" : "Everything"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3 items-start">
          {/* Hourly — compact; display uses optimistic value so changes apply immediately */}
          {(() => {
            const displayIntervalHours = optimisticIntervalHours ?? (Number(server.iterationIntervalHours) || INTERVAL_HOURS_DEFAULT);
            const applyCustomInterval = () => {
              const raw = customIntervalHours.trim();
              if (!raw) {
                setCustomIntervalHours("");
                return;
              }
              const v = Math.min(INTERVAL_HOURS_MAX, Math.max(INTERVAL_HOURS_MIN, parseInt(raw, 10) || INTERVAL_HOURS_DEFAULT));
              const current = displayIntervalHours;
              setCustomIntervalHours("");
              if (v !== current) {
                optimisticIntervalHoursRef.current = v;
                setOptimisticIntervalHours(v);
                handleUpdateIterationSchedule({ intervalHours: v });
              }
            };
            return (
          <div
            className={`rounded-xl border p-2 flex flex-col gap-1.5 min-h-0 transition-all duration-200 lg:col-span-1 ${
              server.iterationEvery3h ? "border-emerald-600/60 bg-emerald-900/30" : "border-zinc-600/60 bg-zinc-800/30 hover:border-zinc-500"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedOccurrence((e) => (e === "3h" ? null : "3h"))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedOccurrence((prev) => (prev === "3h" ? null : "3h"));
                }
              }}
              className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
              aria-expanded={expandedOccurrence === "3h"}
            >
              <span className="font-semibold text-zinc-200 text-sm">{getIntervalLabel(displayIntervalHours)}</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const next = !server.iterationEvery3h;
                    handleUpdateIterationSchedule(next ? { every3h: true, intervalHours: displayIntervalHours } : { every3h: false });
                  }}
                  disabled={updatingIteration === "3h"}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] min-w-[52px] transition-all hover:brightness-110 ${
                    server.iterationEvery3h ? "bg-emerald-600 text-white" : "bg-zinc-600 text-zinc-300 hover:bg-zinc-500"
                  }`}
                >
                  {updatingIteration === "3h" ? "…" : server.iterationEvery3h ? "On" : "Off"}
                </button>
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expandedOccurrence === "3h" ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </div>
            {expandedOccurrence === "3h" && (
              <>
                <div className="flex flex-wrap gap-1">
                  {INTERVAL_HOURS_PRESETS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setCustomIntervalHours("");
                        optimisticIntervalHoursRef.current = h;
                        setOptimisticIntervalHours(h);
                        handleUpdateIterationSchedule({ intervalHours: h });
                      }}
                      disabled={updatingIteration === "3h"}
                      className={`rounded px-1.5 py-1 text-[10px] font-medium min-h-[28px] min-w-[32px] transition-colors ${
                        displayIntervalHours === h && !customIntervalHours ? "bg-emerald-600 text-white" : "bg-zinc-600/80 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500">Custom (1–24):</span>
                  <input
                    type="number"
                    min={INTERVAL_HOURS_MIN}
                    max={INTERVAL_HOURS_MAX}
                    value={customIntervalHours}
                    onChange={(e) => setCustomIntervalHours(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    onBlur={applyCustomInterval}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder={INTERVAL_HOURS_PRESETS.includes(displayIntervalHours as (typeof INTERVAL_HOURS_PRESETS)[number]) ? "1–24" : String(displayIntervalHours)}
                    className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-1 text-xs text-zinc-200 w-14 min-h-[28px]"
                    aria-label="Custom interval hours (1–24)"
                  />
                </div>
                {server.iterationEvery3h && server.iterationLast3hAt && (
                  <p className="text-[11px] text-zinc-500">Last: {formatDateTimeInTimeZone(server.iterationLast3hAt, timeZone)}</p>
                )}
              </>
            )}
          </div>
            );
          })()}

          {/* Daily — compact */}
          <div
            className={`rounded-xl border p-2 flex flex-col gap-1.5 min-h-0 transition-all duration-200 lg:col-span-1 ${
              server.iterationDaily ? "border-emerald-600/60 bg-emerald-900/30" : "border-zinc-600/60 bg-zinc-800/30 hover:border-zinc-500"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedOccurrence((e) => (e === "daily" ? null : "daily"))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedOccurrence((prev) => (prev === "daily" ? null : "daily"));
                }
              }}
              className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
              aria-expanded={expandedOccurrence === "daily"}
            >
              <span className="font-semibold text-zinc-200 text-sm">Daily</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); handleUpdateIterationSchedule({ daily: !server.iterationDaily }); }}
                  disabled={updatingIteration === "daily"}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] min-w-[52px] transition-all hover:brightness-110 ${
                    server.iterationDaily ? "bg-emerald-600 text-white" : "bg-zinc-600 text-zinc-300 hover:bg-zinc-500"
                  }`}
                >
                  {updatingIteration === "daily" ? "…" : server.iterationDaily ? "On" : "Off"}
                </button>
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expandedOccurrence === "daily" ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </div>
            {expandedOccurrence === "daily" && (
              <>
                <p className="text-[10px] text-zinc-500">Off-peak (low server load):</p>
                <div className="flex flex-wrap gap-1">
                  {DAILY_OFF_PEAK_TIMES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleUpdateIterationSchedule({ dailyAt: t })}
                      className={`rounded px-1.5 py-1 text-[10px] font-medium min-h-[26px] transition-colors ${
                        (server.iterationDailyAt ?? "02:00") === t ? "bg-emerald-600 text-white" : "bg-zinc-600/80 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {t.slice(0, 5)}
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-500">Or custom time</span>
                  <input
                    key={`daily-${server.iterationDailyAt ?? "02:00"}`}
                    type="time"
                    defaultValue={server.iterationDailyAt ?? "02:00"}
                    className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-1 text-xs text-zinc-200 min-h-[32px]"
                    onChange={(e) => handleUpdateIterationSchedule({ dailyAt: e.target.value || "02:00" })}
                  />
                </label>
                {server.iterationDaily && server.iterationLastDailyAt && (
                  <p className="text-[11px] text-zinc-500">Last: {formatDateTimeInTimeZone(server.iterationLastDailyAt, timeZone)}</p>
                )}
              </>
            )}
          </div>

          {/* Weekly — compact */}
          <div
            className={`rounded-xl border p-2 flex flex-col gap-1.5 min-h-0 transition-all duration-200 lg:col-span-1 ${
              server.iterationWeekly ? "border-emerald-600/60 bg-emerald-900/30" : "border-zinc-600/60 bg-zinc-800/30 hover:border-zinc-500"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedOccurrence((e) => (e === "weekly" ? null : "weekly"))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedOccurrence((prev) => (prev === "weekly" ? null : "weekly"));
                }
              }}
              className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
              aria-expanded={expandedOccurrence === "weekly"}
            >
              <span className="font-semibold text-zinc-200 text-sm">Weekly</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const next = !server.iterationWeekly;
                    handleUpdateIterationSchedule(next ? { weekly: true, weeklyOn: server.iterationWeeklyOn ?? 0 } : { weekly: false });
                  }}
                  disabled={updatingIteration === "weekly"}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] min-w-[52px] transition-all hover:brightness-110 ${
                    server.iterationWeekly ? "bg-emerald-600 text-white" : "bg-zinc-600 text-zinc-300 hover:bg-zinc-500"
                  }`}
                >
                  {updatingIteration === "weekly" ? "…" : server.iterationWeekly ? "On" : "Off"}
                </button>
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expandedOccurrence === "weekly" ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </div>
            {expandedOccurrence === "weekly" && (
              <>
                <p className="text-[10px] text-zinc-500">{!server.iterationWeekly && "Turn Weekly on above to run. "}Pick day of week:</p>
                <div className="flex flex-wrap gap-1">
                  {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleUpdateIterationSchedule({ weeklyOn: i })}
                      disabled={updatingIteration === "weekly"}
                      className={`rounded px-1.5 py-0.5 min-h-[26px] text-[10px] font-medium transition-colors ${
                        (server.iterationWeeklyOn ?? 0) === i ? "bg-emerald-600 text-white" : "bg-zinc-600/80 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                {server.iterationWeekly && server.iterationLastWeeklyAt && (
                  <p className="text-[11px] text-zinc-500">Last: {formatDateTimeInTimeZone(server.iterationLastWeeklyAt, timeZone)}</p>
                )}
              </>
            )}
          </div>

          {/* Monthly — accordion + off-peak day suggestions */}
          <div
            className={`rounded-xl border p-3 flex flex-col gap-2 min-h-0 transition-all duration-200 ${
              server.iterationMonthly ? "border-emerald-600/60 bg-emerald-900/30" : "border-zinc-600/60 bg-zinc-800/30 hover:border-zinc-500"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedOccurrence((e) => (e === "monthly" ? null : "monthly"))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedOccurrence((prev) => (prev === "monthly" ? null : "monthly"));
                }
              }}
              className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
              aria-expanded={expandedOccurrence === "monthly"}
            >
              <span className="font-semibold text-zinc-200 text-sm">Monthly</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const next = !server.iterationMonthly;
                    handleUpdateIterationSchedule(next ? { monthly: true, monthlyDay: server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT } : { monthly: false });
                  }}
                  disabled={updatingIteration === "monthly"}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] min-w-[52px] transition-all hover:brightness-110 ${
                    server.iterationMonthly ? "bg-emerald-600 text-white" : "bg-zinc-600 text-zinc-300 hover:bg-zinc-500"
                  }`}
                >
                  {updatingIteration === "monthly" ? "…" : server.iterationMonthly ? "On" : "Off"}
                </button>
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expandedOccurrence === "monthly" ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </div>
            {expandedOccurrence === "monthly" && (
              <>
                <p className="text-[10px] text-zinc-500">Day of month (1–31){!server.iterationMonthly && " — turn Monthly on above to run"}:</p>
                <div className="flex flex-wrap gap-1">
                  {MONTHLY_DAY_PRESETS.map(({ day, label }) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleUpdateIterationSchedule({ monthlyDay: day })}
                      disabled={updatingIteration === "monthly"}
                      className={`rounded px-1.5 py-1 text-[10px] font-medium min-h-[26px] min-w-[28px] transition-colors ${
                        (server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT) === day ? "bg-emerald-600 text-white" : "bg-zinc-600/80 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3 gap-y-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-zinc-500">Or pick a day (1–31)</span>
                    <input
                      type="number"
                      min={MONTHLY_DAY_MIN}
                      max={MONTHLY_DAY_MAX}
                      key={`monthly-${server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT}`}
                      defaultValue={server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT}
                      className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-1 text-xs text-zinc-200 w-20 min-h-[32px]"
                      onBlur={(e) => {
                        const v = Math.min(MONTHLY_DAY_MAX, Math.max(MONTHLY_DAY_MIN, parseInt(e.target.value, 10) || MONTHLY_DAY_DEFAULT));
                        if (v !== (server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT)) handleUpdateIterationSchedule({ monthlyDay: v });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-zinc-500">At time (e.g. 02:00)</span>
                    <input
                      key={`monthly-at-${server.iterationMonthlyAt ?? "02:00"}`}
                      type="time"
                      defaultValue={server.iterationMonthlyAt ?? "02:00"}
                      className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-1 text-xs text-zinc-200 min-h-[32px]"
                      onChange={(e) => handleUpdateIterationSchedule({ monthlyAt: e.target.value || "02:00" })}
                    />
                  </label>
                </div>
                <p className="text-[10px] text-zinc-500 italic">
                  e.g. run on the {(() => {
                    const d = server.iterationMonthlyDay ?? MONTHLY_DAY_DEFAULT;
                    const ord = d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
                    return `${d}${ord}`;
                  })()} at {server.iterationMonthlyAt ?? "02:00"}
                </p>
                {server.iterationMonthly && server.iterationLastMonthlyAt && (
                  <p className="text-[11px] text-zinc-500">Last: {formatDateTimeInTimeZone(server.iterationLastMonthlyAt, timeZone)}</p>
                )}
              </>
            )}
          </div>

          {/* Live — on demand only */}
          <div className="rounded-xl border border-zinc-600/60 bg-zinc-800/30 p-3 flex flex-col gap-2 min-h-0 transition-all duration-200 hover:scale-[1.01] hover:shadow hover:border-zinc-500">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-zinc-200 text-sm">Live</span>
              <span className="shrink-0 rounded-lg bg-zinc-600/80 px-2 py-1 text-[10px] font-medium text-zinc-400">On demand</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live syncs by occurrence: 5 slots. 3h/daily/weekly/monthly = latest sync of that type (from app). Manual = current live sync when present, else no sync yet. */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-semibold text-lg">Live syncs by occurrence</h2>
          <span className="text-xs text-zinc-500">{MAX_OCCURRENCE_CARDS} slots</span>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Latest <strong className="text-zinc-400">live sync</strong> per occurrence. Interval, daily, weekly, monthly = automatic from the app (when on above). Manual = current Live sync when you have synced data—archive it to store a snapshot, then the slot shows live again after the next sync. These are syncs, not past archives.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
          {occurrenceSlots.map((slot) => {
            const Icon = slot.icon;
            const isCurrentLive = "isCurrentLiveSync" in slot && slot.isCurrentLiveSync;
            const hasContent = isCurrentLive || !!slot.backup;
            const isGhost = !hasContent;
            const detailHref = slot.backup ? getBackupDetailPath(slot.backup.id, locale) : null;
            return (
              <div
                key={slot.type}
                className={`rounded-xl border p-4 flex flex-col gap-3 min-h-[140px] w-full min-w-0 ${
                  isGhost ? "border-dashed border-zinc-700/60 bg-zinc-900/30" : "border-emerald-800/40 bg-emerald-900/10"
                }`}
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
                      isGhost ? "bg-zinc-800/80 text-zinc-500" : "bg-emerald-800/50 text-emerald-200"
                    }`}
                    title={slot.label}
                  >
                    <Icon className="h-3 w-3 shrink-0" aria-hidden />
                    {slot.label}
                  </span>
                </div>
                {isCurrentLive && "currentLiveSyncName" in slot && "currentLiveSyncSize" in slot ? (
                  <>
                    <h3 className="font-semibold text-zinc-100 text-sm leading-tight line-clamp-2 break-words mt-1">
                      Live
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{slot.currentLiveSyncName}</p>
                    <p className="text-xs text-zinc-500">{formatSize(slot.currentLiveSyncSize)}</p>
                    <button
                      type="button"
                      onClick={() => setTab("live-sync")}
                      className="mt-auto inline-flex items-center gap-1 rounded bg-emerald-700/50 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-600/50 w-fit"
                    >
                      <Zap className="h-3 w-3" aria-hidden /> View in Live sync
                    </button>
                  </>
                ) : slot.backup ? (
                  <>
                    <h3 className="font-semibold text-zinc-100 text-sm leading-tight line-clamp-2 break-words mt-1" title={slot.backup.name}>
                      {slot.backup.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {formatDateTimeInTimeZone(slot.backup.createdAt, timeZone)}
                    </p>
                    <p className="text-xs text-zinc-500">{formatSize(slot.backup.sizeBytes)}</p>
                    <Link
                      href={detailHref!}
                      className="mt-auto inline-flex items-center gap-1 rounded bg-emerald-700/50 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-600/50 w-fit"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden /> View details
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500 mt-1">No sync yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "live-sync" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-lg mb-2">Live sync</h2>
            <p className="text-sm text-zinc-500 mb-4">
              When you sync from the iHost app, your data appears here in <strong>Live sync</strong>. This is the current file log, mods, and libraries. Archive this sync to create a save (tagged <strong>Live</strong> in Backups); this view then clears until the next sync from the app.
            </p>
            {storageSynced > 0 ? (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4 space-y-4">
                <p className="text-sm text-zinc-300">
                  {formatSize(storageSynced)} synced
                  {summary && (summary.mini > 0 || summary.big > 0) && ` (${summary.mini} mini, ${summary.big} big)`}
                  {server.lastSyncedAt && ` · Last synced ${formatDateTimeInTimeZone(server.lastSyncedAt, timeZone)}`}
                </p>
                {summary && (summary.mini > 0 || summary.big > 0) && (
                  <div className="rounded border border-zinc-700/40 bg-zinc-900/40 p-2">
                    <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Synced by tier</h4>
                    <div className="space-y-0 max-w-xs">
                      {summary.mini > 0 && <BreakdownBar label="mini" count={summary.mini} total={summary.mini + summary.big} color="rgba(52, 211, 153, 0.4)" />}
                      {summary.big > 0 && <BreakdownBar label="big" count={summary.big} total={summary.mini + summary.big} color="rgba(251, 191, 36, 0.4)" />}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleArchiveSync}
                    disabled={archiving}
                    className="inline-flex items-center gap-1.5 rounded border border-emerald-700/50 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
                    title="Create an archive and clear current sync; sync again from the app to repopulate"
                  >
                    <FileArchive className="h-4 w-4" /> {archiving ? "…" : "Archive this sync"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("zip")}
                    className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                    title="Download full copy as ZIP (includes ihostmc-import.json for re-import)"
                  >
                    <Download className="h-4 w-4" /> Export ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("snapshot")}
                    className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                    title="Download snapshot as single .ihostmc-snapshot file"
                  >
                    <FileText className="h-4 w-4" /> Export snapshot
                  </button>
                  {removeSyncedConfirm ? (
                    <>
                      <span className="text-amber-300 text-sm">Remove all from cloud?</span>
                      <button type="button" onClick={handleRemoveSyncedData} disabled={removingSynced} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-50">
                        {removingSynced ? "…" : "Yes, remove"}
                      </button>
                      <button type="button" onClick={() => setRemoveSyncedConfirm(false)} className="rounded bg-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-500">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setRemoveSyncedConfirm(true)} className="inline-flex items-center gap-1.5 rounded border border-red-900/50 bg-red-900/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/40">
                      <Trash2 className="h-4 w-4" /> Remove from cloud
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">No synced data yet. Sync from the app or trigger sync when connected.</p>
            )}
          </div>

          {storageSynced > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-700/50 pt-4">
                <h3 className="font-medium text-zinc-300">Synced files (file log)</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type="search"
                      placeholder="Search paths…"
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      className="rounded border border-zinc-600 bg-zinc-800 pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 w-48 min-w-0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setServerFiles(null); fetchFiles(); }}
                    disabled={loadingFiles}
                    className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {loadingFiles ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </div>
              {loadingFiles && !serverFiles ? (
            <p className="text-zinc-500 text-sm">Loading file list…</p>
          ) : serverFiles ? (
            (() => {
              const q = fileSearchQuery.trim().toLowerCase();
              const byPath = treeFilterPath
                ? serverFiles.files.filter(
                    (f) => f.filePath === treeFilterPath || f.filePath.startsWith(treeFilterPath + "/")
                  )
                : serverFiles.files;
              const filtered = q
                ? byPath.filter((f) => f.filePath.toLowerCase().includes(q))
                : byPath;
              const treeFiles = treeFilterPath
                ? (q ? serverFiles.files.filter((f) => f.filePath.toLowerCase().includes(q)) : serverFiles.files)
                : (q ? serverFiles.files.filter((f) => f.filePath.toLowerCase().includes(q)) : serverFiles.files);
              const tree = buildTreeFromSyncedFiles(treeFiles);
              return (
                <div className="flex gap-4 min-h-[280px] max-h-[55vh] overflow-hidden">
                  <div className="flex flex-col w-72 shrink-0 rounded border border-zinc-700/50 bg-zinc-900/50 overflow-hidden min-h-0">
                    <p className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700/50 bg-zinc-900/95 shrink-0">
                      Folder structure
                    </p>
                    <div className="flex-1 min-h-0 overflow-y-auto p-1">
                      {tree.map((node) => (
                        <FileTreeRow
                          key={node.path}
                          node={node}
                          depth={0}
                          onDownload={handleDownloadFile}
                          onSelectFolder={setTreeFilterPath}
                          onHighlight={setHighlightPath}
                          selectedPath={highlightPath}
                          filterPath={treeFilterPath}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded border border-zinc-700/50 bg-zinc-900/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-zinc-700/50 bg-zinc-900/95 shrink-0 z-10">
                      <span className="text-zinc-400">
                        {treeFilterPath
                          ? `Files in ${treeFilterPath}`
                          : `${serverFiles.total} file${serverFiles.total !== 1 ? "s" : ""}`}
                        {filtered.length !== (treeFilterPath ? byPath.length : serverFiles.total) &&
                          ` · ${filtered.length} shown`}
                      </span>
                      {treeFilterPath && (
                        <button
                          type="button"
                          onClick={() => setTreeFilterPath(null)}
                          className="rounded bg-zinc-700/50 px-2 py-0.5 text-zinc-300 hover:bg-zinc-600"
                        >
                          Show all
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                      <table className="w-full border-collapse text-sm font-mono">
                        <thead>
                          <tr className="border-b border-zinc-700/50 bg-zinc-900/95 sticky top-0 bg-zinc-900 z-[1]">
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 w-14 shrink-0">
                              Tier
                            </th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 w-20 shrink-0">
                              Size
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 min-w-0">
                              Path
                            </th>
                            <th className="w-10 shrink-0 sticky right-0 bg-zinc-900/80 backdrop-blur-sm border-l border-zinc-700/50" />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((f) => (
                            <tr
                              key={f.id}
                              className={`group border-b border-zinc-700/30 hover:bg-zinc-800/30 ${
                                highlightPath === f.filePath ? "bg-zinc-700/50" : ""
                              }`}
                            >
                              <td className="px-3 py-1.5 shrink-0">
                                <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                  {f.storageTier}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-zinc-500 text-xs text-right whitespace-nowrap shrink-0">
                                {formatSize(f.sizeBytes)}
                              </td>
                              <td className="px-3 py-1.5 text-zinc-300 whitespace-nowrap" title={f.filePath}>
                                {f.filePath}
                              </td>
                              <td className="sticky right-0 bg-zinc-900/80 backdrop-blur-sm group-hover:bg-zinc-800/90 border-l border-zinc-700/30 px-1 py-1">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadFile(f.id, f.filePath)}
                                  className="p-1.5 rounded text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-zinc-700/50 transition-opacity"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()
              ) : (
                <p className="text-zinc-500 text-sm">No synced files or click Refresh to load.</p>
              )}
              {manifestData && serverFiles && (() => {
                const withTags = flattenManifestPathsWithTags(manifestData);
                const manifestFiles = onlyFilePaths(withTags);
                const syncedPaths = new Set(serverFiles.files.map((f) => f.filePath));
                const notSynced = manifestFiles
                  .filter((e) => !syncedPaths.has(e.path))
                  .sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "") || a.path.localeCompare(b.path));
                return (
                  <SyncedVsUnsyncedView
                    syncedMini={summary?.mini ?? 0}
                    syncedBig={summary?.big ?? 0}
                    notSynced={notSynced}
                  />
                );
              })()}
            </>
          )}
        </section>
      )}

      {tab === "backups" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-lg">Backups</h2>
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              title="Refresh backups"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            All backups for this server. Tags: occurrence (Live, Hourly / Every X hours, Daily, Weekly, Monthly) and tier (Snapshot, Mini, Full). Select snapshot backups for bulk move to trash.
          </p>
          {backups.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={searchSnapshots}
                    onChange={(e) => setSearchSnapshots(e.target.value)}
                    placeholder="Search backups by name…"
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800/80 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                    aria-label="Search backups"
                  />
                </div>
                {snapshotIdsOnPage.length > 0 && (
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={snapshotIdsOnPage.length > 0 && snapshotIdsOnPage.every((id) => selectedSnapshotIds.has(id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSnapshotIds(new Set(snapshotIdsOnPage));
                        } else {
                          setSelectedSnapshotIds(new Set());
                        }
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                    />
                    Select all snapshots on page
                  </label>
                )}
              </div>
              {selectedSnapshotIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-800/60 bg-amber-900/30 px-4 py-3 mb-4">
                  <span className="font-medium text-amber-200">{selectedSnapshotIds.size} selected</span>
                  <button
                    type="button"
                    onClick={handleBulkMoveSnapshotsToTrash}
                    disabled={bulkActionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-700/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {bulkActionLoading ? "Moving…" : "Move to trash"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSnapshotIds(new Set())}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-700/80 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Clear selection
                  </button>
                </div>
              )}
            </>
          )}
          {backups.length === 0 ? (
            <p className="text-zinc-500 text-sm">No backups yet. Use &quot;Archive this sync&quot; on the Live sync tab or upload a backup from the app.</p>
          ) : searchFilteredBackups.length === 0 ? (
            <p className="text-zinc-500 text-sm">No backups match your search.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {searchFilteredBackups
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((b) => {
                  const meta = b.metadata ?? {};
                  const isSnapshot = meta.source === "sync_snapshot";
                  const iterType = meta.iterationType ?? null;
                  const iterSlot = meta.iterationSlot;
                  const occurrenceLabel = isSnapshot
                    ? getOccurrenceLabel(iterType, server?.iterationIntervalHours ?? undefined)
                    : "Backup";
                  const tierLabel = getTierLabel(getBackupTier(b));
                  const isRenaming = renamingId === b.id;
                  const isDeleteConfirm = deleteConfirmId === b.id;
                  const detailHref = getBackupDetailPath(b.id, locale);
                  const snapChecked = selectedSnapshotIds.has(b.id);
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 flex flex-col gap-3 min-h-[120px] w-full min-w-0"
                    >
                      <div className="flex items-start justify-between gap-2 shrink-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-300" title={occurrenceLabel}>
                            {occurrenceLabel}
                          </span>
                          <span className="text-zinc-500 text-[10px]">·</span>
                          <span className="rounded-md bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                            {tierLabel}
                          </span>
                        </span>
                        {isSnapshot && (
                          <input
                            type="checkbox"
                            checked={snapChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedSnapshotIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(b.id)) next.delete(b.id);
                                else next.add(b.id);
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                            aria-label={`Select ${b.name}`}
                          />
                        )}
                      </div>
                      {isRenaming ? (
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm font-mono text-white min-w-[120px]"
                            placeholder="Name"
                            autoFocus
                          />
                          <button type="button" onClick={() => handleRename(b.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Save</button>
                          <button type="button" onClick={() => { setRenamingId(null); setRenameValue(""); }} className="rounded bg-zinc-600 px-2 py-1 text-xs text-zinc-200">Cancel</button>
                        </div>
                      ) : (
                        <Link href={detailHref} className="font-semibold text-zinc-100 text-sm leading-tight line-clamp-2 break-words hover:text-white hover:underline min-w-0" title={b.name}>
                          {b.name}
                        </Link>
                      )}
                      <p className="text-xs text-zinc-500 mt-0.5 shrink-0">
                        {formatDateTimeInTimeZone(b.createdAt, timeZone)} · {formatSize(b.sizeBytes)}
                        {iterSlot && <span className="ml-1">· {iterSlot}</span>}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-auto pt-2 border-t border-zinc-700/50">
                        {!isRenaming && (
                          <Link href={detailHref} className="inline-flex items-center gap-1 rounded bg-zinc-600/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
                            <ExternalLink className="h-3 w-3" /> View
                          </Link>
                        )}
                        {!isRenaming && (
                          <button type="button" onClick={() => { setRenamingId(b.id); setRenameValue(b.name); }} className="rounded border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
                            <Pencil className="h-3 w-3 inline mr-1" /> Rename
                          </button>
                        )}
                        <button type="button" onClick={() => handleDownloadBackup(b.id, b.name, isSnapshot)} className="rounded border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
                          <Download className="h-3 w-3 inline mr-1" /> Download
                        </button>
                        {isDeleteConfirm ? (
                          <>
                            <span className="text-amber-300 text-xs">To trash?</span>
                            <button type="button" onClick={() => handleMoveToTrash(b.id)} className="rounded bg-amber-600 px-2 py-1 text-xs text-white">Yes</button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded bg-zinc-600 px-2 py-1 text-xs text-zinc-200">Cancel</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setDeleteConfirmId(b.id)} className="rounded border border-amber-800/50 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/40">
                            <Trash2 className="h-3 w-3 inline mr-1" /> Trash
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      )}

      {tab === "trash" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-lg">Trash</h2>
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              title="Refresh trash"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            Items stay here for 30 days, then are removed. Select items to restore or delete permanently.
          </p>
          {trash.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={searchTrash}
                    onChange={(e) => setSearchTrash(e.target.value)}
                    placeholder="Search by name…"
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800/80 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                    aria-label="Search trash"
                  />
                </div>
                {searchFilteredTrash.length > 0 && (
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={searchFilteredTrash.length > 0 && searchFilteredTrash.every((t) => selectedTrashIds.has(t.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTrashIds(new Set(searchFilteredTrash.map((t) => t.id)));
                        } else {
                          setSelectedTrashIds(new Set());
                        }
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                    />
                    Select all on page
                  </label>
                )}
              </div>
              {selectedTrashIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-800/60 bg-amber-900/30 px-4 py-3 mb-4">
                  <span className="font-medium text-amber-200">{selectedTrashIds.size} selected</span>
                  <button
                    type="button"
                    onClick={handleBulkRestoreTrash}
                    disabled={bulkActionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-900/50 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50"
                  >
                    {bulkActionLoading ? "Restoring…" : "Restore selected"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteTrashPermanent}
                    disabled={bulkActionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-red-900/30 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900/50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete permanently
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTrashIds(new Set())}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-700/80 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Clear selection
                  </button>
                </div>
              )}
            </>
          )}
          {trash.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items in trash for this server.</p>
          ) : searchFilteredTrash.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items match your search.</p>
          ) : (
            <ul className="space-y-2">
              {searchFilteredTrash.map((t) => {
                const trashChecked = selectedTrashIds.has(t.id);
                return (
                  <li key={t.id} className="rounded-lg border border-amber-800/50 bg-amber-900/10 px-4 py-3 flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      checked={trashChecked}
                      onChange={() => {
                        setSelectedTrashIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        });
                      }}
                      className="shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                      aria-label={`Select ${t.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm text-zinc-300 truncate block">{t.name}</span>
                      <span className="text-xs text-zinc-500">
                        Deleted {t.deletedAt && formatDateTimeInTimeZone(t.deletedAt, timeZone)}
                        {t.purgeAt && ` · Purge ${new Date(t.purgeAt).toLocaleDateString()}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleRestore(t.id)} className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/50">
                        Restore
                      </button>
                      <button type="button" onClick={() => handleDeletePermanent(t.id)} className="rounded-lg border border-red-900/50 bg-red-900/20 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40">
                        Delete permanently
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
