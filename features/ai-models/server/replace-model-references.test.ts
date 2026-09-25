import {
  buildReplacementSettings,
  patchReplacementModelTiers,
} from "./replace-model-references";

describe("buildReplacementSettings — a model replace never wipes and never gates", () => {
  const agent = {
    model_id: "old",
    temperature: 0.2,
    reasoning_effort: "xhigh",
    max_output_tokens: 64000,
  };

  it("keeps every setting the admin did not touch", () => {
    expect(buildReplacementSettings("new", agent)).toEqual({
      ...agent,
      model_id: "new",
    });
  });

  it("layers explicit overrides on top instead of replacing the blob", () => {
    expect(
      buildReplacementSettings("new", agent, { temperature: 0.7 }),
    ).toEqual({ ...agent, temperature: 0.7, model_id: "new" });
  });

  it("applies a ticked swap only where the row holds the `from` value", () => {
    const swaps = [{ key: "reasoning_effort", from: "xhigh", to: "high" }];
    expect(buildReplacementSettings("new", agent, undefined, swaps)).toEqual({
      ...agent,
      reasoning_effort: "high",
      model_id: "new",
    });
    expect(
      buildReplacementSettings(
        "new",
        { ...agent, reasoning_effort: "low" },
        undefined,
        swaps,
      ).reasoning_effort,
    ).toBe("low");
  });

  it("a swap with no `to` removes the setting", () => {
    const out = buildReplacementSettings("new", agent, undefined, [
      { key: "max_output_tokens", from: 64000 },
    ]);
    expect("max_output_tokens" in out).toBe(false);
    expect(out.model_id).toBe("new");
  });

  it("no swaps and no overrides is still a complete replace", () => {
    expect(buildReplacementSettings("new", null)).toEqual({ model_id: "new" });
  });
});

describe("patchReplacementModelTiers — every tier shape survives", () => {
  it("an ARRAY of tiers stays an array and its entries are swapped", () => {
    const tiers = [
      { tier: "primary", model_id: "old" },
      { tier: "backup", model_id: "other" },
    ];
    expect(patchReplacementModelTiers(tiers, "old", "new")).toEqual([
      { tier: "primary", model_id: "new" },
      { tier: "backup", model_id: "other" },
    ]);
  });

  it("an object with default and keyed tiers is swapped in place", () => {
    expect(
      patchReplacementModelTiers(
        { default: "old", tiers: { fast: { model_id: "old" } } },
        "old",
        "new",
      ),
    ).toEqual({ default: "new", tiers: { fast: { model_id: "new" } } });
  });

  it("an unrelated tier list is returned unchanged", () => {
    const tiers = [{ tier: "primary", model_id: "gpt-4.1" }];
    expect(patchReplacementModelTiers(tiers, "old", "new")).toEqual(tiers);
  });
});

describe("buildReplacementSettings — a null override removes the key", () => {
  it("never writes key: null", () => {
    const out = buildReplacementSettings(
      "new",
      { model_id: "old", top_p: 1 },
      { top_p: null } as unknown as Parameters<typeof buildReplacementSettings>[2],
    );
    expect("top_p" in out).toBe(false);
  });
});
