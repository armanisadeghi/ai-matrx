import { buildRunAgentRequest } from "./useRunAgent";

describe("buildRunAgentRequest", () => {
  it("preserves entity-local scope and source attribution", () => {
    const request = buildRunAgentRequest({
      agentId: "agent-id",
      userInput: "Build slides",
      organizationId: "topic-org",
      projectId: "topic-project",
      taskId: "topic-task",
      sourceApp: "matrx-frontend",
      sourceFeature: "research",
    });

    expect(request.scopeOverrides).toEqual({
      organization_id: "topic-org",
      project_id: "topic-project",
      task_id: "topic-task",
    });
    expect(request.body).toMatchObject({
      user_input: "Build slides",
      source_app: "matrx-frontend",
      source_feature: "research",
      stream: true,
      debug: false,
    });
  });

  it("does not overwrite callApi global scope with undefined overrides", () => {
    const request = buildRunAgentRequest({
      agentId: "agent-id",
      userInput: "Run",
      sourceApp: "matrx-frontend",
      sourceFeature: "agent",
    });

    expect(request.scopeOverrides).toEqual({});
    expect(request.body.organization_id).toBeUndefined();
  });
});
