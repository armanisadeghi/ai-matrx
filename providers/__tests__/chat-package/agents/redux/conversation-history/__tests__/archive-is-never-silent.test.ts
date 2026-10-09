/**
 * GUARD — archiving a conversation is never silent (verifier, 2026-09-28;
 * re-pointed 2026-10-08 at the one-Archived-place model).
 *
 * "Archive in the chat header ⋯ does nothing: no toast, and the conversation
 * stays." The archived-items law's default (hide archived, one click to see
 * them) was never applied to conversations. Since 2026-10-08 (@ai-matrx/chat
 * aaf726a345) there is no archive-view toggle or "Archived (N)" counter on the
 * history scope: archived AND deleted conversations share ONE "Archived"
 * section at the foot of every list (the conversation-list `trash*` store),
 * and the live list never shows an archived row.
 *
 * Properties locked here, each false before this change:
 *   1. the live list hides archived rows by default, and the Archived section
 *      is where they are shown (the section's read asks for archived + deleted);
 *   2. archiving a listed row removes it from the live view at once and puts
 *      it in the Archived section (restoring does the reverse);
 *   3. the server read carries the archive predicate for both halves: the live
 *      list excludes archived, the Archived section includes them;
 *   4. the shared ⋯ Archive verb confirms success with an Undo.
 */
import reducer, {
  patchConversationInScopes,
  setScopePageSuccess,
} from "@ai-matrx/chat/agents/redux/conversation-history/slice";
import listReducer, {
  addToTrash,
  removeFromTrash,
  setTrashSuccess,
} from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.slice";
import { makeSelectConversationHistoryItems } from "@ai-matrx/chat/agents/redux/conversation-history/selectors";
import type { ConversationListItem } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { chatSourceDir, CHAT_SRC_REL, gitGrepFiles } from "../../../../chat-source";
const CHAT_DIR = chatSourceDir("agents/redux/conversation-history/__tests__");
const read = (p: string) =>
  require("node:fs").readFileSync(require("node:path").join(process.cwd(), p), "utf8") as string;

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

const archivedIds = (s: ReturnType<typeof listReducer>) => s.trashConversationIds;

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
  return s;
}

describe("archive is never silent", () => {
  it("hides archived rows from the live list; the Archived section holds them", () => {
    expect(visible(seeded())).toEqual(["live"]);
    const section = listReducer(
      undefined,
      setTrashSuccess({ items: [row("old", "archived")] }),
    );
    expect(archivedIds(section)).toEqual(["old"]);
  });

  it("an archived row leaves the live list at once and enters the Archived section", () => {
    const s = reducer(
      seeded(),
      patchConversationInScopes({ conversationId: "live", patch: { status: "archived" } }),
    );
    expect(visible(s)).toEqual([]);
    const section = listReducer(undefined, addToTrash(row("live", "archived")));
    expect(archivedIds(section)).toEqual(["live"]);
    const back = reducer(
      s,
      patchConversationInScopes({ conversationId: "live", patch: { status: "active" } }),
    );
    expect(visible(back)).toEqual(["live"]);
    expect(archivedIds(listReducer(section, removeFromTrash("live")))).toEqual([]);
  });

  it("the archive verb files the row into / out of the Archived section", () => {
    const src = read(`${CHAT_SRC_REL}/agents/redux/conversation-list/conversation-row-actions.thunks.ts`);
    expect(src).toMatch(/dispatch\(addToTrash\(/);
    expect(src).toMatch(/dispatch\(removeFromTrash\(/);
  });
});

describe("the server read and the verb", () => {
  it("the live read excludes archived; the Archived section read includes them", () => {
    const live = read(`${CHAT_SRC_REL}/agents/redux/conversation-history/thunks.ts`);
    expect(live).toMatch(/query\.neq\("status", "archived"\)/);
    const archive = read(`${CHAT_SRC_REL}/agents/redux/conversation-list/conversation-trash.thunks.ts`);
    expect(archive).toMatch(/\.or\("deleted_at\.not\.is\.null,status\.eq\.archived"\)/);
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
