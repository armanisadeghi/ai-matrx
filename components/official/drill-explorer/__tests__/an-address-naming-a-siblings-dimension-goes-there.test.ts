/**
 * AN ADDRESS NAMING A DIMENSION THE DEFINITION LACKS (lane DRILL-LIVE-FIX-2 #2; live verifier on release
 * 13e0b6fafe): plain `?by=conversation` on /administration/usage (ai_usage, which has no conversation)
 * failed at the door. It now goes to the sibling that has it — the one the definition's own
 * cross-definition breakout names — with the filters it has kept; a Dimension no sibling has is said.
 * Red on HEAD: drillAddressMisfit did not exist and the explorer asked ai_usage by conversation.
 */
jest.mock("@/components/cost/pointsRate", () => ({ currentPointsRate: () => 20000 }));

import { drillAddressMisfit, type DrillSiblingDefinition } from "../drillSiblings";

const AI_USAGE = {
  label: "AI usage",
  dimensions: [
    { key: "person", level: { breakouts: ["model", "ai_usage_executions:conversation", "at:day"] } },
    { key: "model" },
    { key: "at" },
  ],
};
const sib = (token: string, dims: string[], measures: string[], levelShow?: string[]) =>
  ({
    token,
    group: token,
    go: () => {},
    source: { kind: "entity", token },
    def: {
      key: token,
      label: token,
      dimensions: dims.map((key) => ({ key, label: key, kind: "text", ...(key === "conversation" && levelShow ? { level: { show: levelShow } } : {}) })),
      measures: measures.map((key) => ({ key, label: key, op: "sum" })),
    },
  }) as unknown as DrillSiblingDefinition;

const CALLS = sib("ai_calls", ["conversation", "model", "at"], ["cost"]);
const EXECUTIONS = sib("ai_usage_executions", ["conversation", "person", "at"], ["cost", "calls"], ["cost", "calls", "duration"]);

describe("an address naming a sibling's Dimension", () => {
  it("?by=conversation goes to the sibling the definition's breakout names, filters it has kept", () => {
    const got = drillAddressMisfit(
      AI_USAGE,
      [CALLS, EXECUTIONS],
      { by: ["conversation"], show: ["cost", "requests"], where: [{ dim: "person", value: "p1" }, { dim: "model", value: "gpt" }], window: "30d" },
      true,
    );
    expect(got && "route" in got ? got.route.token : got).toBe("ai_usage_executions");
    expect(got && "route" in got ? got.question : null).toEqual({ by: ["conversation"], show: ["cost", "calls", "duration"], where: [{ dim: "person", value: "p1" }], window: "30d" });
  });
  it("a Dimension no sibling has is said in words; nothing is decided before every sibling is described", () => {
    const q = { by: ["planet"], show: ["cost"], where: [], window: "30d" };
    expect(drillAddressMisfit(AI_USAGE, [CALLS], q, false)).toBeNull();
    expect(drillAddressMisfit(AI_USAGE, [CALLS, EXECUTIONS], q, true)).toEqual({ sentence: "AI usage has no “planet” to ask by." });
  });
  it("an address the definition answers is left alone", () => {
    expect(drillAddressMisfit(AI_USAGE, [CALLS], { by: ["at:day", "person"], show: ["cost"], where: [] }, true)).toBeNull();
  });
});
