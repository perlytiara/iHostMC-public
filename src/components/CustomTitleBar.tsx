import { motion } from "framer-motion";
import { AppLogo } from "./AppLogo";
import { useTheme, THEMES } from "./theme-provider";
import { useTranslation } from "react-i18next";
import {
  Home,
  Server,
  Settings,
  Sun,
  Moon,
  Menu,
  Minus,
  Square,
  X,
  Plus,
  Download,
  FolderOpen,
  FolderArchive,
  Play,
  Square as StopIcon,
  Bug,
  Info,
  RefreshCw,
  LogOut,
  Wrench,
  Sparkles,
} from "lucide-react";
import { useContext } from "react";
import { cn, isTauri } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { AppPage } from "@/App";
import type { MenuBarServerContext } from "@/App";
import { SettingsNavContext } from "@/App";

interface CustomTitleBarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onNewServer: () => void;
  onImportServer: () => void;
  onDevMenu: () => void;
  onRefresh: () => void;
  onWindowTools: () => void;
  serverContext: MenuBarServerContext | null;
  onExit?: () => void;
  updateAvailable: boolean;
  onInstallUpdate: () => void;
  onCheckForUpdates?: () => void;
  isDownloadingUpdate: boolean;
}

function getNavItems(settingsAsIcon: boolean): { id: AppPage; icon: typeof Home; labelKey: string }[] {
  const items: { id: AppPage; icon: typeof Home; labelKey: string }[] = [
    { id: "home", icon: Home, labelKey: "nav.home" },
    { id: "servers", icon: Server, labelKey: "nav.servers" },
    { id: "storage", icon: FolderArchive, labelKey: "nav.storage" },
    { id: "ai", icon: Sparkles, labelKey: "nav.advisor" },
  ];
  if (!settingsAsIcon) items.push({ id: "settings", icon: Settings, labelKey: "nav.settings" });
  return items;
}

const dropdownContentClass =
  "z-50 min-w-[180px] rounded-lg border border-border bg-card p-1 text-foreground shadow-xl backdrop-blur-sm";
const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground transition-colors";

