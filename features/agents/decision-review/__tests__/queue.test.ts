/**
 * The review queue: rows read the way the capture trigger writes them, the
 * lowest-confidence answer comes first, and the keyboard maps to options.
 * The row metadata below is the shape platform.capture_decision_items wrote
 * for the live Jev "Feedback triage" answers (aidream migration 1170).
 */

import {
  agentAsksDecisions,
  decisionSource,
  optionLabel,
  orderQueue,
  queueKeyAction,
  readReviewItem,
  type JudgeVerdictRow,
} from "../queue";

function row(overrides: Partial<JudgeVerdictRow> & { metadata?: unknown }): JudgeVerdictRow {
  return {
    id: "item",
    question: "is_defect",
    judge_version: 5,
    model: "jev-1.13.0",
    verdict: "true",
    confidence: 0.96,
    authority_verdict: null,
    agreed: null,
    subject_ref_id: "msg",
    created_at: "2026-09-26T07:00:00Z",
    metadata: {
      answer_type: "noul",
      answer: true,
      p_answer: 0.96,
      probability: 0.96,
      method: "native",
      conversation_id: "conv",
      instructions: "Is this a defect in existing behaviour rather than a request for new behaviour?",
      options: [
        { key: "true", label: "existing behaviour is wrong" },
        { key: "false", label: "new behaviour is wanted" },
      ],
    },
    ...overrides,
  };
}

const URGENCY = row({
  id: "urgency",
  question: "urgency",
  verdict: "2",
  confidence: 0.24,
  metadata: {
    answer_type: "score",
    answer: 2.91,
    p_answer: 0.47,
    method: "native",
    probabilities: { "0": 0, "1": 0, "2": 0.47, "3": 0.14, "4": 0.39 },
    legend: { "0": "cosmetic", "1": "minor friction", "2": "a feature is blocked", "3": "data or money at risk", "4": "down for someone" },
    options: [
      { key: "0", label: "cosmetic" },
      { key: "1", label: "minor friction" },
      { key: "2", label: "a feature is blocked" },
      { key: "3", label: "data or money at risk" },
      { key: "4", label: "down for someone" },
    ],
  },
});

describe("readReviewItem", () => {
  it("reads a yes/no row into an item with Yes/No options and the answer view", () => {
    const item = readReviewItem(row({}));
    expect(item.answerType).toBe("noul");
    expect(item.method).toBe("native");
    expect(item.options.map((o) => o.key)).toEqual(["true", "false"]);
    expect(item.pAnswer).toBe(0.96);
    expect(item.conversationId).toBe("conv");
    expect(item.view?.answers[0].answerKey).toBe("true");
  });

  it("reads a score row: the verdict is the peak level, labels come from the legend", () => {
    const item = readReviewItem(URGENCY);
    expect(item.verdict).toBe("2");
    expect(optionLabel(item, item.verdict)).toBe("2 · a feature is blocked");
    expect(item.view?.answers[0].answerKey).toBe("2");
  });

  it("never invents a method", () => {
    const item = readReviewItem(row({ metadata: { answer_type: "noul", method: "guess" } }));
    expect(item.method).toBeNull();
    expect(item.options).toEqual([]);
  });
});

describe("queue order", () => {
  it("puts the lowest confidence first, unknown confidence before everything, newest breaks ties", () => {
    const items = [
      readReviewItem(row({ id: "sure", confidence: 0.99 })),
      readReviewItem(row({ id: "old-unsure", confidence: 0.4, created_at: "2026-09-25T00:00:00Z" })),
      readReviewItem(row({ id: "new-unsure", confidence: 0.4, created_at: "2026-09-26T00:00:00Z" })),
      readReviewItem(row({ id: "unknown", confidence: null })),
      readReviewItem(URGENCY),
    ];
    expect(orderQueue(items).map((i) => i.id)).toEqual([
      "unknown",
      "urgency",
      "new-unsure",
      "old-unsure",
      "sure",
    ]);
  });
});

