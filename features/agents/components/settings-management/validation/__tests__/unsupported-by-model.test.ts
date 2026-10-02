/**
 * Guardrail test for the "unsupported-by-model" rule + its one-click repair.
 *
 * Settings that hold a value the selected model does not carry natively are
 * never hidden and never dropped automatically: the rule marks them (info,
 * "Translated for this model" — the server translates, settings-translation
 * K7), "Fix all" leaves them alone, and clearing is the person's explicit
 * action (the row's clear control → key removed).
 */

import { validateConfig } from "../engine";
import { resolveConfig } from "../resolve-config";
import { canFixIssue, applyFixForIssue } from "../apply-fix";
import type { NormalizedControls } from "@ai-matrx/chat/agents/hooks/useModelControls";
import type { FeLlmParams } from "@ai-matrx/chat/agents/types/agent-api-types";

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
  it("treats top-level routing identity copied into settings as recognized", () => {
    const config = resolveConfig(
      settings({ model_id: "model-x", temperature: 1 }),
      "model-x",
      controlsWithTemp,
      null,
    );
    const result = validateConfig(config);

    expect(
      result.issues.some(
        (issue) =>
          issue.key === "model_id" && issue.category === "unrecognized_key",
      ),
    ).toBe(false);
  });

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

  it("is kept, not auto-fixed; an explicit clear removes only that key", () => {
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
    expect(issue!.severity).toBe("info");
    expect(issue!.message).toBe("Translated for this model");
    // "Fix all fixable" must never drop a translated setting.
    expect(canFixIssue(issue!, controlsWithTemp)).toBe(false);

    const cleared = applyFixForIssue(
      issue!,
      settings({ temperature: 1, reasoning_effort: "high" }),
      controlsWithTemp,
    ) as Record<string, unknown>;

    expect("reasoning_effort" in cleared).toBe(false); // absent, not null
    expect(cleared.temperature).toBe(1); // supported value preserved
  });
});
