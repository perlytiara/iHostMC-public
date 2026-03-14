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
  Archive,
  ArchiveRestore,
  RotateCcw,
  RefreshCw,
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
  Server,
  Box,
  Cpu,
  Database,
  Cloud,
  Folder,
  Zap,
  Globe,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { getServerIcons, getServerIcon, setServerIcon, SERVER_ICON_IDS, type ServerIconId } from "@/lib/server-icons";
import {
  getOutputLines,
  getRawBuffer,
  subscribeLines,
  clearServerOutput,
} from "@/lib/server-output-store";
import type { ServerConfig, ServerType } from "../types";
import type { MenuViewRequest, MenuBarServerContext } from "@/App";
import type { SyncServerInfo } from "@/lib/api-client";

const MINECRAFT_DEFAULT_PORT = 25565;

/** Show "many servers" banner above this count (same as CreateServerWizard soft limit). */
const SOFT_SERVER_LIMIT = 20;

const dropdownContentClass = "z-50 min-w-[220px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-1.5 text-foreground shadow-xl";
const dropdownItemClass = "relative flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors";
const dropdownLabelClass = "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const ctxItemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none rounded-md";

const SERVER_ICON_MAP: Record<ServerIconId, LucideIcon> = {
  Server,
  Gamepad2,
  Cpu,
  HardDrive,
  Box,
  LayoutDashboard,
  Terminal,
  Puzzle,
  Database,
  Cloud,
  Folder,
  Archive,
  Zap,
  Shield,
  Globe,
  Home,
};

function ServerIcon({ iconId, className }: { iconId: ServerIconId | null | undefined; className?: string }) {
  const Icon = (iconId && SERVER_ICON_MAP[iconId]) ? SERVER_ICON_MAP[iconId] : Server;
  return <Icon className={className} />;
}