describe("keyboard", () => {
  const yesNo = readReviewItem(row({}));
  const score = readReviewItem(URGENCY);

  it("moves with j/k and skips with s", () => {
    expect(queueKeyAction(yesNo, "j")).toEqual({ type: "next" });
    expect(queueKeyAction(yesNo, "k")).toEqual({ type: "previous" });
    expect(queueKeyAction(null, "s")).toEqual({ type: "skip" });
  });

  it("labels with 1-9 by option position, and y/n on a yes-or-no question", () => {
    expect(queueKeyAction(yesNo, "1")).toEqual({ type: "label", key: "true" });
    expect(queueKeyAction(yesNo, "n")).toEqual({ type: "label", key: "false" });
    expect(queueKeyAction(score, "4")).toEqual({ type: "label", key: "3" });
    expect(queueKeyAction(score, "9")).toBeNull();
    expect(queueKeyAction(score, "y")).toBeNull();
  });
});

describe("agentAsksDecisions", () => {
  it("is true only when a message carries a decision_questions part", () => {
    expect(
      agentAsksDecisions([
        { role: "user", content: [{ type: "text", text: "x" }, { type: "decision_questions", questions: [] }] },
      ]),
    ).toBe(true);
    expect(agentAsksDecisions([{ role: "user", content: [{ type: "text", text: "x" }] }])).toBe(false);
    expect(agentAsksDecisions(undefined)).toBe(false);
  });
});

describe("workflow items", () => {
  it("carry the run and step a Decide node stamped on them (aidream migration 1195)", () => {
    const base = row({}).metadata as Record<string, unknown>;
    const item = readReviewItem(
      row({
        metadata: {
          ...base,
          workflow_run_id: "18ff87aa-5380-4a27-9291-c26e8847e52e",
          workflow_node_id: "decide",
          workflow_id: "f30ddc59-1a09-4946-b995-3399474eaa33",
        },
      }),
    );
    expect(item.workflowRunId).toBe("18ff87aa-5380-4a27-9291-c26e8847e52e");
    expect(item.workflowNodeId).toBe("decide");
  });

  it("an answer from chat has no run to link to", () => {
    const item = readReviewItem(row({}));
    expect(item.workflowRunId).toBeNull();
    expect(item.workflowNodeId).toBeNull();
  });
});

describe("source — what the combined queue filters and tags on", () => {
  it("an agent's chat answer is an agent item naming that agent", () => {
    const item = readReviewItem(row({ judge_key: "agent:143f5d37-7d49-4bac-96c4-c5955cac21f2" }));
    expect(item.source).toBe("agent");
    expect(item.agentId).toBe("143f5d37-7d49-4bac-96c4-c5955cac21f2");
  });

  it("an agent answering inside a workflow Decide step is a workflow item that still names the agent", () => {
    const base = row({}).metadata as Record<string, unknown>;
    const item = readReviewItem(
      row({
        judge_key: "agent:143f5d37-7d49-4bac-96c4-c5955cac21f2",
        metadata: { ...base, workflow_run_id: "18ff87aa-5380-4a27-9291-c26e8847e52e" },
      }),
    );
    expect(item.source).toBe("workflow");
    expect(item.agentId).toBe("143f5d37-7d49-4bac-96c4-c5955cac21f2");
  });

  it("an agentless inline step is a workflow item with no agent", () => {
    const item = readReviewItem(row({ judge_key: "workflow_node:f30ddc59:decide" }));
    expect(item.source).toBe("workflow");
    expect(item.agentId).toBeNull();
  });

  it("an /ai/decisions call is an API model item", () => {
    const item = readReviewItem(row({ judge_key: "model:jev-1.13.0" }));
    expect(item.source).toBe("model");
    expect(item.agentId).toBeNull();
  });

  it("the source helper agrees with the reader", () => {
    expect(decisionSource("model:x", null)).toBe("model");
    expect(decisionSource("model:x", "run")).toBe("workflow");
    expect(decisionSource(undefined, null)).toBe("agent");
  });
});
