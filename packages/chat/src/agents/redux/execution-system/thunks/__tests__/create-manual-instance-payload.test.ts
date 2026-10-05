const mockRpc = jest.fn();

jest.mock("../../../../../host/db", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    schema: jest.fn(() => ({})),
  },
}));

// A signed-in person: the fetch's sign-in gate reads the browser session, which
// this suite has no host for. Everything else is real.
jest.mock("../../../../../host/identity", () => ({
  ...jest.requireActual("../../../../../host/identity"),
  isSignedOutVisitor: async () => false,
}));
jest.mock("uuid", () => ({ v4: () => "unused-generated-id" }));

import { configureStore } from "@reduxjs/toolkit";
import agentDefinitionReducer, {
  mergePartialAgent,
} from "../../../agent-definition/slice";
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
          is_version: false,
          version_id: null,
          name: "Cold resume agent",
          description: null,
          variable_definitions: [],
          context_policies: [],
          auto_context_disabled: false,
          model_id: "model-loaded-before-snapshot",
          ui_gates: {},
          tool_ids: [],
          access_level: "owner",
        },
      ],
      error: null,
    });
  });

  // P24: the cold snapshot reads the RUN TIER (never the definition), so the
  // base is the default model alone and the override delta is the touched keys.
  it("loads the run tier before a cold execution-mode snapshot", async () => {
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

    expect(mockRpc).toHaveBeenCalledWith("agx_get_run_tier", {
      p_agent_id: AGENT_ID,
    });
    expect(mockRpc).not.toHaveBeenCalledWith(
      "agx_get_execution_full",
      expect.anything(),
    );
    expect(
      store.getState().instanceModelOverrides.byConversationId[CONVERSATION_ID]
        ?.baseSettings,
    ).toEqual({
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
