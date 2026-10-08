// DRILL-FLIP-FIXES — the last rows before THE FLIP, on the explorer's side (VERIFY-DRILL-FINAL R3, L1, L4, N2).
//   R3  a time-valued group (the ten-minute bucket, a "Repeat bursts" row) reads as a moment, never a code
//   L1  a number filter's line is typed in the unit the cells print and said "at most" when it is one
//   L4  the explorer hands the page's surface the question and its answer, money in dollars
//   N2  "All time" lists records over the whole span (the door lists records for a window)
// Red on HEAD: none of momentGroupWords, havingValue, drillExplorerScope or allTimeWindow existed, and a
// bucket read "2026 09 12T19 · 20 · 00+00 · 00".

import type { DrillDefinition } from "@ai-matrx/records";
import { drillRequestKey, type MatrxDrillDimension, type MatrxDrillMeasure } from "@ai-matrx/design-system/data-table";

jest.mock("@/components/cost/pointsRate", () => ({ currentPointsRate: () => 20000 }));

import { drillDimensionLabelFor, momentGroupWords } from "../dimensionWords";
import { havingValue } from "../DrillNumberFilter";
import { carriedWords } from "../questionParts";
import { drillExplorerScope } from "../drillExplorerScope";
import { allTimeWindow, DRILL_ALL_TIME_FROM } from "../DrillRecords";

type Dim = DrillDefinition["dimensions"][number];

describe("R3: a time-valued group reads as a moment", () => {
  const bucket: Dim = { key: "bucket_10m", label: "Ten minutes (UTC)", from: "bucket_10m", kind: "choice", cardinality: "high" };
  it("the ten-minute bucket of a burst reads 'Sep 12, 7:20 PM UTC' (a choice with no words declared)", () => {
    const say = drillDimensionLabelFor(bucket, { names: undefined })!;
    expect(say("2026-09-12T19:20:00+00:00")).toMatch(/^Sep 12(, 2026)?, 7:20 PM UTC$/);
    expect(say("2026-09-12T19:20:00+00:00")).not.toContain("·");
  });
  it("a text Dimension holding a moment reads as one; a model name still reads as written", () => {
    const text: Dim = { key: "first_seen", label: "First seen", from: "first_seen", kind: "text" };
    const say = drillDimensionLabelFor(text, { names: undefined })!;
    expect(say("2026-09-12 19:20:00Z")).toMatch(/7:20 PM UTC$/);
    expect(say("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
  });
  it("only an ISO moment is one", () => {
    expect(momentGroupWords("2026-09-12")).toBeNull();
    expect(momentGroupWords("gpt-5")).toBeNull();
  });
});

describe("L1: a number filter", () => {
  it("money is typed in points and sent in dollars; a dollar admin types dollars; other units as typed", () => {
    expect(havingValue(20000, "usd", "points", 20000)).toBe(1);
    expect(havingValue(3, "usd", "usd", 20000)).toBe(3);
    expect(havingValue(1000, "count", "points", 20000)).toBe(1000);
    expect(havingValue(5, "usd", "points", null)).toBeNull();
  });
  it("an 'at most' line is said as one", () => {
    const words = carriedWords({ having: [{ measure: "requests", op: "<=" as never, value: 1000 }] }, (k) => (k === "requests" ? "Requests" : k));
    expect(words.kept).toContain("Requests is at most 1,000");
  });
});

describe("L4: the explorer's surface scope", () => {
  const dims: MatrxDrillDimension[] = [{ key: "person", label: "Person", kind: "relation", labelFor: (v) => (v === "p-1" ? "maria.ortiz@greenline-recycling.com" : "None") }];
  const meas: MatrxDrillMeasure[] = [
    { key: "cost", label: "Cost (points)", additive: true },
    { key: "requests", label: "Requests", additive: true },
  ];
  const q = { by: ["person"], show: ["cost", "requests"], where: [], window: "30d" };
  it("carries the question in words and the answer by names and labels, in dollars", () => {
    const scope = drillExplorerScope({
      definitionKey: "ai_usage",
      definitionLabel: "AI usage",
      openView: "Usage by person",
      question: q,
      dimensions: dims,
      measures: meas,
      answers: {
        [drillRequestKey([])]: [{ groups: {}, measures: { cost: 12.5, requests: 40 }, row_count: 40 }],
        [drillRequestKey(["person"])]: [{ groups: { person: "p-1" }, measures: { cost: 12.5, requests: 40 }, row_count: 40 }],
      },
      error: null,
      asOf: "2026-10-01T03:20:00Z",
      says: [],
      money: "points",
      emptyLabel: "None",
    }) as Record<string, unknown>;
    expect(scope.answer_state).toBe("answered");
    expect(scope.question_words).toContain("by Person");
    expect(scope.answer_total).toEqual({ "Cost (points)": 12.5, Requests: 40 });
    expect(scope.answer_rows).toEqual([{ Person: "maria.ortiz@greenline-recycling.com", "Cost (points)": 12.5, Requests: 40 }]);
    expect(scope.open_view).toBe("Usage by person");
    expect(scope.counted_through).toBe("2026-10-01T03:20:00Z");
  });
  it("a failed answer holds no numbers", () => {
    const scope = drillExplorerScope({ definitionKey: "ai_usage", definitionLabel: null, openView: null, question: q, dimensions: dims, measures: meas, answers: {}, error: "The answer could not be counted.", asOf: null, says: [], money: "usd", emptyLabel: "None" }) as Record<string, unknown>;
    expect(scope.answer_state).toBe("failed");
    expect(scope.answer_total).toBeUndefined();
  });
});

describe("N2: All time lists every record", () => {
  it("is the span from the platform's first day to now", () => {
    const now = new Date("2026-10-01T04:00:00Z");
    expect(allTimeWindow("at", now)).toEqual({ key: "at", from: DRILL_ALL_TIME_FROM, to: "2026-10-01T04:00:00.000Z" });
  });
});
