import type { RootState } from "@/lib/redux/store";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";

const initialState = createSlimRootReducer()(undefined, { type: "test/init" });
const mockMessages: Record<string, { role: string; text: string }[]> = {};
const mockInstances: Record<string, { status: string }> = {};
const mockRuns: Record<string, Record<string, unknown>> = {};

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectConversationMessages: (conversationId: string) => () =>
      mockMessages[conversationId],
    extractFlatText: (message: { text: string }) => message.text,
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({
    selectInstance: (conversationId: string) => () =>
      mockInstances[conversationId],
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({
    selectIsExecuting: (id: string) => () => mockRuns[id].running,
    selectLatestAnswerText: (id: string) => () => mockRuns[id].answer,
    selectLatestCompletion: (id: string) => () => mockRuns[id].completion,
    selectLatestError: (id: string) => () => mockRuns[id].error,
    selectLatestRequestStatus: (id: string) => () => mockRuns[id].status,
  }),
);

import { buildModelBattleScope } from "./model-surface-scope";

function stateFixture(revealed: boolean): RootState {
  mockMessages["conversation-a"] = [
    { role: "user", text: "Compare this" },
    { role: "tool", text: "hidden tool frame" },
    { role: "assistant", text: "stale partial" },
  ];
  mockInstances["conversation-a"] = { status: "complete" };
  mockRuns["conversation-a"] = {
    running: false,
    answer: "effective streamed answer",
    completion: { cost: 0.02 },
    error: { message: "Anthropic provider failed" },
    status: "failed",
  };
  return {
    ...initialState,
    agentComparisonModel: {
      ...initialState.agentComparisonModel,
      locked: { agentId: null, agentVersion: null, agentVersionId: null },
      inputConversationId: null,
      columns: [
        {
          columnId: "column-a",
          conversationId: "conversation-a",
          label: "Claude",
          collapsed: false,
        },
      ],
      activeSetId: "set-gpt-vs-claude",
      activeSetName: "GPT vs Claude",
      isSubmittingAll: false,
    },
    agentComparison: {
      ...initialState.agentComparison,
      blind: { enabled: true, active: true, revealed, order: ["column-a"] },
      feedbackByConversation: {
        "conversation-a": {
          rating: "up",
          overall: 5,
          rank: 1,
          scores: { accuracy: 5 },
          comment: "Clear evidence.",
        },
      },
    },
    instanceResources: {
      ...initialState.instanceResources,
      byConversationId: {},
    },
    instanceModelOverrides: {
      byConversationId: {
        "conversation-a": {
          conversationId: "conversation-a",
          baseSettings: { model: "claude-3" },
          overrides: {},
          removals: [],
        },
      },
    },
  };
}

describe("buildModelBattleScope blind projection", () => {
  it("masks set, identity, provider error, and metrics while retaining anonymous evidence", () => {
    const scope = buildModelBattleScope(stateFixture(false));
    if (!Array.isArray(scope.model_outcomes))
      throw new Error("Expected model outcomes");
    const outcome = scope.model_outcomes[0];

    expect(scope.comparison_set).toBeUndefined();
    expect(outcome).toMatchObject({
      column_label: "Response A",
      failed: true,
      feedback: { scores: { accuracy: 5 }, note: "Clear evidence." },
    });
    expect(outcome).not.toHaveProperty("column_id");
    expect(outcome).not.toHaveProperty("conversation_id");
    expect(outcome).not.toHaveProperty("model");
    expect(outcome).not.toHaveProperty("completion_metrics");
    expect(outcome).not.toHaveProperty("error_message");
    expect(outcome.transcript).toEqual([
      { role: "user", text: "Compare this" },
      { role: "assistant", text: "effective streamed answer" },
    ]);
  });

  it("restores identity, set linkage, effective base model, and metrics after reveal", () => {
    const scope = buildModelBattleScope(stateFixture(true));
    if (!Array.isArray(scope.model_outcomes))
      throw new Error("Expected model outcomes");
    const outcome = scope.model_outcomes[0];

    expect(scope.comparison_set).toEqual({
      id: "set-gpt-vs-claude",
      name: "GPT vs Claude",
    });
    expect(outcome).toMatchObject({
      column_id: "column-a",
      conversation_id: "conversation-a",
      model: { id: "claude-3", label: "claude-3" },
      completion_metrics: { cost: 0.02 },
      error_message: "Anthropic provider failed",
    });
  });
});
