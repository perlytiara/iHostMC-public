"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useDesign } from "@/components/design-provider";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Edit,
  Layout,
  Server,
  HelpCircle,
  Plus,
  Download,
  Settings,
  Sun,
  Moon,
  Play,
  Square,
  FolderOpen,
  Info,
  RefreshCw,
  Bug,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuBarServerContext {
  hasServerSelected: boolean;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onOpenFolder: () => void;
}

interface AppMenuBarProps {
  onNewServer: () => void;
  onImportServer: () => void;
  onPreferences: () => void;
  onDevMenu: () => void;
  runInBackground: boolean;
  onRunInBackgroundChange: (value: boolean) => void;
  serverContext: MenuBarServerContext | null;
  onExit?: () => void;
  updateAvailable: boolean;
  onInstallUpdate: () => void;
  isDownloadingUpdate: boolean;
}

const dropdownContentClass =
  "z-50 min-w-[180px] rounded-md border border-border bg-card p-1 text-foreground shadow-lg";
const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground";

export function AppMenuBar({
  onNewServer,
  onImportServer,
  onPreferences,
  onDevMenu,
  runInBackground,
  onRunInBackgroundChange,
  serverContext,
  onExit,
  updateAvailable,
  onInstallUpdate,
  isDownloadingUpdate,
}: AppMenuBarProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { style, palette, setStyle, setPalette } = useDesign();

  return (
    <div className="flex h-10 flex-shrink-0 items-center gap-0 border-b border-border bg-background px-2">
      <span className="px-2 py-1.5 text-sm font-semibold text-foreground">
        {t("common.appName")}
      </span>

      <nav className="flex items-center gap-0.5" role="menubar" aria-label={t("menu.file")}>
        {/* File */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 font-normal" aria-haspopup="menu">
              <FileText className="mr-1.5 h-4 w-4" />
              {t("menu.file")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={2}>
              <DropdownMenu.Item className={itemClass} onSelect={onNewServer}>
                <Plus className="h-4 w-4" />
                {t("menu.newServer")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} onSelect={onImportServer}>
                <Download className="h-4 w-4" />
                {t("menu.importServer")}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className={itemClass}
                onSelect={() => onRunInBackgroundChange(!runInBackground)}
              >
                <span className={cn("mr-2 h-4 w-4", runInBackground && "text-primary")}>
                  {runInBackground ? "☑" : "☐"}
                </span>
                {t("menu.runInBackground")}
              </DropdownMenu.Item>
              {onExit && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item className={itemClass} onSelect={onExit}>
                    <LogOut className="h-4 w-4" />
                    {t("menu.exit")}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Edit */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 font-normal" aria-haspopup="menu">
              <Edit className="mr-1.5 h-4 w-4" />
              {t("menu.edit")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={2}>
              <DropdownMenu.Item className={itemClass} onSelect={onPreferences}>
                <Settings className="h-4 w-4" />
                {t("menu.preferences")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* View */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 font-normal" aria-haspopup="menu">
              <Layout className="mr-1.5 h-4 w-4" />
              {t("menu.view")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={2}>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={itemClass}>
                  <Sun className="h-4 w-4" />
                  {t("menu.theme")}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={dropdownContentClass} sideOffset={4}>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => setTheme("light")}
                    >
                      {theme === "light" ? "● " : ""}{t("menu.light")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => setTheme("dark")}
                    >
                      {theme === "dark" ? "● " : ""}{t("menu.dark")}
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={itemClass}>
                  {t("menu.design")}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={dropdownContentClass} sideOffset={4}>
                    <DropdownMenu.Item className={itemClass} onSelect={() => setStyle("simple")}>
                      {style === "simple" ? "● " : ""}{t("common.designSimple")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={itemClass} onSelect={() => setStyle("standard")}>
                      {style === "standard" ? "● " : ""}{t("common.designStandard")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item className={itemClass} onSelect={() => setPalette("monochrome")}>
                      {palette === "monochrome" ? "● " : ""}{t("common.designMonochrome")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={itemClass} onSelect={() => setPalette("colorful")}>
                      {palette === "colorful" ? "● " : ""}{t("common.designColorful")}
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Server (contextual) */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 font-normal"
              aria-haspopup="menu"
              disabled={!serverContext?.hasServerSelected}
            >
              <Server className="mr-1.5 h-4 w-4" />
              {t("menu.server")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={2}>
              {serverContext?.hasServerSelected ? (
                <>
                  {serverContext.isRunning ? (
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={serverContext.onStop}
                    >
                      <Square className="h-4 w-4" />
                      {t("menu.stopServer")}
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={serverContext.onStart}
                    >
                      <Play className="h-4 w-4" />
                      {t("menu.startServer")}
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    className={itemClass}
                    onSelect={serverContext.onOpenFolder}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("menu.openFolder")}
                  </DropdownMenu.Item>
                </>
              ) : (
                <DropdownMenu.Item className={itemClass} disabled>
                  {t("menu.selectServerFirst")}
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Help */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 font-normal" aria-haspopup="menu">
              <HelpCircle className="mr-1.5 h-4 w-4" />
              {t("menu.help")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={2}>
              <DropdownMenu.Item className={itemClass} disabled>
                <Info className="h-4 w-4" />
                {t("menu.about")} iHostMC
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} disabled>
                {t("menu.version")}: {t("common.version")}
              </DropdownMenu.Item>
              {updateAvailable && (
                <DropdownMenu.Item
                  className={itemClass}
                  onSelect={onInstallUpdate}
                  disabled={isDownloadingUpdate}
                >
                  <RefreshCw className={cn("h-4 w-4", isDownloadingUpdate && "animate-spin")} />
                  {isDownloadingUpdate ? t("header.downloading") : t("header.install")}
                </DropdownMenu.Item>
              )}
              {import.meta.env.VITE_PUBLIC_REPO !== "true" && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item className={itemClass} onSelect={onDevMenu}>
                    <Bug className="h-4 w-4" />
                    {t("menu.devMenu")}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={t("common.themeToggle")}
        >
          <Sun className={cn("h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0")} />
          <Moon className={cn("absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100")} />
        </Button>
        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t("common.version")}
        </span>
      </div>
    </div>
  );
}
