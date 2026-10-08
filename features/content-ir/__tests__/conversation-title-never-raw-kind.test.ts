/**
 * R4 (kind-never-raw round 6): a conversation title is a one-line name. A
 * title that holds kind JSON reads as its kind label everywhere a title is
 * drawn (sidebar, history, panel/tab title, lists) — and a kind wrapped in an
 * `<artifact>` tag names the record by its kind, never "".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { plainTitleFromMarkdown } from "@ai-matrx/rich-content/markdown-core/plain-title";
import { kindTextLabel } from "../surfaces/kind-text-label";
import { conversationTitleText } from "@ai-matrx/content-ir/surfaces";
import { mapRpcRowToConversationListItem } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.thunks";

const KIND = '{"__kind":"flashcard_set","title":"Cell biology","cards":[{"front":"a","back":"b"}]}';
const ARTIFACT = `<artifact id="a1" type="flashcards">\n${'{"__kind":"flashcard_set","cards":[]}'}\n</artifact>`;

describe("conversation titles never draw kind JSON (R4)", () => {
  it("plainTitleFromMarkdown names an <artifact>-wrapped kind by its kind", () => {
    const title = plainTitleFromMarkdown(ARTIFACT);
    expect(title).not.toBe("");
    expect(title).toMatch(/flashcard/i);
    expect(title).not.toContain("__kind");
  });

  it("kindTextLabel is never empty for text that holds a kind", () => {
    expect(kindTextLabel(ARTIFACT)).toMatch(/flashcard/i);
  });

  it("conversationTitleText reads a kind title as its label, keeps a plain title", () => {
    expect(conversationTitleText(KIND)).toBe("Flashcard Set · Cell biology");
    expect(conversationTitleText("Trip to Rome")).toBe("Trip to Rome");
    expect(conversationTitleText(null)).toBeNull();
  });

  it("the conversation list read boundary stores the readable title", () => {
    const item = mapRpcRowToConversationListItem({
      conversation_id: "c1",
      title: KIND,
      description: null,
      created_at: "2026-10-05T00:00:00Z",
      updated_at: "2026-10-05T00:00:00Z",
      status: "active",
      message_count: 2,
    } as unknown as Parameters<typeof mapRpcRowToConversationListItem>[0]);
    expect(item.title).not.toContain("__kind");
  });

  const root = path.resolve(__dirname, "../../..");
  it.each([
    "../aidream/apps/shared/chat/src/cx-chat/components/SsrSidebarChats.tsx",
    "../aidream/apps/shared/chat/src/canvas/workspace/ChatPanelTitleMenu.tsx",
    "../aidream/apps/shared/chat/src/agents/components/conversation-actions/conversation-verbs.ts",
    "../aidream/apps/shared/chat/src/agents/redux/conversation-list/conversation-list.thunks.ts",
  ])("%s reads titles through conversationTitleText", (file) => {
    expect(readFileSync(path.join(root, file), "utf8")).toContain("conversationTitleText(");
  });
});
