import { settingsUnchanged, unionUsageSettings } from "./unionUsageSettings";
import type { ModelUsageResult } from "../types";

function usage(partial: Partial<ModelUsageResult>): ModelUsageResult {
  return {
    prompts: [],
    promptBuiltins: [],
    agents: [],
    agentTemplates: [],
    ...partial,
  };
}

describe("unionUsageSettings", () => {
  it("returns empty settings when nothing is loaded", () => {
    expect(unionUsageSettings(null)).toEqual({});
  });

  it("unions live agent settings and drops model identity keys", () => {
    const result = unionUsageSettings(
      usage({
        agents: [
          {
            id: "a",
            name: "A",
            table: "agent.definition",
            settings: {
              model_id: "old",
              temperature: 0.2,
              max_output_tokens: 4096,
            },
          },
          {
            id: "b",
            name: "B",
            table: "agent.definition",
            settings: { temperature: 0.8, top_p: 0.9 },
          },
        ],
      }),
    );
    expect(result).toEqual({
      temperature: 0.2,
      max_output_tokens: 4096,
      top_p: 0.9,
    });
  });
});

describe("settingsUnchanged", () => {
  it("treats keep-my-settings as unchanged even if key order differs", () => {
    expect(
      settingsUnchanged(
        { temperature: 0.2, top_p: 0.9 },
        { top_p: 0.9, temperature: 0.2, model: "old" },
      ),
    ).toBe(true);
  });

  it("detects a real override", () => {
    expect(settingsUnchanged({ temperature: 1 }, { temperature: 0.2 })).toBe(
      false,
    );
  });
});
