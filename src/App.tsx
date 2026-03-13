import { createContext, type ComponentType, type ReactNode, Component, lazy, Suspense, useContext, useEffect, useState, useCallback, useRef } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { DesignProvider } from "@/components/design-provider";
import { CustomTitleBar } from "@/components/CustomTitleBar";
import { PageTransition } from "@/components/PageTransition";
import { DevMenu } from "@/components/DevMenu";
import { WindowTools } from "@/components/WindowTools";
import { AppContextMenu } from "@/components/AppContextMenu";
import { Toaster } from "@/components/Toaster";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import {
  HighlightTourOverlay,
  getHighlightTourComplete,
  setHighlightTourComplete,
} from "@/components/HighlightTourOverlay";
import { UpdateAvailableDialog } from "@/components/UpdateAvailableDialog";
import { useDevMenuShortcut } from "@/hooks/useDevMenuShortcut";
import { useInspectShortcut } from "@/hooks/useInspectShortcut";
import { useDeepLinkAuth } from "@/features/auth/hooks/useDeepLinkAuth";
import { useAuthStore } from "@/features/auth";
import { AccountDataProvider } from "@/contexts/AccountDataContext";
import { isTauri } from "@/lib/utils";
import { api, isBackendConfigured, setOnAuthExpired } from "@/lib/api-client";
import { getFrpPrefs, setFrpPrefs } from "@/lib/tunnel-prefs";
import { initServerOutputStore } from "@/lib/server-output-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

const PAGE_LOAD_TIMEOUT_MS = 8000;

function lazyWithTimeout<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
  timeoutMs = PAGE_LOAD_TIMEOUT_MS
) {
  return lazy(() =>
    Promise.race([
      importFn(),
      new Promise<{ default: T }>((_, reject) =>
        setTimeout(() => reject(new Error("Page load timeout")), timeoutMs)
      ),
    ])
  );
}

const HomePage = lazyWithTimeout(() => import("@/features/home").then((m) => ({ default: m.HomePage })));
const ServerList = lazyWithTimeout(() => import("@/features/servers").then((m) => ({ default: m.ServerList })));
const StoragePage = lazyWithTimeout(() => import("@/features/storage").then((m) => ({ default: m.StoragePage })));
const SettingsView = lazyWithTimeout(() => import("@/features/settings").then((m) => ({ default: m.SettingsView })));
const AiPage = lazyWithTimeout(() => import("@/features/ai").then((m) => ({ default: m.AiPage })));
const DevPage = lazyWithTimeout(() => import("@/components/DevPage").then((m) => ({ default: m.DevPage })));

export type AppPage = "home" | "servers" | "storage" | "ai" | "settings" | "dev";

const SETTINGS_AS_ICON_KEY = "ihostmc-settings-as-icon";

function getSettingsAsIconDefault(): boolean {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  return localStorage.getItem(SETTINGS_AS_ICON_KEY) === "true";
}

export interface SettingsNavContextValue {
  /** When true (dev only), Settings is shown as an icon on the right of the navbar instead of a tab. */
  settingsAsIcon: boolean;
  setSettingsAsIcon: (value: boolean) => void;
}

export const SettingsNavContext = createContext<SettingsNavContextValue>({
  settingsAsIcon: false,
  setSettingsAsIcon: () => {},
});

const DEVELOPER_MENU_KEY = "ihostmc-developer-menu-enabled";
const ONBOARDING_COMPLETE_KEY = "ihostmc-onboarding-complete";

export interface DeveloperMenuContextValue {
  developerMenuEnabled: boolean;
  setDeveloperMenuEnabled: (enabled: boolean) => void;
}

export const DeveloperMenuContext = createContext<DeveloperMenuContextValue>({
  developerMenuEnabled: false,
  setDeveloperMenuEnabled: () => {},
});

export interface MenuBarServerContext {
  hasServerSelected: boolean;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onOpenFolder: () => void;
}

export type MenuViewRequest = "create" | "import" | "settings" | null;

