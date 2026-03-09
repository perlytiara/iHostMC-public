"use client";

import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, ChevronUp, File, Folder, FolderOpen, Package, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BackupManifest, ManifestModEntry } from "@/lib/api-client";
import { buildManifestTree, type ManifestTreeNode } from "../utils/backup-manifest";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const STORAGE_COLORS = {
  small: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  big: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  reference: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
} as const;

function FileListColumn({
  files,
  title,
  count,
  totalBytes,
  accentClass,
  t,
  syncedFilePaths,
  failedFilePaths,
  formatBytes,
}: {
  files: { path: string; sizeBytes: number }[];
  title: string;
  count: number;
  totalBytes: number;
  accentClass: string;
  t: (key: string) => string;
  syncedFilePaths?: Set<string>;
  failedFilePaths?: Map<string, string>;
  formatBytes: (b: number) => string;
}) {
  return (
    <div className={cn("rounded-xl border overflow-hidden flex flex-col min-w-0", accentClass)}>
      <p className="text-xs font-medium text-foreground px-3 py-2 border-b border-current/20 truncate">
        {title} ({count}) · {formatBytes(totalBytes)}
      </p>
      <ul className="max-h-[200px] overflow-y-auto p-2 space-y-1 text-xs flex-1">
        {files.length === 0 ? (
          <li className="text-muted-foreground">{t("servers.noFiles")}</li>
        ) : (
          files.map((f) => (
            <li key={f.path} className="flex flex-wrap items-baseline gap-2 font-mono">
              <span className="truncate min-w-0 flex-1" title={f.path}>
                {f.path}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
              {syncedFilePaths?.has(f.path) ? (
                <span className="shrink-0 text-emerald-600 dark:text-emerald-400 text-[10px]">synced</span>
              ) : failedFilePaths?.get(f.path) ? (
                <span className="shrink-0 text-destructive text-[10px]">failed</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  t,
  syncedFilePaths,
  failedFilePaths,
}: {
  node: ManifestTreeNode;
  depth: number;
  t: (key: string) => string;
  syncedFilePaths?: Set<string>;
  failedFilePaths?: Map<string, string>;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isDir = node.isDir;
  const isSynced = !isDir && syncedFilePaths?.has(node.path);
  // Only show "failed" if file is not on server (synced wins – server is source of truth)
  const failErr = !isDir && !isSynced && failedFilePaths?.get(node.path);

  return (
    <div className="select-none">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 w-full rounded px-1.5 py-0.5 text-left text-xs hover:bg-muted/50",
          depth > 0 && "ml-4"
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => isDir && setOpen((o) => !o)}
      >
        {isDir ? (
          <span className="shrink-0 text-muted-foreground">
            {open ? (
              <ChevronRight className="h-3.5 w-3.5 rotate-90" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isDir ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate font-mono text-foreground">{node.name}</span>
        {!isDir && (
          <>
            {node.category && (
              <span className="shrink-0 text-[10px] text-muted-foreground uppercase">[{node.category}]</span>
            )}
            {node.tag && (
              <span
                className={cn(
                  "shrink-0 text-[10px] px-1 rounded",
                  node.tag === "must" && "bg-emerald-900/50 text-emerald-300",
                  node.tag === "mini" && "bg-blue-900/50 text-blue-300",
                  node.tag === "big" && "bg-amber-900/50 text-amber-300",
                  node.tag === "cache" && "bg-zinc-700/50 text-zinc-400"
                )}
              >
                {node.tag}
              </span>
            )}
            <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px]", STORAGE_COLORS[node.storage])}>
              {node.storage}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(node.sizeBytes)}</span>
            {isSynced && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400" title={t("servers.syncedToWebsite")}>
                <CheckCircle className="h-3 w-3" />
                synced
              </span>
            )}
            {failErr && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-destructive" title={failErr}>
                <XCircle className="h-3 w-3" />
                failed
              </span>
            )}
          </>
        )}
      </button>
      {isDir && open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              t={t}
              syncedFilePaths={syncedFilePaths}
              failedFilePaths={failedFilePaths}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModPluginList({
  items,
  title,
  t,
}: {
  items: ManifestModEntry[];
  title: string;
  t: (key: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5" />
        {title}
      </p>
      <ul className="space-y-1 text-xs">
        {items.slice(0, 30).map((m) => (
          <li
            key={m.path}
            className="flex flex-wrap items-center gap-2 rounded bg-muted/30 px-2 py-1"
          >
            <span className="font-mono truncate max-w-[160px]" title={m.path}>
              {m.name}
            </span>
            <span className={cn("rounded px-1 py-0.5 text-[10px]", STORAGE_COLORS[m.storage])}>
              {m.storage}
            </span>
            <span className="text-muted-foreground">{formatBytes(m.sizeBytes)}</span>
          </li>
        ))}
        {items.length > 30 && (
          <li className="text-muted-foreground px-2">{t("servers.moreOnWebsite")}</li>
        )}
      </ul>
    </div>
  );
}

export interface BackupManifestViewProps {
  manifest: BackupManifest;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Paths that are synced to cloud (from GET sync files). Enables "synced" badge in file tree. */
  syncedFilePaths?: Set<string>;
  /** Path -> error for files that failed to upload. Enables "failed" badge in file tree. */
  failedFilePaths?: Map<string, string>;
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

export function BackupManifestView({ manifest, t, syncedFilePaths, failedFilePaths }: BackupManifestViewProps) {
  const [treeOpen, setTreeOpen] = useState(false);
  const tree = buildManifestTree(manifest.files);
  const { summary } = manifest;
  const total = summary.totalBytes || 1;
  const smallPct = total > 0 ? (summary.smallBytes / total) * 100 : 0;
  const bigPct = total > 0 ? (summary.bigBytes / total) * 100 : 0;

  const byTag = {
    must: summary.mustCount ?? 0,
    mini: summary.smallCount ?? 0,
    big: summary.bigCount ?? 0,
    cache: summary.cacheCount ?? 0,
  };
  const tagTotal = byTag.must + byTag.mini + byTag.big + byTag.cache;
  const byCategory = manifest.files
    .filter((f) => !f.isDir && f.category)
    .reduce<Record<string, number>>((acc, f) => {
      const c = f.category!;
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  const categoryTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);

  const smallFiles = manifest.files
    .filter((f) => !f.isDir && f.storage === "small")
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }));
  const bigFiles = manifest.files
    .filter((f) => !f.isDir && f.storage === "big")
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }));

  const modsCount = manifest.mods.length;
  const pluginsCount = manifest.plugins.length;
  const totalFiles = summary.smallCount + summary.bigCount;

  const notSyncedPaths = syncedFilePaths
    ? manifest.files
        .filter((f) => !f.isDir && !syncedFilePaths.has(f.path))
        .map((f) => f.path)
        .sort((a, b) => a.localeCompare(b))
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* One compact stats line: manifest available, files, mods, plugins */}
      <p className="text-[11px] text-muted-foreground">
        {formatBytes(summary.smallBytes)} {t("servers.storageSmall")} · {formatBytes(summary.bigBytes)}{" "}
        {t("servers.storageBig")} · {totalFiles} {t("servers.filesTotal")}
        {modsCount + pluginsCount > 0 && ` · ${modsCount} mods, ${pluginsCount} plugins`}
      </p>

      {/* Single bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
        {smallPct > 0 && (
          <div
            className="bg-emerald-500 dark:bg-emerald-400 transition-all"
            style={{ width: `${smallPct}%` }}
            title={`${t("servers.storageSmall")}: ${formatBytes(summary.smallBytes)}`}
          />
        )}
        {bigPct > 0 && (
          <div
            className="bg-amber-500 dark:bg-amber-400 transition-all"
            style={{ width: `${bigPct}%` }}
            title={`${t("servers.storageBig")}: ${formatBytes(summary.bigBytes)}`}
          />
        )}
      </div>

      {/* By tag & By category (like website) */}
      {(tagTotal > 0 || categoryTotal > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <p className="font-medium text-foreground mb-1.5">By tag</p>
            <div className="flex flex-wrap gap-2">
              {byTag.must > 0 && <span className="rounded px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300">must {byTag.must}</span>}
              {byTag.mini > 0 && <span className="rounded px-1.5 py-0.5 bg-blue-900/50 text-blue-300">mini {byTag.mini}</span>}
              {byTag.big > 0 && <span className="rounded px-1.5 py-0.5 bg-amber-900/50 text-amber-300">big {byTag.big}</span>}
              {byTag.cache > 0 && <span className="rounded px-1.5 py-0.5 bg-zinc-700/50 text-zinc-400">cache {byTag.cache}</span>}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <p className="font-medium text-foreground mb-1.5">By category</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byCategory).map(([key, count]) => (
                <span key={key} className="rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                  {CATEGORY_LABELS[key] ?? key} {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Not synced (referenced) — files in manifest but not yet uploaded */}
      {notSyncedPaths.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1">
            {t("servers.notSyncedReferenced", { defaultValue: "Not synced (referenced)" })} — {notSyncedPaths.length} file{notSyncedPaths.length !== 1 ? "s" : ""} in manifest, not yet uploaded
          </p>
          <ul className="max-h-20 overflow-y-auto space-y-0.5 text-[11px] font-mono text-muted-foreground">
            {notSyncedPaths.slice(0, 30).map((path) => (
              <li key={path} className="truncate" title={path}>
                {path}
              </li>
            ))}
            {notSyncedPaths.length > 30 && (
              <li className="text-muted-foreground/80">…+{notSyncedPaths.length - 30} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Two columns: Small files | Big files */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FileListColumn
          files={smallFiles}
          title={t("servers.smallFilesList", { defaultValue: "Small files" })}
          count={summary.smallCount}
          totalBytes={summary.smallBytes}
          accentClass="border-emerald-500/30 bg-emerald-500/5"
          t={t}
          syncedFilePaths={syncedFilePaths}
          failedFilePaths={failedFilePaths}
          formatBytes={formatBytes}
        />
        <FileListColumn
          files={bigFiles}
          title={t("servers.bigFilesList", { defaultValue: "Big files" })}
          count={summary.bigCount}
          totalBytes={summary.bigBytes}
          accentClass="border-amber-500/30 bg-amber-500/5"
          t={t}
          syncedFilePaths={syncedFilePaths}
          failedFilePaths={failedFilePaths}
          formatBytes={formatBytes}
        />
      </div>

      {/* Mods & plugins: compact grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ModPluginList items={manifest.mods} title={t("servers.modsList")} t={t} />
        <ModPluginList items={manifest.plugins} title={t("servers.pluginsList")} t={t} />
      </div>

      {/* Collapsible file tree */}
      {tree.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setTreeOpen((o) => !o)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 border-b border-border"
          >
            {treeOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {t("servers.fileTree")}
          </button>
          {treeOpen && (
            <div className="max-h-[220px] overflow-y-auto p-2">
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  t={t}
                  syncedFilePaths={syncedFilePaths}
                  failedFilePaths={failedFilePaths}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
