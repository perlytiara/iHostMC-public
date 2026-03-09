import { describe, it, expect, beforeEach } from "vitest";
import {
  loadConversations,
  saveConversations,
  loadNewChatDraft,
  saveNewChatDraft,
  isDraftConversation,
  deriveConversationMeta,
  type AdvisorConversation,
} from "./advisor-conversations";

describe("advisor-conversations", () => {
  beforeEach(() => {
    localStorage.removeItem("ihostmc-advisor-conversations");
    localStorage.removeItem("ihostmc-advisor-new-draft");
  });

  describe("loadConversations / saveConversations", () => {
    it("returns empty array when nothing stored", () => {
      expect(loadConversations()).toEqual([]);
    });

    it("round-trips conversations with messages", () => {
      const convs: AdvisorConversation[] = [
        {
          id: "c1",
          title: "Chat 1",
          serverId: null,
          serverName: null,
          messages: [{ id: "m1", role: "user", content: "Hello" }],
          createdAt: 1,
          updatedAt: 2,
          archived: false,
        },
      ];
      saveConversations(convs);
      expect(loadConversations()).toEqual(convs);
    });

    it("round-trips draftText and normalizes it", () => {
      const convs: AdvisorConversation[] = [
        {
          id: "d1",
          title: "Draft",
          serverId: null,
          serverName: null,
          messages: [],
          draftText: "unsent message",
          createdAt: 1,
          updatedAt: 2,
          archived: false,
        },
      ];
      saveConversations(convs);
      const loaded = loadConversations();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.draftText).toBe("unsent message");
    });

    it("survives reload and restart (persistence)", () => {
      const convs: AdvisorConversation[] = [
        {
          id: "c1",
          title: "My chat",
          serverId: "s1",
          serverName: "My Server",
          messages: [
            { id: "m1", role: "user", content: "Hi" },
            { id: "m2", role: "assistant", content: "Hi there" },
          ],
          createdAt: 100,
          updatedAt: 200,
          archived: false,
        },
      ];
      saveConversations(convs);
      const loaded = loadConversations();
      expect(loaded[0]?.id).toBe("c1");
      expect(loaded[0]?.title).toBe("My chat");
      expect(loaded[0]?.messages).toHaveLength(2);
      expect(loaded[0]?.serverId).toBe("s1");
      expect(loaded[0]?.serverName).toBe("My Server");
    });
  });

  describe("loadNewChatDraft / saveNewChatDraft", () => {
    it("returns empty string when nothing stored", () => {
      expect(loadNewChatDraft()).toBe("");
    });

    it("round-trips new chat draft", () => {
      saveNewChatDraft("typed but not sent");
      expect(loadNewChatDraft()).toBe("typed but not sent");
    });

    it("persists across reload", () => {
      saveNewChatDraft("draft content");
      expect(loadNewChatDraft()).toBe("draft content");
    });
  });

  describe("isDraftConversation", () => {
    it("returns true when no messages and has draftText", () => {
      const c: AdvisorConversation = {
        id: "d1",
        title: "Draft",
        serverId: null,
        serverName: null,
        messages: [],
        draftText: "hello",
        createdAt: 1,
        updatedAt: 2,
        archived: false,
      };
      expect(isDraftConversation(c)).toBe(true);
    });

    it("returns false when has messages", () => {
      const c: AdvisorConversation = {
        id: "c1",
        title: "Chat",
        serverId: null,
        serverName: null,
        messages: [{ id: "m1", role: "user", content: "Hi" }],
        draftText: "extra",
        createdAt: 1,
        updatedAt: 2,
        archived: false,
      };
      expect(isDraftConversation(c)).toBe(false);
    });

    it("returns false when draftText is empty or whitespace", () => {
      const c: AdvisorConversation = {
        id: "d1",
        title: "Draft",
        serverId: null,
        serverName: null,
        messages: [],
        draftText: "   ",
        createdAt: 1,
        updatedAt: 2,
        archived: false,
      };
      expect(isDraftConversation(c)).toBe(false);
    });
  });

  describe("deriveConversationMeta", () => {
    it("returns default title when no messages", () => {
      const meta = deriveConversationMeta([]);
      expect(meta.title).toBe("New chat");
      expect(meta.firstMessageDisplay).toBe("");
      expect(meta.serverId).toBeNull();
      expect(meta.serverName).toBeNull();
    });

    it("uses first user message for title", () => {
      const meta = deriveConversationMeta([
        { id: "m1", role: "user", content: "How do I install Forge?" },
      ]);
      expect(meta.title).toBe("How do I install Forge?");
      expect(meta.firstMessageDisplay).toBe("How do I install Forge?");
    });
  });
});