const PAGE_STORAGE_KEY = "ihostmc-page";

interface PageErrorBoundaryProps {
  children: ReactNode;
  onGoHome: () => void;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {this.state.error?.message === "Page load timeout"
              ? "Page is taking too long to load."
              : "This page failed to load."}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onGoHome();
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function getStoredPage(): AppPage {
  if (typeof window === "undefined") return "home";
  const saved = localStorage.getItem(PAGE_STORAGE_KEY) as AppPage | null;
  if (saved === "home" || saved === "servers" || saved === "storage" || saved === "ai" || saved === "settings") return saved;
  if (saved === "dev" && import.meta.env.DEV) return "dev";
  return "home";
}

function AppContent() {
  const { t } = useTranslation();
  // Start on Home so first paint only loads the Home chunk; restore stored page after mount to avoid blocking on heavy chunks
  const [currentPage, setCurrentPage] = useState<AppPage>("home");
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [windowToolsOpen, setWindowToolsOpen] = useState(false);
  const [menuViewRequest, setMenuViewRequest] = useState<MenuViewRequest>(null);
  const [menuBarServerContext, setMenuBarServerContext] = useState<MenuBarServerContext | null>(null);
  const [runInBackground, setRunInBackground] = useState(true);
  const [idleSlideshow, setIdleSlideshow] = useState(true);
  const [testControlUrl, setTestControlUrl] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string | null } | null>(null);
  const [updateDialogDismissed, setUpdateDialogDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ downloaded: number; total: number } | null>(null);
  const [updatePhase, setUpdatePhase] = useState<"idle" | "downloading" | "installing" | "restarting" | "error">("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [serverCount, setServerCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [closeConfirm, setCloseConfirm] = useState<{ runningCount: number } | null>(null);
  const [initialSettingsTab, setInitialSettingsTab] = useState<"general" | "account" | null>(null);
  const [onboardingComplete, setOnboardingCompleteState] = useState(() =>
    typeof window !== "undefined" && !!localStorage.getItem(ONBOARDING_COMPLETE_KEY)
  );
  const [highlightTourActive, setHighlightTourActive] = useState(false);
  const [highlightTourStep, setHighlightTourStep] = useState(0);
  const [developerMenuEnabled, setDeveloperMenuEnabledState] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(DEVELOPER_MENU_KEY) === "true"
  );

  const user = useAuthStore((s) => s.user);
  const prevUserRef = useRef<typeof user | undefined>(undefined);

  const setDeveloperMenuEnabled = useCallback((enabled: boolean) => {
    setDeveloperMenuEnabledState(enabled);
    try {
      if (enabled) localStorage.setItem(DEVELOPER_MENU_KEY, "true");
      else localStorage.removeItem(DEVELOPER_MENU_KEY);
    } catch {}
  }, []);

  useDevMenuShortcut(() => setDevMenuOpen(true), { enabled: developerMenuEnabled });
  useInspectShortcut({ enabled: developerMenuEnabled });
  useDeepLinkAuth();

  // When any API returns 401, automatically clear auth so user sees connect screen and can re-sign in via browser
  useEffect(() => {
    setOnAuthExpired(() => useAuthStore.getState().logout());
    return () => setOnAuthExpired(null);
  }, []);

  // Restore stored page after first paint so we don't block on loading a heavy chunk (servers/storage) at startup
  useEffect(() => {
    const stored = getStoredPage();
    if (stored !== "home") setCurrentPage(stored);
  }, []);

  // Start highlight tour when on home and tour not yet completed (e.g. returning user who finished onboarding earlier)
  useEffect(() => {
    if (
      currentPage === "home" &&
      onboardingComplete &&
      !getHighlightTourComplete() &&
      !highlightTourActive
    ) {
      setHighlightTourStep(0);
      setHighlightTourActive(true);
    }
  }, [currentPage, onboardingComplete, highlightTourActive]);

