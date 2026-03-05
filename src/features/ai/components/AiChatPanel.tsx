"use client";

import { useRef, useEffect, useState, useCallback, Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Sparkles,
  MessageCircle,
  Server,
  Play,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GitCompare,
  Pencil,
  Square,
  Check,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useAiChat, ADVISOR_SIGN_IN_REQUIRED, type ChatMessage, type AdvisorAction } from "../hooks/useAiChat";
import { runAdvisorActions, type ActionStep, type ActionStepDiff } from "../lib/runAdvisorActions";
import { computeLineDiff, diffSummary } from "../lib/diff-lines";
import {
  splitContentWithRefs,
  refDisplayLabel,
  refInlineLabel,
  rawOffsetToDisplayOffset,
  formatServerRef,
  formatPathRef,
} from "../lib/advisor-refs";
import { AdvisorMentionMenu } from "./AdvisorMentionMenu";
import { useServers } from "@/features/servers";
import { cn, isTauri } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DIFF_EXCERPT_LINES = 3;
const MAX_DIFF_LINES = 600;
const MAX_EXCERPT_CHARS = 200;

class StepDiffErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function FileDiffView({
  diff,
  isExpanded,
  onToggle,
  t,
}: {
  diff: ActionStepDiff;
  isExpanded: boolean;
  onToggle: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const path = diff != null && typeof diff === "object" && typeof (diff as { path?: unknown }).path === "string"
    ? (diff as { path: string }).path
    : "file";
  let rawOld = "";
  let rawNew = "";
  try {
    rawOld = diff != null && typeof diff === "object" && typeof (diff as { oldContent?: unknown }).oldContent === "string"
      ? (diff as { oldContent: string }).oldContent
      : "";
    rawNew = diff != null && typeof diff === "object" && typeof (diff as { newContent?: unknown }).newContent === "string"
      ? (diff as { newContent: string }).newContent
      : "";
  } catch {
    rawOld = "";
    rawNew = "";
  }
  if (rawOld.length > 200_000) rawOld = rawOld.slice(0, 200_000) + "\n…";
  if (rawNew.length > 200_000) rawNew = rawNew.slice(0, 200_000) + "\n…";

  let lines: Array<{ type: "add" | "remove" | "context"; content: string; oldLineNum?: number; newLineNum?: number }> = [];
  let summary = "";
  let hasChanges = false;
  let excerpt = "";
  try {
    const oldLines = rawOld.split(/\r?\n/);
    const newLines = rawNew.split(/\r?\n/);
    const cap = Math.max(1, MAX_DIFF_LINES);
    const oldContent = oldLines.length > cap ? oldLines.slice(0, cap).join("\n") : rawOld;
    const newContent = newLines.length > cap ? newLines.slice(0, cap).join("\n") : rawNew;
    lines = computeLineDiff(oldContent, newContent);
    summary = diffSummary(oldContent, newContent);
    hasChanges = lines.some((l) => l.type === "add" || l.type === "remove");
    const newContentLines = rawNew.split(/\r?\n/).filter((l) => String(l).trim() !== "").slice(0, DIFF_EXCERPT_LINES);
    const excerptRaw = newContentLines.length > 0 ? newContentLines.join("\n") : rawNew.slice(0, MAX_EXCERPT_CHARS);
    excerpt = excerptRaw.length > MAX_EXCERPT_CHARS ? `${excerptRaw.slice(0, MAX_EXCERPT_CHARS)}…` : excerptRaw;
  } catch {
    hasChanges = true;
    summary = "saved";
    try {
      excerpt = String(rawNew).slice(0, MAX_EXCERPT_CHARS) + (rawNew.length > MAX_EXCERPT_CHARS ? "…" : "");
    } catch {
      excerpt = "";
    }
  }

  const DIFF_EXPANDED_HEIGHT = 240;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 overflow-hidden font-mono text-xs">
      <div className="flex w-full items-center gap-2 px-2 py-1.5 border-b border-border/60 bg-muted/50 text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
        <span className="min-w-0 truncate">{path}</span>
        <span className="ml-auto shrink-0 text-[10px]">{summary}</span>
      </div>
      {!isExpanded && (
        <div className="px-2 py-1.5 border-b border-border/40 bg-muted/20 text-muted-foreground overflow-hidden">
          <p className="text-[10px] font-medium text-green-700 dark:text-green-400 mb-1">
            {t("advisor.fileSavedSuccess", "Document written and saved successfully.")}
          </p>
          {excerpt ? (
            <div className="line-clamp-3 whitespace-pre-wrap break-all text-[11px] opacity-90 max-h-[4.5rem] overflow-hidden">
              {excerpt}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-center gap-1.5 py-2 mt-1.5 rounded border border-border/50 bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground text-[11px] transition-colors"
            aria-expanded={false}
          >
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            {t("advisor.diffExpandHint", "Expand diff")}
          </button>
        </div>
      )}
      {isExpanded && (
        <>
          <div
            ref={contentRef}
            className="overflow-y-auto p-1 border-b border-border/40"
            style={{ maxHeight: `${DIFF_EXPANDED_HEIGHT}px` }}
          >
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 px-1.5 py-0.5 min-h-[1.25rem]",
                  line.type === "add" && "bg-green-500/15 text-green-800 dark:text-green-200",
                  line.type === "remove" && "bg-red-500/15 text-red-800 dark:text-red-200",
                  line.type === "context" && "text-muted-foreground"
                )}
              >
                <span className="shrink-0 w-6 text-right select-none opacity-70">
                  {line.type === "remove" ? (line.oldLineNum ?? "") : line.type === "add" ? (line.newLineNum ?? "") : (line.oldLineNum ?? "")}
                </span>
                <span className="shrink-0 w-4">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                <span className="break-all whitespace-pre-wrap">{typeof line.content === "string" ? line.content : " "}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-center gap-1.5 py-2 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground text-[11px] transition-colors"
            aria-expanded={true}
          >
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            {t("advisor.diffCollapseHint", "Collapse diff")}
          </button>
        </>
      )}
    </div>
  );
}