export function CustomTitleBar({
  currentPage,
  onNavigate,
  onNewServer,
  onImportServer,
  onDevMenu,
  onRefresh,
  onWindowTools,
  serverContext,
  onExit,
  updateAvailable,
  onInstallUpdate,
  onCheckForUpdates,
  isDownloadingUpdate,
}: CustomTitleBarProps) {
  const { t } = useTranslation();
  const { theme, setTheme, isDark } = useTheme();
  const { settingsAsIcon } = useContext(SettingsNavContext);

  let win: ReturnType<typeof getCurrentWindow> | null = null;
  try {
    win = isTauri() ? getCurrentWindow() : null;
  } catch {
    win = null;
  }

  return (
    <div
      className="relative z-50 flex h-12 min-h-12 flex-shrink-0 items-stretch border-b select-none"
      style={{
        background: "hsl(var(--titlebar-bg))",
        borderColor: "hsl(var(--titlebar-border))",
      }}
      data-tauri-drag-region
    >
      {/* Left: Logo + App Name + Menus */}
      <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden pl-3" data-tauri-drag-region>
        <motion.div
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer shrink-0"
          onClick={() => onNavigate("home")}
        >
          <AppLogo size={38} />
        </motion.div>
        <span
          className="ml-1.5 shrink-0 text-sm font-bold tracking-tight text-foreground cursor-pointer"
          onClick={() => onNavigate("home")}
          data-tauri-drag-region
        >
          iHostMC
        </span>

        {/* Compact menus */}
        <nav className="ml-3 flex min-w-0 shrink items-stretch gap-0 overflow-hidden" data-tauri-drag-region>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex h-full items-center px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
              >
                {t("menu.file")}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={4}>
                <DropdownMenu.Item className={itemClass} onSelect={onNewServer}>
                  <Plus className="h-3.5 w-3.5" /> {t("menu.newServer")}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass} onSelect={onImportServer}>
                  <Download className="h-3.5 w-3.5" /> {t("menu.importServer")}
                </DropdownMenu.Item>
                {onExit && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item className={itemClass} onSelect={onExit}>
                      <LogOut className="h-3.5 w-3.5" /> {t("menu.exit")}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {serverContext?.hasServerSelected && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex h-full items-center px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
                >
                  {t("menu.server")}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={4}>
                  {serverContext.isRunning ? (
                    <DropdownMenu.Item className={itemClass} onSelect={serverContext.onStop}>
                      <StopIcon className="h-3.5 w-3.5" /> {t("menu.stopServer")}
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item className={itemClass} onSelect={serverContext.onStart}>
                      <Play className="h-3.5 w-3.5" /> {t("menu.startServer")}
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item className={itemClass} onSelect={serverContext.onOpenFolder}>
                    <FolderOpen className="h-3.5 w-3.5" /> {t("menu.openFolder")}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex h-full items-center px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
              >
                {t("menu.help")}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={4}>
                <DropdownMenu.Item className={itemClass} disabled>
                  <Info className="h-3.5 w-3.5" /> {t("menu.about")} iHostMC
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass} disabled>
                  {t("menu.version")}: {t("common.version")}
                </DropdownMenu.Item>
                {onCheckForUpdates && (
                  <DropdownMenu.Item className={itemClass} onSelect={onCheckForUpdates}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("menu.checkUpdates")}
                  </DropdownMenu.Item>
                )}
                {updateAvailable && (
                  <DropdownMenu.Item className={itemClass} onSelect={onInstallUpdate} disabled={isDownloadingUpdate}>
                    <RefreshCw className={cn("h-3.5 w-3.5", isDownloadingUpdate && "animate-spin")} />
                    {isDownloadingUpdate ? t("header.downloading") : t("header.install")}
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item className={itemClass} onSelect={onRefresh}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t("menu.refresh")}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass} onSelect={onWindowTools}>
                  <Wrench className="h-3.5 w-3.5" /> {t("menu.tools")}
                </DropdownMenu.Item>
                {import.meta.env.VITE_PUBLIC_REPO !== "true" && (
                  <DropdownMenu.Item className={itemClass} onSelect={onDevMenu}>
                    <Bug className="h-3.5 w-3.5" /> {t("menu.devMenu")}
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </nav>
      </div>

      {/* Center: Navigation tabs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" data-tauri-drag-region>
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-muted/60 p-1 pointer-events-auto min-w-[220px]">
          {getNavItems(settingsAsIcon).map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Settings icon (when settings-as-icon) + Hamburger app menu + Theme + Window controls */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-0" data-tauri-drag-region>
        {settingsAsIcon && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate("settings")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              currentPage === "settings" ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
            aria-label={t("nav.settings")}
          >
            <Settings className="h-4 w-4" />
          </motion.button>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label={t("menu.appMenu")}
            >
              <Menu className="h-4 w-4" />
            </motion.button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={dropdownContentClass} align="end" sideOffset={6}>
              <div className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                <p className="font-medium text-foreground">{t("menu.about")} iHostMC</p>
                <p className="mt-0.5">{t("menu.aboutDescription")}</p>
              </div>
              <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground border-b border-border mb-1">
                {t("menu.version")}: {t("common.version")}
              </div>
              <DropdownMenu.Item className={itemClass} onSelect={() => onNavigate("storage")}>
                <FolderArchive className="h-3.5 w-3.5" /> {t("nav.storage")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} onSelect={() => onNavigate("settings")}>
                <Settings className="h-3.5 w-3.5" /> {t("nav.settings")}
              </DropdownMenu.Item>
              {onCheckForUpdates && (
                <DropdownMenu.Item className={itemClass} onSelect={onCheckForUpdates}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t("menu.checkUpdates")}
                </DropdownMenu.Item>
              )}
              {updateAvailable && (
                <DropdownMenu.Item className={itemClass} onSelect={onInstallUpdate} disabled={isDownloadingUpdate}>
                  <RefreshCw className={cn("h-3.5 w-3.5", isDownloadingUpdate && "animate-spin")} />
                  {isDownloadingUpdate ? t("header.downloading") : t("header.install")}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className={itemClass}
                onSelect={() => {
                  const themes = THEMES.map((th) => th.id);
                  const idx = themes.indexOf(theme);
                  setTheme(themes[(idx + 1) % themes.length]);
                }}
              >
                {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {t("common.themeToggle")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} onSelect={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" /> {t("menu.refresh")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} onSelect={onWindowTools}>
                <Wrench className="h-3.5 w-3.5" /> {t("menu.tools")}
              </DropdownMenu.Item>
              {import.meta.env.DEV && (
                <DropdownMenu.Item className={itemClass} onSelect={() => onNavigate("dev")}>
                  <Bug className="h-3.5 w-3.5" /> {t("menu.developer")}
                </DropdownMenu.Item>
              )}
              {onExit && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item className={itemClass} onSelect={onExit}>
                    <LogOut className="h-3.5 w-3.5" /> {t("menu.exit")}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {win && (
          <div className="ml-1 flex items-stretch">
            <button
              type="button"
              className="flex h-12 w-11 items-center justify-center text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
              onClick={() => win?.minimize()}
              aria-label={t("menu.minimize")}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-12 w-11 items-center justify-center text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
              onClick={() => win?.toggleMaximize()}
              aria-label={t("menu.maximize")}
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="flex h-12 w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors rounded-none"
              onClick={() => win?.close()}
              aria-label={t("menu.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
