import { resolveIntakeAssetRouteTarget } from "./asset-route";

describe("resolveIntakeAssetRouteTarget", () => {
  it("routes the reserved v2 segment to the capture v2 surface", () => {
    expect(resolveIntakeAssetRouteTarget("v2")).toEqual({
      kind: "redirect",
      href: "/commerce/intake/v2",
    });
  });

  it("accepts UUID asset identities", () => {
    const assetId = "0ec4739b-47f6-4962-9d07-a3ceb9d6da33";
    expect(resolveIntakeAssetRouteTarget(assetId)).toEqual({
      kind: "asset",
      assetId,
    });
  });

  it("rejects non-UUID dynamic segments before persistence reads", () => {
    expect(resolveIntakeAssetRouteTarget("not-an-asset")).toEqual({
      kind: "not-found",
    });
  });
});
