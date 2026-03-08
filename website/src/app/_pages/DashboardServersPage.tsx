"use client";

import { useEffect, useState, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { getPath, getDashboardServerDetailPath } from "@/i18n/pathnames";
import { useLocale } from "next-intl";
import { getApiBaseUrl, getStoredToken, responseJson } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import { DEFAULT_PRODUCT_SLUG } from "@/lib/products";
import { DOMAINS } from "@/lib/domains";
import type { Locale } from "@/i18n/pathnames";
import {
  Server,
  FileText,
  Folder,
  FolderOpen,
  File,
  Lock,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Shield,
  ArrowLeft,
  FileArchive,
  Info,
  Package,
  Trash2,
  Archive,
  ArchiveRestore,
} from "lucide-react";

interface SyncServer {
  id: string;
  hostId: string;
  name: string;
  lastSyncedAt: string | null;
  backupCount: number;
  miniSynced: boolean;
  archived?: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

interface SyncFile {
  id: string;
  filePath: string;
  fileHash: string;
  sizeBytes: number;
  storageTier: "mini" | "big";
  encrypted: boolean;
  syncedAt: string;
}

interface SyncSummary {
  syncedFiles: { mini: number; big: number; totalFiles: number; miniBytes: number; bigBytes: number; totalBytes: number };
  manifests: Array<{ id: string; manifestType: string; fileCount: number; totalBytes: number; createdAt: string }>;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  storageTier: "mini" | "big";
  encrypted: boolean;
  children: TreeNode[];
  fileId?: string;
}

function buildTree(files: SyncFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();
  const sorted = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const f of sorted) {
    const parts = f.filePath.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!byPath.has(dirPath)) {
        const node: TreeNode = { name: parts[i]!, path: dirPath, isDir: true, sizeBytes: 0, storageTier: "mini", encrypted: false, children: [] };
        byPath.set(dirPath, node);
        if (i === 0) root.push(node);
        else byPath.get(parts.slice(0, i).join("/"))?.children.push(node);
      }
    }
    const node: TreeNode = { name: parts[parts.length - 1]!, path: f.filePath, isDir: false, sizeBytes: f.sizeBytes, storageTier: f.storageTier, encrypted: f.encrypted, children: [], fileId: f.id };
    byPath.set(f.filePath, node);
    if (parts.length === 1) root.push(node);
    else byPath.get(parts.slice(0, -1).join("/"))?.children.push(node) ?? root.push(node);
  }

  const sort = (nodes: TreeNode[]) => { nodes.sort((a, b) => a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)); nodes.forEach((n) => sort(n.children)); };
  sort(root);
  return root;
}

