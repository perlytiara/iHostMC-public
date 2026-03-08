"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import type { PathnameKey } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredToken, clearStoredAuth } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import { SafeIcon } from "@/components/SafeIcon";
import { TIER_STORAGE } from "@/lib/storage-tiers";
import {
  FileArchive,
  Settings,
  Download,
  Trash2,
  Server,
  Shield,
  Zap,
  Package,
  FileCheck,
  FileX,
  HardDrive,
  ChevronDown,
  ChevronRight,
  Filter,
  HelpCircle,
  Pencil,
  Clock,
  FolderOpen,
  FileText,
  RefreshCw,
  Search,
  X,
  Upload,
  Cloud,
} from "lucide-react";
import { DOMAINS } from "@/lib/domains";
import { getCloudServerDetailPath, getBackupDetailPath } from "@/i18n/pathnames";
import type { SyncServer, TrashItem } from "@/lib/cloud";
import { cn } from "@/lib/utils";
import { getBackupTier, getTierLabel, getTierDescription, getIntervalLabel, getCustomBackupTags } from "@/lib/cloud";
import { getStoredTimeZone, formatDateTimeInTimeZone, formatDateInTimeZone } from "@/lib/timezone";

interface BackupMetadata {
  mods?: string[];
  plugins?: string[];
  filesOnBackup?: number;
  filesMissing?: number;
  filesTooBig?: number;
  fileList?: string[];
  bigFileList?: string[];
  version?: string;
  minecraftVersion?: string;
  gameVersion?: string;
  source?: "sync_snapshot";
  saveTier?: "snapshot" | "structural" | "full" | "world";
  scope?: "world";
  includePaths?: string[];
}

interface BackupItem {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  createdAt: string;
  serverId?: string;
  serverName?: string;
  metadata?: BackupMetadata;
}

