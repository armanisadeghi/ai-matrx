/**
 * Guardrail test for the "unsupported-by-model" rule + its one-click repair.
 *
 * This rule restores the repair capability for settings that hold a value but
 * are not supported by the selected model: it surfaces them in the IssueTable
 * (caution at the top) and makes them fixable (clear) — both per-row and via
 * "Fix all".
 */

import { validateConfig } from "../engine";
import { resolveConfig } from "../resolve-config";
import { canFixIssue, applyFixForIssue } from "../apply-fix";
import type { NormalizedControls } from "@/features/agents/hooks/useModelControls";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";

const controlsWithTemp = {
  temperature: { type: "number", min: 0, max: 2 },
  rawControls: {},
  unmappedControls: {},
} as unknown as NormalizedControls;

const emptyControls = {
  rawControls: {},
  unmappedControls: {},
} as unknown as NormalizedControls;

const settings = (o: Record<string, unknown>) => o as unknown as FeLlmParams;

describe("unsupported-by-model rule", () => {
  it("flags a valued LLM param the model declares no control for", () => {
    const config = resolveConfig(
      settings({ temperature: 1, reasoning_effort: "high" }),
      "model-x",
      controlsWithTemp,
      null,
    );
    const result = validateConfig(config);

    const flagged = result.issues.find(
      (i) =>
        i.key === "reasoning_effort" &&
        i.category === "unsupported_by_model",
    );
    expect(flagged).toBeDefined();

    // A supported param is NOT flagged.
    expect(
      result.issues.some(
        (i) =>
          i.key === "temperature" && i.category === "unsupported_by_model",
      ),
    ).toBe(false);
  });

  it("never flags UI capability flags (model-independent)", () => {
    const config = resolveConfig(
      settings({ tools: ["x"], image_urls: true, file_urls: true }),
      "model-x",
      controlsWithTemp,
      null,
    );
    const result = validateConfig(config);
    expect(
      result.issues.some((i) => i.category === "unsupported_by_model"),
    ).toBe(false);
  });

  it("does not flag anything when the model declares no controls (data gap)", () => {
    const config = resolveConfig(
      settings({ reasoning_effort: "high" }),
      "model-x",
      emptyControls,
      null,
    );
    const result = validateConfig(config);
    expect(
      result.issues.some((i) => i.category === "unsupported_by_model"),
    ).toBe(false);
  });

  it("is fixable, and the fix clears only the unsupported key", () => {
    const config = resolveConfig(
      settings({ temperature: 1, reasoning_effort: "high" }),
      "model-x",
      controlsWithTemp,
      null,
    );
    const issue = validateConfig(config).issues.find(
      (i) => i.category === "unsupported_by_model",
    );
    expect(issue).toBeDefined();
    expect(canFixIssue(issue!, controlsWithTemp)).toBe(true);

    const fixed = applyFixForIssue(
      issue!,
      settings({ temperature: 1, reasoning_effort: "high" }),
      controlsWithTemp,
    ) as Record<string, unknown>;

    expect(fixed.reasoning_effort).toBeUndefined(); // cleared
    expect(fixed.temperature).toBe(1); // supported value preserved
  });
});
