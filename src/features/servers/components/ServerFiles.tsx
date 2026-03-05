"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, FileText, Save, ChevronRight, Folder } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface ServerFileEntry {
  name: string;
  is_dir: boolean;
  path: string;
}

interface ServerFilesProps {
  serverId: string;
  visible: boolean;
  onClose?: () => void;
}

export function ServerFiles({ serverId, visible, onClose }: ServerFilesProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<ServerFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(
    async (subpath: string) => {
      if (!serverId) return;
      setError(null);
      try {
        const list = await invoke<ServerFileEntry[]>("list_server_files", {
          serverId,
          subpath: subpath || undefined,
        });
        setEntries(list);
        setCurrentPath(subpath);
        setSelectedPath(null);
        setContent("");
      } catch (e) {
        setError(String(e));
      }
    },
    [serverId]
  );

  useEffect(() => {
    if (visible && serverId) {
      loadDir("");
    }
  }, [visible, serverId, loadDir]);

  const openEntry = useCallback(
    async (entry: ServerFileEntry) => {
      if (entry.is_dir) {
        const next = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        loadDir(next);
      } else {
        setError(null);
        try {
          const text = await invoke<string>("read_server_file", {
            serverId,
            path: entry.path,
          });
          setContent(text);
          setSelectedPath(entry.path);
        } catch (e) {
          setError("Cannot read file (binary or not found)");
        }
      }
    },
    [serverId, currentPath, loadDir]
  );

  const saveFile = useCallback(async () => {
    if (!selectedPath || !serverId) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("write_server_file", {
        serverId,
        path: selectedPath,
        content,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [serverId, selectedPath, content]);

  const openInExplorer = useCallback(async () => {
    try {
      await invoke("open_server_folder", { serverId });
    } catch (e) {
      setError(String(e));
    }
  }, [serverId]);

  if (!visible) return null;

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Server files</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openInExplorer}>
            <FolderOpen className="mr-1 h-4 w-4" />
            Open folder
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-1 min-h-0 gap-4">
        <div className="flex w-64 flex-col gap-1 overflow-y-auto rounded border border-border bg-muted/30 p-2">
          {currentPath && (
            <button
              type="button"
              className="flex items-center gap-1 text-left text-sm text-muted-foreground hover:underline"
              onClick={() => {
                const up = currentPath.includes("/")
                  ? currentPath.replace(/\/[^/]+$/, "")
                  : "";
                loadDir(up);
              }}
            >
              <ChevronRight className="h-4 w-4 rotate-[-90deg]" />
              ..
            </button>
          )}
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${selectedPath === entry.path ? "bg-accent" : "hover:bg-muted"}`}
              onClick={() => openEntry(entry)}
            >
              {entry.is_dir ? (
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate">{entry.name}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          {selectedPath && (
            <>
              <div className="flex items-center justify-between">
                <span className="truncate text-sm text-muted-foreground">{selectedPath}</span>
                <Button size="sm" disabled={saving} onClick={saveFile}>
                  <Save className="mr-1 h-4 w-4" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
              <textarea
                className="flex-1 min-h-[200px] w-full resize-none rounded border border-input bg-background p-2 font-mono text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
            </>
          )}
          {!selectedPath && (
            <p className="text-sm text-muted-foreground">
              Select a file to view or edit. Text files only.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