interface BackupReport {
  totalSizeBytes: number;
  miniBytes: number;
  bigBytes: number;
  totalCount: number;
  byKind: { mini: number; full: number };
  filesTooBigCount: number;
  storageLimitBytes: number | null;
  tierId?: string;
  storageLimitGb?: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function SyncBadge({ lastSyncedAt, miniSynced }: { lastSyncedAt: string | null; miniSynced: boolean }) {
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

interface BackupsPageProps {
  pathSegments?: string[];
  pathnameKey?: PathnameKey;
}

export default function BackupsPage({ pathSegments = [], pathnameKey }: BackupsPageProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [list, setList] = useState<BackupItem[]>([]);
  const [servers, setServers] = useState<SyncServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientReady, setClientReady] = useState(false);
  const [subStatus, setSubStatus] = useState<{ tier?: { id: string; name: string } } | null>(null);
  const [tierLoaded, setTierLoaded] = useState(false);
  const [limits, setLimits] = useState<{ count: number; maxBackups: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [removeSyncedConfirmServerId, setRemoveSyncedConfirmServerId] = useState<string | null>(null);
  const [removingSyncedServerId, setRemovingSyncedServerId] = useState<string | null>(null);
  const [report, setReport] = useState<BackupReport | null>(null);
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [timeZone] = useState(() => (typeof window !== "undefined" ? getStoredTimeZone() : "UTC"));
  type BackupFilter = "all" | "snapshot" | "mini" | "full" | "tooBig";
  const [backupFilter, setBackupFilter] = useState<BackupFilter>("all");
  type ServerSummary = { mini: number; big: number; miniBytes: number; bigBytes: number };
  const [serverSummaries, setServerSummaries] = useState<Record<string, ServerSummary>>({});
  const RECENT_ARCHIVES_PER_SERVER = 10;
  type SyncedFile = { id: string; filePath: string; sizeBytes: number; storageTier: string; syncedAt: string | null };
  const [serverFiles, setServerFiles] = useState<Record<string, { files: SyncedFile[]; total: number }>>({});
  const [loadingFilesServerId, setLoadingFilesServerId] = useState<string | null>(null);
  const [showFilesServerId, setShowFilesServerId] = useState<string | null>(null);
  const [archivingServerId, setArchivingServerId] = useState<string | null>(null);
  type CloudTab = "overview" | "servers" | "snapshots-archives" | "trash";
  const [cloudTab, setCloudTab] = useState<CloudTab>("servers");
  const [trashList, setTrashList] = useState<TrashItem[]>([]);
  const [trashedServers, setTrashedServers] = useState<SyncServer[]>([]);
  const [purgingTrash, setPurgingTrash] = useState(false);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  /** Collapsed server IDs in Archives & backups (by-server grouping). Empty = all expanded. */
  const [collapsedServerIds, setCollapsedServerIds] = useState<Set<string>>(new Set());
  /** Bulk selection and search */
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<string>>(new Set());
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [searchSnapshots, setSearchSnapshots] = useState("");
  const [searchTrash, setSearchTrash] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const [importingSnapshot, setImportingSnapshot] = useState(false);

  useEffect(() => {
    if (pathSegments.length === 4 && pathSegments[3]) {
      setExpandedBackupId(pathSegments[3]);
    }
  }, [pathSegments]);

  const toggleServerExpanded = (key: string) => {
    setCollapsedServerIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasBackupTier =
    subStatus?.tier?.id === "backup" || subStatus?.tier?.id === "pro";

  const fetchAll = () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const base = getApiBaseUrl();
    const api = (path: string) => (base ? `${base}${path}` : path);
    setLoading(true);
    const auth = { Authorization: `Bearer ${token}` };
    const safeJson = <T,>(r: Response, fallback: T): Promise<T> =>
      r.ok ? r.json().then((d: T) => d).catch(() => fallback) : Promise.resolve(fallback);
    const safeTextJson = (r: Response): Promise<BackupItem[]> => {
      if (r.status === 401 || r.status === 403) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return Promise.resolve([]);
      }
      return r.text().then((t) => { try { const v = t ? JSON.parse(t) : []; return Array.isArray(v) ? v : []; } catch { return []; } }).catch(() => []);
    };
    Promise.all([
      fetch(api("/api/backups"), { headers: auth }).then(safeTextJson).catch(() => []),
      fetch(api("/api/backups/limits"), { headers: auth })
        .then((r) => (r.ok ? r.json().then((d: { count?: number; maxBackups?: number }) => ({ count: d?.count ?? 0, maxBackups: d?.maxBackups ?? 3 })) : null))
        .catch(() => null),
      fetch(api("/api/backups/report"), { headers: auth }).then((r) => safeJson<BackupReport | null>(r, null)).catch(() => null),
      fetch(api("/api/sync/servers"), { headers: auth })
        .then((r) => { if (r.status === 401 || r.status === 403) return []; return r.json().then((d: SyncServer[]) => (Array.isArray(d) ? d : [])).catch(() => []); })
        .catch(() => []),
      fetch(api("/api/backups/trash"), { headers: auth }).then((r) => (r.ok ? r.json().then((d: TrashItem[]) => (Array.isArray(d) ? d : [])) : [])).catch(() => []),
      fetch(api("/api/sync/servers?trashed=1"), { headers: auth })
        .then((r) => { if (r.status === 401 || r.status === 403) return []; return r.json().then((d: SyncServer[]) => (Array.isArray(d) ? d : [])).catch(() => []); })
        .catch(() => []),
    ])
      .then(([backupList, lim, reportData, serverList, trashData, trashedServerList]) => {
        setList(Array.isArray(backupList) ? backupList : []);
        setLimits(lim ?? null);
        setReport(reportData ?? null);
        const srvList = Array.isArray(serverList) ? serverList : [];
        setServers(srvList);
        setTrashList(Array.isArray(trashData) ? trashData : []);
        setTrashedServers(Array.isArray(trashedServerList) ? trashedServerList : []);
        if (srvList.length > 0 && token) {
          const authH = { Authorization: `Bearer ${token}` };
          Promise.all(
            srvList.map((s: SyncServer) =>
              fetch(api(`/api/sync/servers/${s.id}/summary`), { headers: authH })
                .then((r) => (r.ok ? r.json() : null))
                .then((data: { syncedFiles?: ServerSummary } | null) =>
                  data?.syncedFiles ? { id: s.id, summary: data.syncedFiles } : null
                )
                .catch(() => null)
            )
          ).then((results) => {
            const next: Record<string, ServerSummary> = {};
            for (const r of results) {
              if (r?.id && r?.summary) next[r.id] = r.summary;
            }
            setServerSummaries(next);
          });
        } else {
          setServerSummaries({});
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setTierLoaded(true);
      return;
    }
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/subscription/status` : "/api/subscription/status";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((data) => {
        setSubStatus(data ?? null);
        setTierLoaded(true);
      })
      .catch(() => setTierLoaded(true));
  }, [locale]);

  useEffect(() => {
    setClientReady(false);
    const t = setTimeout(() => setClientReady(true), 0);
    return () => clearTimeout(t);
  }, [locale]);

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);
    fetchAll();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [locale, clientReady]);

  const handleRename = async (id: string) => {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    if (!token || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await fetch(api(`/api/backups/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        setList((prev) => prev.map((b) => (b.id === id ? { ...b, name: renameValue.trim() } : b)));
        setRenamingId(null);
        setRenameValue("");
      }
    } finally {
      setRenamingId(null);
    }
  };

  const handleMoveToTrash = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}` : `/api/backups/${id}`;
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setDeleteConfirmId(null);
      fetchAll();
    }
  };

  const handleRemoveSyncServer = async (serverId: string) => {
    if (!confirm("Move this server to trash? Its backups will move to trash too. You can restore from the Trash tab within 30 days, or permanently delete there.")) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    setRemovingSyncedServerId(serverId);
    try {
      const res = await fetch(api(`/api/sync/servers/${serverId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trashed: true }),
      });
      if (res.ok) {
        setServers((prev) => prev.filter((s) => s.id !== serverId));
        fetchAll();
      }
    } finally {
      setRemovingSyncedServerId(null);
    }
  };

  const handleRestoreTrashedServer = async (serverId: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}` : `/api/sync/servers/${serverId}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restoreFromTrash: true }),
    });
    if (res.ok) fetchAll();
  };

  const handlePermanentDeleteServer = async (serverId: string, serverName: string, backupCountInTrash: number) => {
    const message = backupCountInTrash > 0
      ? `Permanently delete the server "${serverName}" and all ${backupCountInTrash} backup(s) in trash? This cannot be undone.`
      : `Permanently delete the server "${serverName}"? This cannot be undone.`;
    if (!confirm(message)) return;
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}` : `/api/sync/servers/${serverId}`;
    setDeletingServerId(serverId);
    try {
      const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchAll();
    } finally {
      setDeletingServerId(null);
    }
  };

  const handleRestoreFromTrash = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}/restore` : `/api/backups/${id}/restore`;
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) fetchAll();
  };

  const handleDeletePermanent = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/${id}?permanent=1` : `/api/backups/${id}?permanent=1`;
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) fetchAll();
  };

  const handlePurgeTrash = async () => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/backups/trash/purge` : `/api/backups/trash/purge`;
    setPurgingTrash(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchAll();
    } finally {
      setPurgingTrash(false);
    }
  };

  const handleBulkMoveToTrash = async () => {
    const token = getStoredToken();
    if (!token || selectedBackupIds.size === 0) return;
    const base = getApiBaseUrl();
    const api = (p: string) => (base ? `${base}${p}` : p);
    setBulkActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedBackupIds).map((id) =>
          fetch(api(`/api/backups/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        )
      );
      setSelectedBackupIds(new Set());
      fetchAll();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkRestoreFromTrash = async () => {
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
      fetchAll();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDeletePermanent = async () => {
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
      fetchAll();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleRemoveSyncedData = async (serverId: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/synced-data` : `/api/sync/servers/${serverId}/synced-data`;
    setRemovingSyncedServerId(serverId);
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRemoveSyncedConfirmServerId(null);
        fetchAll();
      }
    } finally {
      setRemovingSyncedServerId(null);
    }
  };

  const handleDownload = async (id: string, name: string, isSyncSnapshot?: boolean) => {
    if (isSyncSnapshot) {
      alert("This backup is an archive from Live sync; download not available. Files are in Current synced data.");
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

  const fetchServerFiles = (serverId: string) => {
    if (showFilesServerId === serverId) {
      setShowFilesServerId(null);
      return;
    }
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/files?limit=500` : `/api/sync/servers/${serverId}/files?limit=500`;
    setShowFilesServerId(serverId);
    if (serverFiles[serverId]) return;
    setLoadingFilesServerId(serverId);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { files?: SyncedFile[]; total?: number } | null) => {
        if (data?.files && Array.isArray(data.files)) {
          const files = data.files;
          setServerFiles((prev) => ({
            ...prev,
            [serverId]: { files, total: typeof data.total === "number" ? data.total : files.length },
          }));
        }
      })
      .finally(() => setLoadingFilesServerId(null));
  };

  const downloadSyncedFile = (serverId: string, fileId: string, fileName: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/files/${fileId}/content` : `/api/sync/servers/${serverId}/files/${fileId}/content`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = fileName || "file";
        a.click();
        URL.revokeObjectURL(u);
      });
  };

  const handleArchiveSync = async (serverId: string, serverName: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const url = base ? `${base}/api/sync/servers/${serverId}/archive` : `/api/sync/servers/${serverId}/archive`;
    setArchivingServerId(serverId);
    try {
      const name = `Sync: ${serverName || "Server"} ${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        fetchAll();
      } else {
        const text = await res.text();
        let message = "Failed to archive sync";
        try {
          const data = text ? JSON.parse(text) : {};
          message = data?.error || message;
        } catch {
          if (text) message = text.slice(0, 200);
        }
        alert(message);
      }
    } finally {
      setArchivingServerId(null);
    }
  };

  const totalBackupBytes = list.reduce((s, b) => s + b.sizeBytes, 0);

  function renderArchiveRow(b: BackupItem, showServerLink: boolean) {
    const meta = b.metadata ?? {};
    const isSyncSnapshot = meta.source === "sync_snapshot";
    const tier = getBackupTier(b);
    const tierLabel = getTierLabel(tier);
    const hasDetail =
      isSyncSnapshot ||
      (meta.mods?.length ?? 0) > 0 ||
      (meta.plugins?.length ?? 0) > 0 ||
      meta.filesOnBackup != null ||
      meta.filesMissing != null ||
      meta.filesTooBig != null ||
      (meta.fileList?.length ?? 0) > 0 ||
      (meta.bigFileList?.length ?? 0) > 0 ||
      (meta.version ?? meta.minecraftVersion ?? meta.gameVersion);
    const expanded = expandedBackupId === b.id;
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hasDetail ? (
              <button
                type="button"
                onClick={() => setExpandedBackupId(expanded ? null : b.id)}
                className="shrink-0 text-zinc-400 hover:text-white"
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : null}
            {showServerLink && b.serverId && b.serverName && (
              <a href={`#server-${b.serverId}`} className="shrink-0 text-xs text-emerald-400 hover:underline">
                Server: {b.serverName}
              </a>
            )}
            <div className="min-w-0">
              {renamingId === b.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm font-mono text-white min-w-[120px]"
                    placeholder="Archive name"
                    autoFocus
                  />
                  <button type="button" onClick={() => handleRename(b.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500">Save</button>
                  <button type="button" onClick={() => { setRenamingId(null); setRenameValue(""); }} className="rounded bg-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-500">Cancel</button>
                </div>
              ) : (
                <span className="font-mono text-sm text-zinc-200 truncate block" title={b.name}>{b.name}</span>
              )}
              <span className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {formatDateTimeInTimeZone(b.createdAt, timeZone)} · {formatSize(b.sizeBytes)}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    tier === "full" && "bg-emerald-900/50 text-emerald-300",
                    tier === "structural" && "bg-blue-900/50 text-blue-300",
                    tier === "snapshot" && "bg-zinc-600/60 text-zinc-400 text-[9px]"
                  )}
                  title={getTierDescription(tier)}
                >
                  {tierLabel}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renamingId !== b.id && (
              <button type="button" onClick={() => { setRenamingId(b.id); setRenameValue(b.name); }} className="inline-flex items-center gap-1 rounded border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600" title="Rename archive">
                <Pencil className="h-3 w-3" aria-hidden /> Rename
              </button>
            )}
            <button type="button" onClick={() => handleDownload(b.id, b.name, isSyncSnapshot)} className="inline-flex items-center gap-1 rounded border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600" title={isSyncSnapshot ? "Archive from Live sync (no file download)" : undefined}>
              <Download className="h-3 w-3" aria-hidden /> Download
            </button>
            {deleteConfirmId === b.id ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-amber-300">Move to trash?</span>
                <button type="button" onClick={() => handleMoveToTrash(b.id)} className="rounded bg-amber-600 px-2 py-0.5 text-white">Yes</button>
                <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded bg-zinc-600 px-2 py-0.5 text-zinc-200">Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setDeleteConfirmId(b.id)} className="inline-flex items-center gap-1 rounded border border-amber-900/50 bg-amber-900/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/40">
                <Trash2 className="h-3 w-3" aria-hidden /> Move to trash
              </button>
            )}
          </div>
        </div>
        {expanded && hasDetail && (
          <div className="mt-3 pt-3 border-t border-zinc-700/50 text-sm">
            <div className="mb-3 pb-2 border-b border-zinc-700/40">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{tierLabel}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{getTierDescription(tier)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(meta.version ?? meta.minecraftVersion ?? meta.gameVersion) && (
                <div>
                  <p className="font-medium text-zinc-300 mb-1">Version</p>
                  <p className="text-xs text-zinc-500">{meta.version ?? meta.minecraftVersion ?? meta.gameVersion}</p>
                </div>
              )}
              {(meta.mods?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-zinc-300 mb-1 flex items-center gap-1"><Package className="h-4 w-4" /> Mods ({meta.mods!.length})</p>
                  <ul className="text-xs text-zinc-500 max-h-20 overflow-y-auto space-y-0.5">
                    {meta.mods!.slice(0, 15).map((m, i) => <li key={i} className="truncate font-mono">{m}</li>)}
                    {meta.mods!.length! > 15 && <li>…+{meta.mods!.length! - 15} more</li>}
                  </ul>
                </div>
              )}
              {(meta.plugins?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-zinc-300 mb-1 flex items-center gap-1"><Package className="h-4 w-4" /> Plugins ({meta.plugins!.length})</p>
                  <ul className="text-xs text-zinc-500 max-h-20 overflow-y-auto space-y-0.5">
                    {meta.plugins!.slice(0, 15).map((p, i) => <li key={i} className="truncate font-mono">{p}</li>)}
                    {meta.plugins!.length! > 15 && <li>…+{meta.plugins!.length! - 15} more</li>}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {meta.filesOnBackup != null && <span className="flex items-center gap-1 text-emerald-400 text-xs"><FileCheck className="h-3 w-3" /> {meta.filesOnBackup} on backup</span>}
                {meta.filesMissing != null && meta.filesMissing > 0 && <span className="flex items-center gap-1 text-amber-400 text-xs"><FileX className="h-3 w-3" /> {meta.filesMissing} missing</span>}
                {meta.filesTooBig != null && meta.filesTooBig > 0 && <span className="flex items-center gap-1 text-amber-400 text-xs"><HardDrive className="h-3 w-3" /> {meta.filesTooBig} too big</span>}
              </div>
              {(meta.fileList?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-zinc-300 mb-1 flex items-center gap-1"><FileText className="h-4 w-4" /> Files on backup ({(meta.fileList ?? []).length})</p>
                  <ul className="text-xs text-zinc-500 max-h-32 overflow-y-auto space-y-0.5 font-mono">
                    {(meta.fileList ?? []).slice(0, 50).map((p, i) => (
                      <li key={i} className="truncate" title={p}>{p}</li>
                    ))}
                    {(meta.fileList ?? []).length > 50 && <li>…+{(meta.fileList ?? []).length - 50} more</li>}
                  </ul>
                </div>
              )}
              {(meta.bigFileList?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-zinc-300 mb-1 flex items-center gap-1"><HardDrive className="h-4 w-4" /> Files too big, not stored ({(meta.bigFileList ?? []).length})</p>
                  <ul className="text-xs text-zinc-500 max-h-32 overflow-y-auto space-y-0.5 font-mono">
                    {(meta.bigFileList ?? []).slice(0, 50).map((p, i) => (
                      <li key={i} className="truncate" title={p}>{p}</li>
                    ))}
                    {(meta.bigFileList ?? []).length > 50 && <li>…+{(meta.bigFileList ?? []).length - 50} more</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  const filteredList = useMemo(() => {
    if (backupFilter === "all") return list;
    if (backupFilter === "snapshot") return list.filter((b) => getBackupTier(b) === "snapshot");
    if (backupFilter === "mini") return list.filter((b) => getBackupTier(b) === "structural");
    if (backupFilter === "full") return list.filter((b) => getBackupTier(b) === "full");
    return list.filter((b) => (b.metadata?.filesTooBig ?? 0) > 0);
  }, [list, backupFilter]);

  const searchFilteredList = useMemo(() => {
    if (!searchSnapshots.trim()) return filteredList;
    const q = searchSnapshots.trim().toLowerCase();
    return filteredList.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.serverName ?? "").toLowerCase().includes(q)
    );
  }, [filteredList, searchSnapshots]);

  const searchFilteredTrash = useMemo(() => {
    if (!searchTrash.trim()) return trashList;
    const q = searchTrash.trim().toLowerCase();
    return trashList.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.serverName ?? "").toLowerCase().includes(q)
    );
  }, [trashList, searchTrash]);

  const tierLabel = report?.tierId && TIER_STORAGE[report.tierId]
    ? TIER_STORAGE[report.tierId].label
    : "Storage";
  const limitGb = report?.storageLimitGb ?? 0;
  const miniBytes = report?.miniBytes ?? 0;
  const bigBytes = report?.bigBytes ?? Math.max(0, (report?.totalSizeBytes ?? 0) - miniBytes);

  const TABS: { id: CloudTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "overview", label: "Overview", Icon: Cloud },
    { id: "servers", label: "Servers (Live sync)", Icon: Server },
    { id: "snapshots-archives", label: "Archives & backups", Icon: FolderOpen },
    { id: "trash", label: "Trash", Icon: Trash2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SafeIcon><Cloud className="h-6 w-6 text-emerald-500 shrink-0" aria-hidden /></SafeIcon>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">Cloud</h1>
          </div>
          <p className="text-zinc-500 text-sm mt-0.5 max-w-xl">
            Your server backups and live sync in one place. Sync from the app to see current data; save to create backups in Archives.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchAll()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 shrink-0"
          title="Refresh"
        >
          <SafeIcon><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /></SafeIcon>
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex gap-3">
            <div className="rounded-lg bg-emerald-900/30 p-2 h-fit shrink-0">
              <Zap className="h-5 w-5 text-emerald-400" aria-hidden />
            </div>
            <div>
              <span className="font-medium text-zinc-200">Live sync</span>
              <p className="text-xs text-zinc-500 mt-0.5">Current data from the app for each server. Browse files and mods; save when you want a backup.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg bg-blue-900/30 p-2 h-fit shrink-0">
              <FolderOpen className="h-5 w-5 text-blue-400" aria-hidden />
            </div>
            <div>
              <span className="font-medium text-zinc-200">Archive</span>
              <p className="text-xs text-zinc-500 mt-0.5">Point-in-time backups. Save from the app or archive live sync. Upload ZIP or snapshot to add more.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg bg-zinc-700/50 p-2 h-fit shrink-0">
              <Trash2 className="h-5 w-5 text-zinc-400" aria-hidden />
            </div>
            <div>
              <span className="font-medium text-zinc-200">Trash</span>
              <p className="text-xs text-zinc-500 mt-0.5">Deleted items. Restore or permanently remove after 30 days.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCloudTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              cloudTab === id
                ? "bg-zinc-800 text-white border-emerald-500"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <SafeIcon><Icon className="h-4 w-4 shrink-0" aria-hidden /></SafeIcon>
            {label}
          </button>
        ))}
      </div>

      {cloudTab === "overview" && (
        <div className="space-y-6">
      {loading && list.length === 0 && servers.length === 0 && (
        <div className="py-4">
          <DashboardLoadingBlock />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Backup types: quick reference */}
      <section className="lg:col-span-12 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Backup types</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded bg-zinc-600/60 px-2 py-1 text-zinc-400" title={getTierDescription("snapshot")}>Snapshot — metadata only</span>
          <span className="rounded bg-blue-900/50 px-2 py-1 text-blue-300" title={getTierDescription("structural")}>Mini — config, mods, plugins</span>
          <span className="rounded bg-emerald-900/50 px-2 py-1 text-emerald-300" title={getTierDescription("full")}>Full — everything (JAR included)</span>
          <span className="rounded bg-amber-900/50 px-2 py-1 text-amber-300" title={getTierDescription("world")}>Map — world folders only</span>
          <span className="rounded bg-violet-900/50 px-2 py-1 text-violet-300" title={getTierDescription("custom")}>Custom — chosen folders in app</span>
        </div>
      </section>

      {/* Storage: compact */}
      {report && (
        <section className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Storage</span>
            {report.tierId && <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-xs text-zinc-300">{tierLabel}</span>}
          </div>
          {limitGb > 0 && report.storageLimitBytes != null && report.storageLimitBytes > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-lg font-semibold text-zinc-100">{formatSize(report.totalSizeBytes)}</span>
                <span className="text-zinc-500 text-sm">/ {limitGb} GB</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex">
                {miniBytes > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(miniBytes / report.storageLimitBytes) * 100}%` }} title={`Mini: ${formatSize(miniBytes)}`} />}
                {bigBytes > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(bigBytes / report.storageLimitBytes) * 100}%` }} title={`Big: ${formatSize(bigBytes)}`} />}
              </div>
              <div className="flex gap-3 mt-1 text-xs text-zinc-500">
                <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle mr-1" />Mini {formatSize(miniBytes)}</span>
                <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle mr-1" />Big {formatSize(bigBytes)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">—</p>
          )}
          {report.filesTooBigCount > 0 && <p className="mt-2 text-xs text-amber-400">{report.filesTooBigCount} file(s) too big{!hasBackupTier ? " · upgrade for big files" : ""}</p>}
          <Link href={getPath("pricing", locale)} className="mt-2 inline-block text-xs text-emerald-400 hover:underline">Free 5 · Backup 15 GB · Pro 100 GB →</Link>
        </section>
      )}

      {/* Getting full server data: full width so text flows (was squeezed in 1 col) */}
      <section className="lg:col-span-12 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-5 w-5 text-blue-400 shrink-0" aria-hidden />
          <h2 className="font-semibold text-lg">Getting full server data</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-3 max-w-3xl">
          If a server shows <strong className="text-blue-400">mini files only</strong> (blue), full server data (worlds, large files) is not in the cloud yet. Here’s how to get everything:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-300 mb-4">
          <li>
            <strong className="text-zinc-200">From the iHost app:</strong> Run a full backup and upload. The app will sync mini files first, then you can upload the full archive—counts toward your storage here.
          </li>
          <li>
            <strong className="text-zinc-200">Manual upload:</strong> Zip your server folder and use “Upload backup” below. Stored with integrity checks; you can link it to a server from the app for restore.
          </li>
        </ol>
      </section>

      {/* Import */}
      <section id="export-format" className="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Import</span>
          <Link href={`${getPath("docs", locale)}#export-format`} className="text-xs text-zinc-500 hover:text-zinc-400">Format</Link>
        </div>
        <p className="text-xs text-zinc-500 mb-3">ZIP (ihostmc-import.json) → new server. Snapshot (.ihostmc-snapshot) → metadata backup.</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer">
            <FileArchive className="h-3.5 w-3.5" />
            {importingZip ? "…" : "ZIP"}
            <input
              type="file"
              accept=".zip"
              className="sr-only"
              disabled={importingZip}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const token = getStoredToken();
                if (!token) { alert("Sign in first."); return; }
                const base = getApiBaseUrl();
                const url = base ? `${base}/api/sync/import` : "/api/sync/import";
                setImportingZip(true);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await fetch(url, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok) {
                    fetchAll();
                    alert(`Imported: ${data?.serverName ?? "Server"} (${data?.fileCount ?? 0} files). Open Servers to see it.`);
                  } else {
                    alert(data?.error || "Import failed");
                  }
                } finally {
                  setImportingZip(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer">
            <FileText className="h-3.5 w-3.5" />
            {importingSnapshot ? "…" : "Snapshot"}
            <input
              type="file"
              accept=".ihostmc-snapshot,.json,application/json"
              className="sr-only"
              disabled={importingSnapshot}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const token = getStoredToken();
                if (!token) { alert("Sign in first."); return; }
                const base = getApiBaseUrl();
                const url = base ? `${base}/api/backups/import` : "/api/backups/import";
                setImportingSnapshot(true);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await fetch(url, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok) {
                    fetchAll();
                    alert(`Import complete: ${data?.name ?? "Backup"}. See Archives & backups.`);
                  } else {
                    alert(data?.error || "Import failed");
                  }
                } finally {
                  setImportingSnapshot(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      </section>
      </div>

      {tierLoaded && !hasBackupTier && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>Free tier: sync from app. Upgrade for more backups and iterations.</span>
          <Link href={getPath("pricing", locale)} className="rounded bg-amber-700/50 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-700/70">Plans →</Link>
        </div>
      )}

      {/* Live synced: servers with current synced data (not yet saved as snapshot/archive) */}
      {servers.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-emerald-500" aria-hidden />
            <h2 className="font-semibold text-lg">Servers</h2>
          </div>
          <p className="text-sm text-zinc-500 mb-4">Per-server sync from the app. Open to browse or archive. Servers with no current live data (archived and not re-synced) show as inactive until you sync again.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {servers.map((s) => {
              const serverBackups = list.filter((b) => b.serverId === s.id);
              const sum = serverSummaries[s.id];
              const storageSynced = sum ? sum.miniBytes + sum.bigBytes : 0;
              const hasLiveSync = storageSynced > 0;
              const miniOnly = hasLiveSync && s.miniSynced && s.backupCount === 0 && (sum?.big ?? 0) === 0;
              const inactive = !hasLiveSync;
              const removing = removingSyncedServerId === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 transition-colors hover:bg-zinc-800/50 ${
                    inactive ? "border-zinc-600/70 bg-zinc-800/20" : miniOnly ? "border-blue-700/60 bg-blue-900/10" : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <Link
                      href={getCloudServerDetailPath(s.id, locale)}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-2">
                        <Server
                          className={`h-5 w-5 shrink-0 ${inactive ? "text-zinc-500" : miniOnly ? "text-blue-400" : "text-emerald-500"}`}
                          aria-hidden
                        />
                        <span className={`font-semibold truncate ${inactive ? "text-zinc-400" : "text-zinc-100"}`}>{s.name || "Unnamed"}</span>
                        {inactive && (
                          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-xs text-zinc-400 shrink-0" title="No live data; sync from app to activate">
                            No live data
                          </span>
                        )}
                        {miniOnly && <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-300 shrink-0">Mini only</span>}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleRemoveSyncServer(s.id); }}
                      disabled={removing}
                      className="shrink-0 rounded p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                      title="Remove from website (sync from app to re-add)"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <Link href={getCloudServerDetailPath(s.id, locale)} className="block">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <SyncBadge lastSyncedAt={s.lastSyncedAt} miniSynced={s.miniSynced} />
                      {storageSynced > 0 && <span>{formatSize(storageSynced)} synced</span>}
                      <span>{serverBackups.length} archive{serverBackups.length !== 1 ? "s" : ""}</span>
                    </div>
                    {(s.iterationEvery3h || s.iterationDaily || s.iterationWeekly) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden />
                          Schedule:
                        </span>
                        {s.iterationEvery3h && <span>{getIntervalLabel(Number(s.iterationIntervalHours) || 1)}</span>}
                        {s.iterationDaily && <span>Daily</span>}
                        {s.iterationWeekly && <span>Weekly</span>}
                        {(s.iterationLast3hAt || s.iterationLastDailyAt || s.iterationLastWeeklyAt) && (
                          <>
                            <span className="text-zinc-600">·</span>
                            {s.iterationLast3hAt && (
                              <span title="Last 3h">3h: {formatDateTimeInTimeZone(s.iterationLast3hAt, timeZone)}</span>
                            )}
                            {s.iterationLastDailyAt && (
                              <span title="Last daily">Daily: {formatDateInTimeZone(s.iterationLastDailyAt, timeZone)}</span>
                            )}
                            {s.iterationLastWeeklyAt && (
                              <span title="Last weekly">Weekly: {formatDateInTimeZone(s.iterationLastWeeklyAt, timeZone)}</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <span className={`mt-2 inline-block text-xs ${inactive ? "text-zinc-500" : "text-emerald-400"}`}>View server →</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

        </div>
      )}

      {cloudTab === "servers" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="font-semibold text-lg mb-4">Servers</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Trigger a sync from the app when connected, or open a server to manage files and archives. Servers with no live data show as inactive until you sync again.
          </p>
          {servers.length === 0 ? (
            <p className="text-zinc-500 text-sm">No servers yet. Sync from the iHost app to add servers.</p>
          ) : (
            <ul className="space-y-2">
              {servers.map((s) => {
                const sum = serverSummaries[s.id];
                const storageSynced = sum ? sum.miniBytes + sum.bigBytes : 0;
                const hasLiveSync = storageSynced > 0;
                const serverBackups = list.filter((b) => b.serverId === s.id);
                const inactive = !hasLiveSync;
                return (
                  <li
                    key={s.id}
                    className={`rounded-lg border px-4 py-3 flex flex-wrap items-center justify-between gap-2 ${
                      inactive ? "border-zinc-600/60 bg-zinc-800/20" : "border-zinc-700/50 bg-zinc-800/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Server className={`h-5 w-5 shrink-0 ${inactive ? "text-zinc-500" : "text-emerald-500"}`} aria-hidden />
                      <Link
                        href={getCloudServerDetailPath(s.id, locale)}
                        className={`font-medium hover:underline truncate ${inactive ? "text-zinc-400" : "text-emerald-200"}`}
                      >
                        {s.name || "Unnamed"}
                      </Link>
                      <SyncBadge lastSyncedAt={s.lastSyncedAt} miniSynced={s.miniSynced} />
                      {inactive && (
                        <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-xs text-zinc-400">No live data</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {storageSynced > 0 && <span className="text-xs text-zinc-500">{formatSize(storageSynced)} synced</span>}
                      {inactive && serverBackups.length > 0 && <span className="text-xs text-zinc-500">{serverBackups.length} archive(s)</span>}
                      <button
                        type="button"
                        onClick={() => {
                          const token = getStoredToken();
                          if (!token) return;
                          const base = getApiBaseUrl();
                          const url = base ? `${base}/api/sync/servers/${s.id}/trigger-sync` : `/api/sync/servers/${s.id}/trigger-sync`;
                          fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
                            .then((r) => r.ok && alert("Sync requested. The app will sync when connected."));
                        }}
                        className="rounded border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                      >
                        Trigger sync
                      </button>
                      <Link href={getCloudServerDetailPath(s.id, locale)} className="rounded border border-emerald-700/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50">
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleRemoveSyncServer(s.id)}
                        disabled={removingSyncedServerId === s.id}
                        className="rounded p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                        title="Remove from website"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {cloudTab === "snapshots-archives" && (
      <section id="snapshots-archives" className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-lg">Archives &amp; backups</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Click an archive or backup to view details, version, mods and plugins. Select items for bulk move to trash (purged after 30 days).</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {limits != null && (
              <span className="text-zinc-400">
                {limits.count} / {limits.maxBackups} used
              </span>
            )}
            {list.length > 0 && (
              <span className="text-zinc-500">Total: {formatSize(totalBackupBytes)}</span>
            )}
          </div>
        </div>

        {list.length > 0 && (
          <>
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 mb-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={searchSnapshots}
                    onChange={(e) => setSearchSnapshots(e.target.value)}
                    placeholder="Search by name or server…"
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800/80 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                    aria-label="Search archives and backups"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 text-zinc-500" aria-hidden />
                  <span className="text-xs text-zinc-500">Filter:</span>
                  {(["all", "snapshot", "mini", "full", "tooBig"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setBackupFilter(f)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        backupFilter === f
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {f === "all" ? "All" : f === "snapshot" ? "Snapshot" : f === "mini" ? "Mini" : f === "full" ? "Full" : "Has big files"}
                    </button>
                  ))}
                </div>
              </div>
              {searchFilteredList.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-zinc-700/50">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-zinc-300 hover:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={searchFilteredList.length > 0 && searchFilteredList.every((b) => selectedBackupIds.has(b.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBackupIds(new Set(searchFilteredList.map((b) => b.id)));
                        } else {
                          setSelectedBackupIds(new Set());
                        }
                      }}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-0 focus:ring-offset-zinc-900"
                      aria-label="Select all on page"
                    />
                    <span>Select all on page</span>
                  </label>
                  {selectedBackupIds.size > 0 && (
                    <span className="text-sm text-zinc-400 font-medium">
                      {selectedBackupIds.size} selected
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {loading && list.length === 0 ? (
          <div className="py-6">
            <DashboardLoadingBlock />
          </div>
        ) : list.length === 0 ? (
          <p className="text-zinc-500">
            No archives or backups yet. Sync from the app, then &quot;Archive this sync&quot; on a server to create an archive, or upload a backup.
          </p>
        ) : searchFilteredList.length === 0 ? (
          <p className="text-zinc-500">No backups match the current filter or search.</p>
        ) : (
          <>
            {selectedBackupIds.size > 0 && (
              <div className="sticky top-2 z-10 flex flex-wrap items-center gap-4 rounded-xl border border-amber-700/50 bg-amber-900/40 px-5 py-3.5 mb-4 shadow-lg backdrop-blur-sm">
                <span className="font-semibold text-amber-100">{selectedBackupIds.size} selected</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkMoveToTrash}
                    disabled={bulkActionLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-600 bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {bulkActionLoading ? "Moving…" : "Move to trash"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBackupIds(new Set())}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700/90 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 transition-colors"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Clear selection
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {(() => {
                const byServer = new Map<string, { name: string; backups: BackupItem[] }>();
                for (const b of searchFilteredList) {
                  const key = b.serverId ?? "_none";
                  const name = b.serverName || "Other";
                  if (!byServer.has(key)) byServer.set(key, { name, backups: [] });
                  byServer.get(key)!.backups.push(b);
                }
                const entries = Array.from(byServer.entries());
                return entries.map(([serverKey, { name: serverName, backups: serverBackups }]) => {
                  const isExpanded = !collapsedServerIds.has(serverKey);
                  return (
                    <div key={serverKey} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleServerExpanded(serverKey)}
                        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-700/30 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
                        )}
                        <Server className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
                        <span className="font-medium text-zinc-200">{serverName}</span>
                        <span className="text-xs text-zinc-500">({serverBackups.length})</span>
                      </button>
                      {isExpanded && (
                        <ul className="border-t border-zinc-700/50 divide-y divide-zinc-700/30">
                          {serverBackups.map((b) => {
                            const tier = getBackupTier(b);
                            const detailHref = getBackupDetailPath(b.id, locale);
                            const checked = selectedBackupIds.has(b.id);
                            return (
                              <li key={b.id} className="flex items-center gap-3 min-w-0 hover:bg-zinc-700/20">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setSelectedBackupIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(b.id)) next.delete(b.id);
                                      else next.add(b.id);
                                      return next;
                                    });
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-0"
                                  aria-label={`Select ${b.name}`}
                                />
                                <NextLink
                                  href={detailHref}
                                  className="flex flex-1 flex-wrap items-center gap-3 px-2 py-3 min-w-0 group"
                                >
                                  <FileArchive className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
                                  <div className="min-w-0 flex-1">
                                    <span className="font-mono text-sm text-zinc-200 truncate block group-hover:text-white" title={b.name}>{b.name}</span>
                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                      <span
                                        className={cn(
                                          "rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                                          tier === "full" && "bg-emerald-900/50 text-emerald-300",
                                          tier === "structural" && "bg-blue-900/50 text-blue-300",
                                          tier === "snapshot" && "bg-zinc-600/60 text-zinc-400",
                                          tier === "world" && "bg-amber-900/50 text-amber-300",
                                          tier === "custom" && "bg-violet-900/50 text-violet-300"
                                        )}
                                        title={getTierDescription(tier)}
                                      >
                                        {getTierLabel(tier)}
                                      </span>
                                      {tier === "custom" && (() => {
                                        const tags = getCustomBackupTags(b.metadata);
                                        return tags.length > 0 ? (
                                          <span className="flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
                                            {tags.map((tag) => (
                                              <span key={tag} className="rounded bg-zinc-700/60 px-1 py-0.5">
                                                {tag}
                                              </span>
                                            ))}
                                          </span>
                                        ) : null;
                                      })()}
                                      <span className="text-xs text-zinc-500">{formatSize(b.sizeBytes)}</span>
                                      <span className="text-xs text-zinc-500">{formatDateTimeInTimeZone(b.createdAt, timeZone)}</span>
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-xs font-medium text-emerald-400 group-hover:text-emerald-300">View details</span>
                                  <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
                                </NextLink>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </>
        )}
      </section>
      )}

      {cloudTab === "trash" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-semibold text-lg">Trash</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Items are permanently deleted after 30 days. Select items to restore or delete permanently. Trashed servers can be restored or permanently deleted (this deletes the server and all its backups in trash).</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePurgeTrash}
                disabled={purgingTrash || trashList.length === 0}
                className="rounded border border-amber-700/50 bg-amber-900/30 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
              >
                {purgingTrash ? "Purging…" : "Purge expired now"}
              </button>
            </div>
          </div>
          {trashedServers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Trashed servers</h3>
              <ul className="space-y-2">
                {trashedServers.map((s) => {
                  const backupsInTrash = trashList.filter((t) => t.serverId === s.id).length;
                  return (
                    <li key={s.id} className="rounded-lg border border-amber-800/50 bg-amber-900/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-zinc-200">{s.name || "Unnamed"}</span>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Moved to trash
                          {s.trashedAt && ` · ${formatDateTimeInTimeZone(s.trashedAt, timeZone)}`}
                          {backupsInTrash > 0 && ` · ${backupsInTrash} backup(s) in trash`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreTrashedServer(s.id)}
                          className="rounded border border-emerald-700/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/50"
                        >
                          Restore server
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermanentDeleteServer(s.id, s.name || "Unnamed", backupsInTrash)}
                          disabled={deletingServerId === s.id}
                          className="rounded border border-red-900/50 bg-red-900/20 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                        >
                          {deletingServerId === s.id ? "Deleting…" : "Permanently delete server"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {trashList.length > 0 && (
            <>
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 mb-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden />
                    <input
                      type="search"
                      value={searchTrash}
                      onChange={(e) => setSearchTrash(e.target.value)}
                      placeholder="Search by name or server…"
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800/80 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                      aria-label="Search trash"
                    />
                  </div>
                  {searchFilteredTrash.length > 0 && (
                    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-zinc-300 hover:text-zinc-200">
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
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-0"
                        aria-label="Select all on page"
                      />
                      <span>Select all on page</span>
                    </label>
                  )}
                </div>
                {selectedTrashIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-amber-700/40 bg-amber-900/20 -mx-4 px-4 py-3 rounded-b-xl">
                    <span className="font-semibold text-amber-100">{selectedTrashIds.size} selected</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBulkRestoreFromTrash}
                        disabled={bulkActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                      >
                        {bulkActionLoading ? "Restoring…" : "Restore selected"}
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkDeletePermanent}
                        disabled={bulkActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-900/50 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900/70 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Delete permanently
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTrashIds(new Set())}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700/90 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 transition-colors"
                      >
                        <X className="h-4 w-4" aria-hidden />
                        Clear selection
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {trashList.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items in trash.</p>
          ) : searchFilteredTrash.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items match your search.</p>
          ) : (
            <ul className="space-y-2">
              {searchFilteredTrash.map((t) => {
                const checked = selectedTrashIds.has(t.id);
                return (
                  <li key={t.id} className="rounded-lg border border-amber-800/50 bg-amber-900/10 px-4 py-3 flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedTrashIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-0"
                      aria-label={`Select ${t.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm text-zinc-300 truncate block">{t.name}</span>
                      <span className="text-xs text-zinc-500">
                        Deleted {t.deletedAt && formatDateTimeInTimeZone(t.deletedAt, timeZone)}
                        {t.purgeAt && ` · Purge ${new Date(t.purgeAt).toLocaleDateString()}`}
                        {t.serverName && ` · ${t.serverName}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleRestoreFromTrash(t.id)} className="rounded border border-emerald-700/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/50">
                        Restore
                      </button>
                      <button type="button" onClick={() => handleDeletePermanent(t.id)} className="rounded border border-red-900/50 bg-red-900/20 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40">
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
