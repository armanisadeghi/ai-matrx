import { providerMessageDisplay } from "../lib/providerMessageText";

describe("providerMessageDisplay", () => {
  it("joins canonical text parts without exposing thinking", () => {
    expect(
      providerMessageDisplay([
        { type: "text", text: "Hello " },
        { type: "thinking", text: "private" },
        { type: "text", text: "world" },
      ]),
    ).toEqual({ text: "Hello world", activityCount: 0 });
  });

  it("counts non-text provider activity without inventing prose", () => {
    expect(
      providerMessageDisplay([
        { type: "tool_call", call_id: "call-1", name: "Read" },
        { type: "tool_result", call_id: "call-1", name: "Read" },
      ]),
    ).toEqual({ text: "", activityCount: 2 });
  });
});
