// ROWS ADD UP TO THE TOTAL SHOWN (VERIFIER-32 F6). RED before this file's module existed, and red
// by value on per-row rounding: three people at 0.4 credits each round to 0 + 0 + 0 under a total of 1.

import { drillRequestKey, type MatrxDrillAnswerRow, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { apportionAnswers, largestRemainder } from "../apportion";

const row = (groups: Record<string, string | null>, cost: number): MatrxDrillAnswerRow => ({ groups, measures: { cost }, row_count: 1 });
const POINTS = 20_000;

describe("largestRemainder", () => {
  it("splits a whole number exactly, largest fractions first", () => {
    expect(largestRemainder(1, [0.4, 0.4, 0.2])).toEqual([1, 0, 0]);
    expect(largestRemainder(10, [3.3, 3.3, 3.4])).toEqual([3, 3, 4]);
  });
  it("gives one back when a parent was rounded down by its own split", () => {
    expect(largestRemainder(1, [1, 1])).toEqual([1, 0]);
  });
});

describe("apportionAnswers", () => {
  it("per-row rounding broke the total; apportioned rows add up to it at every level", () => {
    // three people spent 0.00002 $ each = 0.4 credits each; total 1.2 credits → shows 1.
    const q: MatrxDrillQuestion = { by: ["person", "model"], show: ["cost"], where: [] };
    const usd = 0.4 / POINTS;
    const answers = {
      [drillRequestKey([])]: [row({}, 3 * usd)],
      [drillRequestKey(["person"])]: [row({ person: "a" }, usd), row({ person: "b" }, usd), row({ person: "c" }, usd)],
      [drillRequestKey(["person", "model"])]: [row({ person: "a", model: "m" }, usd), row({ person: "b", model: "m" }, usd), row({ person: "c", model: "m" }, usd)],
    };
    const naive = answers[drillRequestKey(["person"])]!.reduce((s, r) => s + Math.round((r.measures.cost as number) * POINTS), 0);
    expect(naive).not.toBe(Math.round(3 * usd * POINTS)); // the defect: 0 vs 1
    const got = apportionAnswers(answers, q, "cost", (v) => v * POINTS, (u) => u / POINTS);
    const pts = (key: string[]) => got[drillRequestKey(key)]!.map((r) => Math.round((r.measures.cost as number) * POINTS));
    expect(pts([])).toEqual([1]);
    expect(pts(["person"]).reduce((a, b) => a + b, 0)).toBe(1);
    const lvl2 = pts(["person", "model"]);
    expect(pts(["person"])).toEqual(lvl2); // each person's one model carries exactly its parent's credits
  });

  it("the rest a group limit left out keeps its share, so shown rows + everything else = the total", () => {
    const q: MatrxDrillQuestion = { by: ["provider"], show: ["cost"], where: [] };
    const answers = {
      [drillRequestKey([])]: [row({}, 10.00004)],
      [drillRequestKey(["provider"])]: [row({ provider: "anthropic" }, 6.00002), row({ provider: "google" }, 3.00001)],
    };
    const got = apportionAnswers(answers, q, "cost", (v) => v * 100, (u) => u / 100);
    const cents = got[drillRequestKey(["provider"])]!.map((r) => Math.round((r.measures.cost as number) * 100));
    expect(cents).toEqual([600, 300]);
    expect(Math.round((got[drillRequestKey([])]![0]!.measures.cost as number) * 100)).toBe(1000);
  });
});
