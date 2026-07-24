import { buildAgentStartLifecycleFields } from "../execute-instance.thunk";

describe("buildAgentStartLifecycleFields", () => {
  test("persistent starts reserve the local conversation id", () => {
    expect(buildAgentStartLifecycleFields("local-conversation", false)).toEqual({
      conversation_id: "local-conversation",
      is_new: true,
    });
  });

  test("ephemeral starts never present the local Redux key as an existing conversation", () => {
    const fields = buildAgentStartLifecycleFields(
      "local-ephemeral-conversation",
      true,
    );

    expect(fields).toEqual({ is_new: false, store: false });
    expect(fields.conversation_id).toBeUndefined();
  });
});
