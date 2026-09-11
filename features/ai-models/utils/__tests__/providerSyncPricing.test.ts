/**
 * Pricing facts the Provider Sync table shows must be honest in all four
 * states: no offering, no price, priced-and-agreeing, priced-and-drifted.
 *
 * The drift case is the one with teeth: Groq publishes per-TOKEN dollars on
 * its /v1/models entries while `ai.offering.pricing` is per-MTok, so a missing
 * 1e6 would make every Groq row look wildly mispriced — or, worse, silently
 * agree by accident.
 */

import {
  ageInDays,
  buildRowPricing,
  comparePrices,
  extractProviderPublishedPrice,
  preferredOffering,
  readPricingVerifiedAt,
} from "../providerSyncPricing";
import type { AiOffering, ProviderModelEntry } from "../../types";

function offering(over: Partial<AiOffering> & { id: string }): AiOffering {
  return {
    model_id: "m1",
    provider_model_id: null,
    priority: 0,
    pricing: [],
    usage_basis: null,
    capabilities_override: {},
    override: { params: {}, constraints: [] },
    metadata: {},
    ...over,
  } as unknown as AiOffering;
}

const GROQ_ENTRY: ProviderModelEntry = {
  id: "openai/gpt-oss-120b",
  pricing: {
    image: "0",
    prompt: "0.00000015",
    request: "0",
    completion: "0.0000006",
    input_cache_read: "0.000000075",
  },
};

describe("extractProviderPublishedPrice", () => {
  it("converts Groq's per-token dollar strings to per-MTok numbers", () => {
    expect(extractProviderPublishedPrice(GROQ_ENTRY)).toEqual({
      input: 0.15,
      output: 0.6,
      cached: 0.075,
    });
  });

  it("returns null for a provider that publishes no pricing at all", () => {
    expect(extractProviderPublishedPrice({ id: "gpt-5" })).toBeNull();
    expect(extractProviderPublishedPrice(undefined)).toBeNull();
  });

  it("returns null when the pricing object carries nothing numeric", () => {
    expect(
      extractProviderPublishedPrice({ id: "x", pricing: { image: "0" } }),
    ).toBeNull();
  });
});

describe("comparePrices", () => {
  it("finds nothing when both sides agree", () => {
    expect(
      comparePrices(
        { input: 0.15, output: 0.6, cached: 0.075 },
        { input: 0.15, output: 0.6, cached: 0.075 },
      ),
    ).toEqual([]);
  });

  it("reports the drifted direction with both numbers", () => {
    const out = comparePrices(
      { input: 0.35, output: 0.75, cached: 0.35 },
      { input: 0.15, output: 0.6, cached: 0.075 },
    );
    expect(out).toEqual([
      { field: "input", ours: 0.35, theirs: 0.15 },
      { field: "output", ours: 0.75, theirs: 0.6 },
      { field: "cached", ours: 0.35, theirs: 0.075 },
    ]);
  });

  it("does not call float noise from the 1e6 conversion a mismatch", () => {
    expect(
      comparePrices({ input: 0.15 }, { input: 0.00000015 * 1_000_000 }) as unknown,
    ).toEqual([]);
  });

  it("treats a direction only one side prices as silence, not disagreement", () => {
    expect(
      comparePrices(
        { input: 0.15, output: null, cached: null },
        { input: 0.15, output: 0.6, cached: 0.075 },
      ),
    ).toEqual([]);
  });
});

describe("preferredOffering", () => {
  it("picks the lowest priority — the offering that actually bills", () => {
    const picked = preferredOffering([
      offering({ id: "b", priority: 90 }),
      offering({ id: "a", priority: 0 }),
    ]);
    expect(picked?.id).toBe("a");
  });
});

describe("readPricingVerifiedAt", () => {
  it("reports UNTRACKED while ai.offering has no pricing_verified_at column", () => {
    expect(readPricingVerifiedAt(offering({ id: "a" }))).toEqual({
      tracked: false,
      verified_at: null,
    });
  });

  it("reports the timestamp once the column exists", () => {
    const row = offering({ id: "a" }) as unknown as Record<string, unknown>;
    row.pricing_verified_at = "2026-09-01T00:00:00Z";
    expect(readPricingVerifiedAt(row as unknown as AiOffering)).toEqual({
      tracked: true,
      verified_at: "2026-09-01T00:00:00Z",
    });
  });

  it("distinguishes 'column exists, never verified' from 'no column'", () => {
    const row = offering({ id: "a" }) as unknown as Record<string, unknown>;
    row.pricing_verified_at = null;
    expect(readPricingVerifiedAt(row as unknown as AiOffering)).toEqual({
      tracked: true,
      verified_at: null,
    });
  });
});

describe("buildRowPricing", () => {
  it("says no_offering when the model has none — never a blank cell", () => {
    const p = buildRowPricing([], GROQ_ENTRY);
    expect(p.state).toBe("no_offering");
    // The provider's own number is still surfaced: we know what they charge.
    expect(p.theirs).toEqual({ input: 0.15, output: 0.6, cached: 0.075 });
  });

  it("says no_price when the offering exists but carries no pricing tier", () => {
    expect(buildRowPricing([offering({ id: "a" })], null).state).toBe(
      "no_price",
    );
  });

  it("says no_price when every price in tier 0 is null", () => {
    const o = offering({
      id: "a",
      pricing: [
        {
          max_tokens: null,
          input_price: null,
          output_price: null,
          cached_input_price: null,
        },
      ],
    });
    expect(buildRowPricing([o], null).state).toBe("no_price");
  });

  it("prices from tier 0 of the preferred offering and flags Groq drift", () => {
    const cheap = offering({
      id: "preferred",
      priority: 0,
      usage_basis: null,
      pricing: [
        {
          max_tokens: null,
          input_price: 0.35,
          output_price: 0.75,
          cached_input_price: 0.35,
        },
      ],
    });
    const backup = offering({
      id: "backup",
      priority: 90,
      pricing: [
        {
          max_tokens: null,
          input_price: 9,
          output_price: 9,
          cached_input_price: 9,
        },
      ],
    });
    const p = buildRowPricing([backup, cheap], GROQ_ENTRY);
    expect(p.state).toBe("priced");
    expect(p.ours).toEqual({ input: 0.35, output: 0.75, cached: 0.35 });
    expect(p.mismatches.map((m) => m.field)).toEqual([
      "input",
      "output",
      "cached",
    ]);
    expect(p.verification).toBe("untracked");
  });

  it("reports no mismatch for a provider that publishes no price", () => {
    const o = offering({
      id: "a",
      pricing: [
        {
          max_tokens: null,
          input_price: 1.25,
          output_price: 10,
          cached_input_price: 0.125,
        },
      ],
    });
    const p = buildRowPricing([o], { id: "gpt-5" });
    expect(p.theirs).toBeNull();
    expect(p.mismatches).toEqual([]);
  });
});

describe("ageInDays", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");
  it("counts whole days", () => {
    expect(ageInDays("2026-09-08T12:00:00Z", now)).toBe(3);
    expect(ageInDays("2026-09-11T11:00:00Z", now)).toBe(0);
  });
  it("returns null with nothing to age", () => {
    expect(ageInDays(null, now)).toBeNull();
    expect(ageInDays("not a date", now)).toBeNull();
  });
});
