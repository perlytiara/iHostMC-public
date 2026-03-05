"use client";

import { Button } from "@/components/ui/button";
import { useServers } from "../hooks/useServers";
import { CreateServerWizard } from "./CreateServerWizard";
import { ImportServerView } from "./ImportServerView";
import { BrowseMods, BrowsePlugins } from "@/features/mods-plugins";
import { ServerFiles } from "./ServerFiles";
import { ServerManagement } from "./ServerManagement";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Play,
  Square,
  Trash2,
  FolderOpen,
  Pencil,
  Download,
  Copy,
  Shield,
  Loader2,
  Share2,
  PanelLeftClose,
  PanelLeft,
  Send,
  Gamepad2,
  CloudUpload,
  Cloudy,
  CloudOff,
  ExternalLink,
  Package,
  FileText,
  ScanSearch,
  RefreshCw,
  Info,
  HardDrive,
  LayoutDashboard,
  Terminal,
  Puzzle,
  Clock,
  Save,
  ChevronDown,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn, isTauri } from "@/lib/utils";
import { getFrpPrefs, getRelayTokenForTunnel } from "@/lib/tunnel-prefs";
import { getToken } from "@/features/auth";
import { useSyncServers } from "../hooks/useSyncServers";
import { getAutoBackupEnabled } from "@/lib/sync-prefs";
import { setIterationSchedule, getDefaultScheduleForNewServers, INTERVAL_HOURS_DEFAULT, INTERVAL_HOURS_MIN, INTERVAL_HOURS_MAX } from "@/lib/iteration-prefs";

/** Label for interval (matches website): 1 = Hourly, else Every X hours */
function getIntervalLabel(hours: number): string {
  return hours === 1 ? "Hourly" : `Every ${hours} hours`;
}

const INTERVAL_HOURS_PRESETS = [1, 2, 3, 4, 6, 8, 12, 24] as const;
import { useSyncFiles, type SyncFilesState } from "../hooks/useSyncFiles";
import { useBackupIterations } from "../hooks/useBackupIterations";
import { useBackupData } from "../hooks/useBackupData";
import { useServerBackupScan } from "../hooks/useServerBackupScan";
import { buildManifestTree, manifestTreeToSnapshotTree } from "../utils/backup-manifest";
import { BackupManifestView } from "./BackupManifestView";
import { SyncProgressPanel, type FileMetaMap } from "./SyncProgressPanel";
import { SyncedFilesTree } from "./SyncedFilesTree";
import { getWebsiteBackupsUrl, getBackupDetailUrl, getCloudServerUrl, api, getApiBaseUrl } from "@/lib/api-client";
import { toast } from "@/lib/toast-store";
import {
  getOutputLines,
  getRawBuffer,
  subscribeLines,
  clearServerOutput,
} from "@/lib/server-output-store";
import type { ServerConfig } from "../types";
import type { MenuViewRequest, MenuBarServerContext } from "@/App";
import type { SyncServerInfo } from "@/lib/api-client";

const MINECRAFT_DEFAULT_PORT = 25565;

/** Show "many servers" banner above this count (same as CreateServerWizard soft limit). */
const SOFT_SERVER_LIMIT = 20;

