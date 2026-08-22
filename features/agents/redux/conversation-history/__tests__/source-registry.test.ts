import { getSurfaceDefault } from "../source-registry";

describe("conversation history surface defaults", () => {
  it("keeps agent runner history scoped to runner conversations", () => {
    expect(getSurfaceDefault("agent-runner")).toEqual({
      includeFeatures: ["agent-runner"],
      includeApps: [],
      includeEmptySource: false,
    });
  });
});