function serverNameForId(serverId: string | undefined, serverNames: Array<{ id: string; name: string }>): string | null {
  if (!serverId) return null;
  return serverNames.find((s) => s.id === serverId)?.name ?? null;
}

function actionLabel(
  action: AdvisorAction,
  t: (k: string, opts?: Record<string, unknown>) => string,
  serverNames: Array<{ id: string; name: string }> = []
): string {
  if (action.type === "create_server") {
    const name = String(action.params?.name ?? "Server");
    const type = String(action.params?.server_type ?? "vanilla");
    const ver = String(action.params?.minecraft_version ?? "");
    return t("advisor.actionCreateServer", { name, type, version: ver });
  }
  if (action.type === "read_file") {
    const path = String(action.params?.path ?? "");
    const serverName = serverNameForId(String(action.params?.server_id ?? ""), serverNames);
    return serverName
      ? t("advisor.actionReadFileOnServer", { path, serverName })
      : t("advisor.actionReadFile", { path });
  }
  if (action.type === "write_file") {
    const path = String(action.params?.path ?? "");
    const serverName = serverNameForId(String(action.params?.server_id ?? ""), serverNames);
    return serverName
      ? t("advisor.actionWriteFileOnServer", { path, serverName })
      : t("advisor.actionWriteFile", { path });
  }
  if (action.type === "run_command") {
    const command = String(action.params?.command ?? "").slice(0, 40);
    const serverName = serverNameForId(String(action.params?.server_id ?? ""), serverNames);
    return serverName
      ? t("advisor.actionRunCommandOnServer", { command, serverName })
      : t("advisor.actionRunCommand", { command });
  }
  return `${action.type}`;
}

