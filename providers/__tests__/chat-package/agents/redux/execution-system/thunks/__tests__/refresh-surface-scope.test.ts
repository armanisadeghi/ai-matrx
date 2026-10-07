/**
 * Pins the MOUNT → SUBMIT surface refresh seam. The conversation already
 * exists before the provider's form value changes; refreshSurfaceScope must
 * read the provider at call time and apply a deliberately non-matching source
 * and agent-variable name through the real mapping/reducer path.
 */

jest.mock("uuid", () => ({ v4: () => "uuid-stub" }));
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

const mockFetchSurfaceBindingLayers = jest.fn();
jest.mock("@ai-matrx/chat/surfaces/services/bind-agent-to-surface.service", () => ({
  fetchSurfaceBindingLayers: (...args: unknown[]) =>
    mockFetchSurfaceBindingLayers(...args),
}));

import { configureStore } from "@reduxjs/toolkit";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import conversationsReducer, {
  createInstance,
  patchConversation,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import instanceVariableValuesReducer, {
  initInstanceVariables,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import instanceContextReducer, {
  initInstanceContext,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import instanceUIStateReducer, {
  initInstanceUIState,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { registerSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { refreshSurfaceScope } from "@ai-matrx/chat/agents/redux/execution-system/thunks/refresh-surface-scope.thunk";

const CONVERSATION_ID = "conversation-1";
const AGENT_ID = "agent-1";
const SURFACE_NAME = "matrx-public/p";

const agent = {
  id: AGENT_ID,
  name: "Surface mapping reporter",
  contextPolicies: [],
};

function makeStore() {
  return configureStore({
    reducer: {
      conversations: conversationsReducer,
      instanceVariableValues: instanceVariableValuesReducer,
      instanceContext: instanceContextReducer,
      instanceUIState: instanceUIStateReducer,
      agentDefinition: (state = { agents: { [AGENT_ID]: agent } }) => state,
      agentShortcut: (state = { shortcuts: {} }) => state,
    },
  });
}

function seedConversation(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: AGENT_ID,
      agentType: "user",
      origin: "manual",
      sourceFeature: "applet",
    }),
  );
  store.dispatch(
    initInstanceVariables({
      conversationId: CONVERSATION_ID,
      definitions: [
        {
          name: "renamed_agent_input",
          required: false,
          defaultValue: null,
        },
      ],
    }),
  );
  store.dispatch(initInstanceContext({ conversationId: CONVERSATION_ID }));
  store.dispatch(
    initInstanceUIState({
      conversationId: CONVERSATION_ID,
      displayMode: "direct",
    }),
  );
  store.dispatch(
    patchConversation({
      conversationId: CONVERSATION_ID,
      surfaceName: SURFACE_NAME,
    }),
  );
}

describe("refreshSurfaceScope — live provider values at submit", () => {
  beforeEach(() => {
    mockFetchSurfaceBindingLayers.mockReset();
    mockFetchSurfaceBindingLayers.mockResolvedValue([
      {
        name: "binding:global",
        mappings: {
          renamed_agent_input: {
            mapType: "surface_value",
            target: "user_input",
          },
        },
        writePolicies: {},
      },
    ]);
  });

  test("re-reads and replaces a non-name-matched value without recreating the conversation", async () => {
    const store = makeStore();
    seedConversation(store);
    let liveInput = "Matrx is the product name (not matrix) — first submit";
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: SURFACE_NAME,
        getScope: () => ({ user_input: liveInput }),
      },
      1,
    );

    try {
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();

      let state = store.getState() as unknown as ChatRootState;
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.scopeValues.renamed_agent_input,
      ).toBe(liveInput);
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.userValues,
      ).toEqual({});

      liveInput = "Matrx is the product name (not matrix) — second submit";
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();

      state = store.getState() as unknown as ChatRootState;
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.scopeValues.renamed_agent_input,
      ).toBe(liveInput);
      expect(
        state.conversations.byConversationId[CONVERSATION_ID]?.conversationId,
      ).toBe(CONVERSATION_ID);
      expect(mockFetchSurfaceBindingLayers).toHaveBeenCalledTimes(2);
    } finally {
      unregister();
    }
  });

  test("awaits surface preparation before reading the scope", async () => {
    const store = makeStore();
    seedConversation(store);
    let preparedValue = "not prepared";
    const beforeExecute = jest.fn(async ({ composerText }) => {
      await Promise.resolve();
      preparedValue = `retrieved for: ${composerText}`;
      return {
        contextEntries: [
          {
            key: "study_material",
            value: "retrieved page 14 evidence",
            type: "text" as const,
            label: "Study material",
          },
        ],
      };
    });
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: SURFACE_NAME,
        beforeExecute,
        getScope: () => ({ user_input: preparedValue }),
      },
      1,
    );

    try {
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({
          conversationId: CONVERSATION_ID,
          composerText: "What is on page 14?",
        }),
      ).unwrap();

      const state = store.getState() as unknown as ChatRootState;
      expect(beforeExecute).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        composerText: "What is on page 14?",
      });
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.scopeValues.renamed_agent_input,
      ).toBe("retrieved for: What is on page 14?");
      expect(
        state.instanceContext.byConversationId[CONVERSATION_ID]?.study_material
          ?.value,
      ).toBe("retrieved page 14 evidence");
    } finally {
      unregister();
    }
  });

  test("fails closed before reading or mapping scope when preparation fails", async () => {
    const store = makeStore();
    seedConversation(store);
    const getScope = jest.fn(() => ({ user_input: "must not be read" }));
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: SURFACE_NAME,
        beforeExecute: async () => {
          throw new Error("retrieval unavailable");
        },
        getScope,
      },
      1,
    );

    try {
      await expect(
        (store.dispatch as unknown as ChatDispatch)(
          refreshSurfaceScope({
            conversationId: CONVERSATION_ID,
            composerText: "Keep this draft intact",
          }),
        ).unwrap(),
      ).rejects.toMatchObject({
        message: "Nothing was sent. retrieval unavailable",
      });
      expect(getScope).not.toHaveBeenCalled();
      expect(mockFetchSurfaceBindingLayers).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test("fails closed when a preparation-required surface has no live provider", async () => {
    const store = makeStore();
    seedConversation(store);
    store.dispatch(
      patchConversation({
        conversationId: CONVERSATION_ID,
        surfaceName: "matrx-user/education-tutor",
      }),
    );

    await expect(
      (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({
          conversationId: CONVERSATION_ID,
          composerText: "Do not send without current evidence",
        }),
      ).unwrap(),
    ).rejects.toMatchObject({
      message: expect.stringContaining("current-turn evidence can be prepared"),
    });
    expect(mockFetchSurfaceBindingLayers).not.toHaveBeenCalled();
  });

  test("a screen that closed since launch stops sending its old values; what is open now is sent instead", async () => {
    const store = makeStore();
    seedConversation(store);
    store.dispatch(
      patchConversation({ conversationId: CONVERSATION_ID, surfaceName: "matrx-user/table-settings" }),
    );
    // The window was open when the conversation started, then closed.
    const closeWindow = registerSurfaceRuntime(
      { surfaceName: "matrx-user/table-settings", layer: true, getScope: () => ({ settings_tab: "actions" }) },
      1001,
    );
    closeWindow();
    const unregisterPage = registerSurfaceRuntime(
      { surfaceName: "matrx-user/data-tables", getScope: () => ({ table_name: "Warehouse inventory" }) },
      1,
    );
    try {
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();
      const entries =
        (store.getState() as unknown as ChatRootState).instanceContext.byConversationId[CONVERSATION_ID] ?? {};
      expect(String(entries.surface_closed?.value)).toContain("has been closed");
      const chain = entries.surface_chain?.value as Array<{ surface: string }>;
      expect(chain.map((level) => level.surface)).toEqual(["matrx-user/data-tables"]);
      expect(entries.settings_tab).toBeUndefined();
    } finally {
      unregisterPage();
    }
  });

  // Break this catches: a Board side chat stamped with the TILE's surface while
  // the tile was live; the tile went dormant, so the next turn was told "Data
  // Tables ... has been closed" and carried no Board scope — the agent never saw
  // board_items and reached for knowledge_search instead of board_open_item.
  test("a tile that went dormant hands the conversation back to the Board that still holds it", async () => {
    const store = makeStore();
    seedConversation(store);
    const BOARD = "matrx-user/board";
    const TILE = "matrx-user/data-tables";
    store.dispatch(patchConversation({ conversationId: CONVERSATION_ID, surfaceName: TILE }));
    const unregisterBoard = registerSurfaceRuntime(
      { surfaceName: BOARD, getScope: () => ({ board_title: "My board", board_items: { item_count: 2 } }) },
      1,
    );
    const closeTile = registerSurfaceRuntime(
      { surfaceName: TILE, getScope: () => ({ table_name: "Site palette" }) },
      2,
    );
    closeTile(); // the person selected another tile (or none)
    try {
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();
      const state = store.getState() as unknown as ChatRootState;
      expect(state.conversations.byConversationId[CONVERSATION_ID]?.surfaceName).toBe(BOARD);
      const entries = state.instanceContext.byConversationId[CONVERSATION_ID] ?? {};
      expect(entries.surface_closed).toBeUndefined();
    } finally {
      unregisterBoard();
    }
  });

  // Break this catches: one board tile's getScope throwing (a notes tile whose
  // scope merge failed) aborted every agent launch on the board with "Nothing
  // was sent" (live 2026-10-05). The tile's failure is announced; the Board's
  // values still go.
  test("a live tile whose scope cannot be read does not stop the send; the Board's values go and the person is told", async () => {
    const store = makeStore();
    seedConversation(store);
    const BOARD = "matrx-user/board";
    const TILE = "matrx-user/notes";
    store.dispatch(patchConversation({ conversationId: CONVERSATION_ID, surfaceName: TILE }));
    const unregisterBoard = registerSurfaceRuntime(
      { surfaceName: BOARD, getScope: () => ({ board_title: "My board" }) },
      1,
    );
    const unregisterTile = registerSurfaceRuntime(
      {
        surfaceName: TILE,
        getScope: () => {
          throw new Error("tried to replace the provider-owned value");
        },
      },
      2,
    );
    const { toast } = jest.requireMock("@ai-matrx/chat/host/notify");
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await (store.dispatch as unknown as ChatDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();
      const state = store.getState() as unknown as ChatRootState;
      expect(state.conversations.byConversationId[CONVERSATION_ID]?.surfaceName).toBe(BOARD);
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Sent without them"));
    } finally {
      unregisterTile();
      unregisterBoard();
      jest.restoreAllMocks();
    }
  });

  // Break this catches: refreshSurfaceScope writing `surface_closed` ("Chat …
  // has been closed") into the page's OWN conversation while a route swap
  // (/chat/new → /chat/<id>) has the page's provider momentarily unmounted —
  // seen live on the clone (receipts of conversations 04f6c64c…, 6fedadd6…).
  test("a page's own conversation never hears its page closed during a route swap", async () => {
    const store = makeStore();
    seedConversation(store);
    store.dispatch(
      patchConversation({ conversationId: CONVERSATION_ID, surfaceName: "matrx-user/chat" }),
    );
    // /chat/new's provider owned this conversation, then unmounted for the swap.
    const newChatPage = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/chat",
        getScope: () => ({ conversation: { title: "Thanksgiving question" } }),
        getOwnConversationId: () => CONVERSATION_ID,
      },
      1,
    );
    // The page registers → the platform learns it owns this conversation.
    const { isPageOwnConversation } = await import("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext");
    expect(isPageOwnConversation(CONVERSATION_ID)).toBe(true);
    newChatPage();

    const result = await (store.dispatch as unknown as ChatDispatch)(
      refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
    ).unwrap();
    const entries =
      (store.getState() as unknown as ChatRootState).instanceContext.byConversationId[CONVERSATION_ID] ?? {};
    expect(entries.surface_closed).toBeUndefined();
    expect(result.reason).toBe("own_page_conversation");
  });
});
