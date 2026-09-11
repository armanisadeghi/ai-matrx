const mockOrder = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          is: () => ({ order: (...args: unknown[]) => mockOrder(...args) }),
        }),
      }),
    }),
  },
}));

import { aiModelService } from "./service";

describe("AI offering boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps non-applicable price directions as null without dropping the catalog", async () => {
    mockOrder.mockResolvedValue({
      error: null,
      data: [
        {
          id: "offering-1",
          pricing: [
            {
              max_tokens: null,
              input_price: 120,
              output_price: null,
              cached_input_price: 0,
              usage_basis: "character_input",
            },
          ],
          capabilities_override: {},
          override: { params: {}, constraints: [] },
          metadata: {},
        },
      ],
    });

    const offerings = await aiModelService.fetchOfferings();

    expect(offerings).toHaveLength(1);
    expect(offerings[0].pricing[0]).toMatchObject({
      input_price: 120,
      output_price: null,
      cached_input_price: 0,
      usage_basis: "character_input",
    });
  });

  it("still rejects a non-numeric non-null price", async () => {
    mockOrder.mockResolvedValue({
      error: null,
      data: [
        {
          id: "offering-2",
          pricing: [
            {
              max_tokens: null,
              input_price: "120",
              output_price: null,
              cached_input_price: 0,
            },
          ],
          capabilities_override: {},
          override: { params: {}, constraints: [] },
          metadata: {},
        },
      ],
    });

    await expect(aiModelService.fetchOfferings()).rejects.toThrow(
      "ai.offering.offering-2.pricing[0].input_price: expected a finite number",
    );
  });

  it("treats a null optional processor as absent without weakening string validation", async () => {
    mockOrder.mockResolvedValue({
      error: null,
      data: [
        {
          id: "offering-3",
          pricing: [],
          capabilities_override: {},
          override: {
            params: {
              temperature: { supported: false, processor: null },
              reasoning_effort: {
                supported: true,
                processor: "anthropic_thinking",
              },
            },
            constraints: [],
          },
          metadata: {},
        },
      ],
    });

    const offerings = await aiModelService.fetchOfferings();

    expect(offerings[0].override.params.temperature).toEqual({
      supported: false,
    });
    expect(offerings[0].override.params.reasoning_effort?.processor).toBe(
      "anthropic_thinking",
    );

    mockOrder.mockResolvedValue({
      error: null,
      data: [
        {
          id: "offering-4",
          pricing: [],
          capabilities_override: {},
          override: {
            params: { temperature: { processor: 42 } },
            constraints: [],
          },
          metadata: {},
        },
      ],
    });

    await expect(aiModelService.fetchOfferings()).rejects.toThrow(
      "ai.offering.offering-4.override.params.temperature.processor: expected a string",
    );
  });
});
