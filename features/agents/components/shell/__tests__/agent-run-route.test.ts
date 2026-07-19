import {
  ADMIN_AGENT_RUN_BASE_PATH,
  AGENT_RUN_PATH_PATTERN,
  buildAgentRunUrl,
  resolveAgentRunRoute,
  USER_AGENT_RUN_BASE_PATH,
} from "../agent-run-route";

describe("agent run route helpers", () => {
  it.each([
    [
      "/agents/agent-1/run",
      { agentId: "agent-1", basePath: USER_AGENT_RUN_BASE_PATH },
    ],
    [
      "/administration/system-agents/agents/agent-2/run",
      { agentId: "agent-2", basePath: ADMIN_AGENT_RUN_BASE_PATH },
    ],
  ])("resolves %s", (pathname, expected) => {
    expect(AGENT_RUN_PATH_PATTERN.test(pathname)).toBe(true);
    expect(resolveAgentRunRoute(pathname)).toEqual(expected);
  });

  it("does not match non-run agent routes", () => {
    const pathname = "/administration/system-agents/agents/agent-2/build";

    expect(AGENT_RUN_PATH_PATTERN.test(pathname)).toBe(false);
    expect(resolveAgentRunRoute(pathname)).toBeNull();
  });

  it("keeps history navigation on the resolved runner surface", () => {
    expect(
      buildAgentRunUrl(
        {
          agentId: "agent-2",
          basePath: ADMIN_AGENT_RUN_BASE_PATH,
        },
        "conversation/with spaces",
      ),
    ).toBe(
      "/administration/system-agents/agents/agent-2/run?conversationId=conversation%2Fwith%20spaces",
    );
  });
});
