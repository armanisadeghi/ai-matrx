const mockRpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    schema: jest.fn(() => ({})),
  },
}));

jest.mock("uuid", () => ({ v4: () => "unused-generated-id" }));

import { configureStore } from "@reduxjs/toolkit";
import agentDefinitionReducer, {
  mergePartialAgent,
} from "@/features/agents/redux/agent-definition/slice";
import instanceModelOverridesReducer from "../../instance-model-overrides/instance-model-overrides.slice";
import { createManualInstance } from "../create-instance.thunk";

const AGENT_ID = "cold-resume-agent";
const CONVERSATION_ID = "cold-resume-conversation";

function makeStore() {
  return configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      instanceModelOverrides: instanceModelOverridesReducer,
    },
  });
}

describe("createManualInstance execution payload", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({
      data: [
        {
          id: AGENT_ID,
          variable_definitions: [],
          context_policies: [],
          settings: { temperature: 0.25 },
          tools: [],
          custom_tools: [],
          model_id: "model-loaded-before-snapshot",
          ui_gates: {},
        },
      ],
      error: null,
    });
  });

  it("loads the full agent before a cold execution-mode snapshot", async () => {
    const store = makeStore();
    store.dispatch(
      mergePartialAgent({
        id: AGENT_ID,
        agentType: "builtin",
        variableDefinitions: [],
        contextPolicies: [],
      }),
    );

    await store
      .dispatch(
        createManualInstance({
          agentId: AGENT_ID,
          conversationId: CONVERSATION_ID,
          apiEndpointMode: "agent",
        }),
      )
      .unwrap();

    expect(mockRpc).toHaveBeenCalledWith("agx_get_execution_full", {
      p_agent_id: AGENT_ID,
    });
    expect(
      store.getState().instanceModelOverrides.byConversationId[CONVERSATION_ID]
        ?.baseSettings,
    ).toEqual({
      temperature: 0.25,
      model: "model-loaded-before-snapshot",
    });
  });

  it("does not refetch over the live Agent Builder definition", async () => {
    const store = makeStore();
    store.dispatch(
      mergePartialAgent({
        id: AGENT_ID,
        agentType: "user",
        modelId: "unsaved-builder-model",
        settings: { temperature: 0.9 },
        variableDefinitions: [],
        contextPolicies: [],
      }),
    );

    await store
      .dispatch(
        createManualInstance({
          agentId: AGENT_ID,
          conversationId: CONVERSATION_ID,
          apiEndpointMode: "manual",
        }),
      )
      .unwrap();

    expect(mockRpc).not.toHaveBeenCalled();
  });
});
