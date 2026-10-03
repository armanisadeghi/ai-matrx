/**
 * A REOPENED CHAT KEEPS WHAT IS ON SCREEN (2026-10-03).
 *
 * Use case: on the Knowledge page a person opens the transcript "Monday team
 * huddle", chats about it (the chip: "Transcripts 28/31"), reloads, and
 * reopens the chat. The route maps to `matrx-user/knowledge`, but only the
 * transcript viewer (`matrx-user/transcripts`) is mounted. The reopened chat
 * followed the route-derived name, `refreshSurfaceScope` found no provider for
 * it and returned `no_provider` — the chip fell to "Knowledge System 4" and
 * every transcript value vanished without a word.
 *
 * Now a route-derived surface with no provider never outranks the runtime
 * that IS mounted (the one a fresh launch adopts), and a refresh that finds no
 * provider for its stamp says so and re-reads the mounted runtime.
 *
 * SUT: the real `useActivePageSurface`, the real global runtime registry, the
 * real `refreshSurfaceScope` over the real slices.
 */

jest.mock("uuid", () => ({ v4: () => "uuid-stub" }));
jest.mock("../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
let mockPathname = "/knowledge/transcripts/ccbb5b7f-6bad-4fb1-9149-35593d5865ed";
jest.mock("../../../host/navigation", () => ({
  usePathname: () => mockPathname,
}));
jest.mock("../../services/bind-agent-to-surface.service", () => ({
  fetchSurfaceBindingLayers: async () => [],
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import type { ChatDispatch, ChatRootState } from "../../../store/root-state";
import conversationsReducer, {
  createInstance,
  patchConversation,
} from "../../../agents/redux/execution-system/conversations/conversations.slice";
import instanceVariableValuesReducer, {
  initInstanceVariables,
} from "../../../agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import instanceContextReducer, {
  initInstanceContext,
} from "../../../agents/redux/execution-system/instance-context/instance-context.slice";
import instanceUIStateReducer, {
  initInstanceUIState,
} from "../../../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { refreshSurfaceScope } from "../../../agents/redux/execution-system/thunks/refresh-surface-scope.thunk";
import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import { useActivePageSurface } from "../useActivePageSurface";

const KNOWLEDGE = "matrx-user/knowledge";
const TRANSCRIPTS = "matrx-user/transcripts";
const TRANSCRIPT_SCOPE = {
  transcript_title: "Monday team huddle — Cedar Ridge PT",
  transcript_is_draft: false,
  playback_speed: 1,
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function activeSurface(): string | null {
  let seen: string | null = "unset";
  function Probe() {
    seen = useActivePageSurface().surfaceName;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  return seen;
}

function storeStampedWith(surfaceName: string) {
  const store = configureStore({
    reducer: {
      conversations: conversationsReducer,
      instanceVariableValues: instanceVariableValuesReducer,
      instanceContext: instanceContextReducer,
      instanceUIState: instanceUIStateReducer,
      agentDefinition: (s = { agents: { a1: { id: "a1", name: "General Chat", contextPolicies: [] } } }) => s,
      agentShortcut: (s = { shortcuts: {} }) => s,
    },
  });
  store.dispatch(
    createInstance({ conversationId: "c1", agentId: "a1", agentType: "user", origin: "manual", sourceFeature: "chat" }),
  );
  store.dispatch(initInstanceVariables({ conversationId: "c1", definitions: [] }));
  store.dispatch(initInstanceContext({ conversationId: "c1" }));
  store.dispatch(initInstanceUIState({ conversationId: "c1", displayMode: "direct" }));
  store.dispatch(patchConversation({ conversationId: "c1", surfaceName }));
  return store;
}

describe("a refresh whose stamped surface has no provider on this page", () => {
  it("announces it and re-reads the mounted runtime instead of dropping the page's values", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const unregister = registerSurfaceRuntime({ surfaceName: TRANSCRIPTS, getScope: () => TRANSCRIPT_SCOPE }, 2);
    try {
      const store = storeStampedWith(KNOWLEDGE);
      const result = await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: "c1" }),
      ).unwrap();
      const state = store.getState() as unknown as ChatRootState;
      expect(result.refreshed).toBe(true);
      expect(state.conversations.byConversationId.c1?.surfaceName).toBe(TRANSCRIPTS);
      const title = state.instanceContext.byConversationId.c1?.transcript_title;
      expect(title?.value).toBe(TRANSCRIPT_SCOPE.transcript_title);
      expect(title?.surfaceName).toBe(TRANSCRIPTS);
      expect(warn.mock.calls.some(([m]) => String(m).includes(`"${KNOWLEDGE}" has no live provider`))).toBe(true);
    } finally {
      unregister();
      warn.mockRestore();
    }
  });
});

// After the refresh: mounting the Knowledge page's own provider below marks it
// mounted this session, which turns a later missing provider into a CLOSED screen.
describe("the page a reopened chat follows", () => {
  it("is the mounted transcript viewer, not the Knowledge route with nothing mounted", () => {
    const unregister = registerSurfaceRuntime({ surfaceName: TRANSCRIPTS, getScope: () => TRANSCRIPT_SCOPE }, 2);
    try {
      expect(activeSurface()).toBe(TRANSCRIPTS);
    } finally {
      unregister();
    }
  });

  it("is still the route's page when the route's own provider is mounted", () => {
    const page = registerSurfaceRuntime({ surfaceName: KNOWLEDGE, getScope: () => ({}) }, 1);
    const viewer = registerSurfaceRuntime({ surfaceName: TRANSCRIPTS, getScope: () => TRANSCRIPT_SCOPE }, 2);
    try {
      expect(activeSurface()).toBe(KNOWLEDGE);
    } finally {
      viewer();
      page();
    }
  });
});
