import { intelligenceGoHref, intelligenceTargetPath } from "../intelligenceGo";

const SYSTEM = { agentId: "a1", agentType: "builtin" };
const USER = { agentId: "a2", agentType: "user" };

describe("intelligence go", () => {
  it("builds the lane's door from an id alone", () => {
    expect(intelligenceGoHref("x")).toBe("/intelligence/go/x");
    expect(intelligenceGoHref("x", "admin")).toBe("/administration/intelligence/go/x");
  });

  it("opens a system agent in the System Agents tree only from the admin lane", () => {
    const target = { kind: "agent" as const, address: SYSTEM };
    expect(intelligenceTargetPath(target, "admin")).toBe(
      "/administration/agents/system-agents/agents/a1",
    );
    expect(intelligenceTargetPath(target, "user")).toBe("/agents/a1");
  });

  it("opens a user agent in the agent view from either lane", () => {
    const target = { kind: "agent" as const, address: USER };
    expect(intelligenceTargetPath(target, "admin")).toBe("/agents/a2");
    expect(intelligenceTargetPath(target, "user")).toBe("/agents/a2");
  });

  it("lands an agent version id on that version", () => {
    const target = {
      kind: "agent" as const,
      address: { ...SYSTEM, isVersion: true, versionNumber: 11 },
    };
    expect(intelligenceTargetPath(target, "admin")).toBe(
      "/administration/agents/system-agents/agents/a1/v/11",
    );
  });

  it("lands a workflow or workflow version on the workflow", () => {
    const target = {
      kind: "workflow" as const,
      definitionId: "w1",
      name: null,
      versionNumber: 3,
    };
    expect(intelligenceTargetPath(target, "admin")).toBe("/workflows/w1");
    expect(intelligenceTargetPath(target, "user", "/runs")).toBe("/workflows/w1/runs");
  });
});
