/**
 * The regression suite for the repin pre-flight.
 *
 * The first test IS the acceptance test for the whole variable-binding
 * workstream: `podcast.deep_research` broke exactly this way, and this console
 * caused it by suggesting an unchecked repin. If this test ever goes green by
 * being deleted or weakened, the bug class is back.
 */

import {
  buildRepinFixBrief,
  computeRepinImpact,
} from "../repin-impact";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

const v = (
  name: string,
  extra: Partial<VariableDefinition> = {},
): VariableDefinition => ({ name, defaultValue: undefined, ...extra });

describe("computeRepinImpact", () => {
  it("catches the podcast.deep_research breakage: candidate declares nothing", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("user_request")],
      candidateVariables: [],
    });
    expect(impact.clean).toBe(false);
    expect(impact.breaking).toEqual([
      { name: "user_request", verdict: "lost" },
    ]);
  });

  it("treats a pure rename as non-breaking and suggests the mapping", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("time_of_day")],
      candidateVariables: [v("timeOfDay")],
    });
    expect(impact.breaking).toHaveLength(0);
    expect(impact.cautions).toEqual([
      {
        name: "time_of_day",
        verdict: "rename_candidate",
        suggestedMapping: "timeOfDay",
      },
    ]);
  });

  it("is clean when the candidate declares everything that flows", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("page"), v("keywords")],
      candidateVariables: [v("page"), v("keywords")],
    });
    expect(impact.clean).toBe(true);
    expect(impact.indeterminate).toBe(false);
  });

  it("does not block on a candidate variable that has a default", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("page")],
      candidateVariables: [
        v("page"),
        v("tone", { defaultValue: "neutral", required: true }),
      ],
    });
    expect(impact.breaking).toHaveLength(0);
  });

  it("blocks when the candidate requires something nothing supplies", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("page")],
      candidateVariables: [v("page"), v("locale", { required: true })],
    });
    expect(impact.breaking).toEqual([
      { name: "locale", verdict: "unsupplied_required" },
    ]);
  });

  it("ignores an optional candidate variable nobody supplies", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("page")],
      candidateVariables: [v("page"), v("nickname")],
    });
    expect(impact.clean).toBe(true);
  });

  it("unions the stale contract and the code truth into what must flow", () => {
    // The stored contract is empty (the measured state of 51 slots) — the
    // code-truth seam still surfaces the loss.
    const impact = computeRepinImpact({
      currentVariables: [],
      candidateVariables: [],
      contractRequired: [],
      codeSuppliedVariables: ["user_request"],
    });
    expect(impact.breaking).toEqual([
      { name: "user_request", verdict: "lost" },
    ]);
  });

  it("reports indeterminate rather than a reassuring empty result", () => {
    const impact = computeRepinImpact({
      currentVariables: null,
      candidateVariables: [v("anything")],
    });
    expect(impact.indeterminate).toBe(true);
  });
});

describe("buildRepinFixBrief", () => {
  it("names the slot, the lost variable, and the update-every-use requirement", () => {
    const impact = computeRepinImpact({
      currentVariables: [v("user_request")],
      candidateVariables: [],
    });
    const brief = buildRepinFixBrief({
      slotKey: "podcast.deep_research",
      candidateName: "Deep Web Research Agent",
      impact,
    });
    expect(brief).toContain("podcast.deep_research");
    expect(brief).toContain("Deep Web Research Agent");
    expect(brief).toContain("user_request");
    expect(brief).toContain("EVERY call site");
    expect(brief).toContain("agent-variable-binding/FEATURE.md");
  });
});
