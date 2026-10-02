import { renderToStaticMarkup } from "react-dom/server";
import { readDecisionAnswers } from "@ai-matrx/agents/presentation/decision-answers";
import { DecisionAnswers } from "../DecisionAnswers";

/**
 * THE SAME PAYLOAD, THE SAME ANSWERS — matrx-frontend's answers card
 * (`features/agents/decision-answers/DecisionAnswers.tsx`) and Workflow
 * Studio's decision block (`src/components/kind-blocks/decision-answers-block.tsx`)
 * both read through `@ai-matrx/agents/presentation/decision-answers`. Each app
 * carries this identical test (payload + expected table): if either surface
 * prints a different headline, percentage or refusal for the same payload,
 * one of the two goes red.
 *
 * Payload: battle b0ac5d97, Jev column (message ea19fc54), plus one refusal.
 */
const PAYLOAD = {
  __kind: "decision_answers",
  model: "jev-1.13.0",
  method: "native",
  answers: {
    urgency: {
      __kind: "decision_answer",
      type: "score",
      answer: 1.87,
      legend: {
        "0": "cosmetic",
        "1": "minor friction",
        "2": "a feature is blocked",
        "3": "data or money at risk",
        "4": "down for someone",
      },
      confidence: 0.25,
      probabilities: { "0": 0.02, "1": 0.49, "2": 0.27, "3": 0.03, "4": 0.19 },
    },
    is_defect: {
      __kind: "decision_answer",
      type: "noul",
      answer: false,
      confidence: 0.7,
      probability: 0.3,
    },
    owning_surface: {
      __kind: "decision_answer",
      type: "choice",
      answer: "frontend",
      confidence: 0.94,
      probabilities: { data: 0.01, server: 0.0, unclear: 0.04, frontend: 0.95, infrastructure: 0.0 },
    },
  },
  unanswerable: { customer_tier: "The state names no customer." },
};

/** [question, headline, probability of the answer given] — identical in both apps. */
const EXPECTED: Array<[string, string, string]> = [
  ["urgency", "1 · minor friction", "49%"],
  ["is_defect", "No", "70%"],
  ["owning_surface", "frontend", "95%"],
];
const EXPECTED_REFUSAL = ["customer_tier", "The state names no customer."];

describe("frontend answers card — same payload, same answers as Workflow Studio", () => {
  it("prints each answer's peak headline and the probability of the answer given", () => {
    const view = readDecisionAnswers(PAYLOAD);
    if (!view) throw new Error("payload did not read");
    const text = renderToStaticMarkup(<DecisionAnswers view={view} />).replace(/<[^>]+>/g, "");
    for (const [question, headline, probability] of EXPECTED) {
      expect(text).toContain(question);
      expect(text).toContain(headline);
      expect(text).toContain(probability);
    }
    for (const part of EXPECTED_REFUSAL) expect(text).toContain(part);
  });
});
