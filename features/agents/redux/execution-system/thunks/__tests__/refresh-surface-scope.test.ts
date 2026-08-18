/**
 * Pins the MOUNT → SUBMIT surface refresh seam. The conversation already
 * exists before the provider's form value changes; refreshSurfaceScope must
 * read the provider at call time and apply a deliberately non-matching source
 * and agent-variable name through the real mapping/reducer path.
 */

jest.mock("uuid", () => ({ v4: () => "uuid-stub" }));

const mockFetchSurfaceBindingLayers = jest.fn();
jest.mock("@/features/surfaces/services/bind-agent-to-surface.service", () => ({
  fetchSurfaceBindingLayers: (...args: unknown[]) =>
    mockFetchSurfaceBindingLayers(...args),
}));

import { configureStore } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import conversationsReducer, {
  createInstance,
  patchConversation,
} from "../../conversations/conversations.slice";
import instanceVariableValuesReducer, {
  initInstanceVariables,
} from "../../instance-variable-values/instance-variable-values.slice";
import instanceContextReducer, {
  initInstanceContext,
} from "../../instance-context/instance-context.slice";
import instanceUIStateReducer, {
  initInstanceUIState,
} from "../../instance-ui-state/instance-ui-state.slice";
import { registerSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { refreshSurfaceScope } from "../refresh-surface-scope.thunk";

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
      sourceFeature: "agent-app",
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
      await (store.dispatch as unknown as AppDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();

      let state = store.getState() as unknown as RootState;
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.scopeValues.renamed_agent_input,
      ).toBe(liveInput);
      expect(
        state.instanceVariableValues.byConversationId[CONVERSATION_ID]
          ?.userValues,
      ).toEqual({});

      liveInput = "Matrx is the product name (not matrix) — second submit";
      await (store.dispatch as unknown as AppDispatch)(
        refreshSurfaceScope({ conversationId: CONVERSATION_ID }),
      ).unwrap();

      state = store.getState() as unknown as RootState;
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
      await (store.dispatch as unknown as AppDispatch)(
        refreshSurfaceScope({
          conversationId: CONVERSATION_ID,
          composerText: "What is on page 14?",
        }),
      ).unwrap();

      const state = store.getState() as unknown as RootState;
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
        (store.dispatch as unknown as AppDispatch)(
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
      (store.dispatch as unknown as AppDispatch)(
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
});
