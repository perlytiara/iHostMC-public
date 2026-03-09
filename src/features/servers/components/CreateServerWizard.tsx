"use client";

import { Button } from "@/components/ui/button";
import { isTauri, tauriErrorMessage, TAURI_DESKTOP_ERROR_KEY } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  FileCode,
  Blocks,
  Puzzle,
  Cog,
  Hammer,
  Layers,
  Package,
  Hexagon,
  Check,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Cpu,
  Globe,
  Server as ServerIcon,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MotdEditor } from "./MotdEditor";
import type { CreateServerInput, ForgeBuildOption, ServerConfig, ServerType } from "../types";

function compareVersions(a: string, b: string): number {
  const segA = a.split(".").map((s) => parseInt(s, 10) || 0);
  const segB = b.split(".").map((s) => parseInt(s, 10) || 0);
  const maxLen = Math.max(segA.length, segB.length);
  for (let i = 0; i < maxLen; i++) {
    const na = segA[i] ?? 0;
    const nb = segB[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function sortVersionsNewestFirst(list: string[]): string[] {
  return [...list].sort((a, b) => compareVersions(b, a));
}

const SERVER_TYPES: { value: ServerType; label: string; desc: string; icon: typeof Box }[] = [
  { value: "vanilla", label: "Vanilla", desc: "Official Mojang server", icon: Box },
  { value: "paper", label: "Paper", desc: "High-performance fork", icon: FileCode },
  { value: "purpur", label: "Purpur", desc: "Paper fork with extras", icon: Hexagon },
  { value: "spigot", label: "Spigot", desc: "Modified CraftBukkit", icon: Cog },
  { value: "bukkit", label: "Bukkit", desc: "Plugin-ready server", icon: Puzzle },
  { value: "fabric", label: "Fabric", desc: "Lightweight modloader", icon: Layers },
  { value: "forge", label: "Forge", desc: "Classic modloader", icon: Hammer },
  { value: "neoforge", label: "NeoForge", desc: "Modern Forge fork", icon: Blocks },
  { value: "quilt", label: "Quilt", desc: "Fabric-compatible loader", icon: Package },
];

const STEPS = ["wizard.nameType", "wizard.gameVersion", "wizard.memoryJava", "wizard.review"];

/** Soft limit: above this count we show a hint before creating another server. */
const SOFT_SERVER_LIMIT = 20;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

interface CreateServerWizardProps {
  initialVersion?: string | null;
  initialName?: string | null;
  initialMotd?: string | null;
  initialFaviconB64?: string | null;
  onCreated: (serverId: string) => void;
  onCancel: () => void;
  /** Called when creation starts (true, serverName) and when it ends (false). Use to show a ghost "Creating…" entry in the server list. */
  onCreatingChange?: (creating: boolean, serverName?: string) => void;
  /** Called when user minimizes the creation view (ghost stays in list; they can click it to return). */
  onMinimizeDuringCreation?: () => void;
}

export function CreateServerWizard({
  initialVersion,
  initialName,
  initialMotd,
  initialFaviconB64,
  onCreated,
  onCancel,
  onCreatingChange,
  onMinimizeDuringCreation,
}: CreateServerWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState(initialName?.trim() || "My Server");
  const [motd, setMotd] = useState(initialMotd?.trim() || "");
  const [faviconB64, _setFaviconB64] = useState<string | null>(initialFaviconB64 ?? null);
  const [serverType, setServerType] = useState<ServerType>("paper");
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState(initialVersion || "");
  const [fabricLoaders, setFabricLoaders] = useState<string[]>([]);
  const [fabricLoader, setFabricLoader] = useState("");
  const [fabricInstallers, setFabricInstallers] = useState<string[]>([]);
  const [fabricInstaller, setFabricInstaller] = useState("");
  const [forgeBuilds, setForgeBuilds] = useState<ForgeBuildOption[]>([]);
  const [forgeBuild, setForgeBuild] = useState("");
  const [neoforgeVersions, setNeoforgeVersions] = useState<string[]>([]);
  const [neoforgeVersion, setNeoforgeVersion] = useState("");
  const [memoryMb, setMemoryMb] = useState(4096);
  const [port, setPort] = useState("");
  const [availRamMb, setAvailRamMb] = useState(0);
  const [javaPath, setJavaPath] = useState<string | null>(null);
  const [javaPaths, setJavaPaths] = useState<{ bundled: string | null; system: string | null }>({ bundled: null, system: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createLogLines, setCreateLogLines] = useState<string[]>([]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const isFabric = serverType === "fabric";
  const isForge = serverType === "forge";
  const isNeoForge = serverType === "neoforge";

  const goTo = (s: number) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const loadGameVersions = useCallback(async () => {
    if (!isTauri()) { setError("Run the app in desktop mode."); return; }
    setLoading(true); setError(null);
    try {
      let list: string[] = [];
      if (serverType === "vanilla") list = await invoke("get_versions_vanilla");
      else if (serverType === "paper") list = await invoke("get_versions_paper");
      else if (serverType === "purpur") list = await invoke("get_versions_purpur");
      else if (serverType === "spigot") list = await invoke("get_versions_spigot");
      else if (serverType === "bukkit") list = await invoke("get_versions_bukkit");
      else if (serverType === "fabric") list = await invoke("get_versions_fabric");
      else if (serverType === "forge" || serverType === "neoforge") list = await invoke("get_versions_forge");
      else if (serverType === "quilt") list = await invoke("get_versions_quilt");
      list = sortVersionsNewestFirst(list);
      setVersions(list);
      if (list.length) setVersion(initialVersion && list.includes(initialVersion) ? initialVersion : list[0]);
      if (serverType === "fabric") {
        const installers = sortVersionsNewestFirst(await invoke<string[]>("get_versions_fabric_installer"));
        setFabricInstallers(installers);
        if (installers.length) setFabricInstaller(installers[0]);
      } else { setFabricLoaders([]); setFabricInstallers([]); setFabricLoader(""); setFabricInstaller(""); }
      setForgeBuilds([]); setForgeBuild(""); setNeoforgeVersions([]); setNeoforgeVersion("");
    } catch (e) {
      const msg = tauriErrorMessage(e);
      setError(msg === TAURI_DESKTOP_ERROR_KEY ? t(msg) : msg);
    } finally { setLoading(false); }
  }, [serverType, initialVersion, t]);

  const loadModloaderForGame = useCallback(async (gameVersion: string) => {
    if (!isTauri() || !gameVersion) return;
    setLoading(true); setError(null);
    try {
      if (serverType === "fabric") {
        const loaders = sortVersionsNewestFirst(await invoke<string[]>("get_versions_fabric_loader_for_game", { gameVersion }));
        setFabricLoaders(loaders);
        if (loaders.length) setFabricLoader(loaders[0]);
      } else if (serverType === "forge") {
        const builds = await invoke<ForgeBuildOption[]>("get_versions_forge_builds", { minecraftVersion: gameVersion });
        setForgeBuilds(builds);
        if (builds.length) setForgeBuild(builds[0].version);
      } else if (serverType === "neoforge") {
        const neoforge = sortVersionsNewestFirst(await invoke<string[]>("get_versions_neoforge_for_game", { minecraftVersion: gameVersion }));
        setNeoforgeVersions(neoforge);
        if (neoforge.length) setNeoforgeVersion(neoforge[0]);
      }
    } catch (e) {
      const msg = tauriErrorMessage(e);
      setError(msg === TAURI_DESKTOP_ERROR_KEY ? t(msg) : msg);
    } finally { setLoading(false); }
  }, [serverType, t]);

  useEffect(() => { if (step === 1) loadGameVersions(); }, [step, loadGameVersions]);
  useEffect(() => {
    if (step === 1 && version && (isFabric || isForge || isNeoForge) && versions.length > 0) loadModloaderForGame(version);
  }, [step, version, isFabric, isForge, isNeoForge, versions.length, loadModloaderForGame]);

  // Cycle through phrases during server creation
  useEffect(() => {
    if (!creating) return;
    const phraseInterval = setInterval(() => setPhraseIndex((i) => i + 1), 3200);
    return () => clearInterval(phraseInterval);
  }, [creating]);

  useEffect(() => {
    if (createLogLines.length > 0) logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [createLogLines.length]);

  const loadRamAndJava = async () => {
    if (!isTauri()) return;
    try {
      const ram = await invoke<number>("get_system_ram_mb");
      setAvailRamMb(ram);
      setMemoryMb(Math.min(8192, Math.max(2048, Math.floor(ram / 2))));
      const paths = await invoke<{ bundled: string | null; system: string | null }>("get_java_paths");
      setJavaPaths(paths);
      setJavaPath(paths.bundled ?? paths.system ?? null);
    } catch { setMemoryMb(4096); }
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    setCreateLogLines([]);
    setPhraseIndex(0);
    setLoading(true);
    onCreatingChange?.(true, name);

    let unlisten: (() => void) | undefined;
    try {
      if (!isTauri()) {
        setError("Run the app in desktop mode.");
        setCreating(false);
        setLoading(false);
        onCreatingChange?.(false);
        return;
      }
      const existing = await invoke<ServerConfig[]>("list_servers");
      if (existing.length >= SOFT_SERVER_LIMIT) {
        const msg = t("wizard.manyServersConfirm", { count: existing.length });
        if (!window.confirm(msg)) {
          setCreating(false);
          setLoading(false);
          onCreatingChange?.(false);
          return;
        }
      }
      const portNum = port.trim() ? parseInt(port.trim(), 10) : undefined;
      if (portNum !== undefined && (Number.isNaN(portNum) || portNum < 1 || portNum > 65535)) {
        setError("Port must be between 1 and 65535.");
        setCreating(false);
        setLoading(false);
        onCreatingChange?.(false);
        return;
      }
      const input: CreateServerInput = { name, server_type: serverType, minecraft_version: version, memory_mb: memoryMb, port: portNum ?? null, java_path: javaPath };
      if (motd.trim()) input.motd = motd.trim();
      if (faviconB64) input.favicon_b64 = faviconB64;
      if (isFabric) { input.fabric_loader_version = fabricLoader || undefined; input.fabric_installer_version = fabricInstaller || undefined; }
      if (isForge && forgeBuild) input.forge_build_version = forgeBuild;
      if (isNeoForge && neoforgeVersion) input.neoforge_version = neoforgeVersion;

      unlisten = await listen<string>("create-server-log", (ev) => {
        setCreateLogLines((prev) => [...prev, ev.payload ?? ""]);
      });

      const created = await invoke<ServerConfig>("create_server", { config: input });
      onCreated(created.id);
    } catch (e) {
      const msg = tauriErrorMessage(e);
      setError(msg === TAURI_DESKTOP_ERROR_KEY ? t(msg) : msg);
    } finally {
      unlisten?.();
      setLoading(false);
      setCreating(false);
      onCreatingChange?.(false);
    }
  };

  const memoryPresets = [2048, 4096, 6144, 8192];
  const suggestedMb = Math.min(8192, Math.max(2048, Math.floor(availRamMb / 2)));

  const creatingPhraseKeys = [
    "wizard.creatingPhrase0",
    "wizard.creatingPhrase1",
    "wizard.creatingPhrase2",
    "wizard.creatingPhrase3",
    "wizard.creatingPhrase4",
    "wizard.creatingPhrase5",
    "wizard.creatingPhrase6",
    "wizard.creatingPhrase7",
    "wizard.creatingPhrase8",
  ];
  const currentPhrase = creatingPhraseKeys[phraseIndex % creatingPhraseKeys.length];

  if (creating) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
        {/* Subtle flowing background elements */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute text-muted-foreground/20 text-lg"
              style={{
                left: `${(i * 9) % 100}%`,
                top: `${(i * 7 + 15) % 85}%`,
              }}
              animate={{
                x: [0, 24, 0],
                opacity: [0.15, 0.35, 0.15],
              }}
              transition={{
                duration: 4 + (i % 3),
                repeat: Infinity,
                delay: i * 0.4,
              }}
            >
              ◦
            </motion.span>
          ))}
          {[...Array(8)].map((_, i) => (
            <motion.span
              key={`b-${i}`}
              className="absolute text-muted-foreground/15 text-sm"
              style={{
                right: `${(i * 11) % 100}%`,
                top: `${(i * 13 + 10) % 90}%`,
              }}
              animate={{
                x: [0, -20, 0],
                opacity: [0.1, 0.25, 0.1],
              }}
              transition={{
                duration: 5 + (i % 2),
                repeat: Infinity,
                delay: i * 0.5,
              }}
            >
              ·
            </motion.span>
          ))}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="text-xl font-bold">{t("wizard.creatingTitle")}</h2>
            <AnimatePresence mode="wait">
              <motion.p
                key={currentPhrase}
                className="text-sm text-muted-foreground text-center min-h-[2rem]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                {t(currentPhrase)}
              </motion.p>
            </AnimatePresence>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/60"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </div>
            {onMinimizeDuringCreation && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={onMinimizeDuringCreation}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("wizard.backToList")}
              </Button>
            )}
          </motion.div>
        </div>

        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
          <details className="group" open={createLogLines.length > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
              {t("wizard.creationLog")}
              {createLogLines.length > 0 && (
                <span className="text-[10px]">({createLogLines.length})</span>
              )}
            </summary>
            <div
              className="max-h-36 overflow-y-auto overflow-x-hidden border-t border-border bg-black/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
              style={{ scrollBehavior: "smooth" }}
            >
              {createLogLines.length === 0 ? (
                <span className="italic">{t("wizard.creationLogWaiting")}</span>
              ) : (
                createLogLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
      {/* Stepper */}
      <div className="mb-3 flex w-full max-w-lg items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-0.5">
              <motion.div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                  i < step ? "bg-primary text-primary-foreground" :
                  i === step ? "bg-primary text-primary-foreground ring-2 ring-primary/20" :
                  "bg-muted text-muted-foreground"
                )}
                animate={i === step ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.2 }}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </motion.div>
              <span className="text-[9px] text-muted-foreground text-center max-w-[72px] leading-tight">{t(label)}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-1 h-0.5 flex-1 rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: i < step ? "100%" : "0%" }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step content — single scrollable area if needed */}
      <div className="mx-auto w-full max-w-lg min-h-0 flex-1 flex flex-col overflow-hidden">
        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 py-1">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div key="step0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-3">
              <h2 className="text-base font-bold">{t("wizard.createServer")}</h2>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="space-y-1 flex-1 w-full">
                  <label className="text-xs font-medium text-muted-foreground">{t("wizard.name")}</label>
                  <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
                </div>
                {faviconB64 && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Server icon</span>
                    <img src={`data:image/png;base64,${faviconB64}`} alt="" className="size-10 rounded border border-border bg-muted/50" />
                  </div>
                )}
              </div>
              <MotdEditor value={motd} onChange={setMotd} label={t("wizard.motd")} placeholder="A Minecraft Server" compact />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("wizard.serverType")}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SERVER_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isActive = serverType === type.value;
                    return (
                      <motion.button
                        key={type.value}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setServerType(type.value)}
                        className={cn(
                          "relative flex flex-col items-center gap-0.5 rounded-lg border-2 p-2 text-center transition-colors",
                          isActive ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        {isActive && (
                          <div className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                            <Check className="h-1.5 w-1.5 text-primary-foreground" />
                          </div>
                        )}
                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-[11px] font-semibold">{type.label}</span>
                        <span className="text-[9px] text-muted-foreground leading-tight line-clamp-1">{type.desc}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-3">
              <h2 className="text-base font-bold">{t("wizard.gameVersion")}</h2>
              {error && <p className="text-xs text-destructive rounded-lg bg-destructive/10 border border-destructive/30 px-2.5 py-1.5">{error}</p>}
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">{t("wizard.loadingVersions")}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t("wizard.minecraftVersion")}</label>
                    <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={version} onChange={(e) => setVersion(e.target.value)}>
                      {versions.map((v, i) => <option key={v} value={v}>{v}{i === 0 ? ` ${t("wizard.latestLabel")}` : ""}</option>)}
                    </select>
                  </div>
                  {isForge && forgeBuilds.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Forge build</label>
                      <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={forgeBuild} onChange={(e) => setForgeBuild(e.target.value)}>
                        {forgeBuilds.map((b) => <option key={b.version} value={b.version}>{b.label}</option>)}
                      </select>
                    </div>
                  )}
                  {isNeoForge && neoforgeVersions.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">NeoForge version</label>
                      <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={neoforgeVersion} onChange={(e) => setNeoforgeVersion(e.target.value)}>
                        {neoforgeVersions.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {isFabric && fabricLoaders.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Fabric Loader</label>
                      <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={fabricLoader} onChange={(e) => setFabricLoader(e.target.value)}>
                        {fabricLoaders.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {isFabric && fabricInstallers.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Fabric Installer</label>
                      <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={fabricInstaller} onChange={(e) => setFabricInstaller(e.target.value)}>
                        {fabricInstallers.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-3">
              <h2 className="text-base font-bold">{t("wizard.memoryJava")}</h2>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" /> {t("wizard.memoryMb")}
                </label>
                {availRamMb > 0 && <p className="text-[10px] text-muted-foreground">{t("wizard.suggested", { mb: suggestedMb, total: availRamMb })}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {memoryPresets.map((mb) => (
                    <motion.button
                      key={mb} type="button"
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setMemoryMb(mb)}
                      className={cn("rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors", memoryMb === mb ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/30")}
                    >
                      {mb / 1024} GB
                    </motion.button>
                  ))}
                </div>
                <input type="range" min={1024} max={Math.max(16384, availRamMb)} step={512} value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value))} className="w-full accent-primary h-1.5" />
                <span className="text-[10px] text-muted-foreground">{memoryMb} MB</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> {t("wizard.port")}
                  </label>
                  <input type="number" placeholder="25565" className="w-24 rounded-lg border border-input bg-background px-2.5 py-2 text-sm" value={port} onChange={(e) => setPort(e.target.value)} min={1} max={65535} />
                </div>
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">{t("wizard.java")}</label>
                  <select className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm" value={javaPath ?? ""} onChange={(e) => setJavaPath(e.target.value || null)}>
                    <option value="">{t("wizard.systemJava")}</option>
                    {javaPaths.bundled && <option value={javaPaths.bundled}>{t("wizard.bundledJava")}</option>}
                    {javaPaths.system && javaPaths.system !== javaPaths.bundled && <option value={javaPaths.system}>{t("wizard.systemJavaPath")}</option>}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("wizard.portHint")}</p>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-3">
              <h2 className="text-base font-bold">{t("wizard.review")}</h2>
              <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <ReviewRow icon={ServerIcon} label={t("wizard.name")} value={name} />
                <ReviewRow icon={Blocks} label={t("wizard.serverType")} value={SERVER_TYPES.find((st) => st.value === serverType)?.label ?? serverType} />
                <ReviewRow icon={Globe} label={t("wizard.minecraftVersion")} value={version} />
                <ReviewRow icon={Cpu} label={t("wizard.memoryMb")} value={`${memoryMb} MB (${(memoryMb / 1024).toFixed(1)} GB)`} />
                {port && <ReviewRow icon={Globe} label={t("wizard.port")} value={port} />}
                {isFabric && fabricLoader && <ReviewRow icon={Layers} label="Fabric Loader" value={fabricLoader} />}
                {isForge && forgeBuild && <ReviewRow icon={Hammer} label="Forge Build" value={forgeBuild} />}
                {isNeoForge && neoforgeVersion && <ReviewRow icon={Blocks} label="NeoForge" value={neoforgeVersion} />}
              </div>
              {error && <p className="text-xs text-destructive rounded-lg bg-destructive/10 border border-destructive/30 px-2.5 py-1.5">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="mx-auto mt-3 flex w-full max-w-lg shrink-0 items-center justify-between">
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => goTo(step - 1)} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> {t("wizard.back")}
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>{t("wizard.cancel")}</Button>
        </div>
        {step < 3 ? (
          <Button
            onClick={() => { if (step === 1) { goTo(2); loadRamAndJava(); } else goTo(step + 1); }}
            disabled={loading}
            className="gap-1.5"
          >
            {t("wizard.next")} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={loading} className="gap-1.5">
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("wizard.creating")}</> : t("wizard.create")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: typeof Box; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-xs font-medium text-foreground truncate">{value}</span>
    </div>
  );
}
