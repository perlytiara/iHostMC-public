"use client";

import { Button } from "@/components/ui/button";
import { useDesign } from "@/components/design-provider";
import { useTheme, THEMES, type ThemeId } from "@/components/theme-provider";
import { isTauri } from "@/lib/utils";
import { setLocale, supportedLngs } from "@/lib/i18n";
import type { DesignPalette, DesignStyle } from "@/lib/design";
import { motion } from "framer-motion";
import {
  Shield,
  Share2,
  ArrowLeft,
  Settings,
  Palette,
  Globe,
  Wifi,
  Info,
  Check,
  User,
  Code2,
  Router,
  Loader2,
  CloudCog,
} from "lucide-react";
import { AccountSection } from "./AccountSection";
import { BackupSyncSection } from "./BackupSyncSection";
import { DevOptionsSection } from "./DevOptionsSection";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getFrpPrefs } from "@/lib/tunnel-prefs";
import { AppLogo } from "@/components/AppLogo";

async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch { return false; }
}

async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (enabled) await enable(); else disable();
}

type SettingsTab = "general" | "account" | "backup" | "appearance" | "language" | "network" | "about" | "developer";

const BASE_TABS: { id: SettingsTab; icon: typeof Settings; labelKey: string }[] = [
  { id: "account", icon: User, labelKey: "settings.account" },
  { id: "backup", icon: CloudCog, labelKey: "settings.backupSync.tab" },
  { id: "general", icon: Settings, labelKey: "settings.general" },
  { id: "appearance", icon: Palette, labelKey: "settings.appearance" },
  { id: "language", icon: Globe, labelKey: "settings.language" },
  { id: "network", icon: Wifi, labelKey: "settings.network" },
  { id: "about", icon: Info, labelKey: "settings.about" },
];

const tabs: { id: SettingsTab; icon: typeof Settings; labelKey: string }[] =
  import.meta.env.DEV
    ? [...BASE_TABS, { id: "developer" as const, icon: Code2, labelKey: "settings.developer" }]
    : BASE_TABS;

interface SettingsViewProps {
  onClose?: () => void;
  /** Ensure settings page is visible with account tab (e.g. before logout to avoid blank screen) */
  onEnsureAccountVisible?: () => void;
  runInBackground?: boolean;
  onRunInBackgroundChange?: (value: boolean) => void;
  /** Open directly to this tab (e.g. "account" from Home) */
  initialTab?: SettingsTab;
  onInitialTabConsumed?: () => void;
}

