/**
 * "Attach to chat" on a canvas tab resolves a chat instead of refusing with
 * "open it from a chat": the item's own metadata, then canvas_items.conversation_id,
 * then the focused chat. Null only when there is truly no chat.
 */
jest.mock("@/features/canvas/services/canvasArtifactService", () => ({ canvasArtifactService: { getById: jest.fn() } }));
jest.mock("@ai-matrx/chat/agents/components/inputs/resources/useAttachRenderedArtifact", () => ({ attachRenderedArtifact: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/utils/renderedArtifactContext", () => ({ availableRenderedArtifactRepresentations: () => [] }));
jest.mock("@ai-matrx/chat/agents/components/chat/begin-fresh-chat", () => ({ chatRouteSurfaceKey: (id: string) => `chat:${id}` }));
jest.mock("@/features/html-pages/capture/renderedCapture", () => ({}));
jest.mock("@/lib/redux/store-singleton", () => ({ getStore: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@ai-matrx/rich-content/utils/lifted/artifactId", () => ({ isMaterializedArtifactId: () => true }));
jest.mock("@/features/canvas/host/artifactItem", () => ({}));
jest.mock("../publishedPage", () => ({}));

import { focusedChatConversationId, resolveAttachConversationId } from "../attachOptions";

describe("attach conversation", () => {
  it("prefers the item's own metadata without a read", async () => {
    const lookupItem = jest.fn();
    expect(await resolveAttachConversationId({ metadataConversationId: "c-meta", canvasItemId: "i", focused: "c-f", lookupItem })).toBe("c-meta");
    expect(lookupItem).not.toHaveBeenCalled();
  });

  it("reads canvas_items.conversation_id when metadata has none", async () => {
    const lookupItem = jest.fn().mockResolvedValue({ conversation_id: "c-row" });
    expect(await resolveAttachConversationId({ metadataConversationId: null, canvasItemId: "i", focused: "c-f", lookupItem })).toBe("c-row");
  });

  it("falls to the focused chat, and to null only when there is no chat", async () => {
    const lookupItem = jest.fn().mockResolvedValue({ conversation_id: null });
    expect(await resolveAttachConversationId({ metadataConversationId: null, canvasItemId: "i", focused: "c-f", lookupItem })).toBe("c-f");
    expect(await resolveAttachConversationId({ metadataConversationId: null, canvasItemId: "i", focused: null, lookupItem })).toBeNull();
  });

  it("a failed read still falls to the focused chat", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const lookupItem = jest.fn().mockRejectedValue(new Error("boom"));
    expect(await resolveAttachConversationId({ metadataConversationId: null, canvasItemId: "i", focused: "c-f", lookupItem })).toBe("c-f");
    spy.mockRestore();
  });

  it("the focused chat is the one chat route surface's input", () => {
    const state = { conversationFocus: { bySurface: { "chat:a1": { input: "c-1" }, "code:x": { input: "c-2" } } } };
    expect(focusedChatConversationId(state)).toBe("c-1");
    expect(focusedChatConversationId({})).toBeNull();
  });
});
