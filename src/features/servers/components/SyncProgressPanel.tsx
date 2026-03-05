"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, ChevronDown, Loader2, RefreshCw, SkipForward, Upload, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileSyncProgress } from "../hooks/useSyncFiles";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function shortenError(err: string | undefined): string {
  if (!err) return "";
  if (err.includes("413")) return "Too large";
  if (err.startsWith("HTTP ")) return err.split("\n")[0].trim().slice(0, 80);
  return err.length > 80 ? err.slice(0, 77) + "..." : err;
}

const STATUS_ICON = {
  pending: <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />,
  scanning: <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />,
  uploading: <Upload className="h-4 w-4 animate-pulse text-blue-500 shrink-0" />,
  done: <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />,
  skipped: <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />,
  failed: <XCircle className="h-4 w-4 text-destructive shrink-0" />,
} as const;

function formatLastSync(iso: string): string {
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return d.toLocaleDateString();
}

export type FileMetaMap = Map<string, { sizeBytes: number; storage: "small" | "big" }>;

interface SyncProgressPanelProps {
  progress: FileSyncProgress[];
  current: number;
  total: number;
  syncing: boolean;
  lastSyncCompletedAt?: string | null;
  /** Optional: path -> size + small/big for log labels */
  fileMeta?: FileMetaMap | null;
  /** Optional: short legend explaining synced / unchanged / failed (for i18n) */
  legendText?: string;
  /** Optional: hint when there are failures (for i18n) */
  failedHintText?: string;
}

export function SyncProgressPanel({
  progress,
  current,
  total,
  syncing,
  lastSyncCompletedAt,
  fileMeta,
  legendText,
  failedHintText,
}: SyncProgressPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const doneCount = progress.filter((p) => p.status === "done").length;
  const skippedCount = progress.filter((p) => p.status === "skipped").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  // Auto-scroll to bottom when progress updates and user hasn't scrolled up
  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    const el = logRef.current;
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [progress.length, current, autoScroll]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const el = logRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  };

  const scrollToBottom = () => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
    setAutoScroll(true);
  };

  if (!syncing && progress.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2 min-w-0">
          {syncing ? (
            <span className="flex items-center gap-2 shrink-0">
              <RefreshCw className="h-4 w-4 text-primary animate-spin-slow" aria-hidden />
              <span>Syncing…</span>
            </span>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              <span>Sync complete</span>
            </>
          )}
        </p>
        <span className="text-xs text-muted-foreground shrink-0">
          {current}/{total} · {doneCount} synced · {skippedCount} unchanged
          {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
          {!syncing && lastSyncCompletedAt && ` · ${formatLastSync(lastSyncCompletedAt)}`}
        </span>
      </div>
      {progress.length > 0 && legendText && (
        <p className="text-[11px] text-muted-foreground" title={legendText}>
          {legendText}
        </p>
      )}
      {failedCount > 0 && failedHintText && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="alert">
          {failedHintText}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 min-w-0 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {syncing && total > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground w-8 shrink-0">{pct}%</span>
        )}
      </div>

      {/* Single log: when syncing, give more vertical space so live progress is visible */}
      <div className="relative">
        <div
          ref={logRef}
          onScroll={handleScroll}
          className={cn(
            "overflow-y-auto overflow-x-hidden space-y-0.5 pr-8 rounded border border-border/50 bg-muted/20 p-2 font-mono text-xs",
            syncing ? "min-h-[220px] max-h-[380px]" : "max-h-[200px]"
          )}
        >
          {progress.map((p) => {
            const meta = fileMeta?.get(p.filePath);
            const tier = meta?.storage ?? null;
            const sizeStr = meta ? formatBytes(meta.sizeBytes) : null;
            return (
              <div
                key={p.filePath}
                className="flex items-center gap-2 py-0.5 flex-nowrap overflow-x-auto overflow-y-hidden min-w-0 w-full"
                title={p.filePath}
              >
                {sizeStr && <span className="shrink-0 text-muted-foreground tabular-nums w-14 whitespace-nowrap">{sizeStr}</span>}
                {STATUS_ICON[p.status]}
                <span className="shrink-0 whitespace-nowrap min-w-[80px]">{p.filePath}</span>
                {tier && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[10px] whitespace-nowrap",
                      tier === "small"
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {tier}
                  </span>
                )}
                {p.error && (
                  <span className="shrink-0 text-destructive ml-1 whitespace-nowrap" title={p.error}>
                    {shortenError(p.error)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!autoScroll && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute right-2 bottom-2 rounded-md bg-primary/90 text-primary-foreground p-1.5 shadow hover:bg-primary"
            title="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
