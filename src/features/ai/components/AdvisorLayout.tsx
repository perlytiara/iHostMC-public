"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus, Archive, ArchiveRestore, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { AiChatPanel } from "./AiChatPanel";
import { AdvisorChatErrorBoundary } from "./AdvisorChatErrorBoundary";
import type { ChatMessage } from "../hooks/useAiChat";
import {
  loadConversations,
  saveConversations,
  loadNewChatDraft,
  saveNewChatDraft,
  deriveConversationMeta,
  isDraftConversation,
  sanitizeChatMessage,
  type AdvisorConversation,
} from "../lib/advisor-conversations";
import { api } from "@/lib/api-client";
import { getToken } from "@/features/auth";
import { cn } from "@/lib/utils";

const NEW_ID = "__new__";
const SIDEBAR_WIDTH_MIN = 160;
const SIDEBAR_WIDTH_MAX = 420;
const SIDEBAR_WIDTH_DEFAULT = 224;

export interface AdvisorLayoutProps {
  onOpenAccount?: () => void;
}

function initialDraftByKey(conversations: AdvisorConversation[]): Record<string, string> {
  const map: Record<string, string> = { [NEW_ID]: loadNewChatDraft() };
  for (const c of conversations) {
    if (typeof c.draftText === "string") map[c.id] = c.draftText;
  }
  return map;
}

