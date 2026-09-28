import {
  applyProposal,
  basisChip,
  beatsOutsideWordRange,
  briefMarkdown,
  countWarning,
  defaultSchedule,
  fnv32a,
  newDraft,
  parseBriefMarkdown,
  scheduleMinute,
  scheduleOptions,
  toDeclareBody,
  SAVED_BASIS,
  USER_BASIS,
} from "./model";

const base = () =>
  newDraft({
    brandName: "All Green Recycling",
    aliases: ["all green electronics recycling"],
    siteId: "site-1",
    timezone: "America/Los_Angeles",
  });

describe("monitor setup model", () => {
  it("hashes with 32-bit FNV-1a and never schedules on the hour", () => {
    expect(fnv32a("")).toBe(0x811c9dc5);
    expect(fnv32a("a")).toBe(0xe40c292c);
    for (const id of [
      "a",
      "b",
      "8e6582c8-6f78-412a-9010-f9d19d71bb16",
      "x".repeat(40),
    ]) {
      const minute = scheduleMinute(id);
      expect(minute).toBeGreaterThanOrEqual(1);
      expect(minute).toBeLessThanOrEqual(59);
    }
  });

  it("warns outside the knob range and never blocks", () => {
    expect(countWarning("beats", 7, [6, 8])).toBeNull();
    expect(countWarning("beats", 2, [6, 8])).toContain("You can save anyway");
    expect(countWarning("beats", 12, [6, 8])).toContain("at most 8");
    expect(
      beatsOutsideWordRange(
        [
          {
            text: "AI practice management for accounting firms",
            basis: USER_BASIS,
          },
        ],
        [2, 3],
      ),
    ).toHaveLength(1);
  });

  it("reads schedule choices and defaults from the knobs", () => {
    const options = scheduleOptions([
      {
        id: "twice_daily",
        label: "7am and 2pm",
        runs_per_month: 60,
        recommended: true,
      },
      { id: "broken" },
    ]);
    expect(options).toEqual([
      {
        id: "twice_daily",
        label: "7am and 2pm",
        runsPerMonth: 60,
        recommended: true,
      },
    ]);
    const defaults = { opportunity: "twice_daily", coverage_only: "daily" };
    expect(defaultSchedule(true, defaults)).toBe("twice_daily");
    expect(defaultSchedule(false, defaults)).toBe("daily");
    expect(defaultSchedule(true, undefined)).toBe("");
  });

  it("pre-fills the brand's names and both lenses for a brand with a site", () => {
    const draft = base();
    expect(draft.coverage).toBe(true);
    expect(draft.opportunity).toBe(true);
    expect(draft.keywords.map((k) => k.keyword)).toEqual([
      "All Green Recycling",
      "all green electronics recycling",
    ]);
    expect(
      newDraft({ brandName: "X", aliases: [], siteId: null, timezone: "UTC" })
        .coverage,
    ).toBe(false);
  });

  it("folds a proposal in without overwriting what the person typed", () => {
    const draft = {
      ...base(),
      topics: [{ text: "e-waste recycling", basis: USER_BASIS }],
    };
    draft.keywords[0].means = "mine";
    const next = applyProposal(draft, {
      topics: [
        {
          text: "E-waste recycling",
          basis: { kind: "site_page", ref: "page:1" },
        },
        {
          text: "data destruction",
          basis: { kind: "site_page", ref: "page:2" },
        },
      ],
      coverage_keywords: [
        {
          keyword: "All Green Recycling",
          means: "proposed",
          side: "brand",
          basis: { kind: "brand_record", ref: "brand:company_name" },
        },
        {
          keyword: "all green electronics recycling",
          means: "the ITAD company",
          side: "brand",
          basis: { kind: "brand_record", ref: "brand:aliases" },
        },
      ],
      feed_picks: [{ feed_id: "ftc-press", why: "privacy enforcement" }],
    });
    expect(next.topics.map((t) => t.text)).toEqual([
      "e-waste recycling",
      "data destruction",
    ]);
    expect(next.topics[1].basis.kind).toBe("site_page");
    expect(next.keywords[0].means).toBe("mine");
    expect(next.keywords[1].means).toBe("the ITAD company");
    expect(next.feeds).toEqual([
      { feedId: "ftc-press", why: "privacy enforcement", proposed: true },
    ]);
  });

  it("labels each source the way the brief names it", () => {
    expect(basisChip(USER_BASIS)).toBe("you said it");
    expect(basisChip(SAVED_BASIS)).toBe("saved");
    expect(basisChip({ kind: "site_page", ref: "page:1" })).toBe("your site");
    expect(basisChip({ kind: "named_entity", ref: "fact:1" })).toBe(
      "named company",
    );
    expect(basisChip({ kind: "recent_coverage", ref: "news:1" })).toBe(
      "recent coverage",
    );
  });

  it("writes only what the person typed into the brief", () => {
    expect(
      briefMarkdown({ audience: "", pitch: "", never: "", surface: "" }),
    ).toBeNull();
    const md = briefMarkdown({
      audience: "IT directors",
      pitch: "",
      never: "politics",
      surface: "",
    });
    expect(md).toContain("## Audience\n\nIT directors");
    expect(parseBriefMarkdown(md ?? "")).toEqual({
      audience: "IT directors",
      pitch: "",
      never: "politics",
      surface: "",
    });
  });

  it("saves means lines and competitors through the one declare body", () => {
    const draft = {
      ...base(),
      competitors: [
        {
          name: "Iron Mountain",
          means: "the records company",
          excludeHints: [],
          basis: USER_BASIS,
        },
      ],
      xTrends: true,
    };
    draft.keywords[0].means = "the California e-waste recycler";
    const body = toDeclareBody(draft, {
      brandId: "b",
      brandKey: "all-green",
      declaredRef: {},
      xTrendsWoeids: [1],
    });
    expect(body.lenses).toEqual(["coverage", "opportunity"]);
    expect(body.term_meanings?.["All Green Recycling"]).toEqual({
      means: "the California e-waste recycler",
      exclude_hints: [],
    });
    expect(body.competitors?.[0]).toEqual({
      key: "iron-mountain",
      terms: ["Iron Mountain"],
      means: "the records company",
      exclude_hints: [],
    });
    expect(body.x_trends_woeids).toEqual([1]);
    expect(body.brand_id).toBeNull();
  });
});
