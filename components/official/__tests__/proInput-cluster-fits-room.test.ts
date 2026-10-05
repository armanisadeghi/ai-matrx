import {
  PRO_INPUT_CLUSTER_MAX_SHARE,
  PRO_INPUT_FULL_CLUSTER_PX,
  proInputClusterTier,
} from "../proInputReservedPadding";

describe("ProInput's hover cluster fits the room the field has", () => {
  it("a roomy field keeps the mic capsule and the menu", () => {
    expect(proInputClusterTier(448)).toBe("full");
  });
  it("an unmeasured field keeps the full cluster", () => {
    expect(proInputClusterTier(0)).toBe("full");
  });
  it("a board tile's 206px field folds voice into the menu", () => {
    expect(proInputClusterTier(206)).toBe("menu");
  });
  it("a tiny field gives none of its room away", () => {
    expect(proInputClusterTier(80)).toBe("none");
  });
  it("submit and clear take room first", () => {
    expect(proInputClusterTier(300)).toBe("full");
    expect(proInputClusterTier(300, 90)).toBe("menu");
  });
  it("the cluster never takes more than its share of the free room", () => {
    for (let w = 1; w <= 1200; w += 7) {
      const tier = proInputClusterTier(w);
      if (tier === "full") {
        expect(PRO_INPUT_FULL_CLUSTER_PX).toBeLessThanOrEqual(
          w * PRO_INPUT_CLUSTER_MAX_SHARE,
        );
      }
    }
  });
});
