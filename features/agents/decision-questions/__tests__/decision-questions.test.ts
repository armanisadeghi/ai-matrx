/**
 * Forcing tests for the decision-questions rules that a screenshot cannot
 * reach today: the agent builder's model picker offers CONVERSATIONAL models
 * only (`modelsForSelectionPurpose(..., "chat")`), so a decision model — and
 * therefore the media-beside-questions refusal — cannot be selected from that
 * screen yet. These prove the verdicts directly instead of asserting them.
 */

import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  DECISION_TURN_TOOLS_NOTICE,
  decisionQuestionsCompatibility,
  decisionToolsNotice,
  statePartCompatibility,
} from "../compatibility";
import { decisionBudgetForModel, readDecisionBudget } from "../budget";
import { lintQuestion } from "../lint";
import { slugifyQuestionName, uniqueQuestionName } from "../name";
import type { DecisionQuestionSpec } from "../types";

function model(
  interaction: string,
  input: string[],
  extra: Record<string, unknown> = {},
): AIModelRecord {
  return {
    id: "m1",
    name: "test-model",
    common_name: "Test Model",
    capabilities: {
      input,
      output: ["text"],
      features: [],
      interaction,
      multilingual: false,
    },
    context_window: null,
    ...extra,
  } as unknown as AIModelRecord;
}

describe("decision_questions compatibility", () => {
  it("is native on a decision model", () => {
    expect(
      decisionQuestionsCompatibility(model("decision", ["text"])).verdict,
    ).toBe("native");
  });

  it("is converted on a text model, and says the probabilities are words", () => {
    const verdict = decisionQuestionsCompatibility(model("turn", ["text"]));
    expect(verdict.verdict).toBe("converted");
    expect(verdict.verdict === "converted" && verdict.reason).toContain(
      "not measured",
    );
  });

  it("is refused on a model that can neither decide nor read text", () => {
    expect(
      decisionQuestionsCompatibility(model("embedding", ["text"])).verdict,
    ).toBe("refused");
  });

  it("separates 'no model chosen' from 'model still loading'", () => {
    expect(decisionQuestionsCompatibility(null, null).verdict).toBe("refused");
    expect(decisionQuestionsCompatibility(null, "m1").verdict).toBe("unknown");
  });

  it("refuses a media part beside a questions part on a decision model", () => {
    const image = { type: "image", url: "https://example.com/a.png" };
    const verdict = statePartCompatibility(
      image,
      model("decision", ["text"]),
      true,
    );
    expect(verdict.verdict).toBe("refused");
    expect(verdict.verdict === "refused" && verdict.reason).toContain(
      "text state only",
    );
  });

  it("leaves that same media part alone with no questions part", () => {
    const image = { type: "image", url: "https://example.com/a.png" };
    expect(
      statePartCompatibility(image, model("decision", ["text"]), false).verdict,
    ).toBe("native");
  });

  it("leaves media alone on a text model — that request is legal", () => {
    const image = { type: "image", url: "https://example.com/a.png" };
    expect(
      statePartCompatibility(image, model("turn", ["text", "image"]), true)
        .verdict,
    ).toBe("native");
  });
});

describe("decision budget", () => {
  it("prefers the catalog's context window over the platform default", () => {
    const limits = decisionBudgetForModel(
      model("decision", ["text"], { context_window: 200000 }),
    );
    expect(limits.source).toBe("catalog");
    expect(limits.totalTokens).toBe(200000);
    expect(limits.statePlusLongestQuestionTokens).toBe(100000);
  });

  it("labels the fallback differently when no model record has loaded", () => {
    expect(decisionBudgetForModel(null).source).toBe("unloaded");
    expect(decisionBudgetForModel(model("decision", ["text"])).source).toBe(
      "default",
    );
  });

  it("measures the longest single question, not just the total", () => {
    const questions: DecisionQuestionSpec[] = [
      { name: "a", type: "noul", instructions: "short" },
      { name: "b", type: "noul", instructions: "x".repeat(4000) },
    ];
    const reading = readDecisionBudget({
      model: model("decision", ["text"]),
      stateText: "state",
      questions,
    });
    expect(reading.longestQuestionTokens).toBeGreaterThan(
      reading.questionTokens[0],
    );
    expect(reading.statePlusLongestTokens).toBeLessThan(reading.totalTokens);
  });
});

describe("the split-this-question lint", () => {
  it("flags a compound instruction", () => {
    const flagged = lintQuestion({
      name: "q",
      type: "choice",
      instructions:
        "Which surface owns this report and how urgent is it for the team right now?",
    });
    expect(flagged?.trigger).toBe("and");
  });

  it("flags two question marks", () => {
    expect(
      lintQuestion({
        name: "q",
        type: "noul",
        instructions: "Is it a defect? Is it urgent?",
      }),
    ).not.toBeNull();
  });

  it("leaves a single clause alone, even with a short 'and'", () => {
    expect(
      lintQuestion({
        name: "q",
        type: "noul",
        instructions: "Is this about sales and marketing collateral?",
      }),
    ).toBeNull();
  });

  it("leaves a 'rather than' contrast alone", () => {
    expect(
      lintQuestion({
        name: "q",
        type: "noul",
        instructions:
          "Is this a defect in existing behaviour rather than a request for new behaviour?",
      }),
    ).toBeNull();
  });
});

describe("question names", () => {
  it("slugs an instruction into a field name", () => {
    expect(
      slugifyQuestionName(
        "Is this a defect in existing behaviour rather than a request for new behaviour?",
      ),
    ).toBe("defect_existing_behaviour_request");
  });

  it("never lets two questions answer into the same field", () => {
    expect(uniqueQuestionName("urgency", ["urgency"])).toBe("urgency_2");
    expect(uniqueQuestionName("urgency", ["urgency", "urgency_2"])).toBe(
      "urgency_3",
    );
  });
});

// The Sonnet twin of the feedback-triage agent carried the Records tool and
// its decision turn shipped twenty tool schemas (45,739 input tokens vs 729 on
// the native holder). The server now drops tools for a decision turn; the
// builder must SAY so wherever tools are attached, never leave it silent.
describe("decision turn tools notice", () => {
  const triage = [
    {
      role: "system",
      content: [{ type: "text", text: "You triage feedback." }],
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Pickup marked complete, no truck came." },
        {
          type: "decision_questions",
          questions: [{ name: "is_defect", type: "noul" }],
        },
      ],
    },
  ];
  const chat = [
    {
      role: "user",
      content: [{ type: "text", text: "Summarize this report." }],
    },
  ];

  it("names the rule when a Questions part meets attached tools", () => {
    expect(decisionToolsNotice(triage, 1)).toBe(DECISION_TURN_TOOLS_NOTICE);
    expect(DECISION_TURN_TOOLS_NOTICE).toBe(
      "Questions parts run without tools; the attached tools are ignored for this turn.",
    );
  });

  it("stays quiet with no tools, or with no Questions part", () => {
    expect(decisionToolsNotice(triage, 0)).toBeNull();
    expect(decisionToolsNotice(chat, 3)).toBeNull();
    expect(decisionToolsNotice(undefined, 3)).toBeNull();
  });
});