export function SettingsView({ onClose, onEnsureAccountVisible, runInBackground = true, onRunInBackgroundChange, initialTab, onInitialTabConsumed }: SettingsViewProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { style, palette, setStyle, setPalette } = useDesign();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "account");
  const [startOnStartup, setStartOnStartup] = useState(false);
  const [autostartLoaded, setAutostartLoaded] = useState(false);
  const [firewallPort, setFirewallPort] = useState("25565");
  const [firewallStatus, setFirewallStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [firewallMessage, setFirewallMessage] = useState("");
  const [firewallAllStatus, setFirewallAllStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [firewallAllMessage, setFirewallAllMessage] = useState("");
  const [serverPorts, setServerPorts] = useState<number[]>([]);
  const [relayTestStatus, setRelayTestStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [relayTestMessage, setRelayTestMessage] = useState("");
  const [upnpTestStatus, setUpnpTestStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [upnpTestMessage, setUpnpTestMessage] = useState("");
  const initialTabConsumed = useRef(false);

  useEffect(() => {
    getAutostartEnabled().then((v) => { setStartOnStartup(v); setAutostartLoaded(true); });
  }, []);

  useEffect(() => {
    if (isTauri() && activeTab === "network") {
      invoke<number[]>("get_server_ports").then(setServerPorts).catch(() => setServerPorts([]));
    }
  }, [activeTab]);

  useEffect(() => {
    if (initialTab && !initialTabConsumed.current) {
      setActiveTab(initialTab);
      initialTabConsumed.current = true;
      onInitialTabConsumed?.();
    }
  }, [initialTab, onInitialTabConsumed]);


  const handleStartOnStartup = useCallback(async (checked: boolean) => {
    await setAutostartEnabled(checked);
    setStartOnStartup(checked);
  }, []);

  const handleAddFirewallRule = useCallback(async () => {
    const portNum = parseInt(firewallPort.trim(), 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFirewallStatus("error");
      setFirewallMessage("Invalid port (1-65535).");
      return;
    }
    setFirewallStatus("loading");
    setFirewallMessage("");
    try {
      await invoke("add_windows_firewall_rule", { port: portNum });
      setFirewallStatus("ok");
      setFirewallMessage("");
    } catch (e) {
      setFirewallStatus("error");
      let msg = "";
      if (e != null && typeof e === "object") {
        const o = e as Record<string, unknown>;
        msg = typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : typeof o.data === "string" ? o.data : "";
      } else if (e instanceof Error) { msg = e.message; } else { msg = String(e); }
      if (!msg || msg.trim() === "") msg = t("settings.firewallErrorFallback");
      setFirewallMessage(msg);
    }
  }, [firewallPort, t]);

  const handleTestRelayConnection = useCallback(async () => {
    if (!isTauri()) return;
    setRelayTestStatus("loading");
    setRelayTestMessage("");
    try {
      const frp = getFrpPrefs();
      await invoke("test_frp_connection", { serverAddr: frp.serverAddr, serverPort: frp.serverPort });
      setRelayTestStatus("ok");
      setRelayTestMessage("");
    } catch (e) {
      setRelayTestStatus("error");
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      setRelayTestMessage(msg || t("settings.connectionFailed"));
    }
  }, [t]);

  const handleTestUpnp = useCallback(async () => {
    if (!isTauri()) return;
    setUpnpTestStatus("loading");
    setUpnpTestMessage("");
    try {
      const addr = await invoke<string>("try_upnp_forward", { port: 25565 });
      await invoke("remove_upnp_if_active");
      setUpnpTestStatus("ok");
      setUpnpTestMessage(addr ? t("settings.upnpOkWithAddress", { address: addr }) : t("settings.upnpOk"));
    } catch (e) {
      setUpnpTestStatus("error");
      const raw = e != null && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      const isRouterUnreachable =
        !raw ||
        raw.includes("Router didn't respond") ||
        raw.includes("Could not find a UPnP router") ||
        raw.includes("10060") ||
        raw.includes("did not properly respond");
      setUpnpTestMessage(isRouterUnreachable ? t("settings.upnpErrorRouterNotFound") : raw || t("settings.upnpError"));
    }
  }, [t]);

  const handleAddFirewallForAllServers = useCallback(async () => {
    if (!isTauri()) return;
    setFirewallAllStatus("loading");
    setFirewallAllMessage("");
    try {
      const ports = await invoke<number[]>("get_server_ports");
      if (ports.length === 0) {
        setFirewallAllStatus("error");
        setFirewallAllMessage(t("settings.firewallNoServers"));
        return;
      }
      const failed: number[] = [];
      for (const port of ports) {
        try {
          await invoke("add_windows_firewall_rule", { port });
        } catch {
          failed.push(port);
        }
      }
      if (failed.length === 0) {
        setFirewallAllStatus("ok");
        setFirewallAllMessage(t("settings.firewallAllSuccess", { count: ports.length }));
      } else {
        setFirewallAllStatus("error");
        setFirewallAllMessage(t("settings.firewallAllPartial", { failed: failed.join(", "), count: ports.length }));
      }
    } catch (e) {
      setFirewallAllStatus("error");
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      setFirewallAllMessage(msg || t("settings.firewallErrorFallback"));
    }
  }, [t]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Settings sidebar */}
      <aside className="flex w-52 flex-shrink-0 flex-col border-r border-border bg-card/50 p-3">
        <div className="mb-4 flex items-center gap-2">
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </motion.button>
          )}
          <h2 className="text-base font-bold">{t("settings.title")}</h2>
        </div>
        <nav className="space-y-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="settings-tab"
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-background p-6">
        <div className={cn("mx-auto space-y-6", (activeTab === "account" || activeTab === "backup" || activeTab === "developer") ? "max-w-4xl" : "max-w-xl")}>
          {activeTab === "backup" && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <BackupSyncSection />
            </motion.div>
          )}
          {activeTab === "developer" && import.meta.env.DEV && (
            <motion.div initial={{ opacity: 1, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h3 className="text-lg font-bold">{t("settings.developer")}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{t("settings.dev.tabDesc")}</p>
              </div>
              <DevOptionsSection />
            </motion.div>
          )}
          {activeTab === "account" && (
            <div className="min-h-[320px] w-full bg-background" role="region" aria-label={t("settings.account")}>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold">{t("settings.account")}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("settings.accountDesc")}</p>
                </div>
                <AccountSection onEnsureAccountVisible={onEnsureAccountVisible} />
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t("settings.general")}</h3>
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <span className="text-sm">{t("settings.startOnStartup")}</span>
                {!isTauri() ? (
                  <span className="text-xs text-muted-foreground">{t("settings.desktopOnly")}</span>
                ) : (
                  <ToggleSwitch checked={startOnStartup} disabled={!autostartLoaded} onChange={handleStartOnStartup} />
                )}
              </div>
              {isTauri() && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-medium">{t("settings.runInBackground")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("settings.runInBackgroundDesc")}</p>
                  </div>
                  <ToggleSwitch
                    checked={runInBackground}
                    onChange={async (checked) => {
                      await invoke("set_run_in_background", { run: checked });
                      onRunInBackgroundChange?.(checked);
                    }}
                  />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "appearance" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h3 className="text-lg font-bold">{t("settings.appearance")}</h3>

              {/* Theme grid with previews */}
              <div className="space-y-3">
                <span className="text-sm font-medium">{t("settings.selectTheme")}</span>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map((th) => (
                    <ThemePreviewCard
                      key={th.id}
                      themeId={th.id}
                      label={th.label}
                      isActive={theme === th.id}
                      isDark={th.isDark}
                      onClick={() => setTheme(th.id)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-sm font-medium">{t("settings.designStyle")}</span>
                <div className="flex gap-2">
                  {(["simple", "standard"] as const).map((s) => (
                    <Button key={s} variant={style === s ? "default" : "outline"} size="sm" onClick={() => setStyle(s as DesignStyle)}>
                      {t(s === "simple" ? "common.designSimple" : "common.designStandard")}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-sm font-medium">{t("settings.colorPalette")}</span>
                <div className="flex gap-2">
                  {(["monochrome", "colorful"] as const).map((p) => (
                    <Button key={p} variant={palette === p ? "default" : "outline"} size="sm" onClick={() => setPalette(p as DesignPalette)}>
                      {t(p === "monochrome" ? "common.designMonochrome" : "common.designColorful")}
                    </Button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "language" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t("settings.language")}</h3>
              <div className="flex flex-wrap gap-2">
                {supportedLngs.map((lng) => (
                  <Button key={lng} variant={i18n.language === lng ? "default" : "outline"} size="sm" onClick={() => setLocale(lng)} className="gap-2">
                    <span className="text-base">{lng === "en" ? "🇬🇧" : lng === "de" ? "🇩🇪" : "🇫🇷"}</span>
                    {t(`settings.language${lng.charAt(0).toUpperCase()}${lng.slice(1)}`)}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "network" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t("settings.network")}</h3>

              {isTauri() && (
                <>
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">{t("settings.relayTitle")}</h4>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={relayTestStatus === "loading"}
                        onClick={handleTestRelayConnection}
                      >
                        {relayTestStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("settings.testConnection")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("settings.relayDesc")}</p>
                    {relayTestStatus === "ok" && <p className="text-xs text-green-600 dark:text-green-400">{t("settings.connectionOk")}</p>}
                    {relayTestStatus === "error" && <p className="text-xs text-destructive">{relayTestMessage}</p>}
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Router className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">{t("settings.upnpTitle")}</h4>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={upnpTestStatus === "loading"}
                        onClick={handleTestUpnp}
                      >
                        {upnpTestStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("settings.testUpnp")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("settings.upnpDesc")}</p>
                    {upnpTestStatus === "ok" && <p className="text-xs text-green-600 dark:text-green-400">{upnpTestMessage}</p>}
                    {upnpTestStatus === "error" && <p className="text-xs text-destructive">{upnpTestMessage}</p>}
                  </div>
                </>
              )}

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{t("settings.firewallTitle")}</h4>
                </div>
                <p className="text-xs text-muted-foreground">{t("settings.firewallDesc")}</p>
                {!isTauri() ? (
                  <p className="text-xs text-muted-foreground">{t("settings.desktopOnly")}</p>
                ) : (
                  <div className="space-y-3">
                    {serverPorts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{t("settings.firewallPerServerHint")}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t("settings.firewallPortsList", { ports: serverPorts.join(", ") })}</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={firewallAllStatus === "loading"}
                            onClick={handleAddFirewallForAllServers}
                          >
                            {firewallAllStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("settings.firewallButtonAll")}
                          </Button>
                        </div>
                        {firewallAllStatus === "ok" && <p className="text-xs text-green-600 dark:text-green-400">{firewallAllMessage}</p>}
                        {firewallAllStatus === "error" && <p className="text-xs text-destructive">{firewallAllMessage}</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="text-xs font-medium">{t("settings.firewallPort")}</label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={firewallPort}
                        onChange={(e) => setFirewallPort(e.target.value)}
                        className="w-20 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                      />
                      <Button variant="outline" size="sm" disabled={firewallStatus === "loading"} onClick={handleAddFirewallRule}>
                        {firewallStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("settings.firewallButton")}
                      </Button>
                      {firewallStatus === "ok" && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.firewallSuccess")}</span>}
                      {firewallStatus === "error" && <span className="text-xs text-destructive max-w-xs">{firewallMessage}</span>}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "about" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t("settings.aboutTitle")}</h3>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <AppLogo size={72} />
                  <div>
                    <p className="text-sm font-bold">iHostMC</p>
                    <p className="text-xs text-muted-foreground">{t("common.version")}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("settings.aboutDesc")}</p>
                <p className="text-xs text-muted-foreground pt-1 border-t border-border">{t("settings.updatesHint")}</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span className={cn("pointer-events-none block h-5 w-5 rounded-full bg-primary-foreground shadow ring-0 transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function ThemePreviewCard({ themeId, label, isActive, onClick }: { themeId: ThemeId; label: string; isActive: boolean; isDark: boolean; onClick: () => void }) {
  const colors = getThemePreviewColors(themeId);

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border-2 p-0.5 transition-colors",
        isActive ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/30"
      )}
    >
      {isActive && (
        <div className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      {/* Mini UI preview */}
      <div className="flex h-20 w-full flex-col overflow-hidden rounded-lg" style={{ background: colors.bg }}>
        <div className="flex h-3.5 items-center gap-1 px-1.5" style={{ background: colors.titlebar }}>
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: colors.accent }} />
          <div className="h-1 w-6 rounded-sm" style={{ background: colors.muted }} />
        </div>
        <div className="flex flex-1">
          <div className="w-5 border-r" style={{ background: colors.card, borderColor: colors.border }}>
            <div className="mx-0.5 mt-1 h-1.5 rounded-sm" style={{ background: colors.accent }} />
            <div className="mx-0.5 mt-0.5 h-1.5 rounded-sm" style={{ background: colors.muted }} />
          </div>
          <div className="flex-1 p-1.5">
            <div className="h-1.5 w-2/3 rounded-sm" style={{ background: colors.fg + "40" }} />
            <div className="mt-1 h-1.5 w-full rounded-sm" style={{ background: colors.muted }} />
            <div className="mt-0.5 h-1.5 w-4/5 rounded-sm" style={{ background: colors.muted }} />
          </div>
        </div>
      </div>
      <p className="py-1.5 text-center text-xs font-medium">{label}</p>
    </motion.button>
  );
}

function getThemePreviewColors(themeId: ThemeId) {
  const map: Record<ThemeId, { bg: string; fg: string; card: string; titlebar: string; accent: string; muted: string; border: string }> = {
    light: { bg: "#ffffff", fg: "#0a0a0a", card: "#ffffff", titlebar: "#f4f4f5", accent: "#18181b", muted: "#e4e4e7", border: "#e4e4e7" },
    dark: { bg: "#0a0a0b", fg: "#fafafa", card: "#111114", titlebar: "#0d0d0e", accent: "#fafafa", muted: "#27272a", border: "#27272a" },
    ocean: { bg: "#f0f7ff", fg: "#0c2a4a", card: "#ffffff", titlebar: "#e8f1fb", accent: "#0284c7", muted: "#dbeafe", border: "#c8ddf0" },
    forest: { bg: "#f3f8f4", fg: "#0c2815", card: "#ffffff", titlebar: "#ebf3ec", accent: "#16a34a", muted: "#dcefdf", border: "#c6e0ca" },
    sunset: { bg: "#fff8f3", fg: "#2d1507", card: "#ffffff", titlebar: "#fbf0e8", accent: "#ea580c", muted: "#fed7aa", border: "#f0d4c0" },
    midnight: { bg: "#0f0d1a", fg: "#e8e4f5", card: "#141020", titlebar: "#0b091a", accent: "#a78bfa", muted: "#1e1a30", border: "#1e1a30" },
    neon: { bg: "#0a0d14", fg: "#f0f0f0", card: "#0e1119", titlebar: "#080b10", accent: "#00e89d", muted: "#1a1e28", border: "#1a1e28" },
  };
  return map[themeId];
}
