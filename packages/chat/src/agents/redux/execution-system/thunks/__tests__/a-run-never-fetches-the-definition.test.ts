/**
 * A RUN NEVER FETCHES THE DEFINITION (PACKAGE-INDEPENDENCE §3, P24).
 *
 * The agent definition has three tiers: the list (pickers), the RUN TIER
 * (`agx_get_run_tier` — variables, context rules, default model, input gates,
 * tool ids, access level) and the full definition (settings, messages, custom
 * tool bodies, output schema) which only the builder reads. The server loads
 * the agent itself and owns the merge of `config_overrides` (P23, verified on
 * live 2026-10-05), so a run that pulls the definition into the browser is
 * paying for — and exposing — data it never uses.
 *
 * This drives the REAL instance factory and the REAL fetch thunks against a
 * recording Supabase double and asserts the only read is the run tier: never
 * `agx_get_execution_full`, never `agx_get_execution_minimal`, never
 * `agent.definition select *`. The base settings an instance snapshots are the
 * default model only, so the override delta is exactly the touched keys.
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("../../../../../host/db", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    schema: jest.fn(() => ({
      from: (...args: unknown[]) => {
        mockFrom(...args);
        throw new Error("a run read a table directly");
      },
    })),
    from: (...args: unknown[]) => {
      mockFrom(...args);
      throw new Error("a run read a table directly");
    },
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
import { hasField } from "@ai-matrx/agents/field-flags";
import agentDefinitionReducer, {
  mergePartialAgent,
} from "../../../agent-definition/slice";
import {
  fetchAgentExecutionMinimal,
  fetchAgentRunTier,
} from "../../../agent-definition/thunks";
import { selectAgentRunTier } from "../../../agent-definition/selectors";
import instanceModelOverridesReducer from "../../instance-model-overrides/instance-model-overrides.slice";
import { createManualInstance } from "../create-instance.thunk";
import type { ChatDispatch } from "../../../../../store/root-state";

const AGENT_ID = "harbor-front-desk-helper";
const CONVERSATION_ID = "run-tier-conversation";

const RUN_TIER_ROW = {
  id: AGENT_ID,
  is_version: false,
  version_id: null,
  name: "Harbor front desk helper",
  description: "Answers the front desk",
  variable_definitions: [],
  context_policies: [],
  auto_context_disabled: false,
  model_id: "default-model",
  ui_gates: { file_urls: true },
  tool_ids: ["tool-a"],
  access_level: "viewer",
};

const DEFINITION_READS = [
  "agx_get_execution_full",
  "agx_get_execution_minimal",
];

function makeStore() {
  return configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      instanceModelOverrides: instanceModelOverridesReducer,
    },
  });
}

/** The thunks are typed against the whole chat store; this suite mounts two slices. */
function dispatchOf(store: ReturnType<typeof makeStore>): ChatDispatch {
  return store.dispatch as unknown as ChatDispatch;
}

function rpcNames(): string[] {
  return mockRpc.mock.calls.map((call) => String(call[0]));
}

describe("a run never fetches the definition", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockRpc.mockImplementation(async (name: string) =>
      name === "agx_get_run_tier"
        ? { data: [RUN_TIER_ROW], error: null }
        : {
            data: [
              {
                ...RUN_TIER_ROW,
                settings: { temperature: 0.25 },
                tools: [],
                custom_tools: [],
              },
            ],
            error: null,
          },
    );
  });

  it("a cold run reads the run tier and snapshots only the default model", async () => {
    const store = makeStore();
    // A list-only record: no model loaded yet — the cold-resume / shared-host case.
    store.dispatch(
      mergePartialAgent({ id: AGENT_ID, agentType: "user", name: "Harbor" }),
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

    expect(rpcNames()).toEqual(["agx_get_run_tier"]);
    expect(mockRpc).toHaveBeenCalledWith("agx_get_run_tier", {
      p_agent_id: AGENT_ID,
    });
    for (const read of DEFINITION_READS) expect(rpcNames()).not.toContain(read);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(
      store.getState().instanceModelOverrides.byConversationId[CONVERSATION_ID]
        ?.baseSettings,
    ).toEqual({ model: "default-model" });
  });

  it("the pre-P24 'minimal' name is the run tier too", async () => {
    const store = makeStore();
    await dispatchOf(store)(fetchAgentExecutionMinimal(AGENT_ID)).unwrap();

    expect(rpcNames()).toEqual(["agx_get_run_tier"]);
    const tier = selectAgentRunTier(store.getState() as never, AGENT_ID);
    expect(tier.isReady).toBe(true);
    expect(tier.modelId).toBe("default-model");
    expect(tier.toolIds).toEqual(["tool-a"]);
    // The definition's settings were never read.
    const record = store.getState().agentDefinition.agents[AGENT_ID];
    expect(hasField(record?._loadedFields, "settings")).toBe(false);
    expect(hasField(record?._loadedFields, "customTools")).toBe(false);
  });

  it("a ready run tier is not refetched; a forced refresh refetches it", async () => {
    const store = makeStore();
    const dispatch = dispatchOf(store);
    await dispatch(fetchAgentRunTier(AGENT_ID)).unwrap();
    await dispatch(fetchAgentRunTier(AGENT_ID)).unwrap();
    expect(rpcNames()).toEqual(["agx_get_run_tier"]);

    await dispatch(fetchAgentRunTier({ agentId: AGENT_ID, force: true })).unwrap();
    expect(rpcNames()).toEqual(["agx_get_run_tier", "agx_get_run_tier"]);
  });
});
