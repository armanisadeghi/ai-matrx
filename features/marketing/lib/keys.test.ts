import {
  marketingKeyProblem,
  nextPreviousSlugs,
  pathWithMarketingSegment,
} from "@/features/marketing/lib/keys";

describe("marketingKeyProblem", () => {
  it("accepts a normal key", () => {
    expect(marketingKeyProblem("acme-recycling")).toBeNull();
  });

  it("refuses a reserved segment by name", () => {
    expect(marketingKeyProblem("settings")).toContain("reserved");
  });

  it("refuses formats a URL segment cannot carry", () => {
    expect(marketingKeyProblem("Acme Co")).toContain("lowercase");
    expect(marketingKeyProblem("ab")).toContain("3 characters");
    expect(marketingKeyProblem("a".repeat(51))).toContain("50 characters");
    expect(marketingKeyProblem("   ")).toContain("Enter an address");
  });
});

describe("nextPreviousSlugs", () => {
  it("keeps the old key alive as an alias", () => {
    expect(nextPreviousSlugs([], "old-key", "new-key")).toEqual(["old-key"]);
  });

  it("never leaves the new key an alias of itself", () => {
    // Renaming back to a key you used before: it becomes current, so it must
    // leave the alias list or the current address would forward to itself.
    expect(nextPreviousSlugs(["new-key"], "old-key", "new-key")).toEqual([
      "old-key",
    ]);
  });

  it("accumulates across repeated renames without duplicates", () => {
    const first = nextPreviousSlugs([], "one", "two");
    const second = nextPreviousSlugs(first, "two", "three");
    expect(second).toEqual(["one", "two"]);
    expect(nextPreviousSlugs(second, "three", "four")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("tolerates a row that never had a key", () => {
    expect(nextPreviousSlugs(null, null, "first-key")).toEqual([]);
  });
});

describe("pathWithMarketingSegment", () => {
  it("swaps the brand segment and keeps the rest of the page", () => {
    expect(
      pathWithMarketingSegment("/marketing/old-brand/settings", "old-brand", "new-brand"),
    ).toBe("/marketing/new-brand/settings");
  });

  it("swaps a site segment without touching an identical brand segment", () => {
    expect(
      pathWithMarketingSegment(
        "/marketing/acme/websites/acme/settings",
        "acme",
        "acme-site",
        3,
      ),
    ).toBe("/marketing/acme/websites/acme-site/settings");
  });

  it("returns the path unchanged when the segment is not present", () => {
    expect(pathWithMarketingSegment("/marketing/brands", "acme", "acme-2")).toBe(
      "/marketing/brands",
    );
  });
});
