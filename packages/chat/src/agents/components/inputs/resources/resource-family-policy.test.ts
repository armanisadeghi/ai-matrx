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

  // `exclude` deliberately carries the SAME representation twice in two
  // casings: normalization is case-insensitive, so "Knowledge"/"knowledge"
  // must collapse to one entry. (The pair was "RAG"/"rag" until the
  // knowledge/RAG vocabulary consolidation, f4668b6d01, renamed only one half
  // of it and silently destroyed the duplicate this case exists to prove.)
  it("keeps promotions and exclusions internally consistent", () => {
    let policy = normalizeResourceFamilyPolicy({
      promote: [{ representation: "CLEAN", max_chars: 50_000 }],
      exclude: ["clean", "Knowledge", "knowledge"],
    });
    // "clean" is promoted, so it is dropped from `exclude`.
    expect(policy.exclude).toEqual(["knowledge"]);

    policy = updateFamilyPromotion(policy, 0, { representation: "raw" });
    policy = setFamilyRepresentationEnabled(policy, "raw", false);

    expect(policy.promote).toBeUndefined();
    expect(policy.exclude).toEqual(["knowledge", "raw"]);
  });
});
