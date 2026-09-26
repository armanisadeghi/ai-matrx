/**
 * GUARD — the answer menu's "Conversation" section (2026-09-26).
 *
 * Break it names:
 *   - a whole-conversation export back in the per-message "Share & export"
 *     submenu (where it was buried before this section existed);
 *   - a conversation verb missing from the section, or placed anywhere else;
 *   - the section drawn for content that belongs to no conversation;
 *   - a conversation verb that runs its own copy of the header menu's logic
 *     instead of the ONE verb in conversation-verbs.ts.
 */

import "../../actions/handlers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveActions } from "../../actions/provider";
import { chatContext } from "../../test-utils/chatContext";
import {
  CONVERSATION_SUBMENU_LABEL,
  MENU_STRUCTURE,
  buildMenuTree,
  registryMenuActions,
} from "../shared/menuStructure";

const CONVERSATION_IDS = [
  "conversation-find",
  "conversation-share",
  "conversation-copy-link",
  "conversation-rename",
  "conversation-duplicate",
  "export-conversation-md",
  "export-conversation-pdf",
  "export-conversation-docx",
  "export-conversation-html",
];

function section(label: string) {
  return MENU_STRUCTURE.find((s) => s.submenu === label);
}

describe("the Conversation section", () => {
  it("comes right after the promoted top group", () => {
    expect(MENU_STRUCTURE[0].submenu).toBeNull();
    expect(MENU_STRUCTURE[1].submenu).toBe(CONVERSATION_SUBMENU_LABEL);
  });

  it("holds every whole-conversation verb, and Share & export holds only this message", () => {
    const ids = section(CONVERSATION_SUBMENU_LABEL)?.actionIds ?? [];
    for (const id of [...CONVERSATION_IDS, "conversation-pinned-only"]) expect(ids).toContain(id);
    const shareExport = section("Share & export")?.actionIds ?? [];
    expect(shareExport.filter((id) => id.startsWith("export-conversation-"))).toEqual([]);
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
        "Export conversation as Markdown",
        "Export conversation as PDF",
        "Export conversation as Word",
        "Export conversation as web page",
      ]),
    );
    expect(tree.topLevel.map((a) => a.id)).not.toContain("conversation-share");
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
