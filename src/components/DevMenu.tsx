"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";
import { Bug, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface DevMenuProps {
  open: boolean;
  onClose: () => void;
}

export function DevMenu({ open, onClose }: DevMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  const openDevTools = () => {
    if (isTauri()) invoke("open_devtools").catch(() => {});
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" aria-modal="true" role="dialog">
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-lg",
          "min-w-[280px]"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Bug className="h-4 w-4" />
            {t("devMenu.title")}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("devMenu.openShortcut")}</p>
        <p className="text-xs text-muted-foreground">{t("devMenu.inspectShortcut")}</p>
        {isTauri() && (
          <Button variant="outline" size="sm" onClick={openDevTools} className="gap-2">
            <Bug className="h-3.5 w-3.5" />
            {t("devMenu.openDevTools")}
          </Button>
        )}
      </div>
    </div>
  );
}
