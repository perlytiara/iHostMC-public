"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  Filter,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  UserPlus,
  Users,
  Shield,
  ShieldOff,
  UserX,
  Ban,
  UserCheck,
  MessageSquare,
  Zap,
  ArrowDown,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast-store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  getOutputLines,
  subscribeLines,
  subscribeChunks,
} from "@/lib/server-output-store";

interface ServerManagementProps {
  serverId: string;
  isRunning: boolean;
  onSendCommand: (cmd: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

interface WhitelistEntry {
  uuid: string;
  name: string;
}

interface PropLine {
  key: string;
  value: string;
  raw: string;
}

interface CommandFeedback {
  id: number;
  command: string;
  responses: string[];
  timestamp: number;
}

const QUICK_COMMANDS = [
  { cmd: "list", labelKey: "management.cmdList", icon: Users, category: "info" },
  { cmd: "save-all", labelKey: "management.cmdSaveAll", icon: Save, category: "world" },
  { cmd: "whitelist list", labelKey: "management.cmdWhitelistList", icon: ShieldCheck, category: "whitelist" },
  { cmd: "whitelist reload", labelKey: "management.cmdWhitelistReload", icon: RefreshCw, category: "whitelist" },
  { cmd: "op", labelKey: "management.cmdOp", icon: Shield, category: "player" },
  { cmd: "deop", labelKey: "management.cmdDeop", icon: ShieldOff, category: "player" },
  { cmd: "kick", labelKey: "management.cmdKick", icon: UserX, category: "player" },
  { cmd: "ban", labelKey: "management.cmdBan", icon: Ban, category: "player" },
  { cmd: "pardon", labelKey: "management.cmdPardon", icon: UserCheck, category: "player" },
  { cmd: "say", labelKey: "management.cmdSay", icon: MessageSquare, category: "chat" },
];

const PROPERTY_CATEGORIES: Record<string, string[]> = {
  gameplay: [
    "gamemode", "difficulty", "pvp", "hardcore", "max-players",
    "spawn-protection", "allow-flight", "force-gamemode",
    "spawn-npcs", "spawn-animals", "spawn-monsters",
  ],
  world: [
    "level-name", "level-seed", "level-type", "generator-settings",
    "generate-structures", "max-world-size", "view-distance",
    "simulation-distance", "allow-nether",
  ],
  network: [
    "server-port", "server-ip", "online-mode", "network-compression-threshold",
    "max-tick-time", "enable-status", "enable-query", "query.port",
  ],
  performance: [
    "max-tick-time", "view-distance", "simulation-distance",
    "network-compression-threshold", "sync-chunk-writes",
    "entity-broadcast-range-percentage",
  ],
};

function parseProperties(content: string): PropLine[] {
  const lines = content.split(/\r?\n/);
  const result: PropLine[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result.push({
      key: trimmed.slice(0, eq).trim(),
      value: trimmed.slice(eq + 1).trim(),
      raw: line,
    });
  }
  return result;
}

function buildPropertiesContent(original: string, updates: Map<string, string>): string {
  const lines = original.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return line;
      const key = trimmed.slice(0, eq).trim();
      const newVal = updates.get(key);
      if (newVal !== undefined) return `${key}=${newVal}`;
      return line;
    })
    .join("\n");
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function classifyLogLine(line: string): "info" | "warn" | "error" | "player" | "command" | "normal" {
  const plain = stripAnsi(line).toLowerCase();
  if (plain.includes("[warn") || plain.includes("warning")) return "warn";
  if (plain.includes("[error") || plain.includes("exception") || plain.includes("severe")) return "error";
  if (plain.includes("joined the game") || plain.includes("left the game") || plain.includes("logged in")) return "player";
  if (plain.includes("issued server command") || plain.includes("[server]")) return "command";
  if (plain.includes("[info") || plain.includes("[server thread")) return "info";
  return "normal";
}

function getLineColor(type: ReturnType<typeof classifyLogLine>): string {
  switch (type) {
    case "warn": return "text-yellow-500 dark:text-yellow-400";
    case "error": return "text-red-500 dark:text-red-400";
    case "player": return "text-emerald-500 dark:text-emerald-400";
    case "command": return "text-blue-500 dark:text-blue-400";
    case "info": return "text-foreground/80";
    default: return "text-foreground/60";
  }
}

let feedbackIdCounter = 0;

// ─── Main component ────────────────────────────────────────────

export function ServerManagement({
  serverId,
  isRunning,
  onSendCommand,
  t,
}: ServerManagementProps) {
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [addPlayerName, setAddPlayerName] = useState("");
  const [addPlayerPending, setAddPlayerPending] = useState(false);
  const [propertiesLines, setPropertiesLines] = useState<PropLine[]>([]);
  const [propertiesRaw, setPropertiesRaw] = useState("");
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [propertyEdits, setPropertyEdits] = useState<Record<string, string>>({});
  const [customCmd, setCustomCmd] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [feedbackItems, setFeedbackItems] = useState<CommandFeedback[]>([]);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [propertyCategory, setPropertyCategory] = useState<string>("all");
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const feedbackEndRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const pendingCmdRef = useRef<string | null>(null);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedLinesRef = useRef<string[]>([]);

  // Subscribe to console output
  useEffect(() => {
    setConsoleLines(getOutputLines());
    const unsubLines = subscribeLines(() => {
      setConsoleLines(getOutputLines());
    });

    const unsubChunks = subscribeChunks((chunk) => {
      if (!pendingCmdRef.current) return;
      const newParts = chunk.split(/\r\n|\r|\n/).filter(Boolean);
      capturedLinesRef.current.push(...newParts.map(stripAnsi));
    });

    return () => {
      unsubLines();
      unsubChunks();
    };
  }, []);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  const sendWithFeedback = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    const trimmed = cmd.trim();

    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== trimmed);
      return [trimmed, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);

