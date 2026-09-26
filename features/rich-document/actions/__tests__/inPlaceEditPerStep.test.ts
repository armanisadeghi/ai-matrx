/**
 * RC-B5 — every step of a multi-step turn can be edited in place.
 *
 * Each step renders its own right-click menu (`AssistantMessageContextMenu`,
 * the ONE registry) for its own row; `edit` there must open THAT row in place,
 * not the turn's answer row, and must be absent on a step with no text (a
 * tool-call-only step) instead of opening an empty editor.
 */
import "../handlers";
import { getAction } from "../provider";
import { buildChatMessageActions } from "../../chat/chatMessageActions";
import { getSourceAdapter } from "../sources";
import type { RichDocumentActionContext } from "../../types";

function stepContext(messageId: string, text: string) {
  const config = buildChatMessageActions({
    conversationId: "conv-1",
    messageId,
    role: "assistant",
    messageContent: text,
    metadata: null,
    streamRequestId: null,
    contentHistoryCount: 0,
    isCreator: false,
    surfaceKey: "chat-page",
    showFullPrint: false,
    callbacks: {},
  });
  const dispatch = jest.fn();
  const adapter = getSourceAdapter(config.source.type);
  const ctx = {
    content: config.content,
    source: config.source,
    metadata: null,
    dispatch: dispatch as never,
    getState: (() => ({
      messages: {
        byConversationId: {
          "conv-1": { byId: { [messageId]: { id: messageId, content: [{ type: "text", text }] } } },
        },
      },
    })) as never,
    organizationId: "org-1",
    isAuthenticated: true,
    isAdmin: false,
    isCreator: false,
    surfaceKey: "chat-page",
    onClose: () => {},
    instanceKey: (suffix: string) => `x-${suffix}`,
    sourceAdapter: adapter,
    callbacks: config.actions.callbacks,
    extensions: config.actions.extensions,
  } as unknown as RichDocumentActionContext;
  return { ctx, dispatch };
}

const edit = getAction("edit")!;

test("an earlier step's own menu opens THAT step in place", async () => {
  const { ctx, dispatch } = stepContext("step-2", "The scheduling spine is scheduler.sch_task.");
  expect(edit.visible?.(ctx) ?? true).toBe(true);
  await edit.run(ctx);
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "messages/updateMessageRecord",
      payload: { conversationId: "conv-1", messageId: "step-2", patch: { _editingInPlace: true } },
    }),
  );
});

test("a tool-call-only step offers no Edit at all", () => {
  const { ctx } = stepContext("step-3", "");
  expect(edit.visible?.(ctx)).toBe(false);
});

test("'Open in full-screen editor' on a chat answer opens THE ONE editor expanded — never the old editor", async () => {
  const { ctx, dispatch } = stepContext("answer-1", "Tokyo gained roughly 81,000 residents.");
  const fullscreen = getAction("open-fullscreen-editor")!;
  await fullscreen.run(ctx);
  const types = dispatch.mock.calls.map(([a]) => (a as { type: string }).type);
  expect(types).not.toContain("overlay/openOverlay");
  expect(types.some((t) => /openOverlay/i.test(t))).toBe(false);
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "messages/updateMessageRecord",
      payload: { conversationId: "conv-1", messageId: "answer-1", patch: { _editingInPlace: "expanded" } },
    }),
  );
});
