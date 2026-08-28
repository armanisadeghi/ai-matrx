import { starterPackMatchesBrandIndustry } from "./lib";

const ITAD_PACK = {
  industry: "IT Asset Disposition & Electronics Recycling",
  industry_name: "IT Asset Disposition & Electronics Recycling",
  industry_slug: "itad",
};

describe("starterPackMatchesBrandIndustry", () => {
  test("refuses to personalize a site whose brand has no industry", () => {
    expect(starterPackMatchesBrandIndustry(ITAD_PACK, null)).toBe(false);
    expect(starterPackMatchesBrandIndustry(ITAD_PACK, "")).toBe(false);
  });

  test("matches canonical names, slugs, and specific authored phrases", () => {
    expect(starterPackMatchesBrandIndustry(ITAD_PACK, "ITAD")).toBe(true);
    expect(
      starterPackMatchesBrandIndustry(ITAD_PACK, "Electronics recycling"),
    ).toBe(true);
    expect(
      starterPackMatchesBrandIndustry(
        ITAD_PACK,
        "IT Asset Disposition and Electronics Recycling",
      ),
    ).toBe(true);
  });

  test("does not match an unrelated brand in the same organization", () => {
    expect(
      starterPackMatchesBrandIndustry(ITAD_PACK, "Business coaching"),
    ).toBe(false);
    expect(
      starterPackMatchesBrandIndustry(ITAD_PACK, "Artificial Intelligence"),
    ).toBe(false);
  });
});
