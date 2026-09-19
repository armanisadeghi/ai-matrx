import {
  decisionQuestionPayload,
  questionErrors,
  type DecisionQuestion,
} from "./decision-form";
import { decisionRequestFor } from "./decision-api";
import { readDecisionResult } from "./decision-result";

const choiceQuestion: DecisionQuestion = {
  id: "choice-id",
  name: "route",
  type: "choice",
  instructions: "Choose the best route.",
  instructionsMode: "text",
  instructionsJson: "{}",
  criteriaMode: "rows",
  criteriaJson: "{}",
  criteria: [
    { key: "ship", description: "Ship it" },
    { key: "hold", description: "Wait" },
  ],
};

describe("native decision request contract", () => {
  it("rejects invalid JSON Choice and Noul schemas before a request can spend", () => {
    const invalidChoice: DecisionQuestion = {
      ...choiceQuestion,
      criteriaMode: "json",
      criteriaJson: '{"": "missing key"}',
    };
    const invalidNoul: DecisionQuestion = {
      ...choiceQuestion,
      type: "noul",
      criteriaMode: "json",
      criteriaJson: '{"true": "yes", "maybe": "no"}',
      criteria: { true: "yes", false: "no" },
    };

    expect(questionErrors([invalidChoice])).toContain(
      "“route” needs at least two named choices.",
    );
    expect(questionErrors([invalidNoul])).toContain(
      "“route” Noul criteria must contain exactly “true” and “false”.",
    );
  });

  it("preserves an offering pin as offering_id and nulls blank option descriptions", () => {
    const payload = decisionQuestionPayload({
      ...choiceQuestion,
      criteria: [
        { key: "ship", description: "" },
        { key: "hold", description: "Wait" },
      ],
    });
    expect(payload).toEqual({
      type: "choice",
      instructions: "Choose the best route.",
      criteria: { ship: null, hold: "Wait" },
    });
    expect(
      decisionRequestFor({
        model: "jev-1.13.0",
        offeringId: "offering-1",
        state: { customer: "A" },
        questions: { route: payload ?? {} },
      }),
    ).toMatchObject({ offering_id: "offering-1" });
  });

  it("keeps every returned answer shape, including score legends", () => {
    const result = readDecisionResult({
      type: "decision_result",
      execution_id: "execution-1",
      request_id: "request-1",
      provider_request_id: null,
      model: "jev-1.13.0",
      answers: {
        route: {
          type: "choice",
          choice: "ship",
          probabilities: { ship: 0.8, hold: 0.2 },
          confidence: 0.8,
        },
        priority: {
          type: "score",
          score: 2,
          probabilities: { low: 0.1, high: 0.9 },
          confidence: 0.9,
          legend: { 2: { label: "High" } },
        },
        proceed: { type: "noul", noul: 1 },
      },
      usage: { input_tokens: 12, output_tokens: 8 },
      cost_usd: 0.00001,
      offering_id: "offering-1",
      route: "native",
    });
    expect(result?.answers.priority).toMatchObject({
      type: "score",
      legend: { 2: { label: "High" } },
    });
    expect(result?.requestId).toBe("request-1");
  });
});
