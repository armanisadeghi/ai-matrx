import {
  addFamilyPromotion,
  normalizeResourceFamilyPolicy,
  setFamilyRepresentationEnabled,
  updateFamilyPromotion,
} from "./resource-family-policy";

describe("resource family policy", () => {
  it("supports three unique bounded promotions", () => {
    let policy = addFamilyPromotion(undefined, "clean");
    policy = addFamilyPromotion(policy, "raw");
    policy = addFamilyPromotion(policy, "file_metadata");
    policy = addFamilyPromotion(policy, "knowledge_assets");

    expect(policy.promote).toHaveLength(3);
    expect(policy.promote?.map((item) => item.representation)).toEqual([
      "clean",
      "raw",
      "file_metadata",
    ]);
  });

  it("keeps promotions and exclusions internally consistent", () => {
    let policy = normalizeResourceFamilyPolicy({
      promote: [{ representation: "CLEAN", max_chars: 50_000 }],
      exclude: ["clean", "RAG", "rag"],
    });
    policy = updateFamilyPromotion(policy, 0, { representation: "raw" });
    policy = setFamilyRepresentationEnabled(policy, "raw", false);

    expect(policy.promote).toBeUndefined();
    expect(policy.exclude).toEqual(["rag", "raw"]);
  });
});
