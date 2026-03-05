"use client";

import { Bug, Monitor, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DevOptionsSection } from "@/features/settings/components/DevOptionsSection";

interface DevPageProps {
  onOpenWindowTools: () => void;
}

export function DevPage({ onOpenWindowTools }: DevPageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Compact header - full width */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-6 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
          <Bug className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground truncate">
            {t("menu.developer", { defaultValue: "Developer" })}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {t("settings.dev.tabDesc", { defaultValue: "Window tools, Stripe, and dev options. Only visible in dev builds." })}
          </p>
        </div>
      </header>

      {/* Full-height two-column grid - fills remaining space */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:gap-6 lg:p-6">
        {/* Window tools - full height card */}
        <section className="flex min-h-0 flex-col rounded-2xl border-2 border-border bg-card p-5 lg:p-6">
          <h2 className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Monitor className="h-4 w-4 text-primary" />
            {t("tools.title", { defaultValue: "Window tools" })}
          </h2>
          <p className="mt-1 shrink-0 text-sm text-muted-foreground">
            {t("devPage.windowToolsDesc", { defaultValue: "Resize, presets, fit to screen, and debug log." })}
          </p>
          <div className="mt-4 flex flex-1 flex-col items-start justify-center lg:mt-6">
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={onOpenWindowTools}
            >
              <Wrench className="h-4 w-4" />
              {t("devPage.openWindowTools", { defaultValue: "Open window tools" })}
            </Button>
          </div>
        </section>

        {/* Dev options - full height scrollable column */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="h-full min-h-0 overflow-y-auto">
            <DevOptionsSection />
          </div>
        </section>
      </div>
    </div>
  );
}
