import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiBaseUrl } from "@/lib/api-client";
import { getToken } from "@/features/auth";
import { getOutputLines } from "@/lib/server-output-store";
import { sanitizeChatMessage } from "../lib/advisor-conversations";

const TERMINAL_CONTEXT_LINES = 80;
/** Abort the request after this many ms so the user gets feedback instead of hanging (target: response or error within ~1 min). */
const REQUEST_TIMEOUT_MS = 55_000;

/** Error key when getToken() is null — panel can show Pro/account CTA. */
export const ADVISOR_SIGN_IN_REQUIRED = "ADVISOR_SIGN_IN_REQUIRED";

export interface AdvisorAction {
  type: string;
  params: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** Parsed actions from AI (create_server, read_file, write_file, run_command) for the app to run */
  actions?: AdvisorAction[];
}

export function useAiChat(
  initialMessages: ChatMessage[] = [],
  onMessagesChange?: (messages: ChatMessage[]) => void,
  conversationKey?: string
) {
  const safeInitial = (initialMessages ?? []).map((m) => sanitizeChatMessage(m)).filter((m): m is ChatMessage => m != null);
  /** Each branch = full sequence from first user message (all messages for that "generation"). */
  const [conversationBranches, setConversationBranches] = useState<ChatMessage[][]>(
    safeInitial.length > 0 ? [safeInitial] : [[]]
  );
  const [currentBranchIndex, setCurrentBranchIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const branchesRef = useRef<ChatMessage[][]>([]);
  const currentBranchIndexRef = useRef(0);
  const prevConversationKeyRef = useRef(conversationKey);
  const skipNextSyncRef = useRef(false);
  const lastAppliedKeyRef = useRef(conversationKey);

  const messages = conversationBranches[currentBranchIndex] ?? [];

  if (conversationKey !== prevConversationKeyRef.current) {
    skipNextSyncRef.current = true;
    prevConversationKeyRef.current = conversationKey;
  }

  branchesRef.current = conversationBranches;
  currentBranchIndexRef.current = currentBranchIndex;

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    onMessagesChange?.(conversationBranches[currentBranchIndex] ?? []);
  }, [conversationBranches, currentBranchIndex, onMessagesChange]);

  const isNewChat = conversationKey === undefined || conversationKey === "new" || conversationKey === "__new__";
  useEffect(() => {
    if (conversationKey === undefined) return;
    if (conversationKey === lastAppliedKeyRef.current) return;
    lastAppliedKeyRef.current = conversationKey;
    if (isNewChat) {
      setConversationBranches([[]]);
      setCurrentBranchIndex(0);
      setError(null);
      return;
    }
    const next = (initialMessages ?? []).map((m) => sanitizeChatMessage(m)).filter((m): m is ChatMessage => m != null);
    setConversationBranches(next.length > 0 ? [next] : [[]]);
    setCurrentBranchIndex(0);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationKey]);

  const appendToCurrentBranch = useCallback((msg: ChatMessage) => {
    setConversationBranches((prev) => {
      const idx = currentBranchIndexRef.current;
      const next = [...prev];
      next[idx] = [...(next[idx] ?? []), msg];
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      includeTerminalContext: boolean = false,
      context?: { servers: Array<{ id: string; name: string }>; selectedServerId?: string }
    ) => {
      if (!content.trim()) return;

      const token = getToken();
      if (!token) {
        setError(ADVISOR_SIGN_IN_REQUIRED);
        return;
      }

      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        setError(
          "API URL not configured. Set VITE_API_BASE_URL in .env (e.g. https://api.ihost.one or http://localhost:3010), then restart the app."
        );
        return;
      }

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: content.trim(),
      };
      const branch = branchesRef.current[currentBranchIndexRef.current] ?? [];
      const branchWithUser = [...branch, userMsg];
      appendToCurrentBranch(userMsg);
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const apiMessages: Array<{ role: string; content: string }> = [];

      if (includeTerminalContext) {
        const lines = getOutputLines();
        const terminalBlock =
          lines.length > 0
            ? lines.slice(-TERMINAL_CONTEXT_LINES).join("\n")
            : "(No terminal output yet. Start a server to see build/log output here.)";
        apiMessages.push({
          role: "system",
          content: `Below is the current server terminal output (last ${TERMINAL_CONTEXT_LINES} lines). Use it to debug or suggest fixes.\n\n--- Server terminal output ---\n${terminalBlock}\n--- End ---`,
        });
      }

      const history = branchWithUser.slice(-12).filter((m) => (m.role === "assistant" ? !m.error : true));
      for (const m of history) {
        apiMessages.push({ role: m.role, content: m.content });
      }
      apiMessages.push({ role: "user", content: userMsg.content });

      try {
        const res = await api.aiChat(
          token,
          {
            messages: apiMessages,
            context: context ? { servers: context.servers, selectedServerId: context.selectedServerId } : undefined,
          },
          { signal: controller.signal }
        );
        const assistantContent =
          (res.content ?? res.choices?.[0]?.message?.content?.trim() ?? "").trim() || "No response from AI.";
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          actions: res.actions && res.actions.length > 0 ? res.actions : undefined,
        };
        appendToCurrentBranch(assistantMsg);
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          abortRef.current = null;
          setLoading(false);
          const timeoutErr: ChatMessage = {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "Request took too long. Try again in a moment.",
            error: true,
          };
          appendToCurrentBranch(timeoutErr);
          return;
        }
        let err = e instanceof Error ? e.message : "Request failed";
        if (err === "Failed to fetch" || (e instanceof TypeError && e.message?.includes("fetch"))) {
          err =
            "Network error. Check your connection and that the API is reachable. If using a local backend, ensure it is running and VITE_API_BASE_URL points to it (e.g. http://localhost:3010).";
        }
        setError(err);
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: err,
          error: true,
        };
        appendToCurrentBranch(errMsg);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        abortRef.current = null;
      }
    },
    [appendToCurrentBranch]
  );

  const sendContinuation = useCallback(
    async (
      actionResultsContent: string,
      context?: { servers: Array<{ id: string; name: string }>; selectedServerId?: string }
    ) => {
      if (!actionResultsContent.trim()) return;

      const token = getToken();
      if (!token) {
        setError(ADVISOR_SIGN_IN_REQUIRED);
        return;
      }

      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        setError(
          "API URL not configured. Set VITE_API_BASE_URL in .env (e.g. https://api.ihost.one or http://localhost:3010), then restart the app."
        );
        return;
      }

      const branch = branchesRef.current[currentBranchIndexRef.current] ?? [];
      const history = branch.slice(-14).filter((m) => (m.role === "assistant" ? !m.error : true));
      const apiMessages: Array<{ role: string; content: string }> = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: actionResultsContent.trim() },
      ];

      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await api.aiChat(
          token,
          {
            messages: apiMessages,
            context: context ? { servers: context.servers, selectedServerId: context.selectedServerId } : undefined,
          },
          { signal: controller.signal }
        );
        const assistantContent =
          (res.content ?? res.choices?.[0]?.message?.content?.trim() ?? "").trim() || "No response from AI.";
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          actions: res.actions && res.actions.length > 0 ? res.actions : undefined,
        };
        appendToCurrentBranch(assistantMsg);
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          abortRef.current = null;
          setLoading(false);
          const timeoutErr: ChatMessage = {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "Request took too long. Try again in a moment.",
            error: true,
          };
          appendToCurrentBranch(timeoutErr);
          return;
        }
        let err = e instanceof Error ? e.message : "Request failed";
        if (err === "Failed to fetch" || (e instanceof TypeError && e.message?.includes("fetch"))) {
          err =
            "Network error. Check your connection and that the API is reachable. If using a local backend, ensure it is running and VITE_API_BASE_URL points to it (e.g. http://localhost:3010).";
        }
        setError(err);
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: err,
          error: true,
        };
        appendToCurrentBranch(errMsg);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        abortRef.current = null;
      }
    },
    [appendToCurrentBranch]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setConversationBranches([[]]);
    setCurrentBranchIndex(0);
    setError(null);
  }, []);

  /** Regenerate from the first user message: create a new full sequence branch and get first assistant reply; panel continuations will fill the rest. */
  const regenerateFromFirstMessage = useCallback(
    async (context?: { servers: Array<{ id: string; name: string }>; selectedServerId?: string }) => {
      const branch = branchesRef.current[currentBranchIndexRef.current] ?? [];
      const firstUser = branch.find((m) => m.role === "user");
      if (!firstUser) return;

      const token = getToken();
      if (!token) {
        setError(ADVISOR_SIGN_IN_REQUIRED);
        return;
      }
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        setError(
          "API URL not configured. Set VITE_API_BASE_URL in .env (e.g. https://api.ihost.one or http://localhost:3010), then restart the app."
        );
        return;
      }

      const newBranch: ChatMessage[] = [{ ...firstUser, id: `user-${Date.now()}` }];
      setConversationBranches((prev) => {
        const next = [...prev, newBranch];
        currentBranchIndexRef.current = next.length - 1;
        return next;
      });
      setCurrentBranchIndex((prev) => prev + 1);
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const apiMessages: Array<{ role: string; content: string }> = [
        { role: "user", content: firstUser.content },
      ];

      try {
        const res = await api.aiChat(
          token,
          {
            messages: apiMessages,
            context: context ? { servers: context.servers, selectedServerId: context.selectedServerId } : undefined,
          },
          { signal: controller.signal }
        );
        const assistantContent =
          (res.content ?? res.choices?.[0]?.message?.content?.trim() ?? "").trim() || "No response from AI.";
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          actions: res.actions && res.actions.length > 0 ? res.actions : undefined,
        };
        setConversationBranches((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          next[idx] = [...(next[idx] ?? []), assistantMsg];
          return next;
        });
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          abortRef.current = null;
          setLoading(false);
          const timeoutErr: ChatMessage = {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "Request took too long. Try again in a moment.",
            error: true,
          };
          setConversationBranches((prev) => {
            const next = [...prev];
            const idx = next.length - 1;
            next[idx] = [...(next[idx] ?? []), timeoutErr];
            return next;
          });
          return;
        }
        let err = e instanceof Error ? e.message : "Request failed";
        if (err === "Failed to fetch" || (e instanceof TypeError && e.message?.includes("fetch"))) {
          err =
            "Network error. Check your connection and that the API is reachable. If using a local backend, ensure it is running and VITE_API_BASE_URL points to it (e.g. http://localhost:3010).";
        }
        setError(err);
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: err,
          error: true,
        };
        setConversationBranches((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          next[idx] = [...(next[idx] ?? []), errMsg];
          return next;
        });
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        abortRef.current = null;
      }
    },
    []
  );

  return {
    messages,
    loading,
    error,
    sendMessage,
    sendContinuation,
    stop,
    clearMessages,
    conversationBranches,
    branchCount: conversationBranches.length,
    branchIndex: currentBranchIndex,
    setCurrentBranchIndex,
    regenerateFromFirstMessage,
  };
}
