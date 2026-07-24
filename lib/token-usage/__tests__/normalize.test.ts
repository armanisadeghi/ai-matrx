import {
  normalizeTokenUsage,
  rollupByModel,
} from "@/lib/token-usage/normalize";

/**
 * Regression suite for the shape bug that made every research cost read $0:
 * readers assumed a flat `{ input_tokens, estimated_cost }` payload, but the
 * server has only ever written `{ total, by_model }`. The first test uses a
 * verbatim `rs_analysis.token_usage` row from production.
 */

const REAL_ROW = {
  total: {
    total_cost: 0.01473161,
    input_tokens: 3929,
    total_tokens: 8308,
    output_tokens: 2587,
    unique_models: 1,
    total_requests: 1,
    cached_input_tokens: 1792,
    known_cost_subtotal: 0.01473161,
    unknown_cost_requests: 0,
    catalog_priced_requests: 1,
    provider_reported_requests: 0,
  },
  by_model: {
    "gpt-5.4-mini": {
      api: "openai",
      cost: 0.01473161,
      input_tokens: 3929,
      total_tokens: 8308,
      output_tokens: 2587,
      request_count: 1,
      cached_input_tokens: 1792,
    },
  },
};

describe("normalizeTokenUsage", () => {
  it("reads the canonical aggregated shape a real row carries", () => {
    const usage = normalizeTokenUsage(REAL_ROW);
    expect(usage).not.toBeNull();
    expect(usage!.shape).toBe("aggregated");
    expect(usage!.inputTokens).toBe(3929);
    expect(usage!.cachedInputTokens).toBe(1792);
    expect(usage!.outputTokens).toBe(2587);
    expect(usage!.totalTokens).toBe(8308);
    expect(usage!.costUsd).toBeCloseTo(0.01473161, 8);
    expect(usage!.costIsComplete).toBe(true);
    expect(usage!.models).toEqual([
      expect.objectContaining({ model: "gpt-5.4-mini", api: "openai" }),
    ]);
  });

  it("falls back to the by_model subtotal when the rollup omits cost", () => {
    const usage = normalizeTokenUsage({
      total: { input_tokens: 10, output_tokens: 5 },
      by_model: {
        a: { cost: 0.5, input_tokens: 6 },
        b: { cost: 0.25, input_tokens: 4 },
      },
    });
    expect(usage!.costUsd).toBeCloseTo(0.75, 8);
  });

  it("reports an unpriced blob as null cost, never as free", () => {
    const usage = normalizeTokenUsage({
      total: {
        input_tokens: 100,
        output_tokens: 20,
        total_cost: null,
        unknown_cost_requests: 1,
      },
      by_model: { mystery: { input_tokens: 100, cost: null } },
    });
    expect(usage!.costUsd).toBeNull();
    expect(usage!.costIsComplete).toBe(false);
    expect(usage!.unknownCostRequests).toBe(1);
  });

  it("still reads pre-2026 flat rows", () => {
    const usage = normalizeTokenUsage({
      input_tokens: 100,
      output_tokens: 40,
      estimated_cost: 0.002,
      model: "legacy-model",
    });
    expect(usage!.shape).toBe("flat");
    expect(usage!.inputTokens).toBe(100);
    expect(usage!.totalTokens).toBe(140);
    expect(usage!.costUsd).toBeCloseTo(0.002, 8);
  });

  it("returns null for blobs with no signal at all", () => {
    expect(normalizeTokenUsage(null)).toBeNull();
    expect(normalizeTokenUsage({})).toBeNull();
    expect(normalizeTokenUsage("nope")).toBeNull();
    expect(normalizeTokenUsage([1, 2])).toBeNull();
  });
});

describe("rollupByModel", () => {
  it("sums per-model usage across calls, priciest first", () => {
    const rolled = rollupByModel([
      normalizeTokenUsage(REAL_ROW),
      normalizeTokenUsage(REAL_ROW),
      normalizeTokenUsage({
        total: { input_tokens: 1, output_tokens: 1, total_cost: 5 },
        by_model: {
          "gemini-3-flash-preview": {
            api: "google",
            cost: 5,
            input_tokens: 1,
            request_count: 1,
          },
        },
      }),
    ]);
    expect(rolled.map((m) => m.model)).toEqual([
      "gemini-3-flash-preview",
      "gpt-5.4-mini",
    ]);
    const openai = rolled.find((m) => m.model === "gpt-5.4-mini")!;
    expect(openai.requests).toBe(2);
    expect(openai.inputTokens).toBe(7858);
    expect(openai.costUsd).toBeCloseTo(0.02946322, 8);
  });
});
