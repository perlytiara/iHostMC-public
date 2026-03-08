/**
 * AI proxy: authenticated users send prompts; we call xAI with the server-held key,
 * record usage, enforce tier limits. The xAI key is never exposed to clients.
 */

import { Router, Request, Response } from "express";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { getEffectiveTier } from "../tier-resolver.js";
import {
  getAiLimit,
  getAiUsageThisMonth,
  getUsageLimit,
  getUsageThisMonth,
  isSimulateAtLimit,
  recordUsage,
} from "../lib/usage-limit.js";

const router = Router();
router.use(authMiddleware);

const XAI_BASE = "https://api.x.ai/v1";
/** Use fast non-reasoning for low latency; Advisor replies and action blocks don't need extended reasoning. */
const DEFAULT_MODEL = "grok-4-1-fast-non-reasoning";
const AI_EVENT_TYPE = "ai_completion";

/** Try to parse complete action objects from truncated JSON (no </actions>). Returns array of valid actions. */
function parsePartialActionsJson(s: string): Array<{ type: string; params: Record<string, unknown> }> {
  const out: Array<{ type: string; params: Record<string, unknown> }> = [];
  let i = 0;
  const trim = s.trim();
  if (trim[0] !== "[") return out;
  i = 1;
  while (i < trim.length) {
    while (i < trim.length && /[\s,]/.test(trim[i]!)) i++;
    if (i >= trim.length) break;
    if (trim[i] === "]") break;
    if (trim[i] !== "{") break;
    let depth = 0;
    const start = i;
    let inString = false;
    let escape = false;
    let quote = "";
    for (; i < trim.length; i++) {
      const c = trim[i]!;
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === quote) inString = false;
        else if (c === "\\") escape = true;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        quote = c;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          try {
            const obj = JSON.parse(trim.slice(start, i)) as { type?: string; params?: Record<string, unknown> };
            if (obj != null && typeof obj === "object" && typeof obj.type === "string") {
              out.push({
                type: obj.type,
                params: obj.params && typeof obj.params === "object" ? obj.params : {},
              });
            }
          } catch {
            // skip malformed object
          }
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return out;
}

/** POST /api/ai/chat – chat completion (proxy to xAI). Auth required; Pro tier; usage recorded. */
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  if (!config.xaiApiKey || config.xaiApiKey.trim() === "") {
    res.status(503).json({
      error: "AI is not configured on this server.",
      code: "AI_NOT_CONFIGURED",
    });
    return;
  }

  const tier = await getEffectiveTier(userId);
  if (!tier.aiIncluded) {
    res.status(403).json({
      error: "AI features require Pro. Upgrade to use AI.",
      code: "AI_PRO_ONLY",
      tierId: tier.id,
    });
    return;
  }

  const devBypassLimit = config.allowDevTierOverride && config.allowDevAiUnlimited;
  const simulateAtLimit = devBypassLimit ? false : await isSimulateAtLimit(userId);
  if (simulateAtLimit) {
    const [used, limit] = await Promise.all([getAiUsageThisMonth(userId), getAiLimit(userId)]);
    res.status(402).json({
      error: "Monthly request limit reached (simulated by admin)",
      limit,
      used,
      upgradeUrl: "/dashboard",
      priceUsd: config.billingPriceUsd,
    });
    return;
  }

  if (!devBypassLimit) {
    const [used, limit] = await Promise.all([getAiUsageThisMonth(userId), getAiLimit(userId)]);
    if (used + 1 > limit) {
      res.status(402).json({
        error: "Monthly request limit reached",
        limit,
        used,
        upgradeUrl: "/dashboard",
        priceUsd: config.billingPriceUsd,
      });
      return;
    }
  }

  const body = req.body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    context?: { servers?: Array<{ id: string; name: string }>; selectedServerId?: string };
  };
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required (at least one message)" });
    return;
  }

  const context = body?.context;
  const servers = Array.isArray(context?.servers) ? context.servers : [];
  const selectedServerId = typeof context?.selectedServerId === "string" ? context.selectedServerId : undefined;

  const contextSystemParts: string[] = [
    "You are the Server Advisor for iHostMC — a desktop app for creating and managing game servers (e.g. Minecraft).",
    "You help with server setup, configs, mods, plugins, backups, and debugging.",
    "When the user asks you to DO something the app can do (create a server, edit a config file, run a command), you MUST:",
    "1. Give a brief human reply, then",
    "2. Output a single line JSON array inside <actions>...</actions> so the app can run it. Actions in the array run in order (chained).",
    "When the user asks for multiple things in one message (e.g. \"make a powerful server, enable X, add mod Y\"), output MULTIPLE actions in the same <actions> array so they run in sequence: e.g. create_server, then write_file to change config, then run_command if needed.",
    "Available actions (use exactly these types):",
    "- create_server: params { name (string), server_type? (vanilla|paper|fabric|forge|neoforge), minecraft_version? (e.g. 1.20.1), memory_mb? (number), fabric_loader_version? (optional), fabric_installer_version? (optional) }",
    "- read_file: params { server_id (string), path (string) }",
    "- write_file: params { server_id (string), path (string), content (string) }",
    "- run_command: params { server_id (string), command (string) } — sends input to the currently running server.",
    "Use server_id from the user's server list for read_file, write_file, run_command. For create_server pick a unique name. After creating a server, use its id from context for follow-up read_file/write_file/run_command in the same reply if the user asked for more.",
    "Example (single): <actions>[{\"type\":\"create_server\",\"params\":{\"name\":\"My Server\",\"server_type\":\"fabric\",\"minecraft_version\":\"1.20.1\",\"memory_mb\":2048}}]</actions>",
    "Example (chained): <actions>[{\"type\":\"create_server\",\"params\":{\"name\":\"Power Server\",\"server_type\":\"fabric\",\"minecraft_version\":\"1.20.1\",\"memory_mb\":4096}},{\"type\":\"write_file\",\"params\":{\"server_id\":\"<new-id-after-create>\",\"path\":\"server.properties\",\"content\":\"...\"}}]</actions> — for chained write_file/run_command after create_server, use the new server's id once the app reports it (or describe the next step in your reply).",
  ];
  if (servers.length > 0) {
    contextSystemParts.push(
      "",
      "User's servers (id -> name): " + servers.map((s) => `${s.id}: ${s.name}`).join(", ")
    );
    if (selectedServerId) {
      const selected = servers.find((s) => s.id === selectedServerId);
      contextSystemParts.push(`User is currently focused on server: ${selected ? selected.name : selectedServerId} (id: ${selectedServerId}).`);
    }
  } else {
    contextSystemParts.push("", "The user has no servers yet. You can suggest create_server to create one.");
  }
  contextSystemParts.push(
    "",
    "Be concise. When suggesting actions you MUST output the <actions>...</actions> block first, on a single line (complete with closing </actions>). Then on the next line add: Summary of changes: <brief list per file>. Use multiple actions in the array when the user asks for several things at once.",
    "",
    "When the user message is '--- Action results ---' (or starts with it), the user is the app reporting results of actions you suggested. Use the file contents and status lines to decide the next step: output more <actions> (e.g. write_file with edits) or, when done, output a final reply WITHOUT <actions>. Your final reply must never be empty: always write at least one sentence that (1) briefly recaps what was changed or applied, (2) tells the user to restart the server if configs were changed, and (3) asks if they need more (e.g. 'Summary: … Restart the server to apply. Need more tweaks?'). Work autonomously: read files, then write changes, until the task is complete, then give one final summary with no <actions>."
  );

  const systemContent = contextSystemParts.join("\n");
  const messagesForXai = messages[0]?.role === "system"
    ? [{ role: "system" as const, content: systemContent + "\n\n" + (messages[0].content || "") }, ...messages.slice(1)]
    : [{ role: "system" as const, content: systemContent }, ...messages];

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  try {
    const xaiRes = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.xaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messagesForXai,
        stream: false,
        max_tokens: 16384,
      }),
    });

    if (!xaiRes.ok) {
      const text = await xaiRes.text();
      try {
        const err = JSON.parse(text) as { error?: { message?: string } };
        res.status(xaiRes.status).json({
          error: err.error?.message ?? text.slice(0, 200),
          code: "XAI_ERROR",
        });
      } catch {
        res.status(xaiRes.status).json({
          error: text.slice(0, 200),
          code: "XAI_ERROR",
        });
      }
      return;
    }

    const data = (await xaiRes.json()) as {
      id?: string;
      choices?: Array<{ message?: { role?: string; content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    await recordUsage(userId, AI_EVENT_TYPE, 1, {
      model,
      prompt_tokens: data.usage?.prompt_tokens,
      completion_tokens: data.usage?.completion_tokens,
    });

    const rawContent = data.choices?.[0]?.message?.content ?? "";
    let content = rawContent;
    let actions: Array<{ type: string; params: Record<string, unknown> }> | undefined;

    const actionsMatch = rawContent.match(/<actions>([\s\S]*?)<\/actions>/);
    if (actionsMatch && actionsMatch[1]) {
      try {
        const parsed = JSON.parse(actionsMatch[1].trim()) as unknown;
        if (Array.isArray(parsed)) {
          actions = parsed
            .filter((item): item is { type?: string; params?: Record<string, unknown> } => item != null && typeof item === "object")
            .map((item) => ({
              type: typeof item.type === "string" ? item.type : "unknown",
              params: item.params && typeof item.params === "object" ? item.params as Record<string, unknown> : {},
            }));
        }
      } catch {
        // leave actions undefined if parse fails (e.g. truncated JSON)
      }
      // Always strip the block from displayed content so the user never sees raw JSON
      content = rawContent.replace(/<actions>[\s\S]*?<\/actions>\s*/g, "").trim();
    }
    // Truncated response: no </actions> but we have <actions> — try to recover complete action objects
    if (actions == null && rawContent.includes("<actions>")) {
      const openTag = rawContent.indexOf("<actions>");
      const afterOpen = rawContent.slice(openTag + "<actions>".length);
      const recovered = parsePartialActionsJson(afterOpen);
      if (recovered.length > 0) actions = recovered;
    }
    // Strip truncated <actions>... (no closing tag) so cropped responses never show raw JSON
    if (content.includes("<actions>")) {
      content = content.replace(/<actions>[\s\S]*/g, "").trim();
    }

    res.json({
      id: data.id,
      choices: data.choices,
      usage: data.usage,
      content: content || rawContent,
      actions,
    });
  } catch (err) {
    console.error("AI proxy error:", err);
    res.status(502).json({
      error: "Failed to reach AI service",
      code: "AI_PROXY_ERROR",
    });
  }
});

