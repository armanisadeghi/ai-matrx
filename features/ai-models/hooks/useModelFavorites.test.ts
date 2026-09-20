import {
  favoriteIdsEqual,
  reconcileModelFavoriteIds,
} from "./modelFavorites";

describe("reconcileModelFavoriteIds", () => {
  it("keeps canonical order and appends cache-only ids", () => {
    const { merged, missingFromCanonical } = reconcileModelFavoriteIds(
      ["cached-only", "shared"],
      ["canonical-only", "shared"],
    );
    expect(merged).toEqual(["canonical-only", "shared", "cached-only"]);
    expect(missingFromCanonical).toEqual(["cached-only"]);
  });

  it("drops blanks and duplicates", () => {
    const { merged, missingFromCanonical } = reconcileModelFavoriteIds(
      ["a", "a", ""],
      ["a", "b", ""],
    );
    expect(merged).toEqual(["a", "b"]);
    expect(missingFromCanonical).toEqual([]);
  });

  it("treats an empty canonical ledger as a backfill of the cache", () => {
    const { merged, missingFromCanonical } = reconcileModelFavoriteIds(
      ["one", "two"],
      [],
    );
    expect(merged).toEqual(["one", "two"]);
    expect(missingFromCanonical).toEqual(["one", "two"]);
  });
});

describe("favoriteIdsEqual", () => {
  it("is order-insensitive and length-strict", () => {
    expect(favoriteIdsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(favoriteIdsEqual(["a"], ["a", "b"])).toBe(false);
    expect(favoriteIdsEqual([], [])).toBe(true);
  });
});
