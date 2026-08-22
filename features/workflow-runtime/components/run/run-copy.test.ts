import { workflowFailureAgentInput, workflowFailureHuman } from "./run-copy";

const VIEW = {
  kind: "run" as const,
  headline: "Unknown rule ids stopped partway through.",
  technical: "data.filter received fan-in wrappers",
  nextStep: "Inspect the filter input.",
  runId: "run-1",
  definitionId: "workflow-1",
  workflowName: "Keyword selection",
  status: "failed",
  failedSteps: ["Unknown rule ids"],
  completedSteps: 17,
  totalSteps: 39,
  costUsd: 6.46,
};

describe("workflow run copy payloads", () => {
  it("keeps the rendered error verbatim in human copy", () => {
    const text = workflowFailureHuman(VIEW);
    expect(text).toContain(VIEW.headline);
    expect(text).toContain(VIEW.technical);
    expect(text).toContain("17");
  });

  it("mirrors the page-leading run facts in data and attributes", () => {
    const input = workflowFailureAgentInput(VIEW);
    expect(input.kind).toBe("workflow-run-failure");
    expect(input.attributes).toMatchObject({
      status: "failed",
      failed_steps: 1,
      completed_steps: 17,
      total_steps: 39,
      cost_usd: 6.46,
    });
    expect(input.data).toMatchObject({
      rendered: {
        headline: VIEW.headline,
        technical_detail: VIEW.technical,
      },
      run: {
        run_id: "run-1",
        progress: "17 of 39 steps",
        cost: "$6.4600",
      },
    });
  });
});
