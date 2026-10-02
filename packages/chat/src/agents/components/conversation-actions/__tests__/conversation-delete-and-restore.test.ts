/**
 * DD-179 guard — a conversation can be renamed, deleted and restored FROM THE
 * CHAT PRODUCT.
 *
 * The defect this locks down (B-70's finding): every verb existed in the
 * conversation-list slice and the menu registry, and the conversation PAGE
 * carried none of them, so standing inside a conversation there was no way to
 * rename or delete it; and the soft delete had no inverse anywhere in the
 * client, so "soft" was indistinguishable from destruction.
 *
 * Three properties, each of which was false before this change:
 *   1. The page menu is mounted on BOTH chat routes (source-scan — a header is
 *      a portal with no row to render, so there is nothing to query).
 *   2. `buildConversationMenu`'s Rename is a REAL command on a host that
 *      supplies `onRename`, instead of ItemRow's inline-edit intent (whose
 *      fallback on a non-row host is an honest refusal toast).
 *   3. The trash reducers exist and a deleted row lands in the trash, out of
 *      every live list, and leaves it on restore.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  conversationListReducer,
  addToTrash,
  removeFromTrash,
  setGlobalListSuccess,
  removeConversation,
} from "@/features/agents/redux/conversation-list/conversation-list.slice";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import type { AppDispatch } from "@/lib/redux/store";

const repoRoot = path.resolve(__dirname, "../../../../..");

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

function findEntry(config: ReturnType<typeof buildConversationMenu>, id: string) {
  for (const section of config.sections) {
    for (const entry of section.items) {
      if (entry.id === id) return entry;
    }
  }
  return undefined;
}

const noopDispatch = (() => undefined) as unknown as AppDispatch;

const baseCtx = {
  conversationId: "c1",
  title: "A chat",
  isFavorite: false,
  isArchived: false,
  excludeFromKg: false,
  href: "/chat/c1",
  dispatch: noopDispatch,
};

describe("DD-179 — the conversation page can rename, delete and restore", () => {
  it("mounts the conversation menu on the production chat header", () => {
    const header = read("features/agents/components/chat/ChatRunHeader.tsx");
    expect(header).toContain("ConversationPageMenu");
  });

  it("mounts the SAME menu component on the demo chat header", () => {
    const header = read("features/cx-chat/components/ChatHeaderControls.tsx");
    expect(header).toContain("ConversationPageMenu");
  });

  it("gives a non-row host a real Rename instead of the refusal fallback", () => {
    const onRename = jest.fn();
    const entry = findEntry(
      buildConversationMenu({ ...baseCtx, onRename }),
      "rename",
    );
    expect(entry).toBeDefined();
    // An ItemRow intent would mean the header's menu row does nothing at all.
    expect((entry as { intent?: string }).intent).toBeUndefined();
    (entry as { onSelect: () => void }).onSelect();
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("keeps the inline-rename intent on list rows (no onRename supplied)", () => {
    const entry = findEntry(buildConversationMenu(baseCtx), "rename");
    expect((entry as { intent?: string }).intent).toBe("rename");
  });

  it("still offers Delete from the page menu", () => {
    const entry = findEntry(buildConversationMenu(baseCtx), "delete");
    expect(entry).toBeDefined();
    expect((entry as { tone?: string }).tone).toBe("destructive");
  });

  it("moves a deleted conversation into the trash and out of every live list", () => {
    const item: ConversationListItem = {
      conversationId: "c1",
      title: "A chat",
      updatedAt: "2026-09-13T00:00:00Z",
      messageCount: 3,
      status: "active",
      isFavorite: false,
      excludeFromKg: false,
    };

    let state = conversationListReducer(
      undefined,
      setGlobalListSuccess({ items: [item], hasMore: false }),
    );
    expect(state.allConversationIds).toEqual(["c1"]);

    // What `softDeleteConversation` dispatches on success.
    state = conversationListReducer(state, addToTrash(item));
    state = conversationListReducer(state, removeConversation("c1"));

    expect(state.allConversationIds).toEqual([]);
    expect(state.byConversationId.c1).toBeUndefined();
    expect(state.trashConversationIds).toEqual(["c1"]);
    expect(state.trashByConversationId.c1?.title).toBe("A chat");

    // …and what `restoreConversation` dispatches.
    state = conversationListReducer(state, removeFromTrash("c1"));
    expect(state.trashConversationIds).toEqual([]);
    expect(state.trashByConversationId.c1).toBeUndefined();
  });

  it("carries a restorable trash on every conversation list surface", () => {
    const sidebar = read(
      "features/agents/components/conversation-history/ConversationHistorySidebar.tsx",
    );
    // Both variants — the dense workspace list and the consumer /chat list.
    const mounts = sidebar.match(/<ConversationTrashSection/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2);

    const trash = read(
      "features/agents/components/conversation-history/ConversationTrashSection.tsx",
    );
    expect(trash).toContain("restoreConversation");
    expect(trash).toContain("Restore");
  });
});