  // After login or logout, keep user on settings so the UI doesn't break to a blank page
  useEffect(() => {
    const prev = prevUserRef.current;
    prevUserRef.current = user;
    if (prev === undefined) return; // initial mount, skip
    if (prev === null && user !== null) {
      setCurrentPage("settings");
      setInitialSettingsTab("account");
    } else if (prev !== null && user === null) {
      setCurrentPage("settings");
      setInitialSettingsTab("account");
    }
  }, [user]);

  useEffect(() => {
    if (isTauri()) initServerOutputStore();
  }, []);

  /** Sync relay token and CurseForge key from backend when logged in; no manual entry in Settings. */
  useEffect(() => {
    if (!user?.token || !isTauri() || !isBackendConfigured()) return;
    (async () => {
      try {
        const [relayRes, cfRes] = await Promise.allSettled([
          api.getRelayToken(user.token),
          api.getRelayCurseforgeKey(user.token),
        ]);
        if (relayRes.status === "fulfilled" && relayRes.value?.token) {
          const frp = getFrpPrefs();
          if (frp.serverAddr === "play.ihost.one" || !frp.token)
            setFrpPrefs({ ...frp, token: relayRes.value.token });
        }
        if (cfRes.status === "fulfilled" && cfRes.value?.key?.trim())
          await invoke("set_curseforge_api_key", { key: cfRes.value.key.trim() });
      } catch {
        // ignore
      }
    })();
  }, [user?.token]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>("get_run_in_background").then(setRunInBackground).catch(() => {});
    invoke<boolean>("get_idle_slideshow")
      .then(setIdleSlideshow)
      .catch(() => { setIdleSlideshow(true); });
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const unsub = listen<{ runningCount: number }>("close-requested", (e) => {
      setCloseConfirm({ runningCount: e.payload?.runningCount ?? 1 });
    });
    return () => {
      unsub.then((f) => f());
    };
  }, []);

  const handleCloseAnyway = useCallback(async () => {
    if (!isTauri()) return;
    setCloseConfirm(null);
    try {
      await invoke("stop_server");
    } finally {
      await invoke("quit_app");
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string | null>("get_test_control_url")
      .then(setTestControlUrl)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    check()
      .then((upd) => {
        if (upd) {
          setUpdateAvailable({ version: upd.version, body: upd.body ?? null });
          setUpdateDialogDismissed(false); // show dialog for new update
        }
      })
      .catch(() => {});
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const upd = await check();
      if (upd) setUpdateAvailable({ version: upd.version, body: upd.body ?? null });
      else toast.info(t("header.noUpdates"));
    } catch {
      // ignore
    }
  }, [t]);

  const handleInstallUpdate = useCallback(async () => {
    if (!updateAvailable || downloading) return;
    setUpdateError(null);
    setDownloading(true);
    setUpdatePhase("downloading");
    setUpdateProgress({ downloaded: 0, total: 0 });
    try {
      const upd = await check();
      if (!upd) {
        setDownloading(false);
        setUpdateProgress(null);
        setUpdatePhase("error");
        setUpdateError("No update available. Please try again.");
        return;
      }
      type DownloadEventData = { contentLength?: number; chunkLength?: number; content_length?: number; chunk_length?: number };
      const onProgress = (event: { event?: string; data?: DownloadEventData }) => {
        try {
          const ev = String((event as { event?: string })?.event ?? "").toLowerCase();
          const data = event?.data;
          const total = data?.contentLength ?? data?.content_length;
          const chunk = data?.chunkLength ?? data?.chunk_length;
          if ((ev === "started") && total != null) {
            setUpdateProgress((p) => ({ downloaded: p?.downloaded ?? 0, total }));
          } else if (ev === "progress" && chunk != null) {
            setUpdateProgress((p) =>
              p ? { ...p, downloaded: p.downloaded + chunk } : { downloaded: chunk, total: 0 }
            );
          } else if (ev === "finished") {
            setUpdatePhase("installing");
            setUpdateProgress(null);
          }
        } catch {
          // ignore bad progress events
        }
      };
      await upd.download(onProgress);
      setDownloading(false);
      setUpdatePhase("installing");
      setUpdateProgress(null);
      await upd.install();
      setUpdatePhase("restarting");
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUpdateError(message || "Update failed. Try again or download from the website.");
      setDownloading(false);
      setUpdateProgress(null);
      setUpdatePhase("error");
    }
  }, [updateAvailable, downloading]);

  const showUpdateDialog =
    !!updateAvailable && !updateDialogDismissed && isTauri() && onboardingComplete;

  const handleExit = useCallback(() => {
    if (isTauri()) {
      getCurrentWindow().close();
    }
  }, []);

  const handleNavigate = useCallback((page: AppPage) => {
    setCurrentPage(page);
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, page);
    } catch {
      // ignore
    }
  }, []);

  const handleNewServer = useCallback(() => {
    setCurrentPage("servers");
    setMenuViewRequest("create");
  }, []);

  const handleImportServer = useCallback(() => {
    setCurrentPage("servers");
    setMenuViewRequest("import");
  }, []);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const handlePageLoadRecover = useCallback(() => {
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, "home");
    } catch {
      // ignore
    }
    setCurrentPage("home");
  }, []);

  const [settingsAsIcon, setSettingsAsIconState] = useState(() => getSettingsAsIconDefault());
  const setSettingsAsIcon = useCallback((value: boolean) => {
    try {
      localStorage.setItem(SETTINGS_AS_ICON_KEY, value ? "true" : "false");
    } catch {
      // ignore
    }
    setSettingsAsIconState(value);
  }, []);

  return (
    <SettingsNavContext.Provider value={{ settingsAsIcon, setSettingsAsIcon }}>
    <DeveloperMenuContext.Provider value={{ developerMenuEnabled, setDeveloperMenuEnabled }}>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col w-full bg-background text-foreground">
      <CustomTitleBar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onNewServer={handleNewServer}
        onImportServer={handleImportServer}
        onDevMenu={() => setDevMenuOpen(true)}
        onRefresh={handleRefresh}
        onWindowTools={() => setWindowToolsOpen(true)}
        serverContext={menuBarServerContext}
        onExit={isTauri() ? handleExit : undefined}
        updateAvailable={!!updateAvailable}
        onInstallUpdate={handleInstallUpdate}
        onCheckForUpdates={isTauri() ? handleCheckForUpdates : undefined}
        isDownloadingUpdate={downloading}
      />

      {updateAvailable && isTauri() && (
        <UpdateAvailableDialog
          open={showUpdateDialog}
          onOpenChange={(open) => !open && !downloading && setUpdateDialogDismissed(true)}
          update={updateAvailable}
          onInstall={handleInstallUpdate}
          onLater={() => setUpdateDialogDismissed(true)}
          isDownloading={downloading}
          progress={updateProgress}
          phase={updatePhase}
          error={updateError}
          onRetry={() => { setUpdateError(null); setUpdatePhase("idle"); handleInstallUpdate(); }}
        />
      )}

      {testControlUrl && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <span>{t("header.testMode")}</span>
          <a href={testControlUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            {t("header.openTestControl")}
          </a>
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <PageErrorBoundary key={currentPage} onGoHome={handlePageLoadRecover}>
          <Suspense fallback={<LoadingScreen />}>
          {currentPage === "home" && (
            <PageTransition pageKey="home">
              <HomePage
                serverCount={serverCount}
                runningCount={runningCount}
                onCreateServer={handleNewServer}
                onImportServer={handleImportServer}
                onGoToServers={() => setCurrentPage("servers")}
                onGoToAi={() => setCurrentPage("ai")}
                onOpenAccount={() => {
                  setInitialSettingsTab("account");
                  setCurrentPage("settings");
                }}
              />
            </PageTransition>
          )}

          {currentPage === "servers" && (
            <PageTransition pageKey="servers">
              <ServerList
                menuViewRequest={menuViewRequest}
                onMenuViewRequestHandled={() => setMenuViewRequest(null)}
                runInBackground={runInBackground}
                onRunInBackgroundChange={setRunInBackground}
                idleSlideshow={idleSlideshow}
                onIdleSlideshowChange={setIdleSlideshow}
                onMenuBarServerContextChange={setMenuBarServerContext}
                onServerCountChange={setServerCount}
                onRunningCountChange={setRunningCount}
                onGoToHome={() => setCurrentPage("home")}
              />
            </PageTransition>
          )}

          {currentPage === "storage" && (
            <PageTransition pageKey="storage">
              <StoragePage
                onOpenAccount={() => { setInitialSettingsTab("account"); setCurrentPage("settings"); }}
              />
            </PageTransition>
          )}
          {currentPage === "ai" && (
            <PageTransition pageKey="ai">
              <AiPage
                onOpenAccount={() => { setInitialSettingsTab("account"); setCurrentPage("settings"); }}
              />
            </PageTransition>
          )}
          {currentPage === "settings" && (
            <PageTransition pageKey="settings">
              <SettingsView
                onClose={() => { setCurrentPage("home"); setInitialSettingsTab(null); }}
                onEnsureAccountVisible={() => { setCurrentPage("settings"); setInitialSettingsTab("account"); }}
                runInBackground={runInBackground}
                onRunInBackgroundChange={setRunInBackground}
                idleSlideshow={idleSlideshow}
                onIdleSlideshowChange={setIdleSlideshow}
                initialTab={initialSettingsTab ?? undefined}
                onInitialTabConsumed={() => setInitialSettingsTab(null)}
              />
            </PageTransition>
          )}
          {currentPage === "dev" && import.meta.env.DEV && (
            <PageTransition pageKey="dev">
              <DevPage onOpenWindowTools={() => setWindowToolsOpen(true)} />
            </PageTransition>
          )}
          </Suspense>
        </PageErrorBoundary>
      </main>

      <DevMenu open={devMenuOpen} onClose={() => setDevMenuOpen(false)} />
      <WindowTools open={windowToolsOpen} onClose={() => setWindowToolsOpen(false)} />
      <AppContextMenu />
      <Toaster />

      <AnimatePresence>
        {closeConfirm && (
          <CloseConfirmOverlay
            key="close-confirm"
            runningCount={closeConfirm.runningCount}
            onCancel={() => setCloseConfirm(null)}
            onCloseAnyway={handleCloseAnyway}
          />
        )}
      </AnimatePresence>
      <OnboardingOverlay
        completed={onboardingComplete}
        onComplete={() => {
          setOnboardingCompleteState(true);
          try {
            localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
          } catch {}
          if (!getHighlightTourComplete() && currentPage === "home") {
            setHighlightTourStep(0);
            setHighlightTourActive(true);
          }
        }}
      />
      {currentPage === "home" && (
        <HighlightTourOverlay
          active={highlightTourActive}
          step={highlightTourStep}
          onNext={() => setHighlightTourStep((s) => s + 1)}
          onComplete={() => {
            setHighlightTourComplete();
            setHighlightTourActive(false);
          }}
        />
      )}
    </div>
    </DeveloperMenuContext.Provider>
    </SettingsNavContext.Provider>
  );
}

function CloseConfirmOverlay({
  runningCount,
  onCancel,
  onCloseAnyway,
}: {
  runningCount: number;
  onCancel: () => void;
  onCloseAnyway: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground">
                {t("closeConfirm.title")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {runningCount === 1
                  ? t("closeConfirm.message", { count: 1 })
                  : t("closeConfirm.message_plural", { count: runningCount })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("closeConfirm.hint")}
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onCloseAnyway}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t("closeConfirm.closeAnyway")}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DesignProvider>
        <AppWithAccountPreload />
      </DesignProvider>
    </ThemeProvider>
  );
}

function AppWithAccountPreload() {
  const user = useAuthStore((s) => s.user);
  return (
    <AccountDataProvider token={user?.token ?? null}>
      <AppContent />
    </AccountDataProvider>
  );
}
