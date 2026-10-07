/**
 * GUARD — archiving a conversation is never silent (verifier, 2026-09-28).
 *
 * "Archive in the chat header ⋯ does nothing: no toast, and the conversation
 * stays." The write landed, but (a) the action said nothing on success and (b)
 * the history list never filtered `status = archived`, so the archived row
 * stayed exactly where it was — the archived-items law's default (hide, with
 * "Archived (N)" one click away) was never applied to conversations.
 *
 * Properties locked here, each false before this change:
 *   1. the list's view hides archived rows by default and shows only them in
 *      the archive view;
 *   2. archiving a listed row removes it from the view at once and moves the
 *      "Archived (N)" count;
 *   3. the server read carries the archive predicate for both views;
 *   4. the shared ⋯ Archive verb confirms success with an Undo.
 */
import reducer, {
  patchConversationInScopes,
  setScopeArchiveView,
  setScopeArchivedCount,
  setScopePageSuccess,
} from "@ai-matrx/chat/agents/redux/conversation-history/slice";
import { makeSelectConversationHistoryItems } from "@ai-matrx/chat/agents/redux/conversation-history/selectors";
import type { ConversationListItem } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { chatSourceDir, CHAT_SRC_REL, gitGrepFiles } from "../../../../chat-source";
const CHAT_DIR = chatSourceDir("agents/redux/conversation-history/__tests__");

const row = (id: string, status: string): ConversationListItem =>
  ({
    conversationId: id,
    title: id,
    description: null,
    updatedAt: "2026-09-28T00:00:00Z",
    createdAt: "2026-09-28T00:00:00Z",
    status,
    messageCount: 1,
    isFavorite: false,
    excludeFromKg: false,
    agentId: null,
    lastModelId: null,
  }) as ConversationListItem;

const visible = (state: ReturnType<typeof reducer>) =>
  makeSelectConversationHistoryItems("chat")({
    conversationHistory: state,
  } as unknown as ChatRootState).map((i) => i.conversationId);

function seeded() {
  let s = reducer(undefined, { type: "@@init" });
  s = reducer(
    s,
    setScopePageSuccess({
      scopeId: "chat",
      items: [row("live", "active"), row("old", "archived")],
      hasMore: false,
      replace: true,
      nextOffset: 2,
    }),
  );
  return reducer(s, setScopeArchivedCount({ scopeId: "chat", count: 1 }));
}

describe("archive is never silent", () => {
  it("hides archived rows by default and shows only them in the archive view", () => {
    const s = seeded();
    expect(visible(s)).toEqual(["live"]);
    expect(s.scopes.chat.archiveView).toBe("active");
    const arch = reducer(s, setScopeArchiveView({ scopeId: "chat", view: "archived" }));
    // switching invalidates the window; the refetch brings the archived half
    const refilled = reducer(
      arch,
      setScopePageSuccess({ scopeId: "chat", items: [row("old", "archived")], hasMore: false, replace: true, nextOffset: 1 }),
    );
    expect(visible(refilled)).toEqual(["old"]);
  });

  it("an archived row leaves the list at once and moves the count", () => {
    const s = reducer(
      seeded(),
      patchConversationInScopes({ conversationId: "live", patch: { status: "archived" } }),
    );
    expect(visible(s)).toEqual([]);
    expect(s.scopes.chat.archivedCount).toBe(2);
    const back = reducer(
      s,
      patchConversationInScopes({ conversationId: "live", patch: { status: "active" } }),
    );
    expect(visible(back)).toEqual(["live"]);
    expect(back.scopes.chat.archivedCount).toBe(1);
  });
});

describe("the server read and the verb", () => {
  const read = (p: string) =>
    require("node:fs").readFileSync(require("node:path").join(process.cwd(), p), "utf8") as string;

  it("the history read filters on the archive view, both ways", () => {
    const src = read(`${CHAT_SRC_REL}/agents/redux/conversation-history/thunks.ts`);
    expect(src).toMatch(/query\.eq\("status", "archived"\)/);
    expect(src).toMatch(/query\.neq\("status", "archived"\)/);
  });

  it("the ⋯ Archive verb confirms success with an Undo", async () => {
    jest.resetModules();
    const success = jest.fn();
    jest.doMock("@ai-matrx/chat/host/notify", () => ({ toast: { success, error: jest.fn(), info: jest.fn() } }));
    const { buildConversationMenu } = require("@ai-matrx/chat/agents/components/conversation-actions/conversationActionRegistry");
    const { setConversationArchived } = require("@ai-matrx/chat/agents/redux/conversation-list/conversation-row-actions.thunks");
    const dispatch = jest.fn(async () =>
      setConversationArchived.fulfilled({ conversationId: "c1", status: "archived" }, "r", { conversationId: "c1", archived: true }),
    );
    const menu = buildConversationMenu({
      conversationId: "c1", title: "A chat", isFavorite: false, isArchived: false,
      excludeFromKg: false, href: "/chat/c1", dispatch,
    });
    const entry = menu.sections.flatMap((s: { items: { id: string }[] }) => s.items).find((e: { id: string }) => e.id === "archive") as { onSelect: () => Promise<void> };
    await entry.onSelect();
    expect(success).toHaveBeenCalledWith(
      "Conversation archived",
      expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
    );
  });
});

describe("per-agent conversation lists (Chat window, runner, test history)", () => {
  it("the per-agent selector never mixes archived rows into the live list", () => {
    const { makeSelectAgentConversationList } = require("@ai-matrx/chat/agents/redux/conversation-list/conversation-list.selectors");
    const { conversationListCacheKey } = require("@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types");
    const key = conversationListCacheKey("a1", null);
    const state = {
      conversationList: {
        byConversationId: { live: row("live", "active"), old: row("old", "archived") },
        agentCaches: { [key]: { conversationIds: ["live", "old"], status: "succeeded", error: null, fetchedAt: null } },
      },
    };
    const out = makeSelectAgentConversationList("a1", null)(state);
    expect(out.conversations.map((c: ConversationListItem) => c.conversationId)).toEqual(["live"]);
    expect(out.archived.map((c: ConversationListItem) => c.conversationId)).toEqual(["old"]);
  });

  it("every list built on it offers the one Archived (N) control", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const root = process.cwd();
    const { execSync } = require("node:child_process");
    const consumers = gitGrepFiles(["-e", "makeSelectAgentConversations", "-e", "makeSelectAgentConversationList"], ["features/**/*.tsx", "components/**/*.tsx", "app/**/*.tsx"], ["*.tsx"]).join("\n").split("\n").filter(Boolean);
    // 4 since B1 (2026-10-07) deleted the dead AgentRunsSidebar (no importer anywhere).
    expect(consumers.length).toBeGreaterThanOrEqual(4);
    const missing = consumers.filter((f: string) => !fs.readFileSync(path.join(root, f), "utf8").includes("<ArchivedDisclosure"));
    expect(missing).toEqual([]);
  });
});
