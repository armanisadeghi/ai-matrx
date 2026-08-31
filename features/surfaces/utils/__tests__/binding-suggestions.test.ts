/**
 * THE AI MAP'S PURE CORE, HELD (P11 + P12).
 *
 * The mapper agent PROPOSES; this module is the gate between what it said and
 * what a person is shown. Everything it names must exist, and everything it
 * names that does not exist must be REPORTED — the assistant is never permitted
 * to invent a row, and it is never permitted to have one quietly dropped.
 */

import {
  buildMapperVariables,
  describeSuggestion,
  parseMapperResult,
  suggestionSourceKeys,
} from "@/features/surfaces/utils/binding-suggestions";


// ── D18.2 — MANY-TO-ONE PROPOSALS ───────────────────────────────────────────
//
// The mapper is ONE agent serving two call sites with different storage: a
// surface binding takes one value per input, a mandate consumption map takes an
// ordered list joined with a blank line. Which one applies is the CALL SITE's
// fact, passed in — and the extras a call site cannot store are DISCARDED WITH
// A REPORT, never silently dropped and never silently applied (P12).

describe("many-to-one proposals", () => {
  const raw = JSON.stringify({
    mappings: [
      {
        target: "working_text",
        map_type: "surface_value",
        surface_value: "task_overview",
        surface_values: ["task_overview", "inputs", "outputs"],
        required: false,
        confidence: "high",
        reason: "This input wants the whole brief.",
      },
    ],
    write_policy_suggestions: [],
    overall_notes: "",
  });
  const args = {
    raw,
    validTargets: new Set(["working_text"]),
    validSurfaceValues: new Set(["task_overview", "inputs", "outputs"]),
    validWriteTargets: new Set<string>(),
  };

  it("keeps the ordered combination when the call site can store one", () => {
    const parsed = parseMapperResult({ ...args, allowManyToOne: true });
    expect(parsed?.suggestions[0].mapping).toEqual({
      mapType: "surface_value",
      target: "task_overview",
      required: false,
    });
    expect(parsed?.suggestions[0].alsoFrom).toEqual(["inputs", "outputs"]);
    expect(parsed?.discarded).toEqual([]);
    expect(describeSuggestion(parsed!.suggestions[0])).toContain(
      "joined in that order",
    );
  });

  it("keeps only the first and REPORTS the rest when it cannot", () => {
    const parsed = parseMapperResult(args);
    expect(parsed?.suggestions[0].alsoFrom).toEqual([]);
    expect(parsed?.discarded.join(" ")).toContain("one value per input");
    expect(parsed?.discarded.join(" ")).toContain("task_overview");
  });

  it("discards an invented value out of a combination and keeps the real ones", () => {
    const parsed = parseMapperResult({
      ...args,
      raw: JSON.stringify({
        mappings: [
          {
            target: "working_text",
            map_type: "surface_value",
            surface_values: ["task_overview", "invented"],
            confidence: "low",
            reason: "",
          },
        ],
        write_policy_suggestions: [],
        overall_notes: "",
      }),
      allowManyToOne: true,
    });
    expect(parsed?.suggestions[0].alsoFrom).toEqual([]);
    expect(parsed?.discarded.join(" ")).toContain("invented");
  });

  it("carries the call site's combination rule to the mapper", () => {
    const vars = buildMapperVariables({
      surfaceName: "mandate.goal_writer",
      surfaceLabel: "Goal Writer",
      agent: {
        name: "a",
        variableDefinitions: [],
        contextPolicies: [],
      },
      surfaceValues: [],
      writeTargets: [],
      combinationRule: "Several values MAY be joined into one input",
    });
    expect(vars.combination_rule).toContain("MAY be joined");
  });
});

// ── G5a — THE PROPOSAL READS LIKE THE EDITOR TWO INCHES AWAY ────────────────
//
// 🚨 The review row used to print RAW STORAGE KEYS while the manual mapping
// editor beside it printed human labels for the same things: `From
// "system_prompt"` next to "System Prompt". Two names for one thing on one
// screen is a lie about one of them, and the raw one reads as a different, more
// technical system than the one the person is actually using. Both sides now go
// through `formatVariableDisplayName` — the manual side's own helper.

describe("the proposal's names", () => {
  const one = (surfaceValue: string) =>
    parseMapperResult({
      raw: JSON.stringify({
        mappings: [
          {
            target: "rulebook_document",
            map_type: "surface_value",
            surface_value: surfaceValue,
            required: false,
            confidence: "high",
            reason: "",
          },
        ],
        write_policy_suggestions: [],
        overall_notes: "",
      }),
      validTargets: new Set(["rulebook_document"]),
      validSurfaceValues: new Set([surfaceValue]),
      validWriteTargets: new Set<string>(),
    })!.suggestions[0];

  it("says the SOURCE the way a person reads it, not the way it is stored", () => {
    expect(describeSuggestion(one("system_prompt"))).toBe(
      'From "System Prompt"',
    );
  });

  it("keeps the raw keys reachable for the row's mono line — nothing is hidden", () => {
    expect(suggestionSourceKeys(one("system_prompt"))).toEqual([
      "system_prompt",
    ]);
    // A decision that takes nothing from the inventory has no source keys.
    const asked = parseMapperResult({
      raw: JSON.stringify({
        mappings: [
          {
            target: "tone",
            map_type: "prompt_user",
            prompt: "Which tone?",
            confidence: "high",
            reason: "",
          },
        ],
        write_policy_suggestions: [],
        overall_notes: "",
      }),
      validTargets: new Set(["tone"]),
      validSurfaceValues: new Set<string>(),
      validWriteTargets: new Set<string>(),
    })!.suggestions[0];
    expect(suggestionSourceKeys(asked)).toEqual([]);
  });
});
