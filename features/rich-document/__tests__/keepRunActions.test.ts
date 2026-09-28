import "../actions/handlers/ai";
import { getAction } from "../actions/provider";
import type { RichDocumentActionContext } from "../types";

function ctxFor(launchMapping: unknown, dispatched: unknown[] = []) {
  return {
    content: "answer",
    source: { type: "chat-message", conversationId: "c1", messageId: "m1" },
    extensions: { type: "chat-message", role: "assistant" },
    dispatch: (a: unknown) => {
      dispatched.push(a);
      return a;
    },
    getState: () => ({
      conversations: {
        byConversationId: { c1: { agentId: "agent-1", launchMapping } },
      },
    }),
    onClose: () => {},
  } as unknown as RichDocumentActionContext;
}

const mapping = {
  valueMappings: { topic: { mapType: "surface_value", target: "selection" } },
  surfaceName: "matrx-user/notes",
};

describe("keeping a good Custom Agent run", () => {
  it("both actions are absent on an answer from a run with no mapping", () => {
    const ctx = ctxFor(undefined);
    expect(getAction("save-run-as-shortcut")?.visible?.(ctx)).toBe(false);
    expect(getAction("bind-run-to-page")?.visible?.(ctx)).toBe(false);
  });

  it("Save as shortcut opens THE shortcut editor window seeded with the run", () => {
    const dispatched: Array<{ payload?: { overlayId?: string; data?: { agentId?: string; seedId?: string } } }> = [];
    const ctx = ctxFor(mapping, dispatched);
    expect(getAction("save-run-as-shortcut")?.visible?.(ctx)).toBe(true);
    void getAction("save-run-as-shortcut")?.run(ctx);
    expect(dispatched[0]?.payload?.overlayId).toBe("shortcutEditorWindow");
    expect(dispatched[0]?.payload?.data?.agentId).toBe("agent-1");
    expect(typeof dispatched[0]?.payload?.data?.seedId).toBe("string");
  });

  it("Bind to this page opens the bind window with the agent and mapping, and only when the run has a page", () => {
    const dispatched: Array<{ payload?: { overlayId?: string; data?: Record<string, unknown> } }> = [];
    const ctx = ctxFor(mapping, dispatched);
    void getAction("bind-run-to-page")?.run(ctx);
    expect(dispatched[0]?.payload?.overlayId).toBe("surfaceAgentBindWindow");
    expect(dispatched[0]?.payload?.data).toEqual({
      surfaceName: "matrx-user/notes",
      initialAgentId: "agent-1",
      initialValueMappings: mapping.valueMappings,
    });
    expect(getAction("bind-run-to-page")?.visible?.(ctxFor({ ...mapping, surfaceName: null }))).toBe(false);
  });
});
