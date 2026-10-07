/**
 * Space Builder request shape (STATE.md § Space Builder): userInput is exactly what the person typed;
 * the page goes as named variables only on the change door; the result is read strictly.
 */
jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({ useFloatingAgentRun: jest.fn() }));
jest.mock("../../state/SpacesProvider", () => ({ useSpaces: jest.fn() }));
jest.mock("../spaces-ai", () => ({ BUILD_KEY: "spaces.build", useSpaceBuilderDisclosure: jest.fn() }));

import { buildRequest, readBuildResult } from "../SpaceBuilder";

describe("Space Builder request", () => {
  it("a new Space sends only the typed words — no variables", () => {
    expect(buildRequest("A client tracker for my dental office", null)).toEqual({ userInput: "A client tracker for my dental office" });
  });
  it("a change sends the typed words as userInput and the page as named variables", () => {
    const r = buildRequest("Add a churn ring", { spaceId: "s1", title: "Clients", markdown: "# Clients" });
    expect(r.userInput).toBe("Add a churn ring");
    expect(r.variables).toEqual({ space_id: "s1", page_title: "Clients", page_markdown: "# Clients" });
  });
  it("reads the result; a missing root is a change, not a failure", () => {
    expect(readBuildResult({ summary: "Done", root_space_id: "r1", space_ids: ["r1", 2], table_ids: ["t1"] })).toEqual({ summary: "Done", root_space_id: "r1", space_ids: ["r1"], table_ids: ["t1"] });
    expect(readBuildResult({ summary: "Edited" }).root_space_id).toBeNull();
    expect(() => readBuildResult("nope")).toThrow();
  });
});
