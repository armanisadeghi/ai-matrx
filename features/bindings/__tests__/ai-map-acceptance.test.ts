/**
 * THE AI MAP, END TO END, ON A REAL ANSWER.
 *
 * The payload below is NOT manufactured. It is the verbatim structured output
 * of the deployed `surfaces_client.binding_mapper` agent (aidream v0.2.452,
 * gemini-3.1-pro-preview) run on 2026-08-31 against the real
 * `mandate.goal_writer` offer and the real Agent Goal Writer contract, with the
 * call site's `combination_rule` set to permit combinations.
 *
 * It is here because a test that feeds its author's own invented JSON to its
 * author's own parser proves nothing: the thing that had to be true is that the
 * MODEL actually answers with an ordered `surface_values` list when an input
 * genuinely wants several values, and that this client turns that answer into
 * the map the server stores. Both halves are asserted below on that one answer.
 */

import {
  parseMapperResult,
  suggestionsToMappings,
  describeSuggestion,
} from "@/features/surfaces/utils/binding-suggestions";
import { applySuggestions, sourcesFor } from "@/features/bindings/consumption-writer";
import type { OfferedValue } from "@/features/mandates/provision-shapes";

/** Verbatim: the deployed agent's answer, 2026-08-31. */
const REAL_ANSWER = JSON.stringify({
  mappings: [
    {
      prompt: null,
      reason:
        "The agent needs everything known about the agent, so we combine the task overview, inputs, outputs, and system prompt into one input.",
      target: "source_material",
      map_type: "surface_value",
      required: false,
      confidence: "high",
      direct_value: null,
      surface_value: "task_overview",
      surface_values: ["task_overview", "inputs", "outputs", "system_prompt"],
    },
    {
      prompt: null,
      reason:
        "The full agent object provides exactly the JSON definition the agent is asking for.",
      target: "agent_definition",
      map_type: "surface_value",
      required: false,
      confidence: "high",
      direct_value: null,
      surface_value: "full_agent_object",
      surface_values: null,
    },
  ],
  overall_notes:
    "The configuration provides the agent with all available details about the task, inputs, outputs, and system prompt combined into the source material. It also directly maps the full agent object as requested.",
  write_policy_suggestions: [],
});

/** The real offer: mandate.goal_writer's five described inputs. */
const OFFERED_NAMES = [
  "task_overview",
  "inputs",
  "outputs",
  "system_prompt",
  "full_agent_object",
];
const OFFERED = new Map<string, OfferedValue>(
  OFFERED_NAMES.map((name) => [
    name,
    // Every described input of this mandate is OPTIONAL — none is `required`
    // in its draft_inputs — which is why each joined source must carry an
    // absence answer for the server to accept the map.
    { name, kind: "text", guaranteed: false, lazy: false, description: "" },
  ]),
);
const TARGETS = ["source_material", "agent_definition"];

const ARGS = {
  raw: REAL_ANSWER,
  validTargets: new Set(TARGETS),
  validSurfaceValues: new Set(OFFERED_NAMES),
  validWriteTargets: new Set<string>(),
  sourceNoun: "offered value",
};

describe("the deployed mapper's real answer", () => {
  it("proposes a FOUR-value combination, in order, with its reason", () => {
    const proposal = parseMapperResult({ ...ARGS, allowManyToOne: true });
    const combined = proposal!.suggestions.find(
      (s) => s.target === "source_material",
    )!;
    expect(combined.mapping).toEqual({
      mapType: "surface_value",
      target: "task_overview",
      required: false,
    });
    expect(combined.alsoFrom).toEqual(["inputs", "outputs", "system_prompt"]);
    expect(combined.confidence).toBe("high");
    expect(combined.reason).toContain("combine");
    expect(describeSuggestion(combined)).toContain("joined in that order");
    // Nothing was invented, so nothing was discarded.
    expect(proposal!.discarded).toEqual([]);
  });

  it("accepting fills the editor with the whole combination, in that order", () => {
    const proposal = parseMapperResult({ ...ARGS, allowManyToOne: true })!;
    const map = applySuggestions({
      map: {},
      suggestions: proposal.suggestions,
      targetNames: TARGETS,
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect(
      sourcesFor(map, "source_material").map((e) =>
        e.mapType === "offered_value" ? e.target : e.mapType,
      ),
    ).toEqual(["task_overview", "inputs", "outputs", "system_prompt"]);
    // P9 — every joined source of an OPTIONAL value declares its absence
    // answer, or the server refuses the whole map.
    for (const entry of sourcesFor(map, "source_material")) {
      expect(entry).toMatchObject({ when_absent: "skip", deliver: "variable" });
    }
    expect(
      sourcesFor(map, "agent_definition").map((e) =>
        e.mapType === "offered_value" ? e.target : e.mapType,
      ),
    ).toEqual(["full_agent_object"]);
  });

  it("the SAME answer keeps only one value per input on a surface binding, and says so", () => {
    // The identical model answer, read by a call site that cannot store a
    // combination. The extras are reported, never silently dropped.
    const proposal = parseMapperResult(ARGS)!;
    const combined = proposal.suggestions.find(
      (s) => s.target === "source_material",
    )!;
    expect(combined.alsoFrom).toEqual([]);
    expect(proposal.discarded.join(" ")).toContain("one value per input");
    expect(suggestionsToMappings(proposal.suggestions).source_material).toEqual({
      mapType: "surface_value",
      target: "task_overview",
      required: false,
    });
  });
});