export function AdvisorLayout({ onOpenAccount }: AdvisorLayoutProps) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<AdvisorConversation[]>(() => loadConversations());
  const [draftByKey, setDraftByKey] = useState<Record<string, string>>(() =>
    initialDraftByKey(loadConversations())
  );
  const newDraftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(NEW_ID);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [currentConversationLoading, setCurrentConversationLoading] = useState(false);

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing) return;
      const next = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, e.clientX));
      setSidebarWidth(next);
    },
    [resizing]
  );
  const handleResizeEnd = useCallback(() => setResizing(false), []);
  useEffect(() => {
    if (!resizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [resizing, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const onDraftChange = useCallback((key: string, text: string) => {
    setDraftByKey((prev) => ({ ...prev, [key]: text }));
    if (key === NEW_ID) {
      if (newDraftSaveTimeoutRef.current) clearTimeout(newDraftSaveTimeoutRef.current);
      newDraftSaveTimeoutRef.current = setTimeout(() => {
        saveNewChatDraft(text);
        newDraftSaveTimeoutRef.current = null;
      }, 400);
    }
  }, []);

  const handlePanelDraftChange = useCallback(
    (text: string) => {
      onDraftChange(currentId ?? NEW_ID, text);
    },
    [currentId, onDraftChange]
  );

  useEffect(() => {
    return () => {
      if (newDraftSaveTimeoutRef.current) clearTimeout(newDraftSaveTimeoutRef.current);
    };
  }, []);

  const current = currentId && currentId !== NEW_ID ? conversations.find((c) => c.id === currentId) : null;
  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);

  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      if (currentId === null || currentId === NEW_ID) {
        if (messages.length === 0) return;
        const id = `conv-${Date.now()}`;
        const meta = deriveConversationMeta(messages);
        const fallbackTitle = meta.title;
        setConversations((prev) => {
          const withoutDraftOnly = prev.filter((c) => c.messages.length > 0 || !(c.draftText?.trim()));
          return [
            ...withoutDraftOnly,
            {
              id,
              title: fallbackTitle,
              serverId: meta.serverId,
              serverName: meta.serverName,
              messages,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              archived: false,
            },
          ];
        });
        setCurrentId(id);
        if (meta.firstMessageDisplay) {
          const token = getToken();
          if (token) {
            api
              .aiSuggestTitle(token, { message: meta.firstMessageDisplay })
              .then(({ title: suggested }) => {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === id && c.title === fallbackTitle
                      ? { ...c, title: suggested, updatedAt: Date.now() }
                      : c
                  )
                );
              })
              .catch(() => {});
          }
        }
        return;
      }
      const meta = deriveConversationMeta(messages);
      const isFirstMessage = current?.messages.length === 0;
      const fallbackTitle = meta.title;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== currentId) return c;
          return {
            ...c,
            messages,
            title: isFirstMessage ? fallbackTitle : c.title,
            serverId: isFirstMessage ? meta.serverId : c.serverId,
            serverName: isFirstMessage ? meta.serverName : c.serverName,
            updatedAt: Date.now(),
          };
        })
      );
      if (isFirstMessage && meta.firstMessageDisplay) {
        const token = getToken();
        if (token) {
          api
            .aiSuggestTitle(token, { message: meta.firstMessageDisplay })
            .then(({ title: suggested }) => {
              setConversations((p) =>
                p.map((conv) =>
                  conv.id === currentId && conv.title === fallbackTitle
                    ? { ...conv, title: suggested, updatedAt: Date.now() }
                    : conv
                )
              );
            })
            .catch(() => {});
        }
      }
    },
    [currentId, current]
  );

  const handleNewChat = useCallback(() => {
    const current = currentId;
    const newDraft = (draftByKey[NEW_ID] ?? "").trim();
    if (current === NEW_ID && newDraft.length > 0) {
      const draftConv: AdvisorConversation = {
        id: `draft-${Date.now()}`,
        title: t("advisor.draft", "Draft"),
        serverId: null,
        serverName: null,
        messages: [],
        draftText: draftByKey[NEW_ID],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false,
      };
      setConversations((prev) => [draftConv, ...prev]);
      setDraftByKey((prev) => ({ ...prev, [NEW_ID]: "" }));
      saveNewChatDraft("");
      setCurrentId(NEW_ID);
      return;
    }
    if (current === NEW_ID) {
      setCurrentId(NEW_ID);
      return;
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === current ? { ...c, draftText: draftByKey[current] ?? c.draftText, updatedAt: Date.now() } : c
      )
    );
    setCurrentId(NEW_ID);
  }, [currentId, draftByKey, t]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === currentId) return;
      if (currentId === NEW_ID) {
        saveNewChatDraft(draftByKey[NEW_ID] ?? "");
      } else if (currentId != null) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentId
              ? { ...c, draftText: draftByKey[currentId] ?? c.draftText, updatedAt: Date.now() }
              : c
          )
        );
      }
      setCurrentId(id);
    },
    [currentId, draftByKey]
  );

  const handleArchive = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived: true } : c)));
      if (currentId === id) {
        if (currentConversationLoading) {
          return;
        }
        const stillActive = conversations.filter((c) => !c.archived && c.id !== id);
        setCurrentId(stillActive.length > 0 ? stillActive[0]!.id : NEW_ID);
      }
    },
    [currentId, conversations, currentConversationLoading]
  );

  const handleUnarchive = useCallback((id: string) => {
    setContextMenu(null);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived: false } : c)));
  }, []);

  const startRename = useCallback((c: AdvisorConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditingTitle(c.title);
  }, []);

  const saveRename = useCallback(() => {
    if (editingId === null) return;
    const value =
      (editingTitle.trim() || conversations.find((c) => c.id === editingId)?.title) ?? "";
    setConversations((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, title: value, updatedAt: Date.now() } : c))
    );
    setEditingId(null);
    setEditingTitle("");
  }, [editingId, editingTitle, conversations]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setContextMenu(null);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) {
        const rest = conversations.filter((c) => c.id !== id && !c.archived);
        setCurrentId(rest.length > 0 ? rest[0]!.id : NEW_ID);
      }
    },
    [currentId, conversations]
  );

  const openContextMenu = useCallback((e: React.MouseEvent, convId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, convId });
  }, []);

  const handleContextMenuRename = useCallback(
    (convId: string) => {
      const c = conversations.find((x) => x.id === convId);
      if (c) {
        setEditingId(c.id);
        setEditingTitle(c.title);
      }
      setContextMenu(null);
    },
    [conversations]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const onDocClick = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const handleConversationTitleChange = useCallback(
    (title: string) => {
      if (currentId === null || currentId === NEW_ID) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === currentId ? { ...c, title: title.trim() || c.title, updatedAt: Date.now() } : c))
      );
    },
    [currentId]
  );

  const rawMessages = currentId === NEW_ID ? [] : (current?.messages ?? []);
  const initialMessages = rawMessages
    .map((m) => sanitizeChatMessage(m))
    .filter((m): m is ChatMessage => m != null);
  /* Stable key so the panel does not remount when creating the first conversation;
   * otherwise the in-flight API response would be lost (applied to unmounted instance). */
  const panelKey = "advisor-panel";

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Sidebar: conversations */}
      <aside
        className="flex shrink-0 flex-col border-r border-border bg-card/30 overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <div className="p-2">
            <div className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground">
              <button
                type="button"
                onClick={() => setActiveExpanded((e) => !e)}
                className="flex flex-1 min-w-0 items-center gap-2 rounded py-0.5 -my-0.5 hover:bg-muted/70 text-left"
              >
                {activeExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                {t("advisor.active", "Active")} ({active.length})
              </button>
              <button
                type="button"
                onClick={handleNewChat}
                title={t("advisor.newChat", "New chat")}
                className={cn(
                  "shrink-0 p-1.5 rounded-md opacity-70 hover:opacity-100 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-opacity",
                  currentId === NEW_ID && "opacity-100 text-primary bg-primary/15"
                )}
                aria-label={t("advisor.newChat", "New chat")}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {activeExpanded && (
              <ul className="mt-1 space-y-0.5">
                {active.map((c) => (
                  <li key={c.id}>
                    {editingId === c.id ? (
                      <div
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm group",
                          currentId === c.id ? "bg-primary/15 text-primary" : "hover:bg-muted/70 text-foreground"
                        )}
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="min-w-0 flex-1 rounded bg-background px-1.5 py-0.5 text-sm ring-1 ring-input"
                          autoFocus
                          aria-label={t("advisor.renameConversation", "Rename conversation")}
                        />
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        data-context-menu
                        onClick={() => handleSelect(c.id)}
                        onKeyDown={(e) => e.key === "Enter" && handleSelect(c.id)}
                        onContextMenu={(e) => openContextMenu(e, c.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm group cursor-pointer",
                          currentId === c.id ? "bg-primary/15 text-primary" : "hover:bg-muted/70 text-foreground"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate" title={c.title}>
                          {isDraftConversation(c) ? (
                            <>
                              <span className="text-muted-foreground italic">{t("advisor.draft", "Draft")}</span>
                              {c.draftText?.trim() ? (
                                <span className="ml-1 truncate">— {c.draftText.trim().slice(0, 24)}{c.draftText.trim().length > 24 ? "…" : ""}</span>
                              ) : null}
                            </>
                          ) : (
                            c.title
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => startRename(c, e)}
                          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground"
                          title={t("advisor.rename", "Rename")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleArchive(c.id, e)}
                          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground"
                          title={t("advisor.archive", "Archive")}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 p-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setArchiveExpanded((e) => !e)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/70"
            >
              {archiveExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {t("advisor.archiveSection", "Archive")} ({archived.length})
            </button>
            {archiveExpanded && archived.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {archived.map((c) => (
                  <li key={c.id}>
                    {editingId === c.id ? (
                      <div className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="min-w-0 flex-1 rounded bg-background px-1.5 py-0.5 text-sm ring-1 ring-input"
                          autoFocus
                          aria-label={t("advisor.renameConversation", "Rename conversation")}
                        />
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        data-context-menu
                        onClick={() => handleSelect(c.id)}
                        onKeyDown={(e) => e.key === "Enter" && handleSelect(c.id)}
                        onContextMenu={(e) => openContextMenu(e, c.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm group cursor-pointer",
                          currentId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted/70 text-foreground"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate" title={c.title}>
                          {c.title}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => startRename(c, e)}
                          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground"
                          title={t("advisor.rename", "Rename")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id);
                          }}
                          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-destructive text-muted-foreground"
                          title={t("advisor.delete", "Delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-label={t("advisor.resizeSidebar", "Resize sidebar")}
        onMouseDown={() => setResizing(true)}
        className={cn(
          "w-1 shrink-0 cursor-col-resize bg-border/60 hover:bg-primary/40 transition-colors",
          resizing && "bg-primary/50"
        )}
      />
      {contextMenu && (() => {
        const conv = conversations.find((c) => c.id === contextMenu.convId);
        const isArchived = conv?.archived ?? false;
        return (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] min-w-[160px] rounded-lg border border-border bg-card py-1 text-card-foreground shadow-xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => handleContextMenuRename(contextMenu.convId)}
              title={t("advisor.rename", "Rename")}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              {t("advisor.rename", "Rename")}
            </button>
            {isArchived ? (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleUnarchive(contextMenu.convId)}
                  title={t("advisor.restore", "Restore")}
                >
                  <ArchiveRestore className="h-3.5 w-3.5 shrink-0" />
                  {t("advisor.restore", "Restore")}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={() => handleDelete(contextMenu.convId)}
                  title={t("advisor.delete", "Delete")}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {t("advisor.delete", "Delete")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => { handleArchive(contextMenu.convId); setContextMenu(null); }}
                title={t("advisor.archive", "Archive")}
              >
                <Archive className="h-3.5 w-3.5 shrink-0" />
                {t("advisor.archive", "Archive")}
              </button>
            )}
          </div>
        );
      })()}
      {/* Main: chat */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AdvisorChatErrorBoundary
          conversationId={currentId ?? NEW_ID}
          onRecover={() => setCurrentId(NEW_ID)}
        >
          <AiChatPanel
            key={panelKey}
            onOpenAccount={onOpenAccount}
            conversationKey={currentId ?? "new"}
            initialMessages={initialMessages}
            onMessagesChange={handleMessagesChange}
            conversationTitle={current?.title ?? null}
            onConversationTitleChange={handleConversationTitleChange}
            initialDraft={
              currentId != null
                ? (draftByKey[currentId] ?? (current?.draftText ?? ""))
                : ""
            }
            onDraftChange={handlePanelDraftChange}
            onLoadingChange={setCurrentConversationLoading}
          />
        </AdvisorChatErrorBoundary>
      </main>
    </div>
  );
}
