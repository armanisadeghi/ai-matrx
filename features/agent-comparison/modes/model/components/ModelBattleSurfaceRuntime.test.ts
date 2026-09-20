import { CHAT_INPUT_DRAFT_MAX } from "@/features/surfaces/manifests/chat.manifest";
import type { RootState } from "@/lib/redux/store";
import { initInstanceUserInput } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { initInstanceVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { createInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createModelBattleWriteHandlers } from "./ModelBattleSurfaceRuntime";

const reducer = createSlimRootReducer();
const initialState = reducer(undefined, { type: "test/init" });

function stateFixture(overrides: Partial<RootState> = {}): RootState {
  let state = reducer(
    initialState,
    initInstanceUserInput({ conversationId: "shared-input", text: "existing" }),
  );
  state = reducer(
    state,
    initInstanceVariables({
      conversationId: "shared-input",
      definitions: [{ name: "topic", defaultValue: "" }],
    }),
  );
  return {
    ...state,
    agentComparisonModel: {
      ...state.agentComparisonModel,
      inputConversationId: "shared-input",
    },
    ...overrides,
  };
}

describe("Model Battle surface write handlers", () => {
  it("refuses drafts while the comparison is submitting", () => {
    const dispatch = jest.fn();
    const handlers = createModelBattleWriteHandlers({
      getState: () =>
        stateFixture({
          agentComparisonModel: {
            ...initialState.agentComparisonModel,
            inputConversationId: "shared-input",
            isSubmittingAll: true,
            columns: [],
          },
        }),
      dispatch,
    });

    expect(() =>
      handlers.shared_user_input_draft({ text: "new request" }),
    ).toThrow(/submitting/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses variable writes while any model column is running", () => {
    const dispatch = jest.fn();
    const handlers = createModelBattleWriteHandlers({
      getState: () =>
        stateFixture({
          agentComparisonModel: {
            ...initialState.agentComparisonModel,
            inputConversationId: "shared-input",
            isSubmittingAll: false,
            columns: [
              {
                columnId: "column",
                label: "Model",
                collapsed: false,
                conversationId: "running-column",
              },
            ],
          },
          conversations: reducer(
            initialState,
            createInstance({
              conversationId: "running-column",
              agentId: "agent",
              agentType: "user",
              origin: "test",
              status: "running",
            }),
          ).conversations,
        }),
      dispatch,
    });

    expect(() => handlers.shared_variables({ topic: "value" })).toThrow(
      /model run is active/,
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects an append that would exceed the final draft limit", () => {
    const dispatch = jest.fn();
    const handlers = createModelBattleWriteHandlers({
      getState: () =>
        stateFixture({
          instanceUserInput: reducer(
            initialState,
            initInstanceUserInput({
              conversationId: "shared-input",
              text: "a".repeat(CHAT_INPUT_DRAFT_MAX),
            }),
          ).instanceUserInput,
        }),
      dispatch,
    });

    expect(() =>
      handlers.shared_user_input_draft({ text: "b", mode: "append" }),
    ).toThrow(/would be/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects undeclared variables before dispatching", () => {
    const dispatch = jest.fn();
    const handlers = createModelBattleWriteHandlers({
      getState: () => stateFixture(),
      dispatch,
    });

    expect(() => handlers.shared_variables({ undeclared: "value" })).toThrow(
      /not a variable/,
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});