/** Animated background that reflects server state: running = livelier motion and tint, stopped = calmer. */
function StatefulBackground({ running }: { running: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes state-bg-drift {
          0%, 100% { background-position: 0% 0%; }
          50% { background-position: 100% 100%; }
        }
      `}</style>
      <div
        className={cn(
          "absolute inset-0 dark:opacity-[0.15]",
          running ? "opacity-[0.1]" : "opacity-[0.06]"
        )}
        style={{
          background: running
            ? "radial-gradient(ellipse 120% 80% at 50% 20%, hsl(var(--primary)) 0%, transparent 50%), radial-gradient(ellipse 80% 120% at 80% 80%, hsl(142 76% 36%) 0%, transparent 45%)"
            : "radial-gradient(ellipse 100% 100% at 30% 30%, hsl(var(--primary) / 0.8) 0%, transparent 50%), radial-gradient(ellipse 80% 80% at 70% 70%, hsl(var(--muted-foreground) / 0.3) 0%, transparent 50%)",
          backgroundSize: "200% 200%",
          animation: running ? "state-bg-drift 18s ease-in-out infinite" : "state-bg-drift 35s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 80%, hsl(var(--primary)) 0%, transparent 40%), radial-gradient(circle at 80% 20%, hsl(var(--primary)) 0%, transparent 40%)",
          backgroundSize: "200% 200%",
          animation: "state-bg-drift 25s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}

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
  /** When true, server picker shows idle slideshow cycling servers (default from settings). */
  idleSlideshow?: boolean;
  onIdleSlideshowChange?: (value: boolean) => void;
  onMenuBarServerContextChange?: (ctx: MenuBarServerContext | null) => void;
  onServerCountChange?: (count: number) => void;
  onRunningCountChange?: (count: number) => void;
  /** Main menu / app nav: e.g. go to Home */
  onGoToHome?: () => void;
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
  idleSlideshow = true,
  onMenuBarServerContextChange,
  onServerCountChange,
  onRunningCountChange,
  onGoToHome,
}: ServerListProps = {}) {
  const { t } = useTranslation();
  const token = getToken();
  const { servers, loading: serversLoading, refresh } = useServers();
  const [serverIconMap, setServerIconMap] = useState<Record<string, ServerIconId>>(() => {
    try {
      return getServerIcons();
    } catch {
      return {};
    }
  });
  const [iconPickerForServerId, setIconPickerForServerId] = useState<string | null>(null);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideshowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { syncedServers, syncNow, syncing: metaSyncing, refreshSynced } = useSyncServers(servers, token, {
    autoSyncOnLoad: getAutoBackupEnabled(),
  });
  /** Merge backend (website) state: active = not archived/trashed locally AND not archived/trashed on backend. */
  const activeServers = servers.filter((s) => {
    if (s.archived || s.trashed_at) return false;
    const synced = syncedServers.find((r) => r.hostId === s.id);
    if (synced && (synced.archived || synced.trashedAt)) return false;
    return true;
  });
  const archivedServers = servers.filter((s) => {
    if (s.trashed_at) return false;
    const synced = syncedServers.find((r) => r.hostId === s.id);
    if (synced?.trashedAt) return false;
    return s.archived === true || (!!synced && synced.archived === true);
  });
  const trashedServers = servers.filter((s) => {
    const synced = syncedServers.find((r) => r.hostId === s.id);
    return !!s.trashed_at || (!!synced && !!synced.trashedAt);
  });
  /** Sync servers that exist on the website/cloud but have no local server on this device (e.g. from another device). */
  const remoteOnlyServers = syncedServers.filter(
    (s) => !s.trashedAt && !s.archived && !servers.some((l) => l.id === s.hostId)
  );
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [trashExpanded, setTrashExpanded] = useState(false);
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
    server_type?: ServerType;
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

  // Refresh when app window regains focus (sync with website)
  useEffect(() => {
    const onFocus = () => {
      refresh();
      if (token && getApiBaseUrl()) refreshSynced();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshSynced, token]);

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
    if (import.meta.env.DEV) console.log("[iHostMC] Delete/trash requested for:", server.id, server.name);
    setContextMenu(null);
    setServerToDelete(server);
  }, []);

  const confirmTrashServer = useCallback(async () => {
    if (!serverToDelete || isDeleting || serverToDelete.trashed_at) return;
    const id = serverToDelete.id;
    const name = serverToDelete.name;
    setIsDeleting(true);
    try {
      await invoke("trash_server", { id });
      if (token && getApiBaseUrl()) {
        try { await api.trashSyncServer(token, id); } catch { /* ignore */ }
      }
      setServerToDelete(null);
      if (selectedId === id) setSelectedId(null);
      refresh();
      await refreshSynced();
      toast.success(t("servers.trashSuccess", { name }));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [serverToDelete, isDeleting, token, selectedId, refresh, refreshSynced, t]);

  const confirmDeleteServer = useCallback(async () => {
    if (!serverToDelete || isDeleting) return;
    const id = serverToDelete.id;
    const name = serverToDelete.name;
    setIsDeleting(true);
    try {
      await invoke("delete_server", { id });
      if (token && getApiBaseUrl()) {
        try { await api.permanentDeleteSyncServer(token, id); } catch { /* ignore */ }
      }
      setServerToDelete(null);
      if (selectedId === id) setSelectedId(null);
      if (runningId === id) setRunningId(null);
      refresh();
      await refreshSynced();
      toast.success(t("servers.deletedSuccess", { name }));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [serverToDelete, isDeleting, token, selectedId, runningId, refresh, refreshSynced, t]);

  const requestArchiveServer = useCallback(async (server: ServerConfig) => {
    if (server.archived || server.trashed_at || isDeleting) return;
    const id = server.id;
    const name = server.name;
    setContextMenu(null);
    setIsDeleting(true);
    try {
      await invoke("archive_server", { id });
      if (token && getApiBaseUrl()) {
        try { await api.archiveSyncServer(token, id); } catch { /* ignore */ }
      }
      if (selectedId === id) setSelectedId(null);
      refresh();
      await refreshSynced();
      toast.success(t("servers.archiveSuccess", { name }));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [token, isDeleting, selectedId, refresh, refreshSynced, t]);

  const requestUnarchiveServer = useCallback(async (server: ServerConfig) => {
    if (!server.archived || isDeleting) return;
    const id = server.id;
    const name = server.name;
    setContextMenu(null);
    setIsDeleting(true);
    try {
      await invoke("unarchive_server", { id });
      if (token && getApiBaseUrl()) {
        try { await api.unarchiveSyncServer(token, id); } catch { /* ignore */ }
      }
      refresh();
      await refreshSynced();
      toast.success(t("servers.unarchiveSuccess", { name }));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [token, isDeleting, refresh, refreshSynced, t]);

  const requestRestoreServer = useCallback(async (server: ServerConfig) => {
    if (!server.trashed_at || isDeleting) return;
    const id = server.id;
    const name = server.name;
    setContextMenu(null);
    setIsDeleting(true);
    try {
      await invoke("restore_server", { id });
      if (token && getApiBaseUrl()) {
        try { await api.restoreSyncServer(token, id); } catch { /* ignore */ }
      }
      if (selectedId === id) setSelectedId(null);
      refresh();
      await refreshSynced();
      toast.success(t("servers.restoreSuccess", { name }));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [token, isDeleting, refresh, refreshSynced, t]);

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

  const IDLE_MS = 15000;
  const SLIDESHOW_INTERVAL_MS = 5000;
  useEffect(() => {
    const on = centerView === "server" && !selectedId && idleSlideshow && activeServers.length > 0;
    if (!on) {
      if (idleTimeoutRef.current) { clearTimeout(idleTimeoutRef.current); idleTimeoutRef.current = null; }
      setSlideshowActive(false);
      return;
    }
    const schedule = () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        idleTimeoutRef.current = null;
        setSlideshowActive(true);
        setSlideshowIndex(0);
      }, IDLE_MS);
    };
    const reset = () => { setSlideshowActive(false); schedule(); };
    schedule();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("click", reset);
    window.addEventListener("scroll", reset, true);
    return () => {
      if (idleTimeoutRef.current) { clearTimeout(idleTimeoutRef.current); idleTimeoutRef.current = null; }
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("click", reset);
      window.removeEventListener("scroll", reset, true);
    };
  }, [centerView, selectedId, idleSlideshow, activeServers.length]);

  useEffect(() => {
    if (!slideshowActive || activeServers.length === 0) return;
    slideshowIntervalRef.current = setInterval(() => {
      setSlideshowIndex((i) => (activeServers.length > 0 ? (i + 1) % activeServers.length : 0));
    }, SLIDESHOW_INTERVAL_MS);
    return () => {
      if (slideshowIntervalRef.current) { clearInterval(slideshowIntervalRef.current); slideshowIntervalRef.current = null; }
    };
  }, [slideshowActive, activeServers.length]);

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

  // One-server focus: auto-select the only server and collapse sidebar so the main area is full-screen
  useEffect(() => {
    if (serversLoading || activeServers.length !== 1) return;
    const only = activeServers[0];
    setSelectedId(only.id);
    setCenterView("server");
    setTerminalTab("list");
    setSidebarCollapsed(true);
  }, [serversLoading, activeServers.length, activeServers[0]?.id]);

  // No servers: once load finishes, show create so the user can build their one server (only on initial 0, so Import remains reachable)
  const didAutoOpenCreateRef = useRef(false);
  useEffect(() => {
    if (serversLoading || activeServers.length > 0) {
      if (activeServers.length > 0) didAutoOpenCreateRef.current = false;
      return;
    }
    if (didAutoOpenCreateRef.current) return;
    didAutoOpenCreateRef.current = true;
    setCenterView("create");
  }, [serversLoading, activeServers.length]);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Auto-refresh server list and synced servers periodically (no manual refresh needed in mini sidebar)
  useEffect(() => {
    const interval = setInterval(async () => {
      refresh();
      if (token && getApiBaseUrl()) await refreshSynced();
    }, 45000);
    return () => clearInterval(interval);
  }, [token, refresh, refreshSynced]);

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
          "flex flex-shrink-0 flex-col min-h-0 border-r border-border bg-card/50 transition-[width] duration-200",
          sidebarCollapsed ? "w-14" : "w-60"
        )}
      >
        <div className={cn("flex flex-col min-h-0 shrink-0", sidebarCollapsed && "flex-1")}>
          {/* Header row: same for collapsed/expanded */}
          <div className={cn("flex shrink-0 border-b border-border p-2", sidebarCollapsed ? "flex-col items-center gap-1.5" : "items-center gap-1 px-2")}>
            {sidebarCollapsed ? (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg" onClick={() => setSidebarCollapsed(false)} title={t("servers.openServerList", { defaultValue: "Open server list" })} aria-label={t("servers.openServerList", { defaultValue: "Open server list" })}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="flex flex-col items-center gap-0.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 rounded-md" onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }} title={t("servers.addServer")}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 rounded-md" onClick={() => setCenterView("import")} title={t("menu.importServer")}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 rounded-md" onClick={() => { setSelectedId(null); setCenterView("server"); }} title={t("servers.viewAllServers", { defaultValue: "View all servers" })}>
                <LayoutDashboard className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-semibold min-w-0 truncate flex-1">{t("servers.title")}</span>
              <div className="flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { refresh(); if (token && getApiBaseUrl()) await refreshSynced(); }} disabled={metaSyncing} title={t("servers.refreshListAndCloud", { defaultValue: "Refresh list and sync with website (archive/trash from iHost.one)" })}>
                  {metaSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }} title={t("servers.addServer")}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCenterView("import"); setImportInitial(null); }} title={t("menu.importServer")}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg border-l border-border/60 ml-0.5 pl-1.5" onClick={() => setSidebarCollapsed(true)} title={t("servers.collapseSidebar", { defaultValue: "Collapse sidebar" })}>
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          )}
          </div>
          {/* Collapsed: server list right below the header actions */}
          {sidebarCollapsed && (
            <div className="flex flex-1 flex-col min-h-0 border-t border-border pt-1.5">
              <p className="text-[10px] font-medium text-muted-foreground text-center px-1 mb-1" aria-hidden>{t("servers.title")}</p>
              <div className="flex flex-1 flex-col items-center gap-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {activeServers.map((s) => {
                    const iconId = serverIconMap[s.id] ?? null;
                    const isSelected = selectedId === s.id;
                    const isRunning = runningId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                          isSelected ? "border-primary bg-primary/15 text-primary" : "border-transparent bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                          isRunning && "ring-1 ring-green-500/50"
                        )}
                        onClick={() => { setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, server: s }); }}
                        data-context-menu="server"
                        title={s.name}
                      >
                        <ServerIcon iconId={iconId} className="h-4 w-4" />
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-1 flex-col min-h-0 min-w-0">
            {activeServers.length >= SOFT_SERVER_LIMIT && (
              <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                {t("servers.manyServersBanner", { count: activeServers.length })}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-1.5">
              {serversLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t("servers.loading")}</span>
                </div>
              ) : activeServers.length === 0 && archivedServers.length === 0 && trashedServers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Gamepad2 className="h-7 w-7 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{t("servers.selectOrCreate")}</p>
                </div>
              ) : (
                <>
                <div className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setActiveExpanded((e) => !e)}
                    className="flex flex-1 min-w-0 items-center gap-2 rounded py-0.5 -my-0.5 hover:bg-muted/70 text-left"
                  >
                    {activeExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    {t("servers.activeSection", "Active")} ({activeServers.length})
                  </button>
                </div>
                {activeExpanded && (
                <AnimatePresence>
                  <ul className="mt-1 space-y-1">
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
                    {activeServers.map((s, i) => {
                      const syncedRec = syncedServers.find((r) => r.hostId === s.id);
                      const cloudState: "none" | "registered" | "mini" | "saved" = !syncedRec
                        ? "none"
                        : syncedRec.backupCount > 0
                          ? "saved"
                          : syncedRec.miniSynced
                            ? "mini"
                            : "registered";
                      const syncLabel = cloudState === "none" ? t("servers.notSynced") : cloudState === "saved" ? t("servers.syncedToWebsite") : cloudState === "mini" ? t("servers.miniSyncedHint") : t("servers.registeredToCloud");
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
                          "group relative flex items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-sm transition-colors cursor-pointer shadow-sm",
                          centerView === "server" && selectedId === s.id
                            ? "bg-accent border-accent-foreground/20 text-accent-foreground"
                            : "hover:bg-accent/50 hover:border-border/80"
                        )}
                        onContextMenu={(e: React.MouseEvent) => {
                          if (e.ctrlKey && e.shiftKey) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, server: s });
                        }}
                        onClick={() => {
                          setSelectedId(s.id);
                          setTerminalTab("list");
                          setCenterView("server");
                          if (creatingServer.creating) setCreateViewMinimized(true);
                        }}
                      >
                        {/* Hover tooltip: name + type/version + sync (XMCL-style), above row so not clipped */}
                        <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block w-52 rounded-lg border border-border bg-card px-2.5 py-2 text-left shadow-lg pointer-events-none">
                          <p className="font-semibold text-foreground truncate">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{s.server_type} · {s.minecraft_version}</p>
                          <p className="text-[10px] text-muted-foreground/90 mt-0.5 flex items-center gap-1">
                            {cloudState === "none" ? <CloudOff className="h-3 w-3 shrink-0" /> : <Cloudy className="h-3 w-3 shrink-0" />}
                            {syncLabel}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          <ServerIcon iconId={serverIconMap[s.id] ?? null} className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
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
                        </div>
                        {runningId === s.id && (
                          <span className="ml-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </motion.li>
                    ); })}
                  </ul>
                </AnimatePresence>
                )}
                </>
              )}
            </div>
            {token && getApiBaseUrl() && remoteOnlyServers.length > 0 && (
              <div className="mt-2 shrink-0 border-t border-border/60 p-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  onClick={() => setInactiveExpanded((x) => !x)}
                  title={t("servers.cloudOnlySection", { defaultValue: "On the cloud (not on this device)" })}
                >
                  {inactiveExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <Cloud className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  {t("servers.inactiveSection", { defaultValue: "Inactive (not on this device)" })} ({remoteOnlyServers.length})
                </button>
                {inactiveExpanded && (
                  <ul className="mt-1 space-y-1">
                    {remoteOnlyServers.map((r) => {
                      const version = (r.metadata?.minecraft_version as string) || "";
                      const serverType = (r.metadata?.server_type as string) || "";
                      return (
                        <motion.li
                          key={r.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.name}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-primary"
                              onClick={() => {
                                setImportInitial({
                                  name: r.name,
                                  version: version || "",
                                  server_type: (serverType as ServerType) || undefined,
                                });
                                setCenterView("create");
                                setCreateViewMinimized(false);
                              }}
                              title={t("servers.buildOnThisDevice", { defaultValue: "Build" })}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                          {(version || serverType) && (
                            <span className="truncate text-[10px]">{[version, serverType].filter(Boolean).join(" · ")}</span>
                          )}
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {archivedServers.length > 0 && (
              <div className="mt-2 shrink-0 border-t border-border/60 p-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  onClick={() => setArchiveExpanded((x) => !x)}
                  title={t("servers.archiveSection")}
                >
                  {archiveExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  {t("servers.archiveSection")} ({archivedServers.length})
                </button>
                {archiveExpanded && (
                  <ul className="mt-1 space-y-1">
                    {archivedServers.map((s) => (
                      <motion.li
                        key={s.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        data-context-menu="server-archive"
                        className={cn(
                          "group flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-sm text-muted-foreground",
                          centerView === "server" && selectedId === s.id && "bg-accent/30 text-foreground"
                        )}
                        onContextMenu={(e: React.MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, server: s });
                        }}
                        onClick={() => {
                          setSelectedId(s.id);
                          setCenterView("server");
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); requestUnarchiveServer(s); }}
                            disabled={isDeleting}
                            title={t("servers.contextUnarchive")}
                          >
                            <ArchiveRestore className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); requestDeleteServer(s); }}
                            disabled={isDeleting}
                            title={t("servers.contextMoveToTrash")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {trashedServers.length > 0 && (
              <div className="mt-auto shrink-0 border-t border-border/60 p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-2 rounded px-2 py-1 text-right text-[11px] font-medium text-muted-foreground/80 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
                  onClick={() => setTrashExpanded((x) => !x)}
                  title={t("servers.trashSection")}
                >
                  {trashExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <Trash2 className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate">{t("servers.trashSection")} ({trashedServers.length})</span>
                  </button>
                  {trashExpanded && (
                    <ul className="mt-2 space-y-1">
                      {trashedServers.map((s) => (
                        <motion.li
                          key={s.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          data-context-menu="server-trash"
                          className={cn(
                            "group flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-muted-foreground",
                            centerView === "server" && selectedId === s.id && "bg-accent/30 text-foreground"
                          )}
                          onContextMenu={(e: React.MouseEvent) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, server: s });
                          }}
                          onClick={() => {
                            setSelectedId(s.id);
                            setCenterView("server");
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); requestRestoreServer(s); }}
                              disabled={isDeleting}
                              title={t("servers.contextRestore")}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); requestDeleteServer(s); }}
                              disabled={isDeleting}
                              title={t("servers.permanentDeleteConfirmButton")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
          </div>
        )}
      </aside>

      {/* Context menu */}
      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[200px] rounded-xl border border-border bg-card text-card-foreground py-1.5 shadow-xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.server.trashed_at ? (
              <>
                <button type="button" className={ctxItemClass} onClick={() => { openServerFolder(contextMenu.server.id); setContextMenu(null); }}>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextOpenFolder")}
                </button>
                <div className="my-1 border-t border-border" />
                <button type="button" className={cn(ctxItemClass, "text-primary")} disabled={isDeleting} onClick={() => { requestRestoreServer(contextMenu.server); setContextMenu(null); }}>
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextRestore")}
                </button>
                <button type="button" className={cn(ctxItemClass, "text-destructive hover:bg-destructive/10")} disabled={isDeleting} onClick={() => { requestDeleteServer(contextMenu.server); setContextMenu(null); }}>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextDeletePermanently", { defaultValue: "Delete permanently" })}
                </button>
              </>
            ) : contextMenu.server.archived ? (
              <>
                <button type="button" className={ctxItemClass} onClick={() => { openServerFolder(contextMenu.server.id); setContextMenu(null); }}>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextOpenFolder")}
                </button>
                <div className="my-1 border-t border-border" />
                <button type="button" className={cn(ctxItemClass, "text-primary")} disabled={isDeleting} onClick={() => { requestUnarchiveServer(contextMenu.server); setContextMenu(null); }}>
                  <ArchiveRestore className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextRestoreToList", { defaultValue: "Restore to list" })}
                </button>
                <button type="button" className={cn(ctxItemClass, "text-destructive hover:bg-destructive/10")} disabled={isDeleting} onClick={() => requestDeleteServer(contextMenu.server)}>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextMoveToTrash")}
                </button>
              </>
            ) : (
              <>
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("servers.contextView", { defaultValue: "View" })}</div>
                <button type="button" className={ctxItemClass} onClick={() => { setSelectedId(contextMenu.server.id); setCenterView("server"); setTerminalTab("list"); setContextMenu(null); }}>
                  <Info className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextOpenOverview", { defaultValue: "Open overview" })}
                </button>
                <button type="button" className={ctxItemClass} onClick={() => { openServerFolder(contextMenu.server.id); setContextMenu(null); }}>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextOpenFolder")}
                </button>
                <button type="button" className={ctxItemClass} onClick={() => { setSelectedId(contextMenu.server.id); setCenterView("server"); setTerminalTab("backup"); setContextMenu(null); }}>
                  <CloudUpload className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextCloudBackup", { defaultValue: "Cloud backup & sync" })}
                </button>
                <div className="my-1 border-t border-border" />
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("servers.contextEdit", { defaultValue: "Edit" })}</div>
                <button type="button" className={ctxItemClass} onClick={() => { setEditingServerId(contextMenu.server.id); setContextMenu(null); }}>
                  <Pencil className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextRename")}
                </button>
                <button type="button" className={ctxItemClass} onClick={() => { setIconPickerForServerId(contextMenu.server.id); setContextMenu(null); }}>
                  <LayoutDashboard className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextSetIcon", { defaultValue: "Set icon" })}
                </button>
                <div className="my-1 border-t border-border" />
                {runningId === contextMenu.server.id ? (
                  <button type="button" className={ctxItemClass} onClick={() => { stop(); setContextMenu(null); }}>
                    <Square className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextStop")}
                  </button>
                ) : (
                  <button type="button" className={ctxItemClass} disabled={isRunning} onClick={() => { start(contextMenu.server); setContextMenu(null); }}>
                    <Play className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextStart")}
                  </button>
                )}
                <div className="my-1 border-t border-border" />
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("servers.contextOrganize", { defaultValue: "Organize" })}</div>
                <button type="button" className={ctxItemClass} disabled={runningId === contextMenu.server.id} onClick={() => { requestArchiveServer(contextMenu.server); setContextMenu(null); }}>
                  <Archive className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextArchive")}
                </button>
                <button type="button" className={cn(ctxItemClass, "text-destructive hover:bg-destructive/10")} disabled={runningId === contextMenu.server.id} onClick={() => requestDeleteServer(contextMenu.server)}>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" /> {t("servers.contextMoveToTrash")}
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Icon picker for server */}
      {iconPickerForServerId &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setIconPickerForServerId(null)}
            role="dialog"
            aria-modal="true"
            aria-label={t("servers.setServerIcon", { defaultValue: "Set server icon" })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-border bg-card p-4 shadow-xl max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-medium text-foreground mb-3">{t("servers.setServerIcon", { defaultValue: "Set server icon" })}</p>
              <div className="grid grid-cols-4 gap-2">
                {SERVER_ICON_IDS.map((iconId) => {
                  const Icon = SERVER_ICON_MAP[iconId];
                  const isSelected = (serverIconMap[iconPickerForServerId] ?? null) === iconId;
                  return (
                    <button
                      key={iconId}
                      type="button"
                      className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-xl border-2 transition-colors",
                        isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => {
                        setServerIcon(iconPickerForServerId, iconId);
                        setServerIconMap(getServerIcons());
                        setIconPickerForServerId(null);
                        toast.success(t("servers.iconSet", { defaultValue: "Icon set" }));
                      }}
                      title={iconId}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setIconPickerForServerId(null)}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Delete / trash server confirmation */}
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
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    serverToDelete.trashed_at ? "bg-destructive/15" : "bg-amber-500/15"
                  )}>
                    <Trash2 className={cn(
                      "h-5 w-5",
                      serverToDelete.trashed_at ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 id="delete-server-title" className="text-lg font-semibold text-foreground">
                      {serverToDelete.trashed_at
                        ? t("servers.permanentDeleteConfirmTitle")
                        : t("servers.trashConfirmTitle")}
                    </h3>
                    <p id="delete-server-desc" className="mt-1 text-sm text-muted-foreground">
                      {serverToDelete.trashed_at
                        ? t("servers.permanentDeleteConfirmMessage", { name: serverToDelete.name })
                        : t("servers.trashConfirmMessage", { name: serverToDelete.name })}
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
                    onClick={serverToDelete.trashed_at ? confirmDeleteServer : confirmTrashServer}
                    disabled={isDeleting}
                    className={cn(
                      "px-4 py-2.5 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 min-w-[7rem] transition-colors disabled:opacity-50",
                      serverToDelete.trashed_at
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-500 dark:hover:bg-amber-500/90"
                    )}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {serverToDelete.trashed_at ? t("servers.deleting") : t("servers.trashTrashing")}
                      </>
                    ) : (
                      serverToDelete.trashed_at
                        ? t("servers.permanentDeleteConfirmButton")
                        : t("servers.trashConfirmButton")
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
        {centerView === "server" && <StatefulBackground running={!!runningId} />}
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
                initialServerType={importInitial?.server_type}
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
                {/* Server bar: server dropdown only (no second top bar icons) */}
                <div className="flex items-center border-b border-border/60 px-3 py-2 bg-muted/15">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left shadow-sm hover:bg-accent/40 transition-colors"
                      >
                        <Server className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate font-semibold text-sm text-foreground">
                          {servers.find((x) => x.id === selectedId)?.name ?? t("servers.title")}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className={dropdownContentClass} align="start" sideOffset={6}>
                        {activeServers.map((s) => (
                          <DropdownMenu.Item
                            key={s.id}
                            className={dropdownItemClass}
                            onSelect={() => { setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }}
                          >
                            {runningId === s.id ? <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" /> : <span className="w-2 shrink-0" />}
                            <span className="truncate">{s.name}</span>
                          </DropdownMenu.Item>
                        ))}
                        {archivedServers.length > 0 && (
                          <>
                            <DropdownMenu.Separator className="my-1.5" />
                            <div className={dropdownLabelClass}>{t("servers.hidden")}</div>
                            {archivedServers.map((s) => (
                              <DropdownMenu.Item
                                key={s.id}
                                className={dropdownItemClass}
                                onSelect={() => { setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }}
                              >
                                <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{s.name}</span>
                              </DropdownMenu.Item>
                            ))}
                          </>
                        )}
                        {trashedServers.length > 0 && (
                          <>
                            <DropdownMenu.Separator className="my-1.5" />
                            <div className={dropdownLabelClass}>{t("servers.trashSection")}</div>
                            {trashedServers.map((s) => (
                              <DropdownMenu.Item
                                key={s.id}
                                className={cn(dropdownItemClass, "opacity-75")}
                                onSelect={() => { setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{s.name}</span>
                              </DropdownMenu.Item>
                            ))}
                          </>
                        )}
                        <DropdownMenu.Separator className="my-1.5" />
                        <DropdownMenu.Item
                          className={dropdownItemClass}
                          onSelect={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }}
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          {t("servers.addServer")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className={dropdownItemClass}
                          onSelect={() => setCenterView("import")}
                        >
                          <Download className="h-3.5 w-3.5 shrink-0" />
                          {t("menu.importServer")}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
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
              /* No server selected – no top bar, just the picker view */
              <div className="relative flex flex-1 flex-col min-h-0 overflow-auto">
                {serversLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{t("servers.loading")}</span>
                  </div>
                ) : activeServers.length === 0 ? (
                  /* No servers – full-screen build-from-scratch / import */
                  <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center w-full max-w-2xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
                      <img
                        src="/assets/app-empty-servers.png"
                        alt=""
                        className="h-36 w-auto object-contain sm:h-44"
                        width={400}
                        height={280}
                      />
                      <h2 className="text-xl font-bold text-foreground">{t("servers.noServersTitle", { defaultValue: "No servers yet" })}</h2>
                      <p className="text-sm text-muted-foreground">{t("servers.noServersDesc", { defaultValue: "Build your first server from scratch or import an existing one." })}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                      <Button
                        size="lg"
                        className="gap-2 rounded-xl flex-1 sm:flex-initial"
                        onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }}
                      >
                        <Plus className="h-5 w-5" />
                        {t("servers.buildFromScratch", { defaultValue: "Build from scratch" })}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="gap-2 rounded-xl flex-1 sm:flex-initial"
                        onClick={() => setCenterView("import")}
                      >
                        <Download className="h-5 w-5" />
                        {t("menu.importServer")}
                      </Button>
                    </motion.div>
                  </div>
                ) : slideshowActive && activeServers[slideshowIndex] ? (
                  /* Idle slideshow: one big card */
                  <div className="flex flex-1 flex-col items-center justify-center p-6">
                    <motion.button
                      type="button"
                      key={activeServers[slideshowIndex].id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.35 }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-4 rounded-3xl border-2 min-w-[240px] min-h-[200px] px-10 py-8 text-center transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]",
                        runningId === activeServers[slideshowIndex]?.id
                          ? "border-green-500/50 bg-green-500/10 shadow-green-500/15 shadow-xl"
                          : "border-border bg-card/90 shadow-lg hover:border-primary/30"
                      )}
                      onClick={() => {
                        const s = activeServers[slideshowIndex];
                        if (s) { setSlideshowActive(false); setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }
                      }}
                          onContextMenu={(e) => {
                        const s = activeServers[slideshowIndex];
                        if (s) { e.preventDefault(); setSlideshowActive(false); setContextMenu({ x: e.clientX, y: e.clientY, server: s }); }
                      }}
                      data-context-menu="server"
                    >
                      <ServerIcon iconId={serverIconMap[activeServers[slideshowIndex]?.id ?? ""] ?? null} className={cn("h-16 w-16", runningId === activeServers[slideshowIndex]?.id ? "text-green-600 dark:text-green-400" : "text-primary")} />
                      <span className="font-bold text-lg text-foreground">{activeServers[slideshowIndex]?.name}</span>
                      {runningId === activeServers[slideshowIndex]?.id && (
                        <span className="text-xs font-medium uppercase tracking-wider text-green-600 dark:text-green-400">{t("servers.running", { defaultValue: "Running" })}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{t("servers.slideshowClickHint", { defaultValue: "Click to open" })}</span>
                    </motion.button>
                  </div>
                ) : (
                  /* Default: list of server app boxes + Create / Import */
                  <div className="flex flex-1 flex-col p-6">
                    <div className="mb-6 text-center sm:text-left">
                      <h2 className="text-lg font-semibold text-foreground">{t("servers.yourServers", { defaultValue: "Your servers" })}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">{t("servers.pickOrCreate", { defaultValue: "Pick one to open or create a new one." })}</p>
                    </div>
                    <div className="flex flex-wrap items-stretch justify-center sm:justify-start gap-4 w-full">
                      {activeServers.map((s) => (
                        <motion.button
                          key={s.id}
                          type="button"
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 min-w-[140px] min-h-[120px] px-5 py-4 text-center transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
                            runningId === s.id
                              ? "border-green-500/50 bg-green-500/10 shadow-md"
                              : "border-border bg-card shadow-sm hover:border-primary/30 hover:bg-card"
                          )}
                          onClick={() => { setSelectedId(s.id); setCenterView("server"); setTerminalTab("list"); }}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, server: s }); }}
                          data-context-menu="server"
                        >
                          <ServerIcon iconId={serverIconMap[s.id] ?? null} className={cn("h-9 w-9", runningId === s.id ? "text-green-600 dark:text-green-400" : "text-primary")} />
                          <span className="font-semibold text-foreground text-sm truncate w-full">{s.name}</span>
                          {runningId === s.id && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-green-600 dark:text-green-400">{t("servers.running", { defaultValue: "Running" })}</span>
                          )}
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: 0.05 }}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border min-w-[140px] min-h-[120px] px-5 py-4 text-center bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => { setCenterView("create"); setImportInitial(null); setCreateViewMinimized(false); }}
                      >
                        <Plus className="h-9 w-9 text-primary" />
                        <span className="font-semibold text-foreground text-sm">{t("servers.addServer")}</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: 0.08 }}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border min-w-[140px] min-h-[120px] px-5 py-4 text-center bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => setCenterView("import")}
                      >
                        <Download className="h-9 w-9 text-primary" />
                        <span className="font-semibold text-foreground text-sm">{t("menu.importServer")}</span>
                      </motion.button>
                      {token && getApiBaseUrl() && remoteOnlyServers.length > 0 && (
                        <>
                          <div className="w-full basis-full h-0 max-h-0" aria-hidden />
                          <div className="w-full basis-full flex flex-wrap items-stretch justify-center sm:justify-start gap-4">
                            <p className="w-full text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2 mb-0">
                              {t("servers.cloudOnlySection", { defaultValue: "On the cloud (not on this device)" })}
                            </p>
                            {remoteOnlyServers.map((r) => {
                              const version = (r.metadata?.minecraft_version as string) || "";
                              const serverType = (r.metadata?.server_type as string) || "";
                              const modCount = (r.metadata?.mod_count as number) ?? 0;
                              const pluginCount = (r.metadata?.plugin_count as number) ?? 0;
                              const parts = [version, serverType].filter(Boolean);
                              if (modCount > 0) parts.push(`${modCount} mods`);
                              if (pluginCount > 0) parts.push(`${pluginCount} plugins`);
                              const highlights = parts.join(" · ");
                              return (
                                <motion.button
                                  key={r.id}
                                  type="button"
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.2 }}
                                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-border min-w-[140px] min-h-[120px] px-4 py-3 text-center bg-muted/40 hover:border-primary/40 hover:bg-muted/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                  onClick={() => {
                                    setImportInitial({
                                      name: r.name,
                                      version: version || "",
                                      server_type: (serverType as ServerType) || undefined,
                                    });
                                    setCenterView("create");
                                    setCreateViewMinimized(false);
                                  }}
                                >
                                  <Cloud className="h-9 w-9 text-muted-foreground" />
                                  <span className="font-semibold text-foreground text-sm truncate w-full">{r.name}</span>
                                  {highlights && (
                                    <span className="text-[10px] text-muted-foreground truncate w-full">{highlights}</span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {r.backupCount > 0
                                      ? t("servers.backupsCount", { count: r.backupCount, defaultValue: "{{count}} backup(s)" })
                                      : t("servers.notOnThisDeviceShort", { defaultValue: "No backups" })}
                                  </span>
                                  <span className="text-[10px] font-medium text-primary">
                                    {t("servers.buildOnThisDevice", { defaultValue: "Build" })}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
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
      await api.createArchive(token, backendServerId, {
        name: `${server.name} Essentials only ${new Date().toISOString().slice(0, 10)}`,
        saveTier: "snapshot",
        keepLiveSync: true,
      });
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
          mod_count: manifest?.mods?.length ?? 0,
          plugin_count: manifest?.plugins?.length ?? 0,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, {
        name: `${server.name} Essentials ${new Date().toISOString().slice(0, 10)}`,
        saveTier: "structural",
        keepLiveSync: true,
      });
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
          mod_count: manifest?.mods?.length ?? 0,
          plugin_count: manifest?.plugins?.length ?? 0,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, {
        name: `${server.name} Full backup ${new Date().toISOString().slice(0, 10)}`,
        saveTier: "full",
        keepLiveSync: true,
      });
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
          mod_count: manifest?.mods?.length ?? 0,
          plugin_count: manifest?.plugins?.length ?? 0,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      await api.createArchive(token, backendServerId, {
        name: `${server.name} Map save ${new Date().toISOString().slice(0, 10)}`,
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
          mod_count: manifest?.mods?.length ?? 0,
          plugin_count: manifest?.plugins?.length ?? 0,
          mods: manifest?.mods?.map((m) => m.name),
          plugins: manifest?.plugins?.map((p) => p.name),
        },
      });
      await fileSyncState.refreshSyncedFiles(backendServerId);
      await fileSyncState.refreshSummary(backendServerId);
      const name =
        customBackupName.trim() ||
        `${server.name} Custom save ${new Date().toISOString().slice(0, 10)}`;
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
                {t("servers.liveSyncSection", { defaultValue: "Live sync & backups" })}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("servers.liveSyncIntro", { defaultValue: "Choose Essentials (config, mods, plugins) or Full backup for live sync. Archive from the website. Map and Custom create separate saves." })}
              </p>
            </div>
            {/* Primary: Essentials (default) or Full — what goes to Live sync */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {t("servers.liveSyncChoice", { defaultValue: "Live sync (choose one)" })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-blue-900/40 text-blue-200 border-blue-600/50 hover:bg-blue-800/50"
                  disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                  onClick={handleStructural}
                  title={!hasLiveData ? t("servers.syncFirstToUpload", { defaultValue: "Sync first to upload data" }) : t("servers.essentialsTooltip", { defaultValue: "Config, mods, plugins — no worlds. Re-download mods when restoring." })}
                >
                  {savingTier === "structural" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                  <span className="ml-1">{t("servers.syncEssentials", { defaultValue: "Sync Essentials" })}</span>
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-emerald-700 hover:bg-emerald-600 text-white border-0"
                  disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                  onClick={handleFull}
                  title={!hasLiveData ? t("servers.syncFirstToUpload", { defaultValue: "Sync first to upload data" }) : t("servers.fullBackupTooltip", { defaultValue: "Everything: config, mods, plugins, worlds. Server JAR included." })}
                >
                  {savingTier === "full" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                  <span className="ml-1">{t("servers.syncFull", { defaultValue: "Sync Full" })}</span>
                </Button>
              </div>
            </div>
            {/* Secondary: Map save, Custom save — creates archives */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {t("servers.otherSaves", { defaultValue: "Save a backup" })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/50 text-amber-200 hover:bg-amber-900/30"
                  disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                  onClick={handleMapBackup}
                  title={t("servers.mapSaveTooltip", { defaultValue: "World folders only. Creates a Map save in Archives." })}
                >
                  {savingTier === "world" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                  <span className="ml-1">{t("servers.mapSave", { defaultValue: "Map save" })}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border text-muted-foreground hover:text-foreground"
                  disabled={!!savingTier || fileSyncState.syncing || !token || !hasBackend || !manifest?.files?.length}
                  onClick={() => setCustomizeBackupOpen((o) => !o)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="ml-1">{t("servers.customSave", { defaultValue: "Custom save" })}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  disabled={!!savingTier || fileSyncState.syncing || !token || !manifest?.files?.length}
                  onClick={handleSnapshotOnly}
                  title={t("servers.essentialsOnlyTooltip", { defaultValue: "Metadata only: preset, file tree, mod list. No files — free." })}
                >
                  {savingTier === "snapshot" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  <span className="ml-1">{t("servers.essentialsOnly", { defaultValue: "Essentials only" })}</span>
                </Button>
              </div>
            </div>
            {!hasLiveData && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t("servers.syncFirstHint", { defaultValue: "Sync Essentials or Full first to upload data. Then archive from the website or create Map/Custom saves." })}
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
                    <span className={savingTier === "custom" ? "ml-1" : ""}>{t("servers.createCustomSave", { defaultValue: "Create custom save" })}</span>
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
                    Essentials = config, mods, plugins. Full = everything. Map save = worlds only. Custom save = pick folders.
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
        const authToken = getToken();
        let frpConfig: { apiBaseUrl: string; serverAddr: string; serverPort: number; token: string };
        try {
          const config = await api.getRelayConfig(authToken ?? "");
          if (config?.apiBaseUrl && config?.token) {
            frpConfig = { apiBaseUrl: config.apiBaseUrl, serverAddr: config.serverAddr, serverPort: config.serverPort, token: config.token };
          } else {
            throw new Error("no config");
          }
        } catch {
          const frp = getFrpPrefs();
          const relayToken = await getRelayTokenForTunnel(authToken);
          const token = relayToken || frp.token;
          if (!token) {
            onSetTunnelError(t("servers.shareSignInRequired"));
            return;
          }
          frpConfig = { apiBaseUrl: frp.apiBaseUrl, serverAddr: frp.serverAddr, serverPort: frp.serverPort, token };
        }
        const url = await Promise.race([
          invoke<string>("start_tunnel", { port: s.port, method: "frp", frpConfig }),
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
      className="flex h-full flex-col gap-2 w-full min-h-0 overflow-auto"
    >
      {/* Bubbly card: server details up front, condensed */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground truncate">{s.name}</h2>
              {isRunning && (
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" aria-hidden />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {s.server_type} · {s.minecraft_version} · {s.memory_mb} MB · <span className="font-mono">localhost:{s.port}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isRunning ? (
              <Button variant="destructive" size="sm" className="gap-1.5 rounded-xl" onClick={onStop}>
                <Square className="h-3.5 w-3.5 fill-current" />
                {t("servers.contextStop")}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 rounded-xl"
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
      </div>

      {/* Sync & website — bubbly */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
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

      {/* Server stats (when running) — bubbly */}
      {isRunning && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card/50 px-4 py-2.5 text-sm">
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

      {/* Console log — bubbly */}
      <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-border overflow-hidden">
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

      {/* Network & sharing section — bubbly */}
      <div className="space-y-2">
        {isTauri() && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-3">
            <p className="text-xs font-medium text-foreground">{t("servers.relayShareTitle")}</p>
            {shareAddress ? (
              <div className="space-y-1.5">
                <img src="/assets/app-share-success.png" alt="" className="h-14 w-auto object-contain rounded-lg opacity-90" width={360} height={240} />
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
