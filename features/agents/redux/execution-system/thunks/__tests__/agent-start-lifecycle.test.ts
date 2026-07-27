import { buildAgentStartLifecycleFields } from "../execute-instance.thunk";

describe("buildAgentStartLifecycleFields", () => {
  test("persistent starts send all three fields with the local conversation id", () => {
    expect(buildAgentStartLifecycleFields("local-conversation", false)).toEqual({
      conversation_id: "local-conversation",
      is_new: true,
      store: true,
    });
  });

  test("ephemeral starts still send the id — store:false is what makes them ephemeral", () => {
    // The old contract omitted the id and sent `is_new:false`, i.e. "this is
    // not a new conversation and I won't tell you which one". The server
    // reinterpreted that contradiction as 'run stateless'; it is now a 422.
    expect(
      buildAgentStartLifecycleFields("local-ephemeral-conversation", true),
    ).toEqual({
      conversation_id: "local-ephemeral-conversation",
      is_new: true,
      store: false,
    });
  });

  test("a start without a conversation id is rejected here, not on the server", () => {
    expect(() => buildAgentStartLifecycleFields("", false)).toThrow(
      /conversation_id is required/,
    );
  });
});
