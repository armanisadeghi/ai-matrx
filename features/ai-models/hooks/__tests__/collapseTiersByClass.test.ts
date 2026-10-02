/**
 * A model's CLASS is its serving endpoint. Classes are separate products the
 * person picks between (Qwen3.8 27B: Matrx Fast and Matrx Lightning, live
 * 2026-10-01); only equivalent offerings inside ONE class collapse to its
 * preferred offering.
 */
import { collapseTiersByClass, type CatalogTier } from "../useModelCatalog";

const tier = (
  offeringId: string,
  endpointId: string,
  servedVia: string,
  priority: number,
): CatalogTier => ({
  offeringId,
  endpointId,
  servedVia,
  priority,
  pointsInput: null,
  pointsOutput: null,
});

describe("collapseTiersByClass", () => {
  it("keeps every class of a model as its own choice", () => {
    const out = collapseTiersByClass([
      tier("fast", "ep-fast", "Matrx Fast", 100),
      tier("lightning", "ep-lightning", "Matrx Lightning", 110),
    ]);
    expect(out.map((t) => t.servedVia)).toEqual(["Matrx Fast", "Matrx Lightning"]);
  });

  it("collapses equivalent offerings within one class to the preferred one", () => {
    const out = collapseTiersByClass([
      tier("moonshot-b", "ep-moonshot", "Moonshot AI", 120),
      tier("standard", "ep-standard", "Matrx Standard", 110),
      tier("moonshot-a", "ep-moonshot", "Moonshot AI", 100),
    ]);
    expect(out.map((t) => t.offeringId)).toEqual(["moonshot-a", "standard"]);
  });
});
