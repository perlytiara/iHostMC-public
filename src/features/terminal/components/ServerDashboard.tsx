"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { useServerOutput, type ParsedPlayerList } from "../hooks/useServerOutput";
import {
  MessageSquare,
  Save,
  RefreshCw,
  Shield,
  ShieldOff,
  UserX,
  Ban,
  UserCheck,
  Trash2,
  Users,
  ChevronDown,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function sendCommand(cmd: string) {
  const line = cmd.trim().endsWith("\n") ? cmd.trim() : `${cmd.trim()}\n`;
  invoke("send_server_input", { input: line }).catch(() => {});
}

interface ServerDashboardProps {
  isRunning: boolean;
}

export function ServerDashboard({ isRunning }: ServerDashboardProps) {
  const { t } = useTranslation();
  const { lines, playerList, clear } = useServerOutput();
  const logEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSay = useCallback(() => {
    const msg = window.prompt(t("dashboard.sayPrompt"));
    if (msg != null && msg.trim()) sendCommand(`say ${msg.trim()}`);
  }, [t]);

  const handleOp = useCallback((name?: string) => {
    const n = name ?? window.prompt(t("dashboard.opPrompt"));
    if (n != null && n.trim()) sendCommand(`op ${n.trim()}`);
  }, [t]);

  const handleDeop = useCallback((name?: string) => {
    const n = name ?? window.prompt(t("dashboard.deopPrompt"));
    if (n != null && n.trim()) sendCommand(`deop ${n.trim()}`);
  }, [t]);

  const handleKick = useCallback((name?: string) => {
    const n = name ?? window.prompt(t("dashboard.kickPrompt"));
    if (n != null && n.trim()) sendCommand(`kick ${n.trim()}`);
  }, [t]);

  const handleBan = useCallback((name?: string) => {
    if (name) {
      sendCommand(`ban ${name}`);
      return;
    }
    const input = window.prompt(t("dashboard.banPrompt"));
    if (input != null && input.trim()) sendCommand(`ban ${input.trim()}`);
  }, [t]);

  const handlePardon = useCallback(() => {
    const name = window.prompt(t("dashboard.pardonPrompt"));
    if (name != null && name.trim()) sendCommand(`pardon ${name.trim()}`);
  }, [t]);

  const handleWhitelistAdd = useCallback((name?: string) => {
    const n = name ?? window.prompt(t("dashboard.whitelistPrompt"));
    if (n != null && n.trim()) sendCommand(`whitelist add ${n.trim()}`);
  }, [t]);

  const handleRefreshPlayers = useCallback(() => {
    sendCommand("list");
  }, []);

  // Load player list when dashboard is shown and server is running
  useEffect(() => {
    if (!isRunning) return;
    const t = setTimeout(() => sendCommand("list"), 300);
    return () => clearTimeout(t);
  }, [isRunning]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Quick actions + Advanced toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("dashboard.actions")}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSay}
          disabled={!isRunning}
          className="gap-1.5"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {t("dashboard.say")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sendCommand("save-all")}
          disabled={!isRunning}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {t("dashboard.save")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshPlayers}
          disabled={!isRunning}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("dashboard.refreshPlayers")}
        </Button>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-3">
        {/* Players panel */}
        <section className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              {t("dashboard.players")}
            </span>
            {isRunning && (
              <Button variant="ghost" size="sm" className="h-7" onClick={handleRefreshPlayers}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {!isRunning ? (
              <p className="text-sm text-muted-foreground">{t("servers.serverStopped")}</p>
            ) : (
              <PlayerPanel
                playerList={playerList}
                onOp={handleOp}
                onDeop={handleDeop}
                onKick={handleKick}
                onBan={handleBan}
                onPardon={handlePardon}
                onWhitelistAdd={handleWhitelistAdd}
              />
            )}
          </div>
        </section>

        {/* Log panel */}
        <section className="lg:col-span-2 flex flex-col rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium">{t("servers.terminal")}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("dashboard.clear")}
            </Button>
          </div>
          <div
            className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
            style={{ background: "hsl(var(--muted) / 0.3)" }}
          >
            <div className="space-y-0.5">
              {lines.length === 0 ? (
                <p className="text-muted-foreground">{t("dashboard.waitingOutput")}</p>
              ) : (
                lines.map((line, i) => (
                  <div
                    key={`${i}-${line.slice(0, 20)}`}
                    className="break-all text-foreground/90"
                  >
                    {stripAnsi(line)}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
          <div className="border-t border-border px-3 py-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={scrollToBottom}>
              {t("dashboard.scrollBottom")}
            </Button>
          </div>
        </section>
      </div>

    </div>
  );
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

type PlayerAction = "op" | "deop" | "kick" | "ban" | "pardon" | "whitelist";

function PlayerPanel({
  playerList,
  onOp,
  onDeop,
  onKick,
  onBan,
  onPardon: _onPardon,
  onWhitelistAdd,
}: {
  playerList: ParsedPlayerList | null;
  onOp: (name?: string) => void;
  onDeop: (name?: string) => void;
  onKick: (name?: string) => void;
  onBan: (name?: string) => void;
  onPardon: () => void;
  onWhitelistAdd: (name?: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedAction, setSelectedAction] = useState<PlayerAction | null>(null);
  const [playerInput, setPlayerInput] = useState("");

  const runAction = useCallback(() => {
    const value = playerInput.trim();
    if (!selectedAction) return;
    switch (selectedAction) {
      case "op":
        if (value) onOp(value);
        break;
      case "deop":
        if (value) onDeop(value);
        break;
      case "kick":
        if (value) onKick(value);
        break;
      case "ban":
        if (value) onBan(value);
        break;
      case "pardon":
        if (value) sendCommand(`pardon ${value}`);
        break;
      case "whitelist":
        if (value) onWhitelistAdd(value);
        break;
    }
    setPlayerInput("");
  }, [selectedAction, playerInput, onOp, onDeop, onKick, onBan, onWhitelistAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") runAction();
    },
    [runAction]
  );

  if (!playerList) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("dashboard.refreshHint")}
      </p>
    );
  }

  const { online, max, names } = playerList;

  const actionLabel =
    selectedAction === "op"
      ? t("dashboard.op")
      : selectedAction === "deop"
        ? t("dashboard.deop")
        : selectedAction === "kick"
          ? t("dashboard.kick")
          : selectedAction === "ban"
            ? t("dashboard.ban")
            : selectedAction === "pardon"
              ? t("dashboard.pardon")
              : selectedAction === "whitelist"
                ? t("dashboard.whitelistAdd")
                : t("dashboard.playerAction");

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {t("servers.playersCount", { online, max })}
      </p>
      {names.length > 0 ? (
        <ul className="space-y-1.5">
          {names.map((name) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-sm"
            >
              <span className="truncate font-medium">{name}</span>
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOp(name)} title="OP">
                  <Shield className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDeop(name)} title="Deop">
                  <ShieldOff className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onKick(name)} title="Kicken">
                  <UserX className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => onBan(name)} title="Bannen">
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("servers.noPlayersOnline")}</p>
      )}
      <div className="space-y-2 border-t border-border pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[7rem] justify-between gap-1 rounded-md border-border bg-muted/50 font-medium text-foreground hover:bg-muted"
              >
                {actionLabel}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem] rounded-md border-border bg-card">
              <DropdownMenuItem onClick={() => setSelectedAction("op")} className="gap-2 cursor-pointer">
                <Shield className="h-3.5 w-3.5" />
                {t("dashboard.op")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedAction("deop")} className="gap-2 cursor-pointer">
                <ShieldOff className="h-3.5 w-3.5" />
                {t("dashboard.deop")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedAction("kick")} className="gap-2 cursor-pointer">
                <UserX className="h-3.5 w-3.5" />
                {t("dashboard.kick")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedAction("ban")} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                <Ban className="h-3.5 w-3.5" />
                {t("dashboard.ban")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedAction("pardon")} className="gap-2 cursor-pointer">
                <UserCheck className="h-3.5 w-3.5" />
                {t("dashboard.pardon")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedAction("whitelist")} className="gap-2 cursor-pointer">
                <UserCheck className="h-3.5 w-3.5" />
                {t("dashboard.whitelistAdd")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            type="text"
            placeholder={t("dashboard.playerNamePlaceholder")}
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 max-w-[12rem] rounded-md border-border bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1 rounded-md border-border bg-muted/50 font-medium"
            onClick={runAction}
            disabled={!selectedAction}
          >
            {t("dashboard.runAction")}
          </Button>
        </div>
      </div>
    </div>
  );
}
