import {
  describePackMeaningValue,
  starterPackMatchesBrandIndustry,
  starterPackStatusRowIds,
} from "./lib";

describe("describePackMeaningValue", () => {
  test("formats the canonical Business pack and site status payloads", () => {
    expect(
      describePackMeaningValue({
        worth_effect: "add",
        worth_amount: 120,
        matchers: [],
      }),
    ).toBe("+120 points · 0 phrases");
    expect(
      describePackMeaningValue({
        worth_effect: "scale",
        worth_amount: 2.2,
        matchers: 0,
      }),
    ).toBe("×2.2 — worth 2.2 times more · 0 phrases");
  });

  test("never emits NaN for an incomplete status payload", () => {
    expect(describePackMeaningValue({ worth_effect: "scale" })).toBe(
      "worth not available · 0 phrases",
    );
  });
});

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

describe("starterPackStatusRowIds", () => {
  test("indexes the canonical site row and every Rulebook alias", () => {
    expect(
      starterPackStatusRowIds({
        kind: "meaning",
        ref: "meaning-1",
        label: "Business",
        site_row_id: "worth-1",
        rule_row_ids: ["rule-1", "rule-2", "rule-1"],
        pack: {},
        site: {},
        state: "changed",
        sort: 1,
      }),
    ).toEqual(["worth-1", "rule-1", "rule-2"]);
  });
});
