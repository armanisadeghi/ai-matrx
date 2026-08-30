/**
 * The regression suite for the rebind pre-flight.
 *
 * The first test IS the acceptance test for the whole variable-binding
 * workstream: `podcast.deep_research` broke exactly this way, and this console
 * caused it by suggesting an unchecked rebind. If this test ever goes green by
 * being deleted or weakened, the bug class is back.
 */

import {
  buildRebindFixBrief,
  codeTruthRebindImpact,
  computeRebindImpact,
} from "../rebind-impact";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

const v = (
  name: string,
  extra: Partial<VariableDefinition> = {},
): VariableDefinition => ({ name, defaultValue: undefined, ...extra });

describe("computeRebindImpact", () => {
  it("catches the podcast.deep_research breakage: candidate declares nothing", () => {
    const impact = computeRebindImpact({
      currentVariables: [v("user_request")],
      candidateVariables: [],
    });
    expect(impact.clean).toBe(false);
    expect(impact.breaking).toEqual([
      { name: "user_request", verdict: "lost" },
    ]);
  });

  it("treats a pure rename as non-breaking and suggests the mapping", () => {
    const impact = computeRebindImpact({
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
    const impact = computeRebindImpact({
      currentVariables: [v("page"), v("keywords")],
      candidateVariables: [v("page"), v("keywords")],
    });
    expect(impact.clean).toBe(true);
    expect(impact.indeterminate).toBe(false);
  });

  it("does not block on a candidate variable that has a default", () => {
    const impact = computeRebindImpact({
      currentVariables: [v("page")],
      candidateVariables: [
        v("page"),
        v("tone", { defaultValue: "neutral", required: true }),
      ],
    });
    expect(impact.breaking).toHaveLength(0);
  });

  it("blocks when the candidate requires something nothing supplies", () => {
    const impact = computeRebindImpact({
      currentVariables: [v("page")],
      candidateVariables: [v("page"), v("locale", { required: true })],
    });
    expect(impact.breaking).toEqual([
      { name: "locale", verdict: "unsupplied_required" },
    ]);
  });

  it("ignores an optional candidate variable nobody supplies", () => {
    const impact = computeRebindImpact({
      currentVariables: [v("page")],
      candidateVariables: [v("page"), v("nickname")],
    });
    expect(impact.clean).toBe(true);
  });

  it("unions the stale contract and the code truth into what must flow", () => {
    // The stored contract is empty (the measured state of 51 mandates) — the
    // code-truth seam still surfaces the loss.
    const impact = computeRebindImpact({
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
    const impact = computeRebindImpact({
      currentVariables: null,
      candidateVariables: [v("anything")],
    });
    expect(impact.indeterminate).toBe(true);
  });
});

describe("buildRebindFixBrief", () => {
  it("names the mandate, the lost variable, and the update-every-use requirement", () => {
    const impact = computeRebindImpact({
      currentVariables: [v("user_request")],
      candidateVariables: [],
    });
    const brief = buildRebindFixBrief({
      mandateKey: "podcast.deep_research",
      candidateName: "Deep Web Research Agent",
      impact,
    });
    expect(brief).toContain("podcast.deep_research");
    expect(brief).toContain("Deep Web Research Agent");
    expect(brief).toContain("user_request");
    expect(brief).toContain("EVERY call site");
    expect(brief).toContain("agent-variable-binding/FEATURE.md");
  });

  it("includes the live runner, source, bound-agent declaration, and call sites", () => {
    const codeTruth = {
      mandate_key: "podcast.deep_research",
      resolution: "code_declaration_found" as const,
      drift: "code_only" as const,
      bound_agent_drift: "code_only" as const,
      code_variables: ["user_request"],
      db_required_variables: [],
      code_only_variables: ["user_request"],
      db_only_variables: [],
      bound_agent_missing_variables: ["user_request"],
      bound_agent_only_variables: [],
      source: {
        class_name: "DeepResearchAgent",
        module: "matrx_ai.agent_runners.podcast_generator",
        source_file: "/srv/aidream/podcast_generator.py",
        line: 120,
      },
      inputs: [
        {
          name: "user_request",
          mapped_name: "user_request",
          type: "str",
          required: true,
        },
      ],
      variable_map: {},
      output: null,
      passes_user_input: false,
      call_sites: [
        {
          source_file: "/srv/aidream/podcast_generator.py",
          line: 188,
          passes_user_input: false,
        },
      ],
      bound_agent: {
        id: "agent-1",
        name: "Deep Web Research Agent",
        declared_variables: [],
      },
      import_error: null,
    };
    const impact = codeTruthRebindImpact(codeTruth);
    const brief = buildRebindFixBrief({
      mandateKey: codeTruth.mandate_key,
      candidateName: codeTruth.bound_agent.name,
      impact,
      codeTruth,
    });

    expect(impact.breaking).toEqual([
      { name: "user_request", verdict: "lost" },
    ]);
    expect(brief).toContain("DeepResearchAgent");
    expect(brief).toContain("/srv/aidream/podcast_generator.py:188");
    expect(brief).toContain("Bound agent declares: none");
    expect(brief).toContain("This Mandate accepts user text: no");
  });
});
