"use client";

import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export type UpdatePhase = "idle" | "downloading" | "installing" | "restarting" | "error";

interface UpdateFloatingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  update: UpdateInfo;
  onInstall: () => void;
  onLater: () => void;
  isDownloading: boolean;
  progress: { downloaded: number; total: number } | null;
  phase: UpdatePhase;
  error: string | null;
  onRetry: () => void;
  showDebug?: boolean;
}

/** Subtle Discord-like animated progress ring (SVG) - no raw percentage */
function UpdateProgressRing({
  progress,
  phase,
  className,
}: {
  progress: { downloaded: number; total: number } | null;
  phase: UpdatePhase;
  className?: string;
}) {
  const circumference = 2 * Math.PI * 20;
  const percent =
    progress && progress.total > 0
      ? Math.min(0.98, progress.downloaded / progress.total)
      : phase === "installing" || phase === "restarting"
        ? 1
        : null;
  const indeterminate = percent == null && phase === "downloading";
  const dash = indeterminate ? 40 : (percent ?? 0) * circumference;

  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("h-12 w-12 text-primary shrink-0", className)}
      aria-hidden
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={0}
        transform="rotate(-90 24 24)"
        className={cn(
          "transition-[stroke-dasharray] duration-300 ease-out",
          indeterminate && "animate-pulse"
        )}
      />
    </svg>
  );
}

/** Suggestive progress bar - no percentage text */
function SuggestiveProgressBar({
  progress,
  phase,
}: {
  progress: { downloaded: number; total: number } | null;
  phase: UpdatePhase;
}) {
  const percent =
    progress && progress.total > 0
      ? Math.min(1, progress.downloaded / progress.total)
      : phase === "installing" || phase === "restarting"
        ? 1
        : null;
  const indeterminate = percent == null && phase === "downloading";

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
      <motion.div
        className="h-full rounded-full bg-primary/80"
        initial={false}
        animate={{
          width: indeterminate ? ["25%", "45%", "25%"] : `${(percent ?? 0) * 100}%`,
        }}
        transition={
          indeterminate
            ? { width: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } }
            : { width: { duration: 0.4, ease: "easeOut" } }
        }
      />
    </div>
  );
}

/** Position from bottom-right (0,0 = bottom-right corner) */
const PANEL_DEFAULT_POS = { right: 24, bottom: 24 };
const STORAGE_KEY = "ihostmc-update-panel-pos";

function loadPosition(): { right: number; bottom: number } {
  if (typeof window === "undefined") return PANEL_DEFAULT_POS;
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      if (typeof p?.right === "number" && typeof p?.bottom === "number")
        return { right: Math.max(0, p.right), bottom: Math.max(0, p.bottom) };
    }
  } catch {}
  return PANEL_DEFAULT_POS;
}

function savePosition(right: number, bottom: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ right, bottom }));
  } catch {}
}

export function UpdateFloatingPanel({
  open,
  onOpenChange,
  update,
  onInstall,
  onLater,
  isDownloading,
  progress,
  phase,
  error,
  onRetry,
  showDebug = false,
}: UpdateFloatingPanelProps) {
  const { t } = useTranslation();
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState(loadPosition);
  const dragRef = useRef<{ startX: number; startY: number; elRight: number; elBottom: number } | null>(null);

  const handleLater = useCallback(() => {
    if (isDownloading) return;
    onLater();
    onOpenChange(false);
  }, [isDownloading, onLater, onOpenChange]);

  const canClose = !isDownloading && (phase === "idle" || phase === "error");

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        elRight: pos.right,
        elBottom: pos.bottom,
      };
    },
    [pos]
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = dragRef.current.startX - e.clientX; // drag right = decrease right
    const dy = e.clientY - dragRef.current.startY; // drag down = decrease bottom
    const nr = Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.elRight + dx));
    const nb = Math.max(0, Math.min(window.innerHeight - 120, dragRef.current.elBottom - dy));
    setPos({ right: nr, bottom: nb });
  }, []);

  const onDragEnd = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (dragRef.current) {
        savePosition(pos.right, pos.bottom);
        dragRef.current = null;
      }
    },
    [pos]
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label={t("updateDialog.title")}
        initial={{ opacity: 0, scale: 0.9, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed z-[90]"
        style={{
          right: pos.right,
          bottom: pos.bottom,
        }}
      >
        {minimized ? (
          /* Minimized bar */
          <motion.div
            layout
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-2.5",
              "cursor-grab active:cursor-grabbing select-none"
            )}
          >
            <UpdateProgressRing progress={progress} phase={phase} className="h-8 w-8 shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-medium truncate">
                {phase === "error"
                  ? t("updateDialog.errorTitle")
                  : t("updateDialog.downloading")}
              </span>
              <SuggestiveProgressBar progress={progress} phase={phase} />
            </div>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="shrink-0 p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label={t("common.expand", { defaultValue: "Expand" })}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </motion.div>
        ) : (
          /* Expanded card */
          <motion.div
            layout
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            className={cn(
              "w-[300px] rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden",
              "cursor-grab active:cursor-grabbing select-none"
            )}
          >
            {/* Header - draggable */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30"
              data-tauri-drag-region
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <UpdateProgressRing progress={progress} phase={phase} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {phase === "error"
                      ? t("updateDialog.errorTitle")
                      : phase === "restarting"
                        ? t("updateDialog.restarting")
                        : phase === "installing"
                          ? t("updateDialog.installing")
                          : isDownloading
                            ? t("updateDialog.downloading")
                            : t("updateDialog.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">v{update.version}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isDownloading && (
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"
                    aria-label={t("common.minimize", { defaultValue: "Minimize" })}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
                {canClose && (
                  <button
                    type="button"
                    onClick={handleLater}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"
                    aria-label={t("common.close")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {phase === "error" && error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {(isDownloading || phase === "installing" || phase === "restarting") && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {phase === "restarting"
                      ? t("updateDialog.restartingDesc")
                      : phase === "installing"
                        ? t("updateDialog.installingDesc")
                        : t("updateDialog.downloadingDesc", { version: update.version })}
                  </p>
                  <SuggestiveProgressBar progress={progress} phase={phase} />
                </div>
              )}

              {!isDownloading && phase === "idle" && (
                <>
                  {update.body?.trim() && (
                    <div
                      className="max-h-20 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: update.body.replace(/\n/g, "<br />") }}
                    />
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={onInstall}
                      className="flex-1 gap-2"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("updateDialog.updateNow")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleLater}
                    >
                      {t("updateDialog.later")}
                    </Button>
                  </div>
                </>
              )}

              {phase === "error" && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={onRetry} className="flex-1 gap-2">
                    <Download className="h-3.5 w-3.5" />
                    {t("updateDialog.retry")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={handleLater}>
                    {t("updateDialog.later")}
                  </Button>
                </div>
              )}
            </div>

            {showDebug && (
              <div className="px-4 py-2 border-t border-border text-[10px] font-mono text-muted-foreground">
                {phase} · {progress ? `${progress.downloaded}/${progress.total}` : "—"}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
