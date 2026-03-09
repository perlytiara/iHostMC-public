/**
 * Runs Advisor-suggested actions via Tauri (create_server, read_file, write_file, run_command).
 * Used when the user clicks "Run" on an action block in the chat.
 * Pauses briefly between steps so the UI can update and the user sees progress live.
 */

import { invoke } from "@tauri-apps/api/core";

/** Delay between steps (ms) so completion appears progressively instead of all at once. */
const STEP_DELAY_MS = 480;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
import type { AdvisorAction } from "../hooks/useAiChat";

export interface ActionStepDiff {
  path: string;
  oldContent: string;
  newContent: string;
}

export interface ActionStep {
  actionIndex: number;
  type: string;
  label: string;
  status: "pending" | "running" | "ok" | "error";
  error?: string;
  /** For write_file: before/after content to show git-style diff */
  diff?: ActionStepDiff;
  /** For write_file: server id so revert can restore oldContent */
  serverId?: string;
  /** For read_file: content read so the app can send it back to the AI for continuation */
  readContent?: string;
}

function buildCreateServerConfig(params: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {
    name: String(params.name ?? "New Server"),
    server_type: String(params.server_type ?? "vanilla").toLowerCase(),
    minecraft_version: String(params.minecraft_version ?? "1.20.1"),
    memory_mb: Number(params.memory_mb ?? 2048),
    port: params.port != null ? Number(params.port) : null,
    java_path: null,
  };
  if (params.fabric_loader_version != null && String(params.fabric_loader_version).trim()) {
    config.fabric_loader_version = String(params.fabric_loader_version).trim();
  }
  if (params.fabric_installer_version != null && String(params.fabric_installer_version).trim()) {
    config.fabric_installer_version = String(params.fabric_installer_version).trim();
  }
  return config;
}

function friendlyError(message: string, path?: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("cannot find the file") || lower.includes("no such file") || lower.includes("os error 2")) {
    return path ? `File not found: ${path}` : "File not found";
  }
  return message;
}

function serverNameForId(serverId: string, serverNames: Array<{ id: string; name: string }>): string {
  if (!serverNames.length) return "server";
  return serverNames.find((s) => s.id === serverId)?.name ?? serverId;
}

function stepLabelForAction(
  a: AdvisorAction,
  serverNames: Array<{ id: string; name: string }> = []
): string {
  if (a.type === "create_server") return `Created server: ${String(a.params?.name ?? "Server")}`;
  const path = String(a.params?.path ?? "file");
  const serverLabel = serverNameForId(String(a.params?.server_id ?? ""), serverNames);
  if (a.type === "read_file") return `Read ${path} on ${serverLabel}`;
  if (a.type === "write_file") return `Wrote ${path} on ${serverLabel}`;
  if (a.type === "run_command") return `Sent command: ${String(a.params?.command ?? "").slice(0, 30)}`;
  return a.type;
}

export async function runAdvisorActions(
  actions: AdvisorAction[],
  onStep: (step: ActionStep) => void,
  serverNames: Array<{ id: string; name: string }> = []
): Promise<{ ok: boolean; error?: string }> {
  let lastError: string | undefined;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const step: ActionStep = {
      actionIndex: i,
      type: a.type,
      label: stepLabelForAction(a, serverNames),
      status: "running",
    };
    onStep(step);
    try {
      if (a.type === "create_server") {
        const config = buildCreateServerConfig(a.params);
        await invoke("create_server", { config });
        step.label = `Created server: ${config.name}`;
      } else if (a.type === "read_file") {
        const serverId = String(a.params.server_id ?? "");
        const path = String(a.params.path ?? "");
        if (!serverId || !path) throw new Error("server_id and path required");
        const content = await invoke<string>("read_server_file", { serverId, path });
        step.readContent = typeof content === "string" ? content : "";
        step.label = `Read ${path} on ${serverNameForId(serverId, serverNames)}`;
      } else if (a.type === "write_file") {
        const serverId = String(a.params.server_id ?? "");
        const path = String(a.params.path ?? "");
        const content = String(a.params.content ?? "");
        if (!serverId || !path) throw new Error("server_id and path required");
        let oldContent = "";
        try {
          oldContent = await invoke<string>("read_server_file", { serverId, path });
        } catch {
          // new file or unreadable
        }
        await invoke("write_server_file", { serverId, path, content });
        step.label = `Wrote ${path} on ${serverNameForId(serverId, serverNames)}`;
        step.diff = { path, oldContent, newContent: content };
        step.serverId = serverId;
      } else if (a.type === "run_command") {
        const command = String(a.params.command ?? "").trim();
        if (!command) throw new Error("command required");
        const line = command.endsWith("\n") ? command : `${command}\n`;
        await invoke("send_server_input", { input: line });
        step.label = `Sent command: ${command.slice(0, 30)}`;
      } else {
        step.status = "error";
        step.error = `Unknown action type: ${a.type}`;
        onStep(step);
        return { ok: false, error: step.error };
      }
      step.status = "ok";
    } catch (e) {
      step.status = "error";
      const path = a.type === "read_file" || a.type === "write_file" ? String(a.params?.path ?? "") : undefined;
      step.error = friendlyError(e instanceof Error ? e.message : String(e), path);
      lastError = step.error;
    }
    onStep(step);
    if (i < actions.length - 1) await delay(STEP_DELAY_MS);
  }
  return { ok: lastError == null, error: lastError };
}
