import { serializeForErrorCapture } from "./globalErrorCapture";

describe("global console error serialization", () => {
  it("preserves an Error nested inside a context object", () => {
    const cause = new Error("association rejected");
    const serialized = serializeForErrorCapture(
      {
        conversationId: "cef7a4c2-8f84-41d3-bf96-66e65833ad4a",
        err: cause,
      },
      false,
    );

    expect(serialized).toEqual({
      conversationId: "cef7a4c2-8f84-41d3-bf96-66e65833ad4a",
      err: {
        name: "Error",
        message: "association rejected",
      },
    });
  });

  it("terminates circular diagnostic objects safely", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(serializeForErrorCapture(value, false)).toEqual({
      self: "[Circular]",
    });
  });
});
