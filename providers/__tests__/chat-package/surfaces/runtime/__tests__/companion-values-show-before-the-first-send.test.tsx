/**
 * THE SCREEN SHOWS WHAT WILL BE SENT — before the first send too.
 *
 * On /chat with a canvas item open, the main conversation (the page's OWN)
 * receives the canvas only at submit (`refreshSurfaceScope` →
 * `refreshCompanionScope`), so its composer's value list (chip, popover, full
 * view) showed no canvas values until the first turn had left.
 * `previewCompanionScope` writes the SAME entries ahead of the send, kept
 * current by `useCompanionValuesPreview` (registry changes + the canvas's
 * `announceSurfaceScopeChange`). The own-conversation guards hold: the page
 * itself is never written, and a conversation that is not the page's own is
 * untouched.
 *
 * Proven failing before passing: without the preview (the pre-fix tree) the
 * own conversation carries no `surface_chain` until a send, and every
 * "before the first send" case here is RED.
 *
 * Real manifests (jest.setup registers the app's), real registry, real thunks.
 */

jest.mock("uuid", () => ({ v4: () => "uuid-stub" }));
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import conversationsReducer, { createInstance } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import instanceVariableValuesReducer, { initInstanceVariables } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import instanceContextReducer, { initInstanceContext } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import instanceUIStateReducer, { initInstanceUIState } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { previewCompanionScope } from "@ai-matrx/chat/agents/redux/execution-system/thunks/refresh-surface-scope.thunk";
import {
  COMPANION_PREVIEW_SETTLE_MS,
  useCompanionValuesPreview,
} from "@ai-matrx/chat/agents/components/inputs/smart-input/useCompanionValuesPreview";
import { registerSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { announceSurfaceScopeChange } from "@ai-matrx/chat/surfaces/runtime/surface-chain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWN = "conv-main";
const OTHER = "conv-window";
const AGENT = "agent-1";
const ref = (id: string, label: string) => ({
  __kind: "resource_ref",
  resource_type: "html_page",
  resource_id: id,
  label,
});
const LAB = ref("3b0f6a52-8e1c-4f7d-9a2b-1c2d3e4f5a6b", "Mini Reaction Lab");
const TIMER = ref("4c1f7b63-9f2d-4e8a-8b3c-2d3e4f5a6b7c", "Kitchen Timer");

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
  for (const id of [OWN, OTHER]) {
    s.dispatch(createInstance({ conversationId: id, agentId: AGENT, agentType: "user", origin: "manual", sourceFeature: "chat" }));
    s.dispatch(initInstanceVariables({ conversationId: id, definitions: [] }));
    s.dispatch(initInstanceContext({ conversationId: id }));
    s.dispatch(initInstanceUIState({ conversationId: id, displayMode: "direct" }));
  }
  return s;
}

function mountChatPage() {
  return registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/chat",
      getScope: () => ({ conversation: { id: OWN, title: "My chat" } }),
      getOwnConversationId: () => OWN,
    },
    5,
  );
}

const canvasState = { current: LAB };
function mountCanvas() {
  return registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/canvas",
      getScope: () => ({
        current_canvas_item: canvasState.current,
        current_canvas_type: "iframe",
        current_canvas_is_saved: true,
        open_items: [{ title: canvasState.current.label, type: "iframe", is_current: true, item: canvasState.current }],
        item_count: 1,
        is_split: false,
        render_mode: "global",
      }),
    },
    1,
  );
}

type Entry = { value: unknown };
type Level = { surface: string; values: Record<string, { value: unknown }> };

function entriesOf(s: ReturnType<typeof store>, id: string) {
  return (s.getState() as unknown as ChatRootState).instanceContext.byConversationId[id] as Record<string, Entry>;
}
function chainOf(s: ReturnType<typeof store>, id: string): Level[] | undefined {
  return entriesOf(s, id).surface_chain?.value as Level[] | undefined;
}

describe("the composer's values show the companion canvas before the first send", () => {
  beforeEach(() => {
    canvasState.current = LAB;
  });

  it("the own conversation carries the canvas level — and only it — before any send", async () => {
    const s = store();
    const offPage = mountChatPage();
    const offCanvas = mountCanvas();
    try {
      expect(chainOf(s, OWN)).toBeUndefined();
      await (s.dispatch as unknown as ChatDispatch)(previewCompanionScope({ conversationId: OWN })).unwrap();
      const chain = chainOf(s, OWN)!;
      expect(chain.map((level) => level.surface)).toEqual(["matrx-user/canvas"]);
      expect(chain[0].values.current_canvas_item.value).toEqual(LAB);
      // Never the page itself.
      expect(entriesOf(s, OWN).conversation).toBeUndefined();
    } finally {
      offCanvas();
      offPage();
    }
  });

  it("a conversation that is not the page's own is never written by the preview", async () => {
    const s = store();
    const offPage = mountChatPage();
    const offCanvas = mountCanvas();
    try {
      const result = await (s.dispatch as unknown as ChatDispatch)(previewCompanionScope({ conversationId: OTHER })).unwrap();
      expect(result.refreshed).toBe(false);
      expect(entriesOf(s, OTHER).surface_chain).toBeUndefined();
    } finally {
      offCanvas();
      offPage();
    }
  });

  it("the composer's hook keeps it current: canvas opened, item switched, canvas closed", async () => {
    jest.useFakeTimers();
    const s = store();
    const offPage = mountChatPage();
    const container = document.createElement("div");
    const root = createRoot(container);
    function Composer() {
      useCompanionValuesPreview(OWN);
      return null;
    }
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(COMPANION_PREVIEW_SETTLE_MS + 1);
      });
      // The thunk awaits the surface chain read.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const canvas: { off: (() => void) | null } = { off: null };
    try {
      await act(async () => {
        root.render(
          <Provider store={s}>
            <Composer />
          </Provider>,
        );
      });
      await settle();
      expect(chainOf(s, OWN) ?? []).toEqual([]);

      // The canvas opens beside the chat: its values show before any send.
      await act(async () => {
        canvas.off = mountCanvas();
      });
      await settle();
      expect(chainOf(s, OWN)?.[0].values.current_canvas_item.value).toEqual(LAB);

      // The person switches the canvas tab: the canvas announces, the list follows.
      canvasState.current = TIMER;
      await act(async () => {
        announceSurfaceScopeChange();
      });
      await settle();
      expect(chainOf(s, OWN)?.[0].values.current_canvas_item.value).toEqual(TIMER);

      // The canvas goes away: its values go with it.
      await act(async () => {
        canvas.off?.();
        canvas.off = null;
      });
      await settle();
      expect(chainOf(s, OWN) ?? []).toEqual([]);
    } finally {
      canvas.off?.();
      await act(async () => root.unmount());
      offPage();
      jest.useRealTimers();
    }
  });
});
