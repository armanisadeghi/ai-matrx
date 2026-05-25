import { buildInstanceBaseSettings } from "../base-settings";

describe("buildInstanceBaseSettings — model fold", () => {
  it("folds modelId in as the LLMParams `model` key", () => {
    expect(buildInstanceBaseSettings({ temperature: 1 }, "m-1")).toEqual({
      temperature: 1,
      model: "m-1",
    });
  });

  it("omits model when modelId is null/undefined (no stray key)", () => {
    expect(buildInstanceBaseSettings({ temperature: 1 }, null)).toEqual({
      temperature: 1,
    });
    expect(buildInstanceBaseSettings({ temperature: 1 }, undefined)).toEqual({
      temperature: 1,
    });
  });

  it("handles null/undefined settings", () => {
    expect(buildInstanceBaseSettings(null, "m-1")).toEqual({ model: "m-1" });
    expect(buildInstanceBaseSettings(undefined, undefined)).toEqual({});
  });

  it("the explicit modelId wins over any model already in settings", () => {
    expect(
      buildInstanceBaseSettings(
        { model: "stale" } as Record<string, unknown>,
        "fresh",
      ),
    ).toEqual({ model: "fresh" });
  });
});
