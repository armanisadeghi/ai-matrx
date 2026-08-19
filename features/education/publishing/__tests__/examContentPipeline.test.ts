import {
  EXAM_DECK_PLANS,
  examGroundingQueries,
  groundingReady,
} from "../examContentPipeline";
import type { GroundingResult } from "@/features/rag/api/grounding";

const trust = {
  citations: [],
  confidence: "not_in_material" as const,
  groundedIn: "official exam sources",
};

describe("exam content pipeline", () => {
  test("defines three distinct launch-floor deck plans", () => {
    expect(EXAM_DECK_PLANS.map((plan) => plan.key)).toEqual([
      "foundations",
      "reasoning",
      "practice",
    ]);
  });

  test("keeps the degraded-search fallback inside the exact exam corpus", () => {
    const plan = EXAM_DECK_PLANS[0];
    expect(examGroundingQueries("AP Calculus", plan)).toEqual([
      `AP Calculus: ${plan.label}. ${plan.focus}`,
      "AP Calculus",
    ]);
  });

  test.each(["empty", "failed"] as const)(
    "refuses %s grounding instead of widening the corpus",
    (status) => {
      const result: GroundingResult = {
        status,
        passages: [],
        trust,
        ...(status === "failed" ? { error: "retrieval unavailable" } : {}),
      };
      expect(groundingReady(result).ok).toBe(false);
    },
  );

  test("returns the durable chunk ids that publication metadata records", () => {
    const result: GroundingResult = {
      status: "retrieved",
      passages: [
        {
          chunkId: "chunk-1",
          text: "Supported text",
          title: "Official source",
          sourceKind: "note",
          sourceId: "note-1",
          locator: "Retrieved passage",
          score: 1,
        },
      ],
      trust,
    };
    expect(groundingReady(result)).toEqual({ ok: true, chunkIds: ["chunk-1"] });
  });
});
