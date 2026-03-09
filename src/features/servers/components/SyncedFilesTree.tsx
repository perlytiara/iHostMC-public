"use client";

import { useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Shield, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncFileInfo } from "@/lib/api-client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  storageTier: "mini" | "big";
  encrypted: boolean;
  syncedAt: string;
  children: TreeNode[];
  fileId?: string;
}

function buildTree(files: SyncFileInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();

  const sorted = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const f of sorted) {
    const parts = f.filePath.split("/");

    // Create intermediate directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!byPath.has(dirPath)) {
        const dirNode: TreeNode = {
          name: parts[i]!,
          path: dirPath,
          isDir: true,
          sizeBytes: 0,
          storageTier: "mini",
          encrypted: false,
          syncedAt: "",
          children: [],
        };
        byPath.set(dirPath, dirNode);

        if (i === 0) {
          root.push(dirNode);
        } else {
          const parentPath = parts.slice(0, i).join("/");
          const parent = byPath.get(parentPath);
          if (parent) parent.children.push(dirNode);
        }
      }
    }

    const fileNode: TreeNode = {
      name: parts[parts.length - 1]!,
      path: f.filePath,
      isDir: false,
      sizeBytes: f.sizeBytes,
      storageTier: f.storageTier,
      encrypted: f.encrypted,
      syncedAt: f.syncedAt,
      children: [],
      fileId: f.id,
    };
    byPath.set(f.filePath, fileNode);

    if (parts.length === 1) {
      root.push(fileNode);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = byPath.get(parentPath);
      if (parent) parent.children.push(fileNode);
      else root.push(fileNode);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function TreeNodeRow({
  node,
  depth,
  onFileClick,
}: {
  node: TreeNode;
  depth: number;
  onFileClick?: (fileId: string, filePath: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);

  return (
    <div className="select-none">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 w-full rounded px-1.5 py-0.5 text-left text-xs hover:bg-muted/50",
        )}
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => {
          if (node.isDir) setOpen((o) => !o);
          else if (node.fileId && onFileClick) onFileClick(node.fileId, node.path);
        }}
      >
        {node.isDir ? (
          <span className="shrink-0 text-muted-foreground">
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {node.isDir ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="min-w-0 truncate font-mono text-foreground">{node.name}</span>

        {!node.isDir && (
          <>
            <span className={cn(
              "shrink-0 rounded px-1 py-0.5 text-[10px]",
              node.storageTier === "mini"
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                : "text-amber-600 dark:text-amber-400 bg-amber-500/10"
            )}>
              {node.storageTier}
            </span>
            <span className="shrink-0 text-muted-foreground text-[11px]">{formatBytes(node.sizeBytes)}</span>
            {node.encrypted && <Lock className="h-3 w-3 shrink-0 text-blue-500/70" />}
          </>
        )}
      </button>

      {node.isDir && open && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SyncedFilesTreeProps {
  files: SyncFileInfo[];
  onFileClick?: (fileId: string, filePath: string) => void;
}

export function SyncedFilesTree({ files, onFileClick }: SyncedFilesTreeProps) {
  const tree = buildTree(files);

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="text-xs text-muted-foreground">No files synced yet. Click "Sync Files" to start.</p>
      </div>
    );
  }

  const miniCount = files.filter((f) => f.storageTier === "mini").length;
  const bigCount = files.filter((f) => f.storageTier === "big").length;
  const totalSize = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Synced files ({files.length})
        </p>
        <span className="text-[11px] text-muted-foreground">
          {miniCount} mini · {bigCount} big · {formatBytes(totalSize)}
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2">
        {tree.map((node) => (
          <TreeNodeRow key={node.path} node={node} depth={0} onFileClick={onFileClick} />
        ))}
      </div>
    </div>
  );
}
