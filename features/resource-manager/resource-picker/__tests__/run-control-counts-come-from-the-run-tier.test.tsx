/**
 * THE ATTACH MENU'S COUNTS SHOW ON LOAD, FROM THE RUN TIER (P24b).
 *
 * `useRunControlCounts` is mounted on every chat page. It must show the Tools
 * and Skills numbers as soon as the agent's RUN TIER (`agx_get_run_tier`) has
 * loaded — the run tier carries plain counts for custom tools and skills — and
 * it must never read the full definition (`agx_get_execution_full`) to get them.
 * Real hook, real thunks, real reducers; only the Supabase client is a double.
 */
const mockRpc = jest.fn();
jest.mock("@ai-matrx/chat/host/db", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    schema: () => ({
      from: () => {
        throw new Error("the counts read a table directly");
      },
    }),
  },
}));
jest.mock("@ai-matrx/chat/host/identity", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/identity"),
  isSignedOutVisitor: async () => false,
}));

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import agentDefinitionReducer from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import {
  useRunControlCounts,
  type RunControlCounts,
} from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useRunControlCounts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_ID = "harbor-front-desk-helper";
const CONVERSATION_ID = "conv-counts";

function makeStore() {
  return configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      conversations: (
        state = {
          byConversationId: { [CONVERSATION_ID]: { agentId: AGENT_ID } },
        },
      ) => state,
      instanceUIState: (
        state = {
          byConversationId: {
            [CONVERSATION_ID]: {
              builderAdvancedSettings: {
                addedTools: ["added-tool"],
                addedSkills: ["added-skill"],
              },
            },
          },
        },
      ) => state,
    },
  });
}

describe("run-control counts come from the run tier", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (name: string) =>
      name === "agx_get_run_tier"
        ? {
            data: [
              {
                id: AGENT_ID,
                is_version: false,
                version_id: null,
                name: "Harbor front desk helper",
                description: null,
                variable_definitions: [],
                context_policies: [],
                auto_context_disabled: false,
                model_id: "default-model",
                ui_gates: {},
                tool_ids: ["tool-a", "tool-b"],
                access_level: "owner",
                custom_tool_count: 2,
                skill_count: 3,
                connection_count: 1,
              },
            ],
            error: null,
          }
        : { data: [], error: null },
    );
  });

  it("shows Tools and Skills on load without fetching the definition", async () => {
    const store = makeStore();
    const seen: { current: RunControlCounts } = { current: {} };
    function Probe() {
      seen.current = useRunControlCounts(CONVERSATION_ID);
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Provider store={store}>
          <Probe />
        </Provider>,
      );
    });
    // Let the run-tier read settle and the hook re-render.
    for (let i = 0; i < 5 && seen.current.tools === undefined; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    const result = seen;

    // 2 built-in + 1 added + 2 custom (from the run tier's count).
    expect(result.current.tools).toBe(5);
    // 3 active skills (run tier) + 1 per-run add.
    expect(result.current.skills).toBe(4);
    const names = mockRpc.mock.calls.map((c) => String(c[0]));
    expect(names).toContain("agx_get_run_tier");
    expect(names).not.toContain("agx_get_execution_full");
    expect(names).not.toContain("agx_get_execution_minimal");
  });
});
