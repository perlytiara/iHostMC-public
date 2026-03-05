"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Server, Folder, FileText, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ServerOption {
  id: string;
  name: string;
}

export interface FileOption {
  name: string;
  path: string;
  is_dir: boolean;
}

export type MentionMenuMode = "servers" | "files";

export interface AdvisorMentionMenuProps {
  open: boolean;
  query: string;
  mode: MentionMenuMode;
  servers: ServerOption[];
  selectedServer: { id: string; name: string } | null;
  fileEntries: FileOption[];
  selectedIndex: number;
  anchorRect: DOMRect | null;
  /** Pixel offset from left of input to the @ character (for positioning menu under @) */
  anchorXOffset?: number;
  onSelectServer: (server: ServerOption) => void;
  onBrowseServerFiles?: (server: ServerOption) => void;
  onSelectPath: (serverId: string, path: string) => void;
  onBack: () => void;
  onClose: () => void;
  onHoverIndex: (index: number) => void;
  /** Total number of selectable items in current view (servers or files + back) */
  itemCount: number;
  /** Whether we are in Tauri and can list server files */
  canListFiles: boolean;
}

export function AdvisorMentionMenu({
  open,
  query,
  mode,
  servers,
  selectedServer,
  fileEntries,
  selectedIndex,
  anchorRect,
  onSelectServer,
  onBrowseServerFiles,
  onSelectPath,
  onBack,
  onClose,
  onHoverIndex,
  itemCount,
  canListFiles,
  anchorXOffset = 0,
}: AdvisorMentionMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || itemCount === 0) return;
    const el = listRef.current;
    if (!el) return;
    const child = el.children[selectedIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, selectedIndex, itemCount]);

  if (!open || !anchorRect) return null;

  const filteredServers = query.trim()
    ? servers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : servers;
  const filteredFiles = query.trim()
    ? fileEntries.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : fileEntries;

  const inFilesMode = mode === "files" && selectedServer;
  const items = inFilesMode
    ? [{ back: true as const }, ...filteredFiles]
    : filteredServers;
  const totalItems = items.length;

  const menuWidth = 320;
  const leftFromAt = anchorRect.left + anchorXOffset;
  const left = Math.max(8, leftFromAt);
  const bottom = typeof window !== "undefined" ? window.innerHeight - anchorRect.top + 8 : anchorRect.height + 8;

  const menu = (
    <div
      className={cn(
        "fixed min-w-[200px] max-w-[min(320px,90vw)] max-h-[280px] overflow-hidden",
        "rounded-xl border border-border bg-popover text-popover-foreground shadow-xl",
        "flex flex-col"
      )}
      style={{
        left: `${left}px`,
        bottom: `${bottom}px`,
        zIndex: 9999,
      }}
    >
      {/* Fine print at top */}
      <div className="shrink-0 border-b border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
        {inFilesMode ? "Pick a file or folder to reference" : "Type to search • Enter to select"}
      </div>
      {inFilesMode && selectedServer && (
        <div className="shrink-0 border-b border-border/60 px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Server className="h-3.5 w-3.5" />
          {selectedServer.name}
        </div>
      )}
      <div
        ref={listRef}
        className={cn(
          "overflow-y-auto py-1 max-h-[220px] flex flex-col-reverse",
          "min-h-0"
        )}
        role="listbox"
        aria-label="Mention server or file"
      >
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {inFilesMode ? "No files match" : "No servers match"}
          </div>
        ) : (
          items.map((item, index) => {
            if ("back" in item && item.back) {
              const idx = 0;
              return (
                <button
                  key="back"
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === idx}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg mx-1",
                    selectedIndex === idx
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                  )}
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={onBack}
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  Back to servers
                </button>
              );
            }
            if (inFilesMode && "path" in item) {
              const fileItem = item as FileOption;
              const idx = index;
              const Icon = fileItem.is_dir ? Folder : FileText;
              return (
                <button
                  key={fileItem.path}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === idx}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg mx-1",
                    selectedIndex === idx
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                  )}
                  onMouseEnter={() => onHoverIndex(idx)}
                  onClick={() => selectedServer && onSelectPath(selectedServer.id, fileItem.path)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{fileItem.name}</span>
                </button>
              );
            }
            if (!inFilesMode && "id" in item) {
              const serverItem = item as ServerOption;
              const idx = index;
              return (
                <div
                  key={serverItem.id}
                  role="option"
                  aria-selected={selectedIndex === idx}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-lg mx-1 cursor-pointer",
                    selectedIndex === idx
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                  )}
                  onMouseEnter={() => onHoverIndex(idx)}
                >
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2 min-w-0 text-left"
                    onClick={() => onSelectServer(serverItem)}
                  >
                    <Server className="h-4 w-4 shrink-0" />
                    <span className="truncate">{serverItem.name}</span>
                  </button>
                  {canListFiles && onBrowseServerFiles && (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBrowseServerFiles(serverItem);
                      }}
                    >
                      Browse files
                    </button>
                  )}
                </div>
              );
            }
            return null;
          })
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(menu, document.body) : menu;
}