    pendingCmdRef.current = trimmed;
    capturedLinesRef.current = [];

    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);

    onSendCommand(trimmed);

    captureTimeoutRef.current = setTimeout(() => {
      const captured = [...capturedLinesRef.current];
      const id = ++feedbackIdCounter;
      setFeedbackItems((prev) => [
        ...prev.slice(-19),
        { id, command: trimmed, responses: captured, timestamp: Date.now() },
      ]);
      pendingCmdRef.current = null;
      capturedLinesRef.current = [];
    }, 1500);
  }, [onSendCommand]);

  const loadWhitelist = useCallback(async () => {
    if (!serverId) return;
    setWhitelistLoading(true);
    try {
      const raw = await invoke<string>("read_server_file", {
        serverId,
        path: "whitelist.json",
      });
      const data = JSON.parse(raw) as WhitelistEntry[];
      setWhitelist(Array.isArray(data) ? data : []);
    } catch {
      setWhitelist([]);
    } finally {
      setWhitelistLoading(false);
    }
  }, [serverId]);

  const loadProperties = useCallback(async () => {
    if (!serverId) return;
    setPropertiesLoading(true);
    try {
      const raw = await invoke<string>("read_server_file", {
        serverId,
        path: "server.properties",
      });
      setPropertiesRaw(raw);
      setPropertiesLines(parseProperties(raw));
      setPropertyEdits({});
    } catch {
      setPropertiesLines([]);
      setPropertiesRaw("");
    } finally {
      setPropertiesLoading(false);
    }
  }, [serverId]);

  useEffect(() => { loadWhitelist(); }, [loadWhitelist]);
  useEffect(() => { loadProperties(); }, [loadProperties]);

  const handleAddToWhitelist = async () => {
    const name = addPlayerName.trim();
    if (!name || !isRunning) {
      if (!isRunning) toast.error(t("management.serverMustBeRunning"));
      return;
    }
    setAddPlayerPending(true);
    try {
      sendWithFeedback(`whitelist add ${name}`);
      setTimeout(() => {
        onSendCommand("whitelist reload");
        loadWhitelist();
      }, 1500);
      setAddPlayerName("");
      toast.success(t("management.whitelistAddSent"));
    } finally {
      setAddPlayerPending(false);
    }
  };

  const handleRemoveFromWhitelist = (name: string) => {
    if (!isRunning) {
      toast.error(t("management.serverMustBeRunning"));
      return;
    }
    sendWithFeedback(`whitelist remove ${name}`);
    setTimeout(() => {
      onSendCommand("whitelist reload");
      loadWhitelist();
    }, 1500);
    toast.success(t("management.whitelistRemoveSent"));
  };

  const handleQuickCommand = (cmd: string) => {
    const playerCommands = ["op", "deop", "kick", "ban", "pardon"];
    if (playerCommands.includes(cmd)) {
      const promptKey = `management.prompt${cmd.charAt(0).toUpperCase() + cmd.slice(1)}`;
      const player = window.prompt(t(promptKey));
      if (player?.trim()) sendWithFeedback(`${cmd} ${player.trim()}`);
      return;
    }
    if (cmd === "say") {
      const msg = window.prompt(t("management.promptSay"));
      if (msg?.trim()) sendWithFeedback(`say ${msg.trim()}`);
      return;
    }
    sendWithFeedback(cmd);
  };

  const handleSaveProperties = async () => {
    if (!serverId || !propertiesRaw) return;
    setPropertiesSaving(true);
    try {
      const updates = new Map<string, string>();
      propertiesLines.forEach((p) => {
        const v = propertyEdits[p.key] ?? p.value;
        if (v !== p.value) updates.set(p.key, v);
      });
      const content = updates.size ? buildPropertiesContent(propertiesRaw, updates) : propertiesRaw;
      await invoke("write_server_file", {
        serverId,
        path: "server.properties",
        content,
      });
      toast.success(t("management.propertiesSaved"));
      loadProperties();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPropertiesSaving(false);
    }
  };

  const setPropEdit = (key: string, value: string) => {
    setPropertyEdits((prev) => ({ ...prev, [key]: value }));
  };

  const dirtyCount = Object.entries(propertyEdits).filter(
    ([key, val]) => {
      const orig = propertiesLines.find((p) => p.key === key);
      return orig && orig.value !== val;
    }
  ).length;

  const filteredProperties = propertiesLines.filter((p) => {
    const matchesFilter = !propertyFilter || p.key.toLowerCase().includes(propertyFilter.toLowerCase()) || (propertyEdits[p.key] ?? p.value).toLowerCase().includes(propertyFilter.toLowerCase());
    const matchesCategory = propertyCategory === "all" || (PROPERTY_CATEGORIES[propertyCategory]?.includes(p.key) ?? false);
    return matchesFilter && matchesCategory;
  });

  const handleCmdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (customCmd.trim()) {
        sendWithFeedback(customCmd.trim());
        setCustomCmd("");
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIndex);
        setCustomCmd(commandHistory[nextIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCustomCmd(commandHistory[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setCustomCmd("");
      }
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Status bar */}
      <div className="mb-3 flex items-center gap-3">
        <div className={cn(
          "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
          isRunning
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        )}>
          <CircleDot className={cn("h-3 w-3", isRunning && "animate-pulse")} />
          {isRunning ? t("management.serverOnline") : t("management.serverOffline")}
        </div>
      </div>

      <Tabs defaultValue="console" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="w-full justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="console" className="gap-1.5 text-xs">
            <Terminal className="h-3.5 w-3.5" />
            {t("management.tabConsole")}
          </TabsTrigger>
          <TabsTrigger value="players" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            {t("management.tabPlayers")}
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            {t("management.tabConfig")}
            {dirtyCount > 0 && (
              <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {dirtyCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Console & Commands Tab ─── */}
        <TabsContent value="console" className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-3">
            {/* Quick commands */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COMMANDS.map(({ cmd, labelKey, icon: Icon }) => (
                <Button
                  key={cmd}
                  variant="outline"
                  size="sm"
                  disabled={!isRunning}
                  onClick={() => handleQuickCommand(cmd)}
                  className="h-7 gap-1 text-xs"
                >
                  <Icon className="h-3 w-3" />
                  {t(labelKey)}
                </Button>
              ))}
            </div>

            {/* Command input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Terminal className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={cmdInputRef}
                  type="text"
                  className={cn(
                    "w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 font-mono text-xs",
                    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                    "transition-shadow"
                  )}
                  placeholder={t("management.cmdPlaceholder")}
                  value={customCmd}
                  onChange={(e) => setCustomCmd(e.target.value)}
                  onKeyDown={handleCmdKeyDown}
                  disabled={!isRunning}
                />
              </div>
              <Button
                size="sm"
                disabled={!isRunning || !customCmd.trim()}
                onClick={() => {
                  if (customCmd.trim()) {
                    sendWithFeedback(customCmd.trim());
                    setCustomCmd("");
                  }
                }}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {t("management.send")}
              </Button>
            </div>

            {/* Command feedback + Live console split */}
            <div className="flex flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
              {/* Command feedback panel */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-border lg:w-2/5">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">{t("management.commandFeedback")}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {feedbackItems.length > 0 && `${feedbackItems.length} ${t("management.commands")}`}
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  <AnimatePresence mode="popLayout">
                    {feedbackItems.length === 0 ? (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-6 text-center text-xs text-muted-foreground"
                      >
                        {t("management.noFeedbackYet")}
                      </motion.p>
                    ) : (
                      feedbackItems.map((item) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className="mb-2 rounded-lg border border-border bg-card p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3 w-3 text-primary" />
                            <code className="text-xs font-semibold text-primary">/{item.command}</code>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          {item.responses.length > 0 ? (
                            <div className="mt-1.5 rounded-md bg-muted/50 p-2">
                              {item.responses.map((line, i) => {
                                const type = classifyLogLine(line);
                                return (
                                  <div key={i} className={cn("font-mono text-[11px] leading-relaxed", getLineColor(type))}>
                                    {line}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="mt-1 text-[11px] text-muted-foreground italic">
                              {t("management.noResponseCaptured")}
                            </p>
                          )}
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                  <div ref={feedbackEndRef} />
                </div>
              </div>

              {/* Live console */}
              <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
                  <Terminal className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{t("management.liveConsole")}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={() => {
                        const text = consoleLines.map(stripAnsi).join("\n");
                        navigator.clipboard.writeText(text);
                        toast.info(t("servers.copied"));
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={() => consoleEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </span>
                </div>
                <div
                  className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed"
                  style={{ background: "hsl(var(--muted) / 0.2)" }}
                >
                  {consoleLines.length === 0 ? (
                    <p className="text-muted-foreground">{t("management.waitingOutput")}</p>
                  ) : (
                    consoleLines.slice(-200).map((line, i) => {
                      const clean = stripAnsi(line);
                      const type = classifyLogLine(clean);
                      return (
                        <div key={i} className={cn("break-all", getLineColor(type))}>
                          {clean}
                        </div>
                      );
                    })
                  )}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── Players & Whitelist Tab ─── */}
        <TabsContent value="players" className="flex-1 overflow-auto">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Online players */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {t("management.players")}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!isRunning}
                  onClick={() => sendWithFeedback("list")}
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("management.refresh")}
                </Button>
              </div>
              <div className="p-4">
                {!isRunning ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("management.serverMustBeRunning")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t("management.playersHint")}</p>
                    <div className="grid gap-2">
                      {[
                        { cmd: "op", icon: Shield, label: t("management.cmdOp"), variant: "outline" as const },
                        { cmd: "deop", icon: ShieldOff, label: t("management.cmdDeop"), variant: "outline" as const },
                        { cmd: "kick", icon: UserX, label: t("management.cmdKick"), variant: "outline" as const },
                        { cmd: "ban", icon: Ban, label: t("management.cmdBan"), variant: "destructive" as const },
                        { cmd: "pardon", icon: UserCheck, label: t("management.cmdPardon"), variant: "outline" as const },
                      ].map(({ cmd, icon: Icon, label, variant }) => (
                        <Button
                          key={cmd}
                          variant={variant}
                          size="sm"
                          className="justify-start gap-2"
                          onClick={() => handleQuickCommand(cmd)}
                          disabled={!isRunning}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Whitelist */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {t("management.whitelist")}
                  {whitelist.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                      {whitelist.length}
                    </span>
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!isRunning}
                  onClick={() => {
                    sendWithFeedback("whitelist reload");
                    setTimeout(loadWhitelist, 1000);
                  }}
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("management.reloadWhitelist")}
                </Button>
              </div>
              <div className="p-4">
                {whitelistLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{t("management.loading")}</span>
                  </div>
                ) : (
                  <>
                    {/* Add player */}
                    <div className="mb-3 flex gap-2">
                      <div className="relative flex-1">
                        <UserPlus className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          className={cn(
                            "w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-xs",
                            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          )}
                          placeholder={t("management.addPlayerPlaceholder")}
                          value={addPlayerName}
                          onChange={(e) => setAddPlayerName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddToWhitelist()}
                          disabled={!isRunning}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!isRunning || !addPlayerName.trim() || addPlayerPending}
                        onClick={handleAddToWhitelist}
                        className="gap-1.5"
                      >
                        {addPlayerPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        {t("management.addPlayer")}
                      </Button>
                    </div>

                    {/* Whitelist entries */}
                    <div className="max-h-64 overflow-auto rounded-lg border border-border">
                      {whitelist.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-6 text-center">
                          <ShieldCheck className="h-6 w-6 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">{t("management.noWhitelistEntries")}</p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-border">
                          {whitelist.map((entry) => (
                            <motion.li
                              key={entry.uuid}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-accent/30"
                            >
                              <span className="flex items-center gap-2 text-sm">
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                <span className="font-medium">{entry.name}</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={!isRunning}
                                onClick={() => handleRemoveFromWhitelist(entry.name)}
                              >
                                <Trash2 className="h-3 w-3" />
                                {t("management.remove")}
                              </Button>
                            </motion.li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ─── Server Config Tab ─── */}
        <TabsContent value="config" className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  className={cn(
                    "w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-xs",
                    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                  placeholder={t("management.searchProperties")}
                  value={propertyFilter}
                  onChange={(e) => setPropertyFilter(e.target.value)}
                />
              </div>

              {/* Category filter */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                >
                  <Filter className="h-3 w-3" />
                  {propertyCategory === "all" ? t("management.allCategories") : t(`management.cat_${propertyCategory}`)}
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <AnimatePresence>
                  {showCategoryFilter && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-border bg-card p-1 shadow-lg"
                    >
                      {["all", "gameplay", "world", "network", "performance"].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                            propertyCategory === cat ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                          onClick={() => { setPropertyCategory(cat); setShowCategoryFilter(false); }}
                        >
                          {cat === "all" ? t("management.allCategories") : t(`management.cat_${cat}`)}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={loadProperties}
                disabled={propertiesLoading}
              >
                <RefreshCw className={cn("h-3 w-3", propertiesLoading && "animate-spin")} />
                {t("management.refresh")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={propertiesSaving || dirtyCount === 0}
                onClick={handleSaveProperties}
              >
                {propertiesSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {t("management.saveProperties")}
                {dirtyCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                    {dirtyCount}
                  </span>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{t("management.propertiesHint")}</p>

            {/* Properties table */}
            {propertiesLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t("management.loading")}</span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-foreground">{t("management.propKey")}</th>
                      <th className="px-3 py-2.5 font-semibold text-foreground">{t("management.propValue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProperties.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-8 text-center text-muted-foreground">
                          {t("management.noPropertiesFound")}
                        </td>
                      </tr>
                    ) : (
                      filteredProperties.map((p) => {
                        const edited = propertyEdits[p.key];
                        const isDirty = edited !== undefined && edited !== p.value;
                        return (
                          <tr
                            key={p.key}
                            className={cn(
                              "border-t border-border/40 transition-colors",
                              isDirty && "bg-primary/5"
                            )}
                          >
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                {isDirty && <CircleDot className="h-2.5 w-2.5 text-primary" />}
                                {p.key}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              {p.value === "true" || p.value === "false" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = propertyEdits[p.key] ?? p.value;
                                    setPropEdit(p.key, current === "true" ? "false" : "true");
                                  }}
                                  className={cn(
                                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                                    (propertyEdits[p.key] ?? p.value) === "true"
                                      ? "bg-primary"
                                      : "bg-muted-foreground/30"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
                                      (propertyEdits[p.key] ?? p.value) === "true"
                                        ? "translate-x-4"
                                        : "translate-x-0.5"
                                    )}
                                  />
                                </button>
                              ) : (
                                <input
                                  type="text"
                                  className={cn(
                                    "w-full min-w-[8rem] rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs",
                                    "focus:outline-none focus:ring-1 focus:ring-ring",
                                    isDirty && "border-primary/50"
                                  )}
                                  value={propertyEdits[p.key] ?? p.value}
                                  onChange={(e) => setPropEdit(p.key, e.target.value)}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
