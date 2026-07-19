import reducer, {
  initInstanceVariables,
  clearSubmittedVariableResourcePolicies,
  setRuntimeVariableResourcePolicy,
} from "./instance-variable-values.slice";

describe("runtime variable resource policy", () => {
  it("stores request-scoped policy without changing the definition snapshot", () => {
    let state = reducer(
      undefined,
      initInstanceVariables({
        conversationId: "conversation-1",
        definitions: [
          {
            name: "pdf_file",
            defaultValue: null,
            customComponent: {
              type: "document",
              resource_context: { exclude: ["raw"] },
            },
          },
        ],
      }),
    );
    state = reducer(
      state,
      setRuntimeVariableResourcePolicy({
        conversationId: "conversation-1",
        name: "pdf_file",
        policy: {
          promote: [{ representation: "clean", max_chars: 1200 }],
        },
      }),
    );

    expect(
      state.byConversationId["conversation-1"].resourcePolicies.pdf_file,
    ).toEqual({
      promote: [{ representation: "clean", max_chars: 1200 }],
    });
    expect(
      state.byConversationId["conversation-1"].definitions[0].customComponent
        ?.resource_context,
    ).toEqual({ exclude: ["raw"] });

    state = reducer(
      state,
      clearSubmittedVariableResourcePolicies({
        conversationId: "conversation-1",
        submitted: {
          pdf_file: { promote: [{ representation: "clean", max_chars: 1200 }] },
        },
      }),
    );
    expect(
      state.byConversationId["conversation-1"].resourcePolicies,
    ).toEqual({});
    expect(
      state.byConversationId["conversation-1"].definitions[0].customComponent
        ?.resource_context,
    ).toEqual({ exclude: ["raw"] });
  });

  it("does not clear a next-turn policy edited while the prior request streams", () => {
    let state = reducer(
      undefined,
      initInstanceVariables({ conversationId: "conversation-1", definitions: [] }),
    );
    const submitted = { exclude: ["raw"] };
    state = reducer(
      state,
      setRuntimeVariableResourcePolicy({
        conversationId: "conversation-1",
        name: "pdf_file",
        policy: submitted,
      }),
    );
    state = reducer(
      state,
      setRuntimeVariableResourcePolicy({
        conversationId: "conversation-1",
        name: "pdf_file",
        policy: { exclude: ["rag"] },
      }),
    );
    state = reducer(
      state,
      clearSubmittedVariableResourcePolicies({
        conversationId: "conversation-1",
        submitted: { pdf_file: submitted },
      }),
    );
    expect(state.byConversationId["conversation-1"].resourcePolicies.pdf_file).toEqual({
      exclude: ["rag"],
    });
  });
});
