import { getSurfaceDefault } from "../source-registry";

describe("conversation history surface defaults", () => {
  it("shows an agent's every conversation in the runner (the list is already agent-scoped)", () => {
    // 2026-09-09: a second source filter hid the agent's Agent Builder drafts
    // and the runner read "No conversations yet." for an agent with history.
    expect(getSurfaceDefault("agent-runner")).toEqual({
      includeFeatures: [],
      includeApps: [],
      includeEmptySource: false,
    });
  });
});
