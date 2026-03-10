"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

interface UpdateAvailableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  update: UpdateInfo;
  onInstall: () => void;
  onLater: () => void;
  isDownloading: boolean;
}

export function UpdateAvailableDialog({
  open,
  onOpenChange,
  update,
  onInstall,
  onLater,
  isDownloading,
}: UpdateAvailableDialogProps) {
  const { t } = useTranslation();

  const handleLater = () => {
    onLater();
    onOpenChange(false);
  };

  const handleInstall = () => {
    onInstall();
    // Keep dialog open until install finishes or errors
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-card p-6 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={handleLater}
        >
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {t("updateDialog.title")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {t("updateDialog.description", { version: update.version })}
          </Dialog.Description>
          {update.body?.trim() && (
            <div
              className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: update.body.replace(/\n/g, "<br />") }}
            />
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleLater} disabled={isDownloading}>
              {t("updateDialog.later")}
            </Button>
            <Button
              type="button"
              onClick={handleInstall}
              disabled={isDownloading}
              className="gap-2"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t("header.downloading")}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {t("updateDialog.restartToUpdate")}
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