function MessageBubble({
  msg,
  serverNames,
  onRunActions,
  runningMessageId,
  runningSteps,
  runningExpanded,
  onToggleRunningExpand,
  lastRunSteps,
  autoRunActions,
  onTasksModeChange,
  expandedDiffKey,
  onExpandDiff,
  onRevert,
  onCancelRun,
  revertedMessageIds,
  revertingMessageId,
}: {
  msg: ChatMessage;
  serverNames: Array<{ id: string; name: string }>;
  onRunActions: (messageId: string, actions: AdvisorAction[]) => void;
  runningMessageId: string | null;
  runningSteps: ActionStep[];
  runningExpanded: boolean;
  onToggleRunningExpand: () => void;
  lastRunSteps?: ActionStep[] | null;
  autoRunActions?: boolean;
  onTasksModeChange?: (auto: boolean) => void;
  expandedDiffKey?: string | null;
  onExpandDiff?: (key: string) => void;
  onRevert?: (messageId: string) => void;
  onCancelRun?: () => void;
  revertedMessageIds?: Set<string>;
  revertingMessageId?: string | null;
}) {
  const { t } = useTranslation();
  if (!msg || typeof msg !== "object" || msg.id == null || (msg.role !== "user" && msg.role !== "assistant")) {
    return null;
  }
  const isUser = msg.role === "user";
  const isErr = !!msg.error;
  const isRunning = runningMessageId === msg.id;
  const hasActions = Array.isArray(msg.actions) && msg.actions.length > 0 && isTauri();
  const showCompleted = !isUser && !isRunning && Array.isArray(lastRunSteps) && lastRunSteps.length > 0;
  const canRevert = Boolean(onRevert && lastRunSteps?.some((s) => s.diff && s.serverId));
  const isReverted = Boolean(revertedMessageIds?.has(msg.id));
  const isReverting = revertingMessageId === msg.id;

  let content = typeof msg.content === "string" ? msg.content : "";
  if (!isUser) {
    try {
      content = content.replace(/<actions>[\s\S]*?<\/actions>\s*/g, "").trim();
      content = content.replace(/<actions>[\s\S]*/g, "").trim();
      if (serverNames.length > 0) {
        serverNames.forEach((s) => {
          if (s?.name) content = content.replace(new RegExp(`@${String(s.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), () => `[@${s.name}]`);
        });
      }
    } catch {
      content = "";
    }
  }
  if (content.length > 200_000) content = content.slice(0, 200_000) + "\n… [truncated]";
  let segments: ReturnType<typeof splitContentWithRefs>;
  try {
    segments = splitContentWithRefs(content);
  } catch {
    segments = [{ type: "text" as const, value: content || "" }];
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {isUser ? (
        <div className="flex w-full rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
          <div className="w-0.5 shrink-0 bg-primary/50" aria-hidden />
          <div className="flex-1 min-w-0 py-2 px-4">
            <p className="text-[11px] text-muted-foreground/80 mb-1" aria-hidden>
              {t("advisor.you", "You")}
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {segments.length > 0
                ? segments.map((seg, i) =>
                  seg.type === "ref" ? (
                    <span
                      key={i}
                      className="inline rounded border border-primary/30 bg-primary/5 text-foreground px-1 py-0.5 font-medium"
                      title={seg.parsed ? refDisplayLabel(seg.parsed, serverNames) : undefined}
                    >
                      {seg.parsed ? refInlineLabel(seg.parsed, serverNames) : seg.value.slice(1, -1)}
                    </span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  )
                )
                : null}
            </p>
          </div>
        </div>
      ) : (
        <>
        <div
          className={cn(
            "w-full rounded-lg border overflow-hidden",
            !isErr && "bg-muted/20 border-border/40",
            isErr && "bg-destructive/5 border-destructive/20"
          )}
        >
          <div className="flex gap-3 px-4 py-3">
            <span className="shrink-0 mt-0.5">
              {isErr ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive text-xs">!</span>
              ) : (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/5 text-primary/80">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground/80 mb-1.5" aria-hidden>
                {t("advisor.title", "Server Advisor")}
              </p>
              <div className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {segments.length > 0 && content.trim()
                  ? segments.map((seg, i) =>
                    seg.type === "ref" ? (
                      <span
                        key={i}
                        className="inline rounded border border-border/60 bg-muted/70 text-foreground/90 px-1 py-0.5 font-medium"
                        title={seg.parsed ? refDisplayLabel(seg.parsed, serverNames) : undefined}
                      >
                        {seg.parsed ? refInlineLabel(seg.parsed, serverNames) : seg.value.slice(1, -1)}
                      </span>
                    ) : (
                      <span key={i}>{seg.value}</span>
                    )
                  )
                  : !isErr && hasActions
                    ? t("advisor.actionsOnlyHint", "Suggested actions below.")
                    : !isErr && !hasActions && !content.trim()
                      ? t("advisor.emptyReplyFallback", "Summary: Changes applied. Restart the server to apply. Need more tweaks?")
                      : null}
              </div>
            </div>
          </div>

      {hasActions && !isUser && (
        <div className="relative rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
          {onTasksModeChange != null && (
            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("advisor.tasks", "Tasks")}
                  >
                    <span>{autoRunActions ? t("advisor.tasksModeAuto", "Auto") : t("advisor.tasksModeAsk", "Ask")}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="min-w-[11rem]">
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => onTasksModeChange(false)}
                  >
                    {!autoRunActions ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" aria-hidden />}
                    <span className={!autoRunActions ? "font-medium" : "text-muted-foreground"}>
                      {t("advisor.runWhenIChoose", "Run when I choose")}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => onTasksModeChange(true)}
                  >
                    {autoRunActions ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" aria-hidden />}
                    <span className={autoRunActions ? "font-medium" : "text-muted-foreground"}>
                      {t("advisor.autoRun", "Auto-run")}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <p className="text-xs font-medium text-muted-foreground pr-20">
            {(Array.isArray(msg.actions) ? msg.actions : []).length === 1 ? "Suggested action" : "Suggested actions"}
          </p>
          <ul className="space-y-1.5">
            {(Array.isArray(msg.actions) ? msg.actions : []).filter((a): a is AdvisorAction => a != null && typeof a === "object").map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Play className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {actionLabel(a, t, serverNames)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1.5">
            {!showCompleted && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => Array.isArray(msg.actions) && msg.actions.length > 0 && onRunActions(msg.id, msg.actions)}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isRunning ? t("advisor.running", "Running…") : t("advisor.run", "Run")}
              </Button>
            )}
            {isRunning && onCancelRun && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onCancelRun}>
                <Square className="h-3.5 w-3.5" />
                {t("advisor.cancel", "Cancel")}
              </Button>
            )}
            {showCompleted && canRevert && !isReverted && onRevert && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onRevert(msg.id)}
                disabled={isReverting}
              >
                {isReverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {isReverting ? t("advisor.reverting", "Reverting…") : t("advisor.revert", "Revert")}
              </Button>
            )}
            {showCompleted && isReverted && (
              <span className="text-xs text-muted-foreground py-1.5">{t("advisor.reverted", "Reverted")}</span>
            )}
          </div>
        </div>
      )}

      {isRunning && Array.isArray(runningSteps) && runningSteps.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
          <button
            type="button"
            onClick={onToggleRunningExpand}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-primary/10 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
              {t("advisor.runningCount", "Running {{count}} action(s) in background…", { count: runningSteps.length })}
            </span>
            {runningExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {runningExpanded && (
            <ul className="border-t border-border/50 px-3 py-2 space-y-1.5 text-sm">
              {runningSteps.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  {s.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                  {s.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />}
                  {s.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  {s.status === "pending" && <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50 shrink-0" />}
                  <span className={cn(s.status === "error" && "text-destructive")}>{s.label ?? "Step"}</span>
                  {s.error && <span className="text-destructive text-xs">({s.error})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCompleted && Array.isArray(lastRunSteps) && lastRunSteps.length > 0 && (() => {
        const rawSteps = lastRunSteps ?? [];
        const steps = rawSteps.filter((s): s is ActionStep => s != null && typeof s === "object");
        const fileSteps = steps.filter((s) => s.diff && typeof s.diff.path === "string");
        const filePaths = fileSteps.map((s) => (s.diff && typeof s.diff.path === "string" ? s.diff.path : "file"));
        const serverMatch = steps.find((s) => s.label && String(s.label).includes(" on "))?.label?.match(/ on (.+)$/);
        const serverName = serverMatch?.[1] ?? null;
        const summaryShort =
          filePaths.length > 0 && serverName
            ? t("advisor.summaryDone", { files: filePaths.join(", "), serverName })
            : t("advisor.summaryDoneNoServer", { count: steps.length });
        const summaryParts: string[] = [];
        if (fileSteps.length > 0) {
          const details = fileSteps
            .map((s) => {
              try {
                const d = s.diff;
                if (!d) return null;
                const oldC = typeof d.oldContent === "string" ? d.oldContent : "";
                const newC = typeof d.newContent === "string" ? d.newContent : "";
                const sum = diffSummary(oldC, newC);
                return sum === "no changes" ? null : `${typeof d.path === "string" ? d.path : "file"} (${sum})`;
              } catch {
                return typeof (s.diff as { path?: string })?.path === "string" ? (s.diff as { path: string }).path : "file";
              }
            })
            .filter(Boolean);
          if (details.length > 0) summaryParts.push(details.join("; "));
        }
        const otherSteps = steps.filter((s) => !s.diff && s.status === "ok");
        if (otherSteps.length > 0) summaryParts.push(t("advisor.summaryOtherActions", "{{count}} other action(s) done", { count: otherSteps.length }));
        const summaryDetailLine = summaryParts.length > 0 ? summaryParts.join(" • ") : null;
        return (
          <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
            <p className="text-[11px] font-medium text-muted-foreground/90 px-3 pt-2.5">
              {t("advisor.taskResults", "Task results")}
            </p>
            <p className="px-3 pt-1 pb-2 text-sm font-medium text-foreground border-b border-border/40">
              {summaryShort}
            </p>
            {summaryDetailLine && (
              <p className="text-xs text-muted-foreground px-3 py-2 border-b border-border/50">
                {t("advisor.summaryDetails", "Details")}: {summaryDetailLine}
              </p>
            )}
            <ul className="px-3 py-2 space-y-2 text-sm">
              {steps.map((s, i) => (
                <li key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    {s.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />}
                    {s.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    {s.status === "pending" && <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50 shrink-0" />}
                    <span className={cn(s.status === "error" && "text-destructive")}>{s.label ?? "Step"}</span>
                    {s.error && <span className="text-destructive text-xs">({s.error})</span>}
                  </div>
                  {s.diff && (
                    <StepDiffErrorBoundary
                      fallback={
                        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                          {t("advisor.fileSavedSuccess", "Document written and saved successfully.")} {t("advisor.diffPreviewUnavailable", "Preview unavailable.")}
                        </div>
                      }
                    >
                      <FileDiffView
                        diff={s.diff}
                        isExpanded={expandedDiffKey === `${msg.id}-${i}`}
                        onToggle={() => onExpandDiff?.(`${msg.id}-${i}`)}
                        t={t}
                      />
                    </StepDiffErrorBoundary>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
        </div>
        </>
      )}
    </div>
  );
}

function AdvisorInputOverlay({
  rawValue,
  cursorPosition,
  serverList,
  placeholder,
}: {
  rawValue: string;
  cursorPosition: number;
  serverList: Array<{ id: string; name: string }>;
  placeholder: string;
}) {
  const segments = splitContentWithRefs(rawValue);
  const displayOffset = rawOffsetToDisplayOffset(rawValue, cursorPosition, serverList);
  let idx = 0;
  let cursorPushed = false;
  const nodes: React.ReactNode[] = [];
  const pushCursor = () => {
    if (!cursorPushed) {
      cursorPushed = true;
      nodes.push(
        <span key="cursor" className="inline-block w-0.5 h-4 bg-primary animate-pulse align-middle shrink-0" aria-hidden />
      );
    }
  };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (displayOffset === idx) {
      pushCursor();
    }
    if (seg.type === "text") {
      const len = seg.value.length;
      if (idx + len <= displayOffset) {
        nodes.push(seg.value);
        idx += len;
      } else if (idx >= displayOffset) {
        nodes.push(seg.value);
        idx += len;
      } else {
        const split = displayOffset - idx;
        nodes.push(seg.value.slice(0, split));
        pushCursor();
        nodes.push(seg.value.slice(split));
        idx += len;
      }
    } else {
      const label = seg.parsed ? refInlineLabel(seg.parsed, serverList) : seg.value.slice(1, -1);
      const len = label.length;
      if (idx + len <= displayOffset) {
        nodes.push(
          <span
            key={`r-${i}`}
            className="inline rounded border border-border/60 bg-muted/70 px-1 py-0.5 font-medium text-foreground/90"
          >
            {label}
          </span>
        );
        idx += len;
      } else if (idx >= displayOffset) {
        nodes.push(
          <span
            key={`r-${i}`}
            className="inline rounded border border-border/60 bg-muted/70 px-1 py-0.5 font-medium text-foreground/90"
          >
            {label}
          </span>
        );
        idx += len;
      } else {
        nodes.push(
          <span
            key={`r-${i}`}
            className="inline rounded border border-border/60 bg-muted/70 px-1 py-0.5 font-medium text-foreground/90"
          >
            {label}
          </span>
        );
        pushCursor();
        idx += len;
      }
    }
  }
  if (!cursorPushed) {
    pushCursor();
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-start rounded-xl border border-transparent px-4 py-3 text-sm text-foreground overflow-hidden"
      aria-hidden
    >
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words overflow-hidden">
        {nodes.length > 0 ? nodes : <span className="text-muted-foreground">{placeholder}</span>}
      </span>
    </div>
  );
}

export interface AiChatPanelProps {
  onOpenAccount?: () => void;
  /** Identifies the current conversation so the panel resets when switching (e.g. currentId from AdvisorLayout). */
  conversationKey?: string;
  /** When provided, load this conversation and sync changes back */
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  /** When provided, show this as the editable conversation title in the header */
  conversationTitle?: string | null;
  onConversationTitleChange?: (title: string) => void;
  /** Restore unsent draft for this conversation (persisted when switching/reload). */
  initialDraft?: string;
  /** Notify parent when draft text changes so it can persist. */
  onDraftChange?: (text: string) => void;
  /** Notify parent when loading (AI thinking) state changes – e.g. to avoid switching away while response is in flight. */
  onLoadingChange?: (loading: boolean) => void;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export function AiChatPanel({
  onOpenAccount,
  conversationKey,
  initialMessages = [],
  onMessagesChange,
  conversationTitle = null,
  onConversationTitleChange,
  initialDraft = "",
  onDraftChange,
  onLoadingChange,
}: AiChatPanelProps) {
  const { t } = useTranslation();
  const { servers, refresh: refreshServers } = useServers();
  const {
    messages,
    loading,
    error,
    sendMessage,
    sendContinuation,
    stop,
    clearMessages,
    branchCount,
    branchIndex,
    setCurrentBranchIndex,
    regenerateFromFirstMessage,
  } = useAiChat(
    initialMessages,
    onMessagesChange,
    conversationKey
  );
  const [input, setInput] = useState(initialDraft);

  useEffect(() => {
    setInput(initialDraft);
  }, [conversationKey, initialDraft]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Reset run state when switching conversation so we don't show stale running/results
  useEffect(() => {
    setRunningMessageId(null);
    setRunningSteps([]);
    setLastRunResult({});
    setRevertedMessageIds(new Set());
    setRevertingMessageId(null);
    continuationSentForRef.current = new Set();
    autoContinuationCountRef.current = 0;
  }, [conversationKey]);

  const [editingHeaderTitle, setEditingHeaderTitle] = useState(false);
  const [headerTitleValue, setHeaderTitleValue] = useState("");
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
  const [runningSteps, setRunningSteps] = useState<ActionStep[]>([]);
  const [runningExpanded, setRunningExpanded] = useState(true);
  const [lastRunResult, setLastRunResult] = useState<Record<string, ActionStep[]>>({});
  const [expandedDiffKey, setExpandedDiffKey] = useState<string | null>(null);
  const [revertedMessageIds, setRevertedMessageIds] = useState<Set<string>>(new Set());
  const [revertingMessageId, setRevertingMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const [selectionCollapsed, setSelectionCollapsed] = useState(true);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuAnchorIndex, setMenuAnchorIndex] = useState(0);
  const [menuMode, setMenuMode] = useState<"servers" | "files">("servers");
  const [menuSelectedServer, setMenuSelectedServer] = useState<{ id: string; name: string } | null>(null);
  const [menuFileEntries, setMenuFileEntries] = useState<FileEntry[]>([]);
  const [menuSelectedIndex, setMenuSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [anchorXOffset, setAnchorXOffset] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [autoRunActions, setAutoRunActions] = useState(false);
  const continuationSentForRef = useRef<Set<string>>(new Set());
  const autoContinuationCountRef = useRef(0);

  const serverList = servers.map((s) => ({ id: s.id, name: s.name }));
  const canListFiles = isTauri();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, runningSteps]);

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minH = 44;
    const maxH = 200;
    const h = Math.min(maxH, Math.max(minH, el.scrollHeight));
    el.style.height = `${h}px`;
  }, []);
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useEffect(() => {
    if (conversationTitle != null && !editingHeaderTitle) setHeaderTitleValue(conversationTitle);
  }, [conversationTitle, editingHeaderTitle]);

  const syncMenuFromCursor = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    setCursorPosition(pos);
    const text = el.value;
    const beforeCursor = text.slice(0, pos);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt === -1) {
      setMenuOpen(false);
      return;
    }
    const query = text.slice(lastAt + 1, pos);
    if (/\s/.test(query)) {
      setMenuOpen(false);
      return;
    }
    setMenuAnchorIndex(lastAt);
    setMenuQuery(query);
    setAnchorRect(el.getBoundingClientRect());
    setMenuOpen((wasOpen) => {
      if (!wasOpen) {
        setMenuMode("servers");
        setMenuSelectedServer(null);
        setMenuFileEntries([]);
        setMenuSelectedIndex(0);
      }
      return true;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuMode("servers");
    setMenuSelectedServer(null);
    setMenuFileEntries([]);
  }, []);

  const filteredServers = menuQuery.trim()
    ? serverList.filter((s) => s.name.toLowerCase().includes(menuQuery.toLowerCase()))
    : serverList;
  const inFilesMode = menuMode === "files" && menuSelectedServer;
  const menuItemsCount = inFilesMode ? 1 + menuFileEntries.filter((e) => !menuQuery.trim() || e.name.toLowerCase().includes(menuQuery.toLowerCase())).length : filteredServers.length;

  const insertRefAndClose = useCallback((refString: string) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const before = input.slice(0, menuAnchorIndex);
    const after = input.slice(pos);
    const newValue = before + refString + after;
    const newPos = menuAnchorIndex + refString.length;
    setInput(newValue);
    onDraftChange?.(newValue);
    setCursorPosition(newPos);
    closeMenu();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    });
  }, [input, menuAnchorIndex, closeMenu, onDraftChange]);

  const handleSelectServer = useCallback(
    (server: { id: string; name: string }) => {
      insertRefAndClose(formatServerRef(server.id, server.name));
    },
    [insertRefAndClose]
  );

  const handleBrowseServerFiles = useCallback(
    async (server: { id: string; name: string }) => {
      if (!canListFiles) return;
      try {
        const entries = await invoke<FileEntry[]>("list_server_files", {
          serverId: server.id,
          subpath: undefined,
        });
        setMenuSelectedServer(server);
        setMenuFileEntries(entries);
        setMenuMode("files");
        setMenuSelectedIndex(0);
      } catch {
        insertRefAndClose(formatServerRef(server.id, server.name));
      }
    },
    [canListFiles, insertRefAndClose]
  );

  const handleSelectPath = useCallback(
    (serverId: string, path: string) => {
      if (!menuSelectedServer) return;
      insertRefAndClose(formatPathRef(serverId, path));
    },
    [menuSelectedServer, insertRefAndClose]
  );

  const handleMenuBack = useCallback(() => {
    setMenuMode("servers");
    setMenuSelectedServer(null);
    setMenuFileEntries([]);
    setMenuSelectedIndex(0);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const pos = e.target.selectionStart ?? 0;
      setInput(text);
      onDraftChange?.(text);
      setCursorPosition(pos);
    setSelectionCollapsed(e.target.selectionStart === e.target.selectionEnd);
    const beforeCursor = text.slice(0, pos);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt === -1) {
      setMenuOpen(false);
      return;
    }
    const query = text.slice(lastAt + 1, pos);
    if (/\s/.test(query)) {
      setMenuOpen(false);
      return;
    }
    setMenuAnchorIndex(lastAt);
    setMenuQuery(query);
    setAnchorRect(e.target.getBoundingClientRect());
    setMenuOpen((wasOpen) => {
      if (!wasOpen) {
        setMenuMode("servers");
        setMenuSelectedServer(null);
        setMenuFileEntries([]);
        setMenuSelectedIndex(0);
      }
      return true;
    });
  }, [onDraftChange]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!menuOpen && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.target as HTMLTextAreaElement).form?.requestSubmit();
        return;
      }
      if (menuOpen && menuItemsCount > 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeMenu();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMenuSelectedIndex((i) => (i - 1 + menuItemsCount) % menuItemsCount);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMenuSelectedIndex((i) => (i + 1) % menuItemsCount);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          if (inFilesMode) {
            if (menuSelectedIndex === 0) {
              e.preventDefault();
              handleMenuBack();
              return;
            }
            const fileIndex = menuSelectedIndex - 1;
            const filtered = menuFileEntries.filter((e) => !menuQuery.trim() || e.name.toLowerCase().includes(menuQuery.toLowerCase()));
            const entry = filtered[fileIndex];
            if (entry && menuSelectedServer) {
              e.preventDefault();
              handleSelectPath(menuSelectedServer.id, entry.path);
            }
          } else {
            const server = filteredServers[menuSelectedIndex];
            if (server) {
              e.preventDefault();
              handleSelectServer(server);
              return;
            }
          }
        }
      }
      if (menuOpen && e.key === "Backspace" && menuQuery === "" && (inputRef.current?.selectionStart ?? 0) === menuAnchorIndex + 1) {
        e.preventDefault();
        setInput((prev) => prev.slice(0, menuAnchorIndex) + prev.slice(menuAnchorIndex + 1));
        closeMenu();
      }
    },
    [
      menuOpen,
      menuItemsCount,
      inFilesMode,
      menuSelectedIndex,
      menuFileEntries,
      menuQuery,
      menuSelectedServer,
      filteredServers,
      closeMenu,
      handleMenuBack,
      handleSelectPath,
      handleSelectServer,
    ]
  );

  const updateMenuAnchor = useCallback(() => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const rect = el.getBoundingClientRect();
    setAnchorRect(rect);
    const style = getComputedStyle(el);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const measure = document.createElement("span");
    measure.style.font = style.font;
    measure.style.fontSize = style.fontSize;
    measure.style.fontFamily = style.fontFamily;
    measure.style.fontWeight = style.fontWeight;
    measure.style.letterSpacing = style.letterSpacing;
    measure.style.visibility = "hidden";
    measure.style.position = "absolute";
    measure.style.whiteSpace = "pre";
    measure.textContent = input.slice(0, menuAnchorIndex);
    document.body.appendChild(measure);
    const textWidth = measure.offsetWidth;
    document.body.removeChild(measure);
    setAnchorXOffset(paddingLeft + textWidth);
  }, [input, menuAnchorIndex]);

  useEffect(() => {
    if (!menuOpen) return;
    const raf = requestAnimationFrame(() => {
      updateMenuAnchor();
    });
    return () => cancelAnimationFrame(raf);
  }, [menuOpen, updateMenuAnchor]);

  useEffect(() => {
    if (!menuOpen || !inputRef.current) return;
    updateMenuAnchor();
  }, [menuOpen, input, menuAnchorIndex, updateMenuAnchor]);

  useEffect(() => {
    if (!menuOpen) return;
    const onScrollOrResize = () => {
      requestAnimationFrame(updateMenuAnchor);
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menuOpen, updateMenuAnchor]);

  useEffect(() => {
    if (menuOpen && menuItemsCount > 0 && menuSelectedIndex >= menuItemsCount) {
      setMenuSelectedIndex(menuItemsCount - 1);
    }
  }, [menuOpen, menuItemsCount, menuSelectedIndex]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (inputWrapperRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen, closeMenu]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;
      sendMessage(input, true, {
        servers: serverList,
        selectedServerId: selectedServerId ?? undefined,
      });
      setInput("");
      onDraftChange?.("");
    },
    [input, loading, selectedServerId, serverList, sendMessage, onDraftChange]
  );

  const handleRunActions = useCallback(
    async (messageId: string, actions: AdvisorAction[]) => {
      if (!messageId || !Array.isArray(actions) || actions.length === 0) return;
      setRunningMessageId(messageId);
      setRunningExpanded(true);
      const steps: ActionStep[] = actions.map((a, i) => ({
        actionIndex: i,
        type: a?.type ?? "unknown",
        label: actionLabel(a ?? { type: "unknown", params: {} }, t, serverList),
        status: "pending" as const,
      }));
      setRunningSteps(steps);
      const finalStepsRef: ActionStep[] = steps.map((s) => ({ ...s }));

      const onStep = (step: ActionStep) => {
        const idx = finalStepsRef.findIndex((s) => s.actionIndex === step.actionIndex);
        if (idx >= 0) finalStepsRef[idx] = step;
        else finalStepsRef.push(step);
        setRunningSteps((prev) => {
          const next = [...prev];
          const i = next.findIndex((s) => s.actionIndex === step.actionIndex);
          if (i >= 0) next[i] = step;
          else next.push(step);
          return next;
        });
      };

      try {
        const result = await runAdvisorActions(actions, onStep, serverList);
        const hadCreateServer = actions.some((a) => a?.type === "create_server");
        if (result.ok && hadCreateServer) {
          refreshServers();
        }
        if (!result.ok && !finalStepsRef.some((s) => s.status === "error")) {
          setLastRunResult((prev) => ({
            ...prev,
            [messageId]: [...finalStepsRef, { actionIndex: finalStepsRef.length, type: "error", label: result.error ?? "Failed", status: "error" as const, error: result.error }],
          }));
        } else {
          setLastRunResult((prev) => ({ ...prev, [messageId]: [...finalStepsRef] }));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setLastRunResult((prev) => ({
          ...prev,
          [messageId]: [...finalStepsRef, { actionIndex: finalStepsRef.length, type: "error", label: "Run failed", status: "error" as const, error: errMsg }],
        }));
      } finally {
        setRunningMessageId(null);
      }
    },
    [t, refreshServers, serverList]
  );

  const buildContinuationText = useCallback(
    (steps: ActionStep[]): string => {
      const lines: string[] = ["--- Action results ---"];
      const MAX_READ_CHARS = 4000;
      for (const s of steps) {
        if (s.status === "error") {
          lines.push(`${s.label ?? "Step"}: ${s.error ?? "Failed"}`);
          continue;
        }
        if (s.status !== "ok") continue;
        if (s.type === "read_file" && s.readContent != null) {
          const label = s.label ?? "Read file";
          const content = String(s.readContent).slice(0, MAX_READ_CHARS);
          if (content.length < String(s.readContent).length) lines.push(`${label}:\n${content}\n… [truncated]`);
          else lines.push(`${label}:\n${content}`);
        } else if (s.type === "write_file" && s.diff) {
          lines.push(`Wrote ${s.diff.path}: done.`);
        } else if (s.type === "run_command") {
          lines.push(`Sent command: done.`);
        } else if (s.type === "create_server") {
          lines.push(`Created server: done.`);
        } else if (s.label) {
          lines.push(`${s.label}: ${s.status}`);
        }
      }
      lines.push("--- End ---");
      lines.push("Please continue with any further changes, or provide a brief summary for the user and ask if they need anything else.");
      return lines.join("\n");
    },
    []
  );

  useEffect(() => {
    if (!isTauri() || !sendContinuation) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === "user" && !last.content.trim().startsWith("--- Action results")) {
      autoContinuationCountRef.current = 0;
    }
    if (last.role === "assistant" && Array.isArray(last.actions) && last.actions.length > 0) {
      const stepsForMessage = lastRunResult[last.id];
      if (Array.isArray(stepsForMessage) && stepsForMessage.length > 0 && !continuationSentForRef.current.has(last.id) && autoContinuationCountRef.current < 5) {
        const steps = stepsForMessage;
        if (steps.length) {
          const text = buildContinuationText(steps);
          continuationSentForRef.current.add(last.id);
          autoContinuationCountRef.current += 1;
          sendContinuation(text, { servers: serverList, selectedServerId: selectedServerId ?? undefined });
        }
        return;
      }
      if (!Array.isArray(lastRunResult[last.id]) && !runningMessageId) {
        handleRunActions(last.id, last.actions);
      }
    }
  }, [messages, lastRunResult, runningMessageId, sendContinuation, serverList, selectedServerId, handleRunActions, buildContinuationText]);

  const handleCancelRun = useCallback(() => {
    setRunningMessageId(null);
  }, []);

  const handleRevert = useCallback(
    async (messageId: string) => {
      const steps = lastRunResult[messageId];
      if (!Array.isArray(steps) || steps.length === 0) return;
      const toRevert = steps.filter((s): s is ActionStep & { diff: ActionStepDiff; serverId: string } => Boolean(s.diff && s.serverId));
      if (!toRevert.length) return;
      setRevertingMessageId(messageId);
      try {
        for (const s of toRevert) {
          const { serverId, diff } = s;
          if (!diff || typeof diff.oldContent !== "string") continue;
          await invoke("write_server_file", { serverId, path: diff.path, content: diff.oldContent });
        }
        setRevertedMessageIds((prev) => new Set(prev).add(messageId));
      } catch {
        // leave revertedMessageIds unchanged so user can retry
      } finally {
        setRevertingMessageId(null);
      }
    },
    [lastRunResult]
  );

  useEffect(() => {
    if (!autoRunActions || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.actions?.length || lastRunResult[last.id] || runningMessageId === last.id) return;
    handleRunActions(last.id, last.actions);
  }, [messages, autoRunActions, lastRunResult, runningMessageId, handleRunActions]);

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))]">
      <div className="shrink-0 border-b border-border/80 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              {conversationTitle != null && onConversationTitleChange ? (
                editingHeaderTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={headerTitleValue}
                      onChange={(e) => setHeaderTitleValue(e.target.value)}
                      onBlur={() => {
                        const v = headerTitleValue.trim();
                        if (v) onConversationTitleChange(v);
                        setEditingHeaderTitle(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = headerTitleValue.trim();
                          if (v) onConversationTitleChange(v);
                          setEditingHeaderTitle(false);
                        }
                        if (e.key === "Escape") {
                          setHeaderTitleValue(conversationTitle);
                          setEditingHeaderTitle(false);
                        }
                      }}
                      className="flex-1 min-w-0 rounded bg-background px-2 py-1 text-base font-semibold ring-1 ring-input"
                      autoFocus
                      aria-label={t("advisor.renameConversation", "Rename conversation")}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderTitleValue(conversationTitle);
                      setEditingHeaderTitle(true);
                    }}
                    className="flex w-full items-center gap-2 rounded text-left group/title"
                  >
                    <h1 className="text-base font-semibold tracking-tight text-foreground truncate" title={conversationTitle}>
                      {conversationTitle || t("advisor.title", "Server Advisor")}
                    </h1>
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/title:opacity-100" />
                  </button>
                )
              ) : (
                <>
                  <h1 className="text-base font-semibold tracking-tight text-foreground">
                    {t("advisor.title", "Server Advisor")}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {t("advisor.tagline", "Your server setup and config assistant")}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center px-4">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 max-w-md">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {t("advisor.welcomeTitle", "How can I help?")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {t("advisor.welcomeBody", "I can help with server setup, configs, mods, plugins, backups, and debugging. Describe your issue or goal, or paste an error from your server log.")}
              </p>
              {serverList.length > 0 && (
                <p className="text-xs text-muted-foreground/90 mt-2">
                  {t("advisor.mentionHint", "Type @ to open a menu: pick a server or browse its files so the Advisor knows exactly what you mean.")}
                </p>
              )}
            </div>
            {onOpenAccount && (
              <p className="text-xs text-muted-foreground">
                {t("advisor.proRequired", "Server Advisor is included with Pro. Manage subscription in Settings → Account.")}
              </p>
            )}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-0"
          >
            {messages.length > 0 && (
              <div className="flex items-center gap-2 py-2 flex-wrap border-b border-border/40">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs"
                  onClick={() =>
                    regenerateFromFirstMessage({
                      servers: serverList.map((s) => ({ id: s.id, name: s.name })),
                      selectedServerId: selectedServerId ?? undefined,
                    })
                  }
                  disabled={loading}
                  aria-label={t("advisor.regenerate", "Regenerate from first message")}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {t("advisor.regenerate", "Regenerate")}
                </Button>
                {branchCount > 1 && (
                  <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 px-1 py-0.5" role="group" aria-label={t("advisor.answerCount", "{{current}} of {{total}}", { current: branchIndex + 1, total: branchCount })}>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:pointer-events-none"
                      onClick={() => setCurrentBranchIndex(branchIndex - 1)}
                      disabled={branchIndex <= 0}
                      aria-label={t("advisor.previousAnswer", "Previous answer")}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[2.5rem] text-center text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
                      {t("advisor.generationCount", "{{current}} of {{total}}", {
                        current: branchIndex + 1,
                        total: branchCount,
                      })}
                    </span>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:pointer-events-none"
                      onClick={() => setCurrentBranchIndex(branchIndex + 1)}
                      disabled={branchIndex >= branchCount - 1}
                      aria-label={t("advisor.nextAnswer", "Next answer")}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {(() => {
              const filtered = messages.filter(
                (m): m is ChatMessage =>
                  Boolean(m && typeof m === "object" && m.id != null && (m.role === "user" || m.role === "assistant"))
              );
              return filtered.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  serverNames={serverList}
                  onRunActions={handleRunActions}
                  runningMessageId={runningMessageId}
                  runningSteps={runningSteps}
                  runningExpanded={runningExpanded}
                  onToggleRunningExpand={() => setRunningExpanded((e) => !e)}
                  lastRunSteps={lastRunResult[msg.id]}
                  autoRunActions={autoRunActions}
                  onTasksModeChange={isTauri() ? setAutoRunActions : undefined}
                  expandedDiffKey={expandedDiffKey}
                  onExpandDiff={(key) => setExpandedDiffKey((prev) => (prev === key ? null : key))}
                  onRevert={isTauri() ? handleRevert : undefined}
                  onCancelRun={isTauri() ? handleCancelRun : undefined}
                  revertedMessageIds={revertedMessageIds}
                  revertingMessageId={revertingMessageId}
                />
              ));
            })()}
            {loading && (
              <div className="flex flex-col gap-2 w-full rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="flex gap-0.5 shrink-0">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                  </span>
                  <span className="font-medium">{t("advisor.thinking", "Thinking…")}</span>
                </div>
                <p className="text-muted-foreground/90 text-xs leading-relaxed">
                  {t("advisor.thinkingProcess", "Reading your message and calling the AI to generate a response. This usually takes a few seconds.")}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="shrink-0 flex flex-col gap-1.5 px-1 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
            {error === ADVISOR_SIGN_IN_REQUIRED ? (
              <>
                <p className="text-sm text-destructive">
                  {t("advisor.proRequired", "Server Advisor is included with Pro. Manage subscription in Settings → Account.")}
                </p>
                {onOpenAccount && (
                  <Button variant="outline" size="sm" className="w-fit" onClick={onOpenAccount}>
                    {t("advisor.openAccount", "Open Account")}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-destructive break-words">{error}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 shrink-0 items-stretch">
          <div ref={inputWrapperRef} className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onSelect={(e) => {
                setSelectionCollapsed(e.currentTarget.selectionStart === e.currentTarget.selectionEnd);
                syncMenuFromCursor();
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={t("advisor.inputPlaceholder", "Ask the Advisor…")}
              rows={1}
              className={cn(
                "w-full min-h-[44px] max-h-[200px] resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-shadow overflow-y-auto",
                input.length > 0 && selectionCollapsed && "text-transparent caret-transparent"
              )}
              disabled={loading}
              autoComplete="off"
              aria-label={t("advisor.inputPlaceholder", "Ask the Advisor…")}
            />
            {input.length > 0 && selectionCollapsed && (
              <AdvisorInputOverlay
                rawValue={input}
                cursorPosition={cursorPosition}
                serverList={serverList}
                placeholder={t("advisor.inputPlaceholder", "Ask the Advisor…")}
              />
            )}
            <AdvisorMentionMenu
              open={menuOpen}
              query={menuQuery}
              mode={menuMode}
              servers={filteredServers}
              selectedServer={menuSelectedServer}
              fileEntries={menuFileEntries}
              selectedIndex={menuSelectedIndex}
              anchorRect={anchorRect}
              anchorXOffset={anchorXOffset}
              onSelectServer={handleSelectServer}
              onBrowseServerFiles={handleBrowseServerFiles}
              onSelectPath={handleSelectPath}
              onBack={handleMenuBack}
              onClose={closeMenu}
              onHoverIndex={setMenuSelectedIndex}
              itemCount={menuItemsCount}
              canListFiles={canListFiles}
            />
          </div>
          {loading ? (
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl gap-2 px-4 min-h-[44px] h-auto shadow-sm"
              onClick={stop}
              aria-label={t("advisor.stop", "Stop")}
            >
              <Square className="h-4 w-4 fill-current" />
              {t("advisor.stop", "Stop")}
            </Button>
          ) : (
            <Button
              type="submit"
              size="default"
              disabled={!input.trim()}
              className="rounded-xl gap-2 px-4 min-h-[44px] h-auto shadow-sm"
            >
              <Send className="h-4 w-4" />
              {t("advisor.send", "Send")}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
