import {
  applyAiModelFilters,
  sortAiModels,
  type AiModelComparisonRow,
} from "../filterUtils";

const models = [
  {
    id: "alpha",
    name: "alpha-model",
    common_name: "Alpha",
    maker: "Maker A",
    capabilities: {
      input: ["text", "image"],
      output: ["text"],
      features: [],
      interaction: "turn",
    },
    is_deprecated: false,
    is_primary: false,
    is_premium: false,
    context_window: 100_000,
    max_tokens: 8_000,
    preferred_pricing: {
      input_price: 3,
      output_price: 15,
      cached_input_price: 0.3,
      usage_basis: null,
    },
  },
  {
    id: "beta",
    name: "beta-model",
    common_name: "Beta",
    maker: "Maker B",
    capabilities: {
      input: ["text"],
      output: ["image"],
      features: [],
      interaction: "single",
    },
    is_deprecated: false,
    is_primary: false,
    is_premium: true,
    context_window: 32_000,
    max_tokens: 4_000,
    preferred_pricing: {
      input_price: 0,
      output_price: 0.03,
      cached_input_price: 0,
      usage_basis: "image_output",
    },
  },
  {
    id: "gamma",
    name: "gamma-model",
    common_name: "Gamma",
    maker: "Maker C",
    capabilities: {
      input: ["text"],
      output: ["text"],
      features: [],
      interaction: "turn",
    },
    is_deprecated: false,
    is_primary: false,
    is_premium: false,
    context_window: 200_000,
    max_tokens: 16_000,
    preferred_pricing: {
      input_price: 1,
      output_price: 5,
      cached_input_price: 0.1,
      usage_basis: null,
    },
  },
  {
    id: "delta",
    name: "delta-model",
    common_name: "Delta",
    maker: "Maker D",
    capabilities: {
      input: ["text"],
      output: ["audio"],
      features: [],
      interaction: "turn",
    },
    is_deprecated: false,
    is_primary: false,
    is_premium: false,
    context_window: 16_000,
    max_tokens: 2_000,
    preferred_pricing: null,
  },
] satisfies AiModelComparisonRow[];

describe("AI model comparison filtering", () => {
  it("filters models by canonical output modality", () => {
    expect(
      applyAiModelFilters(models, "", {
        is_deprecated: false,
        output_capability: "text",
      }).map((model) => model.id),
    ).toEqual(["alpha", "gamma"]);
  });

  it("includes canonical modalities in search", () => {
    expect(
      applyAiModelFilters(models, "image", { is_deprecated: false }).map(
        (model) => model.id,
      ),
    ).toEqual(["alpha", "beta"]);
  });

  it("sorts the filtered text models by preferred output price", () => {
    const textModels = applyAiModelFilters(models, "", {
      is_deprecated: false,
      output_capability: "text",
    });
    expect(
      sortAiModels(textModels, "output_price", "asc").map(
        (model) => model.id,
      ),
    ).toEqual(["gamma", "alpha"]);
  });

  it("keeps missing prices last in either sort direction", () => {
    expect(
      sortAiModels(models, "output_price", "desc").map((model) => model.id),
    ).toEqual(["alpha", "gamma", "beta", "delta"]);
  });
});
