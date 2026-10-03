/**
 * THE CANVAS FOLLOWS WHICHEVER CONVERSATION IS BESIDE IT — the page's own included.
 *
 * Live 2026-10-03, /chat with an HTML page open in the canvas: the main
 * conversation is the page's OWN, so every surface was kept from it — the
 * canvas too, which is not the page. It had no reference to read and no
 * write target, and answered "the heading has been updated" for an edit it
 * never made. The canvas is a COMPANION (`SurfaceManifest.companion`): the own
 * conversation receives it, and only it — never the page that owns it.
 *
 * Real manifests (jest.setup registers the app's), real registry, real thunk.
 */

jest.mock("uuid", () => ({ v4: () => "uuid-stub" }));
jest.mock("../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

import { configureStore } from "@reduxjs/toolkit";
import type { ChatDispatch, ChatRootState } from "../../../store/root-state";
import conversationsReducer, { createInstance } from "../../../agents/redux/execution-system/conversations/conversations.slice";
import instanceVariableValuesReducer, { initInstanceVariables } from "../../../agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import instanceContextReducer, { initInstanceContext } from "../../../agents/redux/execution-system/instance-context/instance-context.slice";
import instanceUIStateReducer, { initInstanceUIState } from "../../../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { refreshSurfaceScope } from "../../../agents/redux/execution-system/thunks/refresh-surface-scope.thunk";
import { pageContextFor } from "../../../agents/redux/execution-system/context-rules/request-context";
import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import { isCompanionSurface } from "../surface-chain";

const CONV = "conv-main";
const AGENT = "agent-1";
const REF = {
  __kind: "resource_ref",
  resource_type: "html_page",
  resource_id: "3b0f6a52-8e1c-4f7d-9a2b-1c2d3e4f5a6b",
  label: "Mini Reaction Lab",
};

function store() {
  const s = configureStore({
    reducer: {
      conversations: conversationsReducer,
      instanceVariableValues: instanceVariableValuesReducer,
      instanceContext: instanceContextReducer,
      instanceUIState: instanceUIStateReducer,
      agentDefinition: (state = { agents: { [AGENT]: { id: AGENT, name: "Chat", contextPolicies: [] } } }) => state,
      agentShortcut: (state = { shortcuts: {} }) => state,
    },
  });
  s.dispatch(createInstance({ conversationId: CONV, agentId: AGENT, agentType: "user", origin: "manual", sourceFeature: "chat" }));
  s.dispatch(initInstanceVariables({ conversationId: CONV, definitions: [] }));
  s.dispatch(initInstanceContext({ conversationId: CONV }));
  s.dispatch(initInstanceUIState({ conversationId: CONV, displayMode: "direct" }));
  return s;
}

function mountChatPage() {
  return registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/chat",
      getScope: () => ({ conversation: { id: CONV, title: "My chat" } }),
      getOwnConversationId: () => CONV,
    },
    5,
  );
}

function mountCanvas() {
  return registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/canvas",
      getScope: () => ({
        current_canvas_item: REF,
        current_canvas_type: "iframe",
        current_canvas_is_saved: true,
        open_items: [{ title: "Mini Reaction Lab", type: "iframe", is_current: true, item: REF }],
        item_count: 1,
        is_split: false,
        render_mode: "global",
      }),
    },
    1,
  );
}

type Entry = { value: unknown };

describe("a page's own conversation receives the companion canvas, never the page", () => {
  it("the canvas is a companion surface; the chat page is not", () => {
    expect(isCompanionSurface("matrx-user/canvas")).toBe(true);
    expect(isCompanionSurface("matrx-user/chat")).toBe(false);
  });

  it("each turn carries the canvas level — and only it", async () => {
    const s = store();
    const offPage = mountChatPage();
    const offCanvas = mountCanvas();
    try {
      await (s.dispatch as unknown as ChatDispatch)(refreshSurfaceScope({ conversationId: CONV })).unwrap();
      const entries = (s.getState() as unknown as ChatRootState).instanceContext.byConversationId[CONV] as Record<string, Entry>;
      const chain = entries.surface_chain?.value as Array<{ surface: string; values: Record<string, { value: unknown }> }>;
      expect(chain.map((level) => level.surface)).toEqual(["matrx-user/canvas"]);
      expect(chain[0].values.current_canvas_item.value).toEqual(REF);
      expect(entries.conversation).toBeUndefined();
      // The page rule lets the chain through while the canvas is open...
      expect(pageContextFor(s.getState() as unknown as ChatRootState, CONV)?.withheld).not.toContain("surface_chain");
    } finally {
      offCanvas();
    }
    // ...and withholds it again once the canvas is gone.
    expect(pageContextFor(s.getState() as unknown as ChatRootState, CONV)?.withheld).toContain("surface_chain");
    offPage();
  });
});
