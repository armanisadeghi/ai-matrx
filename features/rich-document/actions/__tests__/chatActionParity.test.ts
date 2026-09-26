/**
 * RC-B6 — ONE ACTION REGISTRY: the chat message menu is the rich-document
 * registry, nothing else.
 *
 * Until RC-B6 the /chat ⋯ menu was `messageActionRegistry.ts` (2,489 lines,
 * ~50 actions) and the rich-document registry was a partial port of it that
 * had drifted: fourteen chat actions (Add to Rulebook, Share as webpage, Send
 * to Google Doc, Save as PDF, Summarize & listen, Convert to flashcards, …)
 * existed ONLY in chat, so a note or a study guide never offered them.
 *
 * This guard pins the migration from both sides:
 *   1. every action the chat menu ever offered (by its former key) resolves to
 *      a registered action in the ONE registry, and
 *   2. the chat menu's row for it runs THAT registry handler — driven through
 *      the real menu builder (`toAdvancedMenuItems`) the chat bar renders.
 *
 * It fails on the pre-RC-B6 tree: the fourteen chat-only ids are absent from
 * the registry and the chat menu builder does not exist.
 */

import "../handlers";
import { getAction, resolveActions } from "../provider";
import { chatContext, RICH_MESSAGE } from "../../test-utils/chatContext";
import { toAdvancedMenuItems } from "../../variants/RegistryActionMenu";
import type { MenuItem } from "@/components/official/AdvancedMenu";

/** Former chat menu key → the registry id that now owns the behavior. */
const FORMER_CHAT_ACTIONS: Record<
  string,
  { id: string; role: "assistant" | "user" }
> = {
  // Copy family
  "copy-plain": { id: "copy", role: "assistant" },
  // Docs and Word were byte-identical: one "Copy formatted" (ALC-15).
  "copy-docs": { id: "copy-formatted", role: "assistant" },
  "copy-word": { id: "copy-formatted", role: "assistant" },
  "copy-thinking": { id: "copy-with-thinking", role: "assistant" },
  "copy-html": { id: "copy-html-page", role: "assistant" },
  // Primary doors + actions
  "add-to-tasks": { id: "save-to-task", role: "assistant" },
  "add-to-rulebook": { id: "add-to-rulebook", role: "assistant" },
  "set-context-value": { id: "set-context-value", role: "assistant" },
  "convert-to-study": { id: "convert-to-study", role: "assistant" },
  "save-shape-instance": { id: "save-shape-instance", role: "assistant" },
  "summarize-for-listening": { id: "summarize-for-listening", role: "assistant" },
  "summarize-and-listen": { id: "summarize-and-listen", role: "assistant" },
  // Share & export
  "html-preview": { id: "html-preview", role: "assistant" },
  "share-webpage": { id: "share-webpage", role: "assistant" },
  "send-google-doc": { id: "send-google-doc", role: "assistant" },
  "email-to-me": { id: "email-to-me", role: "assistant" },
  print: { id: "print", role: "assistant" },
  "full-print": { id: "full-print", role: "assistant" },
  // Save as
  "save-as-message-template": { id: "save-as-message-template", role: "assistant" },
  "save-as-note": { id: "save-to-notes", role: "assistant" },
  "add-docs": { id: "add-to-docs", role: "assistant" },
  "save-file": { id: "save-as-file", role: "assistant" },
  "save-to-code": { id: "save-to-code", role: "assistant" },
  "save-as-file": { id: "save-to-files", role: "assistant" },
  "save-code-scratch": { id: "save-code-to-scratch", role: "assistant" },
  "save-scratch": { id: "save-to-scratch", role: "assistant" },
  "save-as-pdf": { id: "save-as-pdf", role: "assistant" },
  // Edit — assistant
  "edit-content": { id: "edit", role: "assistant" },
  "edit-history": { id: "edit-history", role: "assistant" },
  "fork-at-message": { id: "fork-at-message", role: "assistant" },
  "delete-message": { id: "delete-message", role: "assistant" },
  // Edit — user
  "edit-resubmit": { id: "edit-and-resubmit", role: "user" },
  "fork-at-message (user)": { id: "fork-and-regenerate", role: "user" },
  "delete-message (user)": { id: "delete-message", role: "user" },
  // Creator
  "analyze-response": { id: "analyze-response", role: "assistant" },
  "stream-debug": { id: "debug-stream", role: "assistant" },
  // Server API (test)
  "srv-fork-at": { id: "server-api-admin-fork-at", role: "assistant" },
  "srv-fork-before": { id: "server-api-admin-fork-before", role: "assistant" },
  "srv-hide-from-model": { id: "server-api-admin-hide-from-model", role: "assistant" },
  "srv-delete-this": { id: "server-api-admin-delete-this", role: "assistant" },
  "srv-delete-from-here": { id: "server-api-admin-delete-from-here", role: "assistant" },
  "srv-delete-dryrun": { id: "server-api-admin-delete-dryrun", role: "assistant" },
  "srv-replace-with-summary": { id: "server-api-admin-replace-with-summary", role: "assistant" },
  "srv-restore-compaction": { id: "server-api-admin-restore-compaction", role: "assistant" },
  // App
  "submit-feedback": { id: "submit-feedback", role: "assistant" },
  announcements: { id: "announcements", role: "assistant" },
  "user-preferences": { id: "preferences", role: "assistant" },
};

function flatten(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) =>
    item.children ? flatten(item.children) : [item],
  );
}

function chatMenu(role: "assistant" | "user"): MenuItem[] {
  const ctx = chatContext(role);
  return flatten(toAdvancedMenuItems(resolveActions(ctx), ctx, () => ctx));
}

describe("RC-B6: every former chat action lives in the ONE registry", () => {
  it.each(Object.entries(FORMER_CHAT_ACTIONS))(
    "%s → registered",
    (_formerKey, { id }) => {
      expect(getAction(id)).toBeDefined();
    },
  );

  it.each(Object.entries(FORMER_CHAT_ACTIONS))(
    "%s → the chat menu row runs the registry handler",
    (_formerKey, { id, role }) => {
      const action = getAction(id);
      expect(action).toBeDefined();
      const row = chatMenu(role).find((item) => item.key === id);
      expect(row).toBeDefined();
      const run = jest.spyOn(action!, "run").mockImplementation(() => {});
      try {
        void row!.action();
        expect(run).toHaveBeenCalledTimes(1);
        const ctx = run.mock.calls[0][0];
        expect(ctx.source).toEqual(
          expect.objectContaining({
            type: "chat-message",
            conversationId: "conv-1",
            messageId: "msg-2",
          }),
        );
      } finally {
        run.mockRestore();
      }
    },
  );

  it("keeps the user-turn edit paths off an assistant turn and vice versa", () => {
    const assistant = chatMenu("assistant").map((i) => i.key);
    const user = chatMenu("user").map((i) => i.key);
    expect(assistant).not.toContain("edit-and-resubmit");
    expect(assistant).not.toContain("fork-and-regenerate");
    expect(user).not.toContain("edit");
    expect(user).not.toContain("fork-at-message");
    expect(user).not.toContain("copy-with-thinking");
  });

  it("the Oracle tap opens the ONE rulebook dialog with the message provenance", async () => {
    const ctx = chatContext("assistant");
    await getAction("add-to-rulebook")!.run(ctx);
    const dispatch = ctx.dispatch as unknown as jest.Mock;
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          overlayId: "addToRulebookDialog",
          data: expect.objectContaining({
            initialContent: RICH_MESSAGE,
            initialConversationId: "conv-1",
            initialMessageId: "msg-2",
          }),
        }),
      }),
    );
  });
});
