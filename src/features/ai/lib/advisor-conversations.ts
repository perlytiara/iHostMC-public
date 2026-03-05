import type { ChatMessage } from "../hooks/useAiChat";
import { splitContentWithRefs } from "./advisor-refs";

const STORAGE_KEY = "ihostmc-advisor-conversations";
const MAX_CONTENT_LENGTH = 500_000;
const MAX_ACTIONS = 50;

/** Normalize a raw message from storage into a safe ChatMessage. Returns null if not usable. */
export function sanitizeChatMessage(raw: unknown): ChatMessage | null {
  if (raw == null || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const id = m.id;
  const role = m.role;
  if (id == null || role == null) return null;
  const idStr = String(id);
  if (role !== "user" && role !== "assistant") return null;
  let content = m.content;
  if (content != null && typeof content !== "string") content = String(content);
  const contentStr = typeof content === "string" ? content.slice(0, MAX_CONTENT_LENGTH) : "";
  const error = m.error === true;
  let actions: ChatMessage["actions"];
  if (Array.isArray(m.actions)) {
    const list: Array<{ type: string; params: Record<string, unknown> }> = [];
    for (let i = 0; i < Math.min(m.actions.length, MAX_ACTIONS); i++) {
      const a = m.actions[i];
      if (a == null || typeof a !== "object") continue;
      const o = a as Record<string, unknown>;
      list.push({
        type: String(o.type ?? "unknown"),
        params: typeof o.params === "object" && o.params != null ? (o.params as Record<string, unknown>) : {},
      });
    }
    if (list.length > 0) actions = list;
  }
  return { id: idStr, role, content: contentStr, ...(error && { error: true }), ...(actions && { actions }) };
}
const NEW_DRAFT_KEY = "ihostmc-advisor-new-draft";
const TITLE_MAX_LEN = 50;

export interface AdvisorConversation {
  id: string;
  title: string;
  serverId: string | null;
  serverName: string | null;
  messages: ChatMessage[];
  /** Unsent input (draft) for this conversation; also used for draft-only entries. */
  draftText?: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export function loadConversations(): AdvisorConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (c: unknown): c is AdvisorConversation =>
        c != null &&
        typeof c === "object" &&
        typeof (c as AdvisorConversation).id === "string" &&
        typeof (c as AdvisorConversation).title === "string" &&
        Array.isArray((c as AdvisorConversation).messages) &&
        typeof (c as AdvisorConversation).createdAt === "number" &&
        typeof (c as AdvisorConversation).updatedAt === "number"
    );
    const normalized: AdvisorConversation[] = valid.map((c) => {
      const messages: ChatMessage[] = [];
      for (const raw of c.messages) {
        const msg = sanitizeChatMessage(raw);
        if (msg) messages.push(msg);
      }
      return {
        ...c,
        messages,
        serverId: c.serverId ?? null,
        serverName: c.serverName ?? null,
        draftText: typeof (c as AdvisorConversation).draftText === "string" ? (c as AdvisorConversation).draftText : undefined,
        archived: c.archived === true,
      };
    });
    const byId = new Map<string, AdvisorConversation>();
    for (const conv of normalized) {
      byId.set(conv.id, conv);
    }
    return Array.from(byId.values());
  } catch {
    return [];
  }
}

export function saveConversations(conversations: AdvisorConversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // ignore
  }
}

/** Draft text for the "new chat" (no conversation yet). Persists across reload/restart. */
export function loadNewChatDraft(): string {
  try {
    const raw = localStorage.getItem(NEW_DRAFT_KEY);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/** Persist the "new chat" draft. */
export function saveNewChatDraft(text: string): void {
  try {
    localStorage.setItem(NEW_DRAFT_KEY, text);
  } catch {
    // ignore
  }
}

/** True if this conversation is a draft-only entry (no messages, has draft text). */
export function isDraftConversation(c: AdvisorConversation): boolean {
  return c.messages.length === 0 && (c.draftText?.trim() ?? "").length > 0;
}

/**
 * Build a display string from first user message: @server refs become server
 * display name, so the title shows e.g. "My Server 1 – optimize the RA..." instead of raw tokens.
 */
export function deriveTitle(messages: ChatMessage[]): string {
  const meta = deriveConversationMeta(messages);
  return meta.title;
}

export interface DerivedConversationMeta {
  title: string;
  /** First user message as display text (refs resolved), for AI title suggestion. */
  firstMessageDisplay: string;
  serverId: string | null;
  serverName: string | null;
}

/**
 * Derive title and server ref from the first user message. Resolves [@server:id:DisplayName]
 * to the display name so the conversation title is human-readable.
 */
export function deriveConversationMeta(messages: ChatMessage[]): DerivedConversationMeta {
  const firstUser = messages.find((m) => m && (m.role === "user"));
  const rawContent = firstUser?.content;
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (!content) {
    return { title: "New chat", firstMessageDisplay: "", serverId: null, serverName: null };
  }

  let segments: ReturnType<typeof splitContentWithRefs>;
  try {
    segments = splitContentWithRefs(content);
  } catch {
    const combined = content.length > TITLE_MAX_LEN ? `${content.slice(0, TITLE_MAX_LEN)}…` : content;
    return {
      title: combined || "New chat",
      firstMessageDisplay: content.slice(0, 2000),
      serverId: null,
      serverName: null,
    };
  }
  let serverId: string | null = null;
  let serverName: string | null = null;
  const displayParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      displayParts.push(seg.value);
    } else if (seg.parsed?.kind === "server") {
      if (serverId === null) {
        serverId = seg.parsed.serverId;
        serverName = seg.parsed.displayName;
      }
      displayParts.push(seg.parsed.displayName);
    } else {
      displayParts.push(seg.value);
    }
  }

  const combined = displayParts.join("").trim() || "New chat";
  const title =
    combined.length <= TITLE_MAX_LEN ? combined : `${combined.slice(0, TITLE_MAX_LEN)}…`;
  const firstMessageDisplay = combined.slice(0, 2000);

  return { title, firstMessageDisplay, serverId, serverName };
}