function TreeRow({ node, depth, onView }: { node: TreeNode; depth: number; onView: (id: string, path: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1.5 w-full rounded px-1.5 py-1 text-left text-sm hover:bg-zinc-800/50"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => node.isDir ? setOpen(!open) : node.fileId && onView(node.fileId, node.path)}
      >
        {node.isDir ? (
          <ChevronRight className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-3.5" />
        )}
        {node.isDir ? (open ? <FolderOpen className="h-4 w-4 text-amber-500/80" /> : <Folder className="h-4 w-4 text-zinc-500" />) : <File className="h-4 w-4 text-zinc-500" />}
        <span className="font-mono text-zinc-200 truncate">{node.name}</span>
        {!node.isDir && (
          <>
            <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${node.storageTier === "mini" ? "bg-emerald-900/40 text-emerald-400" : "bg-amber-900/40 text-amber-400"}`}>
              {node.storageTier}
            </span>
            <span className="text-xs text-zinc-500 shrink-0">{formatSize(node.sizeBytes)}</span>
            {node.encrypted && <Lock className="h-3 w-3 text-blue-500/70 shrink-0" />}
          </>
        )}
      </button>
      {node.isDir && open && node.children.map((c) => <TreeRow key={c.path} node={c} depth={depth + 1} onView={onView} />)}
    </>
  );
}

interface DashboardServersPageProps {
  pathSegments?: string[];
}

export default function DashboardServersPage({ pathSegments = [] }: DashboardServersPageProps) {
  const locale = useLocale() as Locale;
  const [servers, setServers] = useState<SyncServer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<SyncFile[]>([]);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveExpanded, setArchiveExpanded] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const loadServers = useCallback(() => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    fetch(`${base}/api/sync/servers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => responseJson(r, []))
      .then((d) => { setServers(Array.isArray(d) ? d : []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }
    const base = getApiBaseUrl();
    fetch(`${base}/api/sync/servers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => responseJson(r, []))
      .then((d) => { setServers(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patchServer = useCallback(async (serverId: string, body: { archived?: boolean; trashed?: boolean }) => {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    setPatchingId(serverId);
    try {
      const res = await fetch(`${base}/api/sync/servers/${serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        loadServers();
        if (body.trashed) setSelectedId(null);
      }
    } finally {
      setPatchingId(null);
    }
  }, [loadServers]);

  const loadServerData = useCallback(async (serverId: string) => {
    const token = getStoredToken();
    if (!token) return;
    const base = getApiBaseUrl();
    const auth = { Authorization: `Bearer ${token}` };
    setSelectedId(serverId);
    setFileContent(null);
    const [filesRes, summaryRes] = await Promise.all([
      fetch(`${base}/api/sync/servers/${serverId}/files?limit=2500`, { headers: auth }).then((r) => responseJson(r, { files: [] })),
      fetch(`${base}/api/sync/servers/${serverId}/summary`, { headers: auth }).then((r) => responseJson(r, null)),
    ]);
    setFiles(filesRes.files ?? []);
    setSummary(summaryRes);
  }, []);

  useEffect(() => {
    if (pathSegments.length === 4 && pathSegments[3] && servers.length > 0) {
      const serverId = pathSegments[3];
      if (servers.some((s) => s.id === serverId)) {
        setSelectedId(serverId);
        loadServerData(serverId);
      }
    }
  }, [pathSegments, servers, loadServerData]);

  const viewFile = useCallback(async (fileId: string, filePath: string) => {
    const token = getStoredToken();
    if (!token || !selectedId) return;
    const base = getApiBaseUrl();
    try {
      const res = await fetch(`${base}/api/sync/servers/${selectedId}/files/${fileId}/content`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setFileContent({ path: filePath, content: `Error: ${res.statusText}` }); return; }
      const text = await res.text();
      setFileContent({ path: filePath, content: text });
    } catch {
      setFileContent({ path: filePath, content: "Failed to load file content" });
    }
  }, [selectedId]);

  const selected = servers.find((s) => s.id === selectedId);
  const tree = buildTree(files);
  const activeServers = servers.filter((s) => !s.archived);
  const archivedServers = servers.filter((s) => s.archived);

  if (loading) return <DashboardLoadingBlock />;

  const isMiniOnly = (s: SyncServer) => s.miniSynced && s.backupCount === 0;

  const serverCard = (s: SyncServer, actions: React.ReactNode) => {
    const miniOnly = isMiniOnly(s);
    return (
      <div
        key={s.id}
        className={`rounded-xl border p-5 text-left transition-colors ${
          miniOnly
            ? "border-blue-700/60 bg-blue-900/20 hover:border-blue-600/70"
            : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <Link
            href={getDashboardServerDetailPath(DEFAULT_PRODUCT_SLUG, s.id, locale)}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Server className={`h-5 w-5 shrink-0 ${miniOnly ? "text-blue-400" : "text-emerald-500"}`} />
              <span className="font-semibold text-zinc-100">{s.name || "Unnamed"}</span>
              {miniOnly && (
                <span className="rounded-md bg-blue-900/60 px-2 py-0.5 text-xs font-medium text-blue-300">
                  Mini files only
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
              {s.hostId && (
                <span className="font-mono text-zinc-600" title={s.hostId}>
                  {s.hostId.slice(0, 10)}…
                </span>
              )}
              <span>{s.backupCount} backup{s.backupCount !== 1 ? "s" : ""}</span>
              {s.lastSyncedAt && (
                <span>Last sync: {new Date(s.lastSyncedAt).toLocaleDateString()}</span>
              )}
            </div>
            {s.miniSynced && !miniOnly && (
              <p className="mt-2 text-xs text-emerald-400/90">Mini synced · has backup(s)</p>
            )}
          </Link>
          <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.preventDefault()}>
            {actions}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Servers</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Servers synced from the iHost app at <span className="text-zinc-300 font-mono">{DOMAINS.app}</span>.
          View files, manifest, and storage. Archive to hide from the main list; delete moves to trash (restore or permanently delete from <Link href={getPath("dashboardBackups", locale)} className="text-emerald-400 hover:underline">Cloud → Trash</Link>).
        </p>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-500">
          <Server className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
          <p>No servers synced yet. Open the iHost app and click Sync to register your servers.</p>
          <Link href={getPath("dashboardBackups", locale)} className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <FileArchive className="h-4 w-4" /> Cloud &amp; backups →
          </Link>
        </div>
      ) : !selectedId ? (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Active</h2>
            {activeServers.length === 0 ? (
              <p className="text-zinc-500 text-sm">No active servers. Restore from Archive below.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeServers.map((s) =>
                  serverCard(
                    s,
                    <>
                      <button
                        type="button"
                        onClick={() => patchServer(s.id, { archived: true })}
                        disabled={patchingId === s.id}
                        className="rounded p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-900/20 disabled:opacity-50"
                        title="Archive server"
                      >
                        <Archive className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm("Move this server to trash? Its backups will move to trash. Restore or permanently delete from Cloud → Trash.")) return;
                          patchServer(s.id, { trashed: true });
                        }}
                        disabled={patchingId === s.id}
                        className="rounded p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                        title="Move to trash"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )
                )}
              </div>
            )}
          </section>
          <section>
            <button
              type="button"
              onClick={() => setArchiveExpanded((e) => !e)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${archiveExpanded ? "rotate-0" : "-rotate-90"}`} aria-hidden />
              Archive ({archivedServers.length})
            </button>
            {archiveExpanded && archivedServers.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                {archivedServers.map((s) =>
                  serverCard(
                    s,
                    <>
                      <button
                        type="button"
                        onClick={() => patchServer(s.id, { archived: false })}
                        disabled={patchingId === s.id}
                        className="rounded p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-900/20 disabled:opacity-50"
                        title="Restore to active"
                      >
                        <ArchiveRestore className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm("Move this server to trash? Its backups will move to trash. Restore or permanently delete from Cloud → Trash.")) return;
                          patchServer(s.id, { trashed: true });
                        }}
                        disabled={patchingId === s.id}
                        className="rounded p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                        title="Move to trash"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <Link
            href={getPath("dashboardServers", locale)}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to servers
          </Link>

          {/* Server header */}
          {selected && (
            <div
              className={`rounded-xl border p-5 ${
                summary && summary.syncedFiles.bigBytes === 0 && selected.backupCount === 0
                  ? "border-blue-700/60 bg-blue-900/20"
                  : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Server
                  className={`h-5 w-5 ${
                    summary && summary.syncedFiles.bigBytes === 0 && selected.backupCount === 0
                      ? "text-blue-400"
                      : "text-emerald-500"
                  }`}
                />
                <h2 className="text-lg font-semibold">{selected.name || "Server"}</h2>
                {summary && summary.syncedFiles.bigBytes === 0 && selected.backupCount === 0 && (
                  <span className="rounded-md bg-blue-900/60 px-2 py-0.5 text-xs font-medium text-blue-300">
                    Mini files only
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Link
                    href={getPath("dashboardBackups", locale)}
                    className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <FileArchive className="h-4 w-4" /> Cloud
                  </Link>
                  {selected && !selected.archived && (
                    <button
                      type="button"
                      onClick={() => patchServer(selectedId!, { archived: true })}
                      disabled={patchingId === selectedId}
                      className="text-zinc-400 hover:text-amber-400 text-sm inline-flex items-center gap-1 disabled:opacity-50"
                      title="Archive server"
                    >
                      <Archive className="h-4 w-4" /> Archive
                    </button>
                  )}
                  {selected && selected.archived && (
                    <button
                      type="button"
                      onClick={() => patchServer(selectedId!, { archived: false })}
                      disabled={patchingId === selectedId}
                      className="text-zinc-400 hover:text-emerald-400 text-sm inline-flex items-center gap-1 disabled:opacity-50"
                      title="Restore to active"
                    >
                      <ArchiveRestore className="h-4 w-4" /> Restore
                    </button>
                  )}
                  {selected && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm("Move this server to trash? Its backups will move to trash. Restore or permanently delete from Cloud → Trash.")) return;
                        patchServer(selectedId!, { trashed: true });
                      }}
                      disabled={patchingId === selectedId}
                      className="text-zinc-400 hover:text-red-400 disabled:opacity-50"
                      title="Move to trash"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => loadServerData(selectedId)} className="text-zinc-400 hover:text-white" aria-label="Refresh">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {summary && (
                <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mt-2">
                  <span>{summary.syncedFiles.totalFiles} files synced</span>
                  <span>{formatSize(summary.syncedFiles.totalBytes)} total</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> {summary.syncedFiles.mini} mini ({formatSize(summary.syncedFiles.miniBytes)})
                  </span>
                  {summary.syncedFiles.big > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> {summary.syncedFiles.big} big ({formatSize(summary.syncedFiles.bigBytes)})
                    </span>
                  )}
                </div>
              )}
              {summary && summary.syncedFiles.totalBytes > 0 && (
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex mt-3">
                  <div className="bg-emerald-500" style={{ width: `${(summary.syncedFiles.miniBytes / Math.max(summary.syncedFiles.totalBytes, 1)) * 100}%` }} />
                  <div className="bg-amber-500" style={{ width: `${(summary.syncedFiles.bigBytes / Math.max(summary.syncedFiles.totalBytes, 1)) * 100}%` }} />
                </div>
              )}
              {summary && summary.manifests && summary.manifests.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Manifest (what we know about this server)
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {summary.manifests.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-md bg-zinc-800/80 px-2.5 py-1.5 text-xs text-zinc-300"
                        title={`${m.fileCount} files, ${formatSize(m.totalBytes)} · ${new Date(m.createdAt).toLocaleString()}`}
                      >
                        <span className="font-medium text-zinc-200">{m.manifestType}</span>
                        <span className="text-zinc-500 ml-1.5">{m.fileCount} files · {formatSize(m.totalBytes)}</span>
                        <span className="text-zinc-600 ml-1">· {new Date(m.createdAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary && summary.syncedFiles.bigBytes === 0 && selected.backupCount === 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800 rounded-lg bg-blue-900/30 border border-blue-800/50 px-4 py-3">
                  <p className="text-sm font-medium text-blue-200 flex items-center gap-2 mb-1">
                    <Info className="h-4 w-4" aria-hidden />
                    How to get full server data
                  </p>
                  <p className="text-xs text-blue-200/90">
                    Only mini files are synced here (configs, structure, mod/plugin names). Full server data (worlds, large files) is not uploaded yet. To get everything: (1) Use the iHost app to run a full backup and upload, or (2) go to <Link href={getPath("dashboardBackups", locale)} className="underline hover:text-blue-100">Cloud</Link> and upload a zip from your server. Full backups count toward your storage at {DOMAINS.cloud}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* File browser */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Synced files ({files.length})</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto p-2">
                {files.length === 0 ? (
                  <p className="text-sm text-zinc-500 p-3">No files synced yet.</p>
                ) : (
                  tree.map((n) => <TreeRow key={n.path} node={n} depth={0} onView={viewFile} />)
                )}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium truncate">
                  {fileContent ? fileContent.path : "Select a file to view"}
                </span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {fileContent ? (
                  <pre className="p-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all">
                    {fileContent.content}
                  </pre>
                ) : (
                  <div className="p-8 text-center text-zinc-600">
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">Click a file in the tree to view its content</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
