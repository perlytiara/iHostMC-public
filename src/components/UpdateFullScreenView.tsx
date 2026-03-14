"use client";

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { APP_VERSION } from "@/lib/version.generated";
import { cn } from "@/lib/utils";

const UPDATER_DEBUG_KEY = "ihostmc-updater-debug";

export type UpdatePhase = "downloading" | "installing" | "restarting";

interface UpdateFullScreenViewProps {
  phase: UpdatePhase;
  version: string;
  progress: { downloaded: number; total: number } | null;
  showDebug: boolean;
}

function getPhaseLabel(phase: UpdatePhase): string {
  switch (phase) {
    case "downloading":
      return "updateDialog.downloading";
    case "installing":
      return "updateDialog.installing";
    case "restarting":
      return "updateDialog.restarting";
    default:
      return "updateDialog.downloading";
  }
}

function getPhaseDescription(phase: UpdatePhase, version: string, t: (key: string, opts?: object) => string): string {
  switch (phase) {
    case "downloading":
      return t("updateDialog.downloadingDesc", { version });
    case "installing":
      return t("updateDialog.installingDesc");
    case "restarting":
      return t("updateDialog.restartingDesc");
    default:
      return t("updateDialog.downloadingDesc", { version });
  }
}

export function UpdateFullScreenView({
  phase,
  version,
  progress,
  showDebug,
}: UpdateFullScreenViewProps) {
  const { t } = useTranslation();

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : phase === "installing" || phase === "restarting"
        ? 100
        : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6",
        "bg-background text-foreground"
      )}
      aria-busy="true"
      aria-live="polite"
      role="status"
      aria-label={t(getPhaseLabel(phase))}
    >
      <div className="flex flex-col items-center gap-6 max-w-md w-full px-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Loader2 className="h-9 w-9 text-primary animate-spin" />
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {t(getPhaseLabel(phase))}
          </h1>
          <p className="text-sm text-muted-foreground">
            {getPhaseDescription(phase, version, t)}
          </p>
        </div>

        <div className="w-full space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{
                width:
                  phase === "installing" || phase === "restarting"
                    ? "100%"
                    : percent != null
                      ? `${percent}%`
                      : "0%",
              }}
            />
          </div>
          {phase === "downloading" && percent != null && (
            <p className="text-xs text-muted-foreground text-center">
              {t("updateDialog.percent", { percent })}
            </p>
          )}
        </div>

        {showDebug && (
          <div
            className={cn(
              "w-full rounded-lg border border-border bg-muted/30 px-4 py-3",
              "text-left text-xs font-mono text-muted-foreground space-y-1"
            )}
          >
            <div><span className="text-foreground/80">Phase:</span> {phase}</div>
            <div><span className="text-foreground/80">Target version:</span> {version}</div>
            <div><span className="text-foreground/80">Current version:</span> {APP_VERSION}</div>
            {progress && (
              <div>
                <span className="text-foreground/80">Download:</span>{" "}
                {progress.downloaded} / {progress.total} bytes
              </div>
            )}
            <div className="pt-1 border-t border-border/50 text-muted-foreground/80">
              Debug: set localStorage &quot;{UPDATER_DEBUG_KEY}&quot; = &quot;true&quot; or enable Dev menu.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function isUpdaterDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(UPDATER_DEBUG_KEY) === "true";
  } catch {
    return false;
  }
}
