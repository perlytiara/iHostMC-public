"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export type UpdatePhase = "idle" | "downloading" | "installing" | "restarting";

interface UpdateAvailableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  update: UpdateInfo;
  onInstall: () => void;
  onLater: () => void;
  isDownloading: boolean;
  progress: { downloaded: number; total: number } | null;
  phase: UpdatePhase;
}

export function UpdateAvailableDialog({
  open,
  onOpenChange,
  update,
  onInstall,
  onLater,
  isDownloading,
  progress,
  phase,
}: UpdateAvailableDialogProps) {
  const { t } = useTranslation();

  const handleLater = () => {
    if (isDownloading) return;
    onLater();
    onOpenChange(false);
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const canClose = !isDownloading && phase === "idle";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => canClose && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-card p-8 shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          onPointerDownOutside={(e) => canClose || e.preventDefault()}
          onEscapeKeyDown={() => canClose && handleLater()}
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {isDownloading || phase === "installing" || phase === "restarting" ? (
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              ) : (
                <Download className="h-7 w-7 text-primary" />
              )}
            </div>

            <Dialog.Title className="text-xl font-semibold text-foreground">
              {phase === "restarting"
                ? t("updateDialog.restarting")
                : phase === "installing"
                  ? t("updateDialog.installing")
                  : isDownloading
                    ? t("updateDialog.downloading")
                    : t("updateDialog.title")}
            </Dialog.Title>

            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {phase === "restarting"
                ? t("updateDialog.restartingDesc")
                : phase === "installing"
                  ? t("updateDialog.installingDesc")
                  : isDownloading
                    ? t("updateDialog.downloadingDesc", { version: update.version })
                    : t("updateDialog.description", { version: update.version })}
            </Dialog.Description>

            {(isDownloading || phase === "installing" || phase === "restarting") && (
              <div className="mt-6 w-full">
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
                {(isDownloading && percent != null) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("updateDialog.percent", { percent })}
                  </p>
                )}
              </div>
            )}

            {!isDownloading && phase === "idle" && (
              <>
                {update.body?.trim() && (
                  <div
                    className="mt-4 max-h-24 w-full overflow-y-auto rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: update.body.replace(/\n/g, "<br />") }}
                  />
                )}
                <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row-reverse sm:justify-center">
                  <Button
                    type="button"
                    onClick={onInstall}
                    className="gap-2 min-w-[140px]"
                  >
                    <Download className="h-4 w-4" />
                    {t("updateDialog.updateNow")}
                  </Button>
                  <button
                    type="button"
                    onClick={handleLater}
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:no-underline"
                  >
                    {t("updateDialog.later")}
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