/** POST /api/ai/suggest-title – suggest a short conversation title from the first user message. Auth + Pro; no usage recorded. */
router.post("/suggest-title", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  if (!config.xaiApiKey || config.xaiApiKey.trim() === "") {
    res.status(503).json({
      error: "AI is not configured on this server.",
      code: "AI_NOT_CONFIGURED",
    });
    return;
  }

  const tier = await getEffectiveTier(userId);
  if (!tier.aiIncluded) {
    res.status(403).json({
      error: "AI features require Pro. Upgrade to use AI.",
      code: "AI_PRO_ONLY",
      tierId: tier.id,
    });
    return;
  }

  const body = req.body as { message?: string };
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message string required" });
    return;
  }

  const systemContent =
    "You are a titling assistant. Given a user message from a chat about game server setup (Minecraft, mods, configs, etc.), reply with ONLY a short conversation title: maximum 6 words, no quotes, no period. Be concise and descriptive.";

  try {
    const xaiRes = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.xaiApiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system" as const, content: systemContent },
          { role: "user" as const, content: message.slice(0, 2000) },
        ],
        stream: false,
        max_tokens: 48,
      }),
    });

    if (!xaiRes.ok) {
      const text = await xaiRes.text();
      try {
        const err = JSON.parse(text) as { error?: { message?: string } };
        res.status(xaiRes.status).json({
          error: err.error?.message ?? text.slice(0, 200),
          code: "XAI_ERROR",
        });
      } catch {
        res.status(xaiRes.status).json({
          error: text.slice(0, 200),
          code: "XAI_ERROR",
        });
      }
      return;
    }

    const data = (await xaiRes.json()) as {
      choices?: Array<{ message?: { role?: string; content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const title = raw.trim().replace(/^["']|["']$/g, "").slice(0, 60) || "New chat";

    res.json({ title });
  } catch (err) {
    console.error("AI suggest-title error:", err);
    res.status(502).json({
      error: "Failed to reach AI service",
      code: "AI_PROXY_ERROR",
    });
  }
});

export default router;
