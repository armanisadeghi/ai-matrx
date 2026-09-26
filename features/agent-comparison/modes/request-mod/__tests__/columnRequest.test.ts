import type { RootState } from "@/lib/redux/store";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { columnRequestToSave } from "../columnRequest";
import type { RequestModColumn } from "../types";

const baseState = createSlimRootReducer()(undefined, { type: "test/init" });

function stateWithComposer(
  conversationId: string,
  text: string,
  variables: Record<string, unknown>,
): RootState {
  return {
    ...baseState,
    instanceUserInput: {
      ...baseState.instanceUserInput,
      byConversationId: {
        [conversationId]: { text },
      },
    },
    instanceVariableValues: {
      ...baseState.instanceVariableValues,
      byConversationId: {
        [conversationId]: { userValues: variables },
      },
    },
  } as RootState;
}

function column(overrides: Partial<RequestModColumn> = {}): RequestModColumn {
  return {
    columnId: "col-1",
    conversationId: "conv-1",
    label: "Column 1",
    collapsed: false,
    lastRequest: null,
    ...overrides,
  };
}

describe("columnRequestToSave", () => {
  it("saves the live composer when it holds a non-empty message", () => {
    const state = stateWithComposer("conv-1", "What is the return policy?", {
      customer_name: "Dana",
    });
    const col = column({
      lastRequest: { user_message: "stale request", variables: { customer_name: "Old" } },
    });

    const result = columnRequestToSave(state, col);

    expect(result).toEqual({
      user_message: "What is the return policy?",
      variables: { customer_name: "Dana" },
    });
  });

  it("falls back to lastRequest (message AND variables) when the composer is empty", () => {
    const state = stateWithComposer("conv-1", "", {});
    const col = column({
      lastRequest: {
        user_message: "How do I reset my router?",
        variables: { device_model: "RT-2200" },
      },
    });

    const result = columnRequestToSave(state, col);

    expect(result).toEqual({
      user_message: "How do I reset my router?",
      variables: { device_model: "RT-2200" },
    });
  });

  it("falls back to lastRequest when the composer is only whitespace", () => {
    const state = stateWithComposer("conv-1", "   \n  ", {});
    const col = column({
      lastRequest: {
        user_message: "Summarize the attached lease agreement.",
        variables: {},
      },
    });

    const result = columnRequestToSave(state, col);

    expect(result.user_message).toBe("Summarize the attached lease agreement.");
  });

  it("returns the empty live request when the composer is empty and there is no lastRequest", () => {
    const state = stateWithComposer("conv-1", "", {});
    const col = column({ lastRequest: null });

    const result = columnRequestToSave(state, col);

    expect(result).toEqual({ user_message: "", variables: {} });
  });
});
