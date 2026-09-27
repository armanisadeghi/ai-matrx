/**
 * GUARD — the answer menu's "Conversation" section (2026-09-26).
 *
 * Break it names:
 *   - a whole-conversation export back in the per-message "Export"
 *     submenu (where it was buried before this section existed);
 *   - a conversation verb missing from the section, or placed anywhere else;
 *   - the section drawn for content that belongs to no conversation;
 *   - a conversation verb that runs its own copy of the header menu's logic
 *     instead of the ONE verb in conversation-verbs.ts.
 */

import "../../actions/handlers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAction, resolveActions, toAlchemyAction } from "../../actions/provider";
import { chatContext } from "../../test-utils/chatContext";
import {
  CONVERSATION_SUBMENU_LABEL,
  MENU_STRUCTURE,
  buildMenuTree,
  registryMenuActions,
} from "../shared/menuStructure";
import { CONVERSATION_TRANSFER_ROWS } from "@/features/agents/conversation-export/conversation-transfer-rows";

const CONVERSATION_IDS = [
  "conversation-find",
  "conversation-share",
  "conversation-copy-link",
  "conversation-rename",
  "conversation-duplicate",
  ...CONVERSATION_TRANSFER_ROWS.map((row) => row.id),
];

function section(label: string) {
  return MENU_STRUCTURE.find((s) => s.submenu === label);
}

describe("the Conversation section", () => {
  it("comes right after the promoted top group", () => {
    expect(MENU_STRUCTURE[0].submenu).toBeNull();
    expect(MENU_STRUCTURE[1].submenu).toBe(CONVERSATION_SUBMENU_LABEL);
  });

  it("holds every whole-conversation verb, and Export holds only this message", () => {
    const ids = section(CONVERSATION_SUBMENU_LABEL)?.actionIds ?? [];
    for (const id of [...CONVERSATION_IDS, "conversation-pinned-only"]) expect(ids).toContain(id);
    const shareExport = section("Export")?.actionIds ?? [];
    expect(shareExport.filter((id) => id.startsWith("conversation-"))).toEqual([]);
  });

  it("holds ONLY whole-conversation verbs — a message-scoped verb never sits inside it", () => {
    // Chair ruling 2026-09-26: "Ask a follow-up" / "Quote into chat" act on THIS
    // message, so they live with the message verbs, never in Conversation.
    const ids = section(CONVERSATION_SUBMENU_LABEL)?.actionIds ?? [];
    expect(ids.filter((id) => !/^(conversation-|export-conversation-)/.test(id))).toEqual([]);
    const top = MENU_STRUCTURE[0].actionIds;
    for (const id of ["send-to-agent", "ask-followup", "quote-into-chat"]) expect(top).toContain(id);
  });

  it("renders as ONE submenu row holding the verbs, for a chat message", () => {
    const tree = buildMenuTree(registryMenuActions(resolveActions(chatContext("assistant"))));
    const conv = tree.submenus.find((s) => s.label === CONVERSATION_SUBMENU_LABEL);
    expect(conv).toBeDefined();
    const labels = conv!.actions.map((a) => (typeof a.label === "string" ? a.label : a.id));
    // Findable by name in the menu filter: every label says what it acts on.
    expect(labels).toEqual(
      expect.arrayContaining([
        "Find in conversation",
        "Share conversation",
        "Copy conversation link",
        "Rename conversation",
        "Duplicate conversation",
        // THE full Alchemy set over the whole conversation (Arman, 2026-09-26).
        "Copy conversation as plain text",
        "Copy conversation as Markdown",
        "Copy conversation formatted",
        "Copy conversation for AI…",
        "Download conversation as text",
        "Download conversation as Markdown",
        "Download conversation as web page",
        "Download conversation as JSON",
        "Download conversation as PDF",
        "Download conversation as Word",
        "Download conversation as EPUB",
        "Save conversation to Notes",
        "Create a document from conversation",
        "Create a task from conversation",
        "Open conversation in a new chat",
        "Email conversation to me",
      ]),
    );
    expect(tree.topLevel.map((a) => a.id)).not.toContain("conversation-share");
  });

  it("sits in ONE place in the Alchemy layout: every row carries the section's layout category", () => {
    // The layout groups a section by its rows' category; a mixed section
    // landed after "Save" (its first ask row pulled it into the AI group).
    const ids = section(CONVERSATION_SUBMENU_LABEL)?.actionIds ?? [];
    const categories = new Set(
      ids.map((id) => getAction(id)).filter(Boolean).map((a) => toAlchemyAction(a!).category),
    );
    expect([...categories]).toEqual(["save"]);
  });

  it("is absent for content with no conversation", () => {
    const ctx = chatContext("assistant", {
      source: { type: "chat-message", conversationId: "", messageId: "msg-2" },
    });
    const ids = resolveActions(ctx).map((a) => a.id);
    for (const id of CONVERSATION_IDS) expect(ids).not.toContain(id);
  });

  it("runs the SAME verbs the header menu runs — never a second implementation", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const section = readFileSync(join(root, "features/rich-document/actions/handlers/conversation-section.ts"), "utf8");
    const listMenu = readFileSync(
      join(root, "features/agents/components/conversation-actions/conversationActionRegistry.tsx"),
      "utf8",
    );
    const header = readFileSync(join(root, "features/agents/components/chat/ConversationPageMenu.tsx"), "utf8");
    for (const verb of ["shareConversation", "copyConversationLink", "duplicateConversationVerb", "openConversationRename"]) {
      expect(section).toContain(verb);
    }
    for (const verb of ["shareConversation", "copyConversationLink", "duplicateConversationVerb"]) {
      expect(listMenu).toContain(verb);
    }
    expect(header).toContain("openConversationRename");
    // No hand-rolled copies of the verbs' bodies left behind.
    for (const src of [section, listMenu, header]) {
      expect(src).not.toMatch(/overlayId:\s*"shareModal"/);
      expect(src).not.toMatch(/duplicateConversation\(\{/);
      expect(src).not.toMatch(/navigator\.clipboard\.writeText/);
      expect(src).not.toMatch(/<TextInputDialog/);
    }
  });
});
