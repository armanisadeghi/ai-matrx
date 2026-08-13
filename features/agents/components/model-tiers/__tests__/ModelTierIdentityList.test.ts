import { readModelTierIdentities } from "../ModelTierIdentityList";

describe("readModelTierIdentities", () => {
  it("extracts the default and named nested tier models", () => {
    expect(
      readModelTierIdentities({
        default: "model-default",
        tiers: {
          premium: { modelId: "model-premium", label: "Best quality" },
          fast: { modelId: "model-fast" },
        },
      }),
    ).toEqual([
      { key: "default", role: "Default", modelId: "model-default" },
      {
        key: "tier:premium",
        role: "Best quality",
        modelId: "model-premium",
      },
      { key: "tier:fast", role: "fast", modelId: "model-fast" },
    ]);
  });

  it("ignores malformed tier values instead of rendering them as IDs", () => {
    expect(
      readModelTierIdentities({
        default: null,
        tiers: { broken: { modelId: 42 }, empty: null },
      }),
    ).toEqual([]);
  });
});