function formatPublicAddress(ip: string, port: number): string {
  return port === MINECRAFT_DEFAULT_PORT ? ip : `${ip}:${port}`;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function fetchPublicIp(): Promise<string> {
  if (isTauri()) {
    return invoke<string>("get_public_ip");
  }
  const res = await fetch("https://api.ipify.org");
  if (!res.ok) throw new Error("Could not fetch public IP.");
  return (await res.text()).trim();
}

type CenterView = "server" | "create" | "import";

export interface ServerListProps {
  menuViewRequest?: MenuViewRequest | null;
  onMenuViewRequestHandled?: () => void;
  runInBackground?: boolean;
  onRunInBackgroundChange?: (value: boolean) => void;
  onMenuBarServerContextChange?: (ctx: MenuBarServerContext | null) => void;
  onServerCountChange?: (count: number) => void;
  onRunningCountChange?: (count: number) => void;
}

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

export function ServerList({
  menuViewRequest = null,
  onMenuViewRequestHandled,
  runInBackground: runInBackgroundProp,
  onRunInBackgroundChange: _onRunInBackgroundChange,
  onMenuBarServerContextChange,
  onServerCountChange,
  onRunningCountChange,
}: ServerListProps = {}) {
  const { t } = useTranslation();
  const token = getToken();
  const { servers, loading: serversLoading, refresh } = useServers();
  const { syncedServers, syncNow, syncing: metaSyncing, refreshSynced } = useSyncServers(servers, token, {
    autoSyncOnLoad: getAutoBackupEnabled(),
  });
  const [creatingServer, setCreatingServer] = useState<{ creating: boolean; name?: string }>({ creating: false });
  const [createViewMinimized, setCreateViewMinimized] = useState(false);
  const [centerView, setCenterView] = useState<CenterView>("server");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [terminalTab, setTerminalTab] = useState<"list" | "backup" | "mods" | "plugins" | "files" | "management">("list");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; server: ServerConfig } | null>(null);
  const [serverToDelete, setServerToDelete] = useState<ServerConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [importInitial, setImportInitial] = useState<{
    version: string;
    name: string;
    motd?: string;
    favicon_b64?: string | null;
  } | null>(null);
  const runInBackground = runInBackgroundProp ?? false;
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [publicIpLoading, setPublicIpLoading] = useState(false);
  const [publicIpError, setPublicIpError] = useState<string | null>(null);
  const [firewallMessage, setFirewallMessage] = useState<string | null>(null);
  const [firewallLoading, setFirewallLoading] = useState(false);
  const [firewallFeedback, setFirewallFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelMethod, setTunnelMethod] = useState<"relay" | "upnp" | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelStatus, setTunnelStatus] = useState<"preparing" | "downloading" | "connecting" | null>(null);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onServerCountChange?.(servers.length);
  }, [servers.length, onServerCountChange]);

  useEffect(() => {
    onRunningCountChange?.(runningId ? 1 : 0);
  }, [runningId, onRunningCountChange]);

  useEffect(() => {
    if (!selectedId || !isTauri()) return;
    invoke<string | null>("get_tunnel_public_url")
      .then((url) => setTunnelUrl(url ?? null))
      .catch(() => setTunnelUrl(null));
  }, [selectedId]);

  useEffect(() => {
    if (!runningId && isTauri()) {
      invoke("stop_tunnel").catch(() => {});
      invoke("remove_upnp_if_active").catch(() => {});
      setTunnelUrl(null);
      setTunnelMethod(null);
      setTunnelError(null);
    }
  }, [runningId]);

  // Live sync with website: refresh synced servers (and thus iteration schedule) when viewing a server
  const SYNC_REFRESH_MS = 60 * 1000;
  useEffect(() => {
    if (!token || !selectedId || !getApiBaseUrl()) return;
    const id = setInterval(refreshSynced, SYNC_REFRESH_MS);
    return () => clearInterval(id);
  }, [token, selectedId, refreshSynced]);

  useEffect(() => {
    if (!selectedId) {
      setPublicIp(null);
      setPublicIpError(null);
      return;
    }
    let cancelled = false;
    setPublicIpLoading(true);
    setPublicIpError(null);
    fetchPublicIp()
      .then((ip) => {
        if (!cancelled) { setPublicIp(ip); setPublicIpError(null); }
      })
      .catch((err) => {
        if (!cancelled) { setPublicIpError(err instanceof Error ? err.message : String(err)); setPublicIp(null); }
      })
      .finally(() => { if (!cancelled) setPublicIpLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const start = useCallback(async (s: ServerConfig) => {
    setStartError(null);
    if (import.meta.env.DEV) console.log("[iHostMC] Starting server:", s.id, s.name, "background:", runInBackground);
    setStartingId(s.id);
    setSelectedId(s.id);
    setCenterView("server");
    setTerminalTab("list");
    clearServerOutput();
    toast.info(t("servers.starting", { name: s.name }));
    try {
      await invoke("start_server", { id: s.id, runInBackground });
      if (import.meta.env.DEV) console.log("[iHostMC] Server started successfully:", s.id);
      setRunningId(s.id);
      if (runInBackground) {
        toast.success(t("servers.startedInBackground"));
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[iHostMC] Server start failed:", e);
      let message = t("servers.startFailed");
      if (typeof e === "string") message = e;
      else if (e instanceof Error) message = e.message;
      else if (e != null && typeof e === "object" && "message" in e) message = String((e as { message: unknown }).message);
      setStartError(message);
      toast.error(message);
    } finally {
      setStartingId(null);
    }
  }, [runInBackground, t]);

  const stop = useCallback(async () => {
    if (import.meta.env.DEV) console.log("[iHostMC] Stopping server");
    try {
      await invoke("stop_server");
      if (isTauri()) {
        invoke("stop_tunnel").catch(() => {});
        invoke("remove_upnp_if_active").catch(() => {});
      }
      setRunningId(null);
      setTunnelUrl(null);
      setTunnelMethod(null);
      setTunnelError(null);
      if (import.meta.env.DEV) console.log("[iHostMC] Server stopped");
    } catch (e) {
      if (import.meta.env.DEV) console.error("[iHostMC] Stop failed:", e);
    }
  }, []);

  const requestDeleteServer = useCallback((server: ServerConfig) => {
    if (import.meta.env.DEV) console.log("[iHostMC] Delete requested for:", server.id, server.name);
    setContextMenu(null);
    setServerToDelete(server);
  }, []);

  const confirmDeleteServer = useCallback(async () => {
    if (!serverToDelete || isDeleting) return;
    const id = serverToDelete.id;
    const name = serverToDelete.name;
    if (import.meta.env.DEV) console.log("[iHostMC] Confirming delete for:", id, name);
    setIsDeleting(true);
    try {
      await invoke("delete_server", { id });
      if (import.meta.env.DEV) console.log("[iHostMC] Server deleted successfully:", id);
      setServerToDelete(null);
      if (selectedId === id) setSelectedId(null);
      if (runningId === id) setRunningId(null);
      refresh();
      toast.success(t("servers.deletedSuccess", { name }));
    } catch (e) {
      if (import.meta.env.DEV) console.error("[iHostMC] Delete failed:", e);
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : e != null && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [serverToDelete, isDeleting, selectedId, runningId, refresh, t]);

  const cancelDeleteServer = useCallback(() => setServerToDelete(null), []);

  const saveRename = useCallback(
    async (id: string, newName: string) => {
      if (!newName.trim()) return;
      try {
        await invoke("rename_server", { id, newName: newName.trim() });
        refresh();
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      } finally {
        setEditingServerId(null);
      }
    },
    [refresh]
  );

  useEffect(() => {
    if (editingServerId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingServerId]);

  const openServerFolder = useCallback(async (id: string) => {
    try { await invoke("open_server_folder", { serverId: id }); } catch (e) { if (import.meta.env.DEV) console.error(e); }
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) close();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEscape);
    return () => { window.removeEventListener("mousedown", handleClick); window.removeEventListener("keydown", handleEscape); };
  }, [contextMenu]);

  useEffect(() => {
    if (!serverToDelete) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDeleteServer();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [serverToDelete, cancelDeleteServer]);

  useEffect(() => {
    if (!isTauri()) return;
    const sync = async () => {
      try {
        const running = await invoke<boolean>("get_server_status");
        const id = running ? await invoke<string | null>("get_running_server_id") : null;
        if (import.meta.env.DEV) console.log("[iHostMC] Sync running state:", { running, id });
        setRunningId(id ?? null);
      } catch {
        setRunningId(null);
      }
    };
    sync();
  }, []);

  useEffect(() => {
    const unsub = listen<string>("server-started", (ev) => {
      const id = ev.payload ?? null;
      if (id) setRunningId(id);
    });
    return () => { unsub.then((u) => u()); };
  }, []);

  useEffect(() => {
    const unsub = listen("server-stopped", () => {
      setRunningId(null);
      toast.info(t("servers.serverStopped"));
    });
    return () => { unsub.then((u) => u()); };
  }, [t]);

  useEffect(() => {
    if (!menuViewRequest || menuViewRequest === "settings") return;
    setCenterView(menuViewRequest as CenterView);
    onMenuViewRequestHandled?.();
  }, [menuViewRequest, onMenuViewRequestHandled]);

  useEffect(() => {
    if (!onMenuBarServerContextChange) return;
    const selected = selectedId ? servers.find((s) => s.id === selectedId) : null;
    if (!selected) { onMenuBarServerContextChange(null); return; }
    onMenuBarServerContextChange({
      hasServerSelected: true,
      isRunning: runningId === selectedId,
      onStart: () => start(selected),
      onStop: stop,
      onOpenFolder: () => openServerFolder(selectedId!),
    });
  }, [onMenuBarServerContextChange, selectedId, runningId, servers, start, stop, openServerFolder]);

  const isRunning = runningId !== null;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sendServerCommand = useCallback((cmd: string) => {
    const line = cmd.endsWith("\n") ? cmd : `${cmd}\n`;
    invoke("send_server_input", { input: line }).catch(() => {});
  }, []);

  const syncedServerForSelected = selectedId ? syncedServers.find((r) => r.hostId === selectedId) : undefined;
  const fileSyncState = useSyncFiles(token, syncedServerForSelected?.id ?? null);

  const tabItems: { id: "list" | "backup" | "management" | "mods" | "plugins" | "files"; label: string; highlight?: boolean; icon: React.ComponentType<{ className?: string }>; separatorBefore?: boolean }[] = [
    { id: "list", label: t("servers.overview"), icon: LayoutDashboard },
    { id: "backup", label: t("servers.backupAndSync"), icon: CloudUpload, highlight: true },
    { id: "management", label: t("servers.management"), icon: Terminal },
    { id: "mods", label: t("servers.mods"), icon: Package },
    { id: "plugins", label: t("servers.plugins"), icon: Puzzle },
    { id: "files", label: t("servers.files"), icon: FolderOpen, separatorBefore: true },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-shrink-0 flex-col border-r border-border bg-card/50 transition-[width] duration-200",
          sidebarCollapsed ? "w-14" : "w-60"
        )}
      >
        <div className={cn("flex border-b border-border p-2", sidebarCollapsed ? "flex-col items-center gap-1" : "items-center justify-between px-3")}>
          {sidebarCollapsed ? (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSidebarCollapsed(false)}>
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }}>
                <Plus className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold">{t("servers.title")}</span>
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSidebarCollapsed(true)}>
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCenterView("import"); setImportInitial(null); }}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
        {!sidebarCollapsed && (
          <>
            {servers.length >= SOFT_SERVER_LIMIT && (
              <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t("servers.manyServersBanner", { count: servers.length })}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2">
              {serversLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t("servers.loading")}</span>
                </div>
              ) : servers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Gamepad2 className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{t("servers.selectOrCreate")}</p>
                </div>
              ) : (
                <AnimatePresence>
                  <ul className="space-y-2">
                    {creatingServer.creating && (
                      <motion.li
                        variants={sidebarItemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setCenterView("create");
                          setCreateViewMinimized(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setCenterView("create");
                            setCreateViewMinimized(false);
                          }
                        }}
                        className={cn(
                          "group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors cursor-pointer shadow-sm",
                          centerView === "create" && !createViewMinimized
                            ? "bg-accent border-accent-foreground/20 text-accent-foreground"
                            : "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {creatingServer.name || t("wizard.creating")}
                          </span>
                        </div>
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" aria-hidden />
                      </motion.li>
                    )}
                    {servers.map((s, i) => {
                      const syncedRec = syncedServers.find((r) => r.hostId === s.id);
                      const cloudState: "none" | "registered" | "mini" | "saved" = !syncedRec
                        ? "none"
                        : syncedRec.backupCount > 0
                          ? "saved"
                          : syncedRec.miniSynced
                            ? "mini"
                            : "registered";
                      return (
                      <motion.li
                        key={s.id}
                        variants={sidebarItemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ delay: i * 0.04 }}
                        data-context-menu="server"
                        className={cn(
                          "group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm transition-colors cursor-pointer shadow-sm",
                          centerView === "server" && selectedId === s.id
                            ? "bg-accent border-accent-foreground/20 text-accent-foreground"
                            : "hover:bg-accent/50 hover:border-border/80"
                        )}
                        onContextMenu={(e: React.MouseEvent) => {
                          if (e.ctrlKey && e.shiftKey) return;
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, server: s });
                        }}
                        onClick={() => {
                          setSelectedId(s.id);
                          setTerminalTab("list");
                          setCenterView("server");
                          if (creatingServer.creating) setCreateViewMinimized(true);
                        }}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        {editingServerId === s.id ? (
                          <input
                            ref={editingServerId === s.id ? editInputRef : undefined}
                            type="text"
                            defaultValue={s.name}
                            className="min-w-0 flex-1 truncate rounded border border-input bg-background px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== s.name) saveRename(s.id, v);
                              else setEditingServerId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = (e.target as HTMLInputElement).value.trim();
                                if (v && v !== s.name) saveRename(s.id, v);
                                else setEditingServerId(null);
                              }
                              if (e.key === "Escape") {
                                setEditingServerId(null);
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="min-w-0 flex-1 truncate text-left"
                            onDoubleClick={(e) => { e.stopPropagation(); setEditingServerId(s.id); }}
                          >
                            {s.name}
                          </span>
                        )}
                          {(() => {
                            const titles = {
                              none: t("servers.notSynced"),
                              registered: t("servers.registeredToCloud"),
                              mini: t("servers.miniSyncedHint"),
                              saved: t("servers.syncedToWebsite"),
                            };
                            const title = titles[cloudState];
                            if (cloudState === "none") {
                              return (
                                <span title={title} className="shrink-0 text-muted-foreground/50">
                                  <CloudOff className="h-3.5 w-3.5" />
                                </span>
                              );
                            }
                            return (
                              <span
                                title={title}
                                className={cn(
                                  "shrink-0",
                                  cloudState === "registered" && "text-muted-foreground/60",
                                  cloudState === "mini" && "text-muted-foreground/80",
                                  cloudState === "saved" && "text-muted-foreground/90"
                                )}
                              >
                                <Cloudy className="h-3.5 w-3.5" />
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "h-7 w-7",
                              runningId === s.id
                                ? "text-primary hover:text-destructive"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (runningId === s.id) stop();
                              else start(s);
                            }}
                            disabled={startingId !== null || (isRunning && runningId !== s.id)}
                            title={runningId === s.id ? t("servers.contextStop") : t("servers.contextStart")}
                          >
                            {startingId === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : runningId === s.id ? (
                              <Square className="h-3.5 w-3.5 fill-current" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); requestDeleteServer(s); }} disabled={runningId === s.id || startingId === s.id} title={t("servers.contextDelete")}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {runningId === s.id && (
                          <span className="ml-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </motion.li>
                    ); })}
                  </ul>
                </AnimatePresence>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Context menu */}
      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card text-card-foreground py-1 shadow-xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { openServerFolder(contextMenu.server.id); setContextMenu(null); }}>
              <FolderOpen className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextOpenFolder")}
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { setEditingServerId(contextMenu.server.id); setContextMenu(null); }}>
              <Pencil className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextRename")}
            </button>
            {runningId === contextMenu.server.id ? (
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { stop(); setContextMenu(null); }}>
                <Square className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextStop")}
              </button>
            ) : (
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50" disabled={isRunning} onClick={() => { start(contextMenu.server); setContextMenu(null); }}>
                <Play className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextStart")}
              </button>
            )}
            <div className="my-1 border-t border-border" />
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50" disabled={runningId === contextMenu.server.id} onClick={() => requestDeleteServer(contextMenu.server)}>
              <Trash2 className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextDelete")}
            </button>
          </div>,
          document.body
        )}

      {/* Delete server confirmation */}
      {serverToDelete &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-server-title"
            aria-describedby="delete-server-desc"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !isDeleting && cancelDeleteServer()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 id="delete-server-title" className="text-lg font-semibold text-foreground">
                      {t("servers.deleteConfirmTitle")}
                    </h3>
                    <p id="delete-server-desc" className="mt-1 text-sm text-muted-foreground">
                      {t("servers.deleteConfirmMessage", { name: serverToDelete.name })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                  <button
                    type="button"
                    onClick={cancelDeleteServer}
                    disabled={isDeleting}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteServer}
                    disabled={isDeleting}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 min-w-[7rem]"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("servers.deleting")}
                      </>
                    ) : (
                      t("servers.deleteConfirmButton")
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Main content */}
      <main className="relative flex flex-1 flex-col min-w-0 overflow-hidden bg-background">
        {/* Create view: show when create is selected; keep mounted (hidden) when creating but user switched to another server so "Creating…" sidebar click returns to live progress */}
        {(centerView === "create" || creatingServer.creating) && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              centerView !== "create" && "absolute left-0 top-0 z-0 h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            )}
            aria-hidden={centerView !== "create"}
          >
            {centerView === "create" && creatingServer.creating && createViewMinimized && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">
                  {t("wizard.creatingTitle")}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {t("wizard.creatingMinimizedHint", { name: creatingServer.name || t("wizard.creating") })}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCreateViewMinimized(false)}
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {t("wizard.viewCreationProgress")}
                </Button>
              </div>
            )}
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden",
                centerView === "create" && creatingServer.creating && createViewMinimized && "absolute inset-0 w-px h-px overflow-hidden opacity-0 pointer-events-none"
              )}
              aria-hidden={centerView === "create" && creatingServer.creating && createViewMinimized}
            >
              <CreateServerWizard
                initialVersion={importInitial?.version}
                initialName={importInitial?.name}
                initialMotd={importInitial?.motd}
                initialFaviconB64={importInitial?.favicon_b64}
                onCreated={async (serverId) => {
                  setCreatingServer({ creating: false });
                  setCreateViewMinimized(false);
                  setImportInitial(null);
                  await refresh();
                  setSelectedId(serverId);
                  setCenterView("server");
                  setIterationSchedule(serverId, getDefaultScheduleForNewServers());
                  const autoBackupOn = token && getAutoBackupEnabled();
                  if (autoBackupOn) {
                    // Defer so React re-renders with new servers and syncNow sees the new server via ref
                    setTimeout(() => {
                      syncNow(serverId);
                      setTerminalTab("backup");
                      toast.success(t("servers.registeredToCloud", { defaultValue: "Registered to cloud" }));
                    }, 0);
                  } else {
                    setTerminalTab("list");
                  }
                }}
                onCancel={() => { setCenterView("server"); setImportInitial(null); setCreatingServer({ creating: false }); setCreateViewMinimized(false); }}
                onCreatingChange={(creating, serverName) => setCreatingServer(creating ? { creating: true, name: serverName } : { creating: false })}
                onMinimizeDuringCreation={() => setCreateViewMinimized(true)}
              />
            </div>
          </div>
        )}

        {centerView === "import" && (
          <div className="flex flex-1 overflow-auto">
            <ImportServerView
              onBack={() => setCenterView("server")}
              onCreateWithImport={(payload) => {
                setImportInitial({
                  version: payload.version,
                  name: payload.suggestedName,
                  motd: payload.motd || undefined,
                  favicon_b64: payload.favicon_b64 ?? undefined,
                });
                setCenterView("create");
              }}
            />
          </div>
        )}

        {centerView === "server" && (
          <>
            {selectedId ? (
              <>
                {/* Tab bar: Summary, Cloud, Console, Mods, Plugins | Files */}
                <div className="flex items-center gap-0 border-b border-border px-4 py-1.5">
                  {tabItems.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = terminalTab === tab.id;
                    const isHighlight = tab.highlight && isActive;
                    return (
                      <span key={tab.id} className={cn("flex items-center", tab.separatorBefore && "ml-1 border-l border-border pl-2")}>
                        <button
                          type="button"
                          className={cn(
                            "relative px-3.5 py-2 text-sm font-medium transition-colors rounded-md",
                            isActive
                              ? isHighlight
                                ? "text-primary-foreground"
                                : "text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            isHighlight && "bg-primary shadow-sm"
                          )}
                          onClick={() => setTerminalTab(tab.id)}
                        >
                          {isActive && !isHighlight && (
                            <motion.div
                              layoutId="server-tab-pill"
                              className="absolute inset-0 rounded-md bg-accent"
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-1.5">
                            {tab.id === "backup" ? (
                              <>
                                {fileSyncState.syncing ? (
                                  <Loader2 className={cn("h-3.5 w-3.5 shrink-0 animate-spin", isHighlight ? "text-primary-foreground" : "text-muted-foreground")} />
                                ) : (
                                  <CloudUpload className={cn("h-3.5 w-3.5 shrink-0", isHighlight && "text-primary-foreground")} />
                                )}
                              </>
                            ) : (
                              <TabIcon className={cn("h-3.5 w-3.5 shrink-0", isHighlight && "text-primary-foreground")} />
                            )}
                            {tab.label}
                          </span>
                        </button>
                      </span>
                    );
                  })}
                </div>
                {startError && (
                  <div
                    className="flex items-center justify-between gap-2 border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    <span>{startError}</span>
                    <button
                      type="button"
                      onClick={() => setStartError(null)}
                      className="shrink-0 rounded px-2 py-1 hover:bg-destructive/20"
                    >
                      {t("common.close")}
                    </button>
                  </div>
                )}
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden p-5">
                  <AnimatePresence mode="wait">
                    {terminalTab === "list" && (
                      <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-1 flex-col min-h-0 text-sm text-muted-foreground overflow-auto">
                        <ServerOverview
                          server={servers.find((x) => x.id === selectedId)!}
                          isRunning={runningId === selectedId}
                          isStarting={startingId === selectedId}
                          anyRunning={isRunning}
                          isSynced={syncedServers.some((r) => r.hostId === selectedId)}
                          websiteBackupsUrl={getWebsiteBackupsUrl()}
                          onStart={() => {
                            const s = servers.find((x) => x.id === selectedId);
                            if (s) start(s);
                          }}
                          onStop={stop}
                          publicIp={publicIp}
                          publicIpLoading={publicIpLoading}
                          publicIpError={publicIpError}
                          tunnelUrl={tunnelUrl}
                          tunnelMethod={tunnelMethod}
                          tunnelLoading={tunnelLoading}
                          tunnelStatus={tunnelStatus}
                          tunnelError={tunnelError}
                          firewallMessage={firewallMessage}
                          firewallLoading={firewallLoading}
                          firewallFeedback={firewallFeedback}
                          onSetFirewallMessage={setFirewallMessage}
                          onSetFirewallFeedback={setFirewallFeedback}
                          onSetFirewallLoading={setFirewallLoading}
                          onSetTunnelUrl={setTunnelUrl}
                          onSetTunnelMethod={setTunnelMethod}
                          onSetTunnelLoading={setTunnelLoading}
                          onSetTunnelStatus={setTunnelStatus}
                          onSetTunnelError={setTunnelError}
                          t={t}
                        />
                      </motion.div>
                    )}
                    {terminalTab === "backup" && (
                      <motion.div key="backup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                        <ServerBackupSyncTab
                          server={servers.find((x) => x.id === selectedId)!}
                          syncedServer={syncedServers.find((r) => r.hostId === selectedId)}
                          websiteBackupsUrl={getWebsiteBackupsUrl()}
                          token={token}
                          syncNow={syncNow}
                          refreshSynced={refreshSynced}
                          syncing={metaSyncing}
                          fileSyncState={fileSyncState}
                          t={t}
                        />
                      </motion.div>
                    )}
                    {terminalTab === "management" && (
                      <motion.div key="management" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <ServerManagement
                          serverId={selectedId}
                          isRunning={runningId === selectedId}
                          onSendCommand={sendServerCommand}
                          t={t}
                        />
                      </motion.div>
                    )}
                    {terminalTab === "mods" && (
                      <motion.div key="mods" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0 overflow-auto">
                        <BrowseMods serverId={selectedId} gameVersion={servers.find((s) => s.id === selectedId)?.minecraft_version ?? ""} serverType={servers.find((s) => s.id === selectedId)?.server_type ?? ""} />
                      </motion.div>
                    )}
                    {terminalTab === "plugins" && (
                      <motion.div key="plugins" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0 overflow-auto">
                        <BrowsePlugins serverId={selectedId} gameVersion={servers.find((s) => s.id === selectedId)?.minecraft_version ?? ""} />
                      </motion.div>
                    )}
                    {terminalTab === "files" && (
                      <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="shrink-0 border-b border-border pb-2 mb-2">
                          <p className="text-xs font-medium text-muted-foreground">{t("servers.filesTabLabel", { defaultValue: "Local server files — browse and edit on this device" })}</p>
                        </div>
                        <ServerFiles serverId={selectedId} visible={true} onClose={() => setTerminalTab("list")} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              /* No server selected – empty state only, no tabs */
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                {serversLoading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span>{t("servers.loading")}</span>
                  </>
                ) : (
                  <>
                    <Gamepad2 className="h-12 w-12 text-muted-foreground/40" />
                    <p>{t("servers.selectOrCreate")}</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Backup & Sync tab: sync now, file sync, progress, synced file tree, storage, backups. */
function ServerBackupSyncTab({
  server,
  syncedServer,
  websiteBackupsUrl,
  token,
  syncNow,
  refreshSynced,
  syncing: metaSyncing,
  fileSyncState,
  t,
}: {
  server: ServerConfig;
  syncedServer: SyncServerInfo | undefined;
  websiteBackupsUrl: string;
  token: string | null;
  syncNow: (serverId?: string) => Promise<string | undefined>;
  refreshSynced: () => Promise<void>;
  syncing: boolean;
  fileSyncState: SyncFilesState;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [savingTier, setSavingTier] = useState<"snapshot" | "structural" | "full" | "world" | "custom" | null>(null);
  const [includeServerJar, setIncludeServerJar] = useState(false);
  const [manualBackupOptionsOpen, setManualBackupOptionsOpen] = useState(false);
  const [scheduleOptionsOpen, setScheduleOptionsOpen] = useState(false);
  const [customizeBackupOpen, setCustomizeBackupOpen] = useState(false);
  const [customBackupName, setCustomBackupName] = useState("");
  const [customBackupCategories, setCustomBackupCategories] = useState<Record<string, boolean>>({
    world: true,
    config: false,
    mods: false,
    plugins: false,
    libraries: false,
    cache: false,
  });
  /** Path prefixes per category for custom backup (includePaths). */
  const CUSTOM_BACKUP_PREFIXES: Record<string, string[]> = {
    world: ["world", "world_nether", "world_the_end", "DIM-1", "DIM1"],
    config: ["config"],
    mods: ["mods"],
    plugins: ["plugins"],
    libraries: ["libraries"],
    cache: ["cache", "logs"],
  };
  const { report, list, limits, loading: _loading, error: _error, refresh } = useBackupData(token, true);
  const { manifest, scanning, error: scanError, scan } = useServerBackupScan();
  const iterations = useBackupIterations(
    token,
    server.id,
    server.name,
    syncedServer?.id ?? null,
    { onIterationCreated: refresh, syncedServer: syncedServer ?? undefined }
  );
  const isSynced = !!syncedServer;
  const backupsForThisServer = syncedServer
    ? list.filter((b) => b.serverId === syncedServer.id)
    : [];
  const hasBackend = !!getApiBaseUrl();
  const hasFullBackup = syncedServer ? backupsForThisServer.some((b) => b.kind === "full") : false;

  useEffect(() => {
    if (syncedServer?.id && token) {
      fileSyncState.refreshSyncedFiles(syncedServer.id);
      fileSyncState.refreshSummary(syncedServer.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedServer?.id, token]);

  // Auto-scan when Backup & Sync tab is shown (desktop only); keep scan in sync with synced storage
  useEffect(() => {
    if (!isTauri() || !server?.id || fileSyncState.syncing) return;
    scan(server.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  // Re-scan after sync completes so local file scan matches synced storage
  const prevSyncingRef = useRef(false);
  useEffect(() => {
    const wasSyncing = prevSyncingRef.current;
    prevSyncingRef.current = fileSyncState.syncing;
    if (wasSyncing && !fileSyncState.syncing && server?.id && isTauri()) {
      scan(server.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileSyncState.syncing, server?.id]);

  const uploadManifestOnly = async (backendServerId: string): Promise<boolean> => {
    if (!backendServerId || !token || !manifest?.files?.length) return false;
    const fileList = manifest.files.map((f) => f.path);
    const treeForSnapshot = manifestTreeToSnapshotTree(buildManifestTree(manifest.files));
    const categoriesBreakdown = (() => {
      const c: Record<string, number> = { config: 0, world: 0, mod: 0, plugin: 0, library: 0, jar: 0, cache: 0, other: 0 };
      for (const f of manifest.files) {
        if (f.category && f.category in c) c[f.category]++;
      }
      const essential = (c.config ?? 0) + (c.world ?? 0) + (c.mod ?? 0) + (c.plugin ?? 0) + (c.other ?? 0);
      const downloadable = (c.library ?? 0) + (c.jar ?? 0) + (c.cache ?? 0);
      return { ...c, essential_count: essential, downloadable_count: downloadable };
    })();
    const preset =
      server.server_type || server.minecraft_version
        ? {
            server_type: server.server_type || undefined,
            minecraft_version: server.minecraft_version || undefined,
            loader_version: server.minecraft_version || undefined,
          }
        : undefined;
    const manifestData: Record<string, unknown> = {
      syncedAt: new Date().toISOString(),
      fileList: fileList.length > 0 ? fileList : undefined,
      mods: manifest?.mods?.map((m) => m.name) ?? [],
      plugins: manifest?.plugins?.map((p) => p.name) ?? [],
      version: server.minecraft_version || undefined,
      server_name: server.name || undefined,
      server_type: server.server_type || undefined,
      minecraft_version: server.minecraft_version || undefined,
      ...(preset && { preset }),
      ...(manifest?.mustFiles && manifest.mustFiles.length > 0 && { mustFiles: manifest.mustFiles }),
      ...(manifest?.cacheFiles && manifest.cacheFiles.length > 0 && { cacheFiles: manifest.cacheFiles }),
      ...(Array.isArray(treeForSnapshot) && treeForSnapshot.length > 0 && { file_tree: treeForSnapshot }),
      ...(typeof categoriesBreakdown === "object" && { categories: categoriesBreakdown }),
    };
    const estimatedTotalBytes = (manifest?.summary ? manifest.summary.smallBytes + manifest.summary.bigBytes : 0) || 0;
    try {
      await api.postSyncManifest(token, backendServerId, {
        manifestType: "combined",
        fileCount: manifest.files.filter((f) => !f.isDir).length,
        totalBytes: estimatedTotalBytes,
        manifestData,
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleSnapshotOnly = async () => {
    let backendServerId = syncedServer?.id;
    if (!backendServerId && token) {
      backendServerId = await syncNow(server.id);
    }
    if (!backendServerId || !token) return;
    setSavingTier("snapshot");
    try {
      const ok = await uploadManifestOnly(backendServerId);
      if (!ok) {
        toast.error(t("servers.snapshotUploadFailed", { defaultValue: "Could not upload snapshot. Scan server first." }));
        return;
      }
      await api.createArchive(token, backendServerId, { saveTier: "snapshot", keepLiveSync: true });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await refreshSynced();
      refresh();
      toast.success(t("servers.snapshotCreated", { defaultValue: "Snapshot saved. Backup is in Archives; live sync kept — archive from website when you want a point-in-time." }));
    } catch (e) {
      toast.error((e as Error)?.message ?? "Failed to create snapshot");
    } finally {
      setSavingTier(null);
    }
  };

  const handleStructural = async () => {
    let backendServerId = syncedServer?.id;
    if (!backendServerId && token) {
      backendServerId = await syncNow(server.id);
    }
    if (!backendServerId || !token) return;
    setSavingTier("structural");
    try {
      await uploadManifestOnly(backendServerId);
      await fileSyncState.syncMiniFiles(server.id, backendServerId, { includeBig: false, includeServerJar });
      await api.syncServer(token, {
        hostId: server.id,
        name: server.name,
        miniSynced: true,
        lastSyncedAt: new Date().toISOString(),
        metadata: {
          server_type: server.server_type,
          minecraft_version: server.minecraft_version,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, { saveTier: "structural", keepLiveSync: true });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await refreshSynced();
      refresh();
      toast.success(t("servers.structuralSaved", { defaultValue: "Structural backup saved. Backup is in Archives; live sync kept." }));
    } catch (e) {
      toast.error((e as Error)?.message ?? "Failed to save structural backup");
    } finally {
      setSavingTier(null);
    }
  };

  const handleFull = async () => {
    let backendServerId = syncedServer?.id;
    if (!backendServerId && token) {
      backendServerId = await syncNow(server.id);
    }
    if (!backendServerId || !token) return;
    setSavingTier("full");
    try {
      await uploadManifestOnly(backendServerId);
      await fileSyncState.syncMiniFiles(server.id, backendServerId, { includeBig: true, includeServerJar: true });
      await api.syncServer(token, {
        hostId: server.id,
        name: server.name,
        miniSynced: true,
        lastSyncedAt: new Date().toISOString(),
        metadata: {
          server_type: server.server_type,
          minecraft_version: server.minecraft_version,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, { saveTier: "full", keepLiveSync: true });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await refreshSynced();
      refresh();
      toast.success(t("servers.fullBackupSaved", { defaultValue: "Full backup saved. Backup is in Archives; live sync kept." }));
    } catch (e) {
      toast.error((e as Error)?.message ?? "Failed to save full backup");
    } finally {
      setSavingTier(null);
    }
  };

  const handleMapBackup = async () => {
    let backendServerId = syncedServer?.id;
    if (!backendServerId && token) backendServerId = await syncNow(server.id);
    if (!backendServerId || !token) return;
    setSavingTier("world");
    try {
      await uploadManifestOnly(backendServerId);
      await fileSyncState.syncMiniFiles(server.id, backendServerId, { includeBig: true, includeServerJar: false });
      await api.syncServer(token, {
        hostId: server.id,
        name: server.name,
        miniSynced: true,
        lastSyncedAt: new Date().toISOString(),
        metadata: {
          server_type: server.server_type,
          minecraft_version: server.minecraft_version,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, {
        name: `${server.name} Map ${new Date().toISOString().slice(0, 10)}`,
        saveTier: "world",
        scope: "world",
        keepLiveSync: true,
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await refreshSynced();
      refresh();
      toast.success(t("servers.mapBackupSaved", { defaultValue: "Map backup saved (worlds only). In Archives; live sync kept." }));
    } catch (e) {
      toast.error((e as Error)?.message ?? "Failed to save map backup");
    } finally {
      setSavingTier(null);
    }
  };

  const handleCustomBackup = async () => {
    const selected = Object.entries(customBackupCategories)
      .filter(([, v]) => v)
      .flatMap(([k]) => CUSTOM_BACKUP_PREFIXES[k] ?? []);
    if (selected.length === 0) {
      toast.error(t("servers.customBackupSelectOne", { defaultValue: "Select at least one category (e.g. World, Config)." }));
      return;
    }
    let backendServerId = syncedServer?.id;
    if (!backendServerId && token) backendServerId = await syncNow(server.id);
    if (!backendServerId || !token) return;
    setSavingTier("custom");
    try {
      await uploadManifestOnly(backendServerId);
      await fileSyncState.syncMiniFiles(server.id, backendServerId, { includeBig: true, includeServerJar });
      await api.syncServer(token, {
        hostId: server.id,
        name: server.name,
        miniSynced: true,
        lastSyncedAt: new Date().toISOString(),
        metadata: {
          server_type: server.server_type,
          minecraft_version: server.minecraft_version,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      const name =
        customBackupName.trim() ||
        `${server.name} Custom ${new Date().toISOString().slice(0, 10)}`;
      await api.createArchive(token, backendServerId, {
        name,
        saveTier: "full",
        includePaths: selected,
        keepLiveSync: true,
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await refreshSynced();
      refresh();
      setCustomizeBackupOpen(false);
      setCustomBackupName("");
      toast.success(t("servers.customBackupSaved", { defaultValue: "Custom backup saved. In Archives; live sync kept." }));
    } catch (e) {
      toast.error((e as Error)?.message ?? "Failed to save custom backup");
    } finally {
      setSavingTier(null);
    }
  };

  const summary = fileSyncState.summary;

  const syncedPathSet = isSynced && fileSyncState.syncedFiles.length > 0 ? new Set(fileSyncState.syncedFiles.map((f) => f.filePath)) : null;
  const displayProgress =
    syncedPathSet
      ? fileSyncState.progress.map((p) =>
          p.status === "failed" && syncedPathSet.has(p.filePath) ? { ...p, status: "done" as const, error: undefined } : p
        )
      : fileSyncState.progress;
  const hasLiveData = syncedServer?.miniSynced === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col min-h-0 min-w-0"
    >
      {/* Cloud hero: status + backup storage + server info + full backup + links (compact, all in one) */}
      <div
        className={cn(
          "shrink-0 rounded-xl border p-4 mb-4 space-y-3",
          isSynced ? "border-border bg-card/50" : "border-border bg-card/50"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Cloudy className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isSynced ? t("servers.syncedToWebsite") : t("servers.notSynced")}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {isSynced
                  ? (syncedServer!.lastSyncedAt ? new Date(syncedServer!.lastSyncedAt).toLocaleString() : "") +
                    (limits != null ? ` · ${limits.count}/${limits.maxBackups} backups` : syncedServer!.backupCount ? ` · ${syncedServer!.backupCount} backup(s)` : "")
                  : !hasBackend ? t("servers.backupBackendNotConfigured", { defaultValue: "Backend not configured" }) : !token ? t("servers.signInFirst", { defaultValue: "Sign in first" }) : t("servers.clickStartToRegister", { defaultValue: "Start to register this server with the cloud and sync server info." })}
                <span className="inline-flex shrink-0 cursor-help" title={`${t("servers.serverIdTooltip", { defaultValue: "Server ID" })}: ${server.id}`}>
                  <Info className="h-3 w-3 text-muted-foreground/70" />
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={isSynced ? "secondary" : "default"} disabled={metaSyncing || !hasBackend || !token} onClick={() => syncNow(server.id)}>
              {metaSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1">{isSynced ? t("servers.refreshReport", { defaultValue: "Refresh" }) : t("servers.startCloudBackup", { defaultValue: "Start cloud backup" })}</span>
            </Button>
          </div>
        </div>
        {isTauri() && isSynced && (
          <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t("servers.manualBackup", { defaultValue: "Manual backup" })}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("servers.saveTiersIntro", { defaultValue: "Choose what to save. Backup appears in Archives; live sync is kept." })}
              </p>
            </div>
            {/* Small buttons: Snapshot, Structural, Full, Map backup, Customize */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-500/60 text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                disabled={!!savingTier || fileSyncState.syncing || !token || !manifest?.files?.length}
                onClick={handleSnapshotOnly}
              >
                {savingTier === "snapshot" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="ml-1">{t("servers.saveSnapshot", { defaultValue: "Snapshot" })}</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-blue-900/40 text-blue-200 border-blue-600/50 hover:bg-blue-800/50"
                disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                onClick={handleStructural}
                title={!hasLiveData ? t("servers.syncFirstToUpload", { defaultValue: "Sync first to upload data" }) : undefined}
              >
                {savingTier === "structural" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                <span className="ml-1">{t("servers.saveStructural", { defaultValue: "Structural" })}</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-700 hover:bg-emerald-600 text-white border-0"
                disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                onClick={handleFull}
                title={!hasLiveData ? t("servers.syncFirstToUpload", { defaultValue: "Sync first to upload data" }) : undefined}
              >
                {savingTier === "full" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                <span className="ml-1">{t("servers.saveFull", { defaultValue: "Full backup" })}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/50 text-amber-200 hover:bg-amber-900/30"
                disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                onClick={handleMapBackup}
                title={t("servers.mapBackupTooltip", { defaultValue: "World/map folders only (world, world_nether, world_the_end)" })}
              >
                {savingTier === "world" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                <span className="ml-1">{t("servers.saveMapBackup", { defaultValue: "Map backup" })}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-border text-muted-foreground hover:text-foreground"
                disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                onClick={() => setCustomizeBackupOpen((o) => !o)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="ml-1">{t("servers.customizeBackup", { defaultValue: "Customize" })}</span>
              </Button>
            </div>
            {!hasLiveData && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t("servers.syncFirstHint", { defaultValue: "Sync first to upload data, then choose Structural, Full, Map or Customize. Snapshot is available now." })}
              </p>
            )}
            {/* Customize panel: choose categories + optional name */}
            {customizeBackupOpen && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  {t("servers.customBackupHint", { defaultValue: "Select which parts to include. Then create backup (syncs files first if needed)." })}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(["world", "config", "mods", "plugins", "libraries", "cache"] as const).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customBackupCategories[key]}
                        onChange={(e) =>
                          setCustomBackupCategories((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="rounded border-border"
                      />
                      {key === "world"
                        ? t("servers.customWorld", { defaultValue: "World (map)" })
                        : key === "config"
                          ? t("servers.customConfig", { defaultValue: "Config" })
                          : key === "mods"
                            ? t("servers.customMods", { defaultValue: "Mods" })
                            : key === "plugins"
                              ? t("servers.customPlugins", { defaultValue: "Plugins" })
                              : key === "libraries"
                                ? t("servers.customLibraries", { defaultValue: "Libraries" })
                                : t("servers.customCache", { defaultValue: "Cache & logs" })}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={customBackupName}
                    onChange={(e) => setCustomBackupName(e.target.value)}
                    placeholder={t("servers.customBackupNamePlaceholder", { defaultValue: "Backup name (optional)" })}
                    className="h-8 rounded border border-border bg-background px-2 text-xs w-48"
                  />
                  <Button
                    size="sm"
                    disabled={
                      savingTier === "custom" ||
                      fileSyncState.syncing ||
                      !token ||
                      !Object.values(customBackupCategories).some(Boolean)
                    }
                    onClick={handleCustomBackup}
                  >
                    {savingTier === "custom" ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
                    <span className={savingTier === "custom" ? "ml-1" : ""}>{t("servers.createCustomBackup", { defaultValue: "Create custom backup" })}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCustomizeBackupOpen(false)}>
                    {t("servers.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </div>
              </div>
            )}
            {/* More options: collapsible */}
            <div className="border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={() => setManualBackupOptionsOpen((o) => !o)}
                className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {manualBackupOptionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Settings2 className="h-3.5 w-3.5" />
                {t("servers.moreBackupOptions", { defaultValue: "More backup options" })}
              </button>
              {manualBackupOptionsOpen && (
                <div className="mt-2 pl-6 space-y-2 text-[11px]">
                  <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeServerJar}
                      onChange={(e) => setIncludeServerJar(e.target.checked)}
                      className="rounded border-border"
                    />
                    {t("servers.includeServerJar", { defaultValue: "Include server JAR (re-download from preset when restoring)" })}
                  </label>
                  <p className="text-muted-foreground/90">
                    Always included in Full; optional for Structural, Map, Custom.
                  </p>
                  <p className="text-muted-foreground/90">
                    Snapshot = metadata only (free). Structural = no worlds. Full = everything. Map = worlds only. Customize = pick folders (World, Config, Mods, etc.).
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backup storage + server info: one compact row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {token && report && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1" title={t("servers.storageUsageTooltip", { defaultValue: "Storage used on cloud for all your servers" })}>
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded bg-muted/80 px-1.5 py-0.5 font-medium capitalize">{report.tierId ?? "—"}</span>
              </span>
              <span className="text-muted-foreground">
                {formatBytes(report.totalSizeBytes)} used ({report.totalCount} backup{report.totalCount !== 1 ? "s" : ""})
              </span>
              {report.storageLimitBytes != null && report.storageLimitBytes > 0 && (
                <span className="text-muted-foreground">
                  {formatBytes(report.totalSizeBytes)} / {formatBytes(report.storageLimitBytes)}
                  {report.storageLimitGb != null ? ` (${report.storageLimitGb} GB)` : ""}
                </span>
              )}
              {(report.miniBytes != null || report.bigBytes != null) && (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Mini: {formatBytes(report.miniBytes ?? 0)}</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Big: {formatBytes(report.bigBytes ?? 0)}</span>
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap" title={t("servers.thisServerTooltip", { defaultValue: "This server" })}>
            <Info className="h-3 w-3 text-muted-foreground/70 shrink-0" />
            <span className="text-muted-foreground">
              {server.server_type} · {server.minecraft_version} · {server.memory_mb} MB RAM
            </span>
          </div>
        </div>

        {/* Full backup hint + single link to website */}
        {isSynced && websiteBackupsUrl && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2">
            <span className="text-xs text-muted-foreground">
              {hasFullBackup
                ? t("servers.fullBackupDoneHint", { defaultValue: "This server has a full backup. View and download on the website." })
                : t("servers.fullBackupCtaHint", { defaultValue: "Sync Files uploads mini and big files from the app. For a single zip snapshot of the whole server folder, create a full backup on the website." })}
            </span>
            <a
              href={websiteBackupsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {t("servers.viewBackupsAndReportOnWeb", { defaultValue: "View backups & report on web" })}
            </a>
          </div>
        )}
        {isSynced && report?.filesTooBigCount != null && report.filesTooBigCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("servers.filesTooBigCount", { count: report.filesTooBigCount })}</p>
        )}
      </div>

      {/* Body: live sync, iterations, storage, scan, tree, backups — all in one scrollable column (parent has overflow-y-auto) */}
      <div className="flex flex-col gap-4 pr-1 pb-4 text-sm min-w-0">
        {/* Live sync — runs in background when you switch tabs; full-width panel */}
        <SyncProgressPanel
        progress={displayProgress}
        current={fileSyncState.current}
        total={fileSyncState.total}
        syncing={fileSyncState.syncing}
        lastSyncCompletedAt={fileSyncState.lastSyncCompletedAt}
        legendText={t("servers.syncProgressLegend")}
        failedHintText={t("servers.syncFailedHint")}
        fileMeta={
          manifest
            ? (() => {
                const m = new Map() as FileMetaMap;
                for (const f of manifest.files) {
                  if (f.isDir) continue;
                  m.set(f.path, {
                    sizeBytes: f.sizeBytes,
                    storage: f.storage === "big" ? "big" : "small",
                  });
                }
                return m;
              })()
            : undefined
        }
      />
        {fileSyncState.error && (
          <p className="text-xs text-destructive px-1">{fileSyncState.error}</p>
        )}

        {/* Your schedule: main = toggles + Save now; more options = save tier, times */}
        {isSynced && syncedServer && (
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{t("servers.yourSchedule", { defaultValue: "Your schedule" })}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">{t("servers.occurrencesSyncHint", { defaultValue: "Auto-save to cloud. Syncs with website." })}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => refreshSynced()} title={t("servers.refreshReport", { defaultValue: "Refresh" })}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {getCloudServerUrl(syncedServer.id) && (
                  <a
                    href={getCloudServerUrl(syncedServer.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {t("servers.editOnWeb", { defaultValue: "Edit on web" })}
                  </a>
                )}
              </div>
            </div>
            {iterations.error && <p className="text-xs text-destructive">{iterations.error}</p>}
            {/* More schedule options: save tier, tuning — collapsible */}
            <div className="rounded-lg border border-border/50 bg-muted/10 p-2">
              <button
                type="button"
                onClick={() => setScheduleOptionsOpen((o) => !o)}
                className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {scheduleOptionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Settings2 className="h-3.5 w-3.5" />
                {t("servers.moreScheduleOptions", { defaultValue: "More schedule options" })}
              </button>
              {scheduleOptionsOpen && (
                <div className="mt-2 pl-6 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t("servers.iterationsSaveAs", { defaultValue: "When saving on schedule:" })}</span>
                    <div className="flex rounded-lg border border-border/60 bg-muted/20 p-0.5">
                      {(["snapshot", "structural", "full"] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => iterations.setSchedule({ saveTier: tier })}
                          className={cn(
                            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                            (iterations.schedule.saveTier ?? "snapshot") === tier
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {tier === "snapshot" ? t("servers.tierSnapshot", { defaultValue: "Snapshot" }) : tier === "structural" ? t("servers.tierStructural", { defaultValue: "Structural" }) : t("servers.tierFull", { defaultValue: "Full" })}
                        </button>
                      ))}
                    </div>
                    <span className="text-muted-foreground/80 text-[11px]">
                      {((iterations.schedule.saveTier ?? "snapshot") === "snapshot" && t("servers.iterationsSaveAsSnapshotHint", { defaultValue: "Metadata only" })) ||
                        ((iterations.schedule.saveTier ?? "snapshot") === "structural" && t("servers.iterationsSaveAsStructuralHint", { defaultValue: "Config + mods + plugins" })) ||
                        t("servers.iterationsSaveAsFullHint", { defaultValue: "Everything" })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80">
                    {t("servers.scheduleOptionsHint", { defaultValue: "Set time and day below per row when that schedule is on." })}
                  </p>
                </div>
              )}
            </div>
            {/* Main: occurrence toggles + Save now — most visible */}
            <div className="space-y-1.5">
              {(() => {
                const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
                  value: d,
                  label: new Date(2000, 0, 2 + d).toLocaleDateString(undefined, { weekday: "short" }),
                }));
                const intervalHours = iterations.schedule.intervalHours ?? INTERVAL_HOURS_DEFAULT;
                const intervalLabel = getIntervalLabel(intervalHours);
                const rows: Array<{ key: "3h" | "daily" | "weekly" | "monthly"; label: string; scheduleKey: "every3h" | "daily" | "weekly" | "monthly" }> = [
                  { key: "3h", label: intervalLabel, scheduleKey: "every3h" },
                  { key: "daily", label: t("servers.iterationsDaily", { defaultValue: "Daily" }), scheduleKey: "daily" },
                  { key: "weekly", label: t("servers.iterationsWeekly", { defaultValue: "Weekly" }), scheduleKey: "weekly" },
                  { key: "monthly", label: t("servers.iterationsMonthly", { defaultValue: "Monthly" }), scheduleKey: "monthly" },
                ];
                return rows.map(({ key, label, scheduleKey }) => {
                  const enabled = iterations.schedule[scheduleKey];
                  const lastRunKey = key === "3h" ? "3h" : key;
                  const last = iterations.lastRun?.[lastRunKey];
                  const next = iterations.nextRun[key];
                  const dailyAt = iterations.schedule.dailyAt ?? "02:00";
                  const weeklyOn = iterations.schedule.weeklyOn ?? 0;
                  const monthlyDay = iterations.schedule.monthlyDay ?? 1;
                  const monthlyAt = iterations.schedule.monthlyAt ?? "02:00";
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                        enabled ? "border-border/80 bg-muted/30" : "border-border/50 bg-muted/10"
                      )}
                    >
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => iterations.setSchedule({ [scheduleKey]: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span className="font-medium text-foreground">{key === "3h" ? getIntervalLabel(intervalHours) : label}</span>
                      </label>
                      {key === "3h" && enabled && (
                        <div className="flex flex-wrap items-center gap-1">
                          {INTERVAL_HOURS_PRESETS.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => iterations.setSchedule({ intervalHours: h })}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium min-h-[24px]",
                                intervalHours === h ? "bg-primary text-primary-foreground" : "bg-muted/80 text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {h === 1 ? "1h" : `${h}h`}
                            </button>
                          ))}
                          <input
                            type="number"
                            min={INTERVAL_HOURS_MIN}
                            max={INTERVAL_HOURS_MAX}
                            value={intervalHours}
                            onChange={(e) => {
                              const v = Math.min(INTERVAL_HOURS_MAX, Math.max(INTERVAL_HOURS_MIN, parseInt(e.target.value, 10) || INTERVAL_HOURS_DEFAULT));
                              iterations.setSchedule({ intervalHours: v });
                            }}
                            className="h-6 w-10 rounded border border-border bg-background px-1 text-[10px] tabular-nums"
                          />
                        </div>
                      )}
                      {key === "daily" && enabled && (
                        <input
                          type="time"
                          value={dailyAt}
                          onChange={(e) => iterations.setSchedule({ dailyAt: e.target.value || "02:00" })}
                          className="h-6 rounded border border-border bg-background px-1.5 text-[10px] tabular-nums"
                        />
                      )}
                      {key === "weekly" && enabled && (
                        <select
                          value={weeklyOn}
                          onChange={(e) => iterations.setSchedule({ weeklyOn: parseInt(e.target.value, 10) })}
                          className="h-6 rounded border border-border bg-background px-1.5 text-[10px]"
                        >
                          {WEEKDAYS.map(({ value, label: dayLabel }) => (
                            <option key={value} value={value}>{dayLabel}</option>
                          ))}
                        </select>
                      )}
                      {key === "monthly" && enabled && (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={monthlyDay}
                            onChange={(e) => iterations.setSchedule({ monthlyDay: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                            className="h-6 w-9 rounded border border-border bg-background px-1 text-[10px] tabular-nums"
                            title={t("servers.iterationsMonthlyDay", { defaultValue: "Day" })}
                          />
                          <input
                            type="time"
                            value={monthlyAt}
                            onChange={(e) => iterations.setSchedule({ monthlyAt: e.target.value || "02:00" })}
                            className="h-6 rounded border border-border bg-background px-1.5 text-[10px] tabular-nums"
                          />
                        </>
                      )}
                      {last && (
                        <span className="tabular-nums text-[10px] text-muted-foreground" title={t("servers.iterationsLastRun", { defaultValue: "Last run" })}>
                          {new Date(last).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      {next && next.getTime() > Date.now() && (
                        <span className="tabular-nums text-[10px] text-muted-foreground flex items-center gap-0.5" title={t("servers.iterationsNextRun", { defaultValue: "Next" })}>
                          <Clock className="h-2.5 w-2.5" />
                          {next.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      <Button
                        variant={enabled ? "secondary" : "outline"}
                        size="sm"
                        className="h-6 px-2 text-[10px] shrink-0"
                        disabled={iterations.running}
                        onClick={() => iterations.runNow(key)}
                      >
                        {iterations.running ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                        <span className="ml-0.5">{t("servers.iterationsSaveNow", { defaultValue: "Save now" })}</span>
                      </Button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Your backups — always visible when synced; empty state when none */}
        {isSynced && (
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <p className="font-medium text-foreground text-sm">
              {t("servers.yourBackups", { defaultValue: "Your backups" })}
              {backupsForThisServer.length > 0 && ` (${backupsForThisServer.length})`}
            </p>
            {backupsForThisServer.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {backupsForThisServer.slice(0, 15).map((b) => {
                  const detailUrl = getBackupDetailUrl(b.id);
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-xs"
                    >
                      <span className="font-medium text-foreground truncate" title={b.name}>{b.name}</span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                        <span>{new Date(b.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                        <span>{formatBytes(b.sizeBytes)}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            b.kind === "full" && "bg-emerald-900/60 text-emerald-300",
                            b.kind === "structural" && "bg-blue-900/50 text-blue-300",
                            b.kind === "snapshot" && "bg-zinc-600/60 text-zinc-400",
                            (b.kind as string) === "world" && "bg-amber-900/50 text-amber-300",
                            !["full", "structural", "snapshot", "world"].includes(b.kind as string) && "bg-muted text-muted-foreground capitalize"
                          )}
                        >
                          {b.kind === "full"
                            ? t("servers.tierFull", { defaultValue: "Full" })
                            : b.kind === "structural"
                              ? t("servers.tierStructural", { defaultValue: "Structural" })
                              : b.kind === "snapshot"
                                ? t("servers.tierSnapshot", { defaultValue: "Snapshot" })
                                : (b.kind as string) === "world"
                                  ? t("servers.tierWorld", { defaultValue: "Map" })
                                  : b.kind}
                        </span>
                      </div>
                      {detailUrl && (
                        <a
                          href={detailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {t("servers.downloadOrViewOnWeb", { defaultValue: "Download on web" })}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-3">
                {t("servers.backupsEmptyHint", { defaultValue: "No snapshots yet. Turn on a schedule above or use Save now to create one." })}
              </p>
            )}
          </div>
        )}

        {/* File storage & scan: one card with stats, two-column small|big lists, mods/plugins, optional tree */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground flex items-center gap-2 text-sm">
              <ScanSearch className="h-4 w-4" />
              {t("servers.localScan", { defaultValue: "Local file scan" })}
              {isTauri() && scanning && (
                <span className="text-xs font-normal text-muted-foreground">(scanning…)</span>
              )}
            </p>
            {isTauri() && (
              <Button variant="outline" size="sm" disabled={scanning} onClick={() => scan(server.id)}>
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Scan</span>
              </Button>
            )}
          </div>
          {summary && summary.syncedFiles.totalFiles > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block align-middle mr-0.5" />
              {manifest && manifest.summary.smallCount > 0 ? `${summary.syncedFiles.mini} of ${manifest.summary.smallCount} mini` : `${summary.syncedFiles.mini} mini`}
              {" · "}
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block align-middle mr-0.5" />
              {manifest && manifest.summary.bigCount > 0 ? `${summary.syncedFiles.big} of ${manifest.summary.bigCount} big` : `${summary.syncedFiles.big} big`}
              {" "}
              {t("servers.syncedToWebsite").toLowerCase()}
            </p>
          )}
          {!summary?.syncedFiles.totalFiles && manifest && (
            <p className="text-xs text-muted-foreground">0 synced. Use Sync to latest to upload.</p>
          )}
          {(() => {
            const failed = fileSyncState.progress.filter((p) => p.status === "failed");
            const syncedSet = isSynced ? new Set(fileSyncState.syncedFiles.map((f) => f.filePath)) : new Set<string>();
            const bigFailed = failed.filter(
              (p) => manifest?.files.find((f) => f.path === p.filePath && !f.isDir)?.storage === "big" && !syncedSet.has(p.filePath)
            );
            const otherFailed = failed.filter((p) => !syncedSet.has(p.filePath));
            if (bigFailed.length > 0) {
              return <p className="text-xs text-amber-600 dark:text-amber-400">{bigFailed.length} big not on server. Fix nginx/backend limits and run Sync to latest again.</p>;
            }
            if (otherFailed.length > 0) {
              return <p className="text-xs text-amber-600 dark:text-amber-400">{otherFailed.length} file(s) not on server. Run Sync to latest again after fixing server.</p>;
            }
            return null;
          })()}
          {scanError && <p className="text-xs text-destructive">{scanError}</p>}
          {manifest ? (
            (() => {
              const stillFailed = syncedPathSet
                ? fileSyncState.progress.filter((p) => p.status === "failed" && !syncedPathSet.has(p.filePath))
                : fileSyncState.progress.filter((p) => p.status === "failed");
              return (
                <BackupManifestView
                  manifest={manifest}
                  t={(k) => t(k)}
                  syncedFilePaths={syncedPathSet ?? undefined}
                  failedFilePaths={stillFailed.length > 0 ? new Map(stillFailed.map((p) => [p.filePath, p.error ?? ""])) : undefined}
                />
              );
            })()
          ) : (
            <p className="text-xs text-muted-foreground">
              {isTauri() ? "Scan runs automatically. Scan server files to see storage breakdown and file tree." : "Only available in the desktop app."}
            </p>
          )}
        </div>

        {/* Synced files tree */}
        {isSynced && fileSyncState.syncedFiles.length > 0 && (
          <SyncedFilesTree files={fileSyncState.syncedFiles} />
        )}
      </div>
    </motion.div>
  );
}

/* Extracted overview panel to reduce main component complexity */
function ServerOverview({
  server: s,
  isRunning,
  isStarting,
  anyRunning,
  isSynced,
  websiteBackupsUrl,
  onStart,
  onStop,
  publicIp,
  publicIpLoading,
  publicIpError,
  tunnelUrl,
  tunnelMethod,
  tunnelLoading,
  tunnelStatus,
  tunnelError,
  firewallMessage,
  firewallLoading,
  firewallFeedback,
  onSetFirewallMessage,
  onSetFirewallFeedback,
  onSetFirewallLoading,
  onSetTunnelUrl,
  onSetTunnelMethod,
  onSetTunnelLoading,
  onSetTunnelStatus,
  onSetTunnelError,
  t,
}: {
  server: ServerConfig;
  isRunning: boolean;
  isStarting: boolean;
  anyRunning: boolean;
  isSynced: boolean;
  websiteBackupsUrl: string;
  onStart: () => void;
  onStop: () => void;
  publicIp: string | null;
  publicIpLoading: boolean;
  publicIpError: string | null;
  tunnelUrl: string | null;
  tunnelMethod: "relay" | "upnp" | null;
  tunnelLoading: boolean;
  tunnelStatus: "preparing" | "downloading" | "connecting" | null;
  tunnelError: string | null;
  firewallMessage: string | null;
  firewallLoading: boolean;
  firewallFeedback: { success: boolean; message: string } | null;
  onSetFirewallMessage: (m: string | null) => void;
  onSetFirewallFeedback: (f: { success: boolean; message: string } | null) => void;
  onSetFirewallLoading: (l: boolean) => void;
  onSetTunnelUrl: (u: string | null) => void;
  onSetTunnelMethod: (m: "relay" | "upnp" | null) => void;
  onSetTunnelLoading: (l: boolean) => void;
  onSetTunnelStatus: (s: "preparing" | "downloading" | "connecting" | null) => void;
  onSetTunnelError: (e: string | null) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [shareMethodPreference, setShareMethodPreference] = useState<"relay" | "upnp">("relay");
  const [consoleLines, setConsoleLines] = useState<string[]>(getOutputLines);
  const [commandLine, setCommandLine] = useState("");
  const [serverStats, setServerStats] = useState<{
    uptime_secs: number;
    memory_used_mb: number;
    memory_allocated_mb: number;
    cpu_percent: number;
  } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    setConsoleLines(getOutputLines());
    const unsub = subscribeLines(() => {
      setConsoleLines(getOutputLines());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isRunning || !s) {
      setServerStats(null);
      return;
    }
    const fetchStats = () => {
      invoke<typeof serverStats>("get_server_stats", { serverId: s.id })
        .then((stats) => stats && setServerStats(stats))
        .catch(() => setServerStats(null));
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [isRunning, s?.id]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  const handleLogScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

  const sendCommand = useCallback(() => {
    const line = commandLine.trim();
    if (!line) return;
    const toSend = line.endsWith("\n") ? line : `${line}\n`;
    invoke("send_server_input", { input: toSend }).catch(() => {});
    setCommandLine("");
  }, [commandLine]);

  if (!s) return null;
  const publicAddress = publicIp ? formatPublicAddress(publicIp, s.port) : null;
  const shareAddress = tunnelUrl ? tunnelUrl.replace(/^tcp:\/\//, "") : null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onSetFirewallMessage(t("servers.copied"));
      setTimeout(() => onSetFirewallMessage(null), 2000);
    } catch {
      onSetFirewallMessage(t("servers.copyFailed"));
    }
  };

  const stopShareAndTryOther = async () => {
    try {
      await invoke("stop_tunnel").catch(() => {});
      await invoke("remove_upnp_if_active").catch(() => {});
      onSetTunnelUrl(null);
      onSetTunnelMethod(null);
      onSetTunnelError(null);
    } catch {}
  };

  const startShare = async () => {
    onSetTunnelError(null);
    onSetTunnelStatus(null);
    onSetTunnelLoading(true);
    const useUpnpFirst = shareMethodPreference === "upnp";
    try {
      if (useUpnpFirst) {
        const upnpAddr = await Promise.race([
          invoke<string>("try_upnp_forward", { port: s.port }),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error("UPnP timeout")), 15_000)),
        ]).catch(() => null);
        if (upnpAddr) {
          onSetTunnelUrl(upnpAddr);
          onSetTunnelMethod("upnp");
          return;
        }
      }
      await invoke("set_server_online_mode_for_relay", { serverId: s.id }).catch(() => {});
      const unlisten = await listen<string>("tunnel-progress", (ev) => {
        const step = ev.payload;
        if (step === "preparing" || step === "downloading" || step === "connecting") onSetTunnelStatus(step);
      });
      try {
        const frp = getFrpPrefs();
        const relayToken = await getRelayTokenForTunnel(getToken());
        const token = relayToken || frp.token;
        if (!token) {
          onSetTunnelError(t("servers.shareSignInRequired"));
          return;
        }
        const url = await Promise.race([
          invoke<string>("start_tunnel", { port: s.port, method: "frp", frpConfig: { apiBaseUrl: frp.apiBaseUrl, serverAddr: frp.serverAddr, serverPort: frp.serverPort, token } }),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error(t("servers.shareTimeout"))), 120_000)),
        ]);
        onSetTunnelUrl(url);
        onSetTunnelMethod("relay");
      } finally {
        unlisten();
      }
    } catch (err) {
      onSetTunnelError(err instanceof Error ? err.message : String(err));
    } finally {
      onSetTunnelLoading(false);
      onSetTunnelStatus(null);
    }
  };

  const addFirewall = async () => {
    onSetFirewallFeedback(null);
    onSetFirewallLoading(true);
    try {
      await invoke("add_windows_firewall_rule", { port: s.port });
      onSetFirewallFeedback({ success: true, message: t("servers.firewallAdded") });
      setTimeout(() => onSetFirewallFeedback(null), 5000);
    } catch (err) {
      let msg = "";
      if (err != null && typeof err === "object") {
        const o = err as Record<string, unknown>;
        msg = typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : typeof o.data === "string" ? o.data : "";
      } else if (err instanceof Error) { msg = err.message; } else { msg = String(err); }
      if (!msg || msg.trim() === "") msg = t("servers.firewallErrorUnknown");
      onSetFirewallFeedback({ success: false, message: msg });
      setTimeout(() => onSetFirewallFeedback(null), 8000);
    } finally { onSetFirewallLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col gap-3"
    >
      {/* Header: server info + start/stop controls */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground truncate">{s.name}</h2>
            {isRunning && (
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{s.server_type} &middot; {s.minecraft_version}</span>
            <span>{s.memory_mb} MB RAM</span>
            <span className="font-mono">localhost:{s.port}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={onStop}>
              <Square className="h-3.5 w-3.5 fill-current" />
              {t("servers.contextStop")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={onStart}
              disabled={isStarting || anyRunning}
            >
              {isStarting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isStarting ? t("servers.starting", { name: "" }).replace(/[""].*/, "").trim() : t("servers.contextStart")}
            </Button>
          )}
        </div>
      </div>

      {/* Sync & website */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
        {isSynced ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Cloudy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/90" />
            {t("servers.syncedToWebsite")}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("servers.syncInSettings")}</span>
        )}
        {websiteBackupsUrl && (
          <a
            href={websiteBackupsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {t("servers.manageBackupsOnWeb")}
          </a>
        )}
      </div>

      {/* Server stats (when running) */}
      {isRunning && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/50 px-4 py-2.5 text-sm">
          <span className="font-medium text-muted-foreground">{t("servers.stats")}</span>
          {serverStats ? (
            <>
              <span className="text-foreground">
                {t("servers.uptime")}: {formatUptime(serverStats.uptime_secs)}
              </span>
              <span className="text-foreground">
                {t("servers.ramUsage")}: {serverStats.memory_used_mb} / {serverStats.memory_allocated_mb} MB
              </span>
              <span className="text-foreground">
                {t("servers.cpuUsage")}: {serverStats.cpu_percent.toFixed(1)}%
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("servers.statsLoading")}</span>
          )}
        </div>
      )}

      {/* Console log */}
      <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium text-foreground">{t("servers.terminal")}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              onClick={async () => {
                const text = stripAnsi(getRawBuffer());
                try {
                  await navigator.clipboard.writeText(text || " ");
                  toast.success(t("servers.copied"));
                } catch {
                  toast.error(t("servers.copyFailed"));
                }
              }}
            >
              <Copy className="h-3 w-3" /> {t("servers.copyTerminal")}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                clearServerOutput();
                autoScrollRef.current = true;
              }}
            >
              {t("dashboard.clear")}
            </button>
          </div>
        </div>
        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          className="flex-1 min-h-0 overflow-auto p-3 font-mono text-xs leading-relaxed"
          style={{ background: "hsl(var(--muted) / 0.3)" }}
        >
          {consoleLines.length === 0 ? (
            <p className="text-muted-foreground">{t("dashboard.waitingOutput")}</p>
          ) : (
            consoleLines.map((line, i) => (
              <div key={`${i}-${line.slice(0, 20)}`} className="break-all text-foreground/90">
                {stripAnsi(line)}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
        <div className="flex gap-2 border-t border-border bg-card/50 px-3 py-1.5">
          <input
            type="text"
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            )}
            placeholder={t("terminal.placeholder")}
            value={commandLine}
            onChange={(e) => setCommandLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendCommand();
              }
            }}
            disabled={!isRunning}
          />
          <Button
            variant="default"
            size="sm"
            className="gap-1 h-7 px-2.5 text-xs"
            onClick={sendCommand}
            disabled={!isRunning}
          >
            <Send className="h-3 w-3" />
            {t("terminal.send")}
          </Button>
        </div>
      </div>

      {/* Network & sharing section */}
      <div className="space-y-3">
        {isTauri() && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
            <p className="text-xs font-medium text-foreground">{t("servers.relayShareTitle")}</p>
            {shareAddress ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      tunnelMethod === "upnp"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                        : "bg-primary/20 text-primary"
                    )}
                  >
                    {tunnelMethod === "upnp" ? t("servers.shareViaUpnp") : t("servers.shareViaRelay")}
                  </span>
                  <span className="font-mono text-xs break-all text-foreground">{shareAddress}</span>
                  <Button variant="default" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => copyText(shareAddress)}>
                    <Copy className="h-3 w-3" /> {t("servers.copyAddress")}
                  </Button>
                </div>
                {tunnelMethod === "relay" && (
                  <p className="text-[11px] text-muted-foreground">{t("servers.relayRestartHint")}</p>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground hover:text-foreground" onClick={stopShareAndTryOther}>
                  {t("servers.shareTryOtherMethod")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">{t("servers.shareMethodLabel")}</p>
                  <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => setShareMethodPreference("relay")}
                      className={cn(
                        "flex-1 min-w-0 rounded-md px-3 py-2 text-left transition-colors",
                        shareMethodPreference === "relay"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      )}
                    >
                      <span className="block text-xs font-medium">{t("servers.shareMethodRelay")}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{t("servers.shareMethodRelayDesc")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareMethodPreference("upnp")}
                      className={cn(
                        "flex-1 min-w-0 rounded-md px-3 py-2 text-left transition-colors",
                        shareMethodPreference === "upnp"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      )}
                    >
                      <span className="block text-xs font-medium">{t("servers.shareMethodUpnp")}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{t("servers.shareMethodUpnpDesc")}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Button variant="default" size="sm" className="gap-1.5 h-7 text-xs" onClick={startShare} disabled={tunnelLoading}>
                    {tunnelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                    {tunnelLoading ? (tunnelStatus ? t(`servers.shareStatus.${tunnelStatus}`) : t("servers.relayConnecting")) : t("servers.shareServer")}
                  </Button>
                  {tunnelLoading && (
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-1/3 min-w-[4rem] bg-primary animate-pulse rounded-full" />
                    </div>
                  )}
                  {tunnelError && <p className="text-xs text-destructive">{tunnelError}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {publicIpLoading && <span className="text-xs">{t("servers.fetchingPublicIp")}</span>}
          {publicIp && (
            <span className="text-xs">
              {t("servers.publicAddress")}: <span className="font-mono text-foreground">{publicAddress}</span>
            </span>
          )}
          {publicIpError && <span className="text-xs text-destructive">{publicIpError}</span>}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => copyText(publicAddress ?? `localhost:${s.port}`)}>
            <Copy className="h-3 w-3" /> {t("servers.copyAddress")}
          </Button>
          {isTauri() && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={addFirewall} disabled={firewallLoading}>
                {firewallLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                {firewallLoading ? t("servers.firewallAdding") : t("servers.openPortFirewall")}
              </Button>
              {firewallFeedback && (
                <span className={cn("text-xs", firewallFeedback.success ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                  {firewallFeedback.message}
                </span>
              )}
            </>
          )}
          {firewallMessage && <span className="text-xs text-muted-foreground">{firewallMessage}</span>}
        </div>
      </div>
    </motion.div>
  );
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
