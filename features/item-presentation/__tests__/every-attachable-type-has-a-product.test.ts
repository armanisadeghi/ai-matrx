// 🚨 A SYNCED RECORD TYPE THE CONNECTORS DECLARE IS NEVER A TYPE THE HEALTH
// STRIP FORGETS (Bugbot round 18 on frontend PR 228, `PRODUCT_BY_ITEM_TYPE`).
//
// F-38 made a picked Slides deck a first-class resource type
// (`google_presentation`, 4f0dfc3b) and declared it under the connectors'
// `workspace_files` product — but the health producer's type → product map was a
// hand-typed record, so a deck's strip resolved to NO product and stayed absent,
// silently, while the connectors screen knew exactly which grant it depended on.
//
// The class rule: the map is DERIVED from the connectors' own product config
// (`attachableResourceTypes` on every `ConnectorProduct`), plus the handful of
// item-presentation aliases whose tokens differ from the resource-type names.
// This census walks the config, so the next attachable type cannot be forgotten
// by the strip: it is either mapped or this test is red.
//
// Red at the hand-typed map (google_presentation → null), green with the derived one.

import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { productKeyFor } from "../sourceHealth";

describe("every attachable resource type the connectors declare resolves to its product", () => {
  const declared = GOOGLE_CONNECTOR_PROVIDER.products.flatMap((product) =>
    product.attachableResourceTypes.map((type) => ({ type, product: product.key })),
  );

  it("has something to census (a walk over zero types proves nothing)", () => {
    expect(declared.length).toBeGreaterThanOrEqual(6);
    expect(declared.map((d) => d.type)).toContain("google_presentation");
  });

  for (const { type, product } of declared) {
    it(`${type} → ${product}, from a row that does not name its product`, () => {
      expect(productKeyFor(type, {})).toBe(product);
    });
  }

  it("still lets the ROW win when it names its own product", () => {
    expect(productKeyFor("google_presentation", { provider_product: "gmail" })).toBe("gmail");
  });
});
